-- İç piyasa: "Cevap yok / Lojistikten çıkış cevabı gelmedi" (cikis_cevap_yok) yetkili
-- uyarısı kullanıcı talebiyle kapatıldı. Lojistiğe giden 1 saatlik çıkış hatırlatması aynen kalır.
create or replace function public.ic_bildirim_zamanla()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_say integer := 0;
begin
  for r in
    select s.*, e.is_emri_no, e.urun, e.ambalaj, e.durum as emir_durum,
           coalesce(nullif(m.kisa_ad, ''), m.unvan) as musteri_ad,
           a.lojistik_eposta, a.lojistik_ad, a.yetkili_eposta
    from public.ic_sevkler s
    join public.ic_is_emirleri e on e.id = s.is_emri_id
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_piyasa_ayarlari a on a.company_id = s.company_id
    where s.cikis_durumu in ('bekliyor', 'planlandi')
      and s.olusturma > now() - interval '3 days'
      and e.durum <> 'iptal'
      and s.cikis_hatirlatma is null
    for update of s skip locked
  loop
    if (r.cikis_durumu = 'planlandi' and r.cikis_planlanan <= now())
      or (r.cikis_durumu = 'bekliyor' and r.olusturma <= now() - interval '60 minutes') then
      perform public.ic_bildirim_ekle(r.company_id, r.is_emri_id, r.id, 'cikis_hatirlatma', 'lojistik', 'eposta',
        r.lojistik_eposta, coalesce(r.lojistik_ad, 'Lojistik'),
        jsonb_build_array(r.plaka, r.is_emri_no || ' · ' || r.musteri_ad, public.ic_urun_yazi(r.urun, r.ambalaj), public.ic_kg_yazi(r.net_kg),
          case when r.cikis_durumu = 'planlandi' then to_char(r.cikis_planlanan at time zone 'Europe/Istanbul', 'HH24:MI') else '-' end),
        r.cikis_token,
        case when r.lojistik_eposta is null then 'Lojistik e-posta adresi tanımlı değil.' end);
      update public.ic_sevkler set cikis_hatirlatma = now() where id = r.id;
      v_say := v_say + 1;
    end if;
  end loop;
  return v_say;
end; $function$;

-- Kuyrukta bekleyen "cevap yok" uyarısı varsa gönderilmesin.
update public.ic_bildirimler
   set durum = 'atlandi', hata = 'Cevap yok uyarısı kapatıldı.', islem_zamani = now(), isleyen = 'sistem'
 where sablon = 'cikis_cevap_yok' and durum = 'bekliyor';
