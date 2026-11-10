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
  olunmayan 3 adres eklenmedi). E-postası olmayan 4 müşteri kartı doğru adres bulununca elle tamamlanacak.
- Test: `e2e_pazar.mjs` (PAZAR_TEST=1; 60 kontrol: aktif/siparişsiz, kalan FCL, kart, yetkili, birleştir, ek anahtar).

## 3.3 + 3.4 Günlük "Bugünkü müşteriniz" + görüşme süreci (10.11.2026)

Migration `20261110060000_pazar_gorev.sql`:
- `pazar_firmalar`: `crm_asama` (yeni → sorgulandi → hatirlatma1 → hatirlatma2 → sessiz; sonuç: cevap / teklif /
  siparis / ilgilenmiyor), `sonraki_adim` (hatırlatma günü), `bekleme_bitis` (yeniden sıraya girme), `son_temas`.
- `pazar_temaslar` (görüşme kaydı; `pazar` yetkisine salt okunur, denetimli), `pazar_gorevler` (günlük görev +
  32 haneli token; istemciye HİÇ açık değil), `pazar_gorev_gonderimleri` (günde bir mail kaydı).
- `pazar_gorev_olustur(şirket, tarih, 6)`: önce süresi dolan hatırlatma 2 → Sessiz (müşteri 30, potansiyel 60 gün);
  sıra: (1) hatırlatma günü gelenler, (2) SİPARİŞSİZ müşterilerimiz (son siparişi en eski önce; e-posta ya da telefon
  şart; açık siparişi olan seçilmez), (3) fuar potansiyelleri (son fuar yılı, geçerli e-posta, telefon, müşterimiz
  olan ülke). Son 3 günde işlenmemiş görevi olan firma tekrar verilmez. Aynı gün tekrar çağrı = aynı görevler.
- `pazar_gorev_isle(token, işlem, …)`: "Gönderdim" → sorgulama (+4 iş günü hatırlatma 1) → hatırlatma 1 (+6 iş günü
  hatırlatma 2) → hatırlatma 2 (+10 gün sonra Sessiz). Aynı görevde ikinci gönderim (e-posta + WhatsApp) aşamayı
  ilerletmez. Cevap verdi / Teklif istedi / Sipariş verdi → 30 gün bekler; İlgilenmiyor → 180 gün; Bugün atla → 7 gün
  (hatırlatmadaysa 2 iş günü ertelenir). `pazar_gorev_bilgi` (görev sayfası verisi; bağlantı 3 gün geçerli),
  `pazar_gorev_ozeti` (mail). Hepsi anon / authenticated'a KAPALI; yalnız edge `pazar-gorev` (service_role).

Edge `pazar-gorev` (verify_jwt açık; anon anahtarla çağrılır):
- `{}` = pg_cron: yalnız `PAZAR_GOREV_CANLI=evet` iken, hafta içi, TR 09:00–11:59, şirket başına günde BİR mail.
- `{"test":true}` = bugünün görevlerini oluşturur, "[TEST]" maili YALNIZ test adresine (24 saatte en fazla 5).
- `{"islem":"bilgi"|"isle","token",…}` = görev sayfası.
- Alıcı secret'ları: `PAZAR_GOREV_ALICI` (varsayılan export@ + export2@), `PAZAR_GOREV_CC` (bbt@ + execution@),
  `PAZAR_GOREV_TEST_ALICISI`. Mail: açık İhracat AI teması, "Bugünkü müşteriniz" kartı + yeşil **Başla** + sıradakiler.

Uygulama:
- `app/gorev/[token]` (girişsiz, noindex; AppShell yok): evren arka planı, adım göstergesi, "Ben: export@ / export2@"
  seçimi (tarayıcıda hatırlanır), yetkili seçimi, şablon sekmeleri (konu / gövde düzenlenebilir), **Outlook'ta aç**
  (mailto; CC bbt@ + execution@) → "Gönderdim" onayı, WhatsApp, sonuç düğmeleri, geçmiş, "Yeni müşteriyle devam et".
- `lib/pazar/sablonlar.ts` (saf): müşteri sorgulama M1–M3, potansiyel P1–P3, hatırlatma H1–H2; imza Export Department.
- `lib/pazar/gorev-api.ts`: edge çağrısı. Firma kartında "Görüşme" bölümü (aşama, sonraki hatırlatma, temaslar).
- Yedek: üç tablo `yedekleme-gonder` listesinde ("Pazar (CRM)" grubu).
- `yedekleme-gonder` geri yükleme testi PARÇALI çalışır (bağ kontrollü tablolar tek parçada, diğerleri tablo tablo):
  fuar aktarımı + 7 günlük denetim kaydıyla tek RPC 8 sn sınırına takılıyordu (10.11 deneme: 48/48 birebir).
- Test: `e2e_gorev.mjs` (PAZAR_TEST=1; 34 kontrol). Canlı test 10.11.2026: 6 görev (hepsi siparişsiz müşteri),
  [TEST] maili yalnız test adresine.

Canlıya alma (kullanıcı test mailini ve görev sayfasını onaylayınca): pg_cron `pazar-gorev` (hafta içi sabah, 30 dk'da
bir; edge günde bir gönderir) + secret `PAZAR_GOREV_CANLI=evet`.

## 3.3b Kişiye özel görev + WhatsApp kolaylığı (10.11.2026)

Kullanıcı: "Bugünkü müşteriniz maili export@'a (CC bbt@ + execution@), Harun Bey'e hitaben; export2@ için farklı
müşterilerle aynı sistem, Şafak Bey'e hitaben." Migration `20261110070000_pazar_ekip.sql`:
- `pazar_ekip` (kod, e-posta, hitap, sıra, aktif): görev alan satışçılar. İsimler repoda DEĞİL, veritabanında (SQL ile
  eklendi). `pazar` yetkisine salt okunur.
- `pazar_gorevler.atanan` (ekip kodu): her kişinin AYRI listesi; aynı firma aynı gün iki kişiye verilmez.
  `pazar_gorev_olustur(…, p_atanan)`, `pazar_gorev_ozeti(…, p_atanan)`; `pazar_gorev_bilgi` görev sahibini (`ekip`)
  döner ve "Yeni müşteriyle devam et" yalnız o kişinin listesinde gezer; `pazar_gorev_isle` işleyeni sahibinden yazar.
- `pazar_gorev_gonderimleri.atanan`: günde kişi başına bir mail.
- Edge `pazar-gorev` v2: ekipteki her kişiye ayrı mail ("Günaydın <hitap>"), alıcı kişinin adresi, CC bbt@ + execution@.
  `PAZAR_GOREV_ALICI` artık kullanılmıyor. Test: kişi başına ayrı [TEST] maili (24 saatte en fazla 8).
- Görev sayfası: "Ben" seçimi kalktı (görevin sahibi görünür); şablon imzasında sahibin adresi; WhatsApp numara
  yoksa da açılır (`wa.me/?text=`; kişi WhatsApp'ta seçilir) + "Mesajı kopyala".
- Kendi müşterilerimizde telefon yok: sevkiyat dosyalarında telefon alanı bulunmuyor (24 müşteriden 2'si fuar
  listesinden telefonlu). Kaynak: arşiv mail imzaları (kullanıcı onayıyla toplanacak) ya da firma kartından elle.
- Test: `e2e_gorev.mjs` 38 kontrol (görev sahibi, imza adresi, numarasız WhatsApp, kopyala).
- Bekleyen: `pazar_ekip` yedek listesine 3.5 ile birlikte eklenecek (yedekleme-gonder bir sonraki dağıtımda).

## Sıradaki adımlar

3.5 cevap tespiti: arşiv (unex.execution.arsiv@) yalnız execution@'ın alıcı / CC olduğu mailleri alıyor; görev
mailleri execution@'ı CC'ye eklediği için "tümünü yanıtla" cevapları arşive düşer. Plan: arşiv hesabında Google Apps
Script (10 dk'da bir) → edge'e gelen mailin göndereni / konusu / ilk satırları → yetkili e-postası ya da alan adıyla
firma eşleşir → "Cevap geldi" otomatik kaydedilir, hatırlatma durur; otomatik yanıt (izin / out of office) hatırlatmayı
durdurmaz; "ilgilenmiyor / teklif / sipariş" sınıflaması önerilir · 3.6 Burak Bey ekranı.
