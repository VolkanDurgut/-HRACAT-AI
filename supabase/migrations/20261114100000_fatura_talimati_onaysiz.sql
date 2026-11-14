-- ============================================================================
-- FATURA TALIMATI: ONAY ADIMI KALDIRILDI (14.11.2026)
-- ============================================================================
-- Kullanici: "Fatura talimatindan sonra Onayla gonder kismini kaldirmaliyiz. Sadece fatura talimati gonderilsin
-- (Harun Bey merhaba ...; musteri, konteyner adedi, varis limani). PDF indir butonu eklenecek."
-- Edge fatura-onay artik onay maili yerine dogrudan talimat mailini gonderir; kayit durumu 'gonderildi'.
-- Eski durumlar ('bekliyor' / 'onaylandi' / 'revize') yalniz gecmis kayitlar icin gecerli kalir.
-- Bekleyen (yalniz test) kayitlar 'gonderildi' sayilir: onay sayfasi artik karar almaz.
-- Geri alma: kisit eski haline (gonderildi haric) ancak 'gonderildi' kayitlari silinip / degistirilip dondurulebilir.
-- ============================================================================

alter table public.fatura_talimati_onaylari drop constraint if exists fatura_talimati_onaylari_durum_check;
alter table public.fatura_talimati_onaylari add constraint fatura_talimati_onaylari_durum_check
  check (durum in ('gonderildi', 'bekliyor', 'onaylandi', 'revize'));

update public.fatura_talimati_onaylari set durum = 'gonderildi' where durum = 'bekliyor' and test;

comment on table public.fatura_talimati_onaylari is
  'Fatura talimati mailleri (11.11.2026 onay akisi; 14.11.2026 onay adimi kaldirildi: durum gonderildi). Yazma yalniz edge fatura-onay.';
