-- VGM raporu: son DBA yuklenip dosyanin tum konteynerlerinin VGM'i tamamlandigi anda gonderim.
-- Konteyner (vgm_kg) veya rezervasyon (konteyner_adedi) degisince dosya tamamsa vgm-rapor fonksiyonu
-- hemen tetiklenir. 10 dakikalik 'vgm-rapor' cron'u yedek olarak kalir (hata sonrasi yeniden deneme).
-- Cift gonderim olmaz: fonksiyon gondermeden once benzersiz index'li kaydi alir.
-- Anahtar repoya yazilmaz; calisma aninda 'vgm-rapor' cron komutundan okunur.

create or replace function public.vgm_dosya_tamam(p_dosya uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select coalesce(sum(konteyner_adedi), 0) as adet from rezervasyonlar where dosya_id = p_dosya
  ), k as (
    select count(*) as kont, count(*) filter (where coalesce(vgm_kg, 0) > 0) as dolu
    from konteynerler where dosya_id = p_dosya
  )
  select exists (select 1 from ihracat_dosyalari where id = p_dosya and durum = 'Açık')
     and r.adet > 0 and k.kont >= r.adet and k.dolu = k.kont
  from r, k;
$$;

create or replace function public.vgm_rapor_tetikle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dosya uuid;
  v_bayrak text;
  v_anahtar text;
begin
  v_dosya := case when tg_op = 'DELETE' then old.dosya_id else new.dosya_id end;
  if v_dosya is null then return null; end if;

  -- Ayni islemde birden cok satir degisirse tek cagri
  v_bayrak := 'app.vgm_tetik_' || replace(v_dosya::text, '-', '');
  if coalesce(current_setting(v_bayrak, true), '') = '1' then return null; end if;

  if not public.vgm_dosya_tamam(v_dosya) then return null; end if;
  if exists (select 1 from vgm_rapor_gonderimleri where dosya_id = v_dosya and durum in ('gonderildi', 'onceden')) then
    return null;
  end if;

  select substring(command from 'Bearer (eyJ[A-Za-z0-9._-]+)') into v_anahtar
  from cron.job where jobname = 'vgm-rapor';
  if v_anahtar is null then return null; end if;

  perform set_config(v_bayrak, '1', true);
  perform net.http_post(
    url := 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/vgm-rapor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anahtar),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  return null;
exception when others then
  -- Tetik hicbir kosulda DBA/konteyner kaydini bozmaz; cron yedegi devrede
  raise warning 'vgm_rapor_tetikle: %', sqlerrm;
  return null;
end;
$$;

revoke execute on function public.vgm_dosya_tamam(uuid) from public, anon, authenticated;
revoke execute on function public.vgm_rapor_tetikle() from public, anon, authenticated;

drop trigger if exists trg_vgm_rapor_konteyner on public.konteynerler;
create trigger trg_vgm_rapor_konteyner
  after insert or update of vgm_kg, dosya_id or delete on public.konteynerler
  for each row execute function public.vgm_rapor_tetikle();

drop trigger if exists trg_vgm_rapor_rezervasyon on public.rezervasyonlar;
create trigger trg_vgm_rapor_rezervasyon
  after update of konteyner_adedi or delete on public.rezervasyonlar
  for each row execute function public.vgm_rapor_tetikle();
