/**
 * Ic piyasa musteri / ekip mesaj sablonlari (12.10.2026).
 * Konum: supabase/functions/_shared (edge function ile Next AYNI dosyayi
 * kullanir; Next tarafi lib/ic-piyasa/mesaj-sablonlari.ts uzerinden alir).
 * Bu dosya import ICERMEZ (Deno + Next ortak).
 *
 * TEK KAYNAK: Ayni metin iki yerde kullanilir:
 *  1) Meta onayi gelene kadar: "Gonderilecek Bildirimler" kutusu metni
 *     duz yazi olarak hazirlar, yetkili telefonundan tek dokunusla gonderir
 *     (wa.me). Dugme olmadigi icin takip linki metnin sonuna eklenir.
 *  2) Meta onayindan sonra: WhatsApp Business Platform'a AYNI govde, Meta
 *     sablonu olarak gonderilir ({{1}}, {{2}} ... degiskenleri), "Siparisim"
 *     URL dugmesiyle.
 *
 * Meta kurallari (kontrol: sablonKurallariniDenetle):
 *  - Ad: kucuk harf, rakam, alt cizgi. Dil: tr. Govde <= 1024 karakter.
 *  - Govde degiskenle BASLAYAMAZ / BITEMEZ; iki degisken yan yana olamaz.
 *  - Alt bilgi <= 60 karakter, degisken icermez.
 *  - URL dugmesinde tek degisken, adresin SONUNDA.
 *  - "Bilgilendirme" (UTILITY) sablonlari reklam dili icermez; fiyat listesi
 *    gibi tanitim icerikleri "Pazarlama" (MARKETING) sayilir ve ucretlidir.
 *
 * Metin degisirse Meta'da sablon YENIDEN onaya gider. Burak Bey onayi
 * alinmadan degistirilmez.
 *
 * 22.10.2026 (kullanici karari): MUSTERI mesajlarinda BAGLANTI YOK (takip
 * linki ihracatasistanim.com alan adini gosteriyordu). "Aracınız yola çıktı"
 * mesajiyla irsaliye PDF'i paylasilir (Bildirimler > Paylaş). Marka: mesaji
 * gonderen numaranin profil fotografi Unex logosu; Meta'ya geciste sablon
 * basligi `meta_ust` (logo gorseli / irsaliye belgesi). Takip sayfasi ic
 * kullanim icin durur (is emri detayi).
 *
 * 22.10.2026: musteri mesajlarinin sonunda (alt bilgiden once) ILETISIM
 * satiri: "Sorularınız için lojistik sorumlumuz Süleyman Bey: 0553 268 91 01".
 * Ad / telefon Bildirimler > Ayarlar'daki lojistik sorumlusundan gelir
 * (`iletisim: true` olan sablonlar). Meta'ya geciste govdeye degisken olarak eklenir.
 */

export type SablonKategori = "UTILITY" | "MARKETING";
export type SablonAlici = "musteri" | "ekip";

export type MesajSablonu = {
  /** Meta sablon adi */
  ad: string;
  baslik: string;
  ne_zaman: string;
  alici: SablonAlici;
  kategori: SablonKategori;
  dil: "tr";
  /** Ust bilgi: duz metin ya da belge (PDF). Elle (wa.me) gonderimde kalin baslik olur. */
  ust?: { tur: "metin"; metin: string } | { tur: "belge"; aciklama: string };
  /** Meta sablonunun basligi (Meta'ya geciste): Unex logosu gorseli ya da irsaliye belgesi */
  meta_ust?: { tur: "gorsel"; aciklama: string } | { tur: "belge"; aciklama: string };
  /** Govde: {{1}}..{{n}} degiskenleri */
  govde: string;
  degiskenler: { no: number; ad: string; ornek: string }[];
  alt?: string;
  /** Sonuna lojistik iletisim satiri eklenir (musteri sorulari dogru kisiye gitsin) */
  iletisim?: true;
  dugme?: { tur: "url"; metin: string; adres: string; ornek_ek: string };
};

export const TAKIP_ADRESI = "https://ihracatasistanim.com/takip/";
const ALT_BILGI = "Unex Gıda San. ve Tic. Ltd. Şti.";

export const MESAJ_SABLONLARI: MesajSablonu[] = [
  {
    ad: "siparis_alindi",
    iletisim: true,
    baslik: "Siparişiniz alındı",
    ne_zaman: "İş emri açıldığında",
    alici: "musteri",
    kategori: "UTILITY",
    dil: "tr",
    ust: { tur: "metin", metin: "Siparişiniz alındı" },
    govde:
      "Sayın {{1}},\n\n" +
      "{{2}} numaralı siparişiniz alınmıştır.\n\n" +
      "Ürün: {{3}}\n" +
      "Miktar: {{4}}\n" +
      "Teslim: {{5}}\n\n" +
      "Yükleme ve sevkiyat aşamalarında size ayrıca bilgi vereceğiz.",
    degiskenler: [
      { no: 1, ad: "Müşteri ünvanı", ornek: "Erdoğanlar Un Gıda San. Tic. Ltd. Şti." },
      { no: 2, ad: "İş emri no", ornek: "IE-2026-0001" },
      { no: 3, ad: "Ürün ve ambalaj", ornek: "Kepek (Dökme)" },
      { no: 4, ad: "Miktar (ton veya araç)", ornek: "75 ton" },
      { no: 5, ad: "Teslim şekli", ornek: "Fabrika Teslim" },
    ],
    alt: ALT_BILGI,
    meta_ust: { tur: "gorsel", aciklama: "Unex logosu" },
  },
  {
    ad: "arac_cikis_saati",
    iletisim: true,
    baslik: "Araç çıkış saati",
    ne_zaman: "Lojistik çıkış için saat verdiğinde (isteğe bağlı)",
    alici: "musteri",
    kategori: "UTILITY",
    dil: "tr",
    govde:
      "Sayın {{1}},\n\n" +
      "{{2}} numaralı siparişinize ait {{3}} plakalı aracın bugün saat {{4}} civarında yola çıkması planlanmaktadır.\n\n" +
      "Araç yola çıktığında size ayrıca bilgi verilecektir.",
    degiskenler: [
      { no: 1, ad: "Müşteri ünvanı", ornek: "Erdoğanlar Un Gıda San. Tic. Ltd. Şti." },
      { no: 2, ad: "İş emri no", ornek: "IE-2026-0001" },
      { no: 3, ad: "Plaka", ornek: "59 AGD 271" },
      { no: 4, ad: "Planlanan saat", ornek: "15:30" },
    ],
    alt: ALT_BILGI,
    meta_ust: { tur: "gorsel", aciklama: "Unex logosu" },
  },
  {
    ad: "arac_yola_cikti",
    iletisim: true,
    baslik: "Aracınız yola çıktı",
    ne_zaman: "Lojistik çıkışı onayladığında (her araç için)",
    alici: "musteri",
    kategori: "UTILITY",
    dil: "tr",
    ust: { tur: "metin", metin: "Aracınız yola çıktı" },
    govde:
      "Sayın {{1}},\n\n" +
      "{{2}} numaralı siparişinize ait araç yola çıkmıştır.\n\n" +
      "Plaka: {{3}}\n" +
      "Ürün: {{4}}\n" +
      "Net miktar: {{5}}\n" +
      "İrsaliye no: {{6}}\n" +
      "Sevk durumu: {{7}}\n\n" +
      "Araca ait irsaliye bu mesajla birlikte gönderilmiştir.",
    degiskenler: [
      { no: 1, ad: "Müşteri ünvanı", ornek: "Erdoğanlar Un Gıda San. Tic. Ltd. Şti." },
      { no: 2, ad: "İş emri no", ornek: "IE-2026-0001" },
      { no: 3, ad: "Plaka (dorse)", ornek: "59 AGD 271 (Dorse: 34 ZPT 45)" },
      { no: 4, ad: "Ürün ve ambalaj", ornek: "Kepek (Dökme)" },
      { no: 5, ad: "Net kg", ornek: "26.220 kg" },
      { no: 6, ad: "İrsaliye no", ornek: "IRS2026000002468" },
      { no: 7, ad: "İlerleme", ornek: "26.220 / 75.000 kg (1. araç)" },
    ],
    alt: ALT_BILGI,
    meta_ust: { tur: "belge", aciklama: "İrsaliye PDF'i" },
  },
  {
    ad: "siparis_tamamlandi",
    iletisim: true,
    baslik: "Siparişiniz tamamlandı",
    ne_zaman: "İş emri tamamlandı olarak kapatıldığında",
    alici: "musteri",
    kategori: "UTILITY",
    dil: "tr",
    ust: { tur: "metin", metin: "Siparişiniz tamamlandı" },
    govde:
      "Sayın {{1}},\n\n" +
      "{{2}} numaralı siparişinizin sevkiyatı tamamlanmıştır.\n\n" +
      "Ürün: {{3}}\n" +
      "Toplam: {{4}} araç, {{5}}\n\n" +
      "Bizi tercih ettiğiniz için teşekkür ederiz.",
    degiskenler: [
      { no: 1, ad: "Müşteri ünvanı", ornek: "Erdoğanlar Un Gıda San. Tic. Ltd. Şti." },
      { no: 2, ad: "İş emri no", ornek: "IE-2026-0001" },
      { no: 3, ad: "Ürün ve ambalaj", ornek: "Kepek (Dökme)" },
      { no: 4, ad: "Araç sayısı", ornek: "3" },
      { no: 5, ad: "Toplam net kg", ornek: "76.940 kg" },
    ],
    alt: ALT_BILGI,
    meta_ust: { tur: "gorsel", aciklama: "Unex logosu" },
  },
  {
    ad: "haftalik_fiyat_formu",
    baslik: "Haftalık fiyat bilgilendirme formu",
    ne_zaman: "Pazartesi, fiyat listesine dahil müşterilere",
    alici: "musteri",
    kategori: "MARKETING",
    dil: "tr",
    ust: { tur: "belge", aciklama: "FBF PDF'i (ör. FBF-2026-0001_Fiyat_Bilgilendirme_Formu.pdf)" },
    govde:
      "Sayın {{1}},\n\n" +
      "Güncel yan mamul fiyat bilgilendirme formumuz ({{2}}) ektedir. Fiyatlar {{3}} tarihine kadar geçerlidir.\n\n" +
      "Sipariş ve bilgi için Burak Tuncay ile 0541 339 60 04 numarasından iletişime geçebilirsiniz.",
    degiskenler: [
      { no: 1, ad: "Müşteri ünvanı", ornek: "Erdoğanlar Un Gıda San. Tic. Ltd. Şti." },
      { no: 2, ad: "Form no", ornek: "FBF-2026-0001" },
      { no: 3, ad: "Son geçerlilik", ornek: "15.10.2026" },
    ],
    alt: ALT_BILGI,
  },
  {
    ad: "cikis_onayi_talebi",
    baslik: "Çıkış onayı talebi (Süleyman Bey)",
    ne_zaman: "Kantar irsaliyeyi onayladığında, lojistik sorumlusuna",
    alici: "ekip",
    kategori: "UTILITY",
    dil: "tr",
    govde:
      "Araç yüklendi: {{1}}\n\n" +
      "Sipariş: {{2}}\n" +
      "Ürün: {{3}}\n" +
      "Net miktar: {{4}}\n\n" +
      "Aracın çıkış durumunu bildirmek için aşağıdaki bağlantıya dokunun: şimdi çıkıyor, saat seç ya da bugün çıkmayacak.",
    degiskenler: [
      { no: 1, ad: "Plaka", ornek: "59 AGD 271" },
      { no: 2, ad: "İş emri no ve müşteri", ornek: "IE-2026-0001 · Erdoğanlar Un" },
      { no: 3, ad: "Ürün ve ambalaj", ornek: "Kepek (Dökme)" },
      { no: 4, ad: "Net kg", ornek: "26.220 kg" },
    ],
    alt: "Unex Gıda · İç Piyasa",
    dugme: { tur: "url", metin: "Çıkışı bildir", adres: "https://ihracatasistanim.com/cikis/{{1}}", ornek_ek: "e5f6g7h8" },
  },
];

export function sablonBul(ad: string): MesajSablonu | undefined {
  return MESAJ_SABLONLARI.find((s) => s.ad === ad);
}

/** {{n}} yerlerini doldurur. Eksik deger varsa hata firlatir (yarim mesaj gitmesin). */
export function govdeDoldur(sablon: MesajSablonu, degerler: string[]): string {
  return sablon.govde.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const d = degerler[Number(n) - 1];
    if (d === undefined || d === null || String(d).trim() === "") {
      throw new Error(`${sablon.ad}: {{${n}}} (${sablon.degiskenler[Number(n) - 1]?.ad || "?"}) boş.`);
    }
    return String(d).replace(/\s*\n\s*/g, " ").trim();
  });
}

/**
 * Meta onayi gelene kadar elle (wa.me) gonderilecek duz metin:
 * ust baslik kalin (*...*), govde, takip linki, alt bilgi.
 */
/** "Sorularınız için lojistik sorumlumuz Süleyman Bey: 0553 268 91 01" (ad ya da telefon yoksa null) */
export function iletisimSatiri(i?: { ad?: string | null; telefon?: string | null } | null): string | null {
  const ad = (i?.ad || "").trim();
  const tel = (i?.telefon || "").trim();
  if (!ad || !tel) return null;
  return `Sorularınız için lojistik sorumlumuz ${ad}: ${tel}`;
}

export function elleGonderimMetni(sablon: MesajSablonu, degerler: string[], dugmeEki?: string, iletisim?: { ad?: string | null; telefon?: string | null } | null): string {
  const parcalar: string[] = [];
  if (sablon.ust?.tur === "metin") parcalar.push(`*${sablon.ust.metin}*`);
  parcalar.push(govdeDoldur(sablon, degerler));
  if (sablon.dugme && dugmeEki) parcalar.push(`${sablon.dugme.metin}: ${sablon.dugme.adres.replace("{{1}}", dugmeEki)}`);
  const il = sablon.iletisim ? iletisimSatiri(iletisim) : null;
  if (il) parcalar.push(il);
  if (sablon.alt) parcalar.push(`_${sablon.alt}_`);
  return parcalar.join("\n\n");
}

/** Meta kurallarina uygunluk denetimi; sorun listesi doner (bos = uygun). */
export function sablonKurallariniDenetle(s: MesajSablonu): string[] {
  const sorun: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(s.ad)) sorun.push("ad: sadece küçük harf, rakam, alt çizgi");
  if (s.govde.length > 1024) sorun.push(`gövde ${s.govde.length} > 1024 karakter`);
  const g = s.govde.trim();
  if (/^\{\{\d+\}\}/.test(g)) sorun.push("gövde değişkenle başlıyor");
  if (/\{\{\d+\}\}[.!?:,]?$/.test(g)) sorun.push("gövde değişkenle bitiyor");
  if (/\}\}\s*\{\{/.test(g)) sorun.push("iki değişken yan yana");
  const nolar = Array.from(g.matchAll(/\{\{(\d+)\}\}/g)).map((m) => Number(m[1]));
  const benzersiz = Array.from(new Set(nolar)).sort((a, b) => a - b);
  benzersiz.forEach((n, i) => { if (n !== i + 1) sorun.push(`değişkenler sıralı değil ({{${n}}})`); });
  if (benzersiz.length !== s.degiskenler.length) sorun.push("değişken sayısı ile tanım uyuşmuyor");
  if (s.ust?.tur === "metin" && (s.ust.metin.length > 60 || /\{\{/.test(s.ust.metin))) sorun.push("üst bilgi > 60 karakter veya değişkenli");
  if (s.alt && (s.alt.length > 60 || /\{\{/.test(s.alt))) sorun.push("alt bilgi > 60 karakter veya değişkenli");
  if (s.dugme) {
    if (s.dugme.metin.length > 25) sorun.push("düğme metni > 25 karakter");
    if (!/^https:\/\/[^{}]+\{\{1\}\}$/.test(s.dugme.adres)) sorun.push("URL düğmesi: tek değişken, adresin sonunda olmalı");
  }
  return sorun;
}

/**
 * Bildirim kutusundaki her sablonun ekran etiketi (ic_bildirimler.sablon).
 * cikis_hatirlatma / cikis_cevap_yok / cikis_bugun_degil: sadece SIRKET ICI
 * e-posta (Meta sablonu degil), metni edge function'da (ic-piyasa) uretilir.
 */
export const BILDIRIM_ETIKET: Record<string, string> = {
  siparis_alindi: "Siparişiniz alındı",
  arac_cikis_saati: "Araç çıkış saati",
  arac_yola_cikti: "Aracınız yola çıktı",
  siparis_tamamlandi: "Siparişiniz tamamlandı",
  haftalik_fiyat_formu: "Haftalık fiyat formu",
  cikis_onayi_talebi: "Çıkış onayı talebi",
  cikis_hatirlatma: "Çıkış hatırlatması",
  cikis_cevap_yok: "Çıkış cevabı gelmedi",
  cikis_bugun_degil: "Araç bugün çıkmayacak",
  siparis_kapanis: "Sipariş kapanış raporu",
};

// ---------------------------------------------------------------------------
// SIPARIS KAPANIS RAPORU / KALAN-EKSIK-FAZLA (30.10.2026) - TEK HESAP YERI.
// Kullanici: "Bazi durumlarda eksik veya az kapanabilme durumu oluyor. Kalan
// veya fazla giden takibi yapilabilmeli." Is Emirleri listesi, Kantar Paneli
// ve kapanis e-postasi (edge function ic-piyasa) AYNI fonksiyonu kullanir.
// Tolerans: tonaj hedefinde hedefin +-%1'i "tam"; arac hedefinde sayi esit.
// ---------------------------------------------------------------------------

export const KAPANIS_TOLERANS_ORAN = 0.01;

export type TeslimFarki = {
  sonuc: "tam" | "eksik" | "fazla";
  /** Gerceklesen - hedef (kg ya da arac). Eksikte negatif. */
  fark: number;
  /** |fark| / hedef (hedef yoksa null) */
  oran: number | null;
  /** Ekran metni: "Eksik 12,5 ton (%4)", "Fazla 1 araç", "Tam" */
  metin: string;
  /** Kalan (eksikte |fark|, digerlerinde 0) */
  kalan: number;
};

const sayiTR = (n: number, en = 3) => n.toLocaleString("tr-TR", { maximumFractionDigits: en });
const tonMetni = (kg: number) => `${sayiTR(kg / 1000)} ton`;

/** Hedef ile gerceklesen arasindaki fark (tonaj: kg; arac: adet). */
export function teslimFarki(hedefTur: "kg" | "arac", hedef: number | null | undefined, gerceklesenKg: number, aracSayisi: number): TeslimFarki {
  const h = Number(hedef || 0);
  if (hedefTur === "arac") {
    const fark = aracSayisi - h;
    const sonuc = fark === 0 ? "tam" : fark < 0 ? "eksik" : "fazla";
    return { sonuc, fark, oran: h > 0 ? Math.abs(fark) / h : null, kalan: Math.max(0, -fark), metin: sonuc === "tam" ? "Tam" : `${sonuc === "eksik" ? "Eksik" : "Fazla"} ${Math.abs(fark)} araç` };
  }
  const fark = Math.round((Number(gerceklesenKg) - h) * 100) / 100;
  const oran = h > 0 ? Math.abs(fark) / h : null;
  const tam = h > 0 ? Math.abs(fark) <= h * KAPANIS_TOLERANS_ORAN : fark === 0;
  const sonuc = tam ? "tam" : fark < 0 ? "eksik" : "fazla";
  const yuzde = oran !== null ? ` (%${sayiTR(oran * 100, 1)})` : "";
  return { sonuc, fark, oran, kalan: Math.max(0, -fark), metin: sonuc === "tam" ? "Tam" : `${sonuc === "eksik" ? "Eksik" : "Fazla"} ${tonMetni(Math.abs(fark))}${yuzde}` };
}

/** Acik siparis icin kalan / fazla metni: "Kalan 35,96 ton", "Fazla 0,5 ton", "Kalan 2 araç", "Tamamlandı". */
export function kalanMetni(hedefTur: "kg" | "arac", hedef: number | null | undefined, gerceklesenKg: number, aracSayisi: number): { metin: string; durum: "kalan" | "fazla" | "tamam" } {
  const h = Number(hedef || 0);
  if (hedefTur === "arac") {
    const k = h - aracSayisi;
    if (k > 0) return { metin: `Kalan ${k} araç`, durum: "kalan" };
    if (k < 0) return { metin: `Fazla ${-k} araç`, durum: "fazla" };
    return { metin: "Hedef tamam", durum: "tamam" };
  }
  const k = Math.round((h - Number(gerceklesenKg)) * 100) / 100;
  if (k > 0) return { metin: `Kalan ${tonMetni(k)}`, durum: "kalan" };
  if (k < 0) return { metin: `Fazla ${tonMetni(-k)}`, durum: "fazla" };
  return { metin: "Hedef tamam", durum: "tamam" };
}

export type KapanisOzeti = {
  isEmriNo: string; musteri: string; urun: string;
  hedefTur: "kg" | "arac"; hedef: number; gerceklesenKg: number; aracSayisi: number;
  kapatan: string; kapanis: string; siparisTarihi: string;
  fark: TeslimFarki;
  /** E-posta / ekran satirlari (sira sabit) */
  satirlar: [string, string][];
};

/** ic_bildirimler.degerler (sablon "siparis_kapanis", migration 20261030180000) -> ozet. */
export function kapanisOzeti(degerler: unknown[]): KapanisOzeti {
  const d = (i: number) => String(degerler?.[i] ?? "").trim();
  const hedefTur = d(3) === "arac" ? "arac" : "kg";
  const hedef = Number(d(4)) || 0;
  const gerceklesenKg = Number(d(5)) || 0;
  const aracSayisi = Number(d(6)) || 0;
  const fark = teslimFarki(hedefTur, hedef, gerceklesenKg, aracSayisi);
  const kapanisTarih = d(8) ? new Date(d(8)) : null;
  const kapanis = kapanisTarih && !Number.isNaN(kapanisTarih.getTime())
    ? kapanisTarih.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const siparisTarihi = /^\d{4}-\d{2}-\d{2}$/.test(d(9)) ? d(9).split("-").reverse().join(".") : "";
  const kgMetni = (kg: number) => `${sayiTR(kg, 2)} kg`;
  const satirlar: [string, string][] = [
    ["Sipariş", `${d(0)} · ${d(1)}`],
    ["Ürün", d(2)],
    ...(siparisTarihi ? [["Sipariş tarihi", siparisTarihi] as [string, string]] : []),
    ["Hedef", hedefTur === "kg" ? `${tonMetni(hedef)} (${kgMetni(hedef)})` : `${hedef} araç`],
    ["Gerçekleşen", `${kgMetni(gerceklesenKg)} · ${aracSayisi} araç`],
    ["Sonuç", fark.metin],
    ...(kapanis ? [["Kapanış", `${kapanis}${d(7) ? ` · ${d(7)}` : ""}`] as [string, string]] : []),
  ];
  return { isEmriNo: d(0), musteri: d(1), urun: d(2), hedefTur, hedef, gerceklesenKg, aracSayisi, kapatan: d(7), kapanis, siparisTarihi, fark, satirlar };
}

/** Kapanis raporu e-posta konusu: "Sipariş kapandı: IE-2026-0007 · ARTI GRUP · Eksik 35,96 ton (%12)" */
export function kapanisKonusu(o: KapanisOzeti): string {
  return `Sipariş kapandı: ${o.isEmriNo} · ${o.musteri} · ${o.fark.metin}`;
}

/** Musteri takip ve lojistik cikis sayfalarinin adresleri. */
export const SITE_ADRESI = "https://ihracatasistanim.com";
export const takipAdresi = (token: string) => `${SITE_ADRESI}/takip/${token}`;
export const cikisAdresi = (token: string) => `${SITE_ADRESI}/cikis/${token}`;

// ---------------------------------------------------------------------------
// MUSTERI E-POSTASI (23.10.2026) - WhatsApp'i olmayan musteriye ayni metin
// e-postayla gider (otomatik: edge function ic-piyasa / elle: Outlook mailto).
// Govde WhatsApp sablonundan (govdeDoldur) uretilir: TEK KAYNAK. Baglanti YOK
// (22.10.2026 karari), gorsel YOK (logo adresi yabanci alan adi gosterirdi).
// "Araciniz yola cikti" e-postasinda irsaliye PDF'i EK olarak gider.
// ---------------------------------------------------------------------------

type Iletisim = { ad?: string | null; telefon?: string | null } | null | undefined;

/** E-posta konusu (gelen kutusunda aranabilir: is emri no + ozet). */
export function musteriEpostaKonusu(sablon: MesajSablonu, degerler: string[]): string {
  const d = (i: number) => String(degerler[i] ?? "").replace(/\s+/g, " ").trim();
  switch (sablon.ad) {
    case "siparis_alindi": return `Siparişiniz alındı · ${d(1)} · ${d(2)}`;
    case "arac_cikis_saati": return `Araç çıkış saati · ${d(1)} · ${d(2)}`;
    case "arac_yola_cikti": return `Aracınız yola çıktı · ${d(1)} · ${d(2)}${d(5) && d(5) !== "-" ? ` · İrsaliye ${d(5)}` : ""}`;
    case "siparis_tamamlandi": return `Siparişiniz tamamlandı · ${d(1)} · ${d(2)}`;
    default: return `${sablon.baslik} · Unex Gıda`;
  }
}

const IMZA = "Saygılarımızla,\nUnex Gıda San. ve Tic. Ltd. Şti.";

/** Duz metin govde (Outlook mailto ve e-postanin text/plain kismi). */
export function musteriEpostaMetni(sablon: MesajSablonu, degerler: string[], iletisim?: Iletisim): string {
  const parcalar = [govdeDoldur(sablon, degerler)];
  const il = sablon.iletisim ? iletisimSatiri(iletisim) : null;
  if (il) parcalar.push(il);
  parcalar.push(IMZA);
  return parcalar.join("\n\n");
}

const htmlKacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Kurumsal (B2B) HTML govde: lacivert ust serit + seftali cizgi, baslik, govde
 * paragraflari; "Etiket: deger" satirlari iki sutunlu bilgi tablosu olur.
 * Tablo tabanli + satir ici stil (Outlook uyumu), dis kaynak / gorsel YOK.
 */
export function musteriEpostaHtml(sablon: MesajSablonu, degerler: string[], iletisim?: Iletisim, ekNotu?: string | null): string {
  const govde = govdeDoldur(sablon, degerler);
  const bloklar = govde.split(/\n{2,}/).map((blok) => {
    const satirlar = blok.split("\n").map((x) => x.trim()).filter(Boolean);
    const tablo = satirlar.length > 0 && satirlar.every((x) => /^[^:]{2,30}:\s+\S/.test(x));
    if (tablo) {
      const tr = satirlar.map((x) => {
        const i = x.indexOf(":");
        return `<tr><td style="padding:7px 18px 7px 0;color:#6B7290;font-size:14px;white-space:nowrap;vertical-align:top;">${htmlKacis(x.slice(0, i))}</td><td style="padding:7px 0;color:#1B2352;font-size:15px;font-weight:600;">${htmlKacis(x.slice(i + 1).trim())}</td></tr>`;
      }).join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-top:1px solid #E6E8F0;border-bottom:1px solid #E6E8F0;width:100%;">${tr}</table>`;
    }
    return `<p style="margin:0 0 16px;color:#1B2352;font-size:15px;line-height:1.6;">${satirlar.map(htmlKacis).join("<br>")}</p>`;
  }).join("");
  const il = sablon.iletisim ? iletisimSatiri(iletisim) : null;
  const ek = ekNotu ? `<p style="margin:0 0 16px;padding:10px 14px;background:#F4F6FB;border-left:3px solid #283474;color:#1B2352;font-size:13px;">${htmlKacis(ekNotu)}</p>` : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${htmlKacis(sablon.baslik)}</title></head>
<body style="margin:0;background:#F3F4F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E6E8F0;">
<tr><td style="background:#1B2352;padding:20px 28px;border-bottom:4px solid #F4A07C;">
<p style="margin:0;color:#F4A07C;font-size:12px;letter-spacing:3px;font-weight:700;">UNEX GIDA</p>
<p style="margin:6px 0 0;color:#FFFFFF;font-size:21px;font-weight:700;">${htmlKacis(sablon.baslik)}</p>
</td></tr>
<tr><td style="padding:26px 28px 8px;">${bloklar}${ek}
${il ? `<p style="margin:0 0 16px;color:#1B2352;font-size:14px;">${htmlKacis(il)}</p>` : ""}
<p style="margin:8px 0 0;color:#1B2352;font-size:14px;line-height:1.6;">Saygılarımızla,<br><strong>Unex Gıda San. ve Tic. Ltd. Şti.</strong></p>
</td></tr>
<tr><td style="padding:18px 28px 22px;"><p style="margin:0;padding-top:14px;border-top:1px solid #E6E8F0;color:#8B91A8;font-size:12px;line-height:1.5;">Bu e-posta sipariş süreciniz hakkında bilgilendirme amacıyla gönderilmiştir. Yanıtlarınız lojistik ekibimize iletilir.</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** Musteri e-postasi olarak gidebilen sablonlar. */
export const MUSTERI_EPOSTA_SABLONLARI = ["siparis_alindi", "arac_cikis_saati", "arac_yola_cikti", "siparis_tamamlandi"] as const;
