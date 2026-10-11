-- ============================================================================
-- IC PIYASA - KDV DAHIL / HARIC SECIMI (11.10.2026)
-- ============================================================================
-- Fiyat tablosunda her satir icin KDV durumu secilebilir (kullanici istegi:
-- "KDV dahil ve haric secilebilmeli"). Sadece EKLEME: mevcut satirlar
-- varsayilan olarak KDV HARIC (false) kalir - bugunku davranisla ayni.
-- Onaylanmis formlar (ic_fiyat_formlari.kalemler, jsonb) DEGISMEZ; yeni
-- formlarda her kalemin "kdv_dahil" alani olur, eskilerde yoksa "haric" sayilir.
-- Tablo yetkileri tablo duzeyinde verildigi icin yeni sutun ek yetki istemez.
-- ============================================================================
alter table public.ic_fiyat_kalemleri
  add column if not exists kdv_dahil boolean not null default false;

comment on column public.ic_fiyat_kalemleri.kdv_dahil is 'true = birim fiyata KDV dahil, false = KDV haric (+ KDV).';
