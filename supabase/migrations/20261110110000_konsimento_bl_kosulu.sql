-- KONSIMENTO TALIMATI HATIRLATMASI - BL no kosulu kaldirildi (10.11.2026)
-- Kullanici: "Konsimento talimati hazir oldugunda yani butun konteynerler teslim alindiginda operation@unex.com.tr
-- adresine konsimento talimati mail gidiyor mu? Canlida oldugundan emin olmaliyiz."
-- Sorun: kh_tamamlanma_kontrol "BL no doluysa hatirlatma yok" diyordu; fakat Ek Bilgiler karti BL no alanini
-- rezervasyon (booking) numarasiyla ONCEDEN doldurur. Bu durumda tum konteynerler girilse bile mail hic
-- kuyruga girmiyordu (canli ornek: acik bir dosyada BL no = booking no, talimat yuklenmemis).
-- Yeni kural: yalniz konsimento talimati dosyasi YUKLENMISSE (konsimento_dosya_url) hatirlatma yok.
-- Diger kurallar (eski sevkiyat korumasi, adet esitligi, dosya basina tek kayit) DEGISMEDI.

create or replace function public.kh_tamamlanma_kontrol(p_dosya_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid;
  v_kt text;
  v_rez integer;
  v_kont integer;
  v_cutoff timestamptz;
  v_kalkis date;
begin
  if p_dosya_id is null then return; end if;
  select d.company_id, d.konsimento_dosya_url
    into v_sirket, v_kt
    from public.ihracat_dosyalari d where d.id = p_dosya_id;
  -- Talimat zaten yuklendiyse hatirlatmanin anlami yok (BL no tek basina olcu DEGIL: booking no ile dolabilir)
  if v_sirket is null or v_kt is not null then return; end if;
  select coalesce(sum(r.konteyner_adedi), 0), max(r.talimat_cutoff), max(r.gemi_kalkis_tarihi)
    into v_rez, v_cutoff, v_kalkis from public.rezervasyonlar r where r.dosya_id = p_dosya_id;
  -- Eski / gecmis sevkiyat: hatirlatma anlamsiz (yedekten geri yuklemede toplu mail de engellenir)
  if (v_cutoff is not null and v_cutoff < now() - interval '3 days')
     or (v_kalkis is not null and v_kalkis < current_date - 3) then
    return;
  end if;
  select count(*) into v_kont from public.konteynerler k where k.dosya_id = p_dosya_id;
  if v_rez > 0 and v_kont = v_rez then
    insert into public.konsimento_hatirlatmalari (company_id, dosya_id) values (v_sirket, p_dosya_id)
    on conflict (dosya_id) do nothing;
  end if;
exception when others then
  -- Konteyner / rezervasyon kaydi ASLA bu yuzden basarisiz olmasin
  raise warning 'kh_tamamlanma_kontrol(%): %', p_dosya_id, sqlerrm;
end; $function$;

-- Kuyruk alma: otomatik satir yalniz talimat YUKLENDIYSE 'atlandi' olur (BL no kosulu ayni gerekceyle kaldirildi).
create or replace function public.kh_kuyruk_al(p_limit integer default 10, p_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_sonuc jsonb := '[]'::jsonb;
  v_veri jsonb;
begin
  for r in
    select h.* from public.konsimento_hatirlatmalari h
    where (p_id is null or h.id = p_id)
      and (h.durum = 'bekliyor'
           or (h.durum = 'hata' and h.deneme < 3 and (p_id is not null or h.guncelleme < now() - interval '10 minutes'))
           or (h.durum = 'gonderiliyor' and h.kilit < now() - interval '10 minutes'))
    order by h.olusturma
    limit greatest(1, least(coalesce(p_limit, 10), 20))
    for update skip locked
  loop
    v_veri := public.kh_mail_verisi(r.dosya_id);
    if v_veri is null then
      update public.konsimento_hatirlatmalari set durum = 'atlandi', son_hata = 'Dosya bulunamadı.' where id = r.id;
      continue;
    end if;
    if r.tetik = 'otomatik' and coalesce((v_veri ->> 'konsimento_yuklendi')::boolean, false) then
      update public.konsimento_hatirlatmalari set durum = 'atlandi', son_hata = 'Konşimento talimatı zaten yüklenmiş.' where id = r.id;
      continue;
    end if;
    update public.konsimento_hatirlatmalari
       set durum = 'gonderiliyor', kilit = now(), deneme = deneme + 1
     where id = r.id;
    v_sonuc := v_sonuc || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'tetik', r.tetik, 'isteyen_email', r.isteyen_email,
      'gonderim_sayisi', r.gonderim_sayisi, 'veri', v_veri));
  end loop;
  return v_sonuc;
end; $function$;
