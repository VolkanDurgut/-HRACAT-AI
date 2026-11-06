-- ============================================================================
-- KONSIMENTO TALIMATI: musteri bazli consignee / notify hafizasi (06.11.2026)
-- ============================================================================
-- Kullanici: "Proformalar yuklendiginde her zaman o musterinin bir onceki sevkiyatina ait consignee
-- ve notify bilgileri otomatik doldurulmali. Musteri adi altinda notify / consignee hatirlanmali;
-- secili olarak son tercih ettigi gelmeli. Musteri yeniyse manuel girilebilsin."
--
-- Hafiza ayri tablo DEGIL: ayni sirketin ayni alici_firma'li (buyuk harf, bosluk sade) onceki
-- dosyalari. Uygulama gecmis secenekleri oradan listeler (lib/konsimento/taraf-gecmisi.ts).
-- Bu tetikleyici yeni dosya EKLENIRKEN (proforma yukleme / olusturma, hangi yoldan olursa olsun)
-- bos olan alanlari en son sevkiyattan doldurur:
--   consignee (bossa), ham_veri.notify (yoksa), ham_veri.konsimento_talimati (yoksa; sablon haric:
--   sablon acenteye gore), ham_veri.consignee_kaynak = 'onceki_sevkiyat', ham_veri.taraf_kaynagi = dosya no.
-- Asla hata firlatmaz (dosya kaydi engellenmez). Mevcut dosyalara DOKUNULMAZ (yalniz INSERT).
--
-- companies.konsimento_gumruk_musaviri: Akkon formundaki "Gumruk Musaviri" blogu (sirket ayari;
-- deger repoya yazilmaz).
-- ============================================================================

alter table public.companies add column if not exists konsimento_gumruk_musaviri text;
comment on column public.companies.konsimento_gumruk_musaviri is
  'Konsimento talimati (Akkon formu) gumruk musaviri blogu; cok satirli metin. 06.11.2026';

create or replace function public.ihracat_dosya_taraf_doldur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anahtar text;
  o record;
  v_ham jsonb;
begin
  if new.company_id is null or nullif(btrim(coalesce(new.alici_firma, '')), '') is null then
    return new;
  end if;
  v_anahtar := upper(regexp_replace(btrim(new.alici_firma), '\s+', ' ', 'g'));

  select d.dosya_no, d.consignee, d.ham_veri
    into o
    from public.ihracat_dosyalari d
   where d.company_id = new.company_id
     and d.id is distinct from new.id
     and upper(regexp_replace(btrim(coalesce(d.alici_firma, '')), '\s+', ' ', 'g')) = v_anahtar
     and (nullif(btrim(coalesce(d.consignee, '')), '') is not null
          or (jsonb_typeof(d.ham_veri -> 'notify') = 'array' and jsonb_array_length(d.ham_veri -> 'notify') > 0))
   order by d.olusturma_tarihi desc nulls last, d.dosya_no desc
   limit 1;
  if not found then
    return new;
  end if;

  v_ham := case when jsonb_typeof(new.ham_veri) = 'object' then new.ham_veri else '{}'::jsonb end;
  if nullif(btrim(coalesce(new.consignee, '')), '') is null and nullif(btrim(coalesce(o.consignee, '')), '') is not null then
    new.consignee := o.consignee;
    v_ham := v_ham || jsonb_build_object('consignee_kaynak', 'onceki_sevkiyat');
  end if;
  if not (v_ham ? 'notify') and jsonb_typeof(o.ham_veri -> 'notify') = 'array' then
    v_ham := v_ham || jsonb_build_object('notify', o.ham_veri -> 'notify');
  end if;
  if not (v_ham ? 'konsimento_talimati') and jsonb_typeof(o.ham_veri -> 'konsimento_talimati') = 'object' then
    v_ham := v_ham || jsonb_build_object('konsimento_talimati', (o.ham_veri -> 'konsimento_talimati') - 'sablon');
  end if;
  new.ham_veri := v_ham || jsonb_build_object('taraf_kaynagi', o.dosya_no);
  return new;
exception when others then
  raise warning 'ihracat_dosya_taraf_doldur: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.ihracat_dosya_taraf_doldur() from public, anon, authenticated;

drop trigger if exists trg_dosya_taraf_doldur on public.ihracat_dosyalari;
create trigger trg_dosya_taraf_doldur
  before insert on public.ihracat_dosyalari
  for each row execute function public.ihracat_dosya_taraf_doldur();
