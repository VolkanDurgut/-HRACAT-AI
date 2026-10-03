-- Veritabani genel kontrolu (03.10.2026).
--
-- 1) public.nextval(text): eski senkronizasyondan kalma bir sarmalayici; anon
--    anahtariyla /rest/v1/rpc/nextval uzerinden giris yapmadan cagrilabiliyordu
--    (IHR numara sirasini bosa harcatabilirdi). DIKKAT: auto_dosya_no
--    tetikleyicisindeki nextval('ihracat_dosya_sira') cagrisi bu sarmalayiciya
--    cozumleniyordu (EXPLAIN: nextval('...'::text)). Bu yuzden ONCE tetikleyici
--    dogrudan pg_catalog.nextval(regclass)'a baglanir, SONRA yetki kaldirilir.
--    (Canlida ilk denemede sira tersti; ~1 dk icinde authenticated yetkisi geri
--    verildi, o arada dosya olusturulmadi. Kalici sira asagidaki gibidir.)
CREATE OR REPLACE FUNCTION public.auto_dosya_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE year_part TEXT; seq_num INTEGER;
BEGIN
  IF NEW.dosya_no IS NULL OR NEW.dosya_no = '' THEN
    year_part := EXTRACT(YEAR FROM NOW())::TEXT;
    seq_num := pg_catalog.nextval('public.ihracat_dosya_sira'::regclass);
    NEW.dosya_no := 'IHR-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $function$;

revoke execute on function public.nextval(text) from public, anon, authenticated;
-- Giris yapmamis kullanicinin dosya sirasina ihtiyaci yok (dosya ekleyemez).
revoke usage on sequence public.ihracat_dosya_sira from anon;

-- 2) Rezervasyonlarda bas/son bosluk (5 kayit: " YM WREATH",
--    "COSCO SHIPPING KILIMANJARO ", " BSM0J0S19", "KUMPORT " x3). Evraklara
--    aynen basiliyor ve analizde ayri deger gibi sayiliyordu.
update public.rezervasyonlar
set gemi_adi = nullif(btrim(gemi_adi), ''),
    sefer_no = nullif(btrim(sefer_no), ''),
    booking_no = btrim(booking_no),
    acente_ismi = nullif(btrim(acente_ismi), ''),
    yuklenme_limani = nullif(btrim(yuklenme_limani), '')
where gemi_adi <> btrim(gemi_adi)
   or sefer_no <> btrim(sefer_no)
   or booking_no <> btrim(booking_no)
   or acente_ismi <> btrim(acente_ismi)
   or yuklenme_limani <> btrim(yuklenme_limani);
