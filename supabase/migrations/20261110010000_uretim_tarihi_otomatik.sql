-- ============================================================================
-- URETIM / TUKETIM TARIHI OTOMATIGI (10.11.2026)
-- ============================================================================
-- Kullanici: "Uretim ve tuketim tarihi her zaman o yuklemeye ait bos ekipman alim tarihi - 1 gun
-- olarak dikkate alinmali. Sadece OM GENERAL isimli firma icin uretim-tuketim arasinda 15 ay var.
-- Digerleri 1 yil." Kararlar (strateji belgesi): dosyada birden fazla rezervasyon varsa EN ERKEN
-- alim tarihi esas; elle girilen / degistirilen tarihe sistem DOKUNMAZ; yalniz ACIK dosyalar.
--
--   uretim_tarihi       = min(rezervasyonlar.ekipman_alim_tarihi) - 1 gun
--   son_kullanim_tarihi = uretim_tarihi + 12 ay   (alici OM GENERAL ile basliyorsa + 15 ay)
--
-- ihracat_dosyalari.uretim_tarihi_elle: true = tarihler elle girildi/degistirildi, otomatik yazmaz.
--   * Ekrandan (veya herhangi bir yoldan) bu iki tarihten biri degisirse tetikleyici true yapar.
--   * Ikisi de bosaltilirsa false olur ve tarih hemen yeniden hesaplanir (otomatige donus).
--   * Mevcut dolu tarihler bu migration'da elle sayilir: gecmis/kapali dosyalara dokunulmaz.
-- Rezervasyon eklenince / alim tarihi degisince / silinince dosyanin tarihi yeniden hesaplanir.
-- Asla hata firlatmaz (rezervasyon ve dosya kaydi engellenmez).
-- ============================================================================

alter table public.ihracat_dosyalari add column if not exists uretim_tarihi_elle boolean not null default false;
comment on column public.ihracat_dosyalari.uretim_tarihi_elle is
  'true: uretim/son kullanim tarihi elle girildi, otomatik hesap yazmaz. 10.11.2026';

update public.ihracat_dosyalari
   set uretim_tarihi_elle = true
 where (uretim_tarihi is not null or son_kullanim_tarihi is not null)
   and uretim_tarihi_elle = false;

-- Saf hesap: dosyanin en erken bos ekipman alim tarihinden uretim / son kullanim
create or replace function public.ihracat_uretim_hesapla(p_dosya_id uuid, p_alici text, out uretim date, out skt date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alim date;
begin
  select min(r.ekipman_alim_tarihi) into v_alim from public.rezervasyonlar r where r.dosya_id = p_dosya_id;
  if v_alim is null then
    return;
  end if;
  uretim := v_alim - 1;
  skt := (uretim + case when upper(btrim(coalesce(p_alici, ''))) like 'OM GENERAL%'
                        then interval '15 months' else interval '12 months' end)::date;
end;
$$;

-- Dosyaya yaz (yalniz acik + elle degil + deger farkliysa)
create or replace function public.ihracat_uretim_tarihi_guncelle(p_dosya_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  h record;
begin
  select id, durum, alici_firma, uretim_tarihi, son_kullanim_tarihi, uretim_tarihi_elle
    into d from public.ihracat_dosyalari where id = p_dosya_id;
  if not found or d.uretim_tarihi_elle or d.durum is distinct from 'Açık' then
    return;
  end if;
  select * into h from public.ihracat_uretim_hesapla(d.id, d.alici_firma);
  if h.uretim is null then
    return;
  end if;
  if d.uretim_tarihi is distinct from h.uretim or d.son_kullanim_tarihi is distinct from h.skt then
    perform set_config('app.uretim_otomatik', '1', true);
    update public.ihracat_dosyalari
       set uretim_tarihi = h.uretim, son_kullanim_tarihi = h.skt
     where id = d.id;
    perform set_config('app.uretim_otomatik', '0', true);
  end if;
exception when others then
  perform set_config('app.uretim_otomatik', '0', true);
  raise warning 'ihracat_uretim_tarihi_guncelle: %', sqlerrm;
end;
$$;

-- Dosya guncellenirken: elle degisikligi isaretle; ikisi bosaltilirsa otomatige don
create or replace function public.ihracat_uretim_elle_tetik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
begin
  if coalesce(current_setting('app.uretim_otomatik', true), '0') = '1' then
    return new;
  end if;
  if new.uretim_tarihi is distinct from old.uretim_tarihi
     or new.son_kullanim_tarihi is distinct from old.son_kullanim_tarihi then
    new.uretim_tarihi_elle := (new.uretim_tarihi is not null or new.son_kullanim_tarihi is not null);
  end if;
  -- Otomatik moddaki acik dosya: tarihler bosaltildiysa ya da alici degistiyse yeniden hesapla
  if not new.uretim_tarihi_elle and new.durum = 'Açık'
     and ((new.uretim_tarihi is null and new.son_kullanim_tarihi is null)
          or new.alici_firma is distinct from old.alici_firma) then
    select * into h from public.ihracat_uretim_hesapla(new.id, new.alici_firma);
    if h.uretim is not null then
      new.uretim_tarihi := h.uretim;
      new.son_kullanim_tarihi := h.skt;
    end if;
  end if;
  return new;
exception when others then
  raise warning 'ihracat_uretim_elle_tetik: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_uretim_elle on public.ihracat_dosyalari;
create trigger trg_uretim_elle
  before update of uretim_tarihi, son_kullanim_tarihi, alici_firma on public.ihracat_dosyalari
  for each row execute function public.ihracat_uretim_elle_tetik();

-- Rezervasyon degisince dosyanin tarihini yeniden hesapla
create or replace function public.rezervasyon_uretim_tetik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.dosya_id is not null then
    perform public.ihracat_uretim_tarihi_guncelle(old.dosya_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.dosya_id is not null
     and (tg_op = 'INSERT' or new.dosya_id is distinct from old.dosya_id) then
    perform public.ihracat_uretim_tarihi_guncelle(new.dosya_id);
  end if;
  return null;
exception when others then
  raise warning 'rezervasyon_uretim_tetik: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_rezervasyon_uretim on public.rezervasyonlar;
create trigger trg_rezervasyon_uretim
  after insert or delete or update of ekipman_alim_tarihi, dosya_id on public.rezervasyonlar
  for each row execute function public.rezervasyon_uretim_tetik();

revoke all on function public.ihracat_uretim_hesapla(uuid, text) from public, anon, authenticated;
revoke all on function public.ihracat_uretim_tarihi_guncelle(uuid) from public, anon, authenticated;
revoke all on function public.ihracat_uretim_elle_tetik() from public, anon, authenticated;
revoke all on function public.rezervasyon_uretim_tetik() from public, anon, authenticated;
