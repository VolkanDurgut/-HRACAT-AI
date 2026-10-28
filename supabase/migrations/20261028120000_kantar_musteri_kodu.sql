-- Kantar Paneli: musteri adi SUNUCUDA gizlenir (28.10.2026).
-- Kullanici: "Kantar panelinde hangi sevkiyattan kac tane dolu gozukebilmeli; musteri ismi
-- sifrelenecek, anlasilabilir sekilde." Secim: proformadaki MUSTERI KODU (CCS, CME, IKY...).
--
-- ONCEKI DURUM: kantar_dosya_listesi() alici_firma'yi TAM ad olarak donduruyordu; gizleme sadece
-- tarayicida yapiliyordu (gelistirici araclarinda tam ad gorunurdu). Kantar rolu
-- ihracat_dosyalari'ni dogrudan okuyamaz (RLS rol bazli) - tek kaynak bu fonksiyondu.
--
-- Bu migration SADECE fonksiyon ekler / degistirir; tablo ve veri DEGISMEZ.
--   * kantar_musteri_kodu(proforma_no, alici_firma): "UNEXCCS160926 / ..." -> "CCS";
--     proforma kodu yoksa unvanin bas harfleri (hukuki ekler ve tek harfler haric, en fazla 4) ; o da yoksa "—".
--   * kantar_sevkiyat_listesi(): kantar_dosya_listesi ile ayni kapsam (kendi sirketi), alici adi
--     YERINE musteri_kodu.
--   * kantar_dosya_listesi(): imza ayni (eski istemci bozulmasin), alici_firma kolonu artik KOD doner.

CREATE OR REPLACE FUNCTION public.kantar_musteri_kodu(p_proforma text, p_alici text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    substring(upper(split_part(coalesce(p_proforma, ''), '/', 1)) from '^\s*UNEX([A-Z]{2,6})[0-9]'),
    nullif((
      SELECT string_agg(left(w, 1), '' ORDER BY n)
      FROM (
        SELECT w, n
        FROM regexp_split_to_table(upper(regexp_replace(coalesce(p_alici, ''), '[^A-Za-z ]', ' ', 'g')), '\s+') WITH ORDINALITY AS t(w, n)
        WHERE length(w) > 1 AND w NOT IN ('LTD', 'SARL', 'SARLU', 'SA', 'SAL', 'SL', 'LLC', 'PTE', 'INC', 'CO', 'EURL', 'DE', 'CV', 'ETS', 'STE', 'AND')
        ORDER BY n
        LIMIT 4
      ) x
    ), ''),
    '—'
  );
$function$;

REVOKE ALL ON FUNCTION public.kantar_musteri_kodu(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kantar_musteri_kodu(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kantar_sevkiyat_listesi()
 RETURNS TABLE(id uuid, dosya_no text, durum text, marka text, musteri_kodu text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.dosya_no, d.durum, d.marka, public.kantar_musteri_kodu(d.proforma_no, d.alici_firma)
  FROM public.ihracat_dosyalari d
  WHERE d.company_id = public.get_auth_company_id();
$function$;

REVOKE ALL ON FUNCTION public.kantar_sevkiyat_listesi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kantar_sevkiyat_listesi() TO authenticated, service_role;

-- Eski fonksiyon: imza ayni, tam ad yerine kod (yayin arasindaki eski istemci de tam adi alamaz)
CREATE OR REPLACE FUNCTION public.kantar_dosya_listesi()
 RETURNS TABLE(id uuid, dosya_no text, durum text, marka text, alici_firma text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, dosya_no, durum, marka, public.kantar_musteri_kodu(proforma_no, alici_firma)
  FROM public.ihracat_dosyalari
  WHERE company_id = public.get_auth_company_id();
$function$;

REVOKE ALL ON FUNCTION public.kantar_dosya_listesi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kantar_dosya_listesi() TO authenticated, service_role;
