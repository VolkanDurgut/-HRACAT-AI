import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { talimatMailiHtml, type OnayDosyasi, type OnayKonteyneri, type OnayOzeti, type OnayRezervasyonu } from "../_shared/fatura-onay.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";

// ============================================================================
// FATURA TALIMATI MAILI (fatura-onay) - 11.11.2026, 14.11.2026 onay adimi kaldirildi
// ============================================================================
// 11.11.2026: konteynerler tamamlaninca onay maili -> "Onayla ve gonder" -> PDF ekli dagitim maili.
// 14.11.2026 kullanici: "Onayla gonder kismini kaldirmaliyiz. Sadece fatura talimati gonderilsin: Harun Bey merhaba,
//   fatura talimati ektedir gibi; musteri, konteyner adedi, varis limani. PDF indir butonu eklenecek."
//   Alicilar: export@, execution@, bbt@, operation@, export2@ -> Ayarlar > Rapor Alicilari > "Fatura Talimati"
//   (rapor anahtari 'fatura_onay'; Alici + CC). 'fatura_dagitim' listesi artik KULLANILMIYOR.
// Liste canli DEGILSE mail YALNIZ test adresine (FATURA_ONAY_TEST_ALICISI secret'i) "[TEST]" konuyla gider.
// PDF tarayicida uretilir (lib/fatura-talimati-pdf-builder): mailde ek yok, "Fatura Talimatini Indir (PDF)" dugmesi
//   /fatura-onay?id=..&indir=1 sayfasini acar; sayfa ayni PDF'i olusturup indirir (giris gerekir).
// Dosyadaki fatura_talimati_gonderildi isaretine DOKUNULMAZ (konsimento beklentisini baslatir; dosya sayfasindaki
//   "Fatura Talimati" maili isaretler).
// CAGRILAR:
//  - Anon / pg_cron 'fatura-onay-tara' ({}): fatura_onay_adaylari() -> ayni modda (test / canli) hic kaydi olmayan
//    dosyalar icin kayit (durum 'gonderildi') + talimat maili. Calisma basina en fazla 5 dosya. Yanitta veri yok.
//  - Kullanici (JWT, ayni sirket): {gonder: dosya_id} -> simdi gonder / tekrar gonder (konteynerler tam olmali).
//  - {karar: ...} (eski onay / revize) -> 410.
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

async function mailGonder(m: { from: string; to: string[]; cc?: string[]; subject: string; html: string }): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  if (!res.ok) throw new Error(`Mail gönderilemedi (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  return ((await res.json().catch(() => ({}))) as { id?: string }).id || null;
}

/** Kayit (durum 'gonderildi') + talimat maili. Mail gitmezse kayit silinir (sonraki taramada tekrar denenir). */
async function talimatGonder(o: OnayOzeti & { dosya: DosyaSatiri }, kaynak: "otomatik" | "elle", gonderen: string | null) {
  const companyId = o.dosya.company_id;
  const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, "fatura_onay", { canli: false, alicilar: [] });
  const test = !ayar.canli;
  const to = test ? TEST_ALICISI : ayar.alicilar;
  const cc = test ? [] : ayar.cc;
  if (!to.length) return { atlandi: test ? "Test alıcısı tanımlı değil (FATURA_ONAY_TEST_ALICISI)." : "Alıcı yok (Ayarlar > Rapor Alıcıları > Fatura Talimatı)." };
  const k = await yaz("fatura_talimati_onaylari", "POST", {
    company_id: companyId, dosya_id: o.dosya.id, test, kaynak, gonderen, durum: "gonderildi",
    onay_alicilari: ayar.alicilar, gonderilen: [...to, ...cc],
  });
  if (!k.ok) throw new Error(`fatura_talimati_onaylari yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  const kayit = ((await k.json()) as { id: string }[])[0];
  const ad = await sirketAdi(companyId);
  const m = talimatMailiHtml(o, kayit.id, ad);
  try {
    await mailGonder({ from: `${ad} İhracat <bildirim@ihracatasistanim.com>`, to, ...(cc.length ? { cc } : {}), subject: `${test ? "[TEST] " : ""}${m.konu}`, html: m.html });
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/fatura_talimati_onaylari?id=eq.${kayit.id}`, { method: "DELETE", headers: basliklar });
    throw e;
  }
  return { gonderildi: true, id: kayit.id, test, alicilar: [...to, ...cc] };
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { gonder?: string; karar?: string };
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
        const s = await talimatGonder(o, "otomatik", null);
        if (s.gonderildi) gonderilen++; else atlanan++;
      }
      return json({ ok: true, aday: adaylar.length, gonderilen, atlanan });
    }

    // --- Simdi gonder / tekrar gonder ---
    if (govde.gonder) {
      if (!UUID_RE.test(govde.gonder)) return json({ ok: false, hata: "Geçersiz dosya." }, 400);
      const o = await dosyaOzeti(govde.gonder);
      if (!o || o.dosya.company_id !== k.companyId) return json({ ok: false, hata: "Dosya bulunamadı." }, 404);
      if (!tamMi(o)) return json({ ok: false, hata: "Rezervasyondaki konteynerlerin hepsi girilmeden fatura talimatı gönderilemez." }, 400);
      const s = await talimatGonder(o, "elle", k.eposta);
      if (s.atlandi) return json({ ok: false, hata: s.atlandi }, 409);
      return json({ ok: true, ...s });
    }

    // --- Eski onay / revize (14.11.2026 kaldirildi) ---
    if (govde.karar) return json({ ok: false, hata: "Onay adımı kaldırıldı; fatura talimatı maili doğrudan gönderilir." }, 410);

    return json({ ok: false, hata: "Geçersiz istek." }, 400);
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("fatura-onay hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
