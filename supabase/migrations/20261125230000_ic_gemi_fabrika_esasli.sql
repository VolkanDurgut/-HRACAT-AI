-- ============================================================================
-- GEMI TAHLIYE - FABRIKA ESASLI ESLESTIRME (25.11.2026 gece)
-- ============================================================================
-- Kullanici: "Sanirim gemiden farkli nakliye de yukluyor. O yuzden biz sadece bizim fabrikaya geleni tutmaliyiz. Liman
-- tartimlari icin Excel'i en son yukleyecegiz fakat fabrika tartim saati ve tonajlarindan yola cikarak eslestirme
-- yapilacak." Liman portali Excel'inde dorse plakasi YOK; Alici / Nakliyeci tum araclarda ayni -> hangi aracin bize geldigini
-- yalniz BIZIM kantar soyler. Ilk gece goruldu: Excel parca parca yuklenince eski eslestirme o anki en yakin adayi
-- KILITLEDI (ayni cekicinin 2. seferi, sonradan gelen dogru fis yerine +240 kg farkli baska bir fise baglandi).
--   1) ic_gemi_liman_fisleri (HAVUZ): Liman portali satirlarinin hepsi. Rapora / ekrana girmez; yalniz eslestirme icin.
--      Ayni fis kodu tekrar yuklenince atlanir. Alici gemiden satis firmasi ise satis araci olarak da yazilir (eskisi gibi).
--   2) "Bizim arac" = kantarda FIRMA alaninda gemi adi gecen tartim. Her biri icin otomatik ic_gemi_araclari satiri
--      (kaynak 'otomatik', teslim = kantar neti, liman bos -> "liman kaydi bekleniyor"). liman_kg artik NULL olabilir
--      (yalniz otomatik satirda).
--   3) ic_gemi_kantar_esle_calistir: her calismada onaylanmamis otomatik eslesmeler BASTAN hesaplanir (yalniz degisen
--      satirlar yazilir). Otomatik baglama icin SIKI kural: limandan cikis -> kantara giris 10-90 dk, net farki
--      -100 / +200 kg, dolu farki 0 / +250 kg (dolu yoksa net). Puan (kucuk = iyi): |net farki - 40| + |dolu farki - 90| / 2
--      + 45 dk ustu bekleme; ayni cekici-kantar plaka ikilisi daha once eslesmisse -100, plaka birebir ayni ise -200.
--      Bir aracin ya da fisin 40 puan icinde ikinci guclu adayi varsa BAGLANMAZ -> "Onay bekleyen" (operator secer).
--   4) ic_gemi_liman_esle: operator fisi secer / liman kg'ini elle girer (onayli; otomatik dokunmaz) / eslesmeyi kaldirir.
--   5) kantar_gemi_liman_adaylari: liman kaydi bekleyen araclar + en iyi 3 aday (gevsek kural: 16 saate kadar).
--   6) ic_gemi_arac_sil: otomatik satir silinirse tartim "gemiye ait degil" listesine yazilir (tekrar olusmaz).
--   7) kantar_canli "eslesmeyen": gemiye bagli ya da acik gemi adini tasiyan tartimlar artik sayilmaz.
-- Gecis: mevcut liman satirlari havuza kopyalanir; eslesmis UNEX satirlari 'otomatik' olur (yeniden hesaplanir);
-- eslesmemis UNEX liman satirlari (liman portalindaki diger araclar) arac listesinden kalkar, havuzda durur.
-- Kantar kayitlarina (kantar_tartimlari) YAZILMAZ. Evrak / stok etkisi yok.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Havuz: liman fisleri
-- ---------------------------------------------------------------------------
create table if not exists public.ic_gemi_liman_fisleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gemi_id uuid not null references public.ic_gemi_tahliyeleri(id) on delete cascade,
  fis_kodu text not null check (char_length(fis_kodu) between 1 and 80),
  plaka text not null check (plaka ~ '^[A-Z0-9 ]{4,14}$'),
  bos_kg numeric(12, 2) check (bos_kg is null or (bos_kg >= 0 and bos_kg <= 60000)),
  dolu_kg numeric(12, 2) check (dolu_kg is null or (dolu_kg >= 0 and dolu_kg <= 80000)),
  net_kg numeric(12, 2) not null check (net_kg > 0 and net_kg <= 60000),
  cikis timestamptz not null,
  alici text check (alici is null or char_length(alici) <= 200),
  nakliyeci text check (nakliyeci is null or char_length(nakliyeci) <= 200),
  -- Bagli arac (eslesen UNEX araci ya da satis araci); NULL = havuzda
  arac_id uuid unique references public.ic_gemi_araclari(id) on delete set null,
  yukleyen_email text,
  olusturma timestamptz not null default now()
);
create unique index if not exists uq_ic_gemi_liman_fis on public.ic_gemi_liman_fisleri (company_id, fis_kodu);
create index if not exists idx_ic_gemi_liman_fis_gemi on public.ic_gemi_liman_fisleri (gemi_id, cikis);
alter table public.ic_gemi_liman_fisleri enable row level security;
revoke all on table public.ic_gemi_liman_fisleri from anon;
revoke insert, update, delete, truncate, references, trigger on table public.ic_gemi_liman_fisleri from authenticated;
grant select on table public.ic_gemi_liman_fisleri to authenticated;
drop policy if exists ic_gemi_liman_fis_select on public.ic_gemi_liman_fisleri;
create policy ic_gemi_liman_fis_select on public.ic_gemi_liman_fisleri for select
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('ic_piyasa') or ic_sayfa_yetkisi('kantar')));
-- Denetim: yalniz ekleme / silme (eslesme degisimi arac satirinda zaten denetlenir)
drop trigger if exists denetim_ic_gemi_liman_fisleri on public.ic_gemi_liman_fisleri;
create trigger denetim_ic_gemi_liman_fisleri after insert or delete on public.ic_gemi_liman_fisleri
  for each row execute function denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 2) Gemiye ait olmadigi isaretlenen tartimlar (otomatik satir silinince)
-- ---------------------------------------------------------------------------
create table if not exists public.ic_gemi_haric_tartimlar (
  tartim_id uuid primary key references public.kantar_tartimlari(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  gemi_id uuid not null references public.ic_gemi_tahliyeleri(id) on delete cascade,
  isaretleyen_email text,
  olusturma timestamptz not null default now()
);
alter table public.ic_gemi_haric_tartimlar enable row level security;
revoke all on table public.ic_gemi_haric_tartimlar from anon;
revoke insert, update, delete, truncate, references, trigger on table public.ic_gemi_haric_tartimlar from authenticated;
grant select on table public.ic_gemi_haric_tartimlar to authenticated;
drop policy if exists ic_gemi_haric_select on public.ic_gemi_haric_tartimlar;
create policy ic_gemi_haric_select on public.ic_gemi_haric_tartimlar for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop trigger if exists denetim_ic_gemi_haric_tartimlar on public.ic_gemi_haric_tartimlar;
create trigger denetim_ic_gemi_haric_tartimlar after insert or update or delete on public.ic_gemi_haric_tartimlar
  for each row execute function denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 3) Arac tablosu: 'otomatik' kaynak, liman_kg yalniz otomatik satirda bos olabilir, onay bayragi
-- ---------------------------------------------------------------------------
alter table public.ic_gemi_araclari drop constraint if exists ic_gemi_araclari_kaynak_check;
alter table public.ic_gemi_araclari add constraint ic_gemi_araclari_kaynak_check check (kaynak in ('kantar', 'ofis', 'liman', 'otomatik'));
alter table public.ic_gemi_araclari alter column liman_kg drop not null;
alter table public.ic_gemi_araclari drop constraint if exists ic_gemi_arac_liman_var;
alter table public.ic_gemi_araclari add constraint ic_gemi_arac_liman_var check (liman_kg is not null or kaynak = 'otomatik');
-- Operator secti / elle girdi: otomatik eslestirme bu satirin liman bilgisine dokunmaz
alter table public.ic_gemi_araclari add column if not exists esleme_onayli boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4) Gecis (yalniz bir kez anlamli; tekrar calismasi zararsiz)
-- ---------------------------------------------------------------------------
insert into public.ic_gemi_liman_fisleri (company_id, gemi_id, fis_kodu, plaka, bos_kg, dolu_kg, net_kg, cikis, alici, arac_id, yukleyen_email, olusturma)
select a.company_id, a.gemi_id, a.liman_fis_kodu, a.plaka, a.liman_bos_kg, a.liman_dolu_kg, a.liman_kg, a.liman_cikis, a.liman_alici,
       case when a.alici_id is not null or a.teslim_kg is not null then a.id end, a.girilen_email, a.olusturma
from public.ic_gemi_araclari a
where a.kaynak = 'liman' and a.liman_fis_kodu is not null and a.liman_cikis is not null and a.liman_kg is not null
on conflict do nothing;
-- Kantardan otomatik eslesmis UNEX liman satirlari -> otomatik (eslesme yeniden hesaplanacak)
update public.ic_gemi_araclari set kaynak = 'otomatik'
 where kaynak = 'liman' and alici_id is null and kantar_tartim_id is not null and teslim_kaynak = 'kantar' and not esleme_onayli;
-- Kantara hic gelmemis UNEX liman satirlari: havuzda kalir, arac listesinden kalkar (denetim kaydinda tam kopya)
delete from public.ic_gemi_araclari a
 where a.kaynak = 'liman' and a.alici_id is null and a.teslim_kg is null
   and exists (select 1 from public.ic_gemi_liman_fisleri f where f.company_id = a.company_id and f.fis_kodu = a.liman_fis_kodu and f.arac_id is null);

-- ---------------------------------------------------------------------------
-- 5) Yardimcilar
-- ---------------------------------------------------------------------------
-- Kantar plakasi -> arac plakasi bicimi (tabloda ^[A-Z0-9 ]{4,14}$)
create or replace function public.ic_gemi_kantar_plaka(p_plaka text, p_dorse text)
 returns text
 language sql
 immutable
as $function$
  select case when x ~ '^[A-Z0-9 ]{4,14}$' then x else 'PLAKASIZ' end
  from (select btrim(regexp_replace(regexp_replace(upper(translate(coalesce(nullif(btrim(p_plaka), ''), p_dorse, ''), 'ıiğüşöç', 'IİĞÜŞÖÇ')),
               '[^A-Z0-9 ]', '', 'g'), '\s+', ' ', 'g')) as x) s;
$function$;

-- Aday puani (kucuk = iyi); NULL = aday degil (gevsek kural: -10 dk .. 16 sa, net -300/+400, dolu -300/+450)
create or replace function public.ic_gemi_liman_puan(
  p_cikis timestamptz, p_net numeric, p_dolu numeric, p_plaka text,
  k_zaman timestamptz, k_net numeric, k_t1 numeric, k_t2 numeric, k_plaka text, k_dorse text)
 returns numeric
 language sql
 immutable
as $function$
  select case
    when p_cikis is null or k_zaman is null or p_net is null or k_net is null then null
    when extract(epoch from (k_zaman - p_cikis)) / 60 < -10 or extract(epoch from (k_zaman - p_cikis)) / 60 > 960 then null
    when k_net - p_net < -300 or k_net - p_net > 400 then null
    when p_dolu is not null and k_t1 is not null and k_t2 is not null
         and (greatest(k_t1, k_t2) - p_dolu < -300 or greatest(k_t1, k_t2) - p_dolu > 450) then null
    else round(
        abs(k_net - p_net - 40)
      + case when p_dolu is not null and k_t1 is not null and k_t2 is not null then abs(greatest(k_t1, k_t2) - p_dolu - 90) / 2 else 0 end
      + greatest(0, extract(epoch from (k_zaman - p_cikis)) / 60 - 45) / 2
      + case when extract(epoch from (k_zaman - p_cikis)) / 60 < 10 then 30 else 0 end
      - case when ic_gemi_duz(p_plaka) <> '' and (ic_gemi_duz(p_plaka) = ic_gemi_duz(k_plaka) or ic_gemi_duz(p_plaka) = ic_gemi_duz(k_dorse)) then 200 else 0 end,
      1)
  end;
$function$;

-- Otomatik baglama icin SIKI kural (kullaniciya soylenen sinirlar)
create or replace function public.ic_gemi_liman_siki(
  p_cikis timestamptz, p_net numeric, p_dolu numeric, k_zaman timestamptz, k_net numeric, k_t1 numeric, k_t2 numeric)
 returns boolean
 language sql
 immutable
as $function$
  select p_cikis is not null and k_zaman is not null and p_net is not null and k_net is not null
     and extract(epoch from (k_zaman - p_cikis)) / 60 between 10 and 90
     and k_net - p_net between -100 and 200
     and (p_dolu is null or k_t1 is null or k_t2 is null or greatest(k_t1, k_t2) - p_dolu between 0 and 250);
$function$;

-- ---------------------------------------------------------------------------
-- 6) Eslestirme (tum sirketler; pg_cron her 2 dk + ekranlar + yukleme). Dondurur: degisen satir sayisi.
-- ---------------------------------------------------------------------------
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
  create temp table if not exists _gm_aday (arac uuid, fis uuid, puan numeric) on commit drop;
  create temp table if not exists _gm_es (arac uuid primary key, fis uuid unique) on commit drop;

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
    delete from _gm_aday;
    delete from _gm_es;
    insert into _gm_aday (arac, fis, puan)
    select a.id, f.id,
           ic_gemi_liman_puan(f.cikis, f.net_kg, f.dolu_kg, f.plaka, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg, k.plaka, k.dorse)
           - case when ic_gemi_duz(k.plaka) <> '' and exists (
                 select 1 from public.ic_gemi_araclari a2 join public.kantar_tartimlari k2 on k2.id = a2.kantar_tartim_id
                 where a2.company_id = a.company_id and a2.id <> a.id and a2.liman_fis_kodu is not null and a2.liman_fis_kodu <> f.fis_kodu
                   and ic_gemi_duz(a2.plaka) = ic_gemi_duz(f.plaka) and ic_gemi_duz(k2.plaka) = ic_gemi_duz(k.plaka)) then 100 else 0 end
    from public.ic_gemi_araclari a
    join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
    join public.ic_gemi_liman_fisleri f on f.gemi_id = g.id
    where a.gemi_id = g.id and a.kaynak = 'otomatik' and not a.esleme_onayli and not a.esleme_kapali
      and (f.arac_id is null or f.arac_id in (select a3.id from public.ic_gemi_araclari a3
                                               where a3.gemi_id = g.id and a3.kaynak = 'otomatik' and not a3.esleme_onayli and not a3.esleme_kapali))
      and (f.alici is null or 'UNEX' = any (kantar_ad_jetonlari(f.alici)))
      and f.cikis between coalesce(k.giris, k.cikis) - interval '90 minutes' and coalesce(k.giris, k.cikis) - interval '10 minutes'
      and ic_gemi_liman_siki(f.cikis, f.net_kg, f.dolu_kg, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg);

    -- Belirsizlik kontrolu (temkinli): arac icin serbest bir ikinci fis YA DA fis icin serbest bir ikinci arac 40 puan
    -- icindeyse baglanmaz (operator secer). Baglananlar cikinca kalanlarin farki acilabilir: degisiklik olmayana kadar tekrar.
    loop
      v_tur := 0;
      for p in
        select c.* from _gm_aday c
        where not exists (select 1 from _gm_es e where e.arac = c.arac or e.fis = c.fis)
        order by c.puan, c.arac, c.fis
      loop
        if exists (select 1 from _gm_es e where e.arac = p.arac or e.fis = p.fis) then continue; end if;
        if exists (
          select 1 from _gm_aday c
          where c.arac = p.arac and c.fis <> p.fis and c.puan < p.puan + 40
            and not exists (select 1 from _gm_es e where e.fis = c.fis)) then
          continue;
        end if;
        if exists (
          select 1 from _gm_aday c
          where c.fis = p.fis and c.arac <> p.arac and c.puan < p.puan + 40
            and not exists (select 1 from _gm_es e where e.arac = c.arac)) then
          continue;
        end if;
        insert into _gm_es (arac, fis) values (p.arac, p.fis);
        v_tur := v_tur + 1;
      end loop;
      exit when v_tur = 0;
    end loop;

    -- Bozulan baglar (once; fis kodu tekil)
    for r in
      select a.id, a.kantar_tartim_id from public.ic_gemi_araclari a
      where a.gemi_id = g.id and a.kaynak = 'otomatik' and not a.esleme_onayli and not a.esleme_kapali and a.liman_fis_kodu is not null
        and not exists (select 1 from _gm_es e join public.ic_gemi_liman_fisleri f on f.id = e.fis
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
      from _gm_es e
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

-- ---------------------------------------------------------------------------
-- 7) Liman Excel'i: tum satirlar havuza; satis firmasi -> satis araci; baska gemi / tartimi bitmemis satir atlanir
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_liman_excel_yukle(p_gemi uuid, p_satirlar jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_gemi public.ic_gemi_tahliyeleri%rowtype;
  v_jeton text;
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_s jsonb;
  v_i integer := 0;
  v_fis text; v_plaka text; v_net numeric; v_bos numeric; v_dolu numeric; v_cikis timestamptz; v_alici_ad text; v_sefer text; v_nakliyeci text;
  v_alici uuid;
  v_arac uuid;
  v_eklenen integer := 0;
  v_satis integer := 0;
  v_atlanan integer := 0;
  v_baska_gemi integer := 0;
  v_diger integer := 0;
  v_toplam numeric := 0;
  v_hatalar text[] := '{}';
  v_es integer := 0;
  v_bagli integer := 0;
  v_bekleyen integer := 0;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into v_gemi from public.ic_gemi_tahliyeleri x where x.id = p_gemi and x.company_id = v_sirket;
  if v_gemi.id is null then raise exception 'Gemi bulunamadı.' using errcode = 'P0002'; end if;
  if v_gemi.durum <> 'acik' then raise exception '% tahliyeye açık değil.', v_gemi.gemi_adi using errcode = '23514'; end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) = 0 then
    raise exception 'Excel''de araç satırı yok.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_satirlar) > 3000 then
    raise exception 'Tek seferde en fazla 3.000 satır yüklenebilir.' using errcode = '22023';
  end if;
  v_jeton := ic_gemi_jeton(v_gemi.gemi_adi);

  for v_s in select * from jsonb_array_elements(p_satirlar) loop
    v_i := v_i + 1;
    v_fis := nullif(btrim(coalesce(v_s ->> 'fis_kodu', '')), '');
    v_plaka := upper(regexp_replace(btrim(coalesce(v_s ->> 'plaka', '')), '\s+', ' ', 'g'));
    v_sefer := nullif(btrim(coalesce(v_s ->> 'gemi_sefer', '')), '');
    v_alici_ad := nullif(btrim(coalesce(v_s ->> 'alici', '')), '');
    v_nakliyeci := nullif(left(btrim(coalesce(v_s ->> 'nakliyeci', '')), 200), '');
    begin v_net := round((v_s ->> 'net_kg')::numeric, 2); exception when others then v_net := null; end;
    begin v_bos := round(nullif(v_s ->> 'bos_kg', '')::numeric, 2); exception when others then v_bos := null; end;
    begin v_dolu := round(nullif(v_s ->> 'dolu_kg', '')::numeric, 2); exception when others then v_dolu := null; end;
    begin v_cikis := (v_s ->> 'cikis')::timestamptz; exception when others then v_cikis := null; end;

    -- Baska geminin satiri: hata degil, atlanir (genel ekran)
    if v_sefer is not null and v_jeton is not null and position(v_jeton in ic_gemi_duz(v_sefer)) = 0 then
      v_baska_gemi := v_baska_gemi + 1; continue;
    end if;
    -- Limanda tartimi bitmemis (net / cikis yok): atlanir; sonraki yuklemede gelir
    if coalesce(v_net, 0) = 0 or v_cikis is null then v_bekleyen := v_bekleyen + 1; continue; end if;
    if v_fis is null or char_length(v_fis) > 80 then v_hatalar := array_append(v_hatalar, format('%s. satır: fiş kodu yok.', v_i)); continue; end if;
    if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then v_hatalar := array_append(v_hatalar, format('%s. satır: plaka geçersiz (%s).', v_i, coalesce(v_s ->> 'plaka', ''))); continue; end if;
    if v_net < 0 or v_net > 60000 then v_hatalar := array_append(v_hatalar, format('%s (%s): net ağırlık geçersiz.', v_plaka, v_fis)); continue; end if;
    if v_cikis > now() + interval '1 hour' or v_cikis < now() - interval '30 days' then
      v_hatalar := array_append(v_hatalar, format('%s (%s): çıkış tarihi geçersiz ya da 30 günden eski.', v_plaka, v_fis)); continue;
    end if;
    if exists (select 1 from public.ic_gemi_liman_fisleri f where f.company_id = v_sirket and f.fis_kodu = v_fis)
       or exists (select 1 from public.ic_gemi_araclari a where a.company_id = v_sirket and a.liman_fis_kodu = v_fis) then
      v_atlanan := v_atlanan + 1; continue;
    end if;
    -- Alici: UNEX / bos -> havuz (fabrika tartimiyla eslesir); gemiden satis firmasi -> satis araci; diger -> yalniz havuz
    v_alici := null;
    if v_alici_ad is not null and not ('UNEX' = any (kantar_ad_jetonlari(v_alici_ad))) then
      select l.id into v_alici from public.ic_gemi_alicilari l
       where l.gemi_id = v_gemi.id and kantar_ad_jetonlari(l.firma) && kantar_ad_jetonlari(v_alici_ad)
       order by cardinality(array(select unnest(kantar_ad_jetonlari(l.firma)) intersect select unnest(kantar_ad_jetonlari(v_alici_ad)))) desc
       limit 1;
      if v_alici is null then v_diger := v_diger + 1; end if;
    end if;
    v_eklenen := v_eklenen + 1;
    v_toplam := v_toplam + v_net;
    if v_alici is not null then v_satis := v_satis + 1; end if;
    if coalesce(p_kaydet, false) then
      v_arac := null;
      if v_alici is not null then
        insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar, girilen_email,
                                             liman_fis_kodu, liman_bos_kg, liman_dolu_kg, liman_cikis, liman_alici)
        values (v_sirket, v_gemi.id, v_alici, (v_cikis at time zone 'Europe/Istanbul')::date, v_plaka, v_net, null, 'liman', '{}',
                v_email, v_fis, v_bos, v_dolu, v_cikis, left(v_alici_ad, 200))
        returning id into v_arac;
      end if;
      insert into public.ic_gemi_liman_fisleri (company_id, gemi_id, fis_kodu, plaka, bos_kg, dolu_kg, net_kg, cikis, alici, nakliyeci, arac_id, yukleyen_email)
      values (v_sirket, v_gemi.id, v_fis, v_plaka, v_bos, v_dolu, v_net, v_cikis, left(v_alici_ad, 200), v_nakliyeci, v_arac, v_email);
    end if;
  end loop;

  if array_length(v_hatalar, 1) > 0 and coalesce(p_kaydet, false) then
    -- Hepsi ya da hicbiri: hatali satir varken kayit yok
    raise exception 'Excel''de % hatalı satır var: %', array_length(v_hatalar, 1), array_to_string(v_hatalar[1:5], ' | ') using errcode = '22023';
  end if;
  if coalesce(p_kaydet, false) then
    v_es := ic_gemi_kantar_esle_calistir();
  end if;
  select count(*) into v_bagli from public.ic_gemi_araclari a
   where a.gemi_id = v_gemi.id and a.kaynak = 'otomatik' and a.liman_kg is not null;
  return jsonb_build_object('kaydedildi', coalesce(p_kaydet, false), 'eklenen', v_eklenen, 'satis', v_satis, 'atlanan', v_atlanan,
                            'baska_gemi', v_baska_gemi, 'diger_alici', v_diger, 'bekleyen', v_bekleyen, 'toplam_kg', v_toplam,
                            'hatalar', to_jsonb(v_hatalar), 'uyarilar', '[]'::jsonb, 'eslesen', v_es, 'liman_bagli_arac', v_bagli);
end; $function$;

-- ---------------------------------------------------------------------------
-- 8) Operator: fisi sec (p_fis) / liman kg'ini elle gir (p_liman_kg) / eslesmeyi kaldir (ikisi de NULL)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_liman_esle(p_arac uuid, p_fis uuid default null, p_liman_kg numeric default null)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  a public.ic_gemi_araclari%rowtype;
  f public.ic_gemi_liman_fisleri%rowtype;
  v_kg numeric := round(p_liman_kg, 2);
  v_fark numeric;
  v_kayit bigint;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into a from public.ic_gemi_araclari x join public.ic_gemi_tahliyeleri g on g.id = x.gemi_id
   where x.id = p_arac and x.company_id = auth_company_id() and g.durum = 'acik' and x.kaynak = 'otomatik'
   for update of x;
  if a.id is null then raise exception 'Araç bulunamadı ya da tahliye açık değil.' using errcode = 'P0002'; end if;
  if (a.esleme_onayli or p_fis is null and v_kg is null) and a.liman_kg is not null and not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Onaylanmış liman bilgisini değiştirmek için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  select k.kayit_no into v_kayit from public.kantar_tartimlari k where k.id = a.kantar_tartim_id;

  -- Mevcut bagi coz
  update public.ic_gemi_liman_fisleri set arac_id = null where arac_id = a.id;

  if p_fis is not null then
    select x.* into f from public.ic_gemi_liman_fisleri x where x.id = p_fis and x.gemi_id = a.gemi_id and x.company_id = a.company_id for update;
    if f.id is null then raise exception 'Liman fişi bu gemide bulunamadı.' using errcode = 'P0002'; end if;
    if f.arac_id is not null then
      -- Fis baska bir otomatik araca (onaysiz) bagliysa o aractan alinir; onayli ya da satis aracindaysa alinmaz
      if exists (select 1 from public.ic_gemi_araclari o where o.id = f.arac_id and (o.kaynak <> 'otomatik' or o.esleme_onayli)) then
        raise exception 'Bu liman fişi başka bir araca onaylı olarak bağlı.' using errcode = '23514';
      end if;
      update public.ic_gemi_araclari o
         set liman_kg = null, liman_bos_kg = null, liman_dolu_kg = null, liman_cikis = null, liman_fis_kodu = null, liman_alici = null, uyarilar = '{}',
             plaka = coalesce((select ic_gemi_kantar_plaka(k.plaka, k.dorse) from public.kantar_tartimlari k where k.id = o.kantar_tartim_id), o.plaka)
       where o.id = f.arac_id;
      update public.ic_gemi_liman_fisleri set arac_id = null where id = f.id;
    end if;
    update public.ic_gemi_liman_fisleri set arac_id = a.id where id = f.id;
    v_fark := a.teslim_kg - f.net_kg;
    update public.ic_gemi_araclari
       set liman_kg = f.net_kg, liman_bos_kg = f.bos_kg, liman_dolu_kg = f.dolu_kg, liman_cikis = f.cikis, liman_fis_kodu = f.fis_kodu,
           liman_alici = f.alici, plaka = f.plaka, esleme_onayli = true, esleme_kapali = false,
           uyarilar = case when abs(v_fark) > greatest(300, f.net_kg * 0.01)
                           then array[format('Kantar tartımı (#%s) liman fişinden %s farklı.', v_kayit, ic_kg_yazi(v_fark))] else '{}'::text[] end
     where id = a.id;
  elsif v_kg is not null then
    if v_kg <= 0 or v_kg > 60000 then raise exception 'Liman ağırlığı 1 ile 60.000 kg arasında olmalı.' using errcode = '22023'; end if;
    v_fark := a.teslim_kg - v_kg;
    update public.ic_gemi_araclari
       set liman_kg = v_kg, liman_bos_kg = null, liman_dolu_kg = null, liman_cikis = null, liman_fis_kodu = null, liman_alici = null,
           esleme_onayli = true, esleme_kapali = false,
           plaka = coalesce((select ic_gemi_kantar_plaka(k.plaka, k.dorse) from public.kantar_tartimlari k where k.id = a.kantar_tartim_id), a.plaka),
           uyarilar = case when abs(v_fark) > greatest(300, v_kg * 0.01)
                           then array[format('Elle girilen liman ağırlığı kantardan %s farklı.', ic_kg_yazi(v_fark))] else '{}'::text[] end
     where id = a.id;
  else
    -- Kaldir: otomatik eslestirme bu araca bir daha bakmaz (operator elle secer)
    update public.ic_gemi_araclari
       set liman_kg = null, liman_bos_kg = null, liman_dolu_kg = null, liman_cikis = null, liman_fis_kodu = null, liman_alici = null,
           esleme_onayli = false, esleme_kapali = true, uyarilar = '{}',
           plaka = coalesce((select ic_gemi_kantar_plaka(k.plaka, k.dorse) from public.kantar_tartimlari k where k.id = a.kantar_tartim_id), a.plaka)
     where id = a.id;
  end if;
  perform ic_gemi_kantar_esle_calistir();
  return (select jsonb_build_object('id', x.id, 'liman_kg', x.liman_kg, 'teslim_kg', x.teslim_kg, 'plaka', x.plaka)
          from public.ic_gemi_araclari x where x.id = a.id);
end; $function$;

-- ---------------------------------------------------------------------------
-- 9) Liman kaydi bekleyen otomatik araclar + en iyi 3 serbest aday (gevsek kural)
-- ---------------------------------------------------------------------------
create or replace function public.kantar_gemi_liman_adaylari(p_gemi uuid)
 returns table (arac_id uuid, kantar_plaka text, kantar_kayit_no bigint, teslim_kg numeric, kantar_zaman timestamptz, kapali boolean, adaylar jsonb)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select a.id, k.plaka, k.kayit_no, a.teslim_kg, coalesce(k.giris, k.cikis), a.esleme_kapali,
      coalesce((
        select jsonb_agg(z.j order by z.puan) from (
          select f.id, ic_gemi_liman_puan(f.cikis, f.net_kg, f.dolu_kg, f.plaka, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg, k.plaka, k.dorse) as puan,
                 jsonb_build_object('fis_id', f.id, 'fis_kodu', f.fis_kodu, 'plaka', f.plaka, 'net_kg', f.net_kg, 'cikis', f.cikis,
                   'net_fark', k.net_kg - f.net_kg,
                   'dolu_fark', case when f.dolu_kg is not null and k.tartim1_kg is not null and k.tartim2_kg is not null
                                     then greatest(k.tartim1_kg, k.tartim2_kg) - f.dolu_kg end,
                   'dakika', round(extract(epoch from (coalesce(k.giris, k.cikis) - f.cikis)) / 60),
                   'puan', ic_gemi_liman_puan(f.cikis, f.net_kg, f.dolu_kg, f.plaka, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg, k.plaka, k.dorse)) as j
          from public.ic_gemi_liman_fisleri f
          where f.gemi_id = a.gemi_id and f.arac_id is null
            and (f.alici is null or 'UNEX' = any (kantar_ad_jetonlari(f.alici)))
            and f.cikis between coalesce(k.giris, k.cikis) - interval '16 hours' and coalesce(k.giris, k.cikis) + interval '10 minutes'
            and ic_gemi_liman_puan(f.cikis, f.net_kg, f.dolu_kg, f.plaka, coalesce(k.giris, k.cikis), k.net_kg, k.tartim1_kg, k.tartim2_kg, k.plaka, k.dorse) is not null
          order by 2 limit 3) z
      ), '[]'::jsonb)
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
    where g.id = p_gemi and g.company_id = auth_company_id() and g.durum = 'acik'
      and a.kaynak = 'otomatik' and a.liman_kg is null
    order by coalesce(k.giris, k.cikis) desc
    limit 200;
end; $function$;

-- ---------------------------------------------------------------------------
-- 10) Kantar Paneli ozeti: gelen = liman (yoksa kantar); "liman kaydi bekleyen" eklendi; yolda = yalniz elle girilmis
-- ---------------------------------------------------------------------------
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
    select g.id, g.gemi_adi, g.urun, g.tahliye_limani, g.bl_kg,
      coalesce((select sum(coalesce(a.liman_kg, a.teslim_kg)) from public.ic_gemi_araclari a where a.gemi_id = g.id), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id)::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      coalesce((select sum(a.teslim_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null)::integer,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.tarih = v_bugun)::integer,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l.id, 'firma', l.firma, 'miktar_kg', l.miktar_kg,
          'gelen_kg', coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.alici_id = l.id), 0),
          'arac', (select count(*) from public.ic_gemi_araclari a where a.alici_id = l.id)
        ) order by l.olusturma)
        from public.ic_gemi_alicilari l where l.gemi_id = g.id
      ), '[]'::jsonb),
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null)::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.liman_kg is null)::integer,
      coalesce((select sum(a.teslim_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.liman_kg is null), 0)::numeric
    from public.ic_gemi_tahliyeleri g
    where g.company_id = auth_company_id() and g.durum = 'acik'
    order by g.olusturma;
end; $function$;

-- ---------------------------------------------------------------------------
-- 11) Arac sil: otomatik satir silinirse tartim bu gemiye bir daha baglanmaz
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_arac_sil(p_id uuid)
 returns void
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  a public.ic_gemi_araclari%rowtype;
begin
  if auth.uid() is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Bu işlem için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  select x.* into a from public.ic_gemi_araclari x join public.ic_gemi_tahliyeleri g on g.id = x.gemi_id
   where x.id = p_id and x.company_id = auth_company_id() and g.durum = 'acik';
  if a.id is null then
    raise exception 'Araç bulunamadı ya da tahliye kapatılmış.' using errcode = 'P0002';
  end if;
  if a.kaynak = 'otomatik' and a.kantar_tartim_id is not null then
    insert into public.ic_gemi_haric_tartimlar (tartim_id, company_id, gemi_id, isaretleyen_email)
    values (a.kantar_tartim_id, a.company_id, a.gemi_id, lower(nullif(auth.jwt() ->> 'email', '')))
    on conflict (tartim_id) do nothing;
  end if;
  delete from public.ic_gemi_araclari where id = a.id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 12) Teslim elle / kaldir: otomatik satirda teslim kantarin kendisidir (degistirilemez; satir silinir)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_teslim_gir(p_id uuid, p_teslim numeric)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  a public.ic_gemi_araclari%rowtype;
  v_teslim numeric := round(p_teslim, 2);
  v_uyari text[];
  v_fark numeric;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into a from public.ic_gemi_araclari x join public.ic_gemi_tahliyeleri g on g.id = x.gemi_id
   where x.id = p_id and x.company_id = auth_company_id() and g.durum = 'acik';
  if a.id is null then raise exception 'Araç bulunamadı ya da tahliye açık değil.' using errcode = 'P0002'; end if;
  if a.alici_id is not null then raise exception 'Gemiden satış aracında teslim tartımı yoktur.' using errcode = '23514'; end if;
  if a.kaynak = 'otomatik' then
    raise exception 'Bu araç kantar tartımından otomatik oluştu; teslim kantarın kendisidir. Gemiye ait değilse aracı silin.' using errcode = '23514';
  end if;
  if v_teslim is null then
    if not ic_sayfa_yetkisi('ic_piyasa') then
      raise exception 'Eşleşmeyi kaldırmak için İç Piyasa yetkisi gerekir.' using errcode = '42501';
    end if;
    update public.ic_gemi_araclari set teslim_kg = null, kantar_tartim_id = null, teslim_kaynak = null, teslim_zamani = null, esleme_kapali = true
     where id = a.id;
    return jsonb_build_object('teslim_kg', null);
  end if;
  if v_teslim <= 0 or v_teslim > 60000 then
    raise exception 'Teslim ağırlığı 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
  end if;
  if a.teslim_kaynak = 'kantar' and not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Kantardan gelen tartımı değiştirmek için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  v_fark := v_teslim - a.liman_kg;
  v_uyari := a.uyarilar;
  if abs(v_fark) > greatest(300, a.liman_kg * 0.01) then
    v_uyari := array_append(v_uyari, format('Elle girilen teslim liman fişinden %s farklı.', ic_kg_yazi(v_fark)));
  end if;
  update public.ic_gemi_araclari
     set teslim_kg = v_teslim, kantar_tartim_id = null, teslim_kaynak = 'elle', teslim_zamani = now(), uyarilar = v_uyari
   where id = a.id;
  return jsonb_build_object('teslim_kg', v_teslim, 'fark', v_fark);
end; $function$;

-- ---------------------------------------------------------------------------
-- 13) Yetkiler
-- ---------------------------------------------------------------------------
revoke all on function public.ic_gemi_kantar_plaka(text, text) from public, anon, authenticated;
revoke all on function public.ic_gemi_liman_puan(timestamptz, numeric, numeric, text, timestamptz, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.ic_gemi_liman_siki(timestamptz, numeric, numeric, timestamptz, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ic_gemi_kantar_esle_calistir() from public, anon, authenticated;
revoke all on function public.ic_gemi_liman_excel_yukle(uuid, jsonb, boolean) from public, anon;
revoke all on function public.ic_gemi_liman_esle(uuid, uuid, numeric) from public, anon;
revoke all on function public.kantar_gemi_liman_adaylari(uuid) from public, anon;
revoke all on function public.kantar_gemi_tahliyeleri() from public, anon;
revoke all on function public.ic_gemi_arac_sil(uuid) from public, anon;
revoke all on function public.ic_gemi_teslim_gir(uuid, numeric) from public, anon;
grant execute on function public.ic_gemi_liman_excel_yukle(uuid, jsonb, boolean) to authenticated;
grant execute on function public.ic_gemi_liman_esle(uuid, uuid, numeric) to authenticated;
grant execute on function public.kantar_gemi_liman_adaylari(uuid) to authenticated;
grant execute on function public.kantar_gemi_tahliyeleri() to authenticated;
grant execute on function public.ic_gemi_arac_sil(uuid) to authenticated;
grant execute on function public.ic_gemi_teslim_gir(uuid, numeric) to authenticated;

comment on table public.ic_gemi_liman_fisleri is 'Liman Excel satirlari - havuz (25.11.2026). Rapora girmez; arac_id = eslesen UNEX araci ya da satis araci.';
comment on table public.ic_gemi_haric_tartimlar is 'Gemiye ait olmadigi isaretlenen kantar tartimlari (otomatik arac silinince). Otomatik arac bir daha olusmaz.';
comment on column public.ic_gemi_araclari.esleme_onayli is 'Liman bilgisi operator tarafindan secildi / elle girildi; otomatik eslestirme dokunmaz.';

-- ---------------------------------------------------------------------------
-- 14) kantar_canli: "Kantarda tartildi, sistemde kaydi yok" listesinden gemi tahliye araclari cikarildi.
--     Govde 20261124170000_kantar_canli_once_tartim.sql ile ayni; yalniz 'eslesmeyen' kosuluna iki satir eklendi.
-- ---------------------------------------------------------------------------
create or replace function public.kantar_canli()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_sonuc jsonb;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Yetkiniz yok.';
  end if;

  with
  -- Son 60 gunun TUM is emirleri / alislari (kapali dahil): acik olan eslesir; kapali olan "o donemin isi" bilgisi verir
  emir_tum as (
    select e.id, e.is_emri_no, e.durum, e.olusturma, e.kapanis_zamani,
      least(e.olusturma, coalesce((e.siparis_tarihi::timestamp at time zone 'Europe/Istanbul'), e.olusturma)) as baslangic,
      kantar_ad_jetonlari(coalesce(m.unvan, '') || ' ' || coalesce(m.kisa_ad, '')) as fj, kantar_ad_jetonlari(e.urun) as uj
    from ic_is_emirleri e left join ic_musteriler m on m.id = e.musteri_id
    where e.company_id = v_sirket and (e.durum = 'acik' or e.kapanis_zamani > now() - interval '60 days' or e.olusturma > now() - interval '60 days')
  ),
  emir as (select * from emir_tum where durum = 'acik'),
  alis_tum as (
    select a.id, a.alis_no, a.durum, a.olusturma, a.termin, a.kapanis_zamani,
      least(a.olusturma, coalesce((a.siparis_tarihi::timestamp at time zone 'Europe/Istanbul'), a.olusturma)) as baslangic,
      kantar_ad_jetonlari(coalesce(t.unvan, '') || ' ' || coalesce(t.kisa_ad, '')) as fj, kantar_ad_jetonlari(a.urun) as uj
    from ic_alis_siparisleri a left join ic_tedarikciler t on t.id = a.tedarikci_id
    where a.company_id = v_sirket and (a.durum = 'acik' or a.kapanis_zamani > now() - interval '60 days' or a.olusturma > now() - interval '60 days')
  ),
  alis as (select * from alis_tum where durum = 'acik'),
  -- son 30 gunun tamamlanan tartimlari (24.11.2026 ogleden sonra: 7 -> 30; irsaliyesi gec girilen arac tonajdan dusmesin) (+ normallestirilmis alanlar)
  t as (
    select k.*,
      coalesce(
        substring(upper(regexp_replace(coalesce(k.dba_konteyner, ''), '[^0-9A-Za-z]', '', 'g')) from '^[A-Z]{4}[0-9]{7}'),
        substring(upper(regexp_replace(coalesce(k.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}')) as konteyner_n,
      upper(regexp_replace(coalesce(k.irsaliye_no, ''), '\s', '', 'g')) as irsaliye_n,
      kantar_irsaliye_parcalari(k.irsaliye_no) as irsaliye_p,
      kantar_ad_jetonlari(k.firma) as fj, kantar_ad_jetonlari(k.urun) as uj
    from kantar_tartimlari k
    where k.company_id = v_sirket and k.cikis is not null and k.cikis > now() - interval '30 days'
  ),
  t2 as (
    select t.*,
      exists (select 1 from konteynerler c where c.company_id = v_sirket and t.konteyner_n is not null
                and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = t.konteyner_n) as ihracat_var,
      exists (select 1 from ic_sevkler s where s.company_id = v_sirket and cardinality(t.irsaliye_p) > 0
                and upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = any(t.irsaliye_p)) as sevk_var,
      exists (select 1 from ic_alis_teslimler x where x.company_id = v_sirket and cardinality(t.irsaliye_p) > 0
                and upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = any(t.irsaliye_p)) as teslim_var,
      (select e.id from emir e
        where cardinality(t.uj) > 0 and e.uj && t.uj and e.fj && t.fj and t.cikis >= e.baslangic - interval '7 days'
          and not exists (select 1 from emir_tum k where k.durum = 'tamamlandi' and k.kapanis_zamani is not null
                            and k.uj && t.uj and k.fj && t.fj and k.kapanis_zamani >= t.cikis and k.baslangic - interval '1 day' <= t.cikis)
        order by cardinality(array(select unnest(e.fj) intersect select unnest(t.fj))) desc, e.olusturma limit 1) as emir_id,
      (select a.id from alis a
        where cardinality(t.uj) > 0 and a.uj && t.uj and a.fj && t.fj and t.cikis >= a.baslangic - interval '7 days'
          and not exists (select 1 from alis_tum k where k.durum = 'tamamlandi' and k.kapanis_zamani is not null
                            and k.uj && t.uj and k.fj && t.fj and k.kapanis_zamani >= t.cikis and k.baslangic - interval '1 day' <= t.cikis)
        order by cardinality(array(select unnest(a.fj) intersect select unnest(t.fj))) desc, a.termin nulls last, a.olusturma limit 1) as alis_id
    from t
  ),
  -- Irsaliye no'su kantarda yok / farkli girilmis tartimlar icin 1'e 1 esleme (24.11.2026): ayni is (emir / alis),
  -- +-2 gun, +-150 kg; bir irsaliye kaydi en fazla BIR tartimi karsilar (en yakin ciftten baslayarak, kantar_bire_bir_es). Kantardaki
  -- irsaliye no'suyla zaten bir tartima bagli kayit bu eslemeye girmez (ornek: 18.11 ve 20.11'de ayni 26.220 kg).
  sevk_aday as (
    select t2.id as tartim_id, s.id as kayit_id,
      abs((coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) * 1000
        + abs(coalesce(s.net_kg, 0) - t2.net_kg) as puan
    from t2 join emir_tum ea on ea.uj && t2.uj and ea.fj && t2.fj join ic_sevkler s on s.is_emri_id = ea.id
    where t2.emir_id is not null and not t2.ihracat_var and not t2.sevk_var
      and abs((coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) <= 2
      and abs(coalesce(s.net_kg, 0) - t2.net_kg) <= 150
      and not exists (select 1 from t tt where upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = any(tt.irsaliye_p))
  ),
  sevk_es as (
    select unnest(kantar_bire_bir_es((select jsonb_agg(jsonb_build_object('t', tartim_id, 'k', kayit_id, 'p', puan)) from sevk_aday))) as tartim_id
  ),
  teslim_aday as (
    select t2.id as tartim_id, x.id as kayit_id,
      abs((coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) * 1000
        + abs(coalesce(x.net_kg, 0) - t2.net_kg) as puan
    from t2 join alis_tum aa on aa.uj && t2.uj and aa.fj && t2.fj join ic_alis_teslimler x on x.alis_id = aa.id
    where t2.emir_id is null and t2.alis_id is not null and not t2.ihracat_var and not t2.teslim_var
      and abs((coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) <= 2
      and abs(coalesce(x.net_kg, 0) - t2.net_kg) <= 150
      and not exists (select 1 from t tt where upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = any(tt.irsaliye_p))
  ),
  teslim_es as (
    select unnest(kantar_bire_bir_es((select jsonb_agg(jsonb_build_object('t', tartim_id, 'k', kayit_id, 'p', puan)) from teslim_aday))) as tartim_id
  ),
  t3 as (
    select t2.*,
      exists (select 1 from sevk_es e where e.tartim_id = t2.id) as emir_kayitli,
      exists (select 1 from teslim_es e where e.tartim_id = t2.id) as alis_kayitli
    from t2
  ),
  bekleyen_ic as (
    select * from t3
    where not ihracat_var and not sevk_var and not teslim_var
      and ((emir_id is not null and not emir_kayitli) or (emir_id is null and alis_id is not null and not alis_kayitli))
  ),
  -- kantarda bekleyenler (FIRST)
  b as (
    select kb.*,
      substring(upper(regexp_replace(coalesce(kb.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}') as konteyner_n,
      kantar_ad_jetonlari(kb.firma) as fj, kantar_ad_jetonlari(kb.urun) as uj
    from kantar_bekleyenler kb where kb.company_id = v_sirket
  )
  select jsonb_build_object(
    'son_sinyal', (select max(son_sinyal) from kantar_cihazlari where company_id = v_sirket and aktif),
    'iceride', coalesce((select jsonb_agg(jsonb_build_object(
        'kayit_no', b.kayit_no, 'plaka', b.plaka, 'firma', b.firma, 'urun', b.urun, 'konteyner', b.konteyner_n,
        'giris', b.giris, 'bekleme_dk', round(extract(epoch from (now() - b.giris)) / 60), 'tartim1_kg', b.tartim1_kg,
        'dosya_no', (select d.dosya_no from konteynerler c join ihracat_dosyalari d on d.id = c.dosya_id
                      where c.company_id = v_sirket and b.konteyner_n is not null
                        and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = b.konteyner_n
                      order by c.olusturma_tarihi desc limit 1),
        'is_emri_no', (select e.is_emri_no from emir e where cardinality(b.uj) > 0 and e.uj && b.uj and e.fj && b.fj
                        order by cardinality(array(select unnest(e.fj) intersect select unnest(b.fj))) desc, e.olusturma limit 1),
        'alis_no', (select a.alis_no from alis a where cardinality(b.uj) > 0 and a.uj && b.uj and a.fj && b.fj
                     order by cardinality(array(select unnest(a.fj) intersect select unnest(b.fj))) desc, a.termin nulls last, a.olusturma limit 1)
      ) order by b.giris) from b), '[]'::jsonb),
    'konteynerler', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('konteyner_id', c.id, 'durum',
                 case when exists (select 1 from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g'))) then 'dolduruluyor' else 'tartildi' end,
                 'giris', coalesce((select b.giris from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) limit 1),
                                   (select k.giris from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1)),
                 'cikis', (select k.cikis from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1),
                 'plaka', coalesce((select b.plaka from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) limit 1),
                                   (select k.plaka from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1))) as x
        from konteynerler c join ihracat_dosyalari d on d.id = c.dosya_id
        where c.company_id = v_sirket and d.durum in ('Açık', 'Acik') and c.dba_dosya_url is null
          and (exists (select 1 from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')))
               or exists (select 1 from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g'))))
      ) z), '[]'::jsonb),
    'is_emirleri', coalesce((select jsonb_agg(jsonb_build_object('is_emri_id', bi.emir_id, 'kg', bi.kg, 'arac', bi.arac, 'son_cikis', bi.son,
          'plakalar', bi.plakalar)) from (
        select emir_id, sum(net_kg) as kg, count(*) as arac, max(cikis) as son, jsonb_agg(plaka order by cikis) as plakalar
        from bekleyen_ic where emir_id is not null group by emir_id) bi), '[]'::jsonb),
    'alislar', coalesce((select jsonb_agg(jsonb_build_object('alis_id', ba.alis_id, 'kg', ba.kg, 'arac', ba.arac, 'son_cikis', ba.son,
          'plakalar', ba.plakalar)) from (
        select alis_id, sum(net_kg) as kg, count(*) as arac, max(cikis) as son, jsonb_agg(plaka order by cikis) as plakalar
        from bekleyen_ic where emir_id is null and alis_id is not null group by alis_id) ba), '[]'::jsonb),
    'eslesmeyen', coalesce((select jsonb_agg(jsonb_build_object('kayit_no', u.kayit_no, 'plaka', u.plaka, 'firma', u.firma, 'urun', u.urun,
          'irsaliye_no', u.irsaliye_no, 'cikis', u.cikis, 'net_kg', u.net_kg) order by u.cikis desc)
        from t3 u
        where u.cikis > now() - interval '3 days' and u.net_kg >= 5000
          and not u.ihracat_var and not u.sevk_var and not u.teslim_var and u.emir_id is null and u.alis_id is null
          -- 25.11.2026: gemi tahliye araci (bagli ya da firma alaninda acik gemi adi) "kaydi yok" sayilmaz
          and not exists (select 1 from ic_gemi_araclari ga where ga.kantar_tartim_id = u.id)
          and not exists (select 1 from ic_gemi_tahliyeleri gg where gg.company_id = v_sirket and gg.durum = 'acik'
                            and char_length(coalesce(ic_gemi_jeton(gg.gemi_adi), '')) >= 4
                            and position(ic_gemi_jeton(gg.gemi_adi) in ic_gemi_duz(u.firma)) > 0)), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end;
$$;
revoke all on function public.kantar_canli() from public, anon;
grant execute on function public.kantar_canli() to authenticated;
