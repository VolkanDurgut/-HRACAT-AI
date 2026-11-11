/**
 * Siparis Listesi + Yukleme Plani -> .xlsx (11.11.2026). Export ve operasyonun Excel'leriyle AYNI basliklar;
 * sona sistemden gelen sutunlar eklendi (Durum, On Odeme, Dosya, Booking, ETD). Sevk edilen satir YESIL
 * (lib/xlsx-yaz.ts kurali). Yukleme plani operasyonun dosyasiyla ayni duzende: "46.HAFTA (08 KASIM - 14 KASIM)".
 */
import { XS, type XlsxHucre, type XlsxSayfa } from "@/lib/xlsx-yaz";
import { DURUM_ADI, planBloklari, planKalemleri, saat, siparisSirala, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";

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

/** Operasyonun yukleme plani Excel'iyle BIREBIR ayni 16 baslik ve alt baslik satiri */
export const PLAN_BASLIK = ["MÜŞTERİ", "CİNSİ", "KON.AD.", "VARIŞ LİMANI", "ÇUVAL\nMARKASI", "AMBALAJ", "ACENTE", "LİMAN", "EKİPMAN", "BOOKING NO",
  "BOŞ EKİPMAN\nALIM TARİHİ", "ARDİYESİZ GİRİŞ", "TALİMAT CUT OFF", "BEYAN CUT OFF", "ETD", "GEMİ ADI"];
const ALT_BASLIK: Record<number, string> = { 8: "BOŞ EKİPMAN", 14: "GEMİ KALKIŞ", 15: "SEFERİ" };

/**
 * Yukleme plani sayfasi: operasyonun dosyasindaki duzen - hafta basligi, 16 baslik, alt baslik (KON.AD. altinda haftanin
 * toplami), her booking IKI satir (2. satir: ikinci urun kalemi + cut-off saatleri + sefer). ETD'si gecen satir yesil.
 */
export function planSayfasi(liste: PlanSatiri[], ad = "Yükleme Planı", bugun?: string): XlsxSayfa {
  const satirlar: (XlsxHucre | null)[][] = [];
  const birlestir: string[] = [];
  for (const b of planBloklari(liste)) {
    if (satirlar.length) satirlar.push([], []);
    satirlar.push([{ v: b.etiket, s: XS.baslik }]);
    birlestir.push(`A${satirlar.length}:P${satirlar.length}`);
    satirlar.push(PLAN_BASLIK.map((x) => ({ v: x, s: XS.tabloBaslik })));
    satirlar.push(PLAN_BASLIK.map((_, i) => (i === 2 ? { v: b.konteyner, s: XS.toplamTamSayi } : { v: ALT_BASLIK[i] ?? "", s: XS.tabloBaslik })));
    for (const p of b.satirlar) {
      const t = !!(bugun && p.etd && p.etd.slice(0, 10) < bugun);
      const m = (v: string | null | undefined) => ({ v: v ?? "", s: yesil(t, XS.metin, XS.metinYesil) });
      const n = (v: number | null | undefined) => ({ v: v ?? null, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) });
      const d = (v: string | null) => ({ v: tarih(v), s: yesil(t, XS.tarih, XS.tarihYesil) });
      const k = planKalemleri(p);
      satirlar.push([
        m(p.musteri), m(k[0].cinsi), n(k[0].konteyner), m(p.varis_limani), m(k[0].cuval_markasi), m(k[0].ambalaj), m(p.acente), m(p.liman),
        m(p.ekipman ?? p.ekipman_alim_yeri), m(p.booking_no), d(p.bos_ekipman_tarihi), d(p.ardiyesiz_giris), d(p.talimat_cutoff), d(p.beyan_cutoff),
        d(p.etd), m(p.gemi),
      ]);
      const ek = Math.max(1, k.length - 1);
      for (let j = 0; j < ek; j++) {
        const kk = k[j + 1];
        satirlar.push([
          m(""), m(kk?.cinsi), kk ? n(kk.konteyner) : m(""), m(""), m(kk?.cuval_markasi), m(kk?.ambalaj), m(""), m(""), m(""), m(""), m(""), m(""),
          m(j === 0 ? saat(p.talimat_cutoff) : ""), m(j === 0 ? saat(p.beyan_cutoff) : ""), m(""), m(j === 0 ? p.sefer : ""),
        ]);
      }
    }
  }
  if (!satirlar.length) satirlar.push([{ v: "Planlı yükleme yok.", s: XS.not }]);
  return { ad, sutunGenislik: [30, 22, 9, 18, 20, 14, 16, 12, 18, 18, 13, 13, 13, 13, 12, 24], satirlar, birlestir };
}
