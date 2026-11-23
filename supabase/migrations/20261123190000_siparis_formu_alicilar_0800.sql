-- 23.11.2026 kullanici: "Siparis bildirim form onayi icin sadece execution - export adresine gonderilecek. Harun Bey gorsel ve
-- spekleri ekledikten sonra gondere basarsa gidecek olan mailde ALICI: uretim - execution - operation - sales - lojistik, CC: bbt.
-- Ilk gonderim her sabah 8 olarak ayarlansin."
-- 1) Export hatirlatmasi (siparis_formu_spek): alici export@ + execution@, CC yok; canli (zaten).
-- 2) Uretime giden form (siparis_formu, Uretime gonder): alici uretim@, execution@, operation@, sales@, lojistik@; CC bbt@.
--    (export@ CC'den cikar.)
-- 3) Hatirlatma saati: hafta ici 08:00 TR (05:00 UTC). Komut / govde degismez, yalniz zamanlama.
update public.rapor_alicilari
   set alicilar = array['export@unex.com.tr', 'execution@unex.com.tr'], cc = '{}'
 where rapor = 'siparis_formu_spek';

update public.rapor_alicilari
   set alicilar = array['uretim@unex.com.tr', 'execution@unex.com.tr', 'operation@unex.com.tr', 'sales@unex.com.tr', 'lojistik@unex.com.tr'],
       cc = array['bbt@unex.com.tr']
 where rapor = 'siparis_formu';

do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'siparis-formu-spek';
  if v_id is not null then
    perform cron.alter_job(v_id, schedule := '0 5 * * 1-5');
  end if;
end $$;
