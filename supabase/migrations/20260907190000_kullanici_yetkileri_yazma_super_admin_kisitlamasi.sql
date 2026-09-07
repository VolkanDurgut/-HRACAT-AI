-- ============================================================================
-- kullanici_yetkileri — YAZMA (insert/update/delete) yetkisini sirket-ici
-- "admin" rolunden, uygulamanin da kullandigi SABIT IKI super-admin
-- e-postasina indirir. Boylece "/ayarlar/yetkilendirme" sayfasindaki
-- (yalnizca bu iki e-postaya kilitli, bkz. lib/auth-context.tsx) on-yuz
-- kisitlamasi ile veritabani seviyesindeki gercek yetki BIREBIR ORTUSUR.
--
-- ONEMLI NOT (repo/canli senkron uyarisi):
-- Bu dosyayi yazarken canli veritabaninda, bu repodaki
-- 20260618000000_baseline_schema.sql dosyasindan SONRA uygulanmis ama repoya
-- HIC YANSITILMAMIS 10 migration daha oldugu tespit edildi (orn.
-- "rls_yetki_yukseltme_acigi_kapatildi", "create_depositors_table",
-- "dosya_evraklari_durum_alani" vb. — `supabase migration list` ile
-- gorulebilir). Yani bu repo klasoru su an CANLININ TAM BIR AYNASI DEGIL.
-- Bu dosya sadece BU turdaki degisikligi kayit altina alir; tam senkron icin
-- ekibin `supabase db pull` calistirip eksik migration'lari repoya
-- getirmesi onerilir.
--
-- OKUMA (SELECT) politikasina DOKUNULMADI: "Sirket calisanlari kendi
-- yetkilerini gorsun" politikasi sirket-genelinde okumaya izin vermeye
-- devam ediyor cunku lib/hooks/use-konteyner-form.ts bunu "user_id -> email"
-- haritasi icin kullaniyor (herkesin okuyabilmesi GEREKLI).
-- ============================================================================

drop policy if exists "Sadece admin yetkileri yonetsin" on public.kullanici_yetkileri;

create policy "Sadece super admin yetkileri yonetsin" on public.kullanici_yetkileri
  for all
  to public
  using (
    company_id = get_auth_company_id()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in ('volkandurgut.tr@gmail.com', 'buraktuncay@unex.com.tr')
  )
  with check (
    company_id = get_auth_company_id()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in ('volkandurgut.tr@gmail.com', 'buraktuncay@unex.com.tr')
  );
