-- OPERASYON AJANI FAZ 1 - GOZLEM VERISI (17.11.2026, kullanici onayi).
--
-- operasyon-imap "tara" sirket posta kutusunu SALT OKUNUR okur (5 dk), pilot acentenin maillerini (gonderen / alici / bilgi)
-- operasyon_mailleri'ne yazar ve kural motoru (_shared/operasyon-ajan.ts) sonucunu yanina koyar.
-- Faz 1 = GOZLEM: hicbir is tablosuna (rezervasyon, dosya ...) yazilmaz; mail gonderilmez.
-- RLS acik, politika YOK: yalniz service_role (edge) okur/yazar. Mudahale Merkezi (yetki "mudahale") sonraki adim.
-- Acente adi / alan adi / booking deseni repoda YOK (repo herkese acik): operasyon_acenteler satiri canlida eklenir.

create table if not exists public.operasyon_acenteler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ad text not null,
  alan_adi text not null,
  booking_deseni text not null,
  aktif boolean not null default true,
  olusturma timestamptz not null default now(),
  unique (company_id, alan_adi),
  check (alan_adi ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  check (length(booking_deseni) between 3 and 80)
);

create table if not exists public.operasyon_imap_durum (
  company_id uuid primary key references public.companies(id),
  uidvalidity bigint,
  son_uid bigint not null default 0,
  baslangic date not null,
  son_calisma timestamptz,
  son_islenen int not null default 0,
  son_hata text,
  guncelleme timestamptz not null default now()
);

create table if not exists public.operasyon_mailleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  acente_id uuid references public.operasyon_acenteler(id),
  mesaj_id text not null,
  imap_uid bigint,
  tarih timestamptz,
  yon text not null check (yon in ('gelen', 'giden', 'ic', 'diger')),
  gonderen text,
  gonderen_ad text,
  alicilar text[] not null default '{}',
  konu text,
  govde text,          -- alintisiz yeni metin (en fazla 8000)
  tam_metin text,      -- alintilar dahil (en fazla 30000; alintidan kurtarma icin)
  -- kural motoru sonucu (Faz 1: yalniz gozlem)
  kapsamda boolean not null default true,
  booking text,
  oneri text,
  guven text check (guven in ('kesin', 'guclu', 'zayif', 'yok')),
  gerekce text,
  olay text,
  olaylar text[] not null default '{}',
  alanlar jsonb not null default '{}'::jsonb,
  kanit jsonb not null default '{}'::jsonb,
  motor_surumu text,
  olusturma timestamptz not null default now(),
  unique (company_id, mesaj_id)
);
create index if not exists operasyon_mailleri_booking on public.operasyon_mailleri (company_id, booking, tarih);
create index if not exists operasyon_mailleri_tarih on public.operasyon_mailleri (company_id, tarih desc);

alter table public.operasyon_acenteler enable row level security;
alter table public.operasyon_imap_durum enable row level security;
alter table public.operasyon_mailleri enable row level security;
revoke all on public.operasyon_acenteler, public.operasyon_imap_durum, public.operasyon_mailleri from anon, authenticated;

comment on table public.operasyon_mailleri is
  'Operasyon Ajani Faz 1 gozlem kaydi (17.11.2026): pilot acente mailleri + kural motoru sonucu. Yalniz service_role.';

-- pg_cron: 5 dakikada bir tarama (Authorization mevcut bir isten okunur; anahtar Vault'tan, repoya yazilmaz)
do $cron$
declare
  v_url text;
  v_bearer text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select substring(command from 'url := ''([^'']+)/functions/v1/'),
         substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_url, v_bearer
    from cron.job where jobname = 'gunluk-rapor-sabah';
  if v_url is null or v_bearer is null then
    raise notice 'gunluk-rapor-sabah komutu okunamadi; operasyon-imap-tara zamanlanmadi.';
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'operasyon-imap-tara';
  perform cron.schedule('operasyon-imap-tara', '*/5 * * * *', format($cmd$
  SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L,
      'x-cron-anahtar', (select decrypted_secret from vault.decrypted_secrets where name = 'operasyon_imap_anahtari' limit 1)
    ),
    body := '{"islem":"tara"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$, v_url || '/functions/v1/operasyon-imap', 'Bearer ' || v_bearer));
end
$cron$;
