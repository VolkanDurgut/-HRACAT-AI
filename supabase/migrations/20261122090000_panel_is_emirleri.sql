-- 22.11.2026 ANA PANEL IS EMIRLERI (kullanici: "Onaylananlar yani on odemesi alinmis proformalar ana panelde gozukmeli.
-- Rezervasyonu da belliyse rezervasyonlu olarak gorulebilmeli. Mevcut is emrine hemen ulasabilmis olacagiz; proforma
-- aramak zorunda kalmayacagim.")
--
--  panel_is_emirleri(): dosyasi HENUZ ACILMAMIS is emirleri (Ana Panel ust bolumu)
--   - rezervasyonlu: Yukleme Plani'nda booking'i olan (ETD son 7 gun ve sonrasi), sistemde rezervasyonu / dosyasi
--     olmayan satirlar. Proforma: plan satiri, yoksa Siparis Listesi'nde BL sutununda bu booking'i tasiyan satir.
--     Siparis Listesi'nde "sevk edildi" olan booking (eski plan satiri) alinmaz.
--   - on_odeme: Yukleme Plani'nin "rezervasyon bekleyen" (on odemesi alinmis) satirlari + on odeme tarihi.
--   - aksiyonlar: plan_bekleyen_aksiyonlari ile ayni kural (sistem proformasi / rezervasyonsuz acik dosya / siparis takibi).
--  plan_bekleyen_aksiyonlari govdesi plan_bekleyen_aksiyonlari_ic(sirket, liste)'ye tasindi (yetki kontrolu disarida;
--  ic fonksiyon istemciye acik DEGIL). Davranis degismedi.
-- Hicbir kayit degismez (yalniz fonksiyonlar).

create or replace function public.plan_bekleyen_aksiyonlari_ic(p_sirket uuid, p_proformalar text[])
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- Excel satiri sistem proformasiyla eslestirilmisse (siparis_eslesmeleri; or. UNEXSIM061126 -> UNEXBSC061126) o proforma
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'proforma_no', x.no,
      'proforma_id', (select p.id from proformalar p where p.company_id = p_sirket and siparis_anahtar(p.proforma_no) in (x.k, x.ek)
                      order by (siparis_anahtar(p.proforma_no) = x.ek) desc nulls last, p.updated_at desc limit 1),
      'dosya', (select jsonb_build_object('id', d.id, 'dosya_no', d.dosya_no) from ihracat_dosyalari d
                where d.company_id = p_sirket and d.durum = 'Açık' and siparis_anahtar(d.proforma_no) in (x.k, x.ek)
                  and not exists (select 1 from rezervasyonlar r where r.dosya_id = d.id and nullif(btrim(r.booking_no), '') is not null)
                order by d.olusturma_tarihi desc limit 1),
      'ana_siparis', (select jsonb_build_object('id', a.id, 'proforma_no', a.proforma_no) from ana_siparisler a
                      where a.company_id = p_sirket and not coalesce(a.tamamlandi, false) and siparis_anahtar(a.proforma_no) in (x.k, x.ek)
                      order by a.olusturma_tarihi desc limit 1)))
    from (
      select y.no, siparis_anahtar(y.no) as k,
        (select siparis_anahtar(e.proforma_anahtar) from siparis_eslesmeleri e join siparis_defteri s on s.id = e.defter_id
         where e.company_id = p_sirket and s.company_id = p_sirket and siparis_anahtar(s.proforma_no) = siparis_anahtar(y.no)
         order by e.created_at desc limit 1) as ek
      from (select distinct btrim(u) as no from unnest(p_proformalar) u where nullif(btrim(u), '') is not null) y
    ) x), '[]'::jsonb);
$function$;

revoke all on function public.plan_bekleyen_aksiyonlari_ic(uuid, text[]) from public, anon, authenticated;

create or replace function public.plan_bekleyen_aksiyonlari(p_proformalar text[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if coalesce(array_length(p_proformalar, 1), 0) > 500 then raise exception 'En fazla 500 proforma.'; end if;
  return public.plan_bekleyen_aksiyonlari_ic(v_sirket, p_proformalar);
end; $function$;

revoke all on function public.plan_bekleyen_aksiyonlari(text[]) from public, anon;
grant execute on function public.plan_bekleyen_aksiyonlari(text[]) to authenticated;

create or replace function public.panel_is_emirleri()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_satirlar jsonb;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('proformalar')) then
    raise exception 'Yetkiniz yok.';
  end if;

  with p as (
    select * from yukleme_plani_veri(v_sirket)
  ), r as (
    select p.*,
      (select s.proforma_no from siparis_defteri s
       where s.company_id = v_sirket and s.durum <> 'sevk_edildi'
         and exists (select 1 from regexp_split_to_table(coalesce(s.bl_no, ''), '\s*[,/;]\s*') t where booking_anahtar(t) = booking_anahtar(p.booking_no))
       order by s.updated_at desc limit 1) as liste_pf,
      exists (select 1 from siparis_defteri s
              where s.company_id = v_sirket and s.durum = 'sevk_edildi'
                and exists (select 1 from regexp_split_to_table(coalesce(s.bl_no, ''), '\s*[,/;]\s*') t where booking_anahtar(t) = booking_anahtar(p.booking_no))) as sevk
    from p
    where p.kaynak = 'excel' and p.dosya_no is null and nullif(btrim(p.booking_no), '') is not null
      and p.etd is not null and p.etd >= current_date - 7
      and not exists (select 1 from rezervasyonlar x where x.company_id = v_sirket and booking_anahtar(x.booking_no) = booking_anahtar(p.booking_no))
  ), birlesik as (
    select 'rezervasyonlu'::text as tur, r.anahtar, r.musteri, coalesce(nullif(btrim(r.proforma_no), ''), r.liste_pf) as proforma_no,
           r.booking_no, r.konteyner, r.cinsi, r.varis_limani, r.cuval_markasi, r.ambalaj, r.acente, r.liman, r.ekipman,
           r.bos_ekipman_tarihi, r.ardiyesiz_giris, r.talimat_cutoff, r.beyan_cutoff, r.etd, r.gemi, r.sefer
    from r where not r.sevk
    union all
    select 'on_odeme', p.anahtar, p.musteri, p.proforma_no, null, p.konteyner, p.cinsi, p.varis_limani, p.cuval_markasi, p.ambalaj,
           null, null, null, null, null, null, null, null, null, null
    from p where p.kaynak = 'siparis'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'tur', b.tur, 'anahtar', b.anahtar, 'musteri', b.musteri, 'proforma_no', b.proforma_no, 'booking_no', b.booking_no,
      'konteyner', b.konteyner, 'cinsi', b.cinsi, 'varis_limani', b.varis_limani, 'cuval_markasi', b.cuval_markasi, 'ambalaj', b.ambalaj,
      'acente', b.acente, 'liman', b.liman, 'ekipman', b.ekipman, 'bos_ekipman_tarihi', b.bos_ekipman_tarihi,
      'ardiyesiz_giris', b.ardiyesiz_giris, 'talimat_cutoff', b.talimat_cutoff, 'beyan_cutoff', b.beyan_cutoff,
      'etd', b.etd, 'gemi', b.gemi, 'sefer', b.sefer,
      -- on odeme: proformanin kendi anahtari, yoksa eslestirilmis sistem proformasininki (siparis_eslesmeleri)
      'on_odeme_tarihi', (select o.tarih from siparis_on_odemeler o
                          where o.company_id = v_sirket and o.alindi
                            and o.proforma_anahtar in (siparis_anahtar(b.proforma_no),
                              (select siparis_anahtar(e.proforma_anahtar) from siparis_eslesmeleri e join siparis_defteri s on s.id = e.defter_id
                               where e.company_id = v_sirket and s.company_id = v_sirket and siparis_anahtar(s.proforma_no) = siparis_anahtar(b.proforma_no)
                               order by e.created_at desc limit 1))
                          order by (o.proforma_anahtar = siparis_anahtar(b.proforma_no)) desc limit 1))
      order by b.tur desc, b.etd nulls last, b.musteri), '[]'::jsonb)
  into v_satirlar
  from birlesik b;

  return jsonb_build_object(
    'satirlar', v_satirlar,
    'aksiyonlar', public.plan_bekleyen_aksiyonlari_ic(v_sirket,
      array(select distinct e->>'proforma_no' from jsonb_array_elements(v_satirlar) e where nullif(e->>'proforma_no', '') is not null)));
end; $function$;

revoke all on function public.panel_is_emirleri() from public, anon;
grant execute on function public.panel_is_emirleri() to authenticated;
