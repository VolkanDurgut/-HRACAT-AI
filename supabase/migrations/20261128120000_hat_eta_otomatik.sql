-- ============================================================================
-- HAT TAKIP (28.11.2026): Hapag-Lloyd ETA'si sisteme OTOMATIK yazilir + ETD/ETA Excel'i Hapag satirlarinin ETA'sini EZMEZ
-- ============================================================================
-- Kullanici: "Bizdeki personel de Hapag'tan cekiyor zaten. O yuzden Hapag icin ETA verileri otomatik guncellenmeli.
--   ... Excel eklendiginde sadece Hapag icin ETA ETD bilgileri degismemeli. Artik biz onu en dogru yerden cekiyoruz."
-- 1) hat_eta_esitle(takip): hat_takip_kaydet() her basarili Hapag sorgusundan sonra cagirir. Hattin ETA'si (Istanbul
--    gunu; PLN / EST / ACT) rezervasyonlar.eta'dan farkliysa yazar (eta_guncelleme_tarihi = now()). Kural Excel ile ayni:
--    ETD varsa ETD <= ETA <= ETD + 180 gun; uymazsa YAZMAZ, "atlandi" kaydi birakir. Her degisiklik hat_eta_guncellemeleri'ne.
--    Booking bazinda kapatma: hat_takip_kayitlari.eta_otomatik = false. ETD (gemi_kalkis_tarihi) YAZILMAZ: fatura onayi,
--    konsimento hatirlatma, sigorta, DIIB, draft BL ondan beslenir (ayri karar).
-- 2) odeme_excel_yukleme_kaydet: ETA'si Hapag'dan otomatik gelen rezervasyonun Excel ETA'si ATLANIR (hata degil); sayisi
--    donuste eta_hat_atlanan.
-- Tetikleyici: rezervasyonlar'da ETA'ya bagli mail / bildirim yok (yalniz denetim_rezervasyonlar). Mail GONDERILMEZ.
-- ============================================================================

alter table public.hat_takip_kayitlari add column if not exists eta_otomatik boolean not null default true;
comment on column public.hat_takip_kayitlari.eta_otomatik is
  '28.11.2026: true -> hattin ETA''si rezervasyonlar.eta''ya otomatik yazilir ve ETD/ETA Excel''i bu satirin ETA''sini degistirmez.';

create table if not exists public.hat_eta_guncellemeleri (
  id bigserial primary key,
  company_id uuid not null references public.companies(id),
  takip_id uuid not null references public.hat_takip_kayitlari(id) on delete cascade,
  rezervasyon_id uuid not null,
  eski date,
  yeni date,
  sinif text,
  durum text not null check (durum in ('guncellendi', 'atlandi', 'hata')),
  sebep text check (sebep is null or char_length(sebep) <= 300),
  zaman timestamptz not null default now()
);
create index if not exists hat_eta_guncellemeleri_rez_idx on public.hat_eta_guncellemeleri (rezervasyon_id, zaman desc);

alter table public.hat_eta_guncellemeleri enable row level security;
drop policy if exists hat_eta_guncellemeleri_okuma on public.hat_eta_guncellemeleri;
create policy hat_eta_guncellemeleri_okuma on public.hat_eta_guncellemeleri
  for select to authenticated
  using (company_id = public.auth_company_id() and public.ic_sayfa_yetkisi('etd_eta'));
revoke insert, update, delete on public.hat_eta_guncellemeleri from anon, authenticated;
grant select on public.hat_eta_guncellemeleri to authenticated;

create or replace function public.hat_eta_esitle(p_takip uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  k public.hat_takip_kayitlari%rowtype;
  v_eta date;
  v_etd date;
  v_yeni date;
begin
  select * into k from public.hat_takip_kayitlari where id = p_takip;
  if k.id is null or not k.aktif or not k.eta_otomatik or k.durum <> 'tamam' or k.hat_eta is null
     or coalesce(k.hat_eta_sinif, '') not in ('PLN', 'EST', 'ACT') then
    return jsonb_build_object('durum', 'yok');
  end if;
  v_yeni := (k.hat_eta at time zone 'Europe/Istanbul')::date;

  select r.eta, r.gemi_kalkis_tarihi into v_eta, v_etd
    from public.rezervasyonlar r where r.id = k.rezervasyon_id and r.company_id = k.company_id for update;
  if not found then return jsonb_build_object('durum', 'yok'); end if;
  if v_eta is not distinct from v_yeni then return jsonb_build_object('durum', 'ayni', 'eta', v_yeni); end if;

  if v_etd is not null and (v_yeni < v_etd or v_yeni > v_etd + 180) then
    if not exists (select 1 from public.hat_eta_guncellemeleri g
                    where g.rezervasyon_id = k.rezervasyon_id and g.yeni = v_yeni and g.durum = 'atlandi') then
      insert into public.hat_eta_guncellemeleri (company_id, takip_id, rezervasyon_id, eski, yeni, sinif, durum, sebep)
      values (k.company_id, k.id, k.rezervasyon_id, v_eta, v_yeni, k.hat_eta_sinif, 'atlandi',
              format('Hat ETA''sı (%s) ETD (%s) ile uyumsuz.', to_char(v_yeni, 'DD.MM.YYYY'), to_char(v_etd, 'DD.MM.YYYY')));
    end if;
    return jsonb_build_object('durum', 'atlandi', 'eta', v_yeni);
  end if;

  update public.rezervasyonlar set eta = v_yeni, eta_guncelleme_tarihi = now() where id = k.rezervasyon_id;
  insert into public.hat_eta_guncellemeleri (company_id, takip_id, rezervasyon_id, eski, yeni, sinif, durum)
  values (k.company_id, k.id, k.rezervasyon_id, v_eta, v_yeni, k.hat_eta_sinif, 'guncellendi');
  return jsonb_build_object('durum', 'guncellendi', 'eski', v_eta, 'eta', v_yeni);
end;
$function$;

revoke all on function public.hat_eta_esitle(uuid) from public, anon, authenticated;
grant execute on function public.hat_eta_esitle(uuid) to service_role;

create or replace function public.hat_takip_kaydet(p_takip uuid, p_durum_kodu integer, p_sure_ms integer, p_olaylar jsonb, p_ozet jsonb, p_hata text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  k public.hat_takip_kayitlari%rowtype;
  v_eklenen integer := 0;
begin
  select * into k from public.hat_takip_kayitlari where id = p_takip;
  if k.id is null then return 0; end if;
  insert into public.hat_takip_cagrilari (api, takip_id, durum_kodu, sure_ms) values ('tt', p_takip, p_durum_kodu, p_sure_ms);

  if p_hata is not null then
    update public.hat_takip_kayitlari
       set son_sorgu = now(), son_hata = left(p_hata, 500), guncelleme = now(),
           durum = case when p_durum_kodu = 404 then 'bulunamadi' else 'hata' end
     where id = p_takip;
    return 0;
  end if;

  insert into public.hat_olaylari (company_id, takip_id, olay_anahtari, olay_turu, olay_kodu, sinif, olay_zamani, olusma_zamani,
                                   konteyner, bos_dolu, yer_kodu, yer_adi, gemi, imo, sefer, ham)
  select k.company_id, p_takip, o ->> 'anahtar', coalesce(o ->> 'tur', '?'), o ->> 'kod', o ->> 'sinif',
         nullif(o ->> 'zaman', '')::timestamptz, nullif(o ->> 'olusma', '')::timestamptz,
         o ->> 'konteyner', o ->> 'bos_dolu', o ->> 'yer', o ->> 'yer_adi', o ->> 'gemi', o ->> 'imo', o ->> 'sefer', o -> 'ham'
    from jsonb_array_elements(coalesce(p_olaylar, '[]'::jsonb)) o
   where coalesce(o ->> 'anahtar', '') <> ''
  on conflict (takip_id, olay_anahtari) do update
     set olay_zamani = excluded.olay_zamani, olusma_zamani = excluded.olusma_zamani, sinif = excluded.sinif,
         yer_kodu = excluded.yer_kodu, yer_adi = excluded.yer_adi, gemi = excluded.gemi, imo = excluded.imo,
         sefer = excluded.sefer, ham = excluded.ham, alinma = now()
   where (public.hat_olaylari.olay_zamani, public.hat_olaylari.sinif, public.hat_olaylari.olusma_zamani)
         is distinct from (excluded.olay_zamani, excluded.sinif, excluded.olusma_zamani);
  get diagnostics v_eklenen = row_count;

  update public.hat_takip_kayitlari
     set son_sorgu = now(), son_basari = now(), son_hata = null, guncelleme = now(),
         durum = case when coalesce((p_ozet ->> 'olay_sayisi')::integer, 0) > 0 then 'tamam' else 'bulunamadi' end,
         olay_sayisi = (select count(*) from public.hat_olaylari h where h.takip_id = p_takip),
         konteyner_sayisi = coalesce((p_ozet ->> 'konteyner_sayisi')::integer, 0),
         hat_etd = nullif(p_ozet ->> 'etd', '')::timestamptz, hat_etd_sinif = p_ozet ->> 'etd_sinif',
         hat_eta = nullif(p_ozet ->> 'eta', '')::timestamptz, hat_eta_sinif = p_ozet ->> 'eta_sinif',
         pol = p_ozet ->> 'pol', pod = p_ozet ->> 'pod', gemi = p_ozet ->> 'gemi', sefer = p_ozet ->> 'sefer'
   where id = p_takip;

  begin
    perform public.hat_eta_esitle(p_takip);
  exception when others then
    insert into public.hat_eta_guncellemeleri (company_id, takip_id, rezervasyon_id, durum, sebep)
    values (k.company_id, k.id, k.rezervasyon_id, 'hata', left(sqlerrm, 300));
  end;
  return v_eklenen;
end;
$function$;

revoke all on function public.hat_takip_kaydet(uuid, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.hat_takip_kaydet(uuid, integer, integer, jsonb, jsonb, text) to service_role;

create or replace function public.odeme_excel_yukleme_kaydet(p_dosya_adi text, p_satirlar jsonb, p_ozet jsonb, p_etalar jsonb default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_say integer := 0;
  v_eta_say integer := 0;
  v_hat_say integer := 0;
  v_kayit public.odeme_excel_yuklemeleri;
  v_e jsonb;
  v_id uuid;
  v_eta date;
  v_etd date;
  v_eski date;
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Oturum bulunamadı.'; end if;
  if not ic_sayfa_yetkisi('etd_eta') then raise exception 'ETD/ETA yetkiniz yok.'; end if;
  if p_ozet is null or jsonb_typeof(p_ozet) <> 'object' then raise exception 'Geçersiz özet.'; end if;

  if p_satirlar is not null and jsonb_typeof(p_satirlar) = 'array' and jsonb_array_length(p_satirlar) > 0 then
    v_say := public.odeme_konsimento_toplu(p_satirlar);
  elsif p_satirlar is not null and jsonb_typeof(p_satirlar) <> 'array' then
    raise exception 'Geçersiz veri.';
  end if;

  if p_etalar is not null then
    if jsonb_typeof(p_etalar) <> 'array' then raise exception 'Geçersiz ETA verisi.'; end if;
    if jsonb_array_length(p_etalar) > 2000 then raise exception 'Bir seferde en fazla 2000 ETA güncellenebilir.'; end if;
    for v_e in select * from jsonb_array_elements(p_etalar) loop
      begin
        v_id := (v_e->>'id')::uuid;
        v_eta := (v_e->>'eta')::date;
      exception when others then
        raise exception 'Geçersiz ETA satırı.';
      end;
      if v_id is null or v_eta is null then raise exception 'Geçersiz ETA satırı.'; end if;
      if exists (select 1 from public.hat_takip_kayitlari k
                  where k.rezervasyon_id = v_id and k.company_id = v_sirket and k.aktif and k.eta_otomatik
                    and k.durum = 'tamam' and k.hat_eta is not null) then
        v_hat_say := v_hat_say + 1;
        continue;
      end if;
      select r.gemi_kalkis_tarihi, r.eta into v_etd, v_eski from rezervasyonlar r where r.id = v_id and r.company_id = v_sirket for update;
      if not found then raise exception 'Sevkiyat bulunamadı. Sayfayı yenileyip tekrar deneyin.'; end if;
      if v_etd is not null and (v_eta < v_etd or v_eta > v_etd + 180) then
        raise exception 'ETA (%) ETD (%) ile uyumsuz.', to_char(v_eta, 'DD.MM.YYYY'), to_char(v_etd, 'DD.MM.YYYY');
      end if;
      if v_eski is distinct from v_eta then
        update rezervasyonlar set eta = v_eta, eta_guncelleme_tarihi = now() where id = v_id;
        v_eta_say := v_eta_say + 1;
      end if;
    end loop;
  end if;

  insert into public.odeme_excel_yuklemeleri (company_id, dosya_adi, guncellenen, ozet, yukleyen_id, yukleyen_eposta)
  values (v_sirket, nullif(left(btrim(coalesce(p_dosya_adi, '')), 255), ''), v_say,
          p_ozet || jsonb_build_object('eta_guncellenen', v_eta_say, 'eta_hat_atlanan', v_hat_say),
          auth.uid(), (select u.email from auth.users u where u.id = auth.uid()))
  returning * into v_kayit;
  return to_jsonb(v_kayit) || jsonb_build_object('eta_guncellenen', v_eta_say, 'eta_hat_atlanan', v_hat_say);
end; $function$;

revoke all on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb, jsonb) to authenticated;
