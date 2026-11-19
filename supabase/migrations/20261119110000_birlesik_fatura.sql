-- ============================================================================
-- BIRLESIK FATURA (19.11.2026)
-- ============================================================================
-- Kullanici: "Ayni musterinin ayni gemideki butun siparisleri icin tek fatura kesmek istiyoruz. Boyle bir durumda fatura
-- talimatinin ona gore hazirlanmasi gerekir." Karar: sistem adaylari ONERIR, kullanici dosya sayfasinda tek tikla birlestirir.
--  1) fatura_gruplari + fatura_grubu_dosyalari: bir dosya en fazla BIR grupta (dosya_id benzersiz). Sirket kullanicilari
--     yalniz OKUR; yazma yalniz asagidaki RPC'lerle.
--  2) Aday kurali (birlesik_fatura_eslesir): ayni sirket, ACIK dosya, fatura PDF'i yuklenmemis; ayni musteri (alici adi
--     harf/rakam sadelestirilmis; esit ya da biri digerinin basi - adresi karismis ad icin) VE ayni gemi + sefer (rezervasyon).
--  3) birlesik_fatura_adaylari(dosya) / birlesik_fatura_kur(dosya, digerleri) / birlesik_fatura_cikar(dosya).
-- Dosya, rezervasyon, konteyner ve evrak kayitlari DEGISMEZ; yalniz fatura talimati grubu okur.
-- Canliya 19.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

create table if not exists public.fatura_gruplari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alici_firma text,
  gemi_adi text,
  sefer_no text,
  olusturan text,
  olusturma timestamptz not null default now()
);
create table if not exists public.fatura_grubu_dosyalari (
  grup_id uuid not null references public.fatura_gruplari(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_id uuid not null unique references public.ihracat_dosyalari(id) on delete cascade,
  ekleyen text,
  olusturma timestamptz not null default now(),
  primary key (grup_id, dosya_id)
);
create index if not exists fatura_grubu_dosyalari_grup on public.fatura_grubu_dosyalari (grup_id);
alter table public.fatura_gruplari enable row level security;
alter table public.fatura_grubu_dosyalari enable row level security;
drop policy if exists "fatura_gruplari okuma" on public.fatura_gruplari;
create policy "fatura_gruplari okuma" on public.fatura_gruplari for select to authenticated using (company_id = get_auth_company_id());
drop policy if exists "fatura_grubu_dosyalari okuma" on public.fatura_grubu_dosyalari;
create policy "fatura_grubu_dosyalari okuma" on public.fatura_grubu_dosyalari for select to authenticated using (company_id = get_auth_company_id());
revoke insert, update, delete on public.fatura_gruplari, public.fatura_grubu_dosyalari from anon, authenticated;
grant select on public.fatura_gruplari, public.fatura_grubu_dosyalari to authenticated;

-- Musteri adi anahtari: harf / rakam (Turkce harfler sadelestirilir), buyuk harf
create or replace function public.birlesik_fatura_musteri(p text)
returns text language sql immutable set search_path to 'public' as $$
  select regexp_replace(upper(translate(coalesce(p, ''), 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')), '[^A-Z0-9]', '', 'g')
$$;
-- Gemi / sefer anahtari: harf / rakam, buyuk harf
create or replace function public.birlesik_fatura_gemi(p text)
returns text language sql immutable set search_path to 'public' as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g')
$$;

-- Dosyanin fatura grubu icin ozeti: musteri / gemi / sefer anahtari (ilk rezervasyon)
create or replace function public.birlesik_fatura_ozet(p_dosya uuid)
returns table (dosya_id uuid, company_id uuid, acik boolean, fatura_var boolean, musteri text, gemi text, sefer text, para_birimi text)
language sql stable security definer set search_path to 'public' as $$
  select d.id, d.company_id, d.durum in ('Açık', 'Acik'), d.fatura_dosya_url is not null,
         public.birlesik_fatura_musteri(d.alici_firma),
         public.birlesik_fatura_gemi(r.gemi_adi), public.birlesik_fatura_gemi(r.sefer_no), coalesce(nullif(trim(d.para_birimi), ''), 'USD')
  from public.ihracat_dosyalari d
  left join lateral (
    select x.gemi_adi, x.sefer_no from public.rezervasyonlar x where x.dosya_id = d.id
    order by x.olusturma_tarihi nulls last, x.id limit 1
  ) r on true
  where d.id = p_dosya
$$;
revoke all on function public.birlesik_fatura_ozet(uuid) from public, anon, authenticated;

-- Iki dosya ayni faturaya girebilir mi (ayni sirket, ikisi de acik, faturasi yok, ayni musteri, ayni gemi + sefer, ayni para)
create or replace function public.birlesik_fatura_eslesir(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select a.company_id = b.company_id and a.acik and b.acik and not a.fatura_var and not b.fatura_var
       and length(a.musteri) >= 6 and length(b.musteri) >= 6
       and (a.musteri = b.musteri or a.musteri like b.musteri || '%' or b.musteri like a.musteri || '%')
       and a.gemi <> '' and a.gemi = b.gemi and a.sefer <> '' and a.sefer = b.sefer
       and a.para_birimi = b.para_birimi
    from public.birlesik_fatura_ozet(p_a) a, public.birlesik_fatura_ozet(p_b) b
  ), false)
$$;
revoke all on function public.birlesik_fatura_eslesir(uuid, uuid) from public, anon, authenticated;

-- Yetki: dosya okuma yetkisiyle ayni roller (admin / ihracat / muhasebe ya da super admin)
create or replace function public.birlesik_fatura_yetkili()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is not null and get_auth_company_id() is not null and (
    exists (select 1 from public.kullanici_rolleri kr where kr.user_id = auth.uid() and kr.rol in ('admin', 'ihracat', 'muhasebe'))
    or lower(coalesce(auth.jwt() ->> 'email', '')) in ('execution@unex.com.tr', 'bbt@unex.com.tr')
  ) then get_auth_company_id() end
$$;
revoke all on function public.birlesik_fatura_yetkili() from public, anon;
grant execute on function public.birlesik_fatura_yetkili() to authenticated;

-- Dosyanin grubu + birlestirilebilecek diger dosyalar
create or replace function public.birlesik_fatura_adaylari(p_dosya uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_sirket uuid := public.birlesik_fatura_yetkili();
  v_grup uuid;
begin
  if v_sirket is null then raise exception 'Yetkiniz yok.'; end if;
  if not exists (select 1 from public.ihracat_dosyalari d where d.id = p_dosya and d.company_id = v_sirket) then
    raise exception 'Dosya bulunamadı.';
  end if;
  select g.grup_id into v_grup from public.fatura_grubu_dosyalari g where g.dosya_id = p_dosya;
  return jsonb_build_object(
    'grup_id', v_grup,
    'uyeler', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'dosya_no', d.dosya_no) order by d.dosya_no)
      from public.fatura_grubu_dosyalari g join public.ihracat_dosyalari d on d.id = g.dosya_id
      where v_grup is not null and g.grup_id = v_grup), '[]'::jsonb),
    'adaylar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'dosya_no', d.dosya_no, 'proforma_no', d.proforma_no, 'grup_id', g.grup_id,
        'konteyner', (select coalesce(sum(r.konteyner_adedi), 0) from public.rezervasyonlar r where r.dosya_id = d.id),
        'booking_no', (select r.booking_no from public.rezervasyonlar r where r.dosya_id = d.id order by r.olusturma_tarihi nulls last, r.id limit 1))
        order by d.dosya_no)
      from public.ihracat_dosyalari d
      left join public.fatura_grubu_dosyalari g on g.dosya_id = d.id
      where d.company_id = v_sirket and d.id <> p_dosya
        and (v_grup is null or g.grup_id is distinct from v_grup)
        and d.durum in ('Açık', 'Acik')
        and public.birlesik_fatura_eslesir(p_dosya, d.id)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.birlesik_fatura_adaylari(uuid) from public, anon;
grant execute on function public.birlesik_fatura_adaylari(uuid) to authenticated;

-- Birlestir: dosya bir gruptaysa digerleri o gruba eklenir, degilse yeni grup. Digerleri baska grupta OLAMAZ.
create or replace function public.birlesik_fatura_kur(p_dosya uuid, p_digerleri uuid[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_sirket uuid := public.birlesik_fatura_yetkili();
  v_eposta text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_grup uuid;
  v_id uuid;
begin
  if v_sirket is null then raise exception 'Yetkiniz yok.'; end if;
  if coalesce(array_length(p_digerleri, 1), 0) = 0 then raise exception 'Birleştirilecek dosya seçin.'; end if;
  if not exists (select 1 from public.ihracat_dosyalari d where d.id = p_dosya and d.company_id = v_sirket) then
    raise exception 'Dosya bulunamadı.';
  end if;
  foreach v_id in array p_digerleri loop
    if v_id = p_dosya then continue; end if;
    if not public.birlesik_fatura_eslesir(p_dosya, v_id) then
      raise exception 'Seçilen dosyalardan biri aynı müşteri / aynı gemi-sefer / açık ve faturasız koşulunu sağlamıyor.';
    end if;
  end loop;
  select g.grup_id into v_grup from public.fatura_grubu_dosyalari g where g.dosya_id = p_dosya;
  if exists (select 1 from public.fatura_grubu_dosyalari g where g.dosya_id = any (p_digerleri) and g.grup_id is distinct from v_grup) then
    raise exception 'Seçilen dosyalardan biri başka bir birleşik faturada; önce oradan çıkarın.';
  end if;
  if v_grup is null then
    insert into public.fatura_gruplari (company_id, alici_firma, gemi_adi, sefer_no, olusturan)
    select v_sirket, d.alici_firma, r.gemi_adi, r.sefer_no, v_eposta
    from public.ihracat_dosyalari d
    left join lateral (select x.gemi_adi, x.sefer_no from public.rezervasyonlar x where x.dosya_id = d.id order by x.olusturma_tarihi nulls last, x.id limit 1) r on true
    where d.id = p_dosya
    returning id into v_grup;
    insert into public.fatura_grubu_dosyalari (grup_id, company_id, dosya_id, ekleyen) values (v_grup, v_sirket, p_dosya, v_eposta);
  end if;
  insert into public.fatura_grubu_dosyalari (grup_id, company_id, dosya_id, ekleyen)
  select v_grup, v_sirket, x, v_eposta from unnest(p_digerleri) x where x <> p_dosya
  on conflict (dosya_id) do nothing;
  return v_grup;
end;
$$;
revoke all on function public.birlesik_fatura_kur(uuid, uuid[]) from public, anon;
grant execute on function public.birlesik_fatura_kur(uuid, uuid[]) to authenticated;

-- Gruptan cikar; grupta tek dosya kalirsa grup kaldirilir
create or replace function public.birlesik_fatura_cikar(p_dosya uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_sirket uuid := public.birlesik_fatura_yetkili();
  v_grup uuid;
begin
  if v_sirket is null then raise exception 'Yetkiniz yok.'; end if;
  select g.grup_id into v_grup from public.fatura_grubu_dosyalari g where g.dosya_id = p_dosya and g.company_id = v_sirket;
  if v_grup is null then return; end if;
  delete from public.fatura_grubu_dosyalari where dosya_id = p_dosya;
  if (select count(*) from public.fatura_grubu_dosyalari where grup_id = v_grup) < 2 then
    delete from public.fatura_gruplari where id = v_grup;
  end if;
end;
$$;
revoke all on function public.birlesik_fatura_cikar(uuid) from public, anon;
grant execute on function public.birlesik_fatura_cikar(uuid) to authenticated;
