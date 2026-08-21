export const KONTEYNER_TIPLERI = ['20DC', '40DC', '40HC', '20RF', '40RF'] as const;

export const MTS_PER_KONTEYNER = 25;

export const SUREC_ADIMLARI: Record<number, string> = {
  1: 'Draft Konsimento Müşteriye İletildi',
  2: 'Müşteri Onayı Alındı',
  3: 'Acenteye Onay Verildi',
  4: 'Tüm Konteynerler Limana Teslim Edildi',
  5: 'Gümrük Beyannamesi Alındı',
  6: 'Beyanname Acente ile Paylaşıldı',
};

export const SEVKIYAT_EVRAKLARI = [
  'Ticari Fatura (Commercial Invoice)',
  'Paketleme Listesi (Packing List)',
  'Konsimento (Bill of Lading)',
  'Menşei Şahadetnamesi (Certificate of Origin)',
  'Bitki Sağlığı Sertifikası (Phytosanitary Certificate)',
  'Sağlık Sertifikası (Health Certificate)',
  'Kalite Sertifikası (Quality Certificate)',
  'Fumigasyon Sertifikası (Fumigation Certificate)',
  'Son Yükleme Sertifikası (Final Loading Certificate)',
  'Sigorta Poliçesi (Insurance Policy)',
] as const;

// Dosya durum sabitleri
export const DOSYA_DURUM = {
  ACIK: 'Açık',
  KAPALI: 'Kapalı',
} as const;

// Akış adımları (panel ve dashboard için ortak)
export const AKIS_ADIMLARI = [
  { key: 'rezervasyon', label: 'Rezervasyon' },
  { key: 'konteynerler', label: 'Konteynerler' },
  { key: 'fatura_talimati', label: 'Fatura Talimatı' },
  { key: 'konsimento', label: 'Konşimento' },
  { key: 'dba', label: 'DBA' },
  { key: 'vgm', label: 'VGM' },
] as const;

// Liste/özet sayfalari (panel, ihracatlar, dashboard, analiz) icin dosya
// kolon listesi. select("*") yerine bunu kullaniyoruz: agir JSONB alanlari
// (ham_veri, kontrol_sonuclari, sevkiyat_evraklari) bu sayfalarda hic
// render edilmiyor, sadece dosya detay sayfasinda kullaniliyor - o yuzden
// listelerde cekilmeleri gereksiz network yukudur. Veri buyudukce
// (yillar boyunca AI kontrol sonuclari ve ham proforma verisi biriktikce)
// bu fark buyuyecektir. Yeni bir alan eklerken: sadece dosya DETAY
// sayfasinda kullanilacaksa buraya EKLEME.
export const DOSYA_LISTE_KOLONLARI =
  'id, dosya_no, durum, olusturma_tarihi, satici_firma, alici_firma, urun_tanimi, toplam_tutar, para_birimi, proforma_no, proforma_tarihi, yuklenme_limani, varis_limani, teslim_sekli, odeme_sekli, gecerlilik_tarihi, miktar, miktar_birimi, ambalaj, lot_no, urun_detaylari, toplam_konteyner, created_by, marka, beyanname_no, fatura_no, fatura_tarihi, bl_no, diib_no, diib_tarihi, uretim_tarihi, son_kullanim_tarihi, navlun_tutari, fatura_talimati_gonderildi, konsimento_dosya_url, konsimento_dosya_adi, konsimento_yukleme_tarihi, vgm_gonderildi, ana_siparis_id, fatura_dosya_url, fatura_dosya_adi, fatura_yukleme_tarihi, consignee, alici_adresi, detayli_ambalaj, hesap_adi, banka, swift, hesap_numarasi, iban';