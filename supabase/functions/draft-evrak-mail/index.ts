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
//   (draft_mail_gonderildi / 48 saat baslamaz).
// 25.11.2026 CANLI (kullanici: "Alici mail sadece execution@ olacak"): alici + CC Ayarlar > Rapor Alicilari 'draft_evrak'
//   satirindan (service_role, yalniz okuma). Satir canli ve en az bir alici varsa "[TEST]" olmadan oraya; degilse eski test
//   yolu. Mail ic ekibe gider (musteriye DEGIL); dosyada yine hicbir alan degismez (48 saat "Gonderildi Isaretle" ile baslar).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const adresler = (ad: string) => [...new Set((Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a)))];
const TEST_ALICISI = (() => { const l = adresler("DRAFT_EVRAK_TEST_ALICISI"); return l.length ? l : adresler("KONSIMENTO_HATIRLATMA_TEST_ALICISI"); })();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });
/** Ayarlar > Rapor Alicilari 'draft_evrak' (canli + alici varsa); okunamazsa / yoksa null -> test yolu */
async function canliAlicilar(companyId: string): Promise<{ to: string[]; cc: string[] } | null> {
  if (!SERVICE_ROLE_KEY || !uuidGecerli(companyId)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rapor_alicilari?select=alicilar,cc,canli&company_id=eq.${companyId}&rapor=eq.draft_evrak`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) { await res.body?.cancel(); return null; }
    const satir = ((await res.json()) as { alicilar: unknown; cc: unknown; canli: boolean }[])[0];
    const temiz = (l: unknown) => [...new Set((Array.isArray(l) ? l : []).map((a) => String(a).trim().toLowerCase()).filter((a) => EPOSTA.test(a)))].slice(0, 10);
    if (!satir || satir.canli !== true) return null;
    const to = temiz(satir.alicilar);
    if (!to.length) return null;
    return { to, cc: temiz(satir.cc).filter((a) => !to.includes(a)) };
  } catch {
    return null;
  }
}

const uuidGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

async function oku<T>(yol: string, yetki: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: { apikey: ANON_KEY, Authorization: yetki } });
  if (res.status === 401 || res.status === 403) { await res.body?.cancel(); throw Object.assign(new Error("Oturum geçersiz. Lütfen yeniden giriş yapın."), { durum: 401 }); }
  if (!res.ok) throw new Error(`${yol.split("?")[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type DosyaSatiri = { id: string; company_id: string; dosya_no: string | null; proforma_no: string | null; alici_firma: string | null; alici_adresi: string | null; varis_limani: string | null; ham_veri: Record<string, unknown> | null };
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
    const id = govde.dosya_id;
    const [dosyalar, rezler, konts, kullanici] = await Promise.all([
      oku<DosyaSatiri[]>(`ihracat_dosyalari?select=id,company_id,dosya_no,proforma_no,alici_firma,alici_adresi,varis_limani,ham_veri&id=eq.${id}`, yetki),
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
    // 25.11.2026: canli alici Ayarlar'dan; yoksa test adresi (ikisi de yoksa mail GITMEZ)
    const canli = await canliAlicilar(d.company_id);
    const test = !canli;
    if (test && !TEST_ALICISI.length) return json({ hata: "Alıcı tanımlı değil (Ayarlar › Rapor Alıcıları › Draft Evrak Seti). Mail gönderilmedi." }, 503);
    const to = canli ? canli.to : TEST_ALICISI;
    const cc = canli ? canli.cc : [];
    const simdi = Date.now();
    const tr = new Date(simdi + 3 * 3600_000).toISOString();
    const zaman = `${tr.slice(8, 10)}.${tr.slice(5, 7)}.${tr.slice(0, 4)} ${tr.slice(11, 16)}`;
    const { konu, html } = draftMail(veri, ekler.map((e) => e.ad), {
      site: KH_SITE, test, gonderen: typeof kullanici.email === "string" ? kullanici.email : null,
      benzersiz: `${simdi.toString(36)}-${crypto.randomUUID().slice(0, 8)}`, zaman,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: UNEX_AI_GONDEREN, to, ...(cc.length ? { cc } : {}), subject: etiketliKonu("Önemli", konu), html,
        attachments: ekler.map((e) => ({ filename: e.ad, content: e.icerik })),
      }),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.log("draft-evrak-mail gonderildi:", d.dosya_no, ekler.length, "ek,", test ? "TEST" : "CANLI");
    return json({ basarili: true, test, alicilar: [...to, ...cc], ek_sayisi: ekler.length });
  } catch (e) {
    const durum = (e as { durum?: number })?.durum;
    if (durum === 401) return json({ hata: (e as Error).message }, 401);
    console.error("draft-evrak-mail hatasi:", e);
    return json({ hata: "Mail gönderilemedi. Lütfen tekrar deneyin." }, 500);
  }
});
