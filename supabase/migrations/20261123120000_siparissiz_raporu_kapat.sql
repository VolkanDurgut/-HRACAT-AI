-- 23.11.2026 SIPARISSIZ MUSTERI HAFTALIK RAPORU KAPATILDI.
-- Kullanici: "Bu rapor neden canlida? ... Boyle bir seye gerek yok. Bunu Pazar kisminda potansiyel
-- musterilerimizin takipleri icin dusunduk. Ilave mail gitmesine gerek yok."
-- Haftalik mail (pazartesi 09:00) durduruldu: zamanlanmis is silindi, alici satiri canli=false.
-- Kod (edge siparissiz-musteri-rapor, pazar_siparissiz_ozet) yerinde kalir; zamanlanmis is olmadan
-- kendiliginden mail gitmez. Gunluk gorev sirasi (pazar_gorev_olustur ritim onceligi) DEGISMEZ.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'siparissiz-musteri-rapor') then
    perform cron.unschedule('siparissiz-musteri-rapor');
  end if;
  update public.rapor_alicilari
     set canli = false, guncelleyen = 'kullanici istegiyle kapatildi (23.11.2026)', guncelleme = now()
   where rapor = 'siparissiz';
end $$;
