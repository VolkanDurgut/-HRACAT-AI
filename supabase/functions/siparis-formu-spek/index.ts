import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { formModeli, type FormHam, type FormModeli } from "../_shared/siparis-formu.ts";
import { spekGecerli, spekKonusu, spekListesi, spekMailHtml, type SpekSatiri } from "../_shared/siparis-formu-spek.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { etiketliKonu, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";

// ============================================================================
// SIPARIS BILDIRIM FORMU - EXPORT SPEK ONAYI (siparis-formu-spek) - 23.11.2026
// ============================================================================
// Kullanici: "Urun speklerini lojistik bilemez. O yuzden bunlari export onaylayacak."
// Liste: _shared/siparis-formu-spek.ts (lojistik listesindeki yuklemelerden spekleri KAYDEDILMEMIS olanlar + oneri).
// ALICILAR: Ayarlar > Rapor Alicilari, rapor = 'siparis_formu_spek' (kurulum: export@, CANLI KAPALI).
//  - {"islem": "spek_ozet"} (pg_cron 'siparis-formu-spek', hafta ici 08:17 TR, anon): CANLI ise alicilara; gunde bir kez;
//    liste bossa gondermez. {"islem": "spek_ozet", "test": true}: "[TEST]" YALNIZ test adresine (24 saatte en fazla 5).
//  - Maildeki girissiz onay sayfasi (/siparis-formu-spek/[token], 3 gun): {"islem": "spek_bilgi" | "spek_onayla", "token", ...}.
//    Onay = siparis_formlari.spekler (yalniz spek; diger girisler degismez), guncelleyen "export (<alici>)". Spek CANLI degilken
//    (ya da test token'i) onay KAYDEDILMEZ (sonuc "test" doner). Mail gondermez.
// Test adresi koda YAZILMAZ (SIPARIS_FORMU_TEST_ALICISI, yoksa SIPARIS_RAPOR_TEST_ALICISI secret'i).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://ihracatasistanim.com";
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;
const GECERLILIK_GUN = 3;

function adresler(ad: string): string[] {
  return Array.from(new Set((Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a)))).slice(0, 4);
}
const TEST_ALICISI = adresler("SIPARIS_FORMU_TEST_ALICISI").length ? adresler("SIPARIS_FORMU_TEST_ALICISI") : adresler("SIPARIS_RAPOR_TEST_ALICISI");

const trSimdi = () => new Date(Date.now() + 3 * 3600_000);
const trBugun = () => trSimdi().toISOString().slice(0, 10);
const gunKaydir = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

async function veri(sirket: string, bugun: string): Promise<{ formlar: FormModeli[]; satirlar: SpekSatiri[] }> {
  const [ham, tartilan] = await Promise.all([
    rpc<FormHam[]>("siparis_formu_veri", { p_company: sirket, p_bas: gunKaydir(bugun, -60), p_bit: gunKaydir(bugun, 120) }),
    rpc<unknown>("siparis_formu_tartilanlar", { p_company: sirket }),
  ]);
  const formlar = ham.map(formModeli);
  const t = Array.isArray(tartilan) ? tartilan.filter((x): x is string => typeof x === "string") : [];
  return { formlar, satirlar: spekListesi(formlar, t, bugun) };
}

const ayar = (sirket: string) => raporAyari(SUPABASE_URL, basliklar, sirket, "siparis_formu_spek", { canli: false, alicilar: [] });

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
  const a = await ayar(sirket);
  if (!test && !a.canli) return { atlandi: "Spek onayı listesi canlı değil (Ayarlar > Rapor Alıcıları)." };
  const { satirlar } = await veri(sirket, bugun);
  const konu = spekKonusu(satirlar, bugun, test);
  if (!satirlar.length) return { atlandi: "Spek onayı bekleyen yükleme yok; mail gönderilmedi.", konu };
  const to = test ? TEST_ALICISI : a.alicilar;
  if (!to.length) return { atlandi: test ? "Test adresi tanımlı değil." : "Alıcı tanımlı değil." };
  if (test) {
    const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
    const son = await oku<{ id: string }>(`siparis_formu_spek_onaylari?select=id&company_id=eq.${sirket}&test=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
    if (son.length >= 5) return { atlandi: "Son 24 saatte en fazla 5 test listesi gönderilebilir." };
  }
  const token = yeniToken();
  const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_spek_onaylari`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: sirket, token, tarih: bugun, test, alici: a.alicilar.join(",") || null, booking_sayisi: satirlar.length,
      gecerlilik: new Date(Date.now() + GECERLILIK_GUN * 24 * 3600_000).toISOString() }),
  });
  if (k.status === 409) { await k.body?.cancel(); return { atlandi: "Bugünün listesi zaten gönderildi." }; }
  if (!k.ok) throw new Error(`siparis_formu_spek_onaylari yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  await k.body?.cancel();
  try {
    await mailGonder(to, konu, spekMailHtml(satirlar, bugun, `${SITE}/siparis-formu-spek/${token}`, { test, alici: a.alicilar.join(", ") }));
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_spek_onaylari?token=eq.${token}`, { method: "DELETE", headers: basliklar });
    throw e;
  }
  return { konu, alici: to, gonderildi: true, yukleme: satirlar.length };
}

type Kayit = { id: string; company_id: string; tarih: string; test: boolean; alici: string | null };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, hata: "Yalnız POST." }, 405);
  try {
    const govde = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bugun = trBugun();

    if (govde.islem === "spek_ozet") {
      const gun = trSimdi().getUTCDay();
      const test = govde.test === true;
      if (!test && (gun === 0 || gun === 6)) return json({ ok: true, haftasonu: true });
      const sirketler = Array.from(new Set((await oku<{ company_id: string }>("rapor_alicilari?select=company_id&rapor=eq.siparis_formu_spek")).map((x) => x.company_id)));
      const sonuclar = [];
      for (const s of sirketler) sonuclar.push(await ozet(s, bugun, test));
      return json({ ok: true, sonuclar });
    }

    if (govde.islem !== "spek_bilgi" && govde.islem !== "spek_onayla") return json({ ok: false, hata: "Bilinmeyen işlem." }, 400);
    const token = typeof govde.token === "string" && TOKEN_RE.test(govde.token) ? govde.token : "";
    const kayit = token
      ? (await oku<Kayit>(`siparis_formu_spek_onaylari?select=id,company_id,tarih,test,alici&token=eq.${token}&gecerlilik=gt.${encodeURIComponent(new Date().toISOString())}`))[0]
      : undefined;
    if (!kayit) return json({ ok: false, hata: "Bu bağlantı geçersiz ya da süresi doldu. Bir sonraki sabah maili yeni bağlantıyla gelir." }, 404);
    const a = await ayar(kayit.company_id);
    const test = kayit.test || !a.canli;
    const { formlar, satirlar } = await veri(kayit.company_id, bugun);

    if (govde.islem === "spek_bilgi") return json({ ok: true, tarih: bugun, test, satirlar });

    const onaylar = (Array.isArray(govde.onaylar) ? govde.onaylar : []).slice(0, 25)
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object");
    if (!onaylar.length) return json({ ok: false, hata: "Onaylanacak yükleme seçilmedi." }, 400);
    const listede = new Set(satirlar.map((s) => s.anahtar));
    const isaretleyen = `export (${(kayit.alici || a.alicilar.join(",") || "onay sayfasi").slice(0, 100)})`;
    const sonuclar = [];
    for (const o of onaylar) {
      const b = typeof o.booking === "string" ? o.booking.replace(/\s/g, "").toUpperCase() : "";
      const spek = spekGecerli(o.spekler);
      const m = formlar.find((x) => x.anahtar === b);
      if (!m || !listede.has(b)) { sonuclar.push({ booking: b, atlandi: "Listede değil (spek zaten kayıtlı, form gitmiş ya da yükleme başlamış)." }); continue; }
      if (!spek) { sonuclar.push({ booking: m.bookingNo, atlandi: "Spek boş olamaz." }); continue; }
      if (test) { sonuclar.push({ booking: m.bookingNo, test: true, atlandi: "Test modunda kaydedilmez." }); continue; }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formlari?on_conflict=company_id,booking_anahtar`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ company_id: kayit.company_id, booking_anahtar: m.anahtar, booking_no: m.bookingNo, spekler: spek, guncelleyen: isaretleyen, guncelleme: new Date().toISOString() }]),
      });
      if (!res.ok) { sonuclar.push({ booking: m.bookingNo, atlandi: `Kaydedilemedi (HTTP ${res.status}).` }); await res.body?.cancel(); continue; }
      await res.body?.cancel();
      sonuclar.push({ booking: m.bookingNo, onaylandi: true });
    }
    return json({ ok: true, test, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparis-formu-spek hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
