-- 11.11.2026: MUSTERI OZET RAPORU (her gun 08:00 TR). Kullanici: "Her musteri icin ozet raporu olusturulsun.
-- Veritabanina gore. Hergun musterilere gonderilmesi icin mail ile talimat verilecek departmanlara. Potansiyel
-- musterilerimiz icin ozet rapor olusturulsun." Edge function: musteri-ozet-rapor (service_role).
-- Musteriye sistemden mail GITMEZ (CLAUDE.md: dogrudan musteri maili askida); departmanlara gunluk talimat maili
-- gider, musteriye iletilecek metin "Outlook'ta hazirla" (mailto) ile departmandan cikar.
-- MUSTERI_OZET_CANLI secret'i "evet" olmadikca mail YALNIZ test adresine gider.

create table if not exists public.musteri_ozet_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rapor_tarihi date not null,
  durum text not null default 'gonderiliyor' check (durum in ('gonderiliyor', 'gonderildi')),
  test boolean not null default false,
  elle boolean not null default false,
  alicilar text check (alicilar is null or char_length(alicilar) <= 1000),
  ozet jsonb,
  olusturma timestamptz not null default now(),
  gonderim_zamani timestamptz
);
-- Zamanlanmis CANLI gonderim sirket + gun icin tek kayit (test modundaki zamanlanmis gonderim canliyi engellemez)
create unique index if not exists musteri_ozet_gonderimleri_gun_uniq
  on public.musteri_ozet_gonderimleri (company_id, rapor_tarihi) where not elle and not test;
create index if not exists musteri_ozet_gonderimleri_sirket_idx on public.musteri_ozet_gonderimleri (company_id, olusturma desc);

alter table public.musteri_ozet_gonderimleri enable row level security;
revoke all on public.musteri_ozet_gonderimleri from anon, authenticated;

-- Rapor verisi: tek cagri, salt okunur. Musteri = pazar_firmalar.durum = 'musteri' (rezervasyonla musteri olan;
-- docs/claude/pazar.md 3.2). Dosya / siparis eslesmesi pazar_anahtar() ile (Pazar sayfasiyla ayni kural).
-- YALNIZ service_role cagirir (edge); anon / authenticated'a kapali.
create or replace function public.musteri_ozet_veri(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if p_company is null then raise exception 'Sirket gerekli.'; end if;
  return jsonb_build_object(
    'bugun', v_bugun,
    'musteriler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'ad', f.ad, 'anahtarlar', array_remove(array[f.anahtar] || coalesce(f.ek_anahtarlar, '{}'), null),
        'ulke', f.ulke, 'crm_asama', f.crm_asama, 'son_temas', f.son_temas, 'sonraki_adim', f.sonraki_adim,
        'musteri_olma_tarihi', f.musteri_olma_tarihi,
        'epostalar', coalesce((select jsonb_agg(k.eposta order by k.created_at) from pazar_kisiler k
                                where k.firma_id = f.id and k.eposta_gecerli and k.eposta is not null), '[]'::jsonb)
      ) order by f.ad)
      from pazar_firmalar f where f.company_id = p_company and f.durum = 'musteri'), '[]'::jsonb),
    'dosyalar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'anahtar', pazar_anahtar(d.alici_firma), 'dosya_no', d.dosya_no, 'durum', d.durum,
        'olusturma_tarihi', d.olusturma_tarihi, 'alici_firma', d.alici_firma, 'varis_limani', d.varis_limani,
        'proforma_no', d.proforma_no, 'urun_tanimi', d.urun_tanimi, 'toplam_konteyner', d.toplam_konteyner,
        'fatura_no', d.fatura_no, 'fatura_tarihi', d.fatura_tarihi, 'bl_no', d.bl_no,
        'fatura_var', d.fatura_dosya_url is not null, 'konsimento_var', d.konsimento_dosya_url is not null,
        'draft_var', d.draft_bl_dosya_url is not null, 'draft_mail', coalesce(d.draft_mail_gonderildi, false),
        'draft_mail_tarihi', d.draft_mail_gonderildi_tarihi, 'draft_onay', coalesce(d.draft_musteri_onayi_alindi, false),
        'draft_revize', coalesce(d.draft_revize_istendi, false), 'draft_revize_notu', left(d.draft_revize_notu, 200)
      ) order by d.olusturma_tarihi)
      from ihracat_dosyalari d where d.company_id = p_company), '[]'::jsonb),
    'rezervasyonlar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dosya_id', r.dosya_id, 'booking_no', r.booking_no, 'gemi_adi', r.gemi_adi, 'sefer_no', r.sefer_no,
        'etd', r.gemi_kalkis_tarihi, 'eta', r.eta, 'konteyner_adedi', r.konteyner_adedi, 'acente', r.acente_ismi,
        'talimat_cutoff', r.talimat_cutoff, 'konsimento_durumu', r.konsimento_durumu
      ) order by r.gemi_kalkis_tarihi nulls last, r.id)
      from rezervasyonlar r where r.company_id = p_company and r.dosya_id is not null), '[]'::jsonb),
    'hatirlatmalar', coalesce((
      select jsonb_agg(jsonb_build_object('dosya_id', h.dosya_id, 'adet', h.adet, 'son', h.son))
      from (select dosya_id, count(*) adet, max(gonderim_zamani) son from odeme_hatirlatmalari
            where company_id = p_company and dosya_id is not null group by dosya_id) h), '[]'::jsonb),
    'siparisler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'anahtar', pazar_anahtar(s.firma), 'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi,
        'firma', s.firma, 'urun', s.urun, 'miktar_mt', s.miktar_mt, 'konteyner', s.konteyner, 'liman', s.liman,
        'durum', s.durum, 'on_odeme_tarihi', s.on_odeme_tarihi, 'dosya_no', s.dosya_no
      ) order by s.proforma_tarihi nulls last)
      from siparis_listesi_veri(p_company) s where s.durum in ('onay_bekliyor', 'on_odeme_alindi')), '[]'::jsonb),
    'gelenler', coalesce((
      select jsonb_agg(jsonb_build_object('firma_id', g.firma_id, 'tarih', g.tarih, 'konu', left(g.konu, 160),
        'oneri', g.oneri, 'tur', g.tur) order by g.tarih desc)
      from pazar_gelenler g where g.company_id = p_company and g.tarih >= now() - interval '14 days'), '[]'::jsonb),
    'potansiyel', jsonb_build_object(
      'toplam', (select count(*) from pazar_firmalar where company_id = p_company and durum = 'potansiyel'),
      'asamalar', coalesce((select jsonb_object_agg(a, n) from (select crm_asama a, count(*) n from pazar_firmalar
                    where company_id = p_company and durum = 'potansiyel' group by crm_asama) x), '{}'::jsonb),
      'ulkeler', coalesce((select jsonb_agg(jsonb_build_object('ulke', u, 'adet', n) order by n desc, u) from (
                    select coalesce(ulke, 'Belirsiz') u, count(*) n from pazar_firmalar
                    where company_id = p_company and durum = 'potansiyel' group by 1 order by 2 desc, 1 limit 8) x), '[]'::jsonb),
      'temas7', (select count(distinct t.firma_id) from pazar_temaslar t join pazar_firmalar f on f.id = t.firma_id
                    where t.company_id = p_company and f.durum = 'potansiyel' and t.olusturma >= now() - interval '7 days'),
      'surecte', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'ad', f.ad, 'ulke', f.ulke, 'crm_asama', f.crm_asama,
                    'son_temas', f.son_temas, 'sonraki_adim', f.sonraki_adim) order by f.sonraki_adim nulls last, f.son_temas desc nulls last)
                    from pazar_firmalar f where f.company_id = p_company and f.durum = 'potansiyel'
                    and f.crm_asama <> 'yeni' and f.crm_asama <> 'ilgilenmiyor'), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.musteri_ozet_veri(uuid) from public, anon, authenticated;
grant execute on function public.musteri_ozet_veri(uuid) to service_role;

-- Zamanlama: 05:00 UTC = 08:00 TR, her gun ('musteri-ozet-rapor'). Anahtar repoya YAZILMAZ: komut mevcut
-- 'ic-gunluk-rapor-aksam' isinden turetilir (yalniz fonksiyon adi degisir).
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'ic-gunluk-rapor-aksam' limit 1;
  if v_komut is null then
    raise notice 'ic-gunluk-rapor-aksam bulunamadi; musteri-ozet-rapor zamanlanmadi.';
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'musteri-ozet-rapor';
  perform cron.schedule('musteri-ozet-rapor', '0 5 * * *', replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/musteri-ozet-rapor'''));
end $$;
