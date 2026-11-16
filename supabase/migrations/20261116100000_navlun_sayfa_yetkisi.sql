-- 16.11.2026 Navlun Bildirimi AYRI sayfa yetkisi ("navlun").
-- Kullanici: "Yetkilendirme sayfasinda operation hesabi navlun bildirimi sayfasina ulasamiyor."
-- Kok neden: /navlun menu ve sayfa kapisi Kontrol Merkezi yetkisine ("analiz") bagliydi ve Yetkilendirme
-- sayfasinda Navlun Bildirimi diye bir anahtar YOKTU; navlunu acmak icin Kontrol Merkezi de verilmek zorundaydi.
-- Bu migration:
--  1) Navlun verisini okuyan politikalara / RPC'lere ic_sayfa_yetkisi('navlun') eklenir (proformalar / analiz AYNEN kalir).
--  2) Mevcut kullanicilarda erisim DEGISMEZ: navlun = analiz (Kontrol Merkezi'ni goren navlunu da goruyordu).
--  3) operation@unex.com.tr: navlun = true (kullanici talebi).

-- 1) Okuma politikalari
do $$
declare t text;
begin
  foreach t in array array['navlun_acente_hafizasi', 'navlun_acenteler', 'navlun_liman_kurallari', 'navlun_mesajlari', 'navlun_teklifleri', 'sevkiyat_plani'] loop
    execute format('drop policy if exists %I on public.%I', t || '_oku', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((company_id = auth_company_id()) and (ic_sayfa_yetkisi(''proformalar'') or ic_sayfa_yetkisi(''analiz'') or ic_sayfa_yetkisi(''navlun'')))',
      t || '_oku', t);
  end loop;
end $$;

-- RPC'ler: yetki kontrolune 'navlun' eklenir (govde aynen; yalniz kosul genisler)
do $$
declare f text; d text;
begin
  foreach f in array array['navlun_hata_coz', 'yukleme_plani'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if d is null then raise exception '% bulunamadi', f; end if;
    if position('ic_sayfa_yetkisi(''navlun'')' in d) = 0 then
      if position('ic_sayfa_yetkisi(''proformalar'') or ic_sayfa_yetkisi(''analiz'')' in d) = 0 then
        raise exception '% yetki kosulu beklenen bicimde degil', f;
      end if;
      d := replace(d, 'ic_sayfa_yetkisi(''proformalar'') or ic_sayfa_yetkisi(''analiz'')',
                      'ic_sayfa_yetkisi(''proformalar'') or ic_sayfa_yetkisi(''analiz'') or ic_sayfa_yetkisi(''navlun'')');
      execute d;
    end if;
  end loop;
end $$;

-- 2) Mevcut erisimi koru: anahtari olmayan herkes icin navlun = analiz
update public.kullanici_yetkileri
   set sayfa_yetkileri = coalesce(sayfa_yetkileri, '{}'::jsonb)
         || jsonb_build_object('navlun', coalesce((sayfa_yetkileri ->> 'analiz')::boolean, false)),
       updated_at = now()
 where not (coalesce(sayfa_yetkileri, '{}'::jsonb) ? 'navlun');

-- 3) operation@ : Navlun Bildirimi acik
update public.kullanici_yetkileri y
   set sayfa_yetkileri = y.sayfa_yetkileri || '{"navlun": true}'::jsonb, updated_at = now()
  from auth.users u
 where u.id = y.user_id and lower(u.email) = 'operation@unex.com.tr';
