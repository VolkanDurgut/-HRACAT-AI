-- 27.11.2026 · MV SEA BREEZE liman fişi ↔ fabrika kantarı mutabakatı (veri düzeltmesi, silme yok)
-- Liman çekici/dorse plakası farklı olduğu için iki sefer eşleşmemişti:
--  (1) Kantar #2631 ↔ liman fişi TF83749 (tek fiş)
--  (2) Kantar #2685 ↔ liman fişleri TF84055 + TF84068 (limanda iki parça tartım, toplam tek yük;
--      fiş→araç bağı tekil olduğundan TF84055 bağlanır, liman_kg iki fişin toplamı)
-- Yalnızca henüz bağlanmamış kayıtlara dokunur; tekrar çalışırsa bir şey değiştirmez.

do $$
declare
  v_gemi uuid;
  v_arac uuid;
  f1 public.ic_gemi_liman_fisleri%rowtype;
  f2 public.ic_gemi_liman_fisleri%rowtype;
begin
  select id into v_gemi from public.ic_gemi_tahliyeleri where ic_gemi_jeton(gemi_adi) = ic_gemi_jeton('SEA BREEZE') and durum = 'acik' limit 1;
  if v_gemi is null then return; end if;

  -- (1) #2631 ↔ TF83749
  select a.id into v_arac from public.ic_gemi_araclari a join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
   where a.gemi_id = v_gemi and k.kayit_no = 2631 and a.liman_kg is null;
  select * into f1 from public.ic_gemi_liman_fisleri where gemi_id = v_gemi and fis_kodu = 'ANAKANTAR202611TF83749' and arac_id is null;
  if v_arac is not null and f1.id is not null then
    update public.ic_gemi_liman_fisleri set arac_id = v_arac where id = f1.id;
    update public.ic_gemi_araclari
       set liman_kg = f1.net_kg, liman_bos_kg = f1.bos_kg, liman_dolu_kg = f1.dolu_kg, liman_cikis = f1.cikis,
           liman_fis_kodu = f1.fis_kodu, liman_alici = f1.alici, plaka = f1.plaka,
           esleme_onayli = true, esleme_kapali = false, uyarilar = '{}',
           notlar = left(concat_ws(' · ', notlar, '27.11 mutabakat: liman dorse plakası, kantar çekici plakası'), 300)
     where id = v_arac;
  end if;

  -- (2) #2685 ↔ TF84055 + TF84068
  v_arac := null;
  select a.id into v_arac from public.ic_gemi_araclari a join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
   where a.gemi_id = v_gemi and k.kayit_no = 2685 and a.liman_kg is null;
  select * into f1 from public.ic_gemi_liman_fisleri where gemi_id = v_gemi and fis_kodu = 'ANAKANTAR202611TF84055' and arac_id is null;
  select * into f2 from public.ic_gemi_liman_fisleri where gemi_id = v_gemi and fis_kodu = 'ANAKANTAR202611TF84068' and arac_id is null;
  if v_arac is not null and f1.id is not null and f2.id is not null then
    -- ic_gemi_liman_fisleri.arac_id tekil: araca ilk fiş bağlanır, tonaj iki fişin toplamıdır; ikinci fiş notta.
    update public.ic_gemi_liman_fisleri set arac_id = v_arac where id = f1.id;
    update public.ic_gemi_araclari
       set liman_kg = f1.net_kg + f2.net_kg, liman_bos_kg = f1.bos_kg, liman_dolu_kg = f2.dolu_kg, liman_cikis = f2.cikis,
           liman_fis_kodu = f1.fis_kodu, liman_alici = f1.alici, plaka = f1.plaka,
           esleme_onayli = true, esleme_kapali = false, uyarilar = '{}',
           notlar = left(concat_ws(' · ', notlar, '27.11 mutabakat: limanda iki parça tartım (' || f1.fis_kodu || ' + ' || f2.fis_kodu || ')'), 300)
     where id = v_arac;
  end if;
end $$;
