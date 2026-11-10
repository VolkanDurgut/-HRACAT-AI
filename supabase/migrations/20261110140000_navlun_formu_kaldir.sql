-- NAVLUN FORMU KALDIRILDI (10.11.2026)
-- Kullanici: "Formu birisi doldurmayacak, form maillerden guncellenecek. Bizim doldurabilecegimiz bir alan olmamali."
-- 20261110130000_navlun_formu.sql ile kurulan elle giris formu (navlun_formlari + fonksiyonlar) KALDIRILIR.
-- Yerine: maillerden kendini guncelleyen Navlun Bildirimi (ayri calisma). sevkiyat_plani'nin navlun kolonlari DURUR
-- (dosyadan gelen gerceklesen navlun). Formdan hic veri yazilmadi (tek test formu, kullanilmadan suresi bitirildi).
drop function if exists public.navlun_form_kaydet(text, uuid, numeric, numeric, text);
drop function if exists public.navlun_form_bilgi(text);
drop function if exists public.navlun_tasiyici_anahtar(text);
drop function if exists public.navlun_liman_anahtar(text);
drop table if exists public.navlun_formlari;
