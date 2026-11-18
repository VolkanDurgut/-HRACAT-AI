-- ============================================================================
-- SIPARIS BILDIRIM FORMU v3 (18.11.2026)
-- ============================================================================
-- Kullanici: "Planlanan Yukleme Tarihi her zaman ardiyesiz giris tarihi olarak dolu gelmeli (form ekipman alim tarihinden
-- bir gun once gitmeli)." + bazi yuklemeler plana siparissiz aktarilmisti.
--  1) siparis_formu_veri: plan.ardiyesiz_giris; siparis eslesmesi plana bagli siparis yoksa siparis listesindeki BL = booking
--     satiri (cuval markasi plandakiyle ayni olan once).
--  2) Veri duzeltmesi (canlida MCP ile, 18.11.2026; kullanici onayi): siparis listesinde iki booking'in BL'i yukleme planina
--     gore yer degistirdi (aciklama alanina not dusuldu). Repoya musteri verisi yazilmaz.
-- Canliya 18.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

create or replace function public.siparis_formu_veri(p_company uuid, p_bas date, p_bit date)
returns setof jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with plan as (
    select v.*, public.booking_anahtar(v.booking_no) as ba
    from public.yukleme_plani_veri(p_company) v
    where v.kaynak in ('excel', 'sistem')
      and public.booking_anahtar(v.booking_no) is not null
      and v.bos_ekipman_tarihi between p_bas and p_bit
  ), tekil as (
    select distinct on (ba) * from plan order by ba, (kaynak = 'excel') desc, sira nulls last
  )
  select jsonb_build_object(
    'anahtar', t.ba,
    'plan', jsonb_build_object(
      'kaynak', t.kaynak, 'booking_no', t.booking_no, 'musteri', t.musteri, 'cinsi', t.cinsi, 'konteyner', t.konteyner,
      'varis_limani', t.varis_limani, 'cuval_markasi', t.cuval_markasi, 'ambalaj', t.ambalaj, 'acente', t.acente, 'liman', t.liman,
      'ekipman', t.ekipman, 'ekipman_alim_yeri', t.ekipman_alim_yeri, 'bos_ekipman_tarihi', t.bos_ekipman_tarihi,
      'ardiyesiz_giris', t.ardiyesiz_giris, 'etd', t.etd,
      'gemi', t.gemi, 'sefer', t.sefer, 'dosya_no', t.dosya_no, 'proforma_no', t.proforma_no, 'kalemler', t.kalemler),
    'siparis', case when s.id is null then null else jsonb_build_object(
      'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi, 'firma', s.firma, 'urun', s.urun,
      'paketleme', s.paketleme, 'marka', s.marka) end,
    'dosya', case when d.id is null then null else jsonb_build_object(
      'id', d.id, 'dosya_no', d.dosya_no, 'alici_firma', d.alici_firma, 'alici_adresi', d.alici_adresi, 'varis_limani', d.varis_limani,
      'lot_no', d.lot_no, 'proforma_no', d.proforma_no, 'proforma_tarihi', d.proforma_tarihi, 'urun_detaylari', d.urun_detaylari,
      'detayli_ambalaj', d.detayli_ambalaj, 'ambalaj', d.ambalaj, 'marka', d.marka, 'marka_listesi', d.ham_veri -> 'marka_listesi',
      'uretim_tarihi', d.uretim_tarihi, 'son_kullanim_tarihi', d.son_kullanim_tarihi) end,
    'adres', a.alici_adresi,
    'temsilci', case when e.id is null then null else jsonb_build_object('ad_soyad', e.ad_soyad, 'hitap', e.hitap, 'eposta', e.eposta) end,
    'kalite', k.parametreler,
    'form', case when f.id is null then null else jsonb_build_object(
      'uretim_tarihi', f.uretim_tarihi, 'skt', f.skt, 'uretim_metin', f.uretim_metin, 'skt_metin', f.skt_metin, 'spekler', f.spekler,
      'tarih_kaynagi', f.tarih_kaynagi, 'gorsel_yolu', f.gorsel_yolu, 'gorsel_adi', f.gorsel_adi,
      'guncelleyen', f.guncelleyen, 'guncelleme', f.guncelleme) end,
    'gonderim', g.bilgi,
    'test', gt.bilgi
  )
  from tekil t
  left join lateral (
    select dd.* from public.rezervasyonlar r join public.ihracat_dosyalari dd on dd.id = r.dosya_id
    where r.company_id = p_company and public.booking_anahtar(r.booking_no) = t.ba
    order by dd.olusturma_tarihi desc limit 1
  ) d on true
  left join lateral (
    -- Siparis: planin bagli siparisi; yoksa siparis listesinde BL'i bu booking olan satir (cuval markasi plandakiyle
    -- ayni olan once). 18.11.2026: bazi bookingler plana siparissiz aktarilmisti (proforma / lot / siparis tarihi bostu).
    select x.* from (
      select sd.*, 0 as oncelik from public.sevkiyat_plani sp join public.siparis_defteri sd on sd.id = sp.siparis_id
      where sp.company_id = p_company and t.anahtar = 'excel:' || sp.id::text
      union all
      select sd.*, case when upper(trim(coalesce(sd.marka, ''))) = upper(trim(coalesce(t.cuval_markasi, ''))) then 1 else 2 end
      from public.siparis_defteri sd
      where sd.company_id = p_company and public.booking_anahtar(sd.bl_no) = t.ba and coalesce(sd.durum, '') <> 'iptal'
    ) x order by x.oncelik, x.updated_at desc limit 1
  ) s on true
  left join lateral (
    -- Musteri adi: dosya > siparis listesi > plan (planda kisa ad olabilir)
    select upper(trim(coalesce(d.alici_firma, s.firma, t.musteri))) as tam, upper(trim(t.musteri)) as kisa
  ) m on true
  left join lateral (
    -- Ulke icin alici adresi: bu yuklemenin dosyasi, yoksa ayni musterinin (tam ad ya da plandaki kisa adla baslayan) en son dosyasi
    select x.alici_adresi from public.ihracat_dosyalari x
    where x.company_id = p_company and nullif(trim(x.alici_adresi), '') is not null
      and (x.id = d.id or upper(trim(x.alici_firma)) = m.tam
           or (length(m.kisa) >= 4 and upper(trim(x.alici_firma)) like m.kisa || '%'))
    order by (x.id = d.id) is true desc, (upper(trim(x.alici_firma)) = m.tam) desc, x.olusturma_tarihi desc limit 1
  ) a on true
  left join lateral (
    -- Temsilci SABIT (18.11.2026, kullanici): ekipte tam adi girilmis ilk aktif uye (pazar_ekip.ad_soyad, sira)
    select ek.* from public.pazar_ekip ek
    where ek.company_id = p_company and ek.aktif and nullif(trim(ek.ad_soyad), '') is not null
    order by ek.sira nulls last, ek.olusturma limit 1
  ) e on true
  left join lateral (
    select ka.parametreler from public.kalite_sertifikasi_ayarlari ka
    where ka.company_id = p_company and (upper(trim(ka.alici_firma)) = m.tam or (length(m.kisa) >= 4 and upper(trim(ka.alici_firma)) like m.kisa || '%'))
    order by (upper(trim(ka.alici_firma)) = m.tam) desc limit 1
  ) k on true
  left join public.siparis_formlari f on f.company_id = p_company and f.booking_anahtar = t.ba
  left join lateral (
    select jsonb_build_object('zaman', go.olusturma, 'alicilar', go.alicilar, 'eksikler', go.eksikler) as bilgi
    from public.siparis_formu_gonderimleri go
    where go.company_id = p_company and go.booking_anahtar = t.ba and go.durum = 'gonderildi' and not go.elle
    order by go.olusturma desc limit 1
  ) g on true
  left join lateral (
    select jsonb_build_object('zaman', gx.olusturma, 'alicilar', gx.alicilar) as bilgi
    from public.siparis_formu_gonderimleri gx
    where gx.company_id = p_company and gx.booking_anahtar = t.ba and gx.durum = 'test'
    order by gx.olusturma desc limit 1
  ) gt on true
  order by t.bos_ekipman_tarihi, t.ba
$$;
revoke all on function public.siparis_formu_veri(uuid, date, date) from public, anon, authenticated;
grant execute on function public.siparis_formu_veri(uuid, date, date) to service_role;
