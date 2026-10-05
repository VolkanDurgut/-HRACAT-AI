// Merkezi export noktasi - tum import'lar buradan yapilir
// Ornek: import { supabase, Dosya, KONTEYNER_TIPLERI } from "@/lib/supabase"

export { supabase } from './supabase/client';
export { getGuvenliDosyaUrl, depoDosyalariniTopluSil, dosyaninStorageUrlleriniTopla, eskiDepoDosyasiniSil } from './supabase/storage';
export { yazmaHatasi } from './supabase/yazma-kontrol';
export type {
  Dosya,
  UrunDetay,
  Rezervasyon,
  Konteyner,
  Plaka,
  AnaSiparis,
  SurecTakibi,
  DbaKontrolSonucu,
  KonsimentoKontrolSonucu,
  FumigationAyari,
  KaliteParametresi,
  KaliteSertifikasiAyari,
} from './supabase/types';
export {
  isDosyaAcik,
  getDosyaAkisDurumu,
} from './supabase/types';
export {
  KONTEYNER_TIPLERI,
  MTS_PER_KONTEYNER,
  SUREC_ADIMLARI,
  SEVKIYAT_EVRAKLARI,
  DOSYA_DURUM,
  AKIS_ADIMLARI,
  DOSYA_LISTE_KOLONLARI,
} from './supabase/constants';
