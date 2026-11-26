-- ============================================================================
-- GEMIDEN SATIS = IC PIYASA IS EMRI (26.11.2026)
-- ============================================================================
-- Kullanici: "Bu ikisi gemiden satis. Satis kisminda 2 is emri. Gemi ismi ile beraber alici firma ve tonaj bilgileri
-- gozukur. Irsaliyeler yuklenecek. Manuel olarak da is emrine plaka - tonaj yazarak girilebilmeli."
--   1) ic_is_emirleri.gemi_id: is emri bir gemi tahliyesine baglanir (gemiden supalan satis). Ayni sirketin gemisi olmali.
--   2) Irsaliyesiz ELLE arac: kantar_ic_sevk_ekle p_veri.elle = true iken irsaliye PDF'i istenmez (plaka + net kg);
--      ic_sevkler.irsaliye_dosya_yolu artik NULL olabilir (ic_alis_teslimler'deki gibi). Kayda uyari yazilir.
--      Yama: canlidaki govde pg_get_functiondef ile alinir, iki desen TAM BIR KEZ bulunmazsa migration HATA verir.
--   3) kantar_ic_is_emirleri: + gemi_adi (Kantar Paneli Satis listesinde gemi rozeti).
--   4) kantar_gemi_tahliyeleri: gemiye bagli is emirleri "alicilar" listesinde (firma, hedef, irsaliyeli tonaj, arac);
--      gelen_kg / gelen_arac bu sevkleri de sayar (gemiden bosaltilan toplam = UNEX + satis).
--   5) Eslestirme: liman fisi plaka + agirlik + gun olarak gemiye bagli bir satis irsaliyesine uyuyorsa (satis araci)
--      UNEX kantar tartimina ADAY OLMAZ (ic_gemi_kantar_esle_calistir + kantar_gemi_liman_adaylari; desen yamasi).
-- Mevcut is emirleri / sevkler degismez (gemi_id NULL). Stok / alis etkisi yok.
-- ============================================================================

-- 1) Is emri -> gemi
alter table public.ic_is_emirleri add column if not exists gemi_id uuid references public.ic_gemi_tahliyeleri(id) on delete set null;
create index if not exists idx_ic_is_emri_gemi on public.ic_is_emirleri (gemi_id) where gemi_id is not null;
comment on column public.ic_is_emirleri.gemi_id is 'Gemiden satis: bagli gemi tahliyesi (26.11.2026). NULL = normal fabrika satisi.';

create or replace function public.ic_is_emri_gemi_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.gemi_id is not null and (tg_op = 'INSERT' or new.gemi_id is distinct from old.gemi_id) then
    if not exists (select 1 from public.ic_gemi_tahliyeleri g where g.id = new.gemi_id and g.company_id = new.company_id) then
      raise exception 'Gemi bulunamadı.' using errcode = '23503';
    end if;
  end if;
  return new;
end; $function$;
revoke all on function public.ic_is_emri_gemi_kontrol() from public, anon, authenticated;
drop trigger if exists ic_is_emri_gemi_kontrol on public.ic_is_emirleri;
create trigger ic_is_emri_gemi_kontrol before insert or update of gemi_id on public.ic_is_emirleri
  for each row execute function public.ic_is_emri_gemi_kontrol();

-- 2) Irsaliyesiz elle arac
alter table public.ic_sevkler alter column irsaliye_dosya_yolu drop not null;
do $$
declare
  v_eski text := pg_get_functiondef('public.kantar_ic_sevk_ekle(jsonb, boolean)'::regprocedure);
  v_yeni text;
  d1 constant text := 'if v_yol not like v_sirket::text || ''/irsaliye/''';
  d2 constant text := 'if v_irs_no is null then';
begin
  if position('(p_veri ->> ''elle'')::boolean' in v_eski) > 0 then
    return; -- zaten uygulanmis
  end if;
  if (length(v_eski) - length(replace(v_eski, d1, ''))) / length(d1) <> 1
     or (length(v_eski) - length(replace(v_eski, d2, ''))) / length(d2) <> 1 then
    raise exception 'kantar_ic_sevk_ekle: beklenen desenler tam bir kez bulunamadi; yama uygulanmadi.';
  end if;
  v_yeni := replace(v_eski, d1,
    'if v_yol = '''' and coalesce((p_veri ->> ''elle'')::boolean, false) then' || E'\n' ||
    '    v_yol := null; -- 26.11.2026: irsaliyesiz elle giris (plaka + net kg)' || E'\n' ||
    '  elsif v_yol not like v_sirket::text || ''/irsaliye/''');
  v_yeni := replace(v_yeni, d2,
    'if v_yol is null then' || E'\n' ||
    '    v_uyarilar := array_append(v_uyarilar, ''İrsaliye PDF''''i yok; plaka ve tonaj elle girildi.'');' || E'\n' ||
    '  elsif v_irs_no is null then');
  execute v_yeni;
end $$;

-- 3) Kantar Paneli Satis listesi: + gemi_adi
drop function if exists public.kantar_ic_is_emirleri();
create function public.kantar_ic_is_emirleri()
 returns table(id uuid, is_emri_no text, musteri_maskeli text, urun text, ambalaj text, teslim text, hedef_tur text, hedef_kg numeric, hedef_arac integer, yuklenen_kg numeric, yuklenen_arac integer, olusturma timestamp with time zone, gemi_adi text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select e.id, e.is_emri_no, coalesce(nullif(btrim(m.kisa_ad), ''), m.unvan), e.urun, e.ambalaj, e.teslim,
           e.hedef_tur, e.hedef_kg, e.hedef_arac,
           (coalesce(sum(s.net_kg), 0) + e.devir_kg)::numeric, count(s.id)::integer, e.olusturma, g.gemi_adi
    from public.ic_is_emirleri e
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_gemi_tahliyeleri g on g.id = e.gemi_id
    left join public.ic_sevkler s on s.is_emri_id = e.id
    where e.company_id = auth_company_id() and e.durum = 'acik'
    group by e.id, m.unvan, m.kisa_ad, g.gemi_adi
    order by e.olusturma;
end; $function$;
revoke all on function public.kantar_ic_is_emirleri() from public, anon;
grant execute on function public.kantar_ic_is_emirleri() to authenticated;

-- 4) Gemi ozeti: is emri satislari alicilar listesinde + gelen tonaja dahil
drop function if exists public.kantar_gemi_tahliyeleri();
create function public.kantar_gemi_tahliyeleri()
 returns table (
   id uuid, gemi_adi text, urun text, tahliye_limani text, bl_kg numeric,
   gelen_kg numeric, gelen_arac integer, unex_liman_kg numeric, unex_teslim_kg numeric, unex_arac integer,
   bugun_arac integer, alicilar jsonb, yolda_arac integer, yolda_kg numeric, liman_bekleyen_arac integer, liman_bekleyen_kg numeric
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    with st as (
      select e.gemi_id, e.id as is_emri_id, coalesce(sum(s.net_kg), 0) as kg, count(s.id) as arac,
             count(s.id) filter (where (coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date = v_bugun) as bugun
      from public.ic_is_emirleri e left join public.ic_sevkler s on s.is_emri_id = e.id
      where e.company_id = auth_company_id() and e.gemi_id is not null and e.durum <> 'iptal'
      group by e.gemi_id, e.id
    )
    select g.id, g.gemi_adi, g.urun, g.tahliye_limani, g.bl_kg,
      (coalesce((select sum(coalesce(a.liman_kg, a.teslim_kg)) from public.ic_gemi_araclari a where a.gemi_id = g.id), 0)
        + coalesce((select sum(st.kg) from st where st.gemi_id = g.id), 0))::numeric,
      ((select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id)
        + coalesce((select sum(st.arac) from st where st.gemi_id = g.id), 0))::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      coalesce((select sum(a.teslim_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null)::integer,
      ((select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.tarih = v_bugun)
        + coalesce((select sum(st.bugun) from st where st.gemi_id = g.id), 0))::integer,
      coalesce((
        select jsonb_agg(x.j order by x.o) from (
          select l.olusturma as o, jsonb_build_object(
            'id', l.id, 'firma', l.firma, 'miktar_kg', l.miktar_kg,
            'gelen_kg', coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.alici_id = l.id), 0),
            'arac', (select count(*) from public.ic_gemi_araclari a where a.alici_id = l.id)) as j
          from public.ic_gemi_alicilari l where l.gemi_id = g.id
          union all
          select e.olusturma, jsonb_build_object(
            'id', e.id, 'firma', m.unvan, 'is_emri_no', e.is_emri_no,
            'miktar_kg', case when e.hedef_tur = 'kg' then e.hedef_kg else null end,
            'gelen_kg', st.kg, 'arac', st.arac)
          from st join public.ic_is_emirleri e on e.id = st.is_emri_id join public.ic_musteriler m on m.id = e.musteri_id
          where st.gemi_id = g.id
        ) x
      ), '[]'::jsonb),
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null)::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.liman_kg is null)::integer,
      coalesce((select sum(a.teslim_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.liman_kg is null), 0)::numeric
    from public.ic_gemi_tahliyeleri g
    where g.company_id = auth_company_id() and g.durum = 'acik'
    order by g.olusturma;
end; $function$;
revoke all on function public.kantar_gemi_tahliyeleri() from public, anon;
grant execute on function public.kantar_gemi_tahliyeleri() to authenticated;

-- 5) Satis aracinin liman fisi UNEX tartimina aday olmasin (desen yamasi; tam bir kez bulunmazsa HATA)
do $$
declare
  v_eski text;
  v_yeni text;
  d constant text := 'and f.cikis between coalesce(k.giris, k.cikis) - interval ''90 minutes''';
  d2 constant text := 'and f.cikis between coalesce(k.giris, k.cikis) - interval ''16 hours''';
  ek constant text := 'and not exists (select 1 from public.ic_sevkler s9 join public.ic_is_emirleri e9 on e9.id = s9.is_emri_id' || E'\n' ||
    '                       where e9.gemi_id = %s and ic_gemi_duz(s9.plaka) = ic_gemi_duz(f.plaka) and abs(s9.net_kg - f.net_kg) <= 500' || E'\n' ||
    '                         and coalesce(s9.irsaliye_tarihi, s9.olusturma) between f.cikis - interval ''1 day'' and f.cikis + interval ''1 day'')' || E'\n      ';
begin
  v_eski := pg_get_functiondef('public.ic_gemi_kantar_esle_calistir()'::regprocedure);
  if position('s9.plaka' in v_eski) = 0 then
    if (length(v_eski) - length(replace(v_eski, d, ''))) / length(d) <> 1 then
      raise exception 'ic_gemi_kantar_esle_calistir: beklenen desen tam bir kez bulunamadi; yama uygulanmadi.';
    end if;
    v_yeni := replace(v_eski, d, format(ek, 'g.id') || d);
    execute v_yeni;
  end if;
  v_eski := pg_get_functiondef('public.kantar_gemi_liman_adaylari(uuid)'::regprocedure);
  if position('s9.plaka' in v_eski) = 0 then
    if (length(v_eski) - length(replace(v_eski, d2, ''))) / length(d2) <> 1 then
      raise exception 'kantar_gemi_liman_adaylari: beklenen desen tam bir kez bulunamadi; yama uygulanmadi.';
    end if;
    v_yeni := replace(v_eski, d2, format(ek, 'a.gemi_id') || d2);
    execute v_yeni;
  end if;
end $$;
