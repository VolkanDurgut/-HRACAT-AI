#!/usr/bin/env node
// ============================================================================
// YEDEKTEN GERI YUKLEME (felaket kurtarma) — docs/felaket-kurtarma.md adim 5
// ============================================================================
// Gece yedek mailindeki JSON dosyasini (ihracat-ai-yedek-GG-AA-YYYY.json)
// YENI ve BOS bir Supabase projesine geri yukler.
//
// Kullanim (bilgisayarinizda, proje klasorunde):
//   HEDEF_SUPABASE_URL=https://<yeni-ref>.supabase.co \
//   HEDEF_SERVICE_ROLE_KEY=<yeni projenin service_role anahtari> \
//   node scripts/yedekten-geri-yukle.mjs <yedek.json>            -> sadece plan (hicbir sey yazmaz)
//   node scripts/yedekten-geri-yukle.mjs <yedek.json> --onayla   -> gercekten yukler
//
// GUVENLIK KILITLERI:
//   * Canli proje (tnzbihsfbhqzkcliicdk) hedef olarak REDDEDILIR.
//   * Hedefte ihracat dosyasi / konteyner varsa REDDEDILIR (dolu veritabaninin
//     uzerine yazilmaz).
//   * --onayla verilmeden hicbir sey yazilmaz.
//
// Sira: (1) giris kullanicilari AYNI kimlikle olusturulur (gecici sifreyle;
// sifreler yedekte YOK), (2) handle_new_user tetikleyicisinin bu kullanicilar
// icin actigi bos sirket/rol/yetki kayitlari temizlenir, (3) tablolar bag
// sirasina gore yuklenir, (4) geri yukleme sirasinda olusan denetim kayitlari
// temizlenir, (5) sonuc veritabanindaki yedek_geri_yukleme_testi() ile
// dogrulanir. PDF dosyalari yedekte YOKTUR (bkz. kilavuz).
//
// 05.10.2026: yerel prova (Postgres 17 + PostgREST, gercek yedek formati) ile
// uctan uca test edildi.
// ============================================================================
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const CANLI_REF = "tnzbihsfbhqzkcliicdk";
// Bag (yabanci anahtar) sirasi: once ebeveynler.
const TABLO_SIRASI = [
  "companies",
  "ana_siparisler",
  "acenteler",
  "plakalar",
  "banka_presetleri",
  "fumigation_ayarlari",
  "kalite_sertifikasi_ayarlari",
  "ihracat_dosyalari",
  "sevkiyatlar",
  "rezervasyonlar",
  "konteynerler",
  "dosya_evraklari",
  "acente_teklifleri",
  "kullanici_rolleri",
  "kullanici_yetkileri",
  "destek_mesajlari",
  "geri_bildirimler",
  "ai_usage_logs",
  "denetim_kayitlari",
];
const PARCA = 500;

function dur(mesaj) {
  console.error(`\n✖ ${mesaj}\n`);
  process.exit(1);
}

const [dosyaYolu, ...bayraklar] = process.argv.slice(2);
const onayli = bayraklar.includes("--onayla");
const URL_ = (process.env.HEDEF_SUPABASE_URL || "").replace(/\/+$/, "");
const ANAHTAR = process.env.HEDEF_SERVICE_ROLE_KEY || "";
if (!dosyaYolu) dur("Kullanim: node scripts/yedekten-geri-yukle.mjs <yedek.json> [--onayla]");
if (!URL_ || !ANAHTAR) dur("HEDEF_SUPABASE_URL ve HEDEF_SERVICE_ROLE_KEY ortam degiskenleri gerekli.");
if (URL_.includes(CANLI_REF)) dur("Hedef CANLI proje! Geri yukleme sadece YENI ve BOS bir projeye yapilir.");

const basliklar = { apikey: ANAHTAR, Authorization: `Bearer ${ANAHTAR}`, "Content-Type": "application/json" };

async function istek(yol, secenek = {}) {
  const res = await fetch(`${URL_}${yol}`, { ...secenek, headers: { ...basliklar, ...(secenek.headers || {}) } });
  const metin = await res.text();
  if (!res.ok) throw new Error(`${secenek.method || "GET"} ${yol.split("?")[0]} -> HTTP ${res.status}: ${metin.slice(0, 300)}`);
  return { res, veri: metin ? JSON.parse(metin) : null };
}

async function satirSayisi(tablo) {
  const { res } = await istek(`/rest/v1/${tablo}?select=id&limit=1`, { headers: { Prefer: "count=exact" } });
  const aralik = res.headers.get("content-range") || "*/0";
  return Number(aralik.split("/")[1] || 0);
}

const paket = JSON.parse(readFileSync(dosyaYolu, "utf8"));
const bilgi = paket._bilgi || {};
const kullanicilar = Array.isArray(paket._kullanicilar) ? paket._kullanicilar : [];
console.log(`Yedek: ${dosyaYolu}`);
console.log(`  olusturulma: ${bilgi.olusturulma || "?"}, surum: ${bilgi.surum ?? "?"}`);
if ((bilgi.uyarilar || []).length) console.log(`  ⚠ yedekteki uyarilar: ${bilgi.uyarilar.join(" | ")}`);
if (!kullanicilar.length) console.log("  ⚠ yedekte kullanici listesi yok (surum < 3): kullanicilari elle, AYNI kimlikle olusturun.");

const plan = TABLO_SIRASI.filter((t) => Array.isArray(paket[t])).map((t) => ({ tablo: t, adet: paket[t].length }));
const eksik = TABLO_SIRASI.filter((t) => !Array.isArray(paket[t]));
console.log(`\nHedef: ${URL_}`);
console.log(`Plan: ${kullanicilar.length} kullanici, ${plan.reduce((s, p) => s + p.adet, 0)} satir`);
for (const p of plan) console.log(`  ${p.tablo.padEnd(28)} ${p.adet}`);
if (eksik.length) console.log(`  (yedekte olmayan tablolar: ${eksik.join(", ")})`);

// Kilit: hedef bos olmali
const doluluk = { ihracat_dosyalari: await satirSayisi("ihracat_dosyalari"), konteynerler: await satirSayisi("konteynerler") };
if (doluluk.ihracat_dosyalari > 0 || doluluk.konteynerler > 0) {
  dur(`Hedef BOS degil (ihracat_dosyalari=${doluluk.ihracat_dosyalari}, konteynerler=${doluluk.konteynerler}). Dolu veritabaninin uzerine yazilmaz.`);
}
if (!onayli) {
  console.log("\nSadece plan gosterildi; hicbir sey yazilmadi. Yuklemek icin komutun sonuna --onayla ekleyin.");
  process.exit(0);
}

// Geri yukleme baslangic ani (adim 4'te SADECE bundan sonra olusan denetim
// kayitlari silinir). Sunucu ve bilgisayar saatinin ERKEN olani alinir, 60 sn
// pay birakilir; yedekteki denetim kayitlari yedek aninda / oncesinde
// olustugu icin her zaman bu andan eskidir.
const { res: saatRes } = await istek(`/rest/v1/companies?select=id&limit=1`);
const sunucuMs = Date.parse(saatRes.headers.get("date") || "");
const baslangic = new Date(Math.min(Number.isFinite(sunucuMs) ? sunucuMs : Date.now(), Date.now()) - 60000).toISOString();
const yedekAni = Date.parse(bilgi.olusturulma || "");
if (Number.isFinite(yedekAni) && yedekAni >= Date.parse(baslangic)) {
  dur("Yedek ani, geri yukleme baslangicindan yeni gorunuyor (saat sorunu). Denetim temizligi guvenli degil; durduruldu.");
}

// (1) Kullanicilar - AYNI kimlikle, gecici sifreyle
const geciciSifreler = [];
for (const k of kullanicilar) {
  const sifre = randomBytes(12).toString("base64url");
  try {
    await istek(`/auth/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify({ id: k.id, email: k.email, password: sifre, email_confirm: true }),
    });
    geciciSifreler.push({ email: k.email, sifre });
  } catch (e) {
    if (String(e.message).includes("HTTP 422")) console.log(`  kullanici zaten var: ${k.email}`);
    else throw e;
  }
}
console.log(`\n(1) ${geciciSifreler.length} kullanici olusturuldu.`);

// (2) Tetikleyicinin actigi bos sirket / rol / yetki kayitlarini temizle
const yedekSirketler = new Set((paket.companies || []).map((c) => c.id));
for (const k of kullanicilar) {
  await istek(`/rest/v1/kullanici_yetkileri?user_id=eq.${k.id}`, { method: "DELETE" });
  await istek(`/rest/v1/kullanici_rolleri?user_id=eq.${k.id}`, { method: "DELETE" });
}
const { veri: mevcutSirketler } = await istek(`/rest/v1/companies?select=id`);
for (const c of mevcutSirketler || []) {
  if (!yedekSirketler.has(c.id)) await istek(`/rest/v1/companies?id=eq.${c.id}`, { method: "DELETE" });
}
console.log("(2) Tetikleyicinin actigi gecici sirket/rol/yetki kayitlari temizlendi.");

// (3) Tablolar
for (const { tablo } of plan) {
  const satirlar = paket[tablo];
  for (let i = 0; i < satirlar.length; i += PARCA) {
    await istek(`/rest/v1/${tablo}`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(satirlar.slice(i, i + PARCA)),
    });
  }
  console.log(`(3) ${tablo.padEnd(28)} ${satirlar.length} satir yuklendi`);
}

// (4) Geri yukleme sirasinda tetikleyicilerin yazdigi denetim kayitlari
await istek(`/rest/v1/denetim_kayitlari?olusturma_tarihi=gte.${encodeURIComponent(baslangic)}`, { method: "DELETE" });
console.log("(4) Geri yuklemenin kendi olusturdugu denetim kayitlari temizlendi.");

// (5) Dogrulama: sayilar + veritabaninin kendi geri yukleme testi
let sorun = 0;
for (const { tablo, adet } of plan) {
  const hedefAdet = await satirSayisi(tablo);
  if (hedefAdet !== adet) {
    sorun++;
    console.log(`  ✖ ${tablo}: yedekte ${adet}, hedefte ${hedefAdet}`);
  }
}
const { veri: test } = await istek(`/rest/v1/rpc/yedek_geri_yukleme_testi`, { method: "POST", body: JSON.stringify({ paket }) });
console.log(`(5) Dogrulama: ${test.birebir}/${test.tablo_sayisi} tablo birebir, kirik bag: ${test.bag_sorunlari.length}, sayi farki: ${sorun}`);
if (test.birebir !== test.tablo_sayisi || test.bag_sorunlari.length || sorun) {
  console.log(JSON.stringify(test.tablolar.filter((t) => t.durum !== "birebir"), null, 2));
  dur("Dogrulama BASARISIZ - yukaridaki tablolari inceleyin.");
}

// Dosya numarasi sayaci
const enBuyuk = Math.max(0, ...(paket.ihracat_dosyalari || []).map((d) => Number(String(d.dosya_no || "").split("-").pop()) || 0));
console.log("\n✔ Veri geri yukleme TAMAM.\n");
console.log("SIRADAKI ADIMLAR (docs/felaket-kurtarma.md):");
console.log(`  * SQL Editor'de dosya no sayacini ayarlayin:  select setval('public.ihracat_dosya_sira', ${enBuyuk});`);
console.log("  * Gecici sifreleri kullanicilara guvenli yoldan iletin; ilk giriste degistirsinler:");
for (const s of geciciSifreler) console.log(`      ${s.email}  ${s.sifre}`);
