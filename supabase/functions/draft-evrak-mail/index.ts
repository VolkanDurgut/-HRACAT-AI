import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { draftEkleriDogrula, draftMail, type DraftMailVeri } from "../_shared/draft-evrak-mail.ts";
import { etiketliKonu, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";
import { KH_SITE } from "../_shared/konsimento-hatirlatma-sabitler.ts";

// ============================================================================
// DRAFT EVRAK SETI MAILI (draft-evrak-mail) - 24.11.2026
// ============================================================================
// Ihracat Evraklari kartindaki "Draft Seti Mail Gönder": tarayici belgeleri VEKTOR PDF olarak uretir
// (lib/html-vektor-pdf.ts), Draft BL yuklenen dosyanin kendisidir; bu fonksiyon dogrular ve Resend ile yollar.
// Govde: { dosya_id, ekler: [{ ad: "DRAFT- 1- INVOICE- <booking>- <proforma>.pdf", icerik: <base64> }] }
// Yetki: kullanicinin OTURUMU; dosya kullanicinin RLS'iyle okunur (baska sirketin dosyasi okunamaz -> 404).
// MOD (24.11.2026): YALNIZ TEST. Mail DRAFT_EVRAK_TEST_ALICISI (secret, virgulle) adresine gider; tanimli degilse
//   KONSIMENTO_HATIRLATMA_TEST_ALICISI. Ikisi de yoksa mail GITMEZ. Dosyada hicbir alan degistirilmez
//   (draft_mail_gonderildi / 48 saat baslamaz). Canli alici (musteri + CC) kullanici onayiyla sonra eklenecek.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const adresler = (ad: string) => [...new Set((Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a)))];
const TEST_ALICISI = (() => { const l = adresler("DRAFT_EVRAK_TEST_ALICISI"); return l.length ? l : adresler("KONSIMENTO_HATIRLATMA_TEST_ALICISI"); })();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });
const uuidGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

async function oku<T>(yol: string, yetki: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: { apikey: ANON_KEY, Authorization: yetki } });
  if (res.status === 401 || res.status === 403) { await res.body?.cancel(); throw Object.assign(new Error("Oturum geçersiz. Lütfen yeniden giriş yapın."), { durum: 401 }); }
  if (!res.ok) throw new Error(`${yol.split("?")[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type DosyaSatiri = { id: string; dosya_no: string | null; proforma_no: string | null; alici_firma: string | null; alici_adresi: string | null; varis_limani: string | null; ham_veri: Record<string, unknown> | null };
type RezSatiri = { booking_no: string | null; gemi_adi: string | null; sefer_no: string | null; yuklenme_limani: string | null; gemi_kalkis_tarihi: string | null };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Sadece POST." }, 405);
  const yetki = req.headers.get("Authorization") || "";
  if (!yetki.startsWith("Bearer ") || yetki === `Bearer ${ANON_KEY}`) return json({ hata: "Oturum gerekli." }, 401);

  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { return json({ hata: "Geçersiz istek." }, 400); }
  if (!uuidGecerli(govde.dosya_id)) return json({ hata: "Geçersiz dosya." }, 400);
  const { hata, ekler } = draftEkleriDogrula(govde.ekler);
  if (hata) return json({ hata }, 400);

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
    if (!TEST_ALICISI.length) return json({ hata: "Test alıcısı tanımlı değil (DRAFT_EVRAK_TEST_ALICISI). Mail gönderilmedi." }, 503);

    const id = govde.dosya_id;
    const [dosyalar, rezler, konts, kullanici] = await Promise.all([
      oku<DosyaSatiri[]>(`ihracat_dosyalari?select=id,dosya_no,proforma_no,alici_firma,alici_adresi,varis_limani,ham_veri&id=eq.${id}`, yetki),
      oku<RezSatiri[]>(`rezervasyonlar?select=booking_no,gemi_adi,sefer_no,yuklenme_limani,gemi_kalkis_tarihi&dosya_id=eq.${id}&order=olusturma_tarihi.asc`, yetki),
      oku<{ id: string }[]>(`konteynerler?select=id&dosya_id=eq.${id}`, yetki),
      fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: yetki } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const d = dosyalar[0];
    if (!d) return json({ hata: "Dosya bulunamadı ya da erişim yetkiniz yok." }, 404);
    if (!kullanici?.id) return json({ hata: "Oturum geçersiz. Lütfen yeniden giriş yapın." }, 401);
    const ham = d.ham_veri || {};
    const r = rezler[0];
    const metin = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
    const veri: DraftMailVeri = {
      dosya_id: d.id, dosya_no: d.dosya_no, proforma_no: d.proforma_no, alici_firma: d.alici_firma, alici_adresi: d.alici_adresi,
      alici_email: metin(ham.alici_email), alici_tel: metin(ham.alici_tel),
      booking_no: r?.booking_no ?? null, gemi_adi: r?.gemi_adi ?? null, sefer_no: r?.sefer_no ?? null,
      yuklenme_limani: r?.yuklenme_limani ?? null, varis_limani: d.varis_limani, gemi_kalkis_tarihi: r?.gemi_kalkis_tarihi ?? null,
      konteyner_adedi: konts.length,
    };
    const { konu, html } = draftMail(veri, ekler.map((e) => e.ad), { site: KH_SITE, test: true, gonderen: typeof kullanici.email === "string" ? kullanici.email : null });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: UNEX_AI_GONDEREN, to: TEST_ALICISI, subject: etiketliKonu("Önemli", konu), html,
        attachments: ekler.map((e) => ({ filename: e.ad, content: e.icerik })),
      }),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.log("draft-evrak-mail gonderildi:", d.dosya_no, ekler.length, "ek, TEST");
    return json({ basarili: true, test: true, alicilar: TEST_ALICISI, ek_sayisi: ekler.length });
  } catch (e) {
    const durum = (e as { durum?: number })?.durum;
    if (durum === 401) return json({ hata: (e as Error).message }, 401);
    console.error("draft-evrak-mail hatasi:", e);
    return json({ hata: "Mail gönderilemedi. Lütfen tekrar deneyin." }, 500);
  }
});
