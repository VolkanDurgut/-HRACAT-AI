import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { formModeli, type FormHam } from "../_shared/siparis-formu.ts";
import { spekKonusu, spekListesi, spekMailHtml, type SpekSatiri } from "../_shared/siparis-formu-spek.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { etiketliKonu, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";

// ============================================================================
// SIPARIS BILDIRIM FORMU - EXPORT GIRISLERI SABAH MAILI (siparis-formu-spek) - 23.11.2026
// ============================================================================
// Kullanici: "Her gun Harun Bey'e spek ve girilmesi gereken urun gorselleri mail olarak gider; ekraninda bildirim olarak da
// gorunur." + 23.11.2026 aksam: "Gonder butonu ile uretime Unex AI mail olarak gondersin. Hatirlatma her sabah gonderilsin."
// Liste: _shared/siparis-formu-spek.ts (spek / cuval gorseli / uretim-SKT girisi eksik yuklemeler; ACIL = ekipmana <= 2 gun).
// Giris: UNEX-AI > Siparisler > Siparis Formlari (giris gerekir); form orada "Uretime gonder" ile gider (edge siparis-formu).
// Bu edge yalniz hatirlatma maili gonderir, form gondermez.
// ALICILAR: Ayarlar > Rapor Alicilari, rapor = 'siparis_formu_spek' (export@; 23.11.2026 aksam kullanici istegiyle CANLI).
//  - {"islem": "spek_ozet"} (pg_cron 'siparis-formu-spek', hafta ici 08:17 TR, anon): CANLI ise alicilara; gunde bir kez;
//    liste bossa gondermez. {"islem": "spek_ozet", "test": true}: "[TEST]" YALNIZ test adresine (24 saatte en fazla 5).
// Gonderim kaydi: siparis_formu_spek_onaylari (gun tekligi + test orani; token kullanilmaz).
// Test adresi koda YAZILMAZ (SIPARIS_FORMU_TEST_ALICISI, yoksa SIPARIS_RAPOR_TEST_ALICISI secret'i).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://ihracatasistanim.com";
const FORMLAR_SAYFASI = `${SITE}/siparisler?sekme=formlar`;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function adresler(ad: string): string[] {
  return Array.from(new Set((Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a)))).slice(0, 4);
}
const TEST_ALICISI = adresler("SIPARIS_FORMU_TEST_ALICISI").length ? adresler("SIPARIS_FORMU_TEST_ALICISI") : adresler("SIPARIS_RAPOR_TEST_ALICISI");

const trSimdi = () => new Date(Date.now() + 3 * 3600_000);
const trBugun = () => trSimdi().toISOString().slice(0, 10);
const gunKaydir = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });

async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
}
async function rpc<T>(ad: string, govde: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, { method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  if (!res.ok) throw new Error(`${ad} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function liste(sirket: string, bugun: string): Promise<SpekSatiri[]> {
  const [ham, tartilan] = await Promise.all([
    rpc<FormHam[]>("siparis_formu_veri", { p_company: sirket, p_bas: gunKaydir(bugun, -60), p_bit: gunKaydir(bugun, 120) }),
    rpc<unknown>("siparis_formu_tartilanlar", { p_company: sirket }),
  ]);
  const t = Array.isArray(tartilan) ? tartilan.filter((x): x is string => typeof x === "string") : [];
  return spekListesi(ham.map(formModeli), t, bugun);
}

function yeniToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function mailGonder(to: string[], konu: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: UNEX_AI_GONDEREN, to, subject: etiketliKonu("Hatırlatma", konu), html }),
  });
  if (!res.ok) throw new Error(`Mail gönderilemedi (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  await res.body?.cancel();
}

async function ozet(sirket: string, bugun: string, test: boolean): Promise<Record<string, unknown>> {
  const a = await raporAyari(SUPABASE_URL, basliklar, sirket, "siparis_formu_spek", { canli: false, alicilar: [] });
  if (!test && !a.canli) return { atlandi: "Export girişleri listesi canlı değil (Ayarlar > Rapor Alıcıları)." };
  const satirlar = await liste(sirket, bugun);
  const konu = spekKonusu(satirlar, bugun, test);
  if (!satirlar.length) return { atlandi: "Spek / çuval görseli bekleyen yükleme yok; mail gönderilmedi.", konu };
  const to = test ? TEST_ALICISI : a.alicilar;
  if (!to.length) return { atlandi: test ? "Test adresi tanımlı değil." : "Alıcı tanımlı değil." };
  if (test) {
    const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
    const son = await oku<{ id: string }>(`siparis_formu_spek_onaylari?select=id&company_id=eq.${sirket}&test=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
    if (son.length >= 5) return { atlandi: "Son 24 saatte en fazla 5 test listesi gönderilebilir." };
  }
  // Hitap: Pazar ekibinde alicinin e-postasi (export@ -> "Harun Bey")
  const ekip = a.alicilar.length
    ? await oku<{ eposta: string; hitap: string | null }>(`pazar_ekip?select=eposta,hitap&company_id=eq.${sirket}&aktif=is.true`)
    : [];
  const hitap = ekip.find((e) => a.alicilar.includes(String(e.eposta).toLowerCase()))?.hitap || null;
  const token = yeniToken();
  const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_spek_onaylari`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: sirket, token, tarih: bugun, test, alici: a.alicilar.join(",") || null, booking_sayisi: satirlar.length,
      gecerlilik: new Date(Date.now() + 24 * 3600_000).toISOString() }),
  });
  if (k.status === 409) { await k.body?.cancel(); return { atlandi: "Bugünün listesi zaten gönderildi." }; }
  if (!k.ok) throw new Error(`siparis_formu_spek_onaylari yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  await k.body?.cancel();
  try {
    await mailGonder(to, konu, spekMailHtml(satirlar, bugun, FORMLAR_SAYFASI, { test, alici: a.alicilar.join(", "), hitap }));
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_spek_onaylari?token=eq.${token}`, { method: "DELETE", headers: basliklar });
    throw e;
  }
  return { konu, alici: to, gonderildi: true, yukleme: satirlar.length, acil: satirlar.filter((s) => s.acil).length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, hata: "Yalnız POST." }, 405);
  try {
    const govde = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (govde.islem !== "spek_ozet") return json({ ok: false, hata: "Bilinmeyen işlem." }, 400);
    const bugun = trBugun();
    const gun = trSimdi().getUTCDay();
    const test = govde.test === true;
    if (!test && (gun === 0 || gun === 6)) return json({ ok: true, haftasonu: true });
    const sirketler = Array.from(new Set((await oku<{ company_id: string }>("rapor_alicilari?select=company_id&rapor=eq.siparis_formu_spek")).map((x) => x.company_id)));
    const sonuclar = [];
    for (const s of sirketler) sonuclar.push(await ozet(s, bugun, test));
    return json({ ok: true, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparis-formu-spek hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
