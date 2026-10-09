-- Gunluk rapora 12:00 (TR) "ogle" gonderimi eklendi (09.10.2026, canliya UYGULANDI).
-- rapor_gonderimleri.slot artik sabah / ogle / aksam olabilir.
-- Cron isi (gunluk-rapor-ogle, '0 9 * * *' UTC) projeye ozel anahtar icerdigi
-- icin burada degil: docs/felaket-kurtarma.md.
alter table public.rapor_gonderimleri drop constraint if exists rapor_gonderimleri_slot_check;
alter table public.rapor_gonderimleri add constraint rapor_gonderimleri_slot_check
  check (slot = any (array['sabah'::text, 'ogle'::text, 'aksam'::text]));
