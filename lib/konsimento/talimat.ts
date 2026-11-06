// ============================================================================
// KONSIMENTO TALIMATI - sistem verisinden talimat modeli (06.11.2026)
// ============================================================================
// Kullanici: "Konsimento talimatlari sistemdeki bilgiler ile dogru bir sekilde olusturulabilecek.
// Otomatik olusturulacak." SAF modul (React / Supabase yok): ayni model hem PDF'i
// (lib/konsimento/talimat-pdf.ts) hem yuklenen talimatin kontrolunu (lib/konsimento/kontrol.ts) besler.
// Bicimler kullanicinin ornek formlarindan alindi (DRAFT/MAERSK standart form, AKKON formu):
//   Standart: gemi "ORNEK GEMI 645W", yukleme "ISTANBUL-MARPORT", tahliye "TEMA",
//             toplamlar "5.000,00 / 250.000,00 / 250.500,00", konteyner satiri "20 DC", kg tam sayi.
//   Akkon   : gemi "M/V ... / SEG0426W", yukleme "MARPORT - AMBARLI", mal tanimi TR + EN,
//             KAP ADEDI VE CINSI, BRUT AGIRLIK, navlun PREPAID ( X ), konsimento adedi 3/3.
// Sistemde OLMAYAN bilgiler (consignee, notify, "ON BEHALF OF", mal tanimi duzeltmesi, BL tipi)
// dosyada saklanir: dosya.consignee, ham_veri.notify, ham_veri.konsimento_talimati (TalimatAyari);
// yeni proforma ayni musterinin bir onceki sevkiyatindan doldurulur (migration
// 20261106160000_konsimento_taraf_hafizasi).
// ============================================================================

import { ambalajTurkce, navlunAliciyaAitMi } from "@/supabase/functions/_shared/ihracat-ortak";
import { konsimentoSablonuBul, type KonsimentoSablonu } from "@/supabase/functions/_shared/konsimento-sablon";

export const UNEX_SHIPPER_STANDART = [
  "UNEX GIDA SAN. VE TIC. LTD. STI.",
  "ISTIKLAL MAH. CEMAL UNLU",
  "SARAC CAD. NO:20",
  "SULEYMANPASA / TEKIRDAG",
  "VERGI NO: 8920645297 VERGI DAIRESI: SULEYMANPASA",
];
export const UNEX_SHIPPER_AKKON = [
  "UNEX GIDA SAN. VE TIC.LTD.STI.",
  "İstiklal Mah. Cemal Ünlü Saraç Cad. No:20",
  "Süleymanpaşa / TEKİRDAĞ",
  "Vergi No: 8920645297",
  "Vergi Dairesi: Süleymanpaşa",
  "Mail: info@unex.com.tr",
  "Web Site: www.unex.com.tr",
];
export const UNEX_TELEFON = "+90 533 592 16 89";
export const UNEX_FATURA_TARAFI = "UNEX GIDA SAN. VE TIC.LTD.STI";
export const VARSAYILAN_MAL_EN = "WHEAT FLOUR";
export const VARSAYILAN_MAL_TR = "BUĞDAY UNU";
export const VARSAYILAN_GTIP = "11010015";
export const VARSAYILAN_BL_TIPI = "BILL OF LADING";
export const BL_TIPLERI = ["BILL OF LADING", "SEAWAY BILL", "TELEX RELEASE"] as const;

/** Dosyada saklanan talimat tercihleri (ham_veri.konsimento_talimati). Hepsi istege bagli. */
export type TalimatAyari = {
  sablon?: KonsimentoSablonu | null;  // elle secim; yoksa rezervasyondaki acenteden
  shipper_ek?: string | null;         // "ON BEHALF OF ..." (shipper blogunun sonuna)
  mal_en?: string | null;             // ornek "FLOUR" (varsayilan WHEAT FLOUR)
  mal_tr?: string | null;             // varsayilan BUGDAY UNU
  bl_tipi?: string | null;            // varsayilan BILL OF LADING
  bl_orijinal?: number | null;        // Akkon: varsayilan 3
  bl_kopya?: number | null;           // Akkon: varsayilan 3
  ozel_ibare?: string | null;         // Akkon "OZEL IBARELER (remarks)"
};

export type TalimatGirdisi = {
  dosya: {
    dosya_no: string | null; alici_firma: string | null; consignee: string | null; teslim_sekli: string | null;
    varis_limani: string | null; yuklenme_limani: string | null; detayli_ambalaj: string | null; ambalaj: string | null;
    beyanname_no: string | null; ham_veri: Record<string, unknown> | null;
  };
  rezervasyonlar: { booking_no: string | null; acente_ismi: string | null; gemi_adi: string | null; sefer_no: string | null; yuklenme_limani: string | null }[];
  konteynerler: { konteyner_no: string; tip: string | null; muhur_no: string | null; pieces: number | string | null; net_agirlik_kg: number | string | null; brut_agirlik_kg: number | string | null }[];
  gumrukMusaviri?: string | null;
  tarih?: Date;
};

export type TalimatKonteyneri = { no: string; tip: string; muhur: string; kap: number; net: number; brut: number };

export type TalimatModeli = {
  sablon: KonsimentoSablonu;
  sablonVarsayilan: boolean;
  sablonNotu: string;
  dosyaNo: string;
  aliciFirma: string;
  booking: string;
  shipper: string[];          // sablona gore satirlar (+ varsa ON BEHALF OF)
  consignee: string;          // cok satirli
  notify: string[];           // her biri cok satirli
  gemi: string;               // sablona gore bicimli
  gemiAdi: string; sefer: string;
  pol: string; polAnahtar: string;
  pod: string;
  malEn: string[];            // aciklama satirlari (EN)
  malTr: string[];            // Akkon TR satirlari
  gtip: string;
  ambalajEn: string;          // "10.000 PIECES OF 25 KG PP BAGS"
  blTipi: string; blOrijinal: number; blKopya: number;
  navlun: "PREPAID" | "COLLECT";
  navlunFaturaTarafi: string;
  ozelIbare: string;
  beyannameNo: string;
  gumrukMusaviri: string;
  konteynerler: TalimatKonteyneri[];
  toplamKap: number; toplamNet: number; toplamBrut: number;
  tarih: string;              // "03 /11/2026" (Akkon formu)
  eksikler: string[];         // olusturmayi engellemeyen ama dikkat isteyen eksikler
  dosyaAdi: string;           // "<booking> <ALICI> KONSIMENTO TALIMATI.pdf"
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const sayiTr = (n: number, ondalik = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
const temiz = (s: unknown) => (typeof s === "string" ? s : "").replace(/\r/g, "").trim();
const satirlar = (s: unknown) => temiz(s).split("\n").map((x) => x.trim()).filter(Boolean);
/** Ingilizce alanlar (gemi, liman, consignee...): "i" -> "I" (tr-TR "İ" yapardi). */
const buyuk = (s: string) => s.toLocaleUpperCase("en-US");
const buyukTr = (s: string) => s.toLocaleUpperCase("tr-TR");

/** Ambarli'daki terminaller (yukleme limani "ISTANBUL-MARPORT" / "MARPORT - AMBARLI"). */
const AMBARLI_TERMINALLERI = ["MARPORT", "KUMPORT", "MARDAS", "MARDAŞ"];

export function talimatAyari(hamVeri: Record<string, unknown> | null | undefined): TalimatAyari {
  const a = (hamVeri as { konsimento_talimati?: unknown } | null)?.konsimento_talimati;
  return a && typeof a === "object" && !Array.isArray(a) ? (a as TalimatAyari) : {};
}

export function dosyaNotifyListesi(hamVeri: Record<string, unknown> | null | undefined): string[] {
  const n = (hamVeri as { notify?: unknown } | null)?.notify;
  return Array.isArray(n) ? n.map((x) => temiz(x)).filter(Boolean) : [];
}

/** "TEMA PORT, GHANA" -> "TEMA"; "Djibouti Port, Djibouti" -> "DJIBOUTI". */
export function tahliyeLimani(varis: string | null | undefined): string {
  const ilk = buyuk(temiz(varis).split(",")[0] || "");
  return ilk.replace(/\bPORT\b/g, "").replace(/\s+/g, " ").trim();
}

/** "25 KG PP Bag" -> "25 KG PP BAGS" */
function cogulAmbalaj(a: string): string {
  const s = buyuk(a).replace(/\s+/g, " ").trim();
  return /\bBAG$/.test(s) ? `${s}S` : s;
}

/** Kap adedi + ambalaj (EN): detayli ambalajdaki parantezli marka atilir, adet konteyner toplamindan. */
export function ambalajIngilizce(detayli: string | null, ambalaj: string | null, toplamKap: number): string {
  let s = buyuk(temiz(detayli)).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (s) {
    if (toplamKap > 0) s = s.replace(/^[\d.,]+\s+PIECES?\s+OF\s+/, `${sayiTr(toplamKap)} PIECES OF `);
    return s;
  }
  const a = cogulAmbalaj(temiz(ambalaj));
  return [toplamKap ? `${sayiTr(toplamKap)} PIECES OF` : "", a].filter(Boolean).join(" ");
}

/** Akkon TR kalibi: "10.000 ADET 25 KG ÇUVALLARDA" */
export function ambalajTurkceTalimat(ambalajEn: string): string {
  return ambalajTurkce(ambalajEn).replace(/\bPP\s+(?=ÇUVAL)/, "").replace(/ÇUVAL$/, "ÇUVALLARDA");
}

function guvenliAd(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/g, "s").replace(/Ş/g, "S").replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/[^A-Za-z0-9 ._-]/g, "").replace(/\s+/g, " ").trim();
}

export function talimatModeli(g: TalimatGirdisi): TalimatModeli {
  const d = g.dosya;
  const ayar = talimatAyari(d.ham_veri);
  const rez = g.rezervasyonlar || [];
  const r0 = rez[0];
  const bul = konsimentoSablonuBul(r0?.acente_ismi);
  const sablon: KonsimentoSablonu = (ayar.sablon && ["standart", "akkon", "msc_web"].includes(ayar.sablon)) ? ayar.sablon : bul.sablon;
  const sablonVarsayilan = !ayar.sablon && bul.varsayilan;
  const akkon = sablon === "akkon";

  const kont: TalimatKonteyneri[] = (g.konteynerler || []).map((k) => ({
    no: buyuk(temiz(k.konteyner_no)).replace(/\s+/g, ""),
    tip: buyuk(temiz(k.tip)).replace(/^(\d{2})\s*([A-Z]{2})$/, "$1 $2"),
    muhur: temiz(k.muhur_no),
    kap: num(k.pieces), net: num(k.net_agirlik_kg), brut: num(k.brut_agirlik_kg),
  }));
  const toplamKap = kont.reduce((s, k) => s + k.kap, 0);
  const toplamNet = kont.reduce((s, k) => s + k.net, 0);
  const toplamBrut = kont.reduce((s, k) => s + k.brut, 0);

  const booking = rez.map((r) => temiz(r.booking_no)).filter((b, i, a) => b && a.indexOf(b) === i).join(" + ");
  const gemiAdi = buyuk(temiz(r0?.gemi_adi));
  const sefer = buyuk(temiz(r0?.sefer_no));
  const gemi = akkon
    ? [/^M\/?[VS]\b/.test(gemiAdi) ? gemiAdi : (gemiAdi ? `M/V ${gemiAdi}` : ""), sefer].filter(Boolean).join(" / ")
    : [gemiAdi, sefer].filter(Boolean).join(" ");

  const polAnahtar = buyuk(temiz(r0?.yuklenme_limani || d.yuklenme_limani)).replace(/\s+/g, " ");
  const ambarli = AMBARLI_TERMINALLERI.some((t) => polAnahtar.includes(t));
  const pol = !polAnahtar ? "" : akkon ? (ambarli && !polAnahtar.includes("AMBARLI") ? `${polAnahtar} - AMBARLI` : polAnahtar)
    : (ambarli && !polAnahtar.includes("ISTANBUL") ? `ISTANBUL-${polAnahtar}` : polAnahtar);
  const pod = tahliyeLimani(d.varis_limani);

  const malEnAd = buyuk(temiz(ayar.mal_en)) || VARSAYILAN_MAL_EN;
  const malTrAd = buyukTr(temiz(ayar.mal_tr)) || VARSAYILAN_MAL_TR;
  const ambalajEn = ambalajIngilizce(d.detayli_ambalaj, d.ambalaj, toplamKap);
  const gtip = VARSAYILAN_GTIP;
  const malEn = akkon
    ? [malEnAd, ambalajEn, `NET WEIGHT: ${sayiTr(toplamNet)} KGS GROSS WEIGHT: ${sayiTr(toplamBrut)} KGS`]
    : [malEnAd, ambalajEn, `NET WEIGHT: ${sayiTr(toplamNet, 2)} KGS GROSS WEIGHT: ${sayiTr(toplamBrut, 2)} KGS`, `Hs Code :${gtip}`];
  const malTr = [malTrAd, ambalajTurkceTalimat(ambalajEn), `NET: ${sayiTr(toplamNet)} KG BRÜT: ${sayiTr(toplamBrut)} KG`];

  const consignee = temiz(d.consignee);
  const notify = dosyaNotifyListesi(d.ham_veri);
  const shipperEk = buyuk(temiz(ayar.shipper_ek));
  const shipper = [...(akkon ? UNEX_SHIPPER_AKKON : UNEX_SHIPPER_STANDART), ...(shipperEk ? [shipperEk] : [])];
  const navlun = navlunAliciyaAitMi(d.teslim_sekli) ? "COLLECT" : "PREPAID";
  const consigneeIlk = satirlar(consignee)[0] || "";
  const navlunFaturaTarafi = navlun === "PREPAID" ? UNEX_FATURA_TARAFI : (consigneeIlk && consigneeIlk !== "TO ORDER" ? consigneeIlk : "");

  const eksikler: string[] = [];
  if (!booking) eksikler.push("Booking no");
  if (!consignee) eksikler.push("Consignee");
  if (!notify.length) eksikler.push("Notify");
  if (!gemiAdi) eksikler.push("Gemi adı");
  if (!polAnahtar) eksikler.push("Yükleme limanı");
  if (!pod) eksikler.push("Tahliye limanı");
  if (!kont.length) eksikler.push("Konteynerler");
  if (kont.some((k) => !k.muhur)) eksikler.push("Mühür no");
  if (kont.some((k) => !k.kap || !k.net || !k.brut)) eksikler.push("Kap / net / brüt");

  const t = g.tarih || new Date();
  const gun = String(t.getDate()).padStart(2, "0"), ay = String(t.getMonth() + 1).padStart(2, "0");
  const aliciKisa = buyuk(temiz(d.alici_firma)).split(/\s+/)[0] || "";
  const dosyaAdi = `${guvenliAd([booking.replace(/\s*\+\s*/g, "_") || d.dosya_no || "", aliciKisa, "KONSIMENTO TALIMATI"].filter(Boolean).join(" "))}.pdf`;

  return {
    sablon, sablonVarsayilan, sablonNotu: ayar.sablon ? "Dosyada elle seçildi." : bul.not,
    dosyaNo: temiz(d.dosya_no), aliciFirma: temiz(d.alici_firma),
    booking, shipper, consignee, notify, gemi, gemiAdi, sefer, pol, polAnahtar, pod,
    malEn, malTr, gtip, ambalajEn,
    blTipi: buyuk(temiz(ayar.bl_tipi)) || VARSAYILAN_BL_TIPI,
    blOrijinal: num(ayar.bl_orijinal) || 3, blKopya: num(ayar.bl_kopya) || 3,
    navlun, navlunFaturaTarafi,
    ozelIbare: temiz(ayar.ozel_ibare),
    beyannameNo: temiz(d.beyanname_no),
    gumrukMusaviri: temiz(g.gumrukMusaviri),
    konteynerler: kont, toplamKap, toplamNet, toplamBrut,
    tarih: `${gun} /${ay}/${t.getFullYear()}`,
    eksikler, dosyaAdi,
  };
}
