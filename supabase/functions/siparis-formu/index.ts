import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { formDosyaAdi, formKonusu, formMailHtml, formModeli, gonderimZamaniMi, uyariMailHtml, type FormHam, type FormModeli } from "../_shared/siparis-formu.ts";
import { gorselTuru, siparisFormuXlsx, type FormGorseli } from "../_shared/siparis-formu-xlsx.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";

// ============================================================================
// SIPARIS BILDIRIM FORMU MAILI (siparis-formu) - 18.11.2026
// ============================================================================
// Kullanici: "Siparis formunun otomatik olarak hazirlanmasi ve uretim@ adresine mail gonderilmesini istiyorum. Her yukleme
// icin ayri olusmali. Ilk olarak test adresine gonderilmeli. Ekipman alim tarihi - 1 gun olarak mail gitmeli."
// Model + mail: _shared/siparis-formu.ts; Excel (sablonun birebir duzeni, logo + cuval gorseli): _shared/siparis-formu-xlsx.ts.
// Veri: siparis_formu_veri (service_role; yukleme plani + dosya + siparis listesi + temsilci + spekler + girisler).
// ALICILAR: Ayarlar > Rapor Alicilari, rapor = 'siparis_formu' (kurulum: uretim@, CANLI KAPALI).
//  - Canli: form alicilara; booking basina BIR kez (siparis_formu_gonderimleri kismi benzersiz index).
//  - Canli degil: ayni zamanlamayla "[TEST]" form YALNIZ test adresine (SIPARIS_FORMU_TEST_ALICISI, yoksa
//    SIPARIS_RAPOR_TEST_ALICISI secret'i); booking basina bir otomatik test. Test adresi koda YAZILMAZ.
//  - Eksik (cuval gorseli / uretim / SKT) varsa form YINE gider, eksik alanlar "GİRİLMEDİ"; temsilciye ayrica uyari
//    (testte uyari da test adresine).
// CAGRI:
//  - Anon (pg_cron 'siparis-formu', her 30 dk 08:00-18:30 TR) {}: gonderim gunu (bos ekipman - 1) 08:00'den itibaren,
//    ekipman gunu gecmemis bookingler. Yanitta veri yok.
//  - Yetkili kullanici (admin / super admin), yalniz kendi sirketi: {"test": true, "booking": "..."} -> "[TEST]" form test
//    adresine (24 saatte en fazla 10), otomatik gonderimi engellemez.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://ihracatasistanim.com";
const KOVA = "siparis-formlari";
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const SUPER_ADMIN_EPOSTALARI = ["execution@unex.com.tr", "bbt@unex.com.tr"];
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function adresler(ad: string): string[] {
  return Array.from(new Set((Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a)))).slice(0, 4);
}
const TEST_ALICISI = adresler("SIPARIS_FORMU_TEST_ALICISI").length ? adresler("SIPARIS_FORMU_TEST_ALICISI") : adresler("SIPARIS_RAPOR_TEST_ALICISI");

const trSimdi = () => new Date(Date.now() + 3 * 3600_000);
const trBugun = () => trSimdi().toISOString().slice(0, 10);
const trDakika = () => { const t = trSimdi(); return t.getUTCHours() * 60 + t.getUTCMinutes(); };
const gunKaydir = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

async function tekrarla(istek: () => Promise<Response>): Promise<Response> {
  for (let sira = 0; ; sira++) {
    try {
      const res = await istek();
      if (res.status < 500 || sira >= 2) return res;
      await res.body?.cancel();
    } catch (e) {
      if (sira >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (sira + 1)));
  }
}
async function oku<T>(yol: string): Promise<T[]> {
  const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar }));
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
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
/** Admin / super admin kullanicinin sirketi; degilse null. */
async function yetkiliKullaniciSirketi(req: Request): Promise<string | null> {
  const baslik = req.headers.get("Authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null;
  if (jwtRolu(token) !== "authenticated") return null;
  const kRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!kRes.ok) { await kRes.body?.cancel(); return null; }
  const k = (await kRes.json()) as { id?: string; email?: string };
  if (!k.id || !UUID_RE.test(k.id)) return null;
  const roller = await oku<{ company_id: string | null; rol: string | null }>(`kullanici_rolleri?select=company_id,rol&user_id=eq.${k.id}`);
  const kayit = roller.find((r) => !!r.company_id);
  if (!kayit?.company_id) return null;
  const superAdmin = SUPER_ADMIN_EPOSTALARI.includes((k.email || "").toLowerCase());
  return superAdmin || kayit.rol === "admin" ? kayit.company_id : null;
}

async function formlar(companyId: string, bas: string, bit: string): Promise<FormModeli[]> {
  const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/rpc/siparis_formu_veri`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" },
    body: JSON.stringify({ p_company: companyId, p_bas: bas, p_bit: bit }),
  }));
  if (!res.ok) throw new Error(`siparis_formu_veri okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as FormHam[]).map(formModeli);
}

async function ikili(adres: string, ek: Record<string, string> = {}): Promise<Uint8Array | null> {
  try {
    const r = await tekrarla(() => fetch(adres, { headers: ek }));
    if (!r.ok) { await r.body?.cancel(); return null; }
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}
const gorsel = (b: Uint8Array | null): FormGorseli | null => { const t = b ? gorselTuru(b) : null; return b && t ? { veri: b, tur: t } : null; };

let logoOnbellek: FormGorseli | null | undefined;
async function logo(): Promise<FormGorseli | null> {
  if (logoOnbellek === undefined) logoOnbellek = gorsel(await ikili(`${SITE}/images/logo.png`));
  return logoOnbellek;
}

function base64(bayt: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bayt.length; i += 0x8000) s += String.fromCharCode(...bayt.subarray(i, i + 0x8000));
  return btoa(s);
}

async function mailGonder(to: string[], cc: string[], konu: string, html: string, ekler: { filename: string; content: string }[]): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Unex Gıda Sipariş Formu <bildirim@ihracatasistanim.com>", to, ...(cc.length ? { cc } : {}), subject: konu, html, ...(ekler.length ? { attachments: ekler } : {}) }),
  });
  if (!res.ok) throw new Error(`Mail gönderilemedi (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  await res.body?.cancel();
}

/** Formun Excel'i (+ cuval gorseli ayri ek). */
async function ekler(m: FormModeli): Promise<{ filename: string; content: string }[]> {
  const cuvalBayt = m.gorselYolu ? await ikili(`${SUPABASE_URL}/storage/v1/object/${KOVA}/${m.gorselYolu.split("/").map(encodeURIComponent).join("/")}`, basliklar) : null;
  const cuval = gorsel(cuvalBayt);
  if (m.gorselYolu && !cuval) console.error("siparis-formu: cuval gorseli okunamadi:", m.bookingNo);
  const zip = new JSZip();
  for (const p of siparisFormuXlsx(m, await logo(), cuval)) zip.file(p.yol, p.icerik);
  const liste = [{ filename: formDosyaAdi(m), content: await zip.generateAsync({ type: "base64", compression: "DEFLATE" }) }];
  if (cuval) liste.push({ filename: formDosyaAdi(m).replace(/\.xlsx$/, `_cuval.${cuval.tur === "png" ? "png" : "jpg"}`), content: base64(cuval.veri) });
  return liste;
}

async function kayitAc(companyId: string, m: FormModeli, durum: "gonderiliyor" | "test", elle: boolean): Promise<{ id: string | null; tekrar: boolean }> {
  const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_gonderimleri`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ company_id: companyId, booking_anahtar: m.anahtar, booking_no: m.bookingNo, durum, elle, eksikler: m.girisEksikleri }),
  });
  if (k.status === 409) { await k.body?.cancel(); return { id: null, tekrar: true }; }
  if (!k.ok) throw new Error(`siparis_formu_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  return { id: ((await k.json()) as { id: string }[])[0]?.id || null, tekrar: false };
}
async function kayitGuncelle(id: string, veri: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_gonderimleri?id=eq.${id}`, {
    method: "PATCH", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(veri),
  });
}
async function kayitSil(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_gonderimleri?id=eq.${id}`, { method: "DELETE", headers: basliklar });
}

/** Tek form: kayit (tekrar korumasi) -> Excel -> mail -> (eksikse) temsilciye uyari. */
async function gonder(companyId: string, sirketAdi: string, m: FormModeli, alicilar: string[], cc: string[], test: boolean, elle: boolean) {
  const kayit = await kayitAc(companyId, m, test ? "test" : "gonderiliyor", elle);
  if (kayit.tekrar) return { booking: m.bookingNo, atlandi: "zaten gönderildi" };
  try {
    await mailGonder(alicilar, test ? [] : cc, formKonusu(m, test), formMailHtml(m, sirketAdi, test), await ekler(m));
  } catch (e) {
    if (kayit.id) await kayitSil(kayit.id);
    throw e;
  }
  if (kayit.id) await kayitGuncelle(kayit.id, { durum: test ? "test" : "gonderildi", alicilar: [...alicilar, ...(test ? [] : cc)].join(","), ozet: { konu: formKonusu(m, test), eksik: m.eksikler } });
  // Eksik giris: temsilciye uyari (testte test adresine). Uyari hatasi formu geri almaz.
  let uyari: string | null = null;
  if (m.girisEksikleri.length) {
    const hedef = test ? TEST_ALICISI : (m.temsilciEposta && EPOSTA_RE.test(m.temsilciEposta) ? [m.temsilciEposta] : []);
    if (hedef.length) {
      try {
        await mailGonder(hedef, [], `${test ? "[TEST] " : ""}Eksik bilgiyle gönderildi · Sipariş Bildirim Formu · ${m.alanlar.firma} · ${m.bookingNo}`, uyariMailHtml(m, test), []);
        uyari = hedef.join(",");
      } catch (e) {
        console.error("siparis-formu: uyari gonderilemedi:", e instanceof Error ? e.message : e);
      }
    }
  }
  return { booking: m.bookingNo, gonderildi: true, test, eksik: m.girisEksikleri, uyari };
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { test?: boolean; booking?: string };
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const bugun = trBugun();

    // Elle test (yonetici): tek booking, test adresine
    if (yetkiliSirket) {
      if (govde.test !== true || !govde.booking) return json({ ok: false, hata: "Elle yalnızca bir booking için test gönderimi yapılabilir." }, 400);
      if (!TEST_ALICISI.length) return json({ ok: false, hata: "Test adresi tanımlı değil." }, 400);
      const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
      const son = await oku<{ id: string }>(`siparis_formu_gonderimleri?select=id&company_id=eq.${yetkiliSirket}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
      if (son.length >= 10) return json({ ok: false, hata: "Son 24 saatte en fazla 10 test formu gönderilebilir." }, 429);
      const anahtar = govde.booking.replace(/\s/g, "").toUpperCase();
      const liste = await formlar(yetkiliSirket, gunKaydir(bugun, -60), gunKaydir(bugun, 120));
      const m = liste.find((x) => x.anahtar === anahtar);
      if (!m) return json({ ok: false, hata: "Booking yükleme planında bulunamadı." }, 404);
      const sirket = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${yetkiliSirket}`);
      const sonuc = await gonder(yetkiliSirket, (sirket[0]?.company_name || "Unex Gıda").trim(), m, TEST_ALICISI, [], true, true);
      return json({ ok: true, sonuc, alici: TEST_ALICISI });
    }
    if (govde.test === true) return json({ ok: false, hata: "Test gönderimi yalnızca yöneticiler içindir." }, 403);

    // Zamanlanmis tarama (pg_cron)
    const dakika = trDakika();
    const ayarlar = await oku<{ company_id: string }>(`rapor_alicilari?select=company_id&rapor=eq.siparis_formu`);
    const sonuclar: Record<string, unknown>[] = [];
    for (const { company_id: companyId } of ayarlar) {
      const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, "siparis_formu", { canli: false, alicilar: [] });
      const test = !ayar.canli;
      const alicilar = test ? TEST_ALICISI : ayar.alicilar;
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok." }); continue; }
      const sirket = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${companyId}`);
      const sirketAdi = (sirket[0]?.company_name || "Unex Gıda").replace(/[<>"]/g, "").trim();
      const zamani = (await formlar(companyId, gunKaydir(bugun, -1), gunKaydir(bugun, 2))).filter((m) => gonderimZamaniMi(m, bugun, dakika));
      for (const m of zamani) {
        if (!test && m.gonderim?.zaman) continue;
        if (test && m.test?.zaman) continue;
        try {
          sonuclar.push(await gonder(companyId, sirketAdi, m, alicilar, ayar.cc, test, false));
        } catch (e) {
          const mesaj = e instanceof Error ? e.message : String(e);
          console.error("siparis-formu:", m.bookingNo, mesaj);
          sonuclar.push({ booking: m.bookingNo, hata: mesaj.slice(0, 160) });
        }
      }
    }
    return json({ ok: true, tarih: bugun, gonderilen: sonuclar.filter((x) => x.gonderildi).length, hata: sonuclar.filter((x) => x.hata).length });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparis-formu hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
