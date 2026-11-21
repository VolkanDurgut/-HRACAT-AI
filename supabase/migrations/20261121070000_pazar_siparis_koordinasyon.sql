-- ============================================================================
-- PAZAR <-> SIPARIS LISTESI KOORDINASYONU + MUSTERI DUZELTMESI (21.11.2026)
-- ============================================================================
-- Kullanici: "Onayliyorum. PAZAR - SIPARIS LISTESI - YUKLEME LISTESI gibi seylerin koordineli olmasi
-- gerekiyor." (onaylanan: cift kartlarin birlestirilmesi + Siparis Listesi'nde sevkiyati olan ama
-- Musterilerimiz'de olmayan firmalarin eklenmesi)
-- 1) Cift kartlar birlestirilir (kaynaklarda yetkili / temas / gorev / gelen YOK; kontrol edilir):
--    BOULANGERIE FARID B.P. -> BOULANGERIE FARID; EASTBOURNE ... LTDST JAMES COURT (IHR-2026-0130 alici
--    adina adres yapismis) -> EASTBOURNE MARITIME TRADING LTD; Ali Houssein Dail (rehber listesi) ->
--    BOULANGERIE ALI HOUSSEIN DEIL.
-- 2) Siparis Listesi'ndeki farkli yazimlar mevcut kartlara ek anahtar olur (proforma kodlariyla dogrulandi):
--    RICHMOND COM (UNEXRC) -> RICHMAND COMPANY; EASTRBOURNE (UNEXEMT) -> EASTBOURNE; ALI HOUSSEIN DEIL /
--    BOULANGERIE ALI DEIL (UNEXBAH) -> BOULANGERIE ALI HOUSSEIN DEIL; B. CENTRE VILLE / BOULANGERIE CENTRE
--    VILLE (UNEXMIK, dosya alicisi MOHAMED ILMI KOUMANE) -> MOHAMED ILMI KOUMANE; BLACK STALLION GENERAL TR.
-- 3) Sistemden once sevk edilmis 17 firma musteri olur (ilk siparis tarihiyle; yetkili yok -> gunluk gorev
--    adayi OLMAZ, e-posta eklenince olur). BACKALDRIN potansiyel karti musteriye doner.
-- 4) KOORDINASYON: Siparis Listesi satiri rezervasyonlu / sevk edildi / BL eksik olunca (Excel aktarimi
--    dahil) firma Pazar'da otomatik musteri olur: once tam anahtar, yoksa TEK gevsek eslesen musteri
--    kartina ek anahtar, yoksa yeni kart (pazar_musteri_isaretle). Hata aktarimi DURDURMAZ (uyari).
--    (Yukleme plani adlari "GMB- BOCUUM" gibi serbest yazildigindan plandan kart ACILMAZ.)
-- Kart SILME yalniz birlestirmede (kaynak kart); baska veri silinmez.
-- ============================================================================

-- Ic birlestirme (oturumsuz, yalniz migration / servis). Kaynakta temas / gorev / gelen varsa REDDEDER
-- (bu tablolar firma silinince cascade ile giderdi).
create or replace function public.pazar_firma_birlestir_ic(p_kaynak uuid, p_hedef uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k public.pazar_firmalar;
  h public.pazar_firmalar;
begin
  if p_kaynak = p_hedef then raise exception 'Aynı kayıt seçildi.'; end if;
  select * into k from public.pazar_firmalar where id = p_kaynak for update;
  select * into h from public.pazar_firmalar where id = p_hedef for update;
  if k.id is null or h.id is null or k.company_id <> h.company_id then raise exception 'Firma bulunamadı.'; end if;
  if exists (select 1 from public.pazar_temaslar where firma_id = k.id)
     or exists (select 1 from public.pazar_gorevler where firma_id = k.id)
     or exists (select 1 from public.pazar_gelenler where firma_id = k.id) then
    raise exception 'Kaynak kartta görüşme geçmişi var (%); elle birleştirin.', k.ad;
  end if;
  update public.pazar_kisiler s set firma_id = h.id, updated_at = now()
   where s.firma_id = k.id
     and (s.eposta is null or not exists (select 1 from public.pazar_kisiler t where t.firma_id = h.id and lower(t.eposta) = lower(s.eposta)));
  update public.pazar_fuar_katilimlari s set firma_id = h.id
   where s.firma_id = k.id
     and not exists (select 1 from public.pazar_fuar_katilimlari t where t.firma_id = h.id and t.etiket = s.etiket);
  update public.pazar_firmalar
     set ek_anahtarlar = (select coalesce(array_agg(distinct a), '{}') from unnest(h.ek_anahtarlar || k.ek_anahtarlar || array[k.anahtar]) as u(a) where a <> h.anahtar),
         ulke = coalesce(h.ulke, k.ulke),
         ulke_kaynagi = case when h.ulke is null then k.ulke_kaynagi else h.ulke_kaynagi end,
         ulke_ham = coalesce(h.ulke_ham, k.ulke_ham),
         durum = case when h.durum = 'musteri' or k.durum = 'musteri' then 'musteri' else 'potansiyel' end,
         alici_adi = coalesce(h.alici_adi, k.alici_adi),
         musteri_olma_tarihi = case when h.musteri_olma_tarihi is null then k.musteri_olma_tarihi
                                    when k.musteri_olma_tarihi is null then h.musteri_olma_tarihi
                                    else least(h.musteri_olma_tarihi, k.musteri_olma_tarihi) end,
         notlar = nullif(concat_ws(E'\n', h.notlar, k.notlar), ''),
         updated_at = now()
   where id = h.id;
  delete from public.pazar_firmalar where id = k.id;
end;
$function$;

-- Ek anahtar ekle (ad ile bulunan karta; yoksa hata)
create or replace function public.pazar_ek_anahtar_ekle_ic(p_company uuid, p_kart_anahtar text, p_yeni_adlar text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.pazar_firmalar where company_id = p_company and anahtar = p_kart_anahtar;
  if v_id is null then raise exception 'Kart bulunamadı: %', p_kart_anahtar; end if;
  update public.pazar_firmalar f
     set ek_anahtarlar = (select coalesce(array_agg(distinct a), '{}') from unnest(f.ek_anahtarlar || array(select public.pazar_anahtar(x) from unnest(p_yeni_adlar) x)) u(a)
                           where a is not null and a <> '' and a <> f.anahtar),
         updated_at = now()
   where id = v_id;
end;
$function$;

-- Siparis Listesi'nden musteri isaretleme (gevsek ad eslesmesi)
create or replace function public.pazar_siparis_musteri_isaretle(p_company uuid, p_firma text, p_tarih timestamptz default now())
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_k text := public.pazar_anahtar(trim(coalesce(p_firma, '')));
  v_ids uuid[];
begin
  if p_company is null or v_k is null or v_k = '' then return; end if;
  if public.pazar_firma_bul(p_company, v_k) is null then
    select array_agg(f.id) into v_ids from public.pazar_firmalar f
     where f.company_id = p_company and f.durum = 'musteri'
       and public.pazar_anahtar_eslesir(array_append(f.ek_anahtarlar, f.anahtar), array[v_k]);
    if cardinality(v_ids) = 1 then
      update public.pazar_firmalar set ek_anahtarlar = array_append(ek_anahtarlar, v_k), updated_at = now()
       where id = v_ids[1] and not (v_k = any(ek_anahtarlar));
    end if;
  end if;
  perform public.pazar_musteri_isaretle(p_company, p_firma, coalesce(p_tarih, now()));
end;
$function$;

create or replace function public.pazar_siparis_defteri_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.pazar_siparis_musteri_isaretle(new.company_id, new.firma, coalesce(new.proforma_tarihi::timestamptz, now()));
  exception when others then
    raise warning 'pazar_siparis_defteri_tetik: %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.pazar_firma_birlestir_ic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pazar_ek_anahtar_ekle_ic(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.pazar_siparis_musteri_isaretle(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pazar_siparis_defteri_tetik() from public, anon, authenticated;
grant execute on function public.pazar_firma_birlestir_ic(uuid, uuid) to service_role;
grant execute on function public.pazar_ek_anahtar_ekle_ic(uuid, text, text[]) to service_role;
grant execute on function public.pazar_siparis_musteri_isaretle(uuid, text, timestamptz) to service_role;

drop trigger if exists trg_pazar_siparis_defteri on public.siparis_defteri;
create trigger trg_pazar_siparis_defteri
  after insert or update of durum, firma on public.siparis_defteri
  for each row when (new.durum in ('rezervasyonlu', 'sevk_edildi', 'bl_eksik'))
  execute function public.pazar_siparis_defteri_tetik();

-- ---------------------------------------------------------------------------
-- Tek seferlik veri duzeltmesi (21.11.2026, kullanici onayi)
-- ---------------------------------------------------------------------------
do $veri$
declare
  c uuid;
  r record;
begin
  for c in select distinct company_id from public.pazar_firmalar
            where anahtar in ('BOULANGERIEFARIDBP', 'EASTBOURNEMARITIMELTDSTJAMESCOURT') loop
    -- 1) Birlestirme
    perform public.pazar_firma_birlestir_ic(
      (select id from public.pazar_firmalar where company_id = c and anahtar = 'BOULANGERIEFARIDBP'),
      (select id from public.pazar_firmalar where company_id = c and anahtar = 'BOULANGERIEFARID'));
    perform public.pazar_firma_birlestir_ic(
      (select id from public.pazar_firmalar where company_id = c and anahtar = 'EASTBOURNEMARITIMELTDSTJAMESCOURT'),
      (select id from public.pazar_firmalar where company_id = c and anahtar = 'EASTBOURNEMARITIME'));
    if exists (select 1 from public.pazar_firmalar where company_id = c and anahtar = 'ALIHOUSSEINDAIL') then
      perform public.pazar_firma_birlestir_ic(
        (select id from public.pazar_firmalar where company_id = c and anahtar = 'ALIHOUSSEINDAIL'),
        (select id from public.pazar_firmalar where company_id = c and anahtar = 'BOULANGERIEALIHOUSSEINDEIL'));
    end if;

    -- 2) Farkli yazimlar
    perform public.pazar_ek_anahtar_ekle_ic(c, 'RICHMAND', array['RICHMOND COM']);
    perform public.pazar_ek_anahtar_ekle_ic(c, 'EASTBOURNEMARITIME', array['EASTRBOURNE', 'EASTBOURNE']);
    perform public.pazar_ek_anahtar_ekle_ic(c, 'BOULANGERIEALIHOUSSEINDEIL', array['ALI HOUSSEIN DEIL', 'BOULANGERIE ALI DEIL']);
    perform public.pazar_ek_anahtar_ekle_ic(c, 'MOHAMEDILMIKOUMANE', array['B. CENTRE VILLE', 'BOULANGERIE CENTRE VILLE']);
    perform public.pazar_ek_anahtar_ekle_ic(c, 'BLACKSTALLION', array['BLACK STALLION GENERAL TR.']);

    -- 3) Sistemden once sevk edilmis musteriler (ilk siparis tarihi)
    for r in select * from (values
        ('LULY GRACE SARL', '2026-04-14'), ('UNIVERSAL FOOD CORPORATION', '2026-07-10'), ('RAINTREE TRADE PVT LTD', '2026-02-04'),
        ('ATLANPACIFIC', '2026-03-30'), ('MAGASIN ALI YACHROUTU', '2026-04-01'), ('SAMREX GLOBAL TRADING FZCO.', '2026-03-18'),
        ('Caraway Pte Ltd', '2026-05-09'), ('Shree Agro', '2026-06-29'), ('BALAD IMPORT EXPORT', '2026-03-16'), ('DANAH ENTR', '2026-06-10'),
        ('BAKEBS SOLUTIONS COMPANY LIMITED', '2026-11-06'), ('STE AFRICAN BUSINESS ET CONSULTING', '2026-06-03'), ('MAGASIN KAROI', '2026-04-22'),
        ('RAFIKI INTERNATIONAL TRADING', '2026-07-15'), ('BACKALDRIN', '2026-05-24'), ('REBMA IMPEX GHANA LTD', '2026-04-25'),
        ('Omar International Company', '2026-07-30')) v(ad, tarih) loop
      perform public.pazar_musteri_isaretle(c, r.ad, r.tarih::timestamptz);
    end loop;
    perform public.pazar_ek_anahtar_ekle_ic(c, 'RAINTREETRADE', array['RAINTREE']);
    perform public.pazar_ek_anahtar_ekle_ic(c, 'SAMREXGLOBAL', array['SAMREX (1 AFRICA)']);

    -- 4) Geri kalan Siparis Listesi satirlari (yeni kart acmamasi beklenir; acarsa da kural ayni)
    for r in select s.firma, min(s.proforma_tarihi) t from public.siparis_defteri s
              where s.company_id = c and s.durum in ('rezervasyonlu', 'sevk_edildi', 'bl_eksik') group by s.firma order by 2 loop
      perform public.pazar_siparis_musteri_isaretle(c, r.firma, coalesce(r.t::timestamptz, now()));
    end loop;
  end loop;
end $veri$;
