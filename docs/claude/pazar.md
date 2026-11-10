# PAZAR (UNEX Satış) CRM

Strateji belgesi: Claude Doc "İhracat AI · Kasım Strateji Belgesi" (Dalga 3, P-paketleri). Bu dosya
uygulanmış olanı anlatır.

## Kullanıcı kararları (10.11.2026)

- Menüde **Kontrol Merkezi'nin hemen altında**, "UNEX Satış" personel satış paneli. Yetki: `pazar`
  (yalnız yetkiliye görünür; soluk/kilitli hali yok). Yetki YALNIZ execution@ ve bbt@ (kullanıcı 10.11.2026);
  export@ / export2@ sayfaya girmez, onlara "Bugünkü müşteriniz" wizard maili gider (3.3).
- "POTANSİYEL MÜŞTERİLERİ AYRI TUTMALISIN. ONLARIN DA SİPARİŞLERİNE GÖRE CRM OLMALI."
  → `pazar_firmalar.durum` = `potansiyel` | `musteri`. Sipariş (ihracat dosyası / ana sipariş) açılan alıcı
  otomatik `musteri`; sipariş verisi KOPYALANMAZ, `alici_adi` ile okunur.
- Fuar Excel'i (Gulfood; her sayfa bir dönem) uygulamadan yüklenir. Ülke: Excel'den, yoksa telefon kodundan.
  Ücretsiz; yapay zekâ YOK.
- Gerçek müşteri verisi repoda / kodda / testlerde DURMAZ (repo herkese açık). Testler kurgusal dosyayla.

## 3.1 Veri altyapısı + fuar listesi içe aktarma (10.11.2026)

Migration `20261110040000_pazar_crm.sql`:
- `pazar_anahtar(ad)`: birleştirme anahtarı (Türkçe harf → ASCII, büyük harf, LTD/LLC/SARL/GENERAL/TRADING/
  IMPORT/EXPORT… atılır, boşluksuz). TEK kaynak: istemci önizlemede `pazar_anahtarlar(text[])` RPC'siyle
  aynı anahtarı alır (TS kopyası yok).
- Tablolar: `pazar_firmalar` (unique company_id+anahtar), `pazar_kisiler` (e-posta, `eposta_gecerli`,
  `telefonlar[]`, `whatsapp`), `pazar_fuar_katilimlari` (unique firma_id+etiket), `pazar_ice_aktarimlari` (kayıt).
  RLS: yalnız SELECT (`pazar` yetkisi + aynı şirket). Yazma yalnız RPC / tetikleyici.
- `pazar_fuar_aktar(dosya_adi, firmalar jsonb)`: tek işlem; tekrar yüklemek güvenli (kişi e-posta → telefon →
  ad ile birleşir, katılım tekrarlanmaz). Müşteri firmanın adı/durumu değişmez, yalnız kişi/fuar eklenir.
- `trg_pazar_dosya` / `trg_pazar_ana_siparis` → `pazar_musteri_isaretle()` (hata verirse yalnız uyarı;
  dosya / sipariş kaydı bozulmaz). Migration mevcut alıcıları ilk dosya tarihiyle müşteri yaptı.
- Yedek: dört tablo `yedekleme-gonder` listesinde.

Uygulama:
- `lib/xlsx-oku.ts`: genel tarayıcı Excel okuyucu (jszip + DOMParser; etd-excel.ts ile aynı yöntem, ona dokunulmadı).
- `lib/pazar/fuar.ts` (saf): başlık metninden sütunlar (MÜŞTERİ ADI / YETKİLİ / TELEFON / MAIL / ÜLKE),
  sayfa adı + başlık üstü metinden fuar / yıl / ay (`Gulfood 2023 Kasım`), ülke (`lib/ulke-bul` + ek yazımlar
  ve şehirler: DUBAİ, JEBEL ALİ, KARACHI, KIGALI…; "SOMALİ // ETİYOPYA" → ilk ülke), telefon ayırma
  (`//`, `/`, "WHATSAP :" → WhatsApp), e-posta (Türkçe "ı" → "i" düzeltmesi; bozuk olan kaydedilir,
  "düzeltilmeli"), telefon kodu → ülke. Türkiye: `05xx…`, `0212…` ve 0'sız 10 haneli `5xx…` (+53 Küba /
  +55 Brezilya sanılmasın); `.tr` e-posta → Türkiye (`ulke_kaynagi = eposta`). 10 haneden kısa numaradan ülke tahmini yok.
- `app/pazar/page.tsx`: özet kartları, Tümü / Potansiyel / Müşteri, arama (firma, yetkili, e-posta, telefon),
  ülke filtresi (bayraklı), fuar dönemleri. `components/pazar/fuar-yukle.tsx`: önizleme (yeni / mevcut /
  müşteriyle eşleşen / bozuk e-posta / ülkesi telefondan / ülkesiz / uyarılar) → "Aktar".
- Gerçek Gulfood dosyası (yerel kontrol, 10.11.2026): 6 sayfa, 728 satır → 689 firma (20'si birden çok
  fuarda), 718 kişi, 20 bozuk e-posta; ülke Excel 377 / telefon-e-posta 279 / bulunamayan 33.
- Bilinen sınır: adı farklı yazılmış müşteri eşleşmez (ör. kısaltılmış ya da eksik yazılmış firma adı);
  elle bağlama 3.2 müşteri kartında.
- Test: `e2e_pazar.mjs` (PAZAR_TEST=1; kurgusal `pazar/test_fuar.xlsx`), `pazar/test_fuar.mts` (birim; gerçek
  dosya yalnız yerelde).

## 3.2 Müşterilerimiz kartı + firma kartı (10.11.2026)

Kullanıcı: "Bizim kendi müşterilerimiz farklı bir kartta olmalı; yanında şu an siparişleri var mı yok mu
görebilmeliyiz. Mevcut siparişi yoksa export adresine ilk bunlardan başlamalıyız."
"Proforma kesilen firmayı müşteri sayayım mı?" → **"Hayır, rezervasyon girildikten sonra müşteri sayabilirsin."**

Migration `20261110050000_pazar_musteri_karti.sql`:
- Müşteriye dönüşüm artık **rezervasyon** ile: `trg_pazar_rezervasyon` (rezervasyonlar insert / dosya_id) ve
  `trg_pazar_dosya_alici` (rezervasyonlu dosyada alıcı adı değişirse). Dosya / ana sipariş açılması tek başına
  müşteri yapmaz (eski `trg_pazar_dosya`, `trg_pazar_ana_siparis`, `pazar_siparis_tetik` kaldırıldı).
- `pazar_firmalar.ek_anahtarlar`: birleştirilmiş (farklı yazılmış) adlar. `pazar_firma_bul()` ana + ek anahtarla
  arar; fuar aktarma ve müşteri işaretleme bunu kullanır (birleştirilen ad bir daha ayrı kayıt olmaz).
- RPC (hepsi `pazar` yetkisi): `pazar_musteri_siparisleri()` (müşterilerin dosya / rezervasyon / açık dosya
  konteynerleri (DBA var/yok) / tamamlanmamış ana siparişleri; salt okunur), `pazar_firma_guncelle` (ülke, not),
  `pazar_kisi_kaydet` (yetkili ekle / düzelt; silme yok), `pazar_firma_birlestir` (kaynak → hedef, kaynak silinir).
- Uygulama: `lib/pazar/musteri.ts` (saf) → **Aktif** = rezervasyonlu açık dosya ya da sevk edilmemiş miktarı olan
  ana sipariş (`lib/siparis-takip` ile aynı hesap); **Siparişsiz** = müşteri ama şu an siparişi yok (en uzun süredir
  siparişsiz önce; 3.3 günlük mailin ilk adayları). Ülke kartta yoksa varış limanı / alıcı adresi (Kontrol Merkezi kuralı).
- `app/pazar/page.tsx`: üstte "Müşterilerimiz" (Siparişsiz / Aktif / Tümü), altta "Potansiyel müşteriler".
  `components/pazar/firma-karti.tsx` (sağdan panel): sipariş durumu + geçmişi, yetkililer, fuarlar, ülke / not,
  birleştir. Arama Türkçe "I/ı" sorununa karşı `toLocaleLowerCase("tr-TR").replace(/ı/g, "i")`.
- Arşivden (unex.execution.arsiv@) 20 müşteriye 38 yetkili e-postası eklendi (10.11.2026, kullanıcı onayıyla; emin
  olunmayan 3 adres eklenmedi). E-postası olmayan: Boulangerie Farid, Riviera Biscuit, Mohamed Ilmi Koumane, Ste Ayra.
- Test: `e2e_pazar.mjs` (PAZAR_TEST=1; 60 kontrol: aktif/siparişsiz, kalan FCL, kart, yetkili, birleştir, ek anahtar).

## Sıradaki adımlar

3.3 "Bugünkü müşteriniz" maili (yalnız export@, CC bbt@ + execution@;
test sensei) + Başla ekranı · 3.4 üç insan sesli şablon + WhatsApp ilk mesaj (Outlook ile) · 3.5 arşivden
cevap tespiti · 3.6 Burak Bey ekranı (yalnız Volkan Bey ve Burak Bey).
