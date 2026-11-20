-- ============================================================================
-- SIPARIS LISTESI: SISTEM ESAS (21.11.2026, Faz 4). Kullanici: "Siparis listesinin kendi kendine olusturulmasi
-- saglanmali." Karar (21.11.2026): "Sistem esastir." Excel satiri yalniz sistemde hic karsiligi yoksa durum belirler.
--
-- Bulgu: proforma / dosya satirlari zaten sistemden geliyordu; sorun Excel'in siparis basina degil sevkiyat basina satir
-- tutmasi ve eski asama satirlarinin kalmasiydi (ayni siparis iki kez) + Excel'de ayni proforma no'lu bir satir varken
-- sistemdeki dosyanin hic gorunmemesi.
-- Degisiklik (siparis_listesi_veri; kolonlar AYNEN, yalniz iki kural; kuru calistirma farki: 2 satir gizlendi, 2 dosya geldi):
--  1) Sistemdeki dosya, Excel'de ayni proforma no'lu bir satir var diye GIZLENMEZ; yalniz bir Excel satiri o dosyaya
--     bagliysa ya da ayni proformanin "sevk edildi" Excel satiri ayni miktardaysa (gecmis kaydin kendisi) gizlenir.
--  2) Sistemde dosyasi olan, hicbir dosyaya bagli olmayan aktif (sevk / iptal disi) Excel satiri, o proformanin
--     dosyalari satirin miktarini karsiliyorsa eski asama kopyasidir: listede gosterilmez (kayit SILINMEZ).
-- Yeni: siparis_eslesmeyenler() - sistemde hic karsiligi olmayan aktif Excel satirlari (Siparis Listesi seridi).
-- veri_tutarsizliklari: "Siparis listesi guncel degil" uyarisi yalniz boyle satir varken cikar.
-- Fonksiyon tanimi canlidan okunup beklenen metin AYNEN bulunursa degistirilir (20261118190000 ile ayni yontem).
-- ============================================================================

-- Sistemde hic karsiligi olmayan aktif Excel satirlari (proforma, dosya, elle eslesme yok). Yalniz sunucu ici.
create or replace function public.siparis_eslesmeyen_veri(p_company uuid)
 returns table(anahtar text, proforma_no text, proforma_tarihi date, firma text, miktar_mt numeric, konteyner integer, liman text,
               durum text, booking_no text, bl_no text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with dos as (select distinct d.pk from siparis_dosya_ozeti(p_company) d where d.pk is not null),
  pro as (select distinct siparis_anahtar(p.proforma_no) pk from proformalar p where p.company_id = p_company)
  select v.anahtar, v.proforma_no, v.proforma_tarihi, v.firma, v.miktar_mt, v.konteyner, v.liman, v.durum, v.booking_no, v.bl_no
  from siparis_listesi_veri(p_company) v
  where v.kaynak = 'excel' and v.durum not in ('sevk_edildi', 'iptal') and v.dosya_no is null and v.eslesik_proforma is null
    and not exists (select 1 from pro where pro.pk = siparis_anahtar(v.proforma_no))
    and not exists (select 1 from dos where dos.pk = siparis_anahtar(v.proforma_no))
  order by v.proforma_tarihi nulls last, v.proforma_no;
$function$;

-- Siparis Listesi seridi: siparis_listesi() ile ayni yetki
create or replace function public.siparis_eslesmeyenler()
 returns setof jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query select to_jsonb(v) from siparis_eslesmeyen_veri(auth_company_id()) v;
end;
$function$;

revoke all on function public.siparis_eslesmeyen_veri(uuid) from public, anon, authenticated;
grant execute on function public.siparis_eslesmeyen_veri(uuid) to service_role;
revoke all on function public.siparis_eslesmeyenler() from public, anon;
grant execute on function public.siparis_eslesmeyenler() to authenticated;

do $yama$
declare
  f text;
  a1 text := 'where not exists (select 1 from sd where sd.bagli = d.dosya_id or sd.pk = d.pk)';
  a2 text := E'left join oo on oo.proforma_anahtar = coalesce((select o2.proforma_anahtar from oo o2 where o2.proforma_anahtar = sd.pk), sd.epk)\n  ),\n  dosyadan as (';
  t text;
  b1 text := E'if v_sip_son is null or v_sip_son < now() - interval ''3 days'' then';
begin
  f := pg_get_functiondef('public.siparis_listesi_veri(uuid)'::regprocedure);
  if (length(f) - length(replace(f, a1, ''))) / length(a1) <> 1 or (length(f) - length(replace(f, a2, ''))) / length(a2) <> 1 then
    raise exception 'siparis_listesi_veri beklenen bicimde degil; degistirilmedi.';
  end if;
  f := replace(f, a1, E'where not exists (select 1 from sd where sd.bagli = d.dosya_id\n      or (sd.bagli is null and sd.pk = d.pk and sd.durum = ''sevk_edildi'' and abs(coalesce(sd.miktar_mt, -1) - coalesce(d.miktar_mt, -2)) < 0.5))');
  f := replace(f, a2, E'left join oo on oo.proforma_anahtar = coalesce((select o2.proforma_anahtar from oo o2 where o2.proforma_anahtar = sd.pk), sd.epk)\n    -- 21.11.2026 sistem esas: dosyalari miktari karsilayan, bagsiz aktif Excel satiri eski asama kopyasidir\n    where not (sd.bagli is null and sd.durum not in (''sevk_edildi'', ''iptal'') and exists (select 1 from dos d2 where d2.pk = sd.pk)\n      and coalesce(sd.miktar_mt, 0) <= (select coalesce(sum(d3.miktar_mt), 0) from dos d3 where d3.pk = sd.pk))\n  ),\n  dosyadan as (');
  execute f;

  t := pg_get_functiondef('public.veri_tutarsizliklari()'::regprocedure);
  if (length(t) - length(replace(t, b1, ''))) / length(b1) <> 1 then
    raise exception 'veri_tutarsizliklari beklenen bicimde degil; degistirilmedi.';
  end if;
  t := replace(t, b1, E'if (v_sip_son is null or v_sip_son < now() - interval ''3 days'') and exists (select 1 from siparis_eslesmeyen_veri(c)) then');
  execute t;
end $yama$;
