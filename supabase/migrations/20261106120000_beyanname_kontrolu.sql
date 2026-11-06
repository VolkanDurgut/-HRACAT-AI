-- Gumruk beyannamesi yapay zekasiz kontrolu (06.11.2026; lib/beyanname-kontrol.ts).
-- beyanname_kontrol_sonucu: yuklenen beyanname (+ devam listesi) metninin sistemdeki dosya bilgileriyle
--   karsilastirmasi (fatura no / tarih, toplam bedel, konteynerler, net kg, DIIB, gemi, teslim, ulke, alici).
--   Yalniz gosterim; hicbir alani degistirmez.
-- beyanname_devam_dosya_url / _adi: cok kalemli beyannamenin (bolunmus DIIB) "Devam Listesi" PDF'i;
--   ana beyanname ile ayni depo ve klasor ("konsimento-talimatlari/<dosya_id>/beyanname/...").
-- Mevcut kayitlara dokunulmaz (sutunlar bos baslar). RLS / tetikleyiciler tablo duzeyinde oldugu gibi.
alter table public.ihracat_dosyalari
  add column if not exists beyanname_kontrol_sonucu jsonb,
  add column if not exists beyanname_devam_dosya_url text,
  add column if not exists beyanname_devam_dosya_adi text;
