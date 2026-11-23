-- 23.11.2026 PAZAR GOREV - SIPARISSIZ MUSTERIDE SIPARIS RITMI ONCELIGI. Kullanici: "Her gun gorev olarak belirleniyor. O sisteme
-- dahil edemiyor muyuz oncelik olarak." (siparisi olmayan mevcut musteriler export ekibine).
--  - Grup 2 (siparissiz kendi musterimiz) sirasi: pazar_siparis_ritmi durumu (gecikti > zamani geldi > yaklasiyor > erken >
--    veri az), ayni durumda en cok geciken once; sonra eski kural (en eski son siparis).
--  - Yolda ya da yuklemede (ileri ETD'li booking) mali olan musteri siparissiz SAYILMAZ (Pazar sekmesindeki aktif tanimiyla ayni);
--    hatirlatma grubunda da aktif sayilir.
--  - GRUP SIRASI (kuru calistirma: 23.11 gunun 12 gorevinin HEPSI hatirlatmaydi, cogu potansiyel firma; siparissiz kendi
--    musterilerimize sira hic gelmiyordu): 1 kendi musterimizin hatirlatmasi, 2 siparissiz kendi musterimiz (ritim sirali),
--    3 potansiyel firmanin hatirlatmasi, 4 yeni potansiyel. Ertelenen hatirlatma kaybolmaz; sonraki gunlerde sirasi gelir.
--  - Diger kurallar (e-posta / telefon sarti, bekleme, sahiplik, adet) DEGISMEDI. Yama 20261121060000 gibi metin degistirme
--    ile yapilir; beklenen metin yoksa hic uygulanmaz.
do $yama$
declare
  v_def text := pg_get_functiondef('public.pazar_gorev_olustur(uuid,date,integer,text)'::regprocedure);
  v_e1 text := $e$    with uygun0 as ($e$;
  v_e2 text := $e$         and not (u.durum = 'musteri' and (public.pazar_anahtar_eslesir(array_append(u.ek_anahtarlar, u.anahtar), v_acik) or public.pazar_firma_aktif(u.id)))$e$;
  v_e3 text := $e$      select u.id, 2, 'siparissiz',
             coalesce(to_char(public.pazar_firma_son_siparis(u.id), 'YYYYMMDD'), '00000000'), u.ad
        from uygun u
       where u.durum = 'musteri'$e$;
  v_e4 text := $e$      select u.id, 1 as grup,$e$;
  v_e5 text := $e$      select p.id, 3, 'potansiyel',$e$;
begin
  if (length(v_def) - length(replace(v_def, v_e1, ''))) / length(v_e1) <> 1
     or (length(v_def) - length(replace(v_def, v_e2, ''))) / length(v_e2) <> 1
     or (length(v_def) - length(replace(v_def, v_e3, ''))) / length(v_e3) <> 1
     or (length(v_def) - length(replace(v_def, v_e4, ''))) / length(v_e4) <> 1
     or (length(v_def) - length(replace(v_def, v_e5, ''))) / length(v_e5) <> 1 then
    raise exception 'pazar_gorev_olustur beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  v_def := replace(v_def, v_e1, $e$    with ritim as (
      -- 23.11.2026: siparis ritmi (lib/pazar/siparis-ritmi.ts ile ayni hesap; pazar_siparis_ritmi)
      select * from public.pazar_siparis_ritmi(p_company, p_tarih)
    ), uygun0 as ($e$);
  v_def := replace(v_def, v_e2, v_e2 || $e$
         and not (u.durum = 'musteri' and exists (select 1 from ritim rt where rt.firma_id = u.id and (rt.yolda_konteyner > 0 or rt.yuklemede_konteyner > 0)))$e$);
  v_def := replace(v_def, v_e3, $e$      select u.id, 2, 'siparissiz',
             -- 23.11.2026 ritim onceligi: durum sirasi + en cok geciken once (fark yoksa en sona), sonra en eski son siparis
             coalesce((select case rt.durum when 'gecikti' then '0' when 'zamani_geldi' then '1' when 'yaklasiyor' then '2'
                                            when 'erken' then '3' else '4' end
                              || to_char(50000 - coalesce(rt.fark, -49999), 'FM000000')
                         from ritim rt where rt.firma_id = u.id), '5099999')
             || coalesce(to_char(public.pazar_firma_son_siparis(u.id), 'YYYYMMDD'), '00000000'), u.ad
        from uygun u
       where u.durum = 'musteri'
         and not exists (select 1 from ritim rt where rt.firma_id = u.id and (rt.yolda_konteyner > 0 or rt.yuklemede_konteyner > 0))$e$);
  v_def := replace(v_def, v_e4, $e$      select u.id, case when u.durum = 'musteri' then 1 else 3 end as grup,$e$);
  v_def := replace(v_def, v_e5, $e$      select p.id, 4, 'potansiyel',$e$);
  execute v_def;
end $yama$;
