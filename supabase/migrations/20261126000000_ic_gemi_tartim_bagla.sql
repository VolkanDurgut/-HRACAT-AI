-- ============================================================================
-- GEMI TAHLIYE - eslesmeyen tartimi gemiye TEK TIKLA bagla (26.11.2026, Kantar Paneli yeniden tasarim)
-- ============================================================================
-- Kullanici (gorev tanimi): "Eslesmeyen tartimlar cekmecede temiz bir liste halinde gorunsun ve operator tek tikla
-- is emrine / gemiye eslestirme yapabilsin." Kantarci firma alanina gemi adini yazmayi unuttuysa tartim "kaydi yok"
-- listesinde kalir. ic_gemi_tartim_bagla(p_gemi, p_kayit_no): tartimi acik gemiye otomatik UNEX araci olarak baglar
-- (liman fisi sonra toplu eslestirmeyle gelir). Daha once "gemiye ait degil" isaretlendiyse isaret kalkar.
-- YALNIZ EKLEME: mevcut fonksiyon / tablo degismez. Kantar kayitlarina yazilmaz.
-- ============================================================================

create or replace function public.ic_gemi_tartim_bagla(p_gemi uuid, p_kayit_no bigint)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  g public.ic_gemi_tahliyeleri%rowtype;
  t public.kantar_tartimlari%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into g from public.ic_gemi_tahliyeleri x where x.id = p_gemi and x.company_id = v_sirket;
  if g.id is null then raise exception 'Gemi bulunamadı.' using errcode = 'P0002'; end if;
  if g.durum <> 'acik' then raise exception '% tahliyeye açık değil.', g.gemi_adi using errcode = '23514'; end if;
  select k.* into t from public.kantar_tartimlari k
   where k.company_id = v_sirket and k.kayit_no = p_kayit_no and k.cikis > now() - interval '30 days'
   order by k.cikis desc limit 1;
  if t.id is null then raise exception 'Kantar tartımı bulunamadı.' using errcode = 'P0002'; end if;
  if coalesce(t.net_kg, 0) <= 0 or t.net_kg > 60000 then
    raise exception 'Tartımın net ağırlığı geçersiz.' using errcode = '22023';
  end if;
  if not ic_gemi_tartim_uygun(t) then
    raise exception 'Bu tartım başka bir kayda bağlı (gemi, DBA ya da irsaliye).' using errcode = '23514';
  end if;
  delete from public.ic_gemi_haric_tartimlar where tartim_id = t.id;
  insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar,
                                       girilen_email, kantar_tartim_id, teslim_kaynak, teslim_zamani)
  values (v_sirket, g.id, null, (t.cikis at time zone 'Europe/Istanbul')::date, ic_gemi_kantar_plaka(t.plaka, t.dorse),
          null, round(t.net_kg, 2), 'otomatik', '{}', lower(nullif(auth.jwt() ->> 'email', '')), t.id, 'kantar', t.cikis)
  returning id into v_id;
  perform ic_gemi_kantar_esle_calistir();
  return (select jsonb_build_object('id', a.id, 'plaka', a.plaka, 'teslim_kg', a.teslim_kg, 'liman_kg', a.liman_kg, 'gemi', g.gemi_adi)
          from public.ic_gemi_araclari a where a.id = v_id);
end; $function$;

revoke all on function public.ic_gemi_tartim_bagla(uuid, bigint) from public, anon;
grant execute on function public.ic_gemi_tartim_bagla(uuid, bigint) to authenticated;
