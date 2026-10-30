/**
 * Satis & Alis Siparis Raporu -> .xlsx (30.10.2026). Lojistigin Excel'iyle
 * AYNI duzen: tek sayfa (adi rapor gunu "27.10.2026"), ustte SATIS, altta ALIS
 * tablosu; tamamlanan satir YESIL. Sona "SİSTEM NO" (IE / AS) eklendi - Excel
 * satirindan uygulamadaki kayda gitmek icin.
 */
import { XS, XlsxHucre, XlsxSayfa, xlsxOlustur } from "@/lib/xlsx-yaz";
import type { RaporAlisSatiri, RaporSatisSatiri } from "./siparis-raporu";
import { PARA_SEMBOL } from "./alis";

const SATIS_BASLIK = ["No", "FİŞ TARİHİ", "CARİ HESAP ÜNVANI", "SİPARİŞ NO", "MALZEME AÇIKLAMASI", "BİRİM", "SİPARİŞ MİKTARI (KG)", "SEVK EDİLEN (KG)", "BEKLEYEN (KG)", "BİRİM FİYAT", "VADE", "TOPLAM TUTAR", "TERMİN", "TESLİM / SATIŞ", "SİSTEM NO"];
const ALIS_BASLIK = ["No", "FİŞ TARİHİ", "CARİ HESAP ÜNVANI", "SİPARİŞ NO", "MALZEME AÇIKLAMASI", "BİRİM", "SİPARİŞ MİKTARI (KG)", "TESLİM ALINAN (KG)", "BEKLEYEN (KG)", "BİRİM FİYAT", "VADE", "TERMİN", "TESLİM / ALIM", "TOPLAM TUTAR", "SİSTEM NO"];
const SON_SUTUN = "O";

const yesil = (tamam: boolean, normal: number, y: number) => (tamam ? y : normal);

export function raporSayfasi(gun: string, satis: RaporSatisSatiri[], alis: RaporAlisSatiri[], alisDahil: boolean): XlsxSayfa {
  const [y, m, d] = gun.split("-");
  const satirlar: (XlsxHucre | null)[][] = [];
  const birlestir: string[] = [];
  const baslikEkle = (metin: string) => {
    satirlar.push([{ v: metin, s: XS.baslik }]);
    birlestir.push(`A${satirlar.length}:${SON_SUTUN}${satirlar.length}`);
  };

  // ---- SATIS ----
  baslikEkle("SATIŞ SİPARİŞ RAPORU (AKTİF BEKLEYEN & TAMAMLANAN)");
  satirlar.push(SATIS_BASLIK.map((b) => ({ v: b, s: XS.tabloBaslik })));
  satis.forEach((s, i) => {
    const t = s.tamamlandi;
    satirlar.push([
      { v: i + 1, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
      { v: s.fisTarihi ? new Date(`${s.fisTarihi}T12:00:00`) : null, s: yesil(t, XS.tarih, XS.tarihYesil) },
      { v: s.cari, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.siparisNo, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.malzeme, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.birim, s: yesil(t, XS.metin, XS.metinYesil) },
      s.siparisKg !== null
        ? { v: s.siparisKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) }
        : { v: s.siparisArac ? `${s.siparisArac} ARAÇ` : "", s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.sevkKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
      { v: s.bekleyenKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
      { v: s.birimFiyat, s: yesil(t, XS.ondalik, XS.ondalikYesil) },
      { v: s.vade, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.tutar, s: yesil(t, XS.ondalik, XS.ondalikYesil) },
      { v: s.termin, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.teslim, s: yesil(t, XS.metin, XS.metinYesil) },
      { v: s.kayitNo, s: yesil(t, XS.metin, XS.metinYesil) },
    ]);
  });
  if (!satis.length) satirlar.push([{ v: "Aktif satış siparişi yok.", s: XS.not }]);
  satirlar.push([]);
  satirlar.push([null, { v: "NOT:", s: XS.not }, { v: "Tamamlanan sipariş satırı yeşil boyalıdır.", s: XS.not }]);
  satirlar.push([]);

  // ---- ALIS ----
  if (alisDahil) {
    baslikEkle("ALIŞ SİPARİŞ RAPORU (AKTİF BEKLEYEN & TAMAMLANAN)");
    satirlar.push(ALIS_BASLIK.map((b) => ({ v: b, s: XS.tabloBaslik })));
    alis.forEach((a, i) => {
      const t = a.tamamlandi;
      const tl = a.paraBirimi === "TRY";
      satirlar.push([
        { v: i + 1, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
        { v: a.fisTarihi ? new Date(`${a.fisTarihi}T12:00:00`) : null, s: yesil(t, XS.tarih, XS.tarihYesil) },
        { v: a.cari, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.siparisNo, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.malzeme, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.birim, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.siparisKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
        { v: a.alinanKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
        { v: a.bekleyenKg, s: yesil(t, XS.tamSayi, XS.tamSayiYesil) },
        tl || a.birimFiyat === null
          ? { v: a.birimFiyat, s: yesil(t, XS.ondalik, XS.ondalikYesil) }
          : { v: `${a.birimFiyat.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ${PARA_SEMBOL[a.paraBirimi]}`, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.vade, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.termin ? new Date(`${a.termin}T12:00:00`) : null, s: yesil(t, XS.tarih, XS.tarihYesil) },
        { v: a.teslim, s: yesil(t, XS.metin, XS.metinYesil) },
        tl || a.tutar === null
          ? { v: a.tutar, s: yesil(t, XS.ondalik, XS.ondalikYesil) }
          : { v: `${a.tutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${PARA_SEMBOL[a.paraBirimi]}`, s: yesil(t, XS.metin, XS.metinYesil) },
        { v: a.kayitNo, s: yesil(t, XS.metin, XS.metinYesil) },
      ]);
    });
    if (!alis.length) satirlar.push([{ v: "Aktif alış siparişi yok.", s: XS.not }]);
  }

  return {
    ad: `${d}.${m}.${y}`,
    sutunGenislik: [5, 11, 34, 22, 24, 7, 14, 14, 13, 11, 10, 16, 12, 14, 13],
    satirlar,
    birlestir,
  };
}

export async function raporXlsx(gun: string, satis: RaporSatisSatiri[], alis: RaporAlisSatiri[], alisDahil: boolean): Promise<Blob> {
  return xlsxOlustur([raporSayfasi(gun, satis, alis, alisDahil)]);
}
