-- ============================================================================
-- GEMI TAHLIYE - kantar eslestirme korumasi (25.11.2026)
-- ============================================================================
-- Canli deneme (geri alindi): bugunku bir TMO aracinin irsaliyesi henuz sisteme girilmemisti; ayni plaka + yakin kg ile
-- acilan gemi fisi o TMO tartimina eslesti. Kural: kantarda FIRMA alani acik bir alis tedarikcisine (TMO deposu vb.) ya da
-- acik bir satis is emrinin musterisine uyuyorsa (kantar_ad_jetonlari kesisimi) tartim gemiye OTOMATIK baglanmaz -
-- firma alaninda gemi adi geciyorsa yine baglanir. Yalniz ic_gemi_kantar_esle_calistir degisir; diger her sey ayni.
-- ============================================================================

create or replace function public.ic_gemi_tartim_baska_ise_ait(t public.kantar_tartimlari)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select cardinality(kantar_ad_jetonlari(t.firma)) > 0 and (
    exists (select 1 from public.ic_alis_siparisleri a join public.ic_tedarikciler d on d.id = a.tedarikci_id
            where a.company_id = t.company_id and a.durum = 'acik'
              and kantar_ad_jetonlari(t.firma) && kantar_ad_jetonlari(coalesce(d.kisa_ad, '') || ' ' || d.unvan))
    or exists (select 1 from public.ic_is_emirleri e join public.ic_musteriler m on m.id = e.musteri_id
               where e.company_id = t.company_id and e.durum = 'acik'
                 and kantar_ad_jetonlari(t.firma) && kantar_ad_jetonlari(coalesce(m.kisa_ad, '') || ' ' || m.unvan)));
$function$;

create or replace function public.ic_gemi_kantar_esle_calistir()
 returns integer
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  r record;
  t public.kantar_tartimlari%rowtype;
  v_sayi integer := 0;
  v_fark numeric;
  v_uyari text[];
  v_jeton text;
begin
  for r in
    select a.*, g.gemi_adi
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    where g.durum = 'acik' and a.alici_id is null and a.teslim_kg is null and not a.esleme_kapali
      and a.olusturma > now() - interval '30 days'
    order by a.olusturma
  loop
    v_jeton := ic_gemi_jeton(r.gemi_adi);
    select k.* into t
    from public.kantar_tartimlari k
    where k.company_id = r.company_id
      and (ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or (k.dorse is not null and ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)))
      and k.cikis between r.olusturma - interval '12 hours' and r.olusturma + interval '36 hours'
      and abs(k.net_kg - r.liman_kg) <= 1500
      and ic_gemi_tartim_uygun(k)
      and ((v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) or not ic_gemi_tartim_baska_ise_ait(k))
    order by (v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) desc,
             abs(k.net_kg - r.liman_kg), k.cikis
    limit 1;
    if t.id is null then continue; end if;
    v_fark := round(t.net_kg, 2) - r.liman_kg;
    v_uyari := r.uyarilar;
    if abs(v_fark) > greatest(300, r.liman_kg * 0.01) then
      v_uyari := array_append(v_uyari, format('Kantar tartımı (#%s) liman fişinden %s farklı.', t.kayit_no, ic_kg_yazi(v_fark)));
    end if;
    update public.ic_gemi_araclari
       set teslim_kg = round(t.net_kg, 2), kantar_tartim_id = t.id, teslim_kaynak = 'kantar', teslim_zamani = t.cikis, uyarilar = v_uyari
     where id = r.id and teslim_kg is null;
    v_sayi := v_sayi + 1;
    t := null;
  end loop;
  return v_sayi;
end; $function$;

revoke all on function public.ic_gemi_tartim_baska_ise_ait(public.kantar_tartimlari) from public, anon, authenticated;
revoke all on function public.ic_gemi_kantar_esle_calistir() from public, anon, authenticated;
