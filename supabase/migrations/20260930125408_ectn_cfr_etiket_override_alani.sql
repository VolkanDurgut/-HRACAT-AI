-- ============================================================================
-- ECTN Commercial Invoice - TOTAL CFR/CIF etiketi icin manuel override alani
-- ============================================================================
-- Talep (30.09.2026, ornek dosya: CULVIST2601427/UNEXBFB090926): Commercial
-- Invoice'ta ECTN blogunun son satiri sigorta girilsin girilmesin HER ZAMAN
-- sabit "TOTAL CFR <liman>" yaziyordu. Ancak Incoterm kurallarina gore
-- sigorta (INSURANCE) satiri toplama dahil edildiginde bu artik CFR (Cost +
-- Freight) degil CIF'tir (Cost + Insurance + Freight) - yani etiket yanlis
-- oluyordu.
--
-- Bu alan bu sorunu iki katmanda cozer (bkz. lib/invoice-builder.ts ->
-- hesaplaEctnGosterilenDegerler):
--   1) OTOMATIK: sigorta girilmisse "TOTAL CIF <liman>", girilmemisse
--      "TOTAL CFR <liman>" - kullanici hicbir sey yapmadan dogru terim secilir.
--   2) MANUEL: bu alan doluysa, otomatik mantik ATLANIR ve buradaki metin
--      AYNEN kullanilir (liman adi dahil) - istisnai durumlarda (ör. farkli
--      bir terminoloji istenirse) ekip ECTN Tutarlari modalinden elle
--      duzeltebilir.
-- ============================================================================

ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS ectn_cfr_etiket_override text;

COMMENT ON COLUMN public.ihracat_dosyalari.ectn_cfr_etiket_override IS
  'Commercial Invoice''deki TOTAL CFR/CIF satirinin etiketini elle degistirmek icin (talep: 30.09.2026). NULL ise otomatik secilir: INSURANCE girilmisse "TOTAL CIF <liman>", girilmemisse "TOTAL CFR <liman>" (Incoterm kurallarina uygun). Doluysa bu metin AYNEN kullanilir (liman adi dahil, tam metni kullanici kendisi yazar).';
