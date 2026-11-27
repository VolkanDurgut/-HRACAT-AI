-- 27.11.2026 · MV SEA BREEZE: liman fişi ANAKANTAR202611TF83971 (17.000 kg) gemiden satış, IE-2026-0025'e dahil (kullanıcı onaylı).
-- İrsaliye henüz yüklenmedi; kayıt liman fişinden girilir.
-- gecmis=true: ic_bildirim_sevk lojistiğe çıkış onayı e-postası KUYRUKLAMAZ (araç 26.11'de zaten çıktı).
do $$
declare e public.ic_is_emirleri%rowtype; f public.ic_gemi_liman_fisleri%rowtype;
begin
  select * into e from public.ic_is_emirleri where is_emri_no = 'IE-2026-0025' and durum = 'acik';
  select * into f from public.ic_gemi_liman_fisleri where fis_kodu = 'ANAKANTAR202611TF83971' and gemi_id = e.gemi_id;
  if e.id is null or f.id is null then return; end if;
  if exists (select 1 from public.ic_sevkler s where s.is_emri_id = e.id and ic_gemi_duz(s.plaka) = ic_gemi_duz(f.plaka) and s.net_kg = f.net_kg) then
    return;
  end if;
  insert into public.ic_sevkler (company_id, is_emri_id, plaka, net_kg, irsaliye_tarihi, elle_duzeltildi, uyarilar, girilen_email, olusturma, gecmis, cikis_zamani)
  values (e.company_id, e.id, f.plaka, f.net_kg, f.cikis, true,
          array['Liman fişinden girildi (' || f.fis_kodu || '). İrsaliye gelince bu kayda işleyin; yeniden eklemeyin.'],
          'execution@unex.com.tr', f.cikis, true, f.cikis);
end $$;
