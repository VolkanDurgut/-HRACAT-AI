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
  // Yeni Dosya Ac akisinda yuklenen orijinal proforma PDF'i - storage'daki
  // imzali URL'i ve gorunen adi. 26.09.2026'da eklendi, o tarihten ONCE
  // acilmis dosyalarda bos olabilir (bkz. migration proforma_dosya_url).
  proforma_dosya_url: string | null;
  proforma_dosya_adi: string | null;
  yuklenme_limani: string | null;
  varis_limani: string | null;
  teslim_sekli: string | null;
  odeme_sekli: string | null;
  // Gumruk/dis ticaret odeme sekli siniflandirmasi (Mal Mukabili / Akreditif /
  // Vesaik Mukabili / Pesin vb.). "odeme_sekli" alanindan KASITLI AYRI -
  // o alan Commercial Invoice'ta kullanilan, bankaya giden detayli odeme
  // talimati metnidir, buna dokunulmaz. Bkz. migration 20260925130000.
  gumruk_odeme_sekli: string | null;
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
  // Bu sevkiyat icin ECTN basvurusu yapilacak mi (talep: 28.09.2026). true ise
  // Commercial Invoice'a TOTAL FOB/FREIGHT/TOTAL CFR satirlari eklenir.
  ectn_basvurusu: boolean | null;
  // ECTN satirlarinin manuel (kullanici tarafindan girilen) degerleri (talep:
  // 28.09.2026). Her biri NULL ise ilgili satir otomatik hesaplanir - bkz.
  // lib/invoice-builder.ts -> hesaplaEctnOtomatikDegerler / buildEctnSatirlari.
  ectn_fob_override: number | null;
  ectn_freight_override: number | null;
  ectn_cfr_override: number | null;
  // INSURANCE satiri icin elle girilen tutar (talep: 29.09.2026) - otomatik
  // hesaplamasi YOK, NULL ise satir hic gosterilmez.
  ectn_insurance_override: number | null;
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
  draft_onaylandi: boolean | null;
  draft_onaylayan: string | null;
  draft_onay_tarihi: string | null;
  draft_mail_gonderildi: boolean | null;
  draft_mail_gonderildi_tarihi: string | null;
  draft_musteri_onayi_alindi: boolean | null;
  draft_musteri_onayi_tarihi: string | null;
  draft_musteri_onayi_isaretleyen: string | null;
  // --- 01.10.2026: canli tablodaki ama tipte EKSIK olan alanlar eklendi. ---
  // Eskiden bu alanlara kodda "(dosya as any).x" ile erisiliyordu; tip
  // kontrolu yazim hatalarini yakalayamiyordu. Kolon listesi canli
  // ihracat_dosyalari tablosuyla birebir karsilastirildi.
  // Konteyner basi lokal masraf (rezervasyonda girilir, Fatura Talimati ve
  // ECTN FOB/FREIGHT hesabinda kullanilir).
  lokal_masraf_tutari: number | null;
  // Draft konsimento (BL) PDF'i ve AI kontrol sonucu (Draft Onay akisi).
  draft_bl_dosya_url: string | null;
  draft_bl_dosya_adi: string | null;
  draft_bl_yukleme_tarihi: string | null;
  draft_bl_kontrol_sonucu: Record<string, unknown> | null;
  // Musteri draft icin revize istediyse (bkz. migration 20260930140000).
  draft_revize_istendi: boolean | null;
  draft_revize_notu: string | null;
  draft_revize_tarihi: string | null;
  draft_revize_isaretleyen: string | null;
  // ECTN "TOTAL CFR" satir etiketinin elle girilen hali (NULL -> otomatik).
  ectn_cfr_etiket_override: string | null;
  fatura_talimati_metni: string | null;
  company_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type UrunDetay = {
  urun_adi: string;
  ambalaj_boyutu: string;
  miktar_mts: string;
  birim_fiyat_usd: string;
  toplam_tutar_usd: string;
  // Kalemin sayildigi siparis (07.10.2026, lib/siparis-takip.ts): bos = dosyanin
  // ana_siparis_id'si, "yok" = hicbir siparise sayilmaz, id = o siparis
  // (iki proformali dosya: 5 SAAD 270826 + 5 SAAD 160926).
  siparis_id?: string;
};

export type Rezervasyon = {
  id: string;
  dosya_id: string;
  booking_no: string;
  gemi_adi: string | null;
  acente_ismi: string | null;
  sefer_no: string | null;
  gemi_kalkis_tarihi: string | null;
  eta: string | null;
  eta_guncelleme_tarihi: string | null;
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
  // "Siparisi Tamamla" (03.10.2026, migration 20261003130000): true ise
  // siparis Devam Eden Siparisler listesinden duser; kayit silinmez.
  tamamlandi: boolean | null;
  tamamlanma_tarihi: string | null;
  tamamlayan: string | null;
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

/** Quality / Condition Certificate'teki PARAMETER/SPECIFICATION/RESULTS/METHODS
 * tablosunun tek bir satiri. */
export type KaliteParametresi = {
  parametre: string;
  spesifikasyon: string;
  sonuc: string;
  metod: string;
};

/** Quality / Condition Certificate - musteri (alici_firma) bazli kayitli
 * parametre tablosu. fumigation_ayarlari ile ayni desen (bkz.
 * kalite_sertifikasi_ayarlari migration'i). */
export type KaliteSertifikasiAyari = {
  id: string;
  alici_firma: string;
  parametreler: KaliteParametresi[] | null;
  updated_at: string | null;
};
