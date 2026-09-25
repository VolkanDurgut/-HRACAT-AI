-- Fatura Talimatinda gosterilen "Odeme Sekli" (Mal Mukabili / Akreditif / Vesaik
-- Mukabili / Pesin vb.), mevcut "odeme_sekli" alanindan KASITLI OLARAK ayri
-- tutulur. "odeme_sekli" proformadan gelen, bankaya iletilen detayli odeme
-- talimati metnini tasir ve Commercial Invoice uretiminde (invoice-builder.ts)
-- KULLANILIR - bu yuzden ona dokunulmadi, uzerine yazilmadi.
--
-- "gumruk_odeme_sekli" ise gumruk/dis ticaret siniflandirmasidir (standart
-- kategorilerden biri: Pesin, Akreditif, Vesaik Mukabili, Mal Mukabili, Kabul
-- Kredili). Varsayilan olarak "Mal Mukabili" atanir (mevcut tum dosyalar dahil,
-- talep bu yondeydi) ama dosya bazinda duzenlenebilir kalir.
ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS gumruk_odeme_sekli text DEFAULT 'Mal Mukabili';

UPDATE public.ihracat_dosyalari
  SET gumruk_odeme_sekli = 'Mal Mukabili'
  WHERE gumruk_odeme_sekli IS NULL;
