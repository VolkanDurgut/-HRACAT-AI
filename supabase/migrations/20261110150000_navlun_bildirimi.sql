-- NAVLUN BILDIRIMI (10.11.2026)
--
-- Kullanici karari: "Formu birisi doldurmayacak, maillerden guncellenecek. Hangi sirketin nereye ne kadar navlun
-- verdigi; surekli kendini guncel tutan bir navlun bildirimi. Sadece sistem bir hatayla karsilasinca mudahale
-- edebilecegimiz bir alan olmali."
--
-- Akis: arsiv Gmail (execution@ CC) -> Apps Script docs/apps-script/navlun.gs (konu "NAVLUN", PDF/gorsel OCR)
--   -> edge "navlun-bildirimi" (okuyucu _shared/navlun-oku.ts, AI yok) -> navlun_kaydet (bu dosya).
-- Okunamayan teklif (fiyat ekte / gorselde ve metne cevrilemedi) -> navlun_mesajlari.durum = 'okunamadi'
--   = tek mudahale alani (navlun_hata_coz: elle fiyat ya da yoksay).
--
-- GERCEK VERI REPODA DURMAZ: acente alan adlari (ucuncu taraf) yalniz navlun_acenteler tablosunda.
-- Erisim: istemciye SADECE OKUNUR ("proformalar" veya "analiz" yetkisi); yazma yalniz servis / RPC.

-- 1) Acenteler: gonderen alan adi -> gorunen ad
create table if not exists public.navlun_acenteler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  alan_adi text not null check (alan_adi ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  ad text not null check (char_length(btrim(ad)) between 1 and 60),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, alan_adi)
);

-- 2) Islenen mailler (tekrar islemeyi onler + hata kuyrugu)
create table if not exists public.navlun_mesajlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  mesaj_id text not null check (char_length(mesaj_id) between 3 and 300),
  konu text,
  gonderen text,
  acente text,                                   -- null = bizden (hedef / kabul)
  liman text,
  liman_anahtar text,
  tarih timestamptz not null,
  kaynak text not null default 'metin' check (kaynak in ('metin', 'pdf', 'gorsel')),
  durum text not null check (durum in ('okundu', 'bilgi', 'okunamadi', 'duzeltildi', 'yoksayildi')),
  olay_sayisi integer not null default 0,
  ozet text check (ozet is null or char_length(ozet) <= 2000),   -- hata kuyrugunda gosterilir
  cozen text,
  cozum_tarihi timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, mesaj_id)
);
create index if not exists navlun_mesajlari_durum on public.navlun_mesajlari (company_id, durum, tarih desc);

-- 3) Teklif olaylari
create table if not exists public.navlun_teklifleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  mesaj_id text not null,
  sira integer not null,
  tur text not null check (tur in ('teklif', 'karsi_teklif', 'hedef', 'hedef_soru', 'hedef_kabul', 'kabul',
                                   'servis_yok', 'yer_yok', 'ek_teklif')),
  liman text,
  liman_anahtar text,
  acente text,                                   -- null = bizden
  armator text,
  tutar numeric check (tutar is null or (tutar > 0 and tutar < 100000)),
  para_birimi text not null default 'USD',
  ekipman text check (ekipman is null or ekipman in ('20DC', '40DC', '40HC')),
  free_time_gun integer check (free_time_gun is null or free_time_gun between 0 and 90),
  gecerlilik text,
  lokal_dahil boolean,
  pol text,
  kaynak text not null default 'metin' check (kaynak in ('metin', 'pdf', 'gorsel', 'elle')),
  tarih timestamptz not null,
  created_at timestamptz not null default now(),
  unique (company_id, mesaj_id, sira)
);
create index if not exists navlun_teklifleri_liman on public.navlun_teklifleri (company_id, liman_anahtar, tarih desc);

alter table public.navlun_acenteler enable row level security;
alter table public.navlun_mesajlari enable row level security;
alter table public.navlun_teklifleri enable row level security;

drop policy if exists navlun_acenteler_oku on public.navlun_acenteler;
create policy navlun_acenteler_oku on public.navlun_acenteler for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));
drop policy if exists navlun_mesajlari_oku on public.navlun_mesajlari;
create policy navlun_mesajlari_oku on public.navlun_mesajlari for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));
drop policy if exists navlun_teklifleri_oku on public.navlun_teklifleri;
create policy navlun_teklifleri_oku on public.navlun_teklifleri for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));

revoke all on public.navlun_acenteler from anon;
revoke all on public.navlun_mesajlari from anon;
revoke all on public.navlun_teklifleri from anon;
revoke insert, update, delete on public.navlun_acenteler from authenticated;
revoke insert, update, delete on public.navlun_mesajlari from authenticated;
revoke insert, update, delete on public.navlun_teklifleri from authenticated;

-- 4) Kaydet (yalniz servis): mesaj basina idempotent; ayni mesaj yeniden gelirse (ornegin PDF metniyle)
--    olaylari yenilenir. Elle cozulmus (duzeltildi / yoksayildi) mesaja dokunulmaz.
create or replace function public.navlun_kaydet(p_company uuid, p_mesajlar jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      v_atlanan := v_atlanan + 1;
      continue;
    end if;
    insert into navlun_mesajlari (company_id, mesaj_id, konu, gonderen, acente, liman, liman_anahtar, tarih, kaynak, durum, olay_sayisi, ozet)
    values (p_company, v_mesaj, left(m->>'konu', 300), left(m->>'gonderen', 200), nullif(left(m->>'acente', 60), ''),
            nullif(left(m->>'liman', 80), ''), nullif(left(m->>'liman_anahtar', 80), ''), (m->>'tarih')::timestamptz,
            coalesce(nullif(m->>'kaynak', ''), 'metin'), m->>'durum',
            coalesce(jsonb_array_length(m->'olaylar'), 0), left(m->>'ozet', 2000))
    on conflict (company_id, mesaj_id) do update set
      konu = excluded.konu, gonderen = excluded.gonderen, acente = excluded.acente, liman = excluded.liman, liman_anahtar = excluded.liman_anahtar,
      tarih = excluded.tarih, kaynak = excluded.kaynak, durum = excluded.durum, olay_sayisi = excluded.olay_sayisi,
      ozet = excluded.ozet, updated_at = now();
    if v_mevcut is null then v_yeni := v_yeni + 1; else v_guncel := v_guncel + 1; end if;

    delete from navlun_teklifleri where company_id = p_company and mesaj_id = v_mesaj and kaynak <> 'elle';
    v_sira := 0;
    for o in select * from jsonb_array_elements(coalesce(m->'olaylar', '[]'::jsonb)) loop
      v_sira := v_sira + 1;
      insert into navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar,
        ekipman, free_time_gun, gecerlilik, lokal_dahil, pol, kaynak, tarih)
      values (p_company, v_mesaj, v_sira, o->>'tur', nullif(left(o->>'liman', 80), ''), nullif(left(o->>'liman_anahtar', 80), ''),
        nullif(left(m->>'acente', 60), ''), nullif(left(o->>'armator', 40), ''), nullif(o->>'tutar', '')::numeric,
        nullif(o->>'ekipman', ''), nullif(o->>'free_time_gun', '')::integer, nullif(left(o->>'gecerlilik', 20), ''),
        nullif(o->>'lokal_dahil', '')::boolean, nullif(left(o->>'pol', 40), ''),
        coalesce(nullif(m->>'kaynak', ''), 'metin'), (m->>'tarih')::timestamptz);
      v_olay := v_olay + 1;
    end loop;
  end loop;
  return jsonb_build_object('yeni', v_yeni, 'guncellenen', v_guncel, 'atlanan', v_atlanan, 'olay', v_olay);
end;
$$;
revoke all on function public.navlun_kaydet(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.navlun_kaydet(uuid, jsonb) to service_role;

-- 5) Hata kuyrugu cozumu (TEK mudahale alani): okunamayan mesaja elle fiyat ya da "yoksay".
create or replace function public.navlun_hata_coz(p_id uuid, p_islem text, p_tutar numeric default null,
  p_ekipman text default '20DC', p_armator text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r navlun_mesajlari;
  v_kim text;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  select * into r from navlun_mesajlari where id = p_id and company_id = auth_company_id() for update;
  if not found then raise exception 'Kayıt bulunamadı.'; end if;
  if r.durum <> 'okunamadi' then raise exception 'Bu kayıt hata kuyruğunda değil.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  if p_islem = 'yoksay' then
    update navlun_mesajlari set durum = 'yoksayildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
  elsif p_islem = 'duzelt' then
    if p_tutar is null or p_tutar <= 0 or p_tutar >= 100000 then raise exception 'Geçerli bir tutar girin.'; end if;
    if coalesce(p_ekipman, '20DC') not in ('20DC', '40DC', '40HC') then raise exception 'Ekipman geçersiz.'; end if;
    insert into navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar, ekipman, kaynak, tarih)
    values (r.company_id, r.mesaj_id,
            coalesce((select max(sira) from navlun_teklifleri where company_id = r.company_id and mesaj_id = r.mesaj_id), 0) + 1,
            'teklif', r.liman, r.liman_anahtar, r.acente, nullif(left(btrim(p_armator), 40), ''), p_tutar,
            coalesce(p_ekipman, '20DC'), 'elle', r.tarih);
    update navlun_mesajlari set durum = 'duzeltildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Bilinmeyen işlem.';
end;
$$;
revoke all on function public.navlun_hata_coz(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.navlun_hata_coz(uuid, text, numeric, text, text) to authenticated;
