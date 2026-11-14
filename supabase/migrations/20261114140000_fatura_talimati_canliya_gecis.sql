-- 14.11.2026 Fatura talimati maili CANLIYA ALINDI (Ayarlar > Rapor Alicilari > Fatura Talimati:
-- bbt@ / execution@ / operation@ / export@ / export2@).
-- Kullanici: "Bundan sonrasi icin canliya alalim. Sirada zaten sadece en son IHR-2026-0115 ... Sadece bunu
-- gondermemiz ve bundan sonrakiler icin destek saglasak yeterlidir."
-- Canliya gecince pg_cron 'fatura-onay-tara' canli kaydi OLMAYAN her hazir dosyaya gercek mail atar. Gecis
-- anindaki eski hazir dosyalar (0110 / 0112 / 0113 / 0114) icin mail ISTENMEDI: bunlara 'atlandi' canli kaydi
-- yazilir (mail gitmez; dosya sayfasinda "Gonderilmedi (canliya geciste atlandi)" + "Simdi gonder").
-- IHR-2026-0115 icin kayit yazilmaz: ilk taramada otomatik gider.

alter table public.fatura_talimati_onaylari drop constraint if exists fatura_talimati_onaylari_durum_check;
alter table public.fatura_talimati_onaylari add constraint fatura_talimati_onaylari_durum_check
  check (durum in ('gonderildi', 'atlandi', 'bekliyor', 'onaylandi', 'revize'));

insert into public.fatura_talimati_onaylari (company_id, dosya_id, durum, test, kaynak, gonderen)
select d.company_id, d.id, 'atlandi', false, 'elle', 'canliya-gecis-14.11.2026'
  from public.ihracat_dosyalari d
 where d.dosya_no in ('IHR-2026-0110', 'IHR-2026-0112', 'IHR-2026-0113', 'IHR-2026-0114')
   and not exists (select 1 from public.fatura_talimati_onaylari o where o.dosya_id = d.id and not o.test);

update public.rapor_alicilari
   set canli = true, guncelleyen = 'canliya-gecis-14.11.2026', guncelleme = now()
 where rapor = 'fatura_onay'
   and alicilar @> array['bbt@unex.com.tr', 'execution@unex.com.tr', 'operation@unex.com.tr', 'export@unex.com.tr', 'export2@unex.com.tr']::text[];
