-- NAVLUN OTOMATIK DENETIM (17.11.2026, kullanici onayi).
--
-- Ders: "Teklif olabilecek mailler" yalniz fiyati HIC okunamamis mailleri gosteriyordu. Okunmus bir mailde fiyatin YANLIS
-- okunmasi ("Total Maliyet: N USD" kiyas satiri teklif sanildi) ya da EKSIK okunmasi (ayni mailde ikinci fiyat) kimse elle bakmadan
-- gorunmuyordu. Artik ayni liste mail metnini kayitla karsilastirir: okunmus mailin metninde 300-20.000 arasi bir tutar
-- geciyor ama o mailin kayitli teklifleri arasinda yoksa mail listeye "Mailde X USD var, kayitli degil" nedeniyle duser.
-- Kullanici "Teklif olarak kaydet" (elle teklif eklenir) ya da "Teklif degil" der; ikisi de denetimi kapatir (denetim_kapandi),
-- mailin okunmus teklifleri ve durumu korunur. Sayfa her acildiginda hesaplanir (ayrica zamanlanmis is gerekmez).
-- Elle eklenen tekliflerin sira numarasi 100'den baslar: yeniden okumada otomatik teklifler 1'den numaralanir, cakismaz.

alter table public.navlun_mesajlari add column if not exists denetim_kapandi boolean not null default false;

-- Metindeki USD / $ tutarlari (300-20.000; "USD 1.800", "1800 USD", "$4755", "1.800,00 USD").
-- "USD" ile tutar ayri satirda olabilir (tablodan kopya). Masraf / depozito / iptal / KDV / surcharge / maliyet gecen satir ve cumleler navlun degildir, sayilmaz.
create or replace function public.navlun_metin_tutarlari(p_metin text)
returns int[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct t order by t), '{}')
  from (
    select (regexp_replace(coalesce(x[1], x[2]), '[.,]', '', 'g'))::int t
    from regexp_split_to_table(regexp_replace(coalesce(p_metin, ''), '(usd|\$)\s*[\r\n]+\s*', '\1 ', 'gi'), E'[\n\r•]+|\\.\\s+') parca
    cross join lateral regexp_matches(parca,
      '(?:usd|\$)\s*:?\s*([0-9]{1,2}[.,][0-9]{3}|[0-9]{3,5})(?:[.,]00)?(?![.,]?[0-9])|(?<![0-9.,])([0-9]{1,2}[.,][0-9]{3}|[0-9]{3,5})(?:[.,]00)?\s*(?:usd|\$)', 'gi') x
    where parca !~* '(masraf|bedel|depozito|surcharge|kdv|iptal|erteleme|ceza|maliyet|spot\s*ekran|total\s*cost|demurrage|detention)'
  ) s
  where t between 300 and 20000;
$$;

create or replace function public.navlun_teklif_adaylari()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query
  with aday as (
    -- 1) Fiyati hic okunamamis acente cevaplari (16.11.2026)
    select m.id, m.konu, m.acente, m.gonderen, m.liman, m.tarih, coalesce(m.govde, m.ozet, '') metin,
           'Fiyat okunamadı.'::text neden
    from navlun_mesajlari m
    where m.company_id = auth_company_id() and m.durum = 'bilgi' and coalesce(m.olay_sayisi, 0) = 0
      and m.tarih > now() - interval '45 days' and m.mesaj_id not like 'alinti:%'
      and m.gonderen !~* '@(unex\.com\.tr|ihracatasistanim\.com)$'
      and (m.acente is null or m.govde ~* '(usd|\$|eur|€)\s*[0-9]{3,5}|[0-9]{3,5}\s*(usd|\$|eur|€)')
    union all
    -- 2) 17.11.2026 denetim: okunmus mailde kayitli olmayan tutar
    select m.id, m.konu, m.acente, m.gonderen, m.liman, m.tarih, coalesce(m.govde, '') || coalesce(E'\n--- EK ---\n' || m.ek_metin, ''),
           'Mailde ' || array_to_string(fark.eksik, ', ') || ' USD geçiyor; kayıtlı teklif: ' ||
             coalesce((select string_agg(distinct t.tutar::int::text, ', ') from navlun_teklifleri t
                       where t.company_id = m.company_id and t.mesaj_id = m.mesaj_id and t.tutar is not null), 'yok') || '.'
    from navlun_mesajlari m
    cross join lateral (
      select array(
        select u from unnest(navlun_metin_tutarlari(coalesce(m.govde, '') || ' ' || coalesce(m.ek_metin, ''))) u
        where not exists (select 1 from navlun_teklifleri t where t.company_id = m.company_id and t.mesaj_id = m.mesaj_id and t.tutar = u)
      ) eksik
    ) fark
    where m.company_id = auth_company_id() and m.durum in ('okundu', 'duzeltildi') and not m.denetim_kapandi
      and m.acente is not null and m.tarih > now() - interval '45 days' and m.mesaj_id not like 'alinti:%'
      and m.gonderen !~* '@(unex\.com\.tr|ihracatasistanim\.com)$'
      and cardinality(fark.eksik) > 0
  )
  select jsonb_build_object('id', a.id, 'konu', a.konu, 'acente', a.acente, 'alan', split_part(a.gonderen, '@', 2), 'liman', a.liman,
           'tarih', a.tarih, 'metin', left(a.metin, 1500), 'neden', a.neden)
  from aday a
  order by a.tarih desc
  limit 100;
end;
$$;
revoke all on function public.navlun_teklif_adaylari() from public, anon;
grant execute on function public.navlun_teklif_adaylari() to authenticated;

create or replace function public.navlun_hata_coz(p_id uuid, p_islem text, p_tutar numeric default null, p_ekipman text default '20DC',
  p_armator text default null, p_acente text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r navlun_mesajlari;
  v_kim text;
  v_acente text;
  v_alan text;
  v_denetim boolean;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  select * into r from navlun_mesajlari where id = p_id and company_id = auth_company_id() for update;
  if not found then raise exception 'Kayıt bulunamadı.'; end if;
  -- okunmus mail: yalniz denetim (durum korunur); okunamadi / bilgi: hata kuyrugu (eskisi gibi)
  v_denetim := r.durum in ('okundu', 'duzeltildi');
  if not v_denetim and r.durum not in ('okunamadi', 'bilgi') then raise exception 'Bu kayıt hata kuyruğunda değil.'; end if;
  if v_denetim and r.denetim_kapandi then raise exception 'Bu kayıt zaten kontrol edildi.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  if p_islem = 'yoksay' then
    if v_denetim then
      update navlun_mesajlari set denetim_kapandi = true, updated_at = now() where id = p_id;
    else
      update navlun_mesajlari set durum = 'yoksayildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_islem = 'duzelt' then
    if p_tutar is null or p_tutar <= 0 or p_tutar >= 100000 then raise exception 'Geçerli bir tutar girin.'; end if;
    if coalesce(p_ekipman, '20DC') not in ('20DC', '40DC', '40HC') then raise exception 'Ekipman geçersiz.'; end if;
    v_acente := coalesce(r.acente, nullif(left(btrim(p_acente), 60), ''));
    if v_acente is null then raise exception 'Acente adını girin.'; end if;
    if r.liman is null then raise exception 'Mailin konusunda liman yok; bu kayıt teklif olarak eklenemez.'; end if;
    if r.acente is null then
      v_alan := lower(split_part(r.gonderen, '@', 2));
      if v_alan ~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
        insert into navlun_acenteler (company_id, alan_adi, ad, aktif) values (r.company_id, v_alan, v_acente, true)
        on conflict (company_id, alan_adi) do nothing;
      end if;
      update navlun_mesajlari set acente = v_acente where id = p_id;
    end if;
    insert into navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar, ekipman, kaynak, tarih)
    values (r.company_id, r.mesaj_id,
            greatest(coalesce((select max(sira) from navlun_teklifleri where company_id = r.company_id and mesaj_id = r.mesaj_id), 0), 100) + 1,
            'teklif', r.liman, r.liman_anahtar, v_acente, nullif(left(btrim(p_armator), 40), ''), p_tutar,
            coalesce(p_ekipman, '20DC'), 'elle', r.tarih);
    if v_denetim then
      update navlun_mesajlari set denetim_kapandi = true, updated_at = now() where id = p_id;
    else
      update navlun_mesajlari set durum = 'duzeltildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    end if;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Bilinmeyen işlem.';
end;
$$;
revoke all on function public.navlun_hata_coz(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.navlun_hata_coz(uuid, text, numeric, text, text, text) to authenticated;
