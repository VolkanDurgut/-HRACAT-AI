-- 11.11.2026: KONTEYNER ICERIGI - bir konteynere birden fazla urun / cuval.
-- Kullanici: "Bir konteynerde 2 farkli urun var; packing belgesinde o konteynerin 2 urun ismi yazmasi normal. Bir
-- konteynere 2 ayri cuval ekleyebilmeliyiz. Diger konteynerde yalniz kendi urunu yazmali."
-- konteynerler.kalemler: [{urun, marka, pieces, net_kg}] (en fazla 6). NULL = eski davranis (urun markadan bulunur).
-- Mevcut hicbir kayit DEGISMEZ; kolon bos baslar. Yazma mevcut konteyner RLS'iyle (ayni sirket).
alter table public.konteynerler add column if not exists kalemler jsonb
  check (kalemler is null or (jsonb_typeof(kalemler) = 'array' and jsonb_array_length(kalemler) between 1 and 6));
comment on column public.konteynerler.kalemler is 'Konteyner icerigi: [{urun, marka, pieces, net_kg}] - birden fazla urun/cuval (11.11.2026)';
