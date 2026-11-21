-- ============================================================================
-- PAZAR: MUSTERI "AKTIF / SIPARISSIZ" SIPARIS LISTESINI DE GORUR (21.11.2026)
-- ============================================================================
-- Kullanici: "Siparissiz musteri hala 18 gozukuyor, aslinda onaylanan siparisleri var. En kotu onay
-- bekleyenler var mi bilmiyorum. Lutfen gerekli kontrolleri sagla."
-- Sorun: aktif = yalniz rezervasyonlu ACIK dosya / tamamlanmamis ana siparis. Siparis Listesi'ndeki
-- (siparis_listesi_veri: Excel + sistem proformasi + dosya) acik siparis hic sayilmiyordu:
--   GMB TRADING UNEXGTI161126 (on odeme alindi), OM GENERAL UNEXOMG091126 (on odeme alindi),
--   STE AYRA UNEXSAS171126 (pesinat bekliyor) "siparissiz" gorunuyor ve gunluk gorevde aday oluyordu.
-- Kural: Siparis Listesi'nde durumu onay_bekliyor / on_odeme_alindi / rezervasyonlu olan satiri olan
-- musteri AKTIF (bl_eksik = sevk edilmis, BL bekleniyor -> acik siparis sayilmaz).
-- "Son siparis" = en son dosya ya da Siparis Listesi / sistem proformasi tarihi (hangisi yeniyse).
-- siparis_listesi_veri agir (~0.8 sn): gunluk gorevde firma basina DEGIL, bir kez hesaplanir.
-- Salt okunur; veri degistirmez.
-- ============================================================================

-- Firma adi eslesmesi: ayni anahtar ya da biri digerinin basi (en az 5 harf). Siparis Listesi'nde ad
-- kisa yazilir: "COOL LINK" ~ "COOL LINK& MARKETING PTE LTD", "AL-QASRAWI" ~ "AL-QASRAWI INDUSTRIAL ...",
-- "CRISA" ~ "CRISA MIDDLE EAST OFFSHORE SAL", "SOSAR" ~ "SOSAR-IMPEX".
create or replace function public.pazar_anahtar_eslesir(p_a text[], p_b text[])
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select exists (select 1 from unnest(coalesce(p_a, '{}'::text[])) x, unnest(coalesce(p_b, '{}'::text[])) y
                  where x <> '' and y <> '' and (x = y or (least(length(x), length(y)) >= 5 and (left(x, length(y)) = y or left(y, length(x)) = x))));
$function$;

-- Siparis Listesi'nde acik siparisi olan firma anahtarlari (pazar_anahtar)
create or replace function public.pazar_acik_siparis_anahtarlari(p_company uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct public.pazar_anahtar(s.firma)) filter (where public.pazar_anahtar(s.firma) is not null), '{}'::text[])
    from public.siparis_listesi_veri(p_company) s
   where s.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu');
$function$;

create or replace function public.pazar_firma_listede_acik(p_firma uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select public.pazar_anahtar_eslesir(array_append(f.ek_anahtarlar, f.anahtar), public.pazar_acik_siparis_anahtarlari(f.company_id))
                     from public.pazar_firmalar f where f.id = p_firma), false);
$function$;

-- Son siparis: dosya (rezervasyonlu) + Siparis Listesi / sistem proformasi tarihi
create or replace function public.pazar_firma_son_siparis(p_firma uuid)
returns timestamp with time zone
language sql
stable
security definer
set search_path to 'public'
as $function$
  with f as (select company_id, array_append(ek_anahtarlar, anahtar) a from public.pazar_firmalar where id = p_firma)
  select greatest(
    (select max(d.olusturma_tarihi) from public.ihracat_dosyalari d, f
      where d.company_id = f.company_id and public.pazar_anahtar(d.alici_firma) = any(f.a)
        and exists (select 1 from public.rezervasyonlar r where r.dosya_id = d.id)),
    (select max(s.proforma_tarihi)::timestamptz from public.siparis_defteri s, f
      where s.company_id = f.company_id and s.durum <> 'iptal' and public.pazar_anahtar_eslesir(f.a, array[public.pazar_anahtar(s.firma)])),
    (select max(p.tarih)::timestamptz from public.proformalar p, f
      where p.company_id = f.company_id and public.pazar_anahtar_eslesir(f.a, array[public.pazar_anahtar(p.alici_unvan)])));
$function$;

-- Gunluk gorev: Siparis Listesi'nde acik siparisi olan MUSTERI ne siparissiz adayi ne de hatirlatma adayi
-- olur (ornek: sorgulanan GMB 16.11'de siparis verdi; ertesi gun "hatirlatma" gitmesin). Anahtarlar BIR KEZ.
do $yama$
declare
  v_def text := pg_get_functiondef('public.pazar_gorev_olustur(uuid,date,integer,text)'::regprocedure);
  v_e1 text := $e$  r record;
begin$e$;
  v_e2 text := $e$  p_adet := least($e$;
  v_e3 text := $e$         and not public.pazar_firma_aktif(u.id)$e$;
  v_e4 text := $e$       where u.crm_asama in ('sorgulandi', 'hatirlatma1') and u.sonraki_adim is not null and u.sonraki_adim <= p_tarih$e$;
begin
  if (length(v_def) - length(replace(v_def, v_e1, ''))) / length(v_e1) <> 1
     or (length(v_def) - length(replace(v_def, v_e2, ''))) / length(v_e2) <> 1
     or (length(v_def) - length(replace(v_def, v_e3, ''))) / length(v_e3) <> 1
     or (length(v_def) - length(replace(v_def, v_e4, ''))) / length(v_e4) <> 1 then
    raise exception 'pazar_gorev_olustur beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  v_def := replace(v_def, v_e1, $e$  r record;
  v_acik text[];
begin$e$);
  v_def := replace(v_def, v_e2, $e$  -- 21.11.2026: Siparis Listesi'nde acik siparisi olanlar (bir kez hesaplanir)
  v_acik := public.pazar_acik_siparis_anahtarlari(p_company);
  p_adet := least($e$);
  v_def := replace(v_def, v_e3, v_e3 || $e$
         and not public.pazar_anahtar_eslesir(array_append(u.ek_anahtarlar, u.anahtar), v_acik)$e$);
  v_def := replace(v_def, v_e4, v_e4 || $e$
         and not (u.durum = 'musteri' and (public.pazar_anahtar_eslesir(array_append(u.ek_anahtarlar, u.anahtar), v_acik) or public.pazar_firma_aktif(u.id)))$e$);
  execute v_def;
end $yama$;

-- Gorev sayfasi: "aktif" bilgisi Siparis Listesi'ni de gorur
do $yama$
declare
  v_def text := pg_get_functiondef('public.pazar_gorev_bilgi(text)'::regprocedure);
  v_eski text := $e$'aktif', public.pazar_firma_aktif(f.id))$e$;
begin
  if (length(v_def) - length(replace(v_def, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'pazar_gorev_bilgi beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  execute replace(v_def, v_eski, $e$'aktif', (public.pazar_firma_aktif(f.id) or public.pazar_firma_listede_acik(f.id)))$e$);
end $yama$;

-- Musterilerimiz karti: Siparis Listesi'ndeki acik siparisler + siparis tarihleri
do $yama$
declare
  v_def text := pg_get_functiondef('public.pazar_musteri_siparisleri()'::regprocedure);
  v_eski text := $e$    'ana_siparisler', coalesce(($e$;
begin
  if (length(v_def) - length(replace(v_def, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'pazar_musteri_siparisleri beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  execute replace(v_def, v_eski, $e$    -- 21.11.2026: Siparis Listesi'ndeki acik siparisler (pesinat bekliyor / on odeme alindi / rezervasyonlu)
    'siparis_listesi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'firma_id', mf.id, 'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi,
        'durum', s.durum, 'miktar_mt', s.miktar_mt, 'konteyner', s.konteyner, 'dosya_no', s.dosya_no,
        'booking_no', s.booking_no, 'etd', s.etd) order by s.proforma_tarihi desc nulls last, s.proforma_no)
      from public.siparis_listesi_veri(v_sirket) s
      join public.pazar_firmalar mf on mf.company_id = v_sirket and mf.durum = 'musteri'
       and public.pazar_anahtar_eslesir(array_append(mf.ek_anahtarlar, mf.anahtar), array[public.pazar_anahtar(s.firma)])
      where s.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu')), '[]'::jsonb),
    'siparis_tarihleri', coalesce((
      select jsonb_agg(jsonb_build_object('firma_id', x.id, 'tarih', x.t))
      from (select mf.id, max(y.t) t from (
              select public.pazar_anahtar(s.firma) a, s.proforma_tarihi t from public.siparis_defteri s
               where s.company_id = v_sirket and s.durum <> 'iptal' and s.proforma_tarihi is not null
              union all
              select public.pazar_anahtar(p.alici_unvan), p.tarih from public.proformalar p
               where p.company_id = v_sirket and p.tarih is not null) y
            join public.pazar_firmalar mf on mf.company_id = v_sirket and mf.durum = 'musteri'
             and public.pazar_anahtar_eslesir(array_append(mf.ek_anahtarlar, mf.anahtar), array[y.a])
            group by mf.id) x), '[]'::jsonb),
$e$ || v_eski);
end $yama$;

revoke all on function public.pazar_anahtar_eslesir(text[], text[]) from public, anon;
grant execute on function public.pazar_anahtar_eslesir(text[], text[]) to authenticated, service_role;
revoke all on function public.pazar_acik_siparis_anahtarlari(uuid) from public, anon, authenticated;
revoke all on function public.pazar_firma_listede_acik(uuid) from public, anon, authenticated;
grant execute on function public.pazar_acik_siparis_anahtarlari(uuid) to service_role;
grant execute on function public.pazar_firma_listede_acik(uuid) to service_role;
