-- 19.11.2026: "Teklif olabilecek mailler" listesinden, ayni gondericinin ayni liman icin 60 dakika icinde "Düzeltme ..." diye
-- baslayan mailiyle gecersiz kildigi mail cikarilir (acente: "1475 usd ..." -> 1 dk sonra "Düzeltme 1450 usd"; 1450 kayitli).
create or replace function public.navlun_teklif_adaylari()
 returns setof jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query
  with aday as (
    select m.id, m.konu, m.acente, m.gonderen, m.liman, m.liman_anahtar, m.tarih, m.company_id, coalesce(m.govde, m.ozet, '') metin,
           'Fiyat okunamadı.'::text neden
    from navlun_mesajlari m
    where m.company_id = auth_company_id() and m.durum = 'bilgi' and coalesce(m.olay_sayisi, 0) = 0
      and m.tarih > now() - interval '45 days' and m.mesaj_id not like 'alinti:%'
      and m.gonderen !~* '@(unex\.com\.tr|ihracatasistanim\.com)$'
      and (m.acente is null or m.govde ~* '(usd|\$|eur|€)\s*[0-9]{3,5}|[0-9]{3,5}\s*(usd|\$|eur|€)'
           or cardinality(navlun_metin_tutarlari(coalesce(m.govde, '') || ' ' || coalesce(m.ek_metin, ''))) > 0)
    union all
    select m.id, m.konu, m.acente, m.gonderen, m.liman, m.liman_anahtar, m.tarih, m.company_id, coalesce(m.govde, '') || coalesce(E'\n--- EK ---\n' || m.ek_metin, ''),
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
  where not exists (
    select 1 from navlun_mesajlari d
    where d.company_id = a.company_id and lower(d.gonderen) = lower(a.gonderen)
      and d.liman_anahtar is not distinct from a.liman_anahtar
      and d.tarih > a.tarih and d.tarih <= a.tarih + interval '60 minutes'
      and coalesce(d.govde, '') ~* '^\s*(düzeltme|duzeltme|correction|revize)\M')
  order by a.tarih desc
  limit 100;
end;
$function$;
