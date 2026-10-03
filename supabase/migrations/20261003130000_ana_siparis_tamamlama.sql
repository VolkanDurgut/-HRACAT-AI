-- Devam Eden Siparisler: "Siparisi Tamamla" (talep: 03.10.2026).
-- Kucuk sevk farklari (orn. 504,9 siparis / 502,0 sevk) yuzunden bitmis
-- siparisler listede kaliyordu. Kullanici siparisi elle tamamlar; kayit
-- silinmez, sadece listeden duser. Mevcut kayitlar "tamamlanmadi" baslar.
alter table public.ana_siparisler
  add column if not exists tamamlandi boolean not null default false,
  add column if not exists tamamlanma_tarihi timestamptz,
  add column if not exists tamamlayan text;
