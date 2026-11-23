-- 23.11.2026 PAZAR GUNLUK GOREV - KISI KAPSAMI. Kullanici: "Bizim mevcut musteriler Harun Bey'e gitsin. Potansiyel
-- musterilerimizin takibi yapilsin." Secim: "Musteri -> Harun, Potansiyel -> Safak".
--  - pazar_ekip.kapsam: 'hepsi' (eski davranis, varsayilan) | 'musteri' | 'potansiyel'. export -> musteri, export2 -> potansiyel.
--  - musteri kapsami: TUM kendi musterilerimiz (sahibi kim olursa olsun; hatirlatma + siparissiz) + kendi baslattigi
--    potansiyel yazismalarin hatirlatmasi (yazismayi baslatan bitirir).
--  - potansiyel kapsami: yalniz potansiyel firmalar; baska AKTIF ekip uyesinin baslattigi potansiyel yazismanin
--    hatirlatmasini almaz.
--  - 'hepsi' kapsaminda 18.11 sahiplik kurali aynen. Grup sirasi, ritim onceligi, e-posta / telefon sarti, bekleme, adet
--    DEGISMEDI. Metin degistirme ile yama; beklenen metin yoksa hic uygulanmaz.
alter table public.pazar_ekip add column if not exists kapsam text not null default 'hepsi';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pazar_ekip_kapsam_check') then
    alter table public.pazar_ekip add constraint pazar_ekip_kapsam_check check (kapsam in ('hepsi', 'musteri', 'potansiyel'));
  end if;
end $$;
update public.pazar_ekip set kapsam = 'musteri' where kod = 'export' and kapsam <> 'musteri';
update public.pazar_ekip set kapsam = 'potansiyel' where kod = 'export2' and kapsam <> 'potansiyel';

do $yama$
declare
  v_def text := pg_get_functiondef('public.pazar_gorev_olustur(uuid,date,integer,text)'::regprocedure);
  v_e1 text := $e$  v_acik text[];
$e$;
  v_e2 text := $e$  v_acik := public.pazar_acik_siparis_anahtarlari(p_company);
$e$;
  v_e3 text := $e$      select u0.* from uygun0 u0
       where p_atanan is null
          or u0.sahip is null
          or u0.sahip = p_atanan
          or not exists (select 1 from public.pazar_ekip e where e.company_id = p_company and e.kod = u0.sahip and e.aktif)
$e$;
begin
  if (length(v_def) - length(replace(v_def, v_e1, ''))) / length(v_e1) <> 1
     or (length(v_def) - length(replace(v_def, v_e2, ''))) / length(v_e2) <> 1
     or (length(v_def) - length(replace(v_def, v_e3, ''))) / length(v_e3) <> 1 then
    raise exception 'pazar_gorev_olustur beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  v_def := replace(v_def, v_e1, v_e1 || $e$  v_kapsam text;
$e$);
  v_def := replace(v_def, v_e2, v_e2 || $e$  -- 23.11.2026: kisinin kapsami (pazar_ekip.kapsam); ekipsiz / bilinmeyen kisi -> hepsi
  if p_atanan is not null then
    select e.kapsam into v_kapsam from public.pazar_ekip e where e.company_id = p_company and e.kod = p_atanan and e.aktif;
  end if;
  v_kapsam := coalesce(v_kapsam, 'hepsi');
$e$);
  v_def := replace(v_def, v_e3, $e$      select u0.* from uygun0 u0
       where case v_kapsam
               when 'musteri' then u0.durum = 'musteri'
                                or (u0.sahip = p_atanan and coalesce(u0.crm_asama, '') in ('sorgulandi', 'hatirlatma1'))
               when 'potansiyel' then u0.durum = 'potansiyel'
                                and (u0.sahip is null or u0.sahip = p_atanan
                                     or coalesce(u0.crm_asama, '') not in ('sorgulandi', 'hatirlatma1')
                                     or not exists (select 1 from public.pazar_ekip e where e.company_id = p_company and e.kod = u0.sahip and e.aktif))
               else (p_atanan is null
                     or u0.sahip is null
                     or u0.sahip = p_atanan
                     or not exists (select 1 from public.pazar_ekip e where e.company_id = p_company and e.kod = u0.sahip and e.aktif))
             end
$e$);
  execute v_def;
end $yama$;
