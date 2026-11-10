-- PAZAR CRM - Dalga 3.5: gelen cevap tespiti + gorev sayfasi akisi (10.11.2026)
--
-- Kullanici: "Mail geldiyse tespit edilip sistemde otomatik 'yanit geldi', 'ilgilenmiyor' gibi takipler yapilabilmeli."
-- Akis: arsiv Gmail (unex.execution.arsiv@) uzerinde Google Apps Script 10 dk'da bir yeni mailleri edge
-- "pazar-gorev" {islem: "gelen"} ucuna gonderir (gizli anahtar PAZAR_GELEN_ANAHTAR). Bu fonksiyon:
--  - Kendi alan adlarimiz / sistem adresleri atlanir; ayni mail (Message-ID) bir kez islenir.
--  - Gonderen, firma yetkilisinin e-postasiyla (yoksa ozel alan adiyla, tek firma eslesirse) eslesir.
--    Eslesmeyen mail KAYDEDILMEZ (yalniz bilinen firmalar).
--  - Otomatik yanit (out of office / izin / teslim edilemedi) surec durdurmaz; tur = 'otomatik'.
--  - Gercek cevap: firma surecteyse (sorgulandi / hatirlatma 1-2 / sessiz) -> asama 'cevap', hatirlatma durur,
--    30 gun bekler, temas kaydi (isleyen "arsiv (otomatik)"). Surec disindaysa 14 gun sorgulama secilmez (yazisiyor).
--  - Oneri (yalniz oneri, otomatik uygulanmaz): ilgilenmiyor / siparis / teklif (anahtar kelime; yapay zeka yok).
-- Gorev sayfasi: 'temas_var' (bu gorevde mail / WhatsApp / sonuc bildirildi mi) + son 30 gunun gelen cevaplari.

create table if not exists public.pazar_gelenler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  firma_id uuid not null references public.pazar_firmalar(id) on delete cascade,
  mesaj_id text not null unique,
  gonderen text not null,
  gonderen_ad text,
  konu text,
  ozet text,
  tarih timestamptz not null,
  tur text not null check (tur in ('cevap', 'otomatik')),
  oneri text check (oneri in ('teklif', 'siparis', 'ilgilenmiyor')),
  olusturma timestamptz not null default now()
);
create index if not exists pazar_gelenler_firma_idx on public.pazar_gelenler (firma_id, tarih desc);
comment on table public.pazar_gelenler is 'PAZAR: arsivden tespit edilen musteri cevaplari (Apps Script -> edge pazar-gorev). 10.11.2026';
alter table public.pazar_gelenler enable row level security;
revoke all on public.pazar_gelenler from anon, authenticated;
grant select on public.pazar_gelenler to authenticated;
drop policy if exists pazar_gelenler_select on public.pazar_gelenler;
create policy pazar_gelenler_select on public.pazar_gelenler for select to authenticated
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('pazar'));

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
      v_oneri := case
        when v_ozet ~* '(not interested|no requirement|no need|don.?t need|do not need|not in need|remove (me|us)|unsubscribe|stop sending|pas int[ée]ress|no,? thanks?\M|not (buying|importing))' then 'ilgilenmiyor'
        when v_ozet ~* '(purchase order|\mp\.?o\.? ?(no|number|#)|confirm(ed)? (the |our )?order|(would like|want|wish) to (place an? )?order|place (an|the|our) order|order confirmation|bon de commande)' then 'siparis'
        when v_ozet ~* '(price|offer|quotation|\mquote|proforma|cotation|\mprix|best rate|\mcfr\M|\mcif\M)' then 'teklif'
        else null end;
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

create or replace function public.pazar_gorev_bilgi(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g public.pazar_gorevler;
  f public.pazar_firmalar;
  v_adim text;
  e public.pazar_ekip;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into g from public.pazar_gorevler where token = p_token;
  if g.id is null or g.tarih < (now() at time zone 'Europe/Istanbul')::date - 3 then return null; end if;
  select * into f from public.pazar_firmalar where id = g.firma_id;
  select * into e from public.pazar_ekip where company_id = g.company_id and kod = g.atanan;
  v_adim := case f.crm_asama when 'sorgulandi' then 'hatirlatma1' when 'hatirlatma1' then 'hatirlatma2' else 'sorgulama' end;

  return jsonb_build_object(
    'gorev', jsonb_build_object('tarih', g.tarih, 'sira', g.sira, 'neden', g.neden, 'durum', g.durum, 'isleyen', g.isleyen, 'tamamlanma', g.tamamlanma, 'atanan', g.atanan,
      'temas_var', exists (select 1 from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2', 'sonuc'))),
    'ekip', case when e.id is null then null else jsonb_build_object('kod', e.kod, 'eposta', e.eposta, 'hitap', e.hitap) end,
    'adim', v_adim,
    'firma', jsonb_build_object('ad', f.ad, 'ulke', f.ulke, 'durum', f.durum, 'crm_asama', f.crm_asama, 'alici_adi', f.alici_adi,
      'son_siparis', public.pazar_firma_son_siparis(f.id), 'aktif', public.pazar_firma_aktif(f.id)),
    'kisiler', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'ad', k.ad, 'eposta', k.eposta, 'eposta_gecerli', k.eposta_gecerli,
        'telefonlar', k.telefonlar, 'whatsapp', k.whatsapp) order by (k.eposta is not null and k.eposta_gecerli) desc, k.created_at)
      from public.pazar_kisiler k where k.firma_id = f.id), '[]'::jsonb),
    'fuarlar', coalesce((select jsonb_agg(c.etiket order by c.yil desc nulls last) from public.pazar_fuar_katilimlari c where c.firma_id = f.id), '[]'::jsonb),
    'son_urun', (select d.urun_tanimi from public.ihracat_dosyalari d
                  where d.company_id = f.company_id and public.pazar_anahtar(d.alici_firma) = any(array_append(f.ek_anahtarlar, f.anahtar))
                  order by d.olusturma_tarihi desc limit 1),
    'gecmis', coalesce((select jsonb_agg(x order by x->>'olusturma' desc) from (
        select jsonb_build_object('adim', t.adim, 'kanal', t.kanal, 'sonuc', t.sonuc, 'alici', t.alici, 'konu', t.konu, 'isleyen', t.isleyen, 'olusturma', t.olusturma) x
          from public.pazar_temaslar t where t.firma_id = f.id order by t.olusturma desc limit 10) y), '[]'::jsonb),
    'gelenler', coalesce((select jsonb_agg(jsonb_build_object('tarih', x.tarih, 'gonderen', x.gonderen, 'konu', x.konu, 'ozet', left(x.ozet, 400), 'tur', x.tur, 'oneri', x.oneri) order by x.tarih desc)
      from (select * from public.pazar_gelenler n where n.firma_id = f.id and n.tarih > now() - interval '30 days' order by n.tarih desc limit 3) x), '[]'::jsonb),
    'gunun_gorevleri', coalesce((select jsonb_agg(jsonb_build_object('sira', o.sira, 'durum', o.durum, 'token', o.token, 'ad', fo.ad, 'neden', o.neden) order by o.sira)
      from public.pazar_gorevler o join public.pazar_firmalar fo on fo.id = o.firma_id
      where o.company_id = g.company_id and o.tarih = g.tarih and o.atanan is not distinct from g.atanan), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pazar_gelen_kaydet(jsonb) from public, anon, authenticated;
revoke all on function public.pazar_gorev_bilgi(text) from public, anon, authenticated;
