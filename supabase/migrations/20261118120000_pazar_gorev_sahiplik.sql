-- PAZAR GUNLUK GOREV: FIRMA SAHIPLIGI (18.11.2026, kullanici).
--
-- Kullanici: "export ve sales mailine iletilen musteriler oluyor. Kullanicilara bugun karma bir sekilde hatirlatma
-- iletmeleri geldi fakat herkes kendi musterisinin hatirlatmasini yapabilmeli."
-- Sorun: pazar_gorev_olustur kisilere sirayla calisiyor ve "hatirlatma zamani gelen" firmalari kimin yazdigina bakmadan
-- ilk sirada olana veriyordu (12.11'de birinin ilk mail attigi firmanin hatirlatmasi 18.11'de digerine dustu).
-- Kural: firmanin SAHIBI = o firmaya son ilk yazismayi (temas adim 'sorgulama') yapan gorevin atandigi kisi. Ekipli
-- dagitimda (p_atanan dolu) sahibi baska AKTIF ekip uyesi olan firma bu kisiye verilmez; sahibi olmayan (hic yazilmamis)
-- firma eskisi gibi sirayla dagitilir; sahibi ekipte yoksa / pasifse firma herkese acilir. Ekipsiz eski davranis
-- (p_atanan bos) degismez. Diger tum kurallar (gruplar, sira, sessiz gecisi, 3 gun kurali) aynen korunur.

create or replace function public.pazar_gorev_olustur(p_company uuid, p_tarih date, p_adet integer default 6, p_atanan text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sira integer;
  v_kalan integer;
  r record;
begin
  if p_company is null or p_tarih is null then return 0; end if;
  p_adet := least(greatest(coalesce(p_adet, 6), 1), 20);

  -- Hatirlatma 2'den sonra suresi dolanlar -> Sessiz (musteri 30, potansiyel 60 gun bekler)
  update public.pazar_firmalar
     set crm_asama = 'sessiz', sonraki_adim = null,
         bekleme_bitis = p_tarih + case when durum = 'musteri' then 30 else 60 end, updated_at = now()
   where company_id = p_company and crm_asama = 'hatirlatma2' and sonraki_adim is not null and sonraki_adim <= p_tarih;

  select coalesce(max(sira), 0) into v_sira from public.pazar_gorevler
   where company_id = p_company and tarih = p_tarih and atanan is not distinct from p_atanan;
  if v_sira >= p_adet then return v_sira; end if;
  v_kalan := p_adet - v_sira;

  for r in
    with uygun0 as (
      select f.*,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and k.eposta is not null and k.eposta_gecerli) as epostali,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and (k.whatsapp is not null or cardinality(k.telefonlar) > 0)) as telefonlu,
             -- 18.11.2026: firmanin sahibi = son ilk yazismayi (sorgulama) yapan gorevin atanan kisisi
             (select g0.atanan from public.pazar_temaslar t0 join public.pazar_gorevler g0 on g0.id = t0.gorev_id
               where t0.firma_id = f.id and t0.adim = 'sorgulama' and g0.atanan is not null
               order by t0.olusturma desc limit 1) as sahip
        from public.pazar_firmalar f
       where f.company_id = p_company
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.tarih = p_tarih)
         -- Son 3 gunde gorev verilip islenmemis firma tekrar verilmez
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.durum = 'bekliyor' and g.tarih >= p_tarih - 3)
    ), uygun as (
      select u0.* from uygun0 u0
       where p_atanan is null
          or u0.sahip is null
          or u0.sahip = p_atanan
          or not exists (select 1 from public.pazar_ekip e where e.company_id = p_company and e.kod = u0.sahip and e.aktif)
    ), aday as (
      select u.id, 1 as grup,
             case when u.crm_asama = 'sorgulandi' then 'hatirlatma1' else 'hatirlatma2' end as neden,
             u.sonraki_adim::text as anahtar1, ''::text as anahtar2
        from uygun u
       where u.crm_asama in ('sorgulandi', 'hatirlatma1') and u.sonraki_adim is not null and u.sonraki_adim <= p_tarih
      union all
      select u.id, 2, 'siparissiz',
             coalesce(to_char(public.pazar_firma_son_siparis(u.id), 'YYYYMMDD'), '00000000'), u.ad
        from uygun u
       where u.durum = 'musteri'
         and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'siparis', 'ilgilenmiyor')
         and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
         and (u.epostali or u.telefonlu)
         and not public.pazar_firma_aktif(u.id)
      union all
      -- 16.11.2026: fuar ve rehber listesi (kaynak='liste') potansiyelleri KARISIK (sirayla birer): her kaynak kendi
      -- icinde eski siralamayla (son fuar yili, e-posta, telefon, ulkede musterimiz var mi, ad) dizilir.
      select p.id, 3, 'potansiyel',
             to_char(p.kaynak_sira, 'FM000000') || case when p.liste then '1' else '0' end,
             p.ad
        from (
          select q.*, row_number() over (partition by q.liste order by q.sira_anahtari, q.ad) as kaynak_sira
            from (
              select u.id, u.ad, (u.kaynak = 'liste') as liste,
                     to_char(99999 - coalesce((select max(c.yil) from public.pazar_fuar_katilimlari c where c.firma_id = u.id), 0), 'FM00000')
               || case when u.epostali then '0' else '1' end
               || case when u.telefonlu then '0' else '1' end
               || case when u.ulke is not null and exists (select 1 from public.pazar_firmalar m where m.company_id = p_company and m.durum = 'musteri' and m.ulke = u.ulke) then '0' else '1' end as sira_anahtari
                from uygun u
               where u.durum = 'potansiyel'
                 and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'ilgilenmiyor')
                 and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
                 and u.epostali
            ) q
        ) p
    )
    select a.id, a.neden from aday a order by a.grup, a.anahtar1, a.anahtar2 limit v_kalan
  loop
    v_sira := v_sira + 1;
    insert into public.pazar_gorevler (company_id, tarih, firma_id, sira, neden, atanan)
    values (p_company, p_tarih, r.id, v_sira, r.neden, p_atanan)
    on conflict (company_id, tarih, firma_id) do nothing;
  end loop;
  return v_sira;
end;
$$;
