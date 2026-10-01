-- ============================================================================
-- yedek_kayitlari: gunluk yedek (yedekleme-gonder) calisma gecmisi (01.10.2026)
-- ============================================================================
-- Amac:
--   1) Gozlemlenebilirlik: her GERCEK yedek calismasinin zamani, sonucu
--      (basarili / uyarili / hatali), kayit sayisi, boyutu ve uyarilari
--      burada kalir. pg_cron'un job_run_details tablosu sadece istegin
--      KUYRUGA alindigini gosterir, yedegin basarili olup olmadigini degil.
--   2) Kotuye kullanim korumasi: pg_cron fonksiyonu herkese acik anon
--      anahtarla cagiriyor; bu anahtari bilen biri fonksiyonu tekrar tekrar
--      tetikleyip mail kutusunu doldurabilirdi. Fonksiyon artik son 20 saat
--      icinde basarili bir yedek gonderildiyse yeni mail GONDERMEZ - bu
--      kontrol bu tabloya bakar.
--
-- Erisim: RLS acik ve HICBIR politika yok -> sadece service_role (edge
-- function) okuyup yazabilir; uygulama kullanicilari / anon erisemez.
-- Canliya 01.10.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur).
-- Idempotent.
-- ============================================================================

create table if not exists public.yedek_kayitlari (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  durum text not null check (durum in ('basarili', 'uyarili', 'hatali')),
  toplam_kayit integer,
  tablo_sayisi integer,
  json_bayt bigint,
  storage_dosya_sayisi integer,
  uyarilar jsonb,
  hata text
);

alter table public.yedek_kayitlari enable row level security;

create index if not exists idx_yedek_kayitlari_created_at
  on public.yedek_kayitlari (created_at desc);

comment on table public.yedek_kayitlari is
  'yedekleme-gonder edge function calisma gecmisi. RLS acik, politika yok: sadece service_role erisir. Son 20 saatte basarili yedek varsa yeni mail gonderilmez.';
