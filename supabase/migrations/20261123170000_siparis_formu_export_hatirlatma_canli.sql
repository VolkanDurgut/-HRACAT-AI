-- 23.11.2026 aksam. Kullanici: "Gonder butonu ile uretime Unex AI mail olarak gondersin. Cuval yuklenmeden ve spekler girilmeden
-- gonderilemesin. Hatirlatma her sabah gonderilsin."
-- -> Otomatik form gonderimi kaldirildi (edge siparis-formu 'otomatik' islemi silindi; form yalniz Uretime gonder ile gider).
-- -> Export sabah hatirlatmasi (rapor 'siparis_formu_spek', cron 'siparis-formu-spek' hafta ici 08:17 TR) CANLI: alici export@.
--    Bu anahtar artik yalniz hatirlatma mailini yonetir; form gonderimine etkisi yoktur.
update public.rapor_alicilari set canli = true where rapor = 'siparis_formu_spek' and not canli;
