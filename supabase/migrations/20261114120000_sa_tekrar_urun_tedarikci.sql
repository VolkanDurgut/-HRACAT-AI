-- 14.11.2026 Satin alma: ayni formda TEKRAR kurali URUN + TEDARIKCI.
-- Haftalik listede ayni urun farkli tedarikciden alinabiliyor (Patates: TAKOZLAR + CEM MARKET).
-- Onceki kural (28.10.2026) yalniz urun adina bakiyordu; ikinci tedarikcinin satiri reddediliyordu.
-- Yeni kural: ayni urun AYNI tedarikciden (ya da ikisi de tedarikcisiz) ikinci satir olamaz.
-- Istemci (talep formu + toplu ekleme paneli) kalemAnahtari() ile AYNI kurali uygular.
-- Yalniz tekrar kontrolu ve mesaji degisti; diger dogrulamalar birebir korunmustur.

create or replace function public.sa_token_kalem_ekle(p_token text, p_kalem jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_id uuid;
  v_miktar numeric;
  v_var public.satin_alma_kalemleri;
  v_tedarikci text := nullif(regexp_replace(btrim(coalesce(p_kalem ->> 'tedarikci', '')), '\s+', ' ', 'g'), '');
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null then
    begin
      insert into public.satin_alma_listeleri (company_id, departman_id) values (d.company_id, d.id) returning id into v_liste;
    exception when unique_violation then
      select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
    end;
  end if;
  if (select count(*) from public.satin_alma_kalemleri k where k.liste_id = v_liste) >= 100 then
    raise exception 'Bir listede en fazla 100 kalem olabilir. Listeyi gönderip yenisine devam edin.' using errcode = '23514';
  end if;
  begin
    v_miktar := round((p_kalem ->> 'miktar')::numeric, 2);
  exception when others then
    raise exception 'Miktar geçersiz.' using errcode = '23514';
  end;
  if v_miktar is null or v_miktar <= 0 or v_miktar > 1000000 then
    raise exception 'Miktar 0''dan büyük olmalı.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'kategori', '') not in ('kirtasiye', 'temizlik', 'mutfak', 'elektronik', 'is_guvenligi', 'diger') then
    raise exception 'Kategori seçin.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'birim', '') not in ('adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'gr', 'litre', 'metre', 'takim', 'kova', 'bidon', 'diger') then
    raise exception 'Birim seçin.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_kalem ->> 'urun', ''))) not between 2 and 200 then
    raise exception 'Ürün adını yazın (2–200 karakter).' using errcode = '23514';
  end if;
  if not public.sa_ad_soyad_gecerli(p_kalem ->> 'talep_eden') then
    raise exception 'Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  if char_length(coalesce(p_kalem ->> 'aciklama', '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  if char_length(coalesce(v_tedarikci, '')) > 80 then
    raise exception 'Tedarikçi en fazla 80 karakter olabilir.' using errcode = '23514';
  end if;
  -- 14.11.2026: ayni formda ayni urun + ayni tedarikci ikinci satir olarak eklenmez (miktar artirilir)
  select k.* into v_var from public.satin_alma_kalemleri k
   where k.liste_id = v_liste
     and public.sa_urun_norm(k.urun) = public.sa_urun_norm(p_kalem ->> 'urun')
     and coalesce(public.sa_urun_norm(k.tedarikci), '') = coalesce(public.sa_urun_norm(v_tedarikci), '')
   order by k.olusturma limit 1;
  if v_var.id is not null then
    raise exception 'Bu ürün %formda zaten var: % · % % (%). Yeni satır yerine mevcut kalemin miktarını artırın.',
      case when v_var.tedarikci is not null then 'aynı tedarikçiden (' || v_var.tedarikci || ') ' else '' end,
      v_var.urun, replace(trim_scale(v_var.miktar)::text, '.', ','),
      case v_var.birim when 'adet' then 'Adet' when 'paket' then 'Paket' when 'koli' then 'Koli' when 'kutu' then 'Kutu'
        when 'top' then 'Top' when 'kg' then 'Kg' when 'gr' then 'Gr' when 'litre' then 'Litre' when 'metre' then 'Metre'
        when 'takim' then 'Takım' when 'kova' then 'Kova' when 'bidon' then 'Bidon' else 'Diğer' end,
      v_var.talep_eden
      using errcode = '23505';
  end if;
  -- olusturma = clock_timestamp(): toplu eklemede (ayni islem) liste sirasi korunur
  insert into public.satin_alma_kalemleri (company_id, liste_id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden, tedarikci, olusturma)
  values (
    d.company_id, v_liste, p_kalem ->> 'kategori', btrim(p_kalem ->> 'urun'), v_miktar, p_kalem ->> 'birim',
    case when p_kalem ->> 'aciliyet' = 'acil' then 'acil' else 'normal' end,
    nullif(btrim(coalesce(p_kalem ->> 'aciklama', '')), ''),
    public.sa_ad_soyad_duzelt(p_kalem ->> 'talep_eden'),
    v_tedarikci, clock_timestamp())
  returning id into v_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return v_id;
end; $function$;
