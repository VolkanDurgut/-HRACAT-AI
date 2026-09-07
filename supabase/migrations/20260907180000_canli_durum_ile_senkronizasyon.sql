-- ============================================================================
-- REPO <-> CANLI SENKRONIZASYONU (tarihsel not)
-- ============================================================================
-- 20260618000000_baseline_schema.sql yazildiktan SONRA, canli veritabaninda
-- (proje ref: tnzbihsfbhqzkcliicdk) `supabase migration list` ile gorulen
-- ASAGIDAKI 10 migration UYGULANMIS ama bu repoya HICBIR ZAMAN YANSITILMAMIS:
--
--   20260813173116  remove_unrelated_project_tables
--   20260820185607  destek_mesajlari_tablosu
--   20260820200146  rls_yetki_yukseltme_acigi_kapatildi
--   20260820200602  get_auth_company_id_search_path_sabitlendi
--   20260821102522  konteynerler_irsaliye_sutunlari
--   20260821105038  storage_dosya_id_cikarma_fonksiyonu
--   20260821105058  storage_sirket_bazli_rls_ve_private_bucket
--   20260821155309  composite_index_company_durum
--   20260822193203  create_depositors_table   -> BU PROJEYE AIT DEGIL, BURADA
--                    KASITLI OLARAK ATLANDI (baska bir projenin tablosu,
--                    "depositors" ve ona ait atomic_upsert_pending_depositor()
--                    fonksiyonu bu dosyaya dahil edilmedi).
--   20260902233324  dosya_evraklari_durum_alani
--
-- Bu dosya, o 9 migration'in (depositors haric) NET SONUCUNU, canli
-- veritabaninin pg_catalog / information_schema / pg_policies gibi sistem
-- kataloglarindan DOGRUDAN OKUNARAK cikarilmis haliyle, TEK bir idempotent
-- dosyada toplar. Orijinal 9 dosyanin birebir tarihsel/adim-adim hali DEGILDIR
-- (o dosyalarin kendisine erisimimiz yoktu) — ama vardigi NIHAI DURUM
-- birebir dogrulanmis ve canliyla eslesecek sekilde yazilmistir.
--
-- TAM TARIHSEL SENKRON ICIN ONERI: ekip, Supabase CLI ile
-- `supabase db pull` calistirip bu 9 migration'i kendi orijinal
-- dosyalari halinde de repoya cekebilir; bu dosya o ana kadar koprudur.
--
-- Idempotent yazim kurallari (baseline dosyasiyla ayni disiplin):
--   CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--   CREATE OR REPLACE FUNCTION, DROP TRIGGER/POLICY IF EXISTS + CREATE.
--   Veri silen hicbir komut (DROP TABLE/TRUNCATE/DELETE) YOKTUR.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) destek_mesajlari_tablosu — yeni tablo (destek/AI asistan sohbet gecmisi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.destek_mesajlari (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  gonderen TEXT NOT NULL CHECK (gonderen = ANY (ARRAY['kullanici'::text, 'asistan'::text])),
  mesaj TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT destek_mesajlari_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destek_mesajlari_company_id_fkey') THEN
    ALTER TABLE public.destek_mesajlari ADD CONSTRAINT destek_mesajlari_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destek_mesajlari_user_id_fkey') THEN
    ALTER TABLE public.destek_mesajlari ADD CONSTRAINT destek_mesajlari_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS destek_mesajlari_user_id_idx ON public.destek_mesajlari USING btree (user_id, created_at);

ALTER TABLE public.destek_mesajlari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kullanici kendi destek mesajlarini yonetsin" ON public.destek_mesajlari;
CREATE POLICY "Kullanici kendi destek mesajlarini yonetsin" ON public.destek_mesajlari
  FOR ALL TO public
  USING (company_id = get_auth_company_id() AND user_id = auth.uid())
  WITH CHECK (company_id = get_auth_company_id() AND user_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 2) contact_messages — yeni tablo (herkese acik "bize ulasin" formu)
--    NOT: RLS acik ama BILEREK hicbir policy yok (canlidaki gercek durum) —
--    yani API uzerinden ne okunabilir ne yazilabilir; muhtemelen bir Edge
--    Function service-role ile yaziyor. Degistirilmedi, oldugu gibi yansitildi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  subject VARCHAR,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contact_messages_pkey PRIMARY KEY (id)
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
-- (Kasitli olarak policy eklenmedi — canlidaki durumla ayni: deny-all.)


-- ----------------------------------------------------------------------------
-- 3) konteynerler_irsaliye_sutunlari — yeni kolonlar
-- ----------------------------------------------------------------------------
ALTER TABLE public.konteynerler
  ADD COLUMN IF NOT EXISTS marka TEXT,
  ADD COLUMN IF NOT EXISTS irsaliye_dosya_url TEXT,
  ADD COLUMN IF NOT EXISTS irsaliye_dosya_adi TEXT,
  ADD COLUMN IF NOT EXISTS irsaliye_yukleme_tarihi TIMESTAMPTZ;


-- ----------------------------------------------------------------------------
-- 4) dosya_evraklari_durum_alani — yeni kolon (taslak/orijinal evrak ayrimi)
-- ----------------------------------------------------------------------------
ALTER TABLE public.dosya_evraklari
  ADD COLUMN IF NOT EXISTS durum TEXT NOT NULL DEFAULT 'taslak';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dosya_evraklari_durum_check'
  ) THEN
    ALTER TABLE public.dosya_evraklari
      ADD CONSTRAINT dosya_evraklari_durum_check CHECK (durum = ANY (ARRAY['taslak'::text, 'orijinal'::text]));
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 5) ihracat_dosyalari — Draft B/L (konsimento taslagi) sutunlari
--    (baseline sonrasi eklenmis, hangi tarihli migration'a ait oldugu net
--    degil ama canlida mevcut; burada eksiksiz yansitiliyor)
-- ----------------------------------------------------------------------------
ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS draft_bl_dosya_url TEXT,
  ADD COLUMN IF NOT EXISTS draft_bl_dosya_adi TEXT,
  ADD COLUMN IF NOT EXISTS draft_bl_yukleme_tarihi TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draft_bl_kontrol_sonucu JSONB;


-- ----------------------------------------------------------------------------
-- 6) ihracat_dosyalari — otomatik dosya numarasi (IHR-YYYY-0001 formati)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.ihracat_dosya_sira
  START WITH 1 INCREMENT BY 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.auto_dosya_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  IF NEW.dosya_no IS NULL OR NEW.dosya_no = '' THEN
    year_part := EXTRACT(YEAR FROM NOW())::TEXT;
    seq_num := nextval('ihracat_dosya_sira');
    NEW.dosya_no := 'IHR-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_dosya_no ON public.ihracat_dosyalari;
CREATE TRIGGER trg_auto_dosya_no
  BEFORE INSERT ON public.ihracat_dosyalari
  FOR EACH ROW EXECUTE FUNCTION public.auto_dosya_no();


-- ----------------------------------------------------------------------------
-- 7) updated_at alanlarini otomatik guncelleyen ortak trigger fonksiyonu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ihracat_dosyalari_updated_at ON public.ihracat_dosyalari;
CREATE TRIGGER trg_ihracat_dosyalari_updated_at
  BEFORE UPDATE ON public.ihracat_dosyalari
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_konteynerler_updated_at ON public.konteynerler;
CREATE TRIGGER trg_konteynerler_updated_at
  BEFORE UPDATE ON public.konteynerler
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_rezervasyonlar_updated_at ON public.rezervasyonlar;
CREATE TRIGGER trg_rezervasyonlar_updated_at
  BEFORE UPDATE ON public.rezervasyonlar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 8) composite_index_company_durum — performans indeksi
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_company_durum
  ON public.ihracat_dosyalari USING btree (company_id, durum);


-- ----------------------------------------------------------------------------
-- 9) get_auth_company_id_search_path_sabitlendi
--    Baseline'daki surumde "SET search_path" YOKTU (guvenlik acigina yol
--    acabilecek "mutable search_path" durumu). Canlida duzeltilmis hali
--    asagida birebir yansitiliyor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN (
        SELECT company_id
        FROM public.kullanici_rolleri
        WHERE user_id = auth.uid()
        LIMIT 1
    );
END;
$function$;


-- ----------------------------------------------------------------------------
-- 10) storage_dosya_id_cikarma_fonksiyonu + storage_sirket_bazli_rls_ve_private_bucket
--     Depolama (storage) objelerinin yolundan dosya/sirket kimligini cikarip
--     sirket bazli erisim kontrolu saglayan fonksiyonlar, bucket'lar ve
--     storage.objects politikalari.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_path_dosya_id(object_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  parcalar text[];
  aday text;
  uuid_regex text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  parcalar := string_to_array(object_name, '/');
  if parcalar is null or array_length(parcalar, 1) < 1 then
    return null;
  end if;

  aday := parcalar[1];
  if aday ~ uuid_regex then
    return aday::uuid;
  end if;

  if array_length(parcalar, 1) >= 2 then
    aday := parcalar[2];
    if aday ~ uuid_regex then
      return aday::uuid;
    end if;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.storage_path_company_id(object_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.ihracat_dosyalari where id = public.storage_path_dosya_id(object_name);
$function$;

-- Private bucket'lar (idempotent — zaten varsa dokunmaz)
INSERT INTO storage.buckets (id, name, public)
VALUES ('evraklar', 'evraklar', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('konsimento-talimatlari', 'konsimento-talimatlari', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sirket_evrak_select" ON storage.objects;
CREATE POLICY "sirket_evrak_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('evraklar', 'konsimento-talimatlari')
    AND storage_path_company_id(name) = get_auth_company_id()
  );

DROP POLICY IF EXISTS "sirket_evrak_insert" ON storage.objects;
CREATE POLICY "sirket_evrak_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('evraklar', 'konsimento-talimatlari')
    AND storage_path_company_id(name) = get_auth_company_id()
  );

DROP POLICY IF EXISTS "sirket_evrak_update" ON storage.objects;
CREATE POLICY "sirket_evrak_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('evraklar', 'konsimento-talimatlari')
    AND storage_path_company_id(name) = get_auth_company_id()
  )
  WITH CHECK (
    bucket_id IN ('evraklar', 'konsimento-talimatlari')
    AND storage_path_company_id(name) = get_auth_company_id()
  );

DROP POLICY IF EXISTS "sirket_evrak_delete" ON storage.objects;
CREATE POLICY "sirket_evrak_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('evraklar', 'konsimento-talimatlari')
    AND storage_path_company_id(name) = get_auth_company_id()
  );


-- ----------------------------------------------------------------------------
-- 11) rls_yetki_yukseltme_acigi_kapatildi  (EN KRITIK DUZELTME)
-- ----------------------------------------------------------------------------
-- Baseline dosyasindaki "Sahibi Yonetsin" politikasi, kullanici_rolleri
-- tablosunda FOR ALL (yani UPDATE/DELETE dahil) izin veriyordu ve SADECE
-- "auth.uid() = user_id" kontrolu yapiyordu — company_id veya rol alaninda
-- HICBIR KISITLAMA YOKTU. Bu, herhangi bir kullanicinin kendi company_id
-- degerini BASKA BIR SIRKETINKIYLE degistirerek o sirketin TUM verisine
-- (RLS bu alanla calistigi icin) erismesine izin veren KRITIK bir sirketler
-- arasi yetki yukseltme acigiydi. 20 Agustos 2026'da canlida kapatilmis;
-- burada ayni duzeltme repoya kazandiriliyor: sadece kendi satirini
-- GORME izni kaliyor, YAZMA (insert/update/delete) tamamen kaldiriliyor.
-- (Satir olusturma zaten SECURITY DEFINER handle_new_user() trigger'i
-- uzerinden yapiliyor, bu politikadan etkilenmez.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sahibi Yonetsin" ON public.kullanici_rolleri;

DROP POLICY IF EXISTS "Kullanici kendi rolunu gorsun" ON public.kullanici_rolleri;
CREATE POLICY "Kullanici kendi rolunu gorsun" ON public.kullanici_rolleri
  FOR SELECT TO public
  USING (auth.uid() = user_id);

-- kullanici_yetkileri icin de ayni disiplinle: baseline'daki tek "FOR ALL"
-- politikasi (sirket icindeki HERKESE yazma izni veriyordu) kaldirilip,
-- okuma/yazma ayri politikalara bolunuyor. NOT: buradaki "admin rolu"
-- sarti, 2026-09-07 tarihli "kullanici_yetkileri_yazma_super_admin_kisitlamasi"
-- migration'i tarafindan HEMEN ARDINDAN sabit iki e-postaya indirilecek
-- (bu dosya calistiktan SONRA o dosya calisir) — burada sadece o ana kadarki
-- gercek tarihi ara durum dogru yansitiliyor.
DROP POLICY IF EXISTS "Sirket Yonetsin - Kullanici Yetkileri" ON public.kullanici_yetkileri;

DROP POLICY IF EXISTS "Sirket calisanlari kendi yetkilerini gorsun" ON public.kullanici_yetkileri;
CREATE POLICY "Sirket calisanlari kendi yetkilerini gorsun" ON public.kullanici_yetkileri
  FOR SELECT TO public
  USING (company_id = get_auth_company_id());

DROP POLICY IF EXISTS "Sadece admin yetkileri yonetsin" ON public.kullanici_yetkileri;
CREATE POLICY "Sadece admin yetkileri yonetsin" ON public.kullanici_yetkileri
  FOR ALL TO public
  USING (
    company_id = get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM public.kullanici_rolleri kr
      WHERE kr.user_id = auth.uid()
        AND kr.company_id = kullanici_yetkileri.company_id
        AND kr.rol = 'admin'
    )
  )
  WITH CHECK (
    company_id = get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM public.kullanici_rolleri kr
      WHERE kr.user_id = auth.uid()
        AND kr.company_id = kullanici_yetkileri.company_id
        AND kr.rol = 'admin'
    )
  );

-- ============================================================================
-- SENKRONIZASYON SONU — bir sonraki dosya (kullanici_yetkileri_yazma_super_
-- admin_kisitlamasi) yukaridaki "Sadece admin yetkileri yonetsin" politikasini
-- sabit 2 e-postaya indirerek nihai/guncel hale getirir.
-- ============================================================================
