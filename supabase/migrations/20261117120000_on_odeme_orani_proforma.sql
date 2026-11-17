-- ÖN ÖDEME YÜZDESİ PROFORMADAN (17.11.2026, kullanıcı isteği: "Onay geldi" penceresindeki
-- "Ön ödeme yüzdesi (%)" proformadan otomatik gelmeli).
--
-- 1) on_odeme_orani_oku: "%30 PAYMENT ADVANCE PAYMENT" yazımı da okunur (yüzde ile ADVANCE arasında "PAYMENT").
--    lib/on-odeme.ts onOdemeOrani ile AYNI kural.
-- 2) on_odeme_orani_proforma: yüzde yoksa sabit avans tutarından oran ("20.000 USD ADVANCE" / proforma toplamı).
-- 3) on_odeme_dagitim: oran sırası elle -> dosyanın ödeme şartı -> PROFORMA (yeni, oran_kaynak = 'proforma').
-- Mevcut veriye etkisi: dağıtım yalnız sipariş takibindeki proformalarda yapılır; uygulama anında bu durumda kayıt yoktu.

create or replace function public.on_odeme_orani_oku(p text)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case when x.v > 0 and x.v <= 100 then x.v end
  from (
    select replace(coalesce(
      (regexp_match(upper(coalesce(p, '')), '%\s*([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*(?:PAYMENT\s+)?(?:ADVANCE|PRE-?PAYMENT|DEPOSIT|PREPAID|DOWN\s*PAYMENT)'))[1],
      (regexp_match(upper(coalesce(p, '')), '([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*%\s*(?:PAYMENT\s+)?(?:ADVANCE|PRE-?PAYMENT|DEPOSIT|PREPAID|DOWN\s*PAYMENT)'))[1]
    ), ',', '.')::numeric as v
  ) x
$$;

-- "%30 ADVANCE ..." -> 30; "20.000 USD ADVANCE PAYMENT" + toplam 130.000 -> 15.38; "31.125 USD ADVANCE" + 155.625 -> 20.
create or replace function public.on_odeme_orani_proforma(p text, p_toplam numeric)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    public.on_odeme_orani_oku(p),
    (select case when p_toplam > 0 and t.v > 0 and t.v < p_toplam then round(t.v / p_toplam * 100, 2) end
     from (
       select (regexp_replace(m[1], '[.,]', '', 'g') || coalesce('.' || m[2], ''))::numeric as v
       from (select regexp_match(upper(coalesce(p, '')),
         '([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)(?:[.,]([0-9]{1,2}))?\s*(?:USD|EUR|\$|€)\s+(?:[A-Z]+\s+){0,2}?(?:DEPOSIT|ADVANCE)') as m) r
       where m is not null
     ) t)
  )
$$;

grant execute on function public.on_odeme_orani_proforma(text, numeric) to authenticated, service_role;

create or replace function public.on_odeme_dagitim(p_sirket uuid, p_anahtar text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  o public.siparis_on_odemeler%rowtype;
  d record;
  v_para text;
  v_havuz numeric;
  v_oran numeric;
  v_oran_kaynak text;
  v_kalan numeric;
  v_pay numeric;
  v_mevcut numeric;
  v_kilit text;
  v_satirlar jsonb := '[]'::jsonb;
  v_takip boolean := false;
  v_dosya_sayisi int := 0;
  v_para_sayisi int := 0;
  v_durum text := 'tamam';
begin
  if p_sirket is null or p_anahtar is null then return jsonb_build_object('durum', 'havuz_yok'); end if;
  select * into o from public.siparis_on_odemeler where company_id = p_sirket and proforma_anahtar = p_anahtar;

  select count(*), bool_or(d2.ana_siparis_id is not null), min(coalesce(d2.para_birimi, 'USD')), count(distinct coalesce(d2.para_birimi, 'USD'))
    into v_dosya_sayisi, v_takip, v_para, v_para_sayisi
  from public.ihracat_dosyalari d2
  left join public.ana_siparisler a on a.id = d2.ana_siparis_id
  where d2.company_id = p_sirket
    and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar);

  if not coalesce(v_takip, false) then v_durum := 'takip_degil';
  elsif o.id is null or not coalesce(o.alindi, false) or coalesce(o.tutar, 0) <= 0 then v_durum := 'havuz_yok';
  elsif v_para_sayisi > 1 then v_durum := 'para_karisik';
  end if;

  if v_durum = 'tamam' then
    v_havuz := case when coalesce(o.para_birimi, 'USD') = v_para then o.tutar else o.karsilik_tutar end;
    if v_havuz is null then v_durum := 'kur_yok'; end if;
  end if;

  v_oran := o.oran;
  v_oran_kaynak := case when o.oran is not null then 'elle' end;
  if v_oran is null then
    select public.on_odeme_orani_oku(d2.odeme_sekli) into v_oran
    from public.ihracat_dosyalari d2
    left join public.ana_siparisler a on a.id = d2.ana_siparis_id
    where d2.company_id = p_sirket
      and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar)
      and public.on_odeme_orani_oku(d2.odeme_sekli) is not null
    order by d2.olusturma_tarihi, d2.dosya_no
    limit 1;
    if v_oran is not null then v_oran_kaynak := 'odeme_sekli'; end if;
  end if;
  -- 17.11.2026: dosya henüz yoksa (ya da ödeme şartı okunamadıysa) yüzde proformadan
  if v_oran is null then
    select public.on_odeme_orani_proforma(p.taslak ->> 'odeme', p.toplam) into v_oran
    from public.proformalar p
    where p.company_id = p_sirket
      and public.siparis_anahtar(p.proforma_no) = p_anahtar
      and public.on_odeme_orani_proforma(p.taslak ->> 'odeme', p.toplam) is not null
    order by p.updated_at desc nulls last
    limit 1;
    if v_oran is not null then v_oran_kaynak := 'proforma'; end if;
  end if;
  if v_durum = 'tamam' and v_oran is null then v_durum := 'oran_yok'; end if;

  v_kalan := coalesce(v_havuz, 0);
  for d in
    select d2.id, d2.dosya_no, d2.durum, d2.toplam_tutar, d2.fatura_talimati_gonderildi, d2.ham_veri
    from public.ihracat_dosyalari d2
    left join public.ana_siparisler a on a.id = d2.ana_siparis_id
    where d2.company_id = p_sirket
      and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar)
    order by d2.olusturma_tarihi, d2.dosya_no
  loop
    v_mevcut := case when jsonb_typeof(d.ham_veri -> 'avans_tutari') = 'number' then (d.ham_veri ->> 'avans_tutari')::numeric end;
    v_kilit := case
      when coalesce(d.ham_veri ->> 'avans_elle', 'false') = 'true' then 'elle'
      when coalesce(d.fatura_talimati_gonderildi, false) then 'fatura_talimati'
      when d.durum ilike 'kapal%' then 'kapali'
    end;
    if v_durum <> 'tamam' then
      v_pay := null;
    elsif v_kilit is not null then
      v_pay := coalesce(v_mevcut, 0);
      v_kalan := v_kalan - v_pay;
    else
      v_pay := least(round(coalesce(d.toplam_tutar, 0) * v_oran / 100, 2), greatest(round(v_kalan, 2), 0));
      v_kalan := v_kalan - v_pay;
    end if;
    v_satirlar := v_satirlar || jsonb_build_object(
      'id', d.id, 'dosya_no', d.dosya_no, 'durum', d.durum, 'tutar', d.toplam_tutar,
      'mevcut', v_mevcut, 'pay', v_pay, 'kilit', v_kilit, 'dagitimli', coalesce(d.ham_veri ? 'avans_dagitim', false));
  end loop;

  return jsonb_build_object(
    'durum', v_durum, 'anahtar', p_anahtar, 'para', v_para,
    'havuz', v_havuz, 'havuz_tutar', o.tutar, 'havuz_para', o.para_birimi, 'karsilik', o.karsilik_tutar,
    'oran', v_oran, 'oran_kaynak', v_oran_kaynak,
    'dagitilan', case when v_durum = 'tamam' then round(v_havuz - v_kalan, 2) end,
    'kalan', case when v_durum = 'tamam' then round(v_kalan, 2) end,
    'dosyalar', v_satirlar);
end;
$$;

revoke all on function public.on_odeme_dagitim(uuid, text) from public, anon, authenticated;
grant execute on function public.on_odeme_dagitim(uuid, text) to service_role;
