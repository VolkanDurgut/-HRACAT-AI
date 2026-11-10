-- PAZAR 3.5b - gelen cevap onerisi duzeltmesi (10.11.2026)
--
-- Canli ilk calisma: musterinin "confirmed PI ... Our order refs" maili (yeni siparis) "teklif" onerildi.
-- Oneri kurali ayri fonksiyonda (pazar_gelen_oneri); siparis ifadeleri genisletildi: confirmed / signed PI,
-- proforma, contract, "order ref". Konu da (kisa) degerlendirilir. Mevcut kayitlarin onerisi yeni kuralla
-- yeniden hesaplanir (yalniz oneri alani; surec / asama degismez).

create or replace function public.pazar_gelen_oneri(p_konu text, p_ozet text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_ozet, '') ~* '(not interested|no requirement|no need|don.?t need|do not need|not in need|remove (me|us)|unsubscribe|stop sending|pas int[ée]ress|no,? thanks?\M|not (buying|importing))' then 'ilgilenmiyor'
    when (coalesce(p_konu, '') || ' ' || coalesce(p_ozet, '')) ~* '(purchase order|\mp\.?o\.? ?(no|number|#)|confirm(ed)? (the |our )?order|(would like|want|wish) to (place an? )?order|place (an|the|our) order|order confirmation|bon de commande|(confirmed|signed|approved) (the )?(pi\M|p\.i\.|proforma|contract)|\morder refs?\M)' then 'siparis'
    when coalesce(p_ozet, '') ~* '(price|offer|quotation|\mquote|proforma|cotation|\mprix|best rate|\mcfr\M|\mcif\M)' then 'teklif'
    else null end;
$$;

create or replace function public.pazar_gelen_kaydet(p_mesajlar jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
  v_eposta text;
  v_alan text;
  v_mesaj_id text;
  v_tarih timestamptz;
  v_konu text;
  v_ozet text;
  v_firma uuid;
  v_tur text;
  v_oneri text;
  f public.pazar_firmalar;
  v_kaydedilen integer := 0;
  v_cevap integer := 0;
  v_eslesmeyen integer := 0;
  v_atlanan integer := 0;
begin
  if jsonb_typeof(p_mesajlar) <> 'array' then raise exception 'Gecersiz veri.'; end if;
  for m in select * from jsonb_array_elements(p_mesajlar) limit 200 loop
    v_eposta := lower(trim(coalesce(m ->> 'gonderen', '')));
    v_mesaj_id := left(trim(coalesce(m ->> 'mesaj_id', '')), 300);
    v_alan := split_part(v_eposta, '@', 2);
    if v_mesaj_id = '' or v_eposta !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or v_alan in ('unex.com.tr', 'ihracatasistanim.com')
       or v_eposta ~ '^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)' then
      v_atlanan := v_atlanan + 1; continue;
    end if;
    if exists (select 1 from public.pazar_gelenler where mesaj_id = v_mesaj_id) then
      v_atlanan := v_atlanan + 1; continue;
    end if;
    begin
      v_tarih := coalesce((m ->> 'tarih')::timestamptz, now());
    exception when others then v_tarih := now();
    end;
    v_konu := left(coalesce(m ->> 'konu', ''), 300);
    v_ozet := left(coalesce(m ->> 'ozet', ''), 2000);

    -- 1) yetkili e-postasi (birden cok firmada varsa son temasi olan)
    select k.firma_id into v_firma
      from public.pazar_kisiler k join public.pazar_firmalar x on x.id = k.firma_id
     where lower(k.eposta) = v_eposta
     order by x.son_temas desc nulls last, x.durum = 'musteri' desc
     limit 1;
    -- 2) ozel alan adi (ucretsiz posta servisleri haric), tek firma eslesirse
    if v_firma is null and v_alan !~ '^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|aol|icloud|me|mail|gmx|yandex|protonmail|zoho|rocketmail)\.' then
      select min(k.firma_id::text)::uuid into v_firma
        from public.pazar_kisiler k
       where lower(k.eposta) like '%@' || v_alan
      having count(distinct k.firma_id) = 1;
    end if;
    if v_firma is null then v_eslesmeyen := v_eslesmeyen + 1; continue; end if;
    select * into f from public.pazar_firmalar where id = v_firma for update;

    v_tur := case when v_konu ~* '(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|abwesen|absence|vacation|r[ée]ponse automatique|risposta automatica|respuesta autom|undeliver|delivery status|delivery failure|mail delivery|returned mail|otomatik yan[ıi]t|ofis d[ıi][şs][ıi]|izindeyim)'
                       or v_ozet ~* '(i am (currently )?out of (the )?office|i will be out of|this is an automatic|automatic reply|i am on (annual )?leave)'
                  then 'otomatik' else 'cevap' end;
    v_oneri := null;
    if v_tur = 'cevap' then
      v_oneri := public.pazar_gelen_oneri(v_konu, v_ozet);
    end if;

    insert into public.pazar_gelenler (company_id, firma_id, mesaj_id, gonderen, gonderen_ad, konu, ozet, tarih, tur, oneri)
    values (f.company_id, f.id, v_mesaj_id, v_eposta, left(m ->> 'gonderen_ad', 200), v_konu, v_ozet, v_tarih, v_tur, v_oneri)
    on conflict (mesaj_id) do nothing;
    v_kaydedilen := v_kaydedilen + 1;

    if v_tur = 'cevap' then
      v_cevap := v_cevap + 1;
      if f.crm_asama in ('sorgulandi', 'hatirlatma1', 'hatirlatma2', 'sessiz') then
        update public.pazar_firmalar
           set crm_asama = 'cevap', sonraki_adim = null,
               bekleme_bitis = (v_tarih at time zone 'Europe/Istanbul')::date + 30,
               son_temas = greatest(coalesce(son_temas, v_tarih), v_tarih), updated_at = now()
         where id = f.id;
        insert into public.pazar_temaslar (company_id, firma_id, adim, kanal, sonuc, alici, konu, isleyen)
        values (f.company_id, f.id, 'sonuc', 'eposta', 'cevap', v_eposta, v_konu, 'arşiv (otomatik)');
      else
        -- Surec disi yazisma: 14 gun sorgulama secilmez
        update public.pazar_firmalar
           set bekleme_bitis = greatest(coalesce(bekleme_bitis, (v_tarih at time zone 'Europe/Istanbul')::date), (v_tarih at time zone 'Europe/Istanbul')::date + 14),
               updated_at = now()
         where id = f.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('kaydedilen', v_kaydedilen, 'cevap', v_cevap, 'eslesmeyen', v_eslesmeyen, 'atlanan', v_atlanan);
end;
$$;

update public.pazar_gelenler set oneri = public.pazar_gelen_oneri(konu, ozet)
 where tur = 'cevap' and oneri is distinct from public.pazar_gelen_oneri(konu, ozet);

revoke all on function public.pazar_gelen_oneri(text, text) from public, anon, authenticated;
revoke all on function public.pazar_gelen_kaydet(jsonb) from public, anon, authenticated;
