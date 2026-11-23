-- 23.11.2026 NAVLUN DENETIMI: operasyonun elle tuttugu tablo (NAVLUN_TABLOSU_23.11.2026_2.xlsx) <-> sistem.
-- Kullanici: "Amac navlun bildirimini en dogru sekilde tutabilmek. Volkan Bey'in raporundan alabilecegin dogru seyleri al ve
-- dogru okunabilmesi icin gerekli kontrolleri sagla."
-- 1) Okuma hatasi duzeltmesi (mail metniyle kanitli; okuyucu da duzeltildi: _shared/navlun-oku.ts, tests/navlun-okuma-23kasim):
--    - Draft BATA 20.11 "Tt: 42 days Ft: 14 days": free time 42 / transit bos yazilmisti -> free time 14, transit 42
--    - Draft MOMBASA 19.11 "TT:25-35 GUN FREE TIME: 9 DAYS": transit 25 / free time 35 -> transit 25-35, free time 9
-- 2) Lokal haric (mailde lokaller ayri yazili): ZIM PARAMARIBO 2964 (yukleme 180 + gecici kabul 150 + BL 35 USD + 1750 TL ayri)
-- 3) Operasyon tablosundaki, arsive hic mail gelmemis (ya da fiyati maile ek / acentesiz kalmis) teklifler: tek bir "elle" kaynak
--    mesaji altinda (navlun_mesajlari: '<operasyon-navlun-tablosu-20261123@unex-ai>') kaynak = 'elle'. Mail kaniti olan bir
--    kaydin UZERINE yazilmaz; yalniz eksik olan eklenir. MSC'nin 5 limandaki dusuk fiyati (operasyonun guncel listesi) ayni
--    kaynakla KASIM teklifi olarak eklenir; EKIM mail kaydi yerinde kalir.
-- Tekrar calistirmak guvenli (on conflict do nothing; guncellemeler yalniz eski degerdeyse).
do $$
declare
  v_c uuid;
  v_m text := '<operasyon-navlun-tablosu-20261123@unex-ai>';
  v_t timestamptz := '2026-11-23 06:26:00+00';
begin
  select company_id into v_c from public.navlun_teklifleri where liman_anahtar = 'BATA' and acente = 'Draft' limit 1;
  if v_c is null then raise notice 'navlun verisi yok; atlandi'; return; end if;

  update public.navlun_teklifleri set free_time_gun = 14, transit_gun = '42'
   where company_id = v_c and liman_anahtar = 'BATA' and acente = 'Draft' and tutar = 2300
     and tarih >= '2026-11-20' and tarih < '2026-11-21' and free_time_gun = 42 and transit_gun is null;
  update public.navlun_teklifleri set free_time_gun = 9, transit_gun = '25-35'
   where company_id = v_c and liman_anahtar = 'MOMBASA' and acente = 'Draft' and tutar = 1985
     and tarih >= '2026-11-19' and tarih < '2026-11-20' and free_time_gun = 35 and transit_gun = '25';
  update public.navlun_teklifleri set lokal_dahil = false
   where company_id = v_c and liman_anahtar = 'PARAMARIBO' and acente = 'ZIM' and tutar = 2964 and lokal_dahil is null;

  insert into public.navlun_mesajlari (company_id, mesaj_id, konu, gonderen, acente, liman, liman_anahtar, tarih, kaynak, durum,
                                       olay_sayisi, ozet, govde, cozen, cozum_tarihi, denetim_kapandi)
  values (v_c, v_m, 'Operasyon navlun tablosu (elle) · 23.11.2026', 'operasyon (elle tablo)', null, null, null, v_t, 'metin', 'duzeltildi',
          21, 'Operasyonun elle tuttugu navlun tablosundan, arsive maili gelmemis teklifler (23.11.2026 denetimi).',
          'Kaynak: operasyonun 23.11.2026 navlun tablosu (NAVLUN_TABLOSU_23.11.2026_2.xlsx). Acente maili arsive gelmedigi icin elle eklendi.',
          'denetim 23.11.2026', now(), true)
  on conflict (company_id, mesaj_id) do nothing;

  insert into public.navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar, para_birimi,
                                        ekipman, free_time_gun, transit_gun, lokal_dahil, kaynak, tarih)
  select v_c, v_m, x.sira, 'teklif', x.liman, x.anahtar, x.acente, x.armator, x.tutar, 'USD', '20DC', x.ft, x.tt, null, 'elle', v_t
    from (values
      ( 1, 'MOGADİŞU',     'MOGADISU',     'Akkon',        'Akkon',       1900, null::int, null::text),
      ( 2, 'BİNGAZİ',      'BINGAZI',      'Akkon',        'Akkon',        850, null, null),
      ( 3, 'COTONOU',      'COTONOU',      'Esna',         'Maersk',      1600, null, null),
      ( 4, 'COTONOU',      'COTONOU',      'Esna',         'Hapag-Lloyd', 1625, null, null),
      ( 5, 'COTONOU',      'COTONOU',      'Horoz',        'Maersk',      1730, null, null),
      ( 6, 'LUANDA',       'LUANDA',       'Esna',         'Maersk',      1925, null, null),
      ( 7, 'SAN JUAN',     'SAN JUAN',     'Evolog',       'Hapag-Lloyd', 2150, 10,   '37'),
      ( 8, 'BATA',         'BATA',         'Kuehne+Nagel', 'CMA CGM',     3200, 14,   '42'),
      ( 9, 'DAR ES SELAM', 'DAR ES SELAM', 'Esna',         null,          1780, 14,   '55'),
      (10, 'DAR ES SELAM', 'DAR ES SELAM', 'Draft',        'Maersk',      2150, null, null),
      (11, 'VERACRUZ',     'VERACRUZ',     'Draft',        null,          2700, null, null),
      (12, 'ASHDOD',       'ASHDOD',       'MSC',          'MSC',          950, null, null),
      (13, 'ASHDOD',       'ASHDOD',       'Admiral',      'Admiral',      800, null, null),
      (14, 'AQABA',        'AQABA',        'Draft',        'Maersk',      1800, null, null),
      (15, 'AQABA',        'AQABA',        'MSC',          'MSC',         2775, null, null),
      (16, 'KHORFAKKAN',   'KHORFAKKAN',   'Draft',        'Maersk',      3150, null, null),
      (17, 'JEBEL ALI',    'JEBEL ALI',    'MSC',          'MSC',         6115, null, null),
      (18, 'PORT SUDAN',   'SUDAN',        'MSC',          'MSC',         3825, null, null),
      (19, 'PORT SUDAN',   'SUDAN',        'Akkon',        'Akkon',       3950, null, null),
      -- MSC guncel (operasyon listesi; EKIM mail kaydi 200 USD yuksek)
      (20, 'TEMA',         'TEMA',         'MSC',          'MSC',         1745, null, null),
      (21, 'COTONOU',      'COTONOU',      'MSC',          'MSC',         2030, null, null),
      (22, 'DOUALA',       'DOUALA',       'MSC',          'MSC',         2385, null, null),
      (23, 'LUANDA',       'LUANDA',       'MSC',          'MSC',         2490, null, null),
      (24, 'VERACRUZ',     'VERACRUZ',     'MSC',          'MSC',         2055, null, null)
    ) as x(sira, liman, anahtar, acente, armator, tutar, ft, tt)
  on conflict (company_id, mesaj_id, sira) do nothing;
  update public.navlun_mesajlari set olay_sayisi = (select count(*) from public.navlun_teklifleri where company_id = v_c and mesaj_id = v_m)
   where company_id = v_c and mesaj_id = v_m;
end $$;
