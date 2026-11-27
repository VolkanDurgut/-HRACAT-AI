-- 27.11.2026 · MV SEA BREEZE: kantar #2664 hatalı kayıt (kullanıcı onaylı).
-- #2664 = 34 ZPT 45'in dolu tartımı (#2665 ile aynı brüt) + 59 ACK 015'in darası (#2668 ile aynı dara);
-- iki aracın gerçek seferleri #2665 ve #2668 olarak ayrıca kayıtlı ve liman fişine bağlı.
-- ic_gemi_arac_sil ile aynı işlem: tartım gemiden hariç tutulur, otomatik araç satırı kaldırılır.
do $$
declare v_gemi uuid; a public.ic_gemi_araclari%rowtype;
begin
  select id into v_gemi from public.ic_gemi_tahliyeleri where ic_gemi_jeton(gemi_adi) = ic_gemi_jeton('SEA BREEZE') and durum = 'acik' limit 1;
  if v_gemi is null then return; end if;
  select x.* into a from public.ic_gemi_araclari x join public.kantar_tartimlari k on k.id = x.kantar_tartim_id
   where x.gemi_id = v_gemi and k.kayit_no = 2664 and x.kaynak = 'otomatik' and x.liman_kg is null and x.alici_id is null;
  if a.id is null then return; end if;
  insert into public.ic_gemi_haric_tartimlar (tartim_id, company_id, gemi_id, isaretleyen_email)
  values (a.kantar_tartim_id, a.company_id, a.gemi_id, 'execution@unex.com.tr')
  on conflict (tartim_id) do nothing;
  delete from public.ic_gemi_araclari where id = a.id;
end $$;
