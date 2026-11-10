-- PAZAR - atlama nedeni + Burak Bey takip ekrani (10.11.2026)
--
-- Kullanici: "Her ihtimale karsi musteriyi atla butonu olmali; neden atlandigini kisa yazabilmeli. Yazilanlar hafizaya
-- alinmali ve personel bir sonraki sefer yine atla yaparsa secenek olarak gosterilmeli." + "Burak Bey Pazar kisminda
-- onundeki ekranda gerekli takibi yapabilmeli."
--  - pazar_gorev_isle('atla'): neden ZORUNLU (en az 3 karakter) -> pazar_temaslar.konu (120 karakter).
--  - pazar_gorev_bilgi: temas_var 'atla'yi da sayar (nedenli atlama sonrasi siradaki musteriye gecilir);
--    'atlama_nedenleri' = sirketin en sik / en yeni 8 atlama nedeni.
--  - pazar_takip(gun): Pazar sayfasi Takip sekmesi icin son N gunun gorevleri (TOKEN YOK) + her gorevin son temasi.
--    Yalniz "pazar" yetkisi (execution@ + bbt@); pazar_gorevler tablosu istemciye yine kapali.

create or replace function public.pazar_gorev_isle(p_token text, p_islem text, p_kanal text, p_sablon text,
  p_alici text, p_konu text, p_govde text, p_isleyen text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.pazar_gorevler;
  f public.pazar_firmalar;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_adim text;
  v_isleyen text := nullif(left(trim(coalesce(p_isleyen, '')), 80), '');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'Geçersiz bağlantı.'; end if;
  select * into g from public.pazar_gorevler where token = p_token for update;
  if g.id is null or g.tarih < v_bugun - 3 then raise exception 'Bu görevin süresi doldu.'; end if;
  select * into f from public.pazar_firmalar where id = g.firma_id for update;
  -- Isleyen yazilmadiysa gorevin atandigi kisi (ornek "export@")
  if v_isleyen is null then
    select split_part(e.eposta, '@', 1) || '@' into v_isleyen from public.pazar_ekip e where e.company_id = g.company_id and e.kod = g.atanan;
  end if;

  if p_islem = 'gonderildi' then
    if p_kanal not in ('eposta', 'whatsapp') then raise exception 'Geçersiz kanal.'; end if;
    v_adim := case f.crm_asama when 'sorgulandi' then 'hatirlatma1' when 'hatirlatma1' then 'hatirlatma2' else 'sorgulama' end;
    -- Ayni gun ayni adim ikinci kez (ornek: e-posta + WhatsApp) asamayi ilerletmez, yalniz kayit
    if exists (select 1 from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2')) then
      select t.adim into v_adim from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2') order by t.olusturma limit 1;
    else
      update public.pazar_firmalar
         set crm_asama = case v_adim when 'sorgulama' then 'sorgulandi' when 'hatirlatma1' then 'hatirlatma1' else 'hatirlatma2' end,
             sonraki_adim = case v_adim when 'sorgulama' then public.pazar_is_gunu_ekle(v_bugun, 4)
                                        when 'hatirlatma1' then public.pazar_is_gunu_ekle(v_bugun, 6)
                                        else v_bugun + 10 end,
             bekleme_bitis = null, son_temas = now(), updated_at = now()
       where id = f.id;
    end if;
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, kanal, sablon, alici, konu, govde, isleyen)
    values (g.company_id, f.id, g.id, v_adim, p_kanal, left(p_sablon, 40), left(p_alici, 300), left(p_konu, 300), left(p_govde, 6000), v_isleyen);
    update public.pazar_gorevler set durum = 'yapildi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = coalesce(tamamlanma, now()) where id = g.id;

  elsif p_islem in ('cevap', 'teklif', 'siparis', 'ilgilenmiyor') then
    update public.pazar_firmalar
       set crm_asama = p_islem, sonraki_adim = null,
           bekleme_bitis = v_bugun + case p_islem when 'ilgilenmiyor' then 180 else 30 end,
           son_temas = now(), updated_at = now()
     where id = f.id;
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, sonuc, isleyen)
    values (g.company_id, f.id, g.id, 'sonuc', p_islem, v_isleyen);
    update public.pazar_gorevler set durum = 'yapildi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = coalesce(tamamlanma, now()) where id = g.id;

  elsif p_islem = 'atla' then
    if g.durum = 'yapildi' then raise exception 'Bu görev zaten işlendi.'; end if;
    -- 10.11.2026: atlama nedeni zorunlu (temas.konu; sonraki atlamalarda secenek olarak gosterilir)
    if length(trim(coalesce(p_konu, ''))) < 3 then raise exception 'Atlama nedenini yazın.'; end if;
    update public.pazar_firmalar set bekleme_bitis = greatest(coalesce(bekleme_bitis, v_bugun), v_bugun + 7), updated_at = now()
     where id = f.id and crm_asama not in ('sorgulandi', 'hatirlatma1');
    -- Hatirlatmasi atlanan firma: hatirlatma 2 is gunu ertelenir
    update public.pazar_firmalar set sonraki_adim = public.pazar_is_gunu_ekle(v_bugun, 2), updated_at = now()
     where id = f.id and crm_asama in ('sorgulandi', 'hatirlatma1');
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, konu, isleyen)
    values (g.company_id, f.id, g.id, 'atla', left(regexp_replace(trim(p_konu), '\s+', ' ', 'g'), 120), v_isleyen);
    update public.pazar_gorevler set durum = 'atlandi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = now() where id = g.id;
  else
    raise exception 'Geçersiz işlem.';
  end if;

  return public.pazar_gorev_bilgi(p_token);
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
      'temas_var', exists (select 1 from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2', 'sonuc', 'atla'))),
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
    -- Daha once yazilan atlama nedenleri (en sik / en yeni 8): bir sonraki atlamada secenek
    'atlama_nedenleri', coalesce((select jsonb_agg(x.konu order by x.adet desc, x.son desc) from (
        select t.konu, count(*) adet, max(t.olusturma) son from public.pazar_temaslar t
         where t.company_id = g.company_id and t.adim = 'atla' and t.konu is not null and t.konu <> ''
         group by t.konu order by count(*) desc, max(t.olusturma) desc limit 8) x), '[]'::jsonb),
    'gunun_gorevleri', coalesce((select jsonb_agg(jsonb_build_object('sira', o.sira, 'durum', o.durum, 'token', o.token, 'ad', fo.ad, 'neden', o.neden) order by o.sira)
      from public.pazar_gorevler o join public.pazar_firmalar fo on fo.id = o.firma_id
      where o.company_id = g.company_id and o.tarih = g.tarih and o.atanan is not distinct from g.atanan), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pazar_takip(p_gun integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid := auth_company_id();
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if v_company is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkiniz yok.'; end if;
  p_gun := least(greatest(coalesce(p_gun, 7), 1), 31);
  return jsonb_build_object(
    'bugun', v_bugun,
    'gorevler', coalesce((select jsonb_agg(jsonb_build_object(
        'tarih', g.tarih, 'atanan', g.atanan, 'sira', g.sira, 'neden', g.neden, 'durum', g.durum,
        'isleyen', g.isleyen, 'tamamlanma', g.tamamlanma, 'firma_id', g.firma_id,
        'son', (select jsonb_build_object('adim', t.adim, 'kanal', t.kanal, 'sonuc', t.sonuc, 'konu', t.konu, 'olusturma', t.olusturma)
                  from public.pazar_temaslar t where t.gorev_id = g.id order by t.olusturma desc limit 1)
      ) order by g.tarih desc, g.atanan, g.sira)
      from public.pazar_gorevler g
      where g.company_id = v_company and g.tarih > v_bugun - p_gun), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pazar_gorev_isle(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.pazar_gorev_bilgi(text) from public, anon, authenticated;
revoke all on function public.pazar_takip(integer) from public, anon;
grant execute on function public.pazar_takip(integer) to authenticated;
