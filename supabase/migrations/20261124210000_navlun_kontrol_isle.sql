-- 24.11.2026 NAVLUN ASAMA 2: KONTROL ISLEMLERI (kullanici onayi). Yeni Navlun Merkezi ekraninin (/navlun/merkez) Kontrol
-- sekmesindeki dort islem TEK RPC'den gecer ve her biri navlun_kontrol_islemleri'ne (20261124190000) iz birakir:
--   duzelt  : okunamayan / teklif olabilecek mail -> mevcut navlun_hata_coz (elle teklif). Davranis degismez.
--   yoksay  : kalem kontrol listesinden kalkar (mail ise navlun_hata_coz yoksay; digerlerinde yalniz iz).
--   ogret   : acente hafizasi (navlun_acente_hafizasi) lokal dahil / haric + lokal tutari; kaynak 'elle', guven 'kesin'.
--             Lokali belirsiz teklifler acente basina tek kalemdir (hedef_tur 'acente', hedef_id = acente anahtari).
--   onayla  : yalniz TUTMAYAN gerceklesen navlun; gerekce zorunlu (is kaydina yazilmaz, yalniz iz).
-- duzelt / ogret sonrasi degerlendirme 15 dakikayi beklemeden tetiklenir (navlun-degerlendir zamanlanmis gorevinin ayni
-- komutu; gorev yoksa sessizce atlanir, 15 dakikalik calisma yine yeniler).
-- Is kayitlarina (rezervasyon, dosya, yukleme plani) YAZILMAZ. Mevcut kayitlar degismez.

-- 1) Iz tablosu: acente hedef turu + islemi yapanin e-postasi (tablo bos; yalniz genisletme)
alter table public.navlun_kontrol_islemleri drop constraint if exists navlun_kontrol_islemleri_hedef_tur_check;
alter table public.navlun_kontrol_islemleri add constraint navlun_kontrol_islemleri_hedef_tur_check
  check (hedef_tur in ('teklif', 'mesaj', 'gerceklesen', 'acente'));
alter table public.navlun_kontrol_islemleri add column if not exists kullanici_eposta text
  check (kullanici_eposta is null or char_length(kullanici_eposta) <= 120);

-- 2) Degerlendirmeyi hemen tetikle (yalniz bu dosyadaki RPC kullanir)
create or replace function public.navlun_degerlendir_tetikle()
returns void language plpgsql security definer set search_path = public as $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then return; end if;
  select command into v_komut from cron.job where jobname = 'navlun-degerlendir' limit 1;
  if v_komut is null or position('/functions/v1/navlun-bildirimi''' in v_komut) = 0 then return; end if;
  execute rtrim(btrim(v_komut), ';');
exception when others then
  raise warning 'navlun degerlendirme tetiklenemedi: %', sqlerrm;
end;
$$;
revoke all on function public.navlun_degerlendir_tetikle() from public, anon, authenticated;

-- 3) Kontrol islemi
create or replace function public.navlun_kontrol_isle(p_hedef_tur text, p_hedef_id text, p_islem text, p_veri jsonb default '{}'::jsonb,
  p_gerekce text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_kim text;
  v_gerekce text := nullif(left(btrim(coalesce(p_gerekce, '')), 500), '');
  v_veri jsonb := coalesce(p_veri, '{}'::jsonb);
  v_onceki jsonb;
  v_sonraki jsonb;
  m navlun_mesajlari;
  d navlun_teklif_degerlendirme;
  g navlun_gerceklesen_kontrol;
  h navlun_acente_hafizasi;
  v_anahtar text;
  v_ad text;
  v_lokal text;
  v_l20 numeric;
  v_l40 numeric;
  v_tetikle boolean := false;
begin
  if auth.uid() is null or v_sirket is null
     or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if p_hedef_id is null or char_length(p_hedef_id) not between 1 and 300
     or (p_hedef_tur <> 'acente' and p_hedef_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Kayıt geçersiz.';
  end if;
  begin v_kim := left(lower(coalesce(auth.jwt() ->> 'email', '')), 120); exception when others then v_kim := null; end;

  if p_hedef_tur = 'mesaj' then
    if p_islem not in ('duzelt', 'yoksay') then raise exception 'Bu kayıtta bu işlem yapılamaz.'; end if;
    select * into m from navlun_mesajlari where id = p_hedef_id::uuid and company_id = v_sirket;
    if not found then raise exception 'Kayıt bulunamadı.'; end if;
    v_onceki := jsonb_build_object('durum', m.durum, 'acente', m.acente, 'liman', m.liman);
    perform navlun_hata_coz(m.id, p_islem,
      case when p_islem = 'duzelt' then nullif(v_veri ->> 'tutar', '')::numeric end,
      coalesce(nullif(v_veri ->> 'ekipman', ''), '20DC'), nullif(v_veri ->> 'armator', ''), nullif(v_veri ->> 'acente', ''));
    v_sonraki := case when p_islem = 'duzelt'
      then jsonb_build_object('tutar', v_veri -> 'tutar', 'ekipman', coalesce(nullif(v_veri ->> 'ekipman', ''), '20DC'),
                              'armator', v_veri -> 'armator', 'acente', coalesce(m.acente, v_veri ->> 'acente'))
      else null end;
    v_tetikle := p_islem = 'duzelt';

  elsif p_hedef_tur = 'gerceklesen' then
    if p_islem not in ('onayla', 'yoksay') then raise exception 'Bu kayıtta bu işlem yapılamaz.'; end if;
    select * into g from navlun_gerceklesen_kontrol where sevkiyat_id = p_hedef_id::uuid and company_id = v_sirket;
    if not found then raise exception 'Kayıt bulunamadı.'; end if;
    if p_islem = 'onayla' then
      if g.durum <> 'tutmuyor' then raise exception 'Yalnız tutmayan navlun onaylanır.'; end if;
      if v_gerekce is null or char_length(v_gerekce) < 5 then raise exception 'Onay için gerekçe yazın.'; end if;
    end if;
    v_onceki := jsonb_build_object('durum', g.durum, 'gercek', g.gercek, 'para', g.para, 'teklif_tutar', g.teklif_tutar, 'teklif_para', g.teklif_para, 'fark', g.fark);

  elsif p_hedef_tur = 'teklif' then
    if p_islem not in ('ogret', 'yoksay') then raise exception 'Bu kayıtta bu işlem yapılamaz.'; end if;
    select * into d from navlun_teklif_degerlendirme where teklif_id = p_hedef_id::uuid and company_id = v_sirket;
    if not found then raise exception 'Kayıt bulunamadı.'; end if;
    v_onceki := jsonb_build_object('durum', d.durum, 'toplam_usd', d.toplam_usd, 'lokal', d.lokal, 'lokal_durum', d.lokal_durum, 'celiski', d.celiski);
    v_ad := d.acente;

  elsif p_hedef_tur = 'acente' then
    if p_islem not in ('ogret', 'yoksay') then raise exception 'Bu kayıtta bu işlem yapılamaz.'; end if;
    v_ad := nullif(left(btrim(coalesce(v_veri ->> 'acente_ad', '')), 60), '');
    v_onceki := null;
  else
    raise exception 'Bilinmeyen kayıt türü.';
  end if;

  -- Kural olarak ogret: acente hafizasi
  if p_islem = 'ogret' then
    v_anahtar := upper(btrim(coalesce(v_veri ->> 'acente_anahtar', '')));
    if p_hedef_tur = 'acente' and v_anahtar <> upper(btrim(p_hedef_id)) then raise exception 'Acente uyuşmuyor.'; end if;
    if v_anahtar !~ '^[A-Z0-9+& .-]{1,60}$' then raise exception 'Acente anahtarı geçersiz.'; end if;
    if v_ad is null then raise exception 'Acente adı yok.'; end if;
    v_lokal := v_veri ->> 'lokal';
    if v_lokal not in ('dahil', 'haric') then raise exception 'Lokal dahil mi hariç mi seçin.'; end if;
    v_l20 := nullif(v_veri ->> 'lokal_20', '')::numeric;
    v_l40 := nullif(v_veri ->> 'lokal_40', '')::numeric;
    if v_lokal = 'haric' and (v_l20 is null or v_l20 <= 0 or v_l20 >= 10000) then raise exception '20''lik lokal tutarını girin.'; end if;
    if v_l40 is not null and (v_l40 <= 0 or v_l40 >= 10000) then raise exception '40''lık lokal tutarı geçersiz.'; end if;
    if v_lokal = 'dahil' then v_l20 := null; v_l40 := null; end if;
    select * into h from navlun_acente_hafizasi where company_id = v_sirket and acente_anahtar = v_anahtar for update;
    if found then
      v_onceki := coalesce(v_onceki, '{}'::jsonb) || jsonb_build_object('hafiza',
        jsonb_build_object('lokal', h.lokal, 'lokal_20', h.lokal_20, 'lokal_40', h.lokal_40, 'guven', h.guven, 'kanit', h.kanit, 'kaynak', h.kaynak));
      update navlun_acente_hafizasi
         set lokal = v_lokal, lokal_20 = v_l20, lokal_40 = v_l40, guven = 'kesin', kaynak = 'elle',
             kanit = left(format('Elle öğretildi (%s, %s)%s', to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY'), coalesce(nullif(v_kim, ''), 'kullanıcı'),
                                 coalesce(': ' || v_gerekce, '')), 500),
             updated_at = now()
       where id = h.id;
    else
      insert into navlun_acente_hafizasi (company_id, acente_anahtar, acente_ad, lokal, lokal_20, lokal_40, ek_kont, guven, kanit, kaynak)
      values (v_sirket, v_anahtar, v_ad, v_lokal, v_l20, v_l40, 0, 'kesin',
              left(format('Elle öğretildi (%s, %s)%s', to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY'), coalesce(nullif(v_kim, ''), 'kullanıcı'),
                          coalesce(': ' || v_gerekce, '')), 500), 'elle');
    end if;
    v_sonraki := jsonb_build_object('acente_anahtar', v_anahtar, 'lokal', v_lokal, 'lokal_20', v_l20, 'lokal_40', v_l40);
    v_tetikle := true;
  end if;

  insert into navlun_kontrol_islemleri (company_id, hedef_tur, hedef_id, islem, onceki, sonraki, gerekce, kullanici, kullanici_eposta)
  values (v_sirket, p_hedef_tur, p_hedef_id, p_islem, v_onceki, v_sonraki, v_gerekce, auth.uid(), nullif(v_kim, ''));

  if v_tetikle then perform navlun_degerlendir_tetikle(); end if;
  return jsonb_build_object('ok', true, 'yeniden_hesap', v_tetikle);
end;
$$;
revoke all on function public.navlun_kontrol_isle(text, text, text, jsonb, text) from public, anon;
grant execute on function public.navlun_kontrol_isle(text, text, text, jsonb, text) to authenticated;
