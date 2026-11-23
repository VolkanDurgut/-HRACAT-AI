import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { formDosyaAdi, formKonusu, formMailHtml, formModeli, LOGO_CID, type FormHam, type FormModeli } from "../_shared/siparis-formu.ts";
import { gorselTuru, siparisFormuXlsx, type FormGorseli } from "../_shared/siparis-formu-xlsx.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { etiketliKonu, UNEX_AI_GONDEREN, type MailEtiketi } from "../_shared/unex-ai.ts";
import { lojistikKonusu, lojistikListesi, lojistikMailHtml, type LojistikSatiri } from "../_shared/siparis-formu-lojistik.ts";

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
//  - 19.11.2026 (kullanici): "Gorseli yuklenmemisse mail gitmemeli; eksik bilgi ile gonderilme durumu ortadan kalkmis olacak."
//    Girisler (cuval gorseli + urun spekleri + uretim + SKT) tamam DEGILSE form hicbir yoldan (otomatik / elle / test) GITMEZ;
//    tamamlandiginda gonderim penceresi icindeyse bir sonraki taramada gider. (Eski "eksikle gonder + temsilciye uyari" kalkti.)
//  - Mailin basinda Unex logosu (gomulu, cid) - 19.11.2026.
// CAGRI:
//  - Anon {}: 19.11.2026'dan beri OTOMATIK GONDERIM YOK (kullanici: "oto mail gonderimi olmasin, Gonder butonu ile");
//    hicbir sey gondermez. pg_cron isi kaldirildi.
//  - Siparisler sayfasi yetkili kullanici (proformalar / analiz), yalniz kendi sirketi: {"test": true, "booking": "..."} ->
//    "[TEST]" form YALNIZ test adresine (24 saatte en fazla 25), otomatik gonderimi engellemez. (18.11.2026: yalniz admin degil;
//    test maili uretime gitmedigi icin sayfa yetkisi yeterli.)
//  - Ayni yetkiyle {"gonder": true, "booking": "..."} -> CANLI modda alicilar + CC'ye (booking basina BIR kez; otomatik
//    gonderimle ayni tekrar korumasi). Canli kapaliysa reddedilir (Test gonder kullanilir). 19.11.2026.
// LOJISTIK SECIMI (23.11.2026, kullanici: "Onayi ve rezervasyonu alinmis yuklemeler Suleyman Bey'e mail gitse; oradan siparis
//   bildirim formu gonderilmesi gerekenleri secse. Su an yuklenenleri dahil etme."): _shared/siparis-formu-lojistik.ts.
//  - {"islem": "lojistik_ozet"} (pg_cron 'siparis-formu-lojistik', hafta ici 08:27 TR, anon): Rapor Alicilari
//    'siparis_formu_lojistik' CANLI ise listeyi alicilara (lojistik@) gonderir; gunde bir kez; liste bossa gondermez.
//    {"islem": "lojistik_ozet", "test": true} (anon da olur): "[TEST]" liste YALNIZ test adresine (24 saatte en fazla 5).
//    Siparisler yetkili kullanici {"deneme": true} / {"test": true} (booking'siz; Rapor Alicilari onizle / test maili): ayni liste.
//  - Maildeki girissiz secim sayfasi (/siparis-formu-sec/[token], 3 gun): {"islem": "lojistik_bilgi" | "lojistik_gonder" |
//    "lojistik_kapat", "token", ...}. Lojistik CANLI degilken (ya da test listesinin token'i) secilen formlar "[TEST]" olarak
//    YALNIZ test adresine gider, "zaten gonderildi" isareti kaydedilmez. Canlida form 'siparis_formu' alicilari + CC'ye
//    (booking basina BIR kez; ayni tekrar korumasi); isaret = alicisiz "gonderildi" kaydi (Siparisler'de "Kapatildi").
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
const gunKaydir = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// 23.11.2026: girissiz secim sayfasi tarayicidan cagirir (CORS on kontrolu)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
/** Siparisler sayfasi yetkisi (proformalar / analiz) olan kullanicinin sirketi (+ e-postasi); degilse null. */
async function yetkiliKullanici(req: Request): Promise<{ sirket: string; eposta: string } | null> {
  const baslik = req.headers.get("Authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null;
  if (jwtRolu(token) !== "authenticated") return null;
  const kRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!kRes.ok) { await kRes.body?.cancel(); return null; }
  const k = (await kRes.json()) as { id?: string; email?: string };
  if (!k.id || !UUID_RE.test(k.id)) return null;
  const eposta = (k.email || "").toLowerCase().slice(0, 120);
  const roller = await oku<{ company_id: string | null; rol: string | null }>(`kullanici_rolleri?select=company_id,rol&user_id=eq.${k.id}`);
  const kayit = roller.find((r) => !!r.company_id);
  if (!kayit?.company_id) return null;
  const superAdmin = SUPER_ADMIN_EPOSTALARI.includes((k.email || "").toLowerCase());
  if (superAdmin || kayit.rol === "admin") return { sirket: kayit.company_id, eposta };
  const yetki = await oku<{ sayfa_yetkileri: Record<string, unknown> | null }>(`kullanici_yetkileri?select=sayfa_yetkileri&user_id=eq.${k.id}`);
  const s = yetki[0]?.sayfa_yetkileri || {};
  return s.proformalar === true || s.analiz === true || s.proformalar === "true" || s.analiz === "true" ? { sirket: kayit.company_id, eposta } : null;
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

let logoOnbellek: FormGorseli | null = null;
async function logo(): Promise<FormGorseli | null> {
  if (!logoOnbellek) logoOnbellek = gorsel(await ikili(`${SITE}/images/logo.png`));
  return logoOnbellek;
}
/** Mail ustundeki kucuk logo (144x119 PNG). Yalniz basarili okuma onbelleklenir; okunamazsa mail logosuz gider. */
let mailLogoOnbellek: Uint8Array | null = null;
async function mailLogosu(): Promise<Uint8Array | null> {
  if (!mailLogoOnbellek) {
    const b = await ikili(`${SITE}/images/logo-mail.png`);
    if (b && gorselTuru(b) === "png" && b.length < 200_000) mailLogoOnbellek = b;
  }
  return mailLogoOnbellek;
}

function base64(bayt: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bayt.length; i += 0x8000) s += String.fromCharCode(...bayt.subarray(i, i + 0x8000));
  return btoa(s);
}

type Ek = { filename: string; content: string; content_id?: string };
async function mailGonder(to: string[], cc: string[], konu: string, html: string, ekler: Ek[], etiket: MailEtiketi = "Önemli"): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: UNEX_AI_GONDEREN, to, ...(cc.length ? { cc } : {}), subject: etiketliKonu(etiket, konu), html, ...(ekler.length ? { attachments: ekler } : {}) }),
  });
  if (!res.ok) throw new Error(`Mail gönderilemedi (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  await res.body?.cancel();
}

/** Formun Excel'i (+ cuval gorseli ayri ek). */
async function ekler(m: FormModeli): Promise<Ek[]> {
  const cuvalBayt = m.gorselYolu ? await ikili(`${SUPABASE_URL}/storage/v1/object/${KOVA}/${m.gorselYolu.split("/").map(encodeURIComponent).join("/")}`, basliklar) : null;
  const cuval = gorsel(cuvalBayt);
  if (m.gorselYolu && !cuval) console.error("siparis-formu: cuval gorseli okunamadi:", m.bookingNo);
  const zip = new JSZip();
  for (const p of siparisFormuXlsx(m, await logo(), cuval)) zip.file(p.yol, p.icerik);
  const liste: Ek[] = [{ filename: formDosyaAdi(m), content: await zip.generateAsync({ type: "base64", compression: "DEFLATE" }) }];
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

/**
 * Tek form: kayit (tekrar korumasi) -> Excel -> mail. 19.11.2026: girisler eksikse HICBIR kayit / mail yok.
 * elle: yalniz test gonderimlerinde (oran siniri); canli elle gonderim otomatikle ayni tekrar korumasini kullanir.
 */
async function gonder(companyId: string, sirketAdi: string, m: FormModeli, alicilar: string[], cc: string[], test: boolean, elle: boolean, gonderen = "", secim = "") {
  if (!m.gonderilebilir) return { booking: m.bookingNo, atlandi: `eksik: ${m.girisEksikleri.join(", ")}` };
  const kayit = await kayitAc(companyId, m, test ? "test" : "gonderiliyor", test && elle);
  if (kayit.tekrar) return { booking: m.bookingNo, atlandi: "zaten gönderildi" };
  const logoBayt = await mailLogosu();
  const ekListesi = await ekler(m);
  if (logoBayt) ekListesi.push({ filename: "unex-logo.png", content: base64(logoBayt), content_id: LOGO_CID });
  try {
    await mailGonder(alicilar, test ? [] : cc, formKonusu(m, test), formMailHtml(m, sirketAdi, test, !!logoBayt), ekListesi);
  } catch (e) {
    if (kayit.id) await kayitSil(kayit.id);
    throw e;
  }
  if (kayit.id) {
    await kayitGuncelle(kayit.id, {
      durum: test ? "test" : "gonderildi", alicilar: [...alicilar, ...(test ? [] : cc)].join(","),
      ozet: { konu: formKonusu(m, test), eksik: m.eksikler, ...(gonderen ? { elle_gonderen: gonderen } : {}), ...(secim ? { secim } : {}) },
    });
  }
  return { booking: m.bookingNo, gonderildi: true, test };
}

// ---- Lojistik secimi (23.11.2026) ----------------------------------------------------------------------------------
const TOKEN_RE = /^[0-9a-f]{32}$/;
const SECIM_GUN = 3;
function yeniToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function sirketAdiOku(id: string): Promise<string> {
  const s = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${id}`);
  return (s[0]?.company_name || "Unex Gıda").replace(/[<>"]/g, "").trim();
}
async function tartilanlar(companyId: string): Promise<string[]> {
  const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/rpc/siparis_formu_tartilanlar`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_company: companyId }),
  }));
  if (!res.ok) throw new Error(`siparis_formu_tartilanlar okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const v = await res.json();
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
async function lojistikVeri(companyId: string, bugun: string): Promise<{ formlar: FormModeli[]; satirlar: LojistikSatiri[] }> {
  const [liste, t] = await Promise.all([formlar(companyId, gunKaydir(bugun, -60), gunKaydir(bugun, 120)), tartilanlar(companyId)]);
  return { formlar: liste, satirlar: lojistikListesi(liste, t, bugun) };
}
type Secim = { id: string; company_id: string; tarih: string; test: boolean; alici: string | null; olusturma: string };
async function secimOku(token: string): Promise<Secim | null> {
  if (!TOKEN_RE.test(token)) return null;
  const r = await oku<Secim>(`siparis_formu_secimleri?select=id,company_id,tarih,test,alici,olusturma&token=eq.${token}&gecerlilik=gt.${encodeURIComponent(new Date().toISOString())}`);
  return r[0] || null;
}
/** Lojistik CANLI mi + alicilari (yoksa lojistik@ kurulum degeri). */
const lojistikAyari = (companyId: string) => raporAyari(SUPABASE_URL, basliklar, companyId, "siparis_formu_lojistik", { canli: false, alicilar: [] });

/** Liste maili. mod: canli (zamanlanmis) | test (yalniz test adresi) | deneme (mail yok, onizleme). */
async function lojistikOzet(companyId: string, bugun: string, mod: "canli" | "test" | "deneme"): Promise<Record<string, unknown>> {
  const ayar = await lojistikAyari(companyId);
  if (mod === "canli" && !ayar.canli) return { atlandi: "Lojistik listesi canlı değil (Ayarlar > Rapor Alıcıları)." };
  if (mod === "canli" && !ayar.alicilar.length) return { atlandi: "Alıcı tanımlı değil." };
  const { satirlar } = await lojistikVeri(companyId, bugun);
  const test = mod !== "canli";
  const konu = lojistikKonusu(satirlar, bugun, test);
  if (mod === "deneme") {
    return { konu, html: lojistikMailHtml(satirlar, bugun, `${SITE}/siparis-formu-sec/ornek`, { test: true, alici: ayar.alicilar.join(", ") }), alici: ayar.alicilar };
  }
  if (!satirlar.length) return { atlandi: "Formu bekleyen yükleme yok; mail gönderilmedi.", konu };
  const to = test ? TEST_ALICISI : ayar.alicilar;
  if (!to.length) return { atlandi: "Test adresi tanımlı değil." };
  if (test) {
    const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
    const son = await oku<{ id: string }>(`siparis_formu_secimleri?select=id&company_id=eq.${companyId}&test=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
    if (son.length >= 5) return { atlandi: "Son 24 saatte en fazla 5 test listesi gönderilebilir." };
  }
  const token = yeniToken();
  const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_secimleri`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: companyId, token, tarih: bugun, test, alici: ayar.alicilar.join(",") || null, booking_sayisi: satirlar.length,
      gecerlilik: new Date(Date.now() + SECIM_GUN * 24 * 3600_000).toISOString() }),
  });
  if (k.status === 409) { await k.body?.cancel(); return { atlandi: "Bugünün listesi zaten gönderildi." }; }
  if (!k.ok) throw new Error(`siparis_formu_secimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
  const html = lojistikMailHtml(satirlar, bugun, `${SITE}/siparis-formu-sec/${token}`, { test, alici: ayar.alicilar.join(", ") });
  try {
    await mailGonder(to, test ? [] : ayar.cc, konu, html, [], "Hatırlatma");
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_secimleri?token=eq.${token}`, { method: "DELETE", headers: basliklar });
    throw e;
  }
  return { konu, alici: to, gonderildi: true, yukleme: satirlar.length };
}

/** Secim sayfasi islemleri (girissiz, token). */
async function lojistikIslem(govde: Record<string, unknown>, bugun: string): Promise<Response> {
  const token = typeof govde.token === "string" ? govde.token : "";
  const secim = await secimOku(token);
  if (!secim) return json({ ok: false, hata: "Bu bağlantı geçersiz ya da süresi doldu. Bir sonraki sabah maili yeni bağlantıyla gelir." }, 404);
  const sirket = secim.company_id;
  const ayar = await lojistikAyari(sirket);
  const test = secim.test || !ayar.canli;
  const formAyari = await raporAyari(SUPABASE_URL, basliklar, sirket, "siparis_formu", { canli: false, alicilar: [] });
  const isaretleyen = `lojistik (${(secim.alici || ayar.alicilar.join(",") || "secim sayfasi").slice(0, 100)})`;

  if (govde.islem === "lojistik_bilgi") {
    const { satirlar } = await lojistikVeri(sirket, bugun);
    const son = await oku<{ booking_no: string | null; durum: string; elle: boolean; alicilar: string | null; ozet: Record<string, unknown> | null; olusturma: string }>(
      `siparis_formu_gonderimleri?select=booking_no,durum,elle,alicilar,ozet,olusturma&company_id=eq.${sirket}&olusturma=gte.${encodeURIComponent(secim.olusturma)}&order=olusturma.desc&limit=50`);
    const islenen = son.filter((g) => typeof g.ozet?.secim === "string" && g.ozet.secim === secim.id)
      .map((g) => ({ booking: g.booking_no, durum: g.alicilar ? (g.durum === "test" ? "test" : "gonderildi") : "isaretlendi", zaman: g.olusturma }));
    return json({ ok: true, tarih: bugun, liste_tarihi: secim.tarih, test, satirlar, islenen,
      alicilar: test ? TEST_ALICISI : formAyari.alicilar, cc: test ? [] : formAyari.cc });
  }

  const bookingler = (Array.isArray(govde.bookingler) ? govde.bookingler : typeof govde.booking === "string" ? [govde.booking] : [])
    .filter((b): b is string => typeof b === "string").map((b) => b.replace(/\s/g, "").toUpperCase()).filter(Boolean);
  const tekil = Array.from(new Set(bookingler)).slice(0, 25);
  if (!tekil.length) return json({ ok: false, hata: "Yükleme seçilmedi." }, 400);
  const { formlar: liste, satirlar } = await lojistikVeri(sirket, bugun);
  const listede = new Set(satirlar.map((x) => x.anahtar));

  if (govde.islem === "lojistik_kapat") {
    if (test) return json({ ok: true, test: true, sonuclar: tekil.map((b) => ({ booking: b, atlandi: "Test modunda işaret kaydedilmez." })) });
    const sonuclar = [];
    for (const b of tekil) {
      const m = liste.find((x) => x.anahtar === b);
      if (!m || !listede.has(b)) { sonuclar.push({ booking: b, atlandi: "Listede değil (gönderilmiş ya da yüklemesi başlamış)." }); continue; }
      const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_formu_gonderimleri`, {
        method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ company_id: sirket, booking_anahtar: m.anahtar, booking_no: m.bookingNo, durum: "gonderildi", elle: false,
          ozet: { kapatildi: true, not: "Zaten gönderildi (elle) - lojistik seçim sayfasında işaretlendi.", isaretleyen, secim: secim.id } }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ booking: m.bookingNo, atlandi: "zaten gönderildi" }); continue; }
      if (!k.ok) throw new Error(`siparis_formu_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      await k.body?.cancel();
      sonuclar.push({ booking: m.bookingNo, isaretlendi: true });
    }
    return json({ ok: true, test: false, sonuclar });
  }

  if (govde.islem === "lojistik_gonder") {
    if (test && !TEST_ALICISI.length) return json({ ok: false, hata: "Test adresi tanımlı değil." }, 400);
    if (!test && (!formAyari.canli || !formAyari.alicilar.length)) return json({ ok: false, hata: "Sipariş formu canlı değil ya da alıcısı yok (Ayarlar > Rapor Alıcıları)." }, 400);
    if (test) {
      const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
      const son = await oku<{ id: string }>(`siparis_formu_gonderimleri?select=id&company_id=eq.${sirket}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
      if (son.length + tekil.length > 25) return json({ ok: false, hata: "Son 24 saatte en fazla 25 test formu gönderilebilir." }, 429);
    }
    const sirketAdi = await sirketAdiOku(sirket);
    const sonuclar = [];
    for (const b of tekil) {
      const m = liste.find((x) => x.anahtar === b);
      if (!m || !listede.has(b)) { sonuclar.push({ booking: b, atlandi: "Listede değil (gönderilmiş ya da yüklemesi başlamış)." }); continue; }
      try {
        const r = await gonder(sirket, sirketAdi, m, test ? TEST_ALICISI : formAyari.alicilar, test ? [] : formAyari.cc, test, true, isaretleyen, secim.id);
        sonuclar.push(r);
      } catch (e) {
        sonuclar.push({ booking: m.bookingNo, atlandi: e instanceof Error ? e.message.slice(0, 200) : "Gönderilemedi." });
      }
    }
    return json({ ok: true, test, sonuclar, alici: test ? TEST_ALICISI : [...formAyari.alicilar, ...formAyari.cc] });
  }
  return json({ ok: false, hata: "Bilinmeyen işlem." }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const govde = (await req.json().catch(() => ({}))) as {
      test?: boolean; gonder?: boolean; booking?: string; deneme?: boolean; islem?: string;
    };
    const bugun = trBugun();

    // 23.11.2026 lojistik secim sayfasi (girissiz, token)
    if (govde.islem === "lojistik_bilgi" || govde.islem === "lojistik_gonder" || govde.islem === "lojistik_kapat") {
      return await lojistikIslem(govde as Record<string, unknown>, bugun);
    }

    const kullanici = await yetkiliKullanici(req);
    const yetkiliSirket = kullanici?.sirket || null;

    // 23.11.2026 lojistik listesi: zamanlanmis (canli) / test (yalniz test adresi) / Rapor Alicilari onizle-test
    if (govde.islem === "lojistik_ozet") {
      const sirketler = yetkiliSirket ? [yetkiliSirket]
        : Array.from(new Set((await oku<{ company_id: string }>("rapor_alicilari?select=company_id&rapor=eq.siparis_formu_lojistik")).map((x) => x.company_id)));
      const gun = trSimdi().getUTCDay();
      if (govde.test !== true && (gun === 0 || gun === 6)) return json({ ok: true, haftasonu: true });
      const sonuclar = [];
      for (const s of sirketler) sonuclar.push(await lojistikOzet(s, bugun, govde.test === true ? "test" : "canli"));
      return json({ ok: true, sonuclar });
    }
    if (yetkiliSirket && (govde.deneme === true || (govde.test === true && !govde.booking))) {
      return json({ ok: true, sonuclar: [await lojistikOzet(yetkiliSirket, bugun, govde.deneme === true ? "deneme" : "test")] });
    }

    // Elle (sayfa yetkisi): tek booking; test -> test adresine, gonder -> canli alicilar + CC
    if (yetkiliSirket) {
      const canliIstek = govde.gonder === true;
      if ((govde.test !== true && !canliIstek) || !govde.booking) return json({ ok: false, hata: "Elle yalnızca bir booking için gönderim yapılabilir." }, 400);
      const anahtar = govde.booking.replace(/\s/g, "").toUpperCase();
      const liste = await formlar(yetkiliSirket, gunKaydir(bugun, -60), gunKaydir(bugun, 120));
      const m = liste.find((x) => x.anahtar === anahtar);
      if (!m) return json({ ok: false, hata: "Booking yükleme planında bulunamadı." }, 404);
      if (!m.gonderilebilir) return json({ ok: false, hata: `Form gönderilmez, eksik: ${m.girisEksikleri.join(", ")}.` }, 400);
      const sirket = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${yetkiliSirket}`);
      const sirketAdi = (sirket[0]?.company_name || "Unex Gıda").replace(/[<>"]/g, "").trim();
      if (canliIstek) {
        const ayar = await raporAyari(SUPABASE_URL, basliklar, yetkiliSirket, "siparis_formu", { canli: false, alicilar: [] });
        if (!ayar.canli) return json({ ok: false, hata: "Sipariş formu canlı modda değil (Ayarlar > Rapor Alıcıları). Test gönder kullanın." }, 400);
        if (m.gonderim?.zaman) return json({ ok: false, hata: "Bu booking'in formu üretime zaten gönderildi." }, 409);
        const sonuc = await gonder(yetkiliSirket, sirketAdi, m, ayar.alicilar, ayar.cc, false, true, kullanici?.eposta || "elle");
        if (!sonuc.gonderildi) return json({ ok: false, hata: sonuc.atlandi === "zaten gönderildi" ? "Bu booking'in formu üretime zaten gönderildi." : "Gönderilemedi." }, 409);
        return json({ ok: true, sonuc, alici: [...ayar.alicilar, ...ayar.cc] });
      }
      if (!TEST_ALICISI.length) return json({ ok: false, hata: "Test adresi tanımlı değil." }, 400);
      const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
      const son = await oku<{ id: string }>(`siparis_formu_gonderimleri?select=id&company_id=eq.${yetkiliSirket}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
      if (son.length >= 25) return json({ ok: false, hata: "Son 24 saatte en fazla 25 test formu gönderilebilir." }, 429);
      const sonuc = await gonder(yetkiliSirket, sirketAdi, m, TEST_ALICISI, [], true, true);
      return json({ ok: true, sonuc, alici: TEST_ALICISI });
    }
    if (govde.test === true || govde.gonder === true) return json({ ok: false, hata: "Gönderim için Siparişler sayfası yetkisi gerekli." }, 403);

    // 19.11.2026 (kullanici): "Siparis bildirim formu icin oto mail gonderimi olmasin. Gonder butonu ile gonderilebilsin."
    // Zamanlanmis tarama KAPALI (pg_cron 'siparis-formu' kaldirildi: migration 20261119120000); anon cagri hicbir sey gondermez.
    return json({ ok: true, tarih: bugun, otomatik: false, gonderilen: 0 });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparis-formu hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
