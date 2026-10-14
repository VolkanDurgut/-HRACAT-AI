-- ============================================================================
-- IC PIYASA - FIYAT FORMUNDAKI ILETISIM BILGISI DUZENLENEBILIR (14.10.2026)
-- ============================================================================
-- Kullanici istegi: formdaki "SIPARIS VE BILGI  Burak Tuncay · 0541 339 60 04
-- (WhatsApp) · buraktuncay@unex.com.tr" satiri panelden degistirilebilmeli.
--
-- Sadece EKLEME, hicbir veri silinmez / degismez:
--   - ic_piyasa_ayarlari.form_iletisim_* : panelde duzenlenen GUNCEL bilgi
--     (bos ise uygulama bugunku sabit bilgiyi - Burak Tuncay - kullanir).
--     Ayni satirdaki lojistik / yetkili bildirim ayarlarina dokunulmaz.
--   - ic_fiyat_formlari.iletisim (jsonb) : form ONAYLANDIGI ANDAKI bilginin
--     DONDURULMUS kopyasi {ad, telefon, whatsapp, eposta}. Sonradan kisi
--     degisse de eski form ayni cikar. Eski formlarda NULL -> bugunku sabit
--     bilgi (formlar o bilgiyle gonderilmisti).
-- Yetkiler tablo duzeyinde verildigi icin yeni sutunlar ek yetki istemez;
-- onayli formlar yine DEGISTIRILEMEZ (UPDATE yetkisi yok).
-- ============================================================================
alter table public.ic_piyasa_ayarlari add column if not exists form_iletisim_ad text;
alter table public.ic_piyasa_ayarlari add column if not exists form_iletisim_telefon text;
alter table public.ic_piyasa_ayarlari add column if not exists form_iletisim_whatsapp boolean not null default true;
alter table public.ic_piyasa_ayarlari add column if not exists form_iletisim_eposta text;

alter table public.ic_fiyat_formlari add column if not exists iletisim jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_form_iletisim_ad_check') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_form_iletisim_ad_check
      check (form_iletisim_ad is null or char_length(btrim(form_iletisim_ad)) between 2 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_form_iletisim_telefon_check') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_form_iletisim_telefon_check
      check (form_iletisim_telefon is null or (form_iletisim_telefon ~ '^[0-9+() -]{7,25}$'
             and char_length(regexp_replace(form_iletisim_telefon, '\D', '', 'g')) >= 7));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_form_iletisim_eposta_check') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_form_iletisim_eposta_check
      check (form_iletisim_eposta is null or form_iletisim_eposta ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_fiyat_formlari_iletisim_check') then
    alter table public.ic_fiyat_formlari add constraint ic_fiyat_formlari_iletisim_check
      check (iletisim is null or jsonb_typeof(iletisim) = 'object');
  end if;
end $$;

comment on column public.ic_piyasa_ayarlari.form_iletisim_ad is 'Fiyat formundaki "Siparis ve bilgi" kisisi (bos = varsayilan Burak Tuncay).';
comment on column public.ic_piyasa_ayarlari.form_iletisim_telefon is 'Fiyat formundaki iletisim telefonu (yazildigi gibi gosterilir).';
comment on column public.ic_piyasa_ayarlari.form_iletisim_whatsapp is 'true = formda telefonun yaninda "(WhatsApp)" yazar.';
comment on column public.ic_piyasa_ayarlari.form_iletisim_eposta is 'Fiyat formundaki iletisim e-postasi (istege bagli).';
comment on column public.ic_fiyat_formlari.iletisim is 'Onay anindaki iletisim bilgisi {ad, telefon, whatsapp, eposta}; NULL = 14.10.2026 oncesi form (varsayilan bilgi).';
