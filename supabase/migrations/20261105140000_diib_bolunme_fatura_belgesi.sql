-- 05.11.2026: DIIB'e bolunmus yuklemede HER FATURA ayri yuklenir (kullanici: "2 fatura yuklemek
-- durumunda kalacagiz; su an tek fatura yukleyebiliyoruz"). Parcanin faturasi bu satirda tutulur;
-- 1. parca ayrica ihracat_dosyalari.fatura_* alanlarina yansitilir (raporlar / panel degismesin).
alter table public.diib_dosya_bolunmeleri
  add column if not exists fatura_tarihi date,
  add column if not exists fatura_dosya_url text,
  add column if not exists fatura_dosya_adi text,
  add column if not exists fatura_yukleme_tarihi timestamptz,
  add column if not exists fatura_kontrol_sonucu jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'diib_bol_fatura_url_check') then
    alter table public.diib_dosya_bolunmeleri add constraint diib_bol_fatura_url_check
      check (fatura_dosya_url is null or char_length(fatura_dosya_url) between 10 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'diib_bol_fatura_adi_check') then
    alter table public.diib_dosya_bolunmeleri add constraint diib_bol_fatura_adi_check
      check (fatura_dosya_adi is null or char_length(fatura_dosya_adi) between 1 and 300);
  end if;
end $$;

comment on column public.diib_dosya_bolunmeleri.fatura_dosya_url is 'Bu parcanin (DIIB) fatura PDF adresi (05.11.2026).';
