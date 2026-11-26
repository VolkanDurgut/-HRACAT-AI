-- ============================================================================
-- GEMI TAHLIYE - DUZELTME: "DELETE requires a WHERE clause" (26.11.2026 sabah)
-- ============================================================================
-- Kullanici: "Fisi yukle diyorum fakat bir turlu herhangi bir sey olmuyor." Sebep: Supabase, PostgREST (uygulama)
-- oturumlarinda pg_safeupdate uzantisini yukler; WHERE'siz DELETE / UPDATE'i reddeder (21000). ic_gemi_kantar_esle_calistir
-- gecici aday tablolarini "delete from _gm_aday2;" ile bosaltiyordu -> uygulamadan cagrilinca (Liman Excel'i kaydet,
-- ic_gemi_kantar_esle, ic_gemi_liman_esle, ic_gemi_tartim_bagla) hata; pg_cron ve yonetim oturumunda uzanti yuklu
-- olmadigi icin cron sorunsuz calisti (gece eslesmeleri cron'dan). Yalniz iki satir: "where true". Baska degisiklik yok.
-- ============================================================================

create or replace function public.ic_gemi_kantar_esle_calistir()
 returns integer
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  g record;
  r record;
  p record;
  t public.kantar_tartimlari%rowtype;
  v_sayi integer := 0;
  v_tur integer;
  v_fark numeric;
  v_uyari text[];
  v_jeton text;
  v_bas timestamptz;
begin
  create temp table if not exists _gm_aday2 (arac uuid, fis uuid, puan numeric, lp text, kp text) on commit drop;
  create temp table if not exists _gm_es2 (arac uuid primary key, fis uuid unique) on commit drop;

  for g in select x.* from public.ic_gemi_tahliyeleri x where x.durum = 'acik' order by x.olusturma loop
    v_jeton := ic_gemi_jeton(g.gemi_adi);
    if v_jeton is not null and char_length(v_jeton) < 4 then v_jeton := null; end if;
    v_bas := greatest(now() - interval '30 days',
                      (coalesce(g.baslangic, (g.olusturma at time zone 'Europe/Istanbul')::date) - 1)::timestamp at time zone 'Europe/Istanbul');

    -- (a) Elle / WhatsApp girilen UNEX araci (liman kg'i yazilmis, cikis saati yok): eski kural (plaka).
    --     Tartim gemi adiyla gelip otomatik satira donusmusse (liman bos, onaysiz) o satir yerine elle kayit baglanir.
    for r in
      select a.* from public.ic_gemi_araclari a
      where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null and not a.esleme_kapali
        and a.kaynak <> 'otomatik' and a.liman_kg is not null and a.liman_cikis is null and a.olusturma > now() - interval '30 days'
      order by a.olusturma
    loop
      t := null;
      select k.* into t
      from public.kantar_tartimlari k
      where k.company_id = r.company_id
        and (ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or (k.dorse is not null and ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)))
        and k.cikis between r.olusturma - interval '12 hours' and r.olusturma + interval '36 hours'
        and abs(k.net_kg - r.liman_kg) <= 1500
        and not exists (select 1 from public.ic_gemi_haric_tartimlar h where h.tartim_id = k.id)
        and (ic_gemi_tartim_uygun(k)
             or exists (select 1 from public.ic_gemi_araclari o where o.kantar_tartim_id = k.id and o.gemi_id = g.id
                          and o.kaynak = 'otomatik' and o.liman_kg is null and not o.esleme_onayli))
        and ((v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) or not ic_gemi_tartim_baska_ise_ait(k))
      order by (v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) desc, abs(k.net_kg - r.liman_kg), k.cikis
      limit 1;
      if t.id is null then continue; end if;
      delete from public.ic_gemi_araclari o
       where o.kantar_tartim_id = t.id and o.kaynak = 'otomatik' and o.liman_kg is null and not o.esleme_onayli;
      v_fark := round(t.net_kg, 2) - r.liman_kg;
      v_uyari := r.uyarilar;
      if abs(v_fark) > greatest(300, r.liman_kg * 0.01) then
        v_uyari := array_append(v_uyari, format('Kantar tartımı (#%s) liman fişinden %s farklı.', t.kayit_no, ic_kg_yazi(v_fark)));
      end if;
      update public.ic_gemi_araclari
         set teslim_kg = round(t.net_kg, 2), kantar_tartim_id = t.id, teslim_kaynak = 'kantar', teslim_zamani = t.cikis, uyarilar = v_uyari
       where id = r.id and teslim_kg is null;
      v_sayi := v_sayi + 1;
    end loop;

    -- (b) Gemi adiyla tartilan, hicbir kayda bagli olmayan tartim -> otomatik UNEX araci
    if v_jeton is not null then
      for t in
        select k.* from public.kantar_tartimlari k
        where k.company_id = g.company_id and k.cikis >= v_bas and k.net_kg <= 60000
          and position(v_jeton in ic_gemi_duz(k.firma)) > 0
          and ic_gemi_tartim_uygun(k)
          and not exists (select 1 from public.ic_gemi_haric_tartimlar h where h.tartim_id = k.id)
        order by k.cikis
      loop
        insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar,
                                             girilen, girilen_email, kantar_tartim_id, teslim_kaynak, teslim_zamani)
        values (g.company_id, g.id, null, (t.cikis at time zone 'Europe/Istanbul')::date, ic_gemi_kantar_plaka(t.plaka, t.dorse),
                null, round(t.net_kg, 2), 'otomatik', '{}', null, null, t.id, 'kantar', t.cikis);
        v_sayi := v_sayi + 1;
      end loop;
    end if;

    -- (c) Otomatik araclar <-> liman fisleri: onaysiz eslesmeler bastan
    -- PostgREST oturumunda pg_safeupdate yuklu: WHERE'siz DELETE reddedilir (26.11.2026 sabah hatasi)
    delete from _gm_aday2 where true;
    delete from _gm_es2 where true;
    insert into _gm_aday2 (arac, fis, puan, lp, kp)
    select a.id, f.id,
           ic_gemi_liman_puan(f.cikis, f.net_kg, f.dolu_kg, f.plaka, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg, k.plaka, k.dorse)
           - case when ic_gemi_duz(k.plaka) <> '' and exists (
                 select 1 from public.ic_gemi_araclari a2 join public.kantar_tartimlari k2 on k2.id = a2.kantar_tartim_id
                 where a2.company_id = a.company_id and a2.id <> a.id and a2.esleme_onayli and a2.liman_fis_kodu is not null and a2.liman_fis_kodu <> f.fis_kodu
                   and ic_gemi_duz(a2.plaka) = ic_gemi_duz(f.plaka) and ic_gemi_duz(k2.plaka) = ic_gemi_duz(k.plaka)) then 100 else 0 end,
           ic_gemi_duz(f.plaka), ic_gemi_duz(k.plaka)
    from public.ic_gemi_araclari a
    join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
    join public.ic_gemi_liman_fisleri f on f.gemi_id = g.id
    where a.gemi_id = g.id and a.kaynak = 'otomatik' and not a.esleme_onayli and not a.esleme_kapali
      and (f.arac_id is null or f.arac_id in (select a3.id from public.ic_gemi_araclari a3
                                               where a3.gemi_id = g.id and a3.kaynak = 'otomatik' and not a3.esleme_onayli and not a3.esleme_kapali))
      and (f.alici is null or 'UNEX' = any (kantar_ad_jetonlari(f.alici)))
      and f.cikis between coalesce(k.giris, k.cikis) - interval '90 minutes' and coalesce(k.giris, k.cikis) - interval '10 minutes'
      and ic_gemi_liman_siki(f.cikis, f.net_kg, f.dolu_kg, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg);

    -- SEFER DESTEGI (kullanici 25.11.2026 gece: "Plakaya ait kac sefer varsa karsilastirilir eslestirilir; boylece manuel
    -- veri girisine gerek kalmaz"): ayni cekici (liman plakasi) - kantar plakasi ikilisi BASKA seferlerde de kurala uyuyorsa
    -- ikilinin her seferi 100 puan (en fazla 300) one gecer. Ilk seferde iki arac belirsiz kalsa bile sonraki seferler
    -- geldikce ikili netlesir ve onceki sefer de kendiliginden baglanir (her calismada bastan hesap).
    update _gm_aday2 c
       set puan = c.puan - 100 * least(3, (select count(distinct c2.arac) from _gm_aday2 c2
                                           where c2.lp = c.lp and c2.kp = c.kp and c2.arac <> c.arac and c2.fis <> c.fis))
     where c.kp <> '' and c.lp <> '';

    -- Belirsizlik kontrolu (temkinli): arac icin serbest bir ikinci fis YA DA fis icin serbest bir ikinci arac 40 puan
    -- icindeyse baglanmaz (operator secer). Baglananlar cikinca kalanlarin farki acilabilir: degisiklik olmayana kadar tekrar.
    loop
      v_tur := 0;
      for p in
        select c.* from _gm_aday2 c
        where not exists (select 1 from _gm_es2 e where e.arac = c.arac or e.fis = c.fis)
        order by c.puan, c.arac, c.fis
      loop
        if exists (select 1 from _gm_es2 e where e.arac = p.arac or e.fis = p.fis) then continue; end if;
        if exists (
          select 1 from _gm_aday2 c
          where c.arac = p.arac and c.fis <> p.fis and c.puan < p.puan + 40
            and not exists (select 1 from _gm_es2 e where e.fis = c.fis)) then
          continue;
        end if;
        if exists (
          select 1 from _gm_aday2 c
          where c.fis = p.fis and c.arac <> p.arac and c.puan < p.puan + 40
            and not exists (select 1 from _gm_es2 e where e.arac = c.arac)) then
          continue;
        end if;
        insert into _gm_es2 (arac, fis) values (p.arac, p.fis);
        v_tur := v_tur + 1;
      end loop;
      exit when v_tur = 0;
    end loop;

    -- Bozulan baglar (once; fis kodu tekil)
    for r in
      select a.id, a.kantar_tartim_id from public.ic_gemi_araclari a
      where a.gemi_id = g.id and a.kaynak = 'otomatik' and not a.esleme_onayli and not a.esleme_kapali and a.liman_fis_kodu is not null
        and not exists (select 1 from _gm_es2 e join public.ic_gemi_liman_fisleri f on f.id = e.fis
                        where e.arac = a.id and f.fis_kodu = a.liman_fis_kodu)
    loop
      update public.ic_gemi_liman_fisleri set arac_id = null where arac_id = r.id;
      update public.ic_gemi_araclari a
         set liman_kg = null, liman_bos_kg = null, liman_dolu_kg = null, liman_cikis = null, liman_fis_kodu = null, liman_alici = null,
             uyarilar = '{}',
             plaka = coalesce((select ic_gemi_kantar_plaka(k.plaka, k.dorse) from public.kantar_tartimlari k where k.id = r.kantar_tartim_id), a.plaka)
       where a.id = r.id;
      v_sayi := v_sayi + 1;
    end loop;

    -- Yeni baglar
    for p in
      select e.arac as arac_id_yeni, f.id as fis_id, f.fis_kodu, f.plaka, f.bos_kg, f.dolu_kg, f.net_kg, f.cikis, f.alici, a.teslim_kg, k.kayit_no
      from _gm_es2 e
      join public.ic_gemi_liman_fisleri f on f.id = e.fis
      join public.ic_gemi_araclari a on a.id = e.arac
      left join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
      where a.liman_fis_kodu is distinct from f.fis_kodu
    loop
      update public.ic_gemi_liman_fisleri set arac_id = null where id = p.fis_id and arac_id is distinct from p.arac_id_yeni;
      update public.ic_gemi_liman_fisleri set arac_id = p.arac_id_yeni where id = p.fis_id;
      v_fark := p.teslim_kg - p.net_kg;
      update public.ic_gemi_araclari
         set liman_kg = p.net_kg, liman_bos_kg = p.bos_kg, liman_dolu_kg = p.dolu_kg, liman_cikis = p.cikis,
             liman_fis_kodu = p.fis_kodu, liman_alici = left(p.alici, 200), plaka = p.plaka,
             uyarilar = case when abs(v_fark) > greatest(300, p.net_kg * 0.01)
                             then array[format('Kantar tartımı (#%s) liman fişinden %s farklı.', p.kayit_no, ic_kg_yazi(v_fark))]
                             else '{}'::text[] end
       where id = p.arac_id_yeni;
      v_sayi := v_sayi + 1;
    end loop;
  end loop;
  return v_sayi;
end; $function$;

revoke all on function public.ic_gemi_kantar_esle_calistir() from public, anon, authenticated;
