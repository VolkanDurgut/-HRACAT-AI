-- ============================================================================
-- YEDEK GERI YUKLEME TESTI (05.10.2026)
-- ============================================================================
-- Gece yedegi (yedekleme-gonder) urettigi JSON paketi bu fonksiyona verir.
-- Fonksiyon paketteki her tabloyu, canli tabloyla AYNI yapida GECICI
-- tablolara (ON COMMIT DROP) GERCEKTEN yukler ve:
--   1) her satirin canlidaki satirla deger olarak birebir ayni oldugunu,
--   2) tablolar arasi baglarin (yabanci anahtar) yedegin icinde tutarli
--      oldugunu kontrol eder.
-- CANLI VERIYE HICBIR SEY YAZMAZ: gecici tablolar islem bitince silinir.
-- Sadece service_role cagirabilir.
--
-- Not: yedek ile test arasinda (saniyeler) biri kayit degistirirse o satir
-- "farkli" gorunur; bu yuzden fark, hata degil "uyari" olarak raporlanir.
-- ============================================================================
create or replace function public.yedek_geri_yukleme_testi(paket jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  tablo text;
  satir_sayisi bigint;
  farkli bigint;
  canlida_yok bigint;
  sonuc jsonb := '[]'::jsonb;
  bag_sorunlari jsonb := '[]'::jsonb;
  hata_sayisi int := 0;
  sayi bigint;
  bag record;
begin
  for tablo in
    select k from jsonb_object_keys(paket) k
    where left(k, 1) <> '_'
      and exists (select 1 from information_schema.tables t
                  where t.table_schema = 'public' and t.table_name = k and t.table_type = 'BASE TABLE')
    order by 1
  loop
    begin
      execute format('create temp table %I (like public.%I including defaults) on commit drop', 'gy_' || tablo, tablo);
      execute format('insert into %I select * from jsonb_populate_recordset(null::public.%I, $1)', 'gy_' || tablo, tablo)
        using paket -> tablo;
      execute format('select count(*) from %I', 'gy_' || tablo) into satir_sayisi;
      -- Geri yuklenen her satir, canlidaki ayni id'li satirla DEGER olarak ayni mi?
      -- jsonb esitligi: 1750.00 = 1750 (yedek JavaScript'ten gectigi icin sondaki
      -- sifirlar duser - deger ayni), ama gercek hassasiyet kaybi YAKALANIR.
      execute format(
        'select count(*) filter (where c.id is null), count(*) filter (where c.id is not null and to_jsonb(g) is distinct from to_jsonb(c))
           from %I g left join public.%I c on c.id = g.id', 'gy_' || tablo, tablo)
        into canlida_yok, farkli;
      sonuc := sonuc || jsonb_build_object('tablo', tablo, 'satir', satir_sayisi, 'canlida_yok', canlida_yok, 'farkli', farkli,
        'durum', case when canlida_yok = 0 and farkli = 0 then 'birebir' else 'fark_var' end);
    exception when others then
      hata_sayisi := hata_sayisi + 1;
      sonuc := sonuc || jsonb_build_object('tablo', tablo, 'durum', 'YUKLENEMEDI', 'hata', sqlerrm);
    end;
  end loop;

  -- Yedegin kendi icinde bag tutarliligi (geri yuklenen sistemde kirik bag kalmasin)
  for bag in
    select * from (values
      ('konteynerler', 'dosya_id', 'ihracat_dosyalari'),
      ('konteynerler', 'rezervasyon_id', 'rezervasyonlar'),
      ('rezervasyonlar', 'dosya_id', 'ihracat_dosyalari'),
      ('dosya_evraklari', 'dosya_id', 'ihracat_dosyalari'),
      ('acente_teklifleri', 'dosya_id', 'ihracat_dosyalari'),
      ('acente_teklifleri', 'acente_id', 'acenteler'),
      ('ihracat_dosyalari', 'ana_siparis_id', 'ana_siparisler'),
      ('kullanici_rolleri', 'company_id', 'companies'),
      ('ihracat_dosyalari', 'company_id', 'companies')
    ) v(cocuk, kolon, ebeveyn)
  loop
    if to_regclass('pg_temp.gy_' || bag.cocuk) is not null and to_regclass('pg_temp.gy_' || bag.ebeveyn) is not null then
      execute format('select count(*) from %I c where c.%I is not null and not exists (select 1 from %I e where e.id = c.%I)',
        'gy_' || bag.cocuk, bag.kolon, 'gy_' || bag.ebeveyn, bag.kolon) into sayi;
      if sayi > 0 then
        bag_sorunlari := bag_sorunlari || jsonb_build_object('bag', bag.cocuk || '.' || bag.kolon || ' -> ' || bag.ebeveyn, 'kirik', sayi);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'tablo_sayisi', jsonb_array_length(sonuc),
    'yuklenemeyen', hata_sayisi,
    'birebir', (select count(*) from jsonb_array_elements(sonuc) e where e ->> 'durum' = 'birebir'),
    'bag_sorunlari', bag_sorunlari,
    'tablolar', sonuc
  );
end;
$$;

revoke all on function public.yedek_geri_yukleme_testi(jsonb) from public, anon, authenticated;
grant execute on function public.yedek_geri_yukleme_testi(jsonb) to service_role;
