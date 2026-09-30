-- ============================================================================
-- Kalite / Durum Sertifikasi (Quality / Condition Certificate) - musteri
-- bazli parametre ayarlari
-- ============================================================================
-- Talep (30.09.2026): Fumigation Certificate ile ayni calisma stilinde,
-- otomatik uretilen yeni bir evrak turu: Quality / Condition Certificate.
-- Belgedeki PARAMETER/SPECIFICATION/RESULTS/METHODS tablosu MUSTERI BAZLI
-- (alici_firma) saklanir: ilk seferde bir kez girilir, sonraki sevkiyatlarda
-- ayni musteri icin otomatik onceki degerlerle gelir (kullanicinin net talebi
-- - bkz. fumigation_ayarlari ile BIREBIR AYNI desen).
--
-- parametreler: jsonb dizi, her satir { parametre, spesifikasyon, sonuc, metod }.
-- Varsayilan degerler bu tablo bos olarak birakilir - ilk kullanimda
-- kalite-sertifikasi-ayar-modal.tsx'teki VARSAYILAN degerlerle (ornek
-- belgeden - RAINTREE/EBKG17392211 - alinan un/wheat flour parametreleri)
-- doldurulur, kullanici duzenleyip kaydeder.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kalite_sertifikasi_ayarlari (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alici_firma   text NOT NULL,
  parametreler  jsonb,
  created_by    uuid DEFAULT auth.uid(),
  updated_at    timestamp without time zone,
  company_id    uuid NOT NULL
);

COMMENT ON TABLE public.kalite_sertifikasi_ayarlari IS
  'Quality / Condition Certificate icin musteri (alici_firma) bazli PARAMETER/SPECIFICATION/RESULTS/METHODS tablosu. fumigation_ayarlari ile ayni desen: (company_id, alici_firma) bazinda tek kayit, ilk seferde girilir, sonraki sevkiyatlarda otomatik on-doldurulur.';
COMMENT ON COLUMN public.kalite_sertifikasi_ayarlari.parametreler IS
  'jsonb dizi: [{ "parametre": "Protein (N X 5.7on dry basis)", "spesifikasyon": "min 13%", "sonuc": "13,1", "metod": "ISO 20483" }, ...]. Tum tablo (satir sayisi dahil) duzenlenebilir.';

CREATE UNIQUE INDEX IF NOT EXISTS kalite_sertifikasi_ayarlari_musteri_uniq
  ON public.kalite_sertifikasi_ayarlari (company_id, alici_firma);

ALTER TABLE public.kalite_sertifikasi_ayarlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY kalite_sertifikasi_select_own_company
  ON public.kalite_sertifikasi_ayarlari FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY kalite_sertifikasi_insert_own_company
  ON public.kalite_sertifikasi_ayarlari FOR INSERT
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY kalite_sertifikasi_update_own_company
  ON public.kalite_sertifikasi_ayarlari FOR UPDATE
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY kalite_sertifikasi_delete_own_company
  ON public.kalite_sertifikasi_ayarlari FOR DELETE
  USING (company_id = auth_company_id());
