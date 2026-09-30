-- ============================================================================
-- REPO <-> CANLI SENKRONIZASYONU #2 (tarihsel not)
-- ============================================================================
-- 30.09.2026'da yapilan genel saglik taramasinda tespit edildi: canli
-- veritabaninda (proje ref: tnzbihsfbhqzkcliicdk) `supabase migration list`
-- ile gorulen ASAGIDAKI 5 migration UYGULANMIS ama bu repoya HICBIR ZAMAN
-- YANSITILMAMISTI (bkz. 20260907180000_canli_durum_ile_senkronizasyon.sql'deki
-- ayni turden ilk senkron notu ve ayni dosyadaki "ekip supabase db pull
-- calistirsin" onerisi):
--
--   20260926063231  companies_varsayilan_diib_no
--   20260926083820  ihracat_dosyalari_proforma_dosya_url
--   20260928060623  ihracat_dosyalari_ectn_basvurusu
--   20260928062822  ihracat_dosyalari_ectn_manuel_tutarlar
--   20260929074142  add_ectn_insurance_override
--
-- Bu alanlar uygulama kodu tarafindan AKTIF kullaniliyor (bkz.
-- app/ayarlar/ihracat, app/yeni-dosya, app/dosya/[id], lib/invoice-builder.ts,
-- components/ectn-degerleri-modal.tsx) — yani bu dosya olmadan bu repodan
-- SIFIRDAN kurulan bir veritabaninda (staging/dev/felaket kurtarma) uygulama
-- bu alanlar olmadigi icin hata verir.
--
-- Bu dosya, o 5 migration'in NET SONUCUNU, canli veritabaninin
-- information_schema'sindan (kolon adi/tipi/yorumu) dogrudan okunarak
-- cikarilmis haliyle, TEK bir idempotent dosyada toplar. Orijinal 5 dosyanin
-- birebir tarihsel/adim-adim hali DEGILDIR (o dosyalarin kendisine erisimimiz
-- yoktu) — ama vardigi NIHAI DURUM birebir dogrulanmis ve canliyla eslesecek
-- sekilde yazilmistir.
--
-- Idempotent yazim kurallari (baseline ve #1 senkron dosyasiyla ayni
-- disiplin): ADD COLUMN IF NOT EXISTS, veri silen hicbir komut
-- (DROP TABLE/TRUNCATE/DELETE) YOKTUR.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) companies_varsayilan_diib_no
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS varsayilan_diib_no text;

COMMENT ON COLUMN public.companies.varsayilan_diib_no IS
  'Ayarlar > Ihracat Ayarlari sayfasindan yonetilir. Yeni acilan her dosyanin DIIB No alanina baslangic degeri olarak kopyalanir (bkz. app/yeni-dosya/page.tsx). Dahilde isleme rejimi limiti dolup DIIB No degistiginde burasi guncellenir; zaten acik olan dosyalari GERIYE DONUK etkilemez.';


-- ----------------------------------------------------------------------------
-- 2) ihracat_dosyalari_proforma_dosya_url — orijinal proforma PDF'i
-- ----------------------------------------------------------------------------
ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS proforma_dosya_url text,
  ADD COLUMN IF NOT EXISTS proforma_dosya_adi text;

COMMENT ON COLUMN public.ihracat_dosyalari.proforma_dosya_url IS
  'Yeni Dosya Ac akisinda yuklenen orijinal proforma PDF''inin storage''daki imzali URL''i (konsimento-talimatlari bucket, {dosya_id}/proforma/... yolu). Bu ozellik 26.09.2026''da eklendi - o tarihten ONCE olusturulmus dosyalarda bu alan bos kalir, PDF geriye donuk eklenemez.';
COMMENT ON COLUMN public.ihracat_dosyalari.proforma_dosya_adi IS
  'Yuklenen orijinal proforma PDF dosyasinin gorunen adi.';


-- ----------------------------------------------------------------------------
-- 3) ihracat_dosyalari_ectn_basvurusu + ectn_manuel_tutarlar +
--    add_ectn_insurance_override — ECTN Commercial Invoice satirlari
-- ----------------------------------------------------------------------------
ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS ectn_basvurusu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ectn_fob_override numeric,
  ADD COLUMN IF NOT EXISTS ectn_freight_override numeric,
  ADD COLUMN IF NOT EXISTS ectn_cfr_override numeric,
  ADD COLUMN IF NOT EXISTS ectn_insurance_override numeric;

COMMENT ON COLUMN public.ihracat_dosyalari.ectn_basvurusu IS
  'Bu sevkiyat icin ECTN basvurusu yapilacak mi (talep: 28.09.2026). true ise Commercial Invoice belgesinde TOTAL FOB / FREIGHT / TOTAL CFR <liman> satirlari eklenir (bkz. lib/invoice-builder.ts). Varsayilan false - mevcut/eski dosyalar etkilenmez, belge eskisi gibi kalir.';
COMMENT ON COLUMN public.ihracat_dosyalari.ectn_fob_override IS
  'ECTN Commercial Invoice''deki TOTAL FOB satirinin manuel (kullanici tarafindan girilen) degeri (talep: 28.09.2026). NULL ise toplam_tutar''dan otomatik hesaplanir. Sadece ectn_basvurusu=true iken kullanilir.';
COMMENT ON COLUMN public.ihracat_dosyalari.ectn_freight_override IS
  'ECTN Commercial Invoice''deki FREIGHT satirinin manuel (kullanici tarafindan girilen) degeri (talep: 28.09.2026). NULL ise navlun_tutari * konteyner_adedi''nden otomatik hesaplanir. Sadece ectn_basvurusu=true iken kullanilir.';
COMMENT ON COLUMN public.ihracat_dosyalari.ectn_cfr_override IS
  'ECTN Commercial Invoice''deki TOTAL CFR <liman> satirinin manuel (kullanici tarafindan girilen) degeri (talep: 28.09.2026). NULL ise FOB+FREIGHT''ten (override edilmis degerler dahil) otomatik hesaplanir. Sadece ectn_basvurusu=true iken kullanilir.';
COMMENT ON COLUMN public.ihracat_dosyalari.ectn_insurance_override IS
  'ECTN Commercial Invoice INSURANCE satiri icin elle girilen tutar. Otomatik hesaplama YOK (talep: 29.09.2026) - NULL ise satir hic gosterilmez.';


-- ============================================================================
-- SENKRONIZASYON SONU — bu dosya yazildiktan sonra repo migration'lari ile
-- canli veritabani arasinda BILINEN bir fark KALMAMISTIR (30.09.2026 itibariyla,
-- `depositors` tablosu haric - o kasitli olarak disarida birakildi, bkz.
-- 20260907180000_canli_durum_ile_senkronizasyon.sql basligindaki not; bu
-- projenin uygulama kodu tarafindan kullanilmadigi teyit edildi).
--
-- TAM TARIHSEL SENKRON ICIN ONERI: ekip firsat buldukca Supabase CLI ile
-- `supabase db pull` calistirip bundan sonraki migration'lari bu sekilde
-- geriye donuk yamamak yerine normal akisla (CLI ile migration olusturup push
-- ederek) repoya kazandirmayi degerlendirebilir; bu iki senkron dosyasi o ana
-- kadar koprudur.
-- ============================================================================
