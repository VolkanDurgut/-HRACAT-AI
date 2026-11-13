-- ============================================================================
-- Gunluk veri yedegi: EK YERINE GIRIS GEREKTIREN INDIRME (13.11.2026)
-- ============================================================================
-- Sorun (kullanici: "Gece yedek maili henuz gelmedi"): 11.11'den beri yedek maili execution@ kutusuna ulasmiyor.
-- 13.11'de ek .zip'e cevrildi (~1,2 MB), Resend kabul etti, yine ulasmadi; diger raporlar ulasiyor -> kurumsal posta
-- sunucusu disaridan gelen .zip ekini karantinaya aliyor. Kullanici karari: "Ek yerine giris gerektiren link".
--
--  1) storage bucket "veri-yedekleri": OZEL (public=false), yalniz application/zip, en fazla 50 MB.
--     storage.objects uzerinde HICBIR politika YOK -> yalniz service_role (edge) okur / yazar.
--  2) yedek_kayitlari.dosya_yolu / dosya_bayt: o gecenin zip'inin depodaki yolu (saklama suresi dolunca null).
--  3) yedek_indirmeleri: her indirme istegi (kim, ne zaman, hangi yedek) - RLS acik, politika yok.
--  4) yedek_listesi(): son 60 calisma (Ayarlar > Yedekler). yedek_indirme_izni(id): dosya yolunu verir ve indirmeyi
--     kaydeder. Ikisi de yalniz SUPER ADMIN (public.yetki_super_admin_sirketi - tek liste). Imzali link (2 dk) edge
--     "yedek-indir" ile service_role tarafinda uretilir; kullanici depoya dogrudan erisemez.
-- Canliya 13.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('veri-yedekleri', 'veri-yedekleri', false, 52428800, array['application/zip'])
on conflict (id) do nothing;

alter table public.yedek_kayitlari add column if not exists dosya_yolu text;
alter table public.yedek_kayitlari add column if not exists dosya_bayt bigint;

create table if not exists public.yedek_indirmeleri (
  id uuid primary key default gen_random_uuid(),
  yedek_id uuid not null references public.yedek_kayitlari (id),
  user_id uuid,
  eposta text,
  zaman timestamptz not null default now()
);
alter table public.yedek_indirmeleri enable row level security;
create index if not exists idx_yedek_indirmeleri_yedek on public.yedek_indirmeleri (yedek_id, zaman desc);
comment on table public.yedek_indirmeleri is
  'Gunluk yedek zip indirme istekleri (yedek_indirme_izni yazar). RLS acik, politika yok: istemci dogrudan okuyamaz.';

create or replace function public.yedek_listesi()
returns table (id uuid, created_at timestamptz, durum text, toplam_kayit integer, tablo_sayisi integer, json_bayt bigint,
               dosya_bayt bigint, dosya_var boolean, uyari_sayisi integer, hata text, indirme_sayisi integer, son_indirme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform public.yetki_super_admin_sirketi();
  return query
    select y.id, y.created_at, y.durum, y.toplam_kayit, y.tablo_sayisi, y.json_bayt, y.dosya_bayt, y.dosya_yolu is not null,
           coalesce(jsonb_array_length(case when jsonb_typeof(y.uyarilar) = 'array' then y.uyarilar end), 0), y.hata,
           (select count(*)::integer from public.yedek_indirmeleri i where i.yedek_id = y.id),
           (select max(i.zaman) from public.yedek_indirmeleri i where i.yedek_id = y.id)
    from public.yedek_kayitlari y
    order by y.created_at desc
    limit 60;
end;
$$;

create or replace function public.yedek_indirme_izni(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yol text;
begin
  perform public.yetki_super_admin_sirketi();
  select y.dosya_yolu into v_yol from public.yedek_kayitlari y where y.id = p_id;
  if v_yol is null then
    raise exception 'Bu yedeğin dosyası depoda yok (saklama süresi dolmuş ya da o gece depoya yüklenememiş).' using errcode = 'P0002';
  end if;
  insert into public.yedek_indirmeleri (yedek_id, user_id, eposta)
  values (p_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')));
  return v_yol;
end;
$$;

revoke all on function public.yedek_listesi() from public, anon;
revoke all on function public.yedek_indirme_izni(uuid) from public, anon;
grant execute on function public.yedek_listesi() to authenticated;
grant execute on function public.yedek_indirme_izni(uuid) to authenticated;
