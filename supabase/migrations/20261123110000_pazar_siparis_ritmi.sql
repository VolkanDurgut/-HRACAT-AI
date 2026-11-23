-- 23.11.2026 PAZAR - SIPARIS RITMI SUNUCUDA (gorev sistemi + haftalik siparissiz ozeti icin). Kullanici: "Siparisi olmayan
-- musterilerimiz export arkadasimiza iletilmeli ... her gun gorev olarak belirleniyor, o sisteme oncelik olarak dahil edemiyor muyuz".
-- 1) pazar_musteri_sevkiyatlari_sirket(p_company): 20261123101000'deki govdenin AYNISI, oturumsuz (zamanlanmis isler icin);
--    yalniz SECURITY DEFINER fonksiyonlardan cagrilir (public / anon / authenticated YETKISIZ).
-- 2) pazar_musteri_sevkiyatlari(): oturum + yetki kontrolu ayni, govde (1)'i cagirir (cikti BIREBIR ayni).
-- 3) pazar_siparis_ritmi(p_company, p_bugun): lib/pazar/siparis-ritmi.ts musteriRitmi'nin SQL karsiligi (dalga 7 gun, ritim =
--    ortanca aralik (en az 3 dalga), tedarik musteri / genel / 31, tolerans max(14, ritim/2), yolda / yuklemede: ETA ya da liman
--    transit ortalamasi + 7 gun, yoksa 45 gun). Hicbir kayit degismez.

create or replace function public.pazar_musteri_sevkiyatlari_sirket(p_company uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sonuc jsonb;
begin
  if p_company is null then return null; end if;
  with mf as (
    select id, array_append(ek_anahtarlar, anahtar) a from public.pazar_firmalar where company_id = p_company and durum = 'musteri'
  ), pl as (
    select p.id, public.pazar_anahtar(p.musteri) pa, p.musteri, p.etd, coalesce(p.konteyner, 0) konteyner, p.booking_no,
           p.varis_limani, p.rezervasyon_id, p.siparis_id
      from public.sevkiyat_plani p
     where p.company_id = p_company and p.etd is not null
  ), plf as (
    select pl.*,
           (select mf.id from mf where public.pazar_anahtar_eslesir(mf.a, array[pl.pa]) order by mf.id limit 1) firma_id,
           (select r.id from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
             where d.company_id = p_company
               and (r.id = pl.rezervasyon_id
                    or (nullif(btrim(pl.booking_no), '') is not null and public.booking_anahtar(r.booking_no) = public.booking_anahtar(pl.booking_no)))
             order by (r.id = pl.rezervasyon_id) desc limit 1) rez_id
      from pl
  ), ilk as (
    -- 23.11.2026 duzeltme: tedarik = siparisin (proforma, revize eki R ayni) ILK sevkiyati - proforma tarihi. Her booking ayri
    -- sayilinca aylara yayilan buyuk proformalar sureyi sisiriyordu (ESFIRA 225, COOL LINK 95 gun).
    select plf.firma_id, public.siparis_anahtar(s.proforma_no) pk, min(s.proforma_tarihi) pt, min(plf.etd) etd
      from plf join public.siparis_defteri s on s.id = plf.siparis_id
     where s.proforma_tarihi is not null
     group by plf.firma_id, public.siparis_anahtar(s.proforma_no)
  ), olcum as (
    -- 120 gunu asan olcum (uzun vadeli anlasma / plan oncesi sevkiyat) alinmaz
    select firma_id, (etd - pt) g from ilk where etd - pt between 0 and 120
  ), rz as (
    select r.id, public.pazar_anahtar(d.alici_firma) pa, r.gemi_kalkis_tarihi etd, coalesce(r.konteyner_adedi, 0) konteyner,
           r.booking_no, d.varis_limani, r.eta, d.durum
      from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
     where d.company_id = p_company and r.gemi_kalkis_tarihi is not null
       and not exists (select 1 from plf where plf.rez_id = r.id)
  )
  select jsonb_build_object(
    'sevkiyatlar', coalesce((
      select jsonb_agg(x order by x->>'etd') from (
        select jsonb_build_object('firma_id', plf.firma_id, 'etd', plf.etd, 'konteyner', plf.konteyner, 'booking', plf.booking_no,
                 'varis', plf.varis_limani, 'kaynak', 'plan',
                 'eta', (select r.eta from public.rezervasyonlar r where r.id = plf.rez_id),
                 'kapali', (select d.durum in ('Kapalı', 'Kapali') from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id where r.id = plf.rez_id)) x
          from plf where plf.firma_id is not null
        union all
        select jsonb_build_object('firma_id', f.id, 'etd', rz.etd, 'konteyner', rz.konteyner, 'booking', rz.booking_no,
                 'varis', rz.varis_limani, 'kaynak', 'dosya', 'eta', rz.eta, 'kapali', rz.durum in ('Kapalı', 'Kapali'))
          from rz cross join lateral (select mf.id from mf where public.pazar_anahtar_eslesir(mf.a, array[rz.pa]) order by mf.id limit 1) f
      ) s), '[]'::jsonb),
    -- musterinin ortancasi 90 gunu asarsa genel ortanca kullanilir (istemci tarafinda: tedarik listesinde yoksa genel)
    'tedarik', coalesce((
      select jsonb_agg(jsonb_build_object('firma_id', t.firma_id, 'gun', t.g, 'n', t.n)) from (
        select o.firma_id, percentile_cont(0.5) within group (order by o.g) g, count(*) n
          from olcum o where o.firma_id is not null group by o.firma_id) t
       where t.g <= 90), '[]'::jsonb),
    'tedarik_genel', (select percentile_cont(0.5) within group (order by o.g) from olcum o),
    'eslesmeyen', coalesce((
      select jsonb_agg(jsonb_build_object('ad', e.ad, 'sevkiyat', e.n, 'konteyner', e.k, 'son_etd', e.s) order by e.s desc) from (
        select min(plf.musteri) ad, count(*) n, sum(plf.konteyner) k, max(plf.etd) s from plf where plf.firma_id is null group by plf.pa) e), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end; $function$;

revoke all on function public.pazar_musteri_sevkiyatlari_sirket(uuid) from public, anon, authenticated;

create or replace function public.pazar_musteri_sevkiyatlari()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  return public.pazar_musteri_sevkiyatlari_sirket(v_sirket);
end; $function$;

revoke all on function public.pazar_musteri_sevkiyatlari() from public, anon;
grant execute on function public.pazar_musteri_sevkiyatlari() to authenticated;

create or replace function public.pazar_siparis_ritmi(p_company uuid, p_bugun date default (now() at time zone 'Europe/Istanbul')::date)
 returns table(firma_id uuid, durum text, fark integer, ritim_gun integer, dalga integer, son_etd date, ort_konteyner numeric,
               tedarik_gun integer, beklenen_siparis date, yolda_konteyner integer, yuklemede_konteyner integer)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb := public.pazar_musteri_sevkiyatlari_sirket(p_company);
  v_genel numeric := nullif((v->>'tedarik_genel'), '')::numeric;
begin
  if v is null then return; end if;
  return query
  with sev as (
    select x.firma_id, x.etd, greatest(coalesce(x.konteyner, 0), 0)::int konteyner, x.varis, x.eta,
           nullif(regexp_replace(upper(coalesce(x.varis, '')), '[^A-Z]', '', 'g'), '') liman
      from jsonb_to_recordset(coalesce(v->'sevkiyatlar', '[]'::jsonb)) as x(firma_id uuid, etd date, konteyner int, varis text, eta date)
     where x.firma_id is not null and x.etd is not null
  ), transit as (
    -- lib/sevkiyat-aktif limanTransitGunleri: ETA'li sevkiyatlarda liman basina ortalama (1..120 gun) + 7
    select s.liman, round(avg(s.eta - s.etd)::numeric)::int + 7 gun
      from sev s where s.liman is not null and s.eta is not null and (s.eta - s.etd) between 1 and 120 group by s.liman
  ), durumlu as (
    select s.*,
           (s.etd <= p_bugun and (case when s.eta is not null then s.eta >= p_bugun
                                        else s.etd >= p_bugun - coalesce(t.gun, 45) end)) yolda,
           (s.etd > p_bugun) yuklemede
      from sev s left join transit t on t.liman = s.liman
  ), gecmis as (
    select s.firma_id, s.etd, s.konteyner,
           case when lag(s.etd) over (partition by s.firma_id order by s.etd) is null
                  or s.etd - lag(s.etd) over (partition by s.firma_id order by s.etd) > 7 then 1 else 0 end yeni
      from sev s where s.etd <= p_bugun
  ), dalga_no as (
    select g.*, sum(g.yeni) over (partition by g.firma_id order by g.etd rows unbounded preceding) no from gecmis g
  ), dalgalar as (
    select d.firma_id, d.no, min(d.etd) bas, sum(d.konteyner) konteyner from dalga_no d group by d.firma_id, d.no
  ), araliklar as (
    select a.firma_id, a.bas - lag(a.bas) over (partition by a.firma_id order by a.no) aralik from dalgalar a
  ), ozet as (
    select f.id firma_id,
           (select count(*)::int from dalgalar a where a.firma_id = f.id) dalga,
           (select max(a.bas) from dalgalar a where a.firma_id = f.id) son_etd,
           (select round(avg(a.konteyner)::numeric, 1) from dalgalar a where a.firma_id = f.id) ort_konteyner,
           (select percentile_cont(0.5) within group (order by r.aralik) from araliklar r where r.firma_id = f.id and r.aralik is not null) ortanca,
           round(coalesce((select (t->>'gun')::numeric from jsonb_array_elements(coalesce(v->'tedarik', '[]'::jsonb)) t
                             where (t->>'firma_id')::uuid = f.id limit 1), v_genel, 31))::int tedarik_gun,
           coalesce((select sum(d.konteyner)::int from durumlu d where d.firma_id = f.id and d.yolda), 0) yolda_konteyner,
           coalesce((select sum(d.konteyner)::int from durumlu d where d.firma_id = f.id and d.yuklemede and not d.yolda), 0) yuklemede_konteyner,
           exists (select 1 from durumlu d where d.firma_id = f.id and (d.yolda or d.yuklemede)) aktif_sevk
      from public.pazar_firmalar f
     where f.company_id = p_company and f.durum = 'musteri'
  ), hesap as (
    select o.*, case when o.dalga >= 3 then round(o.ortanca::numeric)::int end rg
      from ozet o
  ), son as (
    select h.*, case when h.rg is not null and h.son_etd is not null then h.son_etd + h.rg - h.tedarik_gun end bs from hesap h
  )
  select s.firma_id,
         case when s.bs is null then 'veri_az'
              when (p_bugun - s.bs) > greatest(14, round(s.rg / 2.0)::int) then 'gecikti'
              when (p_bugun - s.bs) >= 0 then 'zamani_geldi'
              when (p_bugun - s.bs) >= -14 then 'yaklasiyor'
              else 'erken' end,
         case when s.bs is null then null else (p_bugun - s.bs) end,
         s.rg, s.dalga, s.son_etd, s.ort_konteyner, s.tedarik_gun, s.bs, s.yolda_konteyner, s.yuklemede_konteyner
    from son s;
end; $function$;

revoke all on function public.pazar_siparis_ritmi(uuid, date) from public, anon, authenticated;
