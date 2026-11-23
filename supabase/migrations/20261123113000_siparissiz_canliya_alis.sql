-- 23.11.2026 SIPARISSIZ MUSTERI RAPORU CANLIYA ALIS (kullanici: "Son olarak sistemi canliya alalim").
-- 1) Yukleme Plani'nda farkli yazilan musteriler Pazar kartlarina baglanir (ek anahtar; pazar_ek_anahtar_ekle_ic). Dogrulama
--    (23.11): ilk test raporunda bu 3 musteri "sevkiyat kaydi yok" gorunuyordu; plan satirlari kartla eslesmiyordu:
--      ALI SALAH (5 sevkiyat)               -> BOULANGERIE ALI SALAH YOUSSOUF
--      SHARIKAT BACKALDRIN (2 sevkiyat)     -> BACKALDRİN
--      DANAH ENTERPRISES OFF SHORE (1)      -> DANAH ENTR
--      ATLANPASIFIC (1, yazim hatasi)       -> ATLANPACIFIC
--    "GMB- BOCUUM" BAGLANMADI (GMB Trading ile ayni firma oldugu dogrulanmadi); diger eslesmeyenlerin Pazar karti yok.
-- 2) rapor_alicilari 'siparissiz' CANLI (alici export@, CC bbt@ + execution@): her pazartesi 09:00.
-- Kart yoksa (baska sirket / ad degismis) adim atlanir; hicbir kayit silinmez.
do $$
declare
  c uuid;
  r record;
begin
  for c in select distinct company_id from public.rapor_alicilari where rapor = 'siparissiz' loop
    for r in select * from (values
      ('BOULANGERIE ALI SALAH YOUSSOUF', 'ALI SALAH'), ('BACKALDRİN', 'SHARIKAT BACKALDRIN'),
      ('DANAH ENTR', 'DANAH ENTERPRISES OFF SHORE'), ('ATLANPACIFIC', 'ATLANPASIFIC')) v(kart, ek)
    loop
      if exists (select 1 from public.pazar_firmalar f where f.company_id = c and f.ad = r.kart) then
        perform public.pazar_ek_anahtar_ekle_ic(c, (select f.anahtar from public.pazar_firmalar f where f.company_id = c and f.ad = r.kart limit 1), array[r.ek]);
      end if;
    end loop;
    update public.rapor_alicilari set canli = true, guncelleyen = 'canliya alis (23.11.2026)', guncelleme = now()
     where company_id = c and rapor = 'siparissiz' and coalesce(array_length(alicilar, 1), 0) > 0;
  end loop;
end $$;
