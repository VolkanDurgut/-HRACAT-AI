export type Dosya = {
  id: string;
  dosya_no: string;
  durum: string | null;
  olusturma_tarihi: string | null;
  satici_firma: string | null;
  alici_firma: string | null;
  urun_tanimi: string | null;
  toplam_tutar: number | null;
  para_birimi: string | null;
  proforma_no: string | null;
  proforma_tarihi: string | null;
  yuklenme_limani: string | null;
  varis_limani: string | null;
  teslim_sekli: string | null;
  odeme_sekli: string | null;
  ham_veri: Record<string, unknown> | null;
  gecerlilik_tarihi: string | null;
  miktar: string | null;
  miktar_birimi: string | null;
  ambalaj: string | null;
  lot_no: string | null;
  sevkiyat_evraklari: string[] | null;
  urun_detaylari: UrunDetay[] | null;
  toplam_konteyner: number | null;
  created_by: string | null;
  marka: string | null;
  beyanname_no: string | null;
  fatura_no: string | null;
  fatura_tarihi: string | null;
  bl_no: string | null;
  diib_no: string | null;
  diib_tarihi: string | null;
  uretim_tarihi: string | null;
  son_kullanim_tarihi: string | null;
  navlun_tutari: number | null;
  fatura_talimati_gonderildi: boolean | null;
  konsimento_dosya_url: string | null;
  konsimento_dosya_adi: string | null;
  konsimento_yukleme_tarihi: string | null;
  konsimento_kontrol_sonucu: Record<string, unknown> | null;
  vgm_gonderildi: boolean | null;
  ana_siparis_id: string | null;
  fatura_dosya_url: string | null;
  fatura_dosya_adi: string | null;
  fatura_yukleme_tarihi: string | null;
  fatura_kontrol_sonucu: Record<string, unknown> | null;
  consignee: string | null;
  alici_adresi: string | null;
  detayli_ambalaj: string | null;
  hesap_adi: string | null;
  banka: string | null;
  swift: string | null;
  hesap_numarasi: string | null;
  iban: string | null;
};

export type UrunDetay = {
  urun_adi: string;
  ambalaj_boyutu: string;
  miktar_mts: string;
  birim_fiyat_usd: string;
  toplam_tutar_usd: string;
};

export type Rezervasyon = {
  id: string;
  dosya_id: string;
  booking_no: string;
  gemi_adi: string | null;
  acente_ismi: string | null;
  sefer_no: string | null;
  gemi_kalkis_tarihi: string | null;
  talimat_cutoff: string | null;
  beyanname_cutoff: string | null;
  ardiyesiz_giris: string | null;
  ekipman_alim_yeri: string | null;
  ekipman_alim_tarihi: string | null;
  yuklenme_limani: string | null;
  konteyner_adedi: number;
  net_agirlik: number | null;
  brut_agirlik: number | null;
  olusturma_tarihi: string | null;
  sevkiyat_id: string | null;
  created_by: string | null;
};

export type Konteyner = {
  id: string;
  dosya_id: string;
  rezervasyon_id: string | null;
  konteyner_no: string;
  muhur_no: string | null;
  tip: string;
  olusturma_tarihi: string | null;
  plaka: string | null;
  tare_kg: number | null;
  net_agirlik_kg: number | null;
  vgm_kg: number | null;
  dba_dosya_url: string | null;
  dba_dosya_adi: string | null;
  dba_yukleme_tarihi: string | null;
  dba_kontrol_sonucu: Record<string, unknown> | null;
  dba_belge_no: string | null;
  pieces: number | null;
  brut_agirlik_kg: number | null;
  marka: string | null;
  irsaliye_dosya_url: string | null;
  irsaliye_dosya_adi: string | null;
  irsaliye_yukleme_tarihi: string | null;
};

export type Plaka = {
  id: string;
  plaka: string;
  created_by: string | null;
  olusturma_tarihi: string | null;
};

export type AnaSiparis = {
  id: string;
  proforma_no: string;
  alici_firma: string | null;
  urun_tanimi: string | null;
  toplam_mts: number | null;
  para_birimi: string | null;
  birim_fiyat: number | null;
  urun_detaylari_master: UrunDetay[] | null;
  olusturma_tarihi: string | null;
  created_by: string | null;
};

export type SurecTakibi = {
  id: string;
  dosya_id: string;
  adim_kodu: number;
  tamamlandi: boolean;
  tamamlanma_tarihi: string | null;
  created_at: string;
};

// DBA kontrol sonucu tipi
export type DbaKontrolSonucu = {
  dba_belge_no: string;
  tartim_tarih_saat: string;
  kantar_firma_unvan: string;
  kantar_no: string;
  konteyner_no: string;
  konteyner_payload_kg: number;
  konteyner_dara_kg: number;
  dogrulanmis_brut_agirlik_kg: number;
  arac_plaka: string;
  arac_bos_agirlik_kg: number;
  yukleten_unvan: string;
  yuklenecegi_yer: string;
  net_agirlik_kg: number;
  uyusmazliklar: string[];
};

// Konsimento kontrol sonucu tipi
export type KonsimentoKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
};

// Dosyanin aktif olup olmadigini kontrol eder
export function isDosyaAcik(dosya: Dosya): boolean {
  return dosya.durum === 'Açık' || dosya.durum === 'Acik';
}

// Dosyanin akis durumunu hesaplar
export function getDosyaAkisDurumu(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
) {
  const rezervasyonVar = rezervasyonlar.length > 0;
  const rezervasyonKontAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const konteynerlerTamam = rezervasyonKontAdedi > 0 && konteynerler.length === rezervasyonKontAdedi;
  const faturaKesildi = !!dosya.fatura_dosya_url;
  const konsimentoVar = !!dosya.konsimento_dosya_url;
  const tumDbaHazir = konteynerler.length > 0 && konteynerler.every(k => !!k.dba_dosya_url);
  const vgmGonderildi = !!dosya.vgm_gonderildi;

  return {
    rezervasyonVar,
    konteynerlerTamam,
    faturaKesildi,
    konsimentoVar,
    tumDbaHazir,
    vgmGonderildi,
    rezervasyonKontAdedi,
    dbaYuklenenSayisi: konteynerler.filter(k => !!k.dba_dosya_url).length,
  };
}
export type FumigationAyari = {
  id: string;
  alici_firma: string;
  fumigant: string | null;
  fumigasyon_dozu: string | null;
  sicaklik: string | null;
  baslangic_saati: string | null;
  bitis_saati: string | null;
  min_exp_period: string | null;
  aeration_period: string | null;
  updated_at: string | null;
};
