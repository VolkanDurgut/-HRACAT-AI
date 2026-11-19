-- 19.11.2026 NAVLUN DENETIMI
-- 1) Olaydaki para_birimi (EUR tarife satirlari: MSC listesi LA GUAIRA / PUERTO CABELLO) yazilir; yoksa USD.
-- 2) Ayni mesajda ayni liman + ekipman icin ELLE girilmis teklif varsa otomatik satir yazilmaz (elle karar esastir, cift sayim yok).
-- 3) Elle duzeltilmis mailin teklifinde armator BOSSA ek teklif formunun yorumundaki tek armator yazilir (ek_bilgi.ek_armator).
create or replace function public.navlun_kaydet(p_company uuid, p_mesajlar jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m jsonb;
  o jsonb;
  v_sira integer;
  v_mesaj text;
  v_mevcut text;
  v_yeni integer := 0;
  v_guncel integer := 0;
  v_atlanan integer := 0;
  v_olay integer := 0;
  v_tt text;
begin
  if p_company is null or jsonb_typeof(p_mesajlar) <> 'array' then
    raise exception 'gecersiz girdi';
  end if;
  for m in select * from jsonb_array_elements(p_mesajlar) loop
    v_mesaj := left(btrim(coalesce(m->>'mesaj_id', '')), 300);
    if char_length(v_mesaj) < 3 or nullif(m->>'tarih', '') is null then
      v_atlanan := v_atlanan + 1;
      continue;
    end if;
    select durum into v_mevcut from navlun_mesajlari where company_id = p_company and mesaj_id = v_mesaj;
    if v_mevcut in ('duzeltildi', 'yoksayildi') then
      -- Elle cozulmus: karar korunur. Yalniz ham metin saklanir ve elle teklifin BOS free time / transit / armator'u tamamlanir.
      update navlun_mesajlari set
        govde = coalesce(nullif(left(m->>'govde', 8000), ''), govde),
        ek_metin = coalesce(nullif(left(m->>'ek_metin', 12000), ''), ek_metin),
        ek_kaynak = coalesce(nullif(m->>'ek_kaynak', ''), ek_kaynak)
      where company_id = p_company and mesaj_id = v_mesaj;
      v_tt := nullif(m->'ek_bilgi'->>'transit_gun', '');
      if v_tt is not null and v_tt !~ '^\d{1,3}(-\d{1,3})?$' then v_tt := null; end if;
      update navlun_teklifleri set
        free_time_gun = coalesce(free_time_gun, case when (m->'ek_bilgi'->>'free_time_gun') ~ '^\d{1,2}$' then (m->'ek_bilgi'->>'free_time_gun')::integer end),
        transit_gun = coalesce(transit_gun, v_tt),
        armator = coalesce(armator, nullif(left(m->'ek_bilgi'->>'ek_armator', 40), ''))
      where company_id = p_company and mesaj_id = v_mesaj and kaynak = 'elle' and tur in ('teklif', 'karsi_teklif');
      v_atlanan := v_atlanan + 1;
      continue;
    end if;
    insert into navlun_mesajlari (company_id, mesaj_id, konu, gonderen, acente, liman, liman_anahtar, tarih, kaynak, durum, olay_sayisi, ozet,
                                  govde, ek_metin, ek_kaynak)
    values (p_company, v_mesaj, left(m->>'konu', 300), left(m->>'gonderen', 200), nullif(left(m->>'acente', 60), ''),
            nullif(left(m->>'liman', 80), ''), nullif(left(m->>'liman_anahtar', 80), ''), (m->>'tarih')::timestamptz,
            coalesce(nullif(m->>'kaynak', ''), 'metin'), m->>'durum',
            coalesce(jsonb_array_length(m->'olaylar'), 0), left(m->>'ozet', 2000),
            nullif(left(m->>'govde', 8000), ''), nullif(left(m->>'ek_metin', 12000), ''),
            case when m->>'ek_kaynak' in ('pdf', 'gorsel') then m->>'ek_kaynak' end)
    on conflict (company_id, mesaj_id) do update set
      konu = excluded.konu, gonderen = excluded.gonderen, acente = excluded.acente, liman = excluded.liman, liman_anahtar = excluded.liman_anahtar,
      tarih = excluded.tarih, kaynak = excluded.kaynak, durum = excluded.durum, olay_sayisi = excluded.olay_sayisi,
      ozet = excluded.ozet,
      govde = coalesce(excluded.govde, navlun_mesajlari.govde),
      ek_metin = coalesce(excluded.ek_metin, navlun_mesajlari.ek_metin),
      ek_kaynak = coalesce(excluded.ek_kaynak, navlun_mesajlari.ek_kaynak),
      updated_at = now();
    if v_mevcut is null then v_yeni := v_yeni + 1; else v_guncel := v_guncel + 1; end if;

    delete from navlun_teklifleri where company_id = p_company and mesaj_id = v_mesaj and kaynak <> 'elle';
    v_sira := 0;
    for o in select * from jsonb_array_elements(coalesce(m->'olaylar', '[]'::jsonb)) loop
      v_sira := v_sira + 1;
      if o->>'tur' in ('teklif', 'karsi_teklif') and exists (
        select 1 from navlun_teklifleri e
        where e.company_id = p_company and e.mesaj_id = v_mesaj and e.kaynak = 'elle' and e.tur in ('teklif', 'karsi_teklif')
          and e.liman_anahtar is not distinct from nullif(left(o->>'liman_anahtar', 80), '')
          and coalesce(e.ekipman, '20DC') = coalesce(nullif(o->>'ekipman', ''), '20DC')) then
        continue;
      end if;
      v_tt := nullif(o->>'transit_gun', '');
      if v_tt is not null and v_tt !~ '^\d{1,3}(-\d{1,3})?$' then v_tt := null; end if;
      insert into navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar,
        ekipman, free_time_gun, transit_gun, gecerlilik, lokal_dahil, pol, kaynak, tarih, para_birimi)
      values (p_company, v_mesaj, v_sira, o->>'tur', nullif(left(o->>'liman', 80), ''), nullif(left(o->>'liman_anahtar', 80), ''),
        nullif(left(m->>'acente', 60), ''), nullif(left(o->>'armator', 40), ''), nullif(o->>'tutar', '')::numeric,
        nullif(o->>'ekipman', ''), nullif(o->>'free_time_gun', '')::integer, v_tt, nullif(left(o->>'gecerlilik', 20), ''),
        nullif(o->>'lokal_dahil', '')::boolean, nullif(left(o->>'pol', 40), ''),
        coalesce(nullif(m->>'kaynak', ''), 'metin'), (m->>'tarih')::timestamptz,
        case when o->>'para_birimi' = 'EUR' then 'EUR' else 'USD' end);
      v_olay := v_olay + 1;
    end loop;
  end loop;
  return jsonb_build_object('yeni', v_yeni, 'guncellenen', v_guncel, 'atlanan', v_atlanan, 'olay', v_olay);
end;
$function$;
