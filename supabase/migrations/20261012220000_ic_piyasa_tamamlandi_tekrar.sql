-- ============================================================================
-- IC PIYASA - "SIPARISINIZ TAMAMLANDI" TEKRAR KORUMASI (12.10.2026)
-- ============================================================================
-- Sorun: is emri "tamamlandi" -> yeniden "acik" -> tekrar "tamamlandi" yapilirsa
-- musteri kutusuna IKINCI bir "Siparisiniz tamamlandi" mesaji dusuyordu
-- (ilki hala gonderilmeyi bekliyorken).
-- Duzeltme (yalnizca HENUZ GONDERILMEMIS mesajlar etkilenir):
--   - Is emri yeniden acilinca bekleyen "tamamlandi" mesaji atlanir.
--   - Tekrar kapatilinca once bekleyen eski mesaj atlanir, guncel toplamlarla
--     (arac sayisi, net kg) yenisi hazirlanir.
-- Gonderilmis mesajlara dokunulmaz. Diger davranis birebir ayni.
-- Onceki migration: 20261012210000. Ihracat tablolarina DOKUNMAZ.
-- ============================================================================

create or replace function public.ic_bildirim_is_emri()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m public.ic_musteriler%rowtype;
  v_adet integer;
  v_kg numeric;
begin
  select * into m from public.ic_musteriler where id = new.musteri_id;
  if tg_op = 'INSERT' then
    perform public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_alindi', 'musteri', 'whatsapp',
      m.telefon, m.unvan,
      jsonb_build_array(m.unvan, new.is_emri_no, public.ic_urun_yazi(new.urun, new.ambalaj),
        case when new.hedef_tur = 'kg' then public.ic_ton_yazi(new.hedef_kg) else new.hedef_arac::text || ' araç' end,
        coalesce(nullif(btrim(coalesce(new.teslim, '')), ''), '-')),
      new.takip_token);
  elsif new.durum is distinct from old.durum then
    -- Durum degisince bekleyen (gonderilmemis) eski "tamamlandi" mesaji gecersiz olur
    if old.durum = 'tamamlandi' or new.durum = 'tamamlandi' then
      update public.ic_bildirimler
         set durum = 'atlandi',
             hata = case when new.durum = 'tamamlandi' then 'Güncel kapanış mesajıyla değiştirildi.' else 'İş emri yeniden açıldı.' end,
             islem_zamani = now(), isleyen = 'sistem'
       where is_emri_id = new.id and sablon = 'siparis_tamamlandi' and durum = 'bekliyor';
    end if;
    if new.durum = 'tamamlandi' then
      select count(*), coalesce(sum(net_kg), 0) into v_adet, v_kg from public.ic_sevkler where is_emri_id = new.id;
      if v_adet > 0 then
        perform public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_tamamlandi', 'musteri', 'whatsapp',
          m.telefon, m.unvan,
          jsonb_build_array(m.unvan, new.is_emri_no, public.ic_urun_yazi(new.urun, new.ambalaj), v_adet::text, public.ic_kg_yazi(v_kg)),
          new.takip_token);
      end if;
    elsif new.durum = 'iptal' then
      update public.ic_bildirimler set durum = 'atlandi', hata = 'İş emri iptal edildi.', islem_zamani = now(), isleyen = 'sistem'
       where is_emri_id = new.id and alici = 'musteri' and durum = 'bekliyor';
    end if;
  end if;
  return new;
end; $function$;

revoke all on function public.ic_bildirim_is_emri() from public, anon, authenticated;
