-- 23.11.2026 PAZAR - MUSTERI SIPARIS RITMI (kullanici: "Musterilerin acik sevkiyatlari varsa yani henuz yolda yukleri varsa
-- veya iceride kalan siparisi varsa aktif siparis. Digerlerinin tarihlerini guncel yukleme planindan bulabilirsin. Ilk once
-- kendi musterilerimizin siparis tarihlerini yani rezervasyon tarihlerinden yola cikarak ne zaman mal istediklerine dair bir
-- denklem edinmek. Daha sonrasinda aktif siparisi olmayan musterileri tespit edelim.")
--
--  pazar_musteri_sevkiyatlari(): Pazar "musteri" firmalarinin sevkiyat gecmisi (salt okunur; hicbir kayit degismez).
--   - sevkiyatlar: Yukleme Plani (sevkiyat_plani, ETD'li) + plana girmemis sistem rezervasyonlari (ayni rezervasyon / booking
--     iki kez sayilmaz). ETA ve dosya kapali bilgisi rezervasyondan (yolda hesabi icin).
--     Plan musteri adi -> firma: pazar_anahtar_eslesir (Siparis Listesi ile ayni kural; canli kontrol: 49 addan 39'u tek firmaya,
--     coklu eslesme yok).
--   - tedarik: firma basina siparis (proforma tarihi) -> ETD ortanca gun (plan satiri siparis_defteri'ne bagliysa); tedarik_genel.
--   - eslesmeyen: Pazar'da musteri karti olmayan plan musterileri (ad, sevkiyat, konteyner, son ETD).
--  Yetki: pazar (pazar_musteri_siparisleri ile ayni).
create or replace function public.pazar_musteri_sevkiyatlari()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_sonuc jsonb;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;

  with mf as (
    select id, array_append(ek_anahtarlar, anahtar) a from public.pazar_firmalar where company_id = v_sirket and durum = 'musteri'
  ), pl as (
    select p.id, public.pazar_anahtar(p.musteri) pa, p.musteri, p.etd, coalesce(p.konteyner, 0) konteyner, p.booking_no,
           p.varis_limani, p.rezervasyon_id, p.siparis_id
      from public.sevkiyat_plani p
     where p.company_id = v_sirket and p.etd is not null
  ), plf as (
    select pl.*,
           (select mf.id from mf where public.pazar_anahtar_eslesir(mf.a, array[pl.pa]) order by mf.id limit 1) firma_id,
           (select r.id from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
             where d.company_id = v_sirket
               and (r.id = pl.rezervasyon_id
                    or (nullif(btrim(pl.booking_no), '') is not null and public.booking_anahtar(r.booking_no) = public.booking_anahtar(pl.booking_no)))
             order by (r.id = pl.rezervasyon_id) desc limit 1) rez_id
      from pl
  ), rz as (
    select r.id, public.pazar_anahtar(d.alici_firma) pa, r.gemi_kalkis_tarihi etd, coalesce(r.konteyner_adedi, 0) konteyner,
           r.booking_no, d.varis_limani, r.eta, d.durum
      from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
     where d.company_id = v_sirket and r.gemi_kalkis_tarihi is not null
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
    'tedarik', coalesce((
      select jsonb_agg(jsonb_build_object('firma_id', t.firma_id, 'gun', t.g, 'n', t.n)) from (
        select plf.firma_id, percentile_cont(0.5) within group (order by (plf.etd - s.proforma_tarihi)) g, count(*) n
          from plf join public.siparis_defteri s on s.id = plf.siparis_id
         where plf.firma_id is not null and s.proforma_tarihi is not null and plf.etd - s.proforma_tarihi between 0 and 365
         group by plf.firma_id) t), '[]'::jsonb),
    'tedarik_genel', (
      select percentile_cont(0.5) within group (order by (plf.etd - s.proforma_tarihi))
        from plf join public.siparis_defteri s on s.id = plf.siparis_id
       where s.proforma_tarihi is not null and plf.etd - s.proforma_tarihi between 0 and 365),
    'eslesmeyen', coalesce((
      select jsonb_agg(jsonb_build_object('ad', e.ad, 'sevkiyat', e.n, 'konteyner', e.k, 'son_etd', e.s) order by e.s desc) from (
        select min(plf.musteri) ad, count(*) n, sum(plf.konteyner) k, max(plf.etd) s from plf where plf.firma_id is null group by plf.pa) e), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end; $function$;

revoke all on function public.pazar_musteri_sevkiyatlari() from public, anon;
grant execute on function public.pazar_musteri_sevkiyatlari() to authenticated;
