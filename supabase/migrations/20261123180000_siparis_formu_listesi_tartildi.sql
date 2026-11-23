-- 23.11.2026 Siparis Formlari ekrani: "AL-QASRAWI ... listede gozukmuyor" (kullanici).
-- Ekran, bos ekipman tarihi bu haftadan once olan yuklemeleri gizliyordu; formu gonderilmemis ve gemisi kalkmamis yukleme
-- (ornegin ekipman 21.11, ETD 28.11) da gizleniyordu. Ekran artik export hatirlatma listesiyle ayni kurali kullanir
-- (_shared/siparis-formu-lojistik.ts): gonderilmemis + ilk konteyneri TARTILMAMIS + gemisi kalkmamis yukleme gorunur.
-- Bunun icin listeye her satirin "tartildi" bilgisi eklenir (siparis_formu_tartilanlar; istemciye acik degil).
-- Imza / yetki / pencere (bugun -10 .. +45) degismez.
create or replace function public.siparis_formu_listesi()
returns setof jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_tartilan text[];
begin
  if auth.uid() is null or auth_company_id() is null
     or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  select coalesce(array_agg(t), '{}') into v_tartilan
    from jsonb_array_elements_text(to_jsonb(public.siparis_formu_tartilanlar(auth_company_id()))) t;
  return query
    select x || jsonb_build_object('tartildi', (x->>'anahtar') = any(v_tartilan))
      from public.siparis_formu_veri(auth_company_id(), v_bugun - 10, v_bugun + 45) x;
end;
$function$;

revoke all on function public.siparis_formu_listesi() from public, anon;
grant execute on function public.siparis_formu_listesi() to authenticated;
