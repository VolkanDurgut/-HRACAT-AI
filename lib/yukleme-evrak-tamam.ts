/**
 * YUKLEME EVRAKLARI TAMAM (25.11.2026). Ana Panel "Evraklar" rozetleri 4/4: KT (konsimento talimati; Draft BL varsa gecilmis
 * sayilir) · FT (fatura; DIIB'e bolunmus yuklemede butun parcalar) · BL (Draft BL) · BY (beyanname). app/panel/page.tsx
 * evrakDurumlari ile AYNI kural; veritabaninda ayni kural: dosya_yukleme_evraklari_tamam (migration 20261125120000).
 *
 * Kullanici: "Ana paneldeki yuklemesi tamamlanmis isler (KT, FT, BL, BY - talimat ve beyannamesi yuklenenler) otomatik olarak
 * Ihracat Evraklari kismina aktarilmali; orada musteri onayladi isaretlenenler otomatik kapatilsin."
 *  - Ana Panel is listesinde 4/4 dosya satiri GORUNMEZ (Ihracat Evraklari'nda listelenir).
 *  - Ihracat Evraklari: acik ve (tam evrak seti hazir YA DA 4/4) dosyalar.
 *  - Musteri onayi + 4/4 -> dosya otomatik "Kapalı" (veritabani tetikleyicisi; elle yeniden acilan dosya yeniden kapanmaz).
 */
export type YuklemeEvrakDosyasi = {
  konsimento_dosya_url?: string | null;
  draft_bl_dosya_url?: string | null;
  fatura_dosya_url?: string | null;
  beyanname_dosya_url?: string | null;
};
export type FaturaParcasiUrl = { fatura_dosya_url?: string | null };

export function yuklemeEvraklariTamam(d: YuklemeEvrakDosyasi, faturaParcalari: FaturaParcasiUrl[] = []): boolean {
  const kt = !!d.konsimento_dosya_url || !!d.draft_bl_dosya_url;
  const ft = faturaParcalari.length >= 2 ? faturaParcalari.every((p) => !!p.fatura_dosya_url) : !!d.fatura_dosya_url;
  return kt && ft && !!d.draft_bl_dosya_url && !!d.beyanname_dosya_url;
}
