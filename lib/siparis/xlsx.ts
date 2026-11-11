/**
 * Siparis Listesi + Yukleme Plani -> .xlsx (11.11.2026). Export ve operasyonun Excel'leriyle AYNI basliklar;
 * sona sistemden gelen sutunlar eklendi (Durum, On Odeme, Dosya, Booking, ETD). Sevk edilen satir YESIL
 * (lib/xlsx-yaz.ts kurali). Yukleme plani hafta bloklari halinde: "46.HAFTA (12 KASIM - 18 KASIM)".
 */
import { XS, type XlsxHucre, type XlsxSayfa } from "@/lib/xlsx-yaz";
import { DURUM_ADI, haftaEtiketi, planHaftasi, planSirala, siparisSirala, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";

const tarih = (iso: string | null): Date | null => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : null);
const yesil = (t: boolean, normal: number, y: number) => (t ? y : normal);

const SIPARIS_BASLIK = ["Proforma", "Firma Adı", "Ürün", "Fiyat", "Miktar", "Tutar", "Konteyner", "Liman", "BL NO", "Marka", "Paketleme",
  "Durum", "Ön Ödeme", "Dosya No", "Booking", "ETD"];

export function siparisSayfasi(liste: SiparisSatiri[], ad = "Sipariş Listesi"): XlsxSayfa {
  const satirlar: (XlsxHucre | null)[][] = [SIPARIS_BASLIK.map((b) => ({ v: b, s: XS.tabloBaslik }))];
  for (const s of siparisSirala(liste)) {
    const t = s.durum === "sevk_edildi";
    const m = (v: string | null | undefined) => ({ v: v ?? "", s: yesil(t, XS.metin, XS.metinYesil) });
    satirlar.push([
      m(s.proforma_no), m(s.firma), m(s.urun),
      { v: s.birim_fiyat, s: yesil(t, XS.ondalik, XS.ondalikYesil) },
      { v: s.miktar_mt, s: yesil(t, XS.ondalik, XS.ondalikYesil) },
      { v: s.tutar, s: yesil(t, XS.ondalik, XS.ondalikYesil) },
      { v: s.konteyner, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
      m(s.liman), m(s.bl_no), m(s.marka), m(s.paketleme),
      m(DURUM_ADI[s.durum] + (s.benzer && s.kaynak === "sistem" ? ` (olası tekrar: ${s.benzer})` : "")),
      m(s.on_odeme ? (s.on_odeme_tarihi ? `Alındı ${s.on_odeme_tarihi.slice(8, 10)}.${s.on_odeme_tarihi.slice(5, 7)}` : "Alındı") : ""),
      m(s.dosya_no), m(s.booking_no),
      { v: tarih(s.etd), s: yesil(t, XS.tarih, XS.tarihYesil) },
    ]);
  }
  return { ad, sutunGenislik: [20, 30, 28, 9, 9, 12, 9, 14, 16, 18, 22, 22, 13, 14, 18, 11], satirlar };
}

const PLAN_BASLIK = ["MÜŞTERİ", "CİNSİ", "KON.AD.", "VARIŞ LİMANI", "ÇUVAL MARKASI", "AMBALAJ", "ACENTE", "LİMAN", "EKİPMAN", "BOOKING NO",
  "BOŞ EKİPMAN ALIM TARİHİ", "ARDİYESİZ GİRİŞ", "TALİMAT CUT OFF", "BEYAN CUT OFF", "ETD", "GEMİ ADI", "SEFER", "NAVLUN / KONT.", "LOKAL / KONT.", "DOSYA NO"];

export function planSayfasi(liste: PlanSatiri[], ad = "Yükleme Planı", bugun?: string): XlsxSayfa {
  const satirlar: (XlsxHucre | null)[][] = [];
  const birlestir: string[] = [];
  let sonBlok = "";
  const son = "T";
  for (const p of planSirala(liste)) {
    const h = planHaftasi(p.etd, p.hafta, p.yil);
    const blok = h.hafta && h.yil ? `${h.yil}|${h.hafta}` : "?";
    if (blok !== sonBlok) {
      sonBlok = blok;
      if (satirlar.length) satirlar.push([]);
      satirlar.push([{ v: h.hafta && h.yil ? `${h.yil} · ${haftaEtiketi(h.hafta, h.yil)}` : "HAFTA BELİRSİZ (ETD YOK)", s: XS.baslik }]);
      birlestir.push(`A${satirlar.length}:${son}${satirlar.length}`);
      satirlar.push(PLAN_BASLIK.map((b) => ({ v: b, s: XS.tabloBaslik })));
    }
    const t = !!(bugun && p.etd && p.etd.slice(0, 10) < bugun);
    const m = (v: string | null | undefined) => ({ v: v ?? "", s: yesil(t, XS.metin, XS.metinYesil) });
    const d = (v: string | null) => ({ v: tarih(v), s: yesil(t, XS.tarih, XS.tarihYesil) });
    satirlar.push([
      m(p.musteri), m(p.cinsi), { v: p.konteyner, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) }, m(p.varis_limani), m(p.cuval_markasi),
      m(p.ambalaj), m(p.acente), m(p.liman), m(p.ekipman ?? p.ekipman_alim_yeri), m(p.booking_no),
      d(p.bos_ekipman_tarihi), d(p.ardiyesiz_giris), d(p.talimat_cutoff), d(p.beyan_cutoff), d(p.etd), m(p.gemi), m(p.sefer),
      { v: p.navlun, s: yesil(t, XS.ondalik, XS.ondalikYesil) }, { v: p.lokal, s: yesil(t, XS.ondalik, XS.ondalikYesil) }, m(p.dosya_no),
    ]);
  }
  if (!satirlar.length) satirlar.push([{ v: "Planlı yükleme yok.", s: XS.not }]);
  return { ad, sutunGenislik: [26, 18, 8, 16, 16, 14, 14, 12, 12, 16, 12, 12, 12, 12, 11, 22, 10, 11, 11, 14], satirlar, birlestir };
}
