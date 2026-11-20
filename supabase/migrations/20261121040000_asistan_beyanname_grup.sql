-- ============================================================================
-- YONETICI ASISTANI: BIRLESIK FATURA BEYANNAMESI (21.11.2026). Kullanici onayi: beyanname kontrolu birlesik fatura
-- grubunun toplamiyla karsilastirsin (lib/beyanname-beklenen.ts + grupBeklenenBirlestir; sonuc grup_dosya_sayisi tasir).
-- Asistan: grup toplamiyla yapilmis (grup_dosya_sayisi olan) beyanname kontrolu artik gorev acabilir; gruptaki her dosya
-- ayni sonucu tasidigindan grup basina TEK gorev (en kucuk dosya no). Eski (dosya bazli) sonuclar yine atlanir.
-- Yalniz yonetici_asistan_veri'deki beyanname kosulu degisir; tanim canlidan okunup beklenen metin AYNEN bulunursa.
-- ============================================================================

do $yama$
declare
  f text;
  a text := E'    and not exists (select 1 from public.ihracat_dosyalari g where g.company_id = p_company and g.id <> d.id\n                    and nullif(btrim(d.fatura_no), \'\') is not null and g.fatura_no = d.fatura_no)';
  b text := E'    and (not exists (select 1 from public.ihracat_dosyalari g where g.company_id = p_company and g.id <> d.id\n                    and nullif(btrim(d.fatura_no), \'\') is not null and g.fatura_no = d.fatura_no)\n      or (d.beyanname_kontrol_sonucu ? \'grup_dosya_sayisi\'\n          and not exists (select 1 from public.ihracat_dosyalari g2 where g2.company_id = p_company and g2.fatura_no = d.fatura_no\n                          and g2.dosya_no < d.dosya_no and g2.durum = \'Açık\' and g2.beyanname_dosya_url is not null\n                          and (g2.beyanname_kontrol_sonucu ->> \'uyumlu\') = \'false\' and g2.beyanname_kontrol_sonucu ? \'grup_dosya_sayisi\')))';
begin
  f := pg_get_functiondef('public.yonetici_asistan_veri(uuid)'::regprocedure);
  if (length(f) - length(replace(f, a, ''))) / length(a) <> 1 then
    raise exception 'yonetici_asistan_veri beklenen bicimde degil; degistirilmedi.';
  end if;
  execute replace(f, a, b);
end $yama$;
