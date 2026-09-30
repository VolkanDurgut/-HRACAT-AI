-- ============================================================================
-- evraklar bucket'i: PDF izni + boyut siniri (01.10.2026)
-- ============================================================================
-- Kok neden: 5791216 commit'i ile Draft/Orijinal butonlari evraklari artik
-- HTML yerine PDF olarak "evraklar" bucket'ina yukluyor. Ancak bucket sadece
-- text/html kabul edecek ve 5 MB sinirla tanimliydi; canli loglarda PDF
-- yuklemeleri 400 ile reddedildi. Sonuc: indirme calisiyor ama dosya_evraklari
-- guncellenmiyordu (taslak/orijinal rozetleri, "taslak evrak musteri onayi
-- bekliyor" mail kutusu ve "orijinali tekrar taslaga cevirme" korumasi
-- durmustu).
--
-- Cozum: application/pdf eklendi (text/html eski arsiv dosyalari icin
-- korunuyor), sinir konsimento-talimatlari bucket'iyla ayni 20 MB'a cikarildi
-- (scale 3 + PNG ile uretilen arka plan gorselli COO/Phyto PDF'leri 5 MB'i
-- asabiliyor - bkz. lib/html-to-pdf.ts).
--
-- Canliya 01.10.2026 02:06'da Supabase MCP ile uygulandi (bu dosya repo
-- senkronu icindir). Idempotent: tekrar calistirmak zararsizdir.
-- ============================================================================

update storage.buckets
set allowed_mime_types = array['text/html', 'application/pdf'],
    file_size_limit = 20971520
where id = 'evraklar';
