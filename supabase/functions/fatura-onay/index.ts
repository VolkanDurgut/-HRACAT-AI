import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { dagitimHtml, dagitimKonusu, onayMailiHtml, revizeMailiHtml, type OnayDosyasi, type OnayKonteyneri, type OnayOzeti, type OnayRezervasyonu } from "../_shared/fatura-onay.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";

// ============================================================================
// FATURA TALIMATI ONAYI (fatura-onay) - 11.11.2026
// ============================================================================
// Kullanici: "Butun konteynerler yuklendiginde fatura talimati onaya gonderilmeli (operation, execution, export,
// export2, bbt). Onay veya revize butonlari olmali. Onaylanirsa onaylanmis fatura talimati dagitim listesine gitmeli."
// ALICILAR: Ayarlar > Rapor Alicilari: 'fatura_onay' (onaylayanlar) ve 'fatura_dagitim'. Liste canli DEGILSE ilgili
//   mail YALNIZ test adresine (FATURA_ONAY_TEST_ALICISI (secret; 13.11.2026 kod varsayilani kaldirildi: tanimli degilse test maili GITMEZ)) "[TEST]" konuyla gider.
// CAGRILAR:
//  - Anon / pg_cron 'fatura-onay-tara' ({}): fatura_onay_adaylari() -> ayni modda (test / canli) hic onay kaydi
//    olmayan dosyalar icin kayit + onay maili. Calisma basina en fazla 5 dosya. Yanitta veri yok.
//  - Kullanici (JWT, ayni sirket):
//      {gonder: dosya_id}          -> elle onaya gonder (konteynerler tam olmali; bekleyen onay varsa hata)
//      {karar: "onay", id, pdf}    -> yalniz onaylayabilecekler; PDF (tarayicida, dosya sayfasiyla AYNI uretici)
//                                    ekli dagitim maili; canli ise dosyada fatura_talimati_gonderildi = true
//      {karar: "revize", id, not}  -> yalniz onaylayabilecekler; not onay grubuna gider
// Yazma YALNIZ bu edge (service_role); tablo sirket kullanicilarina salt okunur.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_ALICISI = (() => {
  const l = (Deno.env.get("FATURA_ONAY_TEST_ALICISI") || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a));
  return l.slice(0, 3);
})();
const TARAMA_SINIRI = 5;
const PDF_AZAMI = 6 * 1024 * 1024;

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
}
async function yaz(yol: string, method: "POST" | "PATCH", govde: unknown, prefer = "return=representation"): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { method, headers: { ...basliklar, "Content-Type": "application/json", Prefer: prefer }, body: JSON.stringify(govde) });
}

function jwtRolu(token: string | null): string | null {
  const parca = token?.split(".")[1];
  if (!parca) return null;
  try {
    const b64 = parca.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parca.length / 4) * 4, "=");
    const r = (JSON.parse(atob(b64)) as { role?: unknown }).role;
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}
type Kullanici = { id: string; eposta: string; companyId: string };
async function kullanici(req: Request): Promise<Kullanici | null> {
  const baslik = req.headers.get("Authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null;
  if (jwtRolu(token) !== "authenticated") return null;
  const kRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!kRes.ok) { await kRes.body?.cancel(); return null; }
  const k = (await kRes.json()) as { id?: string; email?: string };
  if (!k.id || !UUID_RE.test(k.id) || !k.email) return null;
  const roller = await oku<{ company_id: string | null }>(`kullanici_rolleri?select=company_id&user_id=eq.${k.id}`);
  const companyId = roller.find((r) => !!r.company_id)?.company_id;
  return companyId ? { id: k.id, eposta: k.email.toLowerCase(), companyId } : null;
}

async function sirketAdi(companyId: string): Promise<string> {
  const s = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${companyId}`);
  return (s[0]?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
}

type DosyaSatiri = OnayDosyasi & { company_id: string; durum: string | null; fatura_talimati_gonderildi: boolean | null };
async function dosyaOzeti(dosyaId: string): Promise<(OnayOzeti & { dosya: DosyaSatiri }) | null> {
  const [d, r, k] = await Promise.all([
    oku<DosyaSatiri>(`ihracat_dosyalari?select=id,company_id,dosya_no,alici_firma,varis_limani,para_birimi,urun_detaylari,durum,fatura_talimati_gonderildi&id=eq.${dosyaId}`),
    oku<OnayRezervasyonu>(`rezervasyonlar?select=konteyner_adedi,booking_no,gemi_adi,gemi_kalkis_tarihi&dosya_id=eq.${dosyaId}&order=olusturma_tarihi.asc,id.asc`),
    oku<OnayKonteyneri>(`konteynerler?select=tip&dosya_id=eq.${dosyaId}`),
  ]);
  return d[0] ? { dosya: d[0], rezervasyonlar: r, konteynerler: k } : null;
}
/** lib/fatura-talimati-durum.ts "tam" kurali: rezervasyondaki konteyner adedinin hepsi girildi. */
const tamMi = (o: OnayOzeti) => {
  const rk = o.rezervasyonlar.reduce((t, r) => t + (r.konteyner_adedi || 0), 0);
  return rk > 0 && o.konteynerler.length === rk;
};

async function mailGonder(m: { from: string; to: string[]; subject: string; html: string; reply_to?: string; attachments?: { filename: string; content: string }[] }): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  if (!res.ok) throw new Error(`Mail gönderilemedi (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  return ((await res.json().catch(() => ({}))) as { id?: string }).id || null;
}

/** Kayit + onay maili. Mail gitmezse kayit silinir (sonraki taramada tekrar denenir). */
async function onayaGonder(o: OnayOzeti & { dosya: DosyaSatiri }, kaynak: "otomatik" | "elle", gonderen: string | null) {
  const companyId = o.dosya.company_id;
  const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, "fatura_onay", { canli: false, alicilar: [] });
  const test = !ayar.canli;
  const gonderilen = test ? TEST_ALICISI : ayar.alicilar;
  if (!gonderilen.length) return { atlandi: "Onay alıcısı yok (Ayarlar > Rapor Alıcıları)." };
  const k = await yaz("fatura_talimati_onaylari", "POST", { company_id: companyId, dosya_id: o.dosya.id, test, kaynak, gonderen, onay_alicilari: ayar.alicilar, gonderilen });
  if (k.status === 409) { await k.body?.cancel(); return { atlandi: "Bu dosya zaten onay bekliyor." }; }
  if (!k.ok) throw new Error(`fatura_talimati_onaylari yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  const kayit = ((await k.json()) as { id: string }[])[0];
  const ad = await sirketAdi(companyId);
  const m = onayMailiHtml(o, kayit.id, ad);
  try {
    await mailGonder({ from: `${ad} İhracat <bildirim@ihracatasistanim.com>`, to: gonderilen, subject: `${test ? "[TEST] " : ""}${m.konu}`, html: m.html });
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/fatura_talimati_onaylari?id=eq.${kayit.id}`, { method: "DELETE", headers: basliklar });
    throw e;
  }
  return { gonderildi: true, id: kayit.id, test };
}

type OnayKaydi = {
  id: string; company_id: string; dosya_id: string; durum: string; test: boolean;
  onay_alicilari: string[]; gonderilen: string[];
};

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { gonder?: string; karar?: string; id?: string; not?: string; pdf?: string; pdf_adi?: string };
    const k = await kullanici(req);

    // --- Tarama (pg_cron / anon) ---
    if (!k) {
      if (govde.gonder || govde.karar) return json({ ok: false, hata: "Giriş yapmanız gerekiyor." }, 401);
      const adaylar = await (async () => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fatura_onay_adaylari`, { method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: "{}" });
        if (!res.ok) throw new Error(`fatura_onay_adaylari okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
        return (await res.json()) as { dosya_id: string; company_id: string; test_kaydi: boolean; canli_kaydi: boolean }[];
      })();
      const canliMi = new Map<string, boolean>();
      let gonderilen = 0, atlanan = 0;
      for (const a of adaylar) {
        if (gonderilen >= TARAMA_SINIRI) break;
        if (!canliMi.has(a.company_id)) canliMi.set(a.company_id, (await raporAyari(SUPABASE_URL, basliklar, a.company_id, "fatura_onay", { canli: false, alicilar: [] })).canli);
        if (canliMi.get(a.company_id) ? a.canli_kaydi : a.test_kaydi) continue;
        const o = await dosyaOzeti(a.dosya_id);
        if (!o || !tamMi(o)) continue;
        const s = await onayaGonder(o, "otomatik", null);
        if (s.gonderildi) gonderilen++; else atlanan++;
      }
      return json({ ok: true, aday: adaylar.length, gonderilen, atlanan });
    }

    // --- Elle onaya gonder ---
    if (govde.gonder) {
      if (!UUID_RE.test(govde.gonder)) return json({ ok: false, hata: "Geçersiz dosya." }, 400);
      const o = await dosyaOzeti(govde.gonder);
      if (!o || o.dosya.company_id !== k.companyId) return json({ ok: false, hata: "Dosya bulunamadı." }, 404);
      if (!tamMi(o)) return json({ ok: false, hata: "Rezervasyondaki konteynerlerin hepsi girilmeden onaya gönderilemez." }, 400);
      const s = await onayaGonder(o, "elle", k.eposta);
      if (s.atlandi) return json({ ok: false, hata: s.atlandi }, 409);
      return json({ ok: true, ...s });
    }

    // --- Karar (onay / revize) ---
    if (govde.karar === "onay" || govde.karar === "revize") {
      if (!govde.id || !UUID_RE.test(govde.id)) return json({ ok: false, hata: "Geçersiz kayıt." }, 400);
      const kayit = (await oku<OnayKaydi>(`fatura_talimati_onaylari?select=id,company_id,dosya_id,durum,test,onay_alicilari,gonderilen&id=eq.${govde.id}`))[0];
      if (!kayit || kayit.company_id !== k.companyId) return json({ ok: false, hata: "Onay kaydı bulunamadı." }, 404);
      if (kayit.durum !== "bekliyor") return json({ ok: false, hata: kayit.durum === "onaylandi" ? "Bu talimat zaten onaylandı." : "Bu talimat için revize istendi; yeniden onaya gönderilmesi gerekiyor." }, 409);
      const yetkili = new Set([...(kayit.onay_alicilari || []), ...(kayit.gonderilen || [])].map((a) => a.toLowerCase()));
      if (!yetkili.has(k.eposta)) return json({ ok: false, hata: "Bu talimatı onaylama yetkiniz yok (onay listesinde değilsiniz)." }, 403);
      const o = await dosyaOzeti(kayit.dosya_id);
      if (!o) return json({ ok: false, hata: "Dosya bulunamadı." }, 404);
      const ad = await sirketAdi(kayit.company_id);
      const simdi = new Date().toISOString();

      if (govde.karar === "revize") {
        const not = String(govde.not || "").trim().slice(0, 1000);
        if (not.length < 3) return json({ ok: false, hata: "Revize notu yazın." }, 400);
        // Once durumu kilitle (yalniz bekliyor ise) - iki kisinin ayni anda karar vermesine karsi
        const p = await yaz(`fatura_talimati_onaylari?id=eq.${kayit.id}&durum=eq.bekliyor`, "PATCH", { durum: "revize", karar_veren: k.eposta, karar_zamani: simdi, revize_notu: not });
        const guncel = p.ok ? ((await p.json()) as unknown[]) : [];
        if (!guncel.length) return json({ ok: false, hata: "Bu talimat için az önce başka biri karar verdi. Sayfayı yenileyin." }, 409);
        const m = revizeMailiHtml(o, kayit.id, ad, k.eposta, not);
        let mailHatasi: string | null = null;
        try { await mailGonder({ from: `${ad} İhracat <bildirim@ihracatasistanim.com>`, to: kayit.gonderilen, subject: `${kayit.test ? "[TEST] " : ""}${m.konu}`, html: m.html, reply_to: k.eposta }); }
        catch (e) { mailHatasi = e instanceof Error ? e.message : String(e); }
        return json({ ok: true, durum: "revize", mailHatasi });
      }

      // onay: PDF zorunlu (tarayicida dosya sayfasindaki ureticiyle)
      const pdf = String(govde.pdf || "");
      if (!pdf || pdf.length > PDF_AZAMI || !/^[A-Za-z0-9+/=]+$/.test(pdf) || !pdf.startsWith("JVBER")) return json({ ok: false, hata: "Fatura talimatı PDF'i oluşturulamadı." }, 400);
      const pdfAdi = (String(govde.pdf_adi || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "Fatura_Talimati.pdf").replace(/(\.pdf)?$/i, ".pdf");
      const ayar = await raporAyari(SUPABASE_URL, basliklar, kayit.company_id, "fatura_dagitim", { canli: false, alicilar: [] });
      // Test onayi canliya gitmez; canli onay listesinde dagitim test modundaysa yine test adresine
      const test = kayit.test || !ayar.canli;
      const alicilar = test ? TEST_ALICISI : ayar.alicilar;
      if (!alicilar.length) return json({ ok: false, hata: "Dağıtım alıcısı yok (Ayarlar > Rapor Alıcıları)." }, 400);
      const konu = dagitimKonusu(o.dosya, o.konteynerler);
      const p = await yaz(`fatura_talimati_onaylari?id=eq.${kayit.id}&durum=eq.bekliyor`, "PATCH", { durum: "onaylandi", karar_veren: k.eposta, karar_zamani: simdi, dagitim_konusu: konu, dagitim_alicilari: alicilar });
      const guncel = p.ok ? ((await p.json()) as unknown[]) : [];
      if (!guncel.length) return json({ ok: false, hata: "Bu talimat için az önce başka biri karar verdi. Sayfayı yenileyin." }, 409);
      try {
        await mailGonder({
          from: `${ad} İhracat <bildirim@ihracatasistanim.com>`, to: alicilar, reply_to: k.eposta,
          subject: `${test ? "[TEST] " : ""}${konu}`, html: dagitimHtml(), attachments: [{ filename: pdfAdi, content: pdf }],
        });
      } catch (e) {
        // Mail gitmediyse karar geri alinir (yeniden onaylanabilsin)
        await yaz(`fatura_talimati_onaylari?id=eq.${kayit.id}`, "PATCH", { durum: "bekliyor", karar_veren: null, karar_zamani: null, dagitim_konusu: null, dagitim_alicilari: null }, "return=minimal");
        throw e;
      }
      if (!test) await yaz(`ihracat_dosyalari?id=eq.${kayit.dosya_id}&company_id=eq.${kayit.company_id}`, "PATCH", { fatura_talimati_gonderildi: true }, "return=minimal");
      return json({ ok: true, durum: "onaylandi", test, konu, alicilar });
    }

    return json({ ok: false, hata: "Geçersiz istek." }, 400);
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("fatura-onay hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
