-- ============================================================================
-- IC PIYASA - FIYAT FORMU SUTUN DUZENI (15.10.2026, Burak Bey istegi)
-- ============================================================================
-- Standart sutunlar (Ambalaj, Pesin, Vadeli, Vade, KDV, Teslim) formda
-- gosterilir / gizlenir; en fazla 3 ozel (serbest metin) sutun eklenir.
--
-- Sadece EKLEME; hicbir veri silinmez / degismez:
--   ic_piyasa_ayarlari.form_sutunlari : GUNCEL duzen
--       {"gizli": ["vade", ...], "ozel": [{"id": "o1abc", "baslik": "Min. Sipariş"}]}
--       NULL = varsayilan (her sey gorunur, ozel sutun yok).
--   ic_fiyat_kalemleri.ozel_degerler  : satirin ozel sutun degerleri {"o1abc": "10 ton"}.
--   ic_fiyat_formlari.sutunlar        : onay anindaki duzenin DONDURULMUS kopyasi.
--       NULL = eski form (varsayilan duzenle cizilir, birebir ayni).
-- Tablo yetkileri tablo duzeyinde verildigi icin yeni sutunlar ek yetki istemez;
-- onayli formlar yine DEGISTIRILEMEZ.
-- ============================================================================

alter table public.ic_piyasa_ayarlari add column if not exists form_sutunlari jsonb;
alter table public.ic_fiyat_kalemleri add column if not exists ozel_degerler jsonb not null default '{}'::jsonb;
alter table public.ic_fiyat_formlari add column if not exists sutunlar jsonb;

-- Gecerli duzen: gizli = bilinen anahtarlar (pesin+vadeli birlikte gizlenemez),
-- ozel = en fazla 3, id 1-40, baslik 2-24 karakter.
create or replace function public.ic_sutun_ayari_gecerli(v jsonb)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select v is null or (
    jsonb_typeof(v) = 'object'
    and jsonb_typeof(coalesce(v -> 'gizli', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(v -> 'ozel', '[]'::jsonb)) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(v -> 'gizli', '[]'::jsonb)) g
      where jsonb_typeof(g) <> 'string' or (g #>> '{}') not in ('ambalaj', 'pesin', 'vadeli', 'vade', 'kdv', 'teslim')
    )
    and not (coalesce(v -> 'gizli', '[]'::jsonb) ? 'pesin' and coalesce(v -> 'gizli', '[]'::jsonb) ? 'vadeli')
    and jsonb_array_length(coalesce(v -> 'ozel', '[]'::jsonb)) <= 3
    and not exists (
      select 1 from jsonb_array_elements(coalesce(v -> 'ozel', '[]'::jsonb)) o
      where jsonb_typeof(o) <> 'object'
         or jsonb_typeof(o -> 'id') is distinct from 'string'
         or jsonb_typeof(o -> 'baslik') is distinct from 'string'
         or char_length(o ->> 'id') not between 1 and 40
         or char_length(btrim(o ->> 'baslik')) not between 2 and 24
    )
  );
$function$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_form_sutunlari_check') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_form_sutunlari_check
      check (public.ic_sutun_ayari_gecerli(form_sutunlari));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_fiyat_formlari_sutunlar_check') then
    alter table public.ic_fiyat_formlari add constraint ic_fiyat_formlari_sutunlar_check
      check (public.ic_sutun_ayari_gecerli(sutunlar));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_fiyat_kalemleri_ozel_degerler_check') then
    alter table public.ic_fiyat_kalemleri add constraint ic_fiyat_kalemleri_ozel_degerler_check
      check (jsonb_typeof(ozel_degerler) = 'object');
  end if;
end $$;

comment on column public.ic_piyasa_ayarlari.form_sutunlari is 'Fiyat formu sutun duzeni {gizli:[...], ozel:[{id,baslik}]}. NULL = varsayilan (hepsi gorunur).';
comment on column public.ic_fiyat_kalemleri.ozel_degerler is 'Ozel sutun degerleri {sutunId: metin} (15.10.2026).';
comment on column public.ic_fiyat_formlari.sutunlar is 'Onay anindaki sutun duzeni (DONDURULMUS). NULL = 15.10.2026 oncesi form (varsayilan duzen).';
