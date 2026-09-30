-- ============================================================================
-- Draft Onay Gönderim akışına "Revize İstendi" adımı için yeni alanlar
--
-- Talep (30.09.2026): Müşteri draftı incelediğinde "şunu değiştirin" derse bu
-- ihtiyacı sisteme not düşerek işaretleyebilmek gerekiyor - önceden akışta
-- sadece Bekliyor -> Gönderime Hazır -> Yanıt Bekleniyor -> Onay Geldi vardı,
-- "revize isteniyor" durumu için hiçbir alan yoktu.
--
-- Revize işaretlendiğinde draft_onaylandi/draft_mail_gonderildi/
-- draft_musteri_onayi_alindi bayrakları UYGULAMA TARAFINDA sıfırlanır (ekip
-- evrakları düzeltip akışı baştan - Onayla -> Gönderildi İşaretle - geçirir).
-- Bu alanlar sıfırlanmaz, en son revize talebinin bilgisi (kim, ne zaman, ne
-- notu) olarak dosya yeniden onaylanana kadar saklanır.
-- ============================================================================

ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS draft_revize_istendi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_revize_notu text,
  ADD COLUMN IF NOT EXISTS draft_revize_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS draft_revize_isaretleyen text;
