-- ============================================================================
-- IC PIYASA - PESIN / VADELI FIYAT (14.10.2026)
-- ============================================================================
-- Fiyat tablosunda her urunun PESIN ve VADELI fiyati ayri tutulur; Odeme
-- sutunu panelden ve formdan kaldirildi (kullanici istegi).
--
-- Sadece EKLEME, hicbir veri silinmez:
--   - pesin_fiyat / vadeli_fiyat sutunlari (canlida 12.10.2026'da elle
--     eklenmisti - ayni tip ve ayni kisitlarla; "if not exists" sayesinde
--     canlida hicbir sey degismez, yeni kurulumda olusur).
--   - Iki fiyati da bos olan eski satirlar mevcut birim_fiyat'tan doldurulur:
--     vade 0 (Pesin) ise pesin_fiyat, degilse vadeli_fiyat. Fiyati girilmis
--     satirlara DOKUNULMAZ.
--   - vade_gun artik vadeli fiyatin vadesidir.
--   - birim_fiyat / odeme sutunlari geriye donuk uyumluluk icin KALIR (panel
--     artik yazmaz). Onaylanmis formlar (ic_fiyat_formlari.kalemler) DEGISMEZ;
--     uygulama eski formlari kalemFiyatlari() ile ayni duzende gosterir.
-- Tablo yetkileri tablo duzeyinde verildigi icin yeni sutun ek yetki istemez.
-- ============================================================================
alter table public.ic_fiyat_kalemleri
  add column if not exists pesin_fiyat numeric(12, 2) check (pesin_fiyat is null or pesin_fiyat >= 0);
alter table public.ic_fiyat_kalemleri
  add column if not exists vadeli_fiyat numeric(12, 2) check (vadeli_fiyat is null or vadeli_fiyat >= 0);

update public.ic_fiyat_kalemleri
   set pesin_fiyat  = case when vade_gun = 0 then birim_fiyat end,
       vadeli_fiyat = case when vade_gun is distinct from 0 then birim_fiyat end
 where pesin_fiyat is null
   and vadeli_fiyat is null
   and birim_fiyat is not null;

comment on column public.ic_fiyat_kalemleri.pesin_fiyat is 'Pesin fiyat (TL/kg). Bos = urun pesin satilmiyor (formda "—").';
comment on column public.ic_fiyat_kalemleri.vadeli_fiyat is 'Vadeli fiyat (TL/kg); vadesi vade_gun. Bos = urun vadeli satilmiyor (formda "—").';
comment on column public.ic_fiyat_kalemleri.vade_gun is 'Vadeli fiyatin vadesi (gun). 14.10.2026 oncesi: tek fiyatin vadesi (0 = pesin).';
comment on column public.ic_fiyat_kalemleri.birim_fiyat is 'ESKI (14.10.2026 oncesi tek fiyat). Panel artik kullanmaz; pesin_fiyat / vadeli_fiyat gecerlidir.';
comment on column public.ic_fiyat_kalemleri.odeme is 'ESKI (14.10.2026 oncesi). Odeme sekli fiyat tablosundan / formdan kaldirildi; panel kullanmaz.';
