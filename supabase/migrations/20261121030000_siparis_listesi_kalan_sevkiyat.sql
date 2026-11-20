-- ============================================================================
-- SIPARIS LISTESI: KALAN SEVKIYAT DUZELTMESI (21.11.2026). 20261121020000'deki "eski asama kopyasi" kurali YANLISTI.
-- Kullanici: "BLACKSTALLION bize 18 konteynerlik siparis vermisti; ikinci rezervasyon yukleniyor, kalan 6 konteyner."
-- Excel her SEVKIYATI ayri satir tutar (6 + 6 + 6). Kural dosyalarin TOPLAM miktarina bakiyordu; ama o dosyalar zaten
-- diger Excel satirlarina bagliydi -> kalan sevkiyat satiri yanlislikla gizlendi (BLACKSTALLION 6 kont., CRISA 10 kont.).
-- Duzeltme: bagsiz aktif Excel satirini yalniz HICBIR Excel satirina bagli olmayan dosyalar karsiliyorsa gizle.
-- Kuru calistirma farki: yalniz bu iki satir geri gelir; baska degisiklik yok.
-- ============================================================================

do $yama$
declare
  f text;
  a text := 'and coalesce(sd.miktar_mt, 0) <= (select coalesce(sum(d3.miktar_mt), 0) from dos d3 where d3.pk = sd.pk))';
  b text := 'and coalesce(sd.miktar_mt, 0) <= (select coalesce(sum(d3.miktar_mt), 0) from dos d3 where d3.pk = sd.pk and not exists (select 1 from sd s4 where s4.bagli = d3.dosya_id)))';
begin
  f := pg_get_functiondef('public.siparis_listesi_veri(uuid)'::regprocedure);
  if (length(f) - length(replace(f, a, ''))) / length(a) <> 1 then
    raise exception 'siparis_listesi_veri beklenen bicimde degil; degistirilmedi.';
  end if;
  execute replace(f, a, b);
end $yama$;
