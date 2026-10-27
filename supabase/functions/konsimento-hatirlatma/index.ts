import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { khMail, KH_TEST_ALICISI, KH_VARSAYILAN_ALICI, KH_VARSAYILAN_CC, type KhVeri } from "../_shared/konsimento-hatirlatma.ts";

// ============================================================================
// KONSIMENTO TALIMATI HATIRLATMASI (konsimento-hatirlatma) - 27.10.2026
// ============================================================================
// Tum konteynerler girilince DB tetikleyicisi kuyruga satir yazar
// (migration 20261027140000); bu fonksiyon maili Resend ile gonderir.
// Govde: { islem, ... }
//  - "isle"  : kuyruktaki isleri gonderir (pg_cron 'konsimento-hatirlatma', anon anahtar;
//              sadece kuyruk isler, veri dondurmez -> anon cagrisi zararsiz)
//  - "elle"  : { dosya_id } kullanicinin OTURUMUYLA (kh_elle_iste yetkiyi DB'de kontrol
//              eder) kuyruga alir ve HEMEN gonderir; sonucu doner.
// Alicilar (secret, virgulle): KONSIMENTO_HATIRLATMA_ALICI (varsayilan operation@),
//   KONSIMENTO_HATIRLATMA_CC (varsayilan bbt@, execution@, export@).
// MOD: KONSIMENTO_HATIRLATMA_CANLI = "evet" degilse mail SADECE test adresine
//   (KONSIMENTO_HATIRLATMA_TEST_ALICISI, varsayilan mesensei282@) "[TEST]" konuyla gider.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda İhracat <bildirim@ihracatasistanim.com>";

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
function adresler(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a));
  return liste.length ? [...new Set(liste)] : varsayilan;
}
const CANLI = (Deno.env.get("KONSIMENTO_HATIRLATMA_CANLI") || "").trim().toLowerCase() === "evet";
const ALICI = adresler("KONSIMENTO_HATIRLATMA_ALICI", [KH_VARSAYILAN_ALICI]);
const CC = adresler("KONSIMENTO_HATIRLATMA_CC", KH_VARSAYILAN_CC).filter((a) => !ALICI.includes(a));
const TEST_ALICISI = adresler("KONSIMENTO_HATIRLATMA_TEST_ALICISI", [KH_TEST_ALICISI]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

class KullaniciHatasi extends Error {
  constructor(mesaj: string, public durum = 400) { super(mesaj); }
}

async function rpc<T>(ad: string, govde: Record<string, unknown>, yetki: "servis" | string = "servis"): Promise<T> {
  const basliklar = yetki === "servis"
    ? { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    : { apikey: ANON_KEY, Authorization: yetki };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify(govde),
  });
  const metin = await res.text();
  if (!res.ok) {
    let mesaj = metin; let kod = "";
    try { const j = JSON.parse(metin); mesaj = j.message || metin; kod = j.code || ""; } catch { /* duz metin */ }
    if (kod === "42501" || res.status === 401 || res.status === 403) {
      throw new KullaniciHatasi(kod === "42501" && !/^permission denied/i.test(mesaj) ? mesaj : "Bu işlem için yetkiniz yok. Uygulamaya giriş yapıp tekrar deneyin.", 403);
    }
    if (kod === "P0002") throw new KullaniciHatasi(mesaj, 404);
    if (["23514", "22023", "22P02"].includes(kod) || res.status === 400) throw new KullaniciHatasi(kod === "22P02" ? "Geçersiz istek." : mesaj, 400);
    throw new Error(`${ad} HTTP ${res.status}: ${mesaj.slice(0, 200)}`);
  }
  return (metin ? JSON.parse(metin) : null) as T;
}

type Is = { id: string; tetik: "otomatik" | "elle"; isteyen_email: string | null; veri: KhVeri };
type Sonuc = { id: string; dosya_no: string | null; mail: "gonderildi" | "hata"; test: boolean; alicilar: string[]; cc: string[]; hata?: string };

async function gonder(is: Is): Promise<Sonuc> {
  const to = CANLI ? ALICI : TEST_ALICISI;
  const cc = CANLI ? CC : [];
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
    const { konu, html } = khMail(is.veri, { test: !CANLI, gercekAlici: ALICI.join(", "), gercekCc: CC, tetik: is.tetik, isteyen: is.isteyen_email });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: GONDEREN, to, ...(cc.length ? { cc } : {}), subject: konu, html }),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await rpc("kh_sonuc", { p_id: is.id, p_basarili: true, p_test: !CANLI, p_alicilar: to.join(", "), p_cc: cc.join(", ") || null })
      .catch((e) => console.error("kh_sonuc:", e));
    return { id: is.id, dosya_no: is.veri.dosya_no, mail: "gonderildi", test: !CANLI, alicilar: to, cc };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("konsimento-hatirlatma maili:", is.veri?.dosya_no, mesaj);
    await rpc("kh_sonuc", { p_id: is.id, p_basarili: false, p_hata: mesaj }).catch(() => {});
    return { id: is.id, dosya_no: is.veri?.dosya_no ?? null, mail: "hata", test: !CANLI, alicilar: to, cc, hata: mesaj };
  }
}

const uuidGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Sadece POST." }, 405);
  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { /* bos govde */ }
  try {
    if (govde.islem === "isle") {
      const isler = await rpc<Is[]>("kh_kuyruk_al", { p_limit: 10 });
      let gonderilen = 0; let hatali = 0;
      for (const is of isler || []) { const s = await gonder(is); if (s.mail === "gonderildi") gonderilen++; else hatali++; }
      // Anon cagrilabilir: sadece sayilar doner (dosya / alici bilgisi YOK)
      return json({ ok: true, gonderilen, hatali });
    }
    if (govde.islem === "elle") {
      const yetki = req.headers.get("Authorization") || "";
      if (!yetki.startsWith("Bearer ") || yetki === `Bearer ${ANON_KEY}`) return json({ hata: "Oturum gerekli." }, 401);
      if (!uuidGecerli(govde.dosya_id)) return json({ hata: "Geçersiz dosya." }, 400);
      const id = await rpc<string>("kh_elle_iste", { p_dosya_id: govde.dosya_id }, yetki);
      const isler = await rpc<Is[]>("kh_kuyruk_al", { p_limit: 1, p_id: id });
      if (!isler?.length) return json({ hata: "Hatırlatma kuyruğa alındı; birkaç dakika içinde gönderilecek." }, 202);
      const s = await gonder(isler[0]);
      return json({ basarili: s.mail === "gonderildi", mail: s.mail, test: s.test, alicilar: s.alicilar, cc: s.cc });
    }
    return json({ hata: "Bilinmeyen işlem." }, 400);
  } catch (e) {
    if (e instanceof KullaniciHatasi) return json({ hata: e.message }, e.durum);
    console.error("konsimento-hatirlatma hatasi:", e);
    return json({ hata: "Sunucu hatası. Lütfen tekrar deneyin." }, 500);
  }
});
