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