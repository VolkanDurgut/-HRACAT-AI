-- ============================================================================
-- 5 fonksiyonun search_path'i sabitlendi (01.10.2026)
-- ============================================================================
-- Supabase guvenlik tarayicisi (lint 0011 function_search_path_mutable):
-- search_path'i sabit olmayan bir fonksiyon, onu cagiran rolun search_path
-- ayarina gore baska semadaki ayni isimli bir nesneyi kullanabilir.
--
-- Deger olarak 'public' secildi: bu fonksiyonlarin BUGUN fiilen kullandigi
-- arama yolu budur (veritabani varsayilani "$user", public, extensions; hicbiri
-- extensions semasindan bir sey kullanmiyor, pg_catalog her zaman ortuk olarak
-- once aranir). Yani DAVRANIS DEGISMEZ, sadece disaridan degistirilemez olur.
-- '' (bos) secilmedi: public.nextval(text) icindeki seqname::regclass ve
-- auto_dosya_no'daki 'ihracat_dosya_sira' gibi sema belirtilmemis adlar
-- cozulemez hale gelirdi.
--
-- Kullanim yerleri:
--   auto_dosya_no            -> ihracat_dosyalari BEFORE INSERT (dosya no uretimi)
--   nextval(text)            -> auto_dosya_no tarafindan cagrilir
--   set_updated_at           -> ihracat_dosyalari / konteynerler / rezervasyonlar
--                               BEFORE UPDATE tetikleyicileri
--   storage_path_dosya_id    -> storage_path_company_id (storage RLS politikalari)
--   storage_path_ilk_segment_company_id -> geri-bildirim-ekleri storage RLS
--
-- Dogrulama (canlida, oncesi/sonrasi birebir ayni): yol fonksiyonlari ayni
-- ciktilari verdi; islem icinde (geri alinarak) yapilan test kaydinda dosya no
-- IHR-2026-0089 uretildi ve updated_at tetikleyicisi calisti; sira sayaci
-- eski degerine geri alindi (numara atlamasi yok).
--
-- Canliya 01.10.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur).
-- Idempotent.
-- ============================================================================

alter function public.nextval(text) set search_path = public;
alter function public.auto_dosya_no() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.storage_path_dosya_id(text) set search_path = public;
alter function public.storage_path_ilk_segment_company_id(text) set search_path = public;
