-- ============================================================================
-- PAZAR > Musterilerimiz: toplam hacim (16.11.2026, kullanici onayi)
-- ============================================================================
-- pazar_musteri_siparisleri() dosya satirlarina 'toplam_tutar' ve 'para_birimi' eklenir (yalniz IKI alan; diger alanlar,
-- filtreler, yetki ve grant'ler AYNI - 20261110050000_pazar_musteri_karti.sql). Musteri tablosundaki "Toplam hacim"
-- Kontrol Merkezi ile ayni kaynaktan (ihracat_dosyalari.toplam_tutar) hesaplanir. Gercek musteri verisi icermez.
-- ============================================================================

create or replace function public.pazar_musteri_siparisleri()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtarlar text[];
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  select coalesce(array_agg(distinct a), '{}') into v_anahtarlar
    from (select anahtar a from public.pazar_firmalar where company_id = v_sirket and durum = 'musteri'
          union all
          select unnest(ek_anahtarlar) from public.pazar_firmalar where company_id = v_sirket and durum = 'musteri') x;

  return jsonb_build_object(
    'dosyalar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'anahtar', public.pazar_anahtar(d.alici_firma), 'dosya_no', d.dosya_no, 'durum', d.durum,
        'olusturma_tarihi', d.olusturma_tarihi, 'varis_limani', d.varis_limani, 'alici_adresi', d.alici_adresi,
        'ana_siparis_id', d.ana_siparis_id, 'urun_detaylari', d.urun_detaylari, 'toplam_konteyner', d.toplam_konteyner,
        'proforma_no', d.proforma_no, 'toplam_tutar', d.toplam_tutar, 'para_birimi', d.para_birimi) order by d.olusturma_tarihi desc)
      from public.ihracat_dosyalari d
      where d.company_id = v_sirket and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'rezervasyonlar', coalesce((
      select jsonb_agg(jsonb_build_object('dosya_id', r.dosya_id, 'konteyner_adedi', r.konteyner_adedi))
      from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
      where d.company_id = v_sirket and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'konteynerler', coalesce((
      select jsonb_agg(jsonb_build_object('dosya_id', k.dosya_id, 'dba_dosya_url', case when k.dba_dosya_url is null then null else 'var' end))
      from public.konteynerler k join public.ihracat_dosyalari d on d.id = k.dosya_id
      where d.company_id = v_sirket and d.durum = 'Açık' and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'ana_siparisler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'anahtar', public.pazar_anahtar(s.alici_firma), 'proforma_no', s.proforma_no, 'urun_tanimi', s.urun_tanimi,
        'toplam_mts', s.toplam_mts, 'urun_detaylari_master', s.urun_detaylari_master, 'tamamlandi', s.tamamlandi,
        'olusturma_tarihi', s.olusturma_tarihi))
      from public.ana_siparisler s
      where s.company_id = v_sirket and not coalesce(s.tamamlandi, false) and public.pazar_anahtar(s.alici_firma) = any(v_anahtarlar)), '[]'::jsonb)
  );
end;
$$;
