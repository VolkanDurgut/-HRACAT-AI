# Sipariş Defteri + Sevkiyat Planı (Dalga 4) — Claude notları

> 10.11.2026'da başladı. Gerçek müşteri / fiyat verisi REPODA YOK (repo herkese açık); yalnız veritabanında.

## 4.1 Şema + 2026 aktarımı (10.11.2026)

Kullanıcı: "Sipariş listesi her halükârda sisteme eklenmeli ve DİİB gibi otomatik mail gönderilmeli." Yöntem C:
önce Excel'den TEK SEFERLİK aktarım (export'un sipariş listesi + operasyonun yükleme planı), sonra sistem ana kaynak.
"Sadece kontrol merkezindeki raporu 1 yıllık güncel tutalım." Belge yüklenmez; geçmiş yalnız veri.
- Migration `20261110120000_siparis_defteri.sql`: `siparis_defteri` (proforma bazında satır; `kaynak_anahtar` =
  proforma|bl|sıra → aktarım tekrar çalıştırılabilir; durum `onay_bekliyor | on_odeme_alindi | rezervasyonlu |
  sevk_edildi | bl_eksik | iptal`) ve `sevkiyat_plani` (booking bazında; hafta, acente, liman, ekipman, cut-off'lar
  [YEREL saat UTC etiketiyle, rezervasyonlar ile aynı kural], ETD, gemi/sefer, `siparis_id` / `rezervasyon_id` /
  `dosya_id` bağları, konteyner başı `navlun_kont` / `lokal_kont` + kaynak). İstemciye SALT OKUNUR
  (`proformalar` veya `analiz` yetkisi). Yazma yalnız servis / SECURITY DEFINER.
- Aktarım (yerelden SQL, veri repoda yok): 189 sipariş (sipariş listesindeki blok sırası durumu verir: BL'li →
  sevk_edildi, BL'siz → bl_eksik, "ön ödemesi alınmış" → on_odeme_alindi, "ön ödemesi alınmamış" → onay_bekliyor;
  toplam MT Excel ile birebir) + 222 booking (1 tekrar eden booking tek satır).
- Bağlar: sistemdeki 40 rezervasyonun 40'ı plana bağlandı; 146 plan satırı siparişe (sipariş BL alanı "a, b"
  çoklu olabilir); 38 sipariş dosyaya. Sistem dosyalarındaki navlun / lokal 35 bookinge `dosya` kaynağıyla taşındı
  (navlun ile lokal masrafı yer değiştirmiş görünen 3 açık dosya TAŞINMADI; kullanıcıya soruldu).
- DERS: aynı tabloyu tek sorgunun iki CTE'sinde güncelleme → ikinci güncelleme sessizce atlanır; ayrı sorgu.
  Çok ifadeli çağrıda bir ifade hata verirse hepsi geri alınır.
- Sıradaki: `/siparisler` sayfası + Excel'e aktar, 17:00 Sipariş Raporu (execution@, bbt@, export@, export2@; fiyat
  görünür), yedeğe yeni tablolar, Kontrol Merkezi 12 ay.

## 4.3 Otomatik Sipariş Listesi + Yükleme Planı (11.11.2026) — Adım 2-3
Kullanıcı: "Sipariş formu ile yükleme planının otomatik ve hatasız hazırlanabilmeli; sonra raporlayabilmeliyiz."
Ön ödeme: "Sipariş listesinde ön ödeme girilebilsin" → elle girilen TEK alan.
- İlke: KOPYA YOK. Migration `20261110160000_siparis_listesi_otomatik.sql` (+ `20261110170000_siparis_listesi_duzeltme`,
  `20261111090000_siparis_benzer_daralt`, hepsi CANLIDA): `siparis_listesi_veri(company)` ve `yukleme_plani_veri(company)`
  her okumada hesaplar. Kaynaklar: Excel geçmişi (`siparis_defteri`, `sevkiyat_plani`) + `proformalar` (Proforma Oluştur)
  + `ihracat_dosyalari` (Proforma Yükle) + `rezervasyonlar`. Kullanıcı sarmalayıcıları `siparis_listesi()` /
  `yukleme_plani()` ("proformalar" veya "analiz"); `_veri` fonksiyonları yalnız servis (17:00 raporu).
- Eşleşme: `siparis_anahtar()` = boşluksuz, büyük harf, sondaki revize eki (`…051126R`) atılır. Excel satırı dosyaya:
  önce `dosya_id`, sonra BL no, sonra tek eşleşen proforma. Aynı sipariş iki kez görünmez.
- Durum (canlı): iptal (Excel) > ETD geçti: BL / draft BL varsa `sevk_edildi`, yoksa `bl_eksik` > rezervasyon var:
  `rezervasyonlu` > ön ödeme işareti: `on_odeme_alindi` / `onay_bekliyor` (işaret yoksa Excel'deki değer).
- Bölünmüş sevkiyat: konteyner Excel satırından; boş ürün / fiyat / tutar dosyadan tamamlanır.
- "Olası tekrar" (`benzer`): SİSTEMDE yeni kesilmiş proforma ile Excel'deki sevk edilmemiş sipariş aynı müşteri kodu
  (UNEX+3 harf) ve aynı miktarda ise uyarı; sistem BİRLEŞTİRMEZ, export karar verir.
- Yükleme planı: rezervasyona bağlı satırda gemi / ETD / cut-off / konteyner / acente REZERVASYONDAN (operasyon
  değiştirince plan da değişir); Excel'de olmayan yeni rezervasyon otomatik satır olur. Hafta: lojistiğin kuralı
  (1. hafta = 1-7 Ocak), istemcide ETD'den hesaplanır (`planHaftasi`); SQL'deki `hafta` sütunu yalnız yedek.
- Ön ödeme: `siparis_on_odemeler` + `siparis_on_odeme_isaretle(proforma_no, alindi)` ("proformalar"); yalnız
  rezervasyon öncesi satırlarda değiştirilebilir.
- Sayfa `/siparisler` "Sipariş Listesi" (menü: Proforma Yükle altında, yetki "proformalar"): özet kartları (açık / onay /
  ön ödeme / rezervasyonlu / BL eksik / olası tekrar), iki sekme, durum filtreleri, arama, ön ödeme kutusu, Excel indir
  (iki sayfa; export ve operasyon Excel'iyle aynı başlıklar + Durum / Ön ödeme / Dosya / Booking / ETD; plan hafta
  bloklu; sevk edilen satır yeşil). Kod: `lib/siparis/{liste,veri,xlsx}.ts`. Test: e2e_siparis 36 (kurgusal).
- Canlı kontrol (11.11.2026): 194 sipariş satırı (189 Excel + 5 sistem proforması; AQI revizesi birleşti), 222 plan
  satırı; yetkili kullanıcı okuyabiliyor, yetkisiz "Yetkiniz yok."; 2 olası tekrar çifti (SBH, VHH) gösteriliyor.
- Sıradaki (Adım 4): 17:00 Sipariş Raporu maili (execution, bbt, export, export2; fiyatlar görünür; Excel eki);
  ilk gönderim YALNIZ test adresine.

## 4.4 Yükleme Planı — Excel'den içeri aktarma (11.11.2026)
Kullanıcı: "Yükleme planını Excel ile içeri aktar yapılsın. ETD raporundaki gibi. Başlıklar birebir aynı olsun."
- Migration `20261111100000_yukleme_plani_excel_aktar.sql` (CANLIDA): `sevkiyat_plani` + `kalemler` (jsonb; booking
  altındaki ikinci ürün satırı), `hafta_baslik` (Excel'deki başlık aynen), `sira`; `sevkiyat_plani_aktarimlari` (kim / ne
  zaman / sayılar); `booking_anahtar()`; `yukleme_plani_aktar(dosya_adi, satirlar)` ("proformalar"; tek işlem; hiçbir
  kayıt silinmez; Excel'de boş hücre sistemdeki değeri silmez; rezervasyon / dosya / navlun alanlarına dokunmaz;
  bağlantısız satırı aynı booking'li rezervasyona bağlar). `yukleme_plani_veri` artık kalemler / hafta_baslik / sira
  döndürür; Excel satırında hafta Excel'deki haftadır.
- Okuma TARAYICIDA (`lib/siparis/plan-excel.ts`, jszip): yıl sayfası, hafta başlığı satırı, 16 başlık başlık METNİNDEN,
  alt başlık satırı atlanır; booking satırının altındaki satır = cut-off saatleri + sefer (+ varsa ikinci kalem; en
  fazla 3 devam satırı). Aynı booking dosyada iki kez → tek booking, konteynerler toplanır, uyarı. "." / "," artıkları
  yok sayılır. Okunamayan tarih → uyarı, değer gönderilmez.
- Önizleme (`components/plan-excel-aktar.tsx`): yeni / değişecek (alan alan eski → yeni) / aynı / sistemde olup
  dosyada olmayan (dokunulmaz) / uyarılar → "Aktar".
- Görünüm ve Excel indir: operasyonun dosyasıyla birebir 16 başlık + alt başlık (BOŞ EKİPMAN / GEMİ KALKIŞ / SEFERİ;
  KON.AD. altında haftalık toplam), her booking iki satır. Navlun / lokal / dosya no plan görünümünden çıkarıldı.
- Hafta kuralı (Excel WEEKNUM(;1)): Pazar başlar, 1. hafta 1 Ocak'ı içeren hafta (2026: 46. hafta = 08-14 Kasım).
  Excel satırında Excel'in haftası; Excel'de olmayan rezervasyonda ETD'den bu kuralla.
- Canlı kontrol: gerçek dosya 222 booking; mevcut kayıtlarda 22 booking'in ikinci kalemi eksikti (konteyner az);
  geri alınan kuru çalıştırmada iki örnek booking'in konteyneri doğru düzeldi. İlk gerçek aktarımı kullanıcı yapar.
- Test: e2e_siparis 48 (kurgusal `plan_ornek.xlsx`), yerel Postgres'te RPC senaryoları (yetki, tekrar, şirket ayrımı).

## 4.5 Sipariş Listesi — Excel'den içeri aktarma (11.11.2026)
Kullanıcı: "Sipariş listesi içinde aynı şeyi yapmalıyız. Excel yükleyebilmeliyiz."
- Migration `20261111110000_siparis_listesi_excel_aktar.sql` (CANLIDA): `siparis_listesi_aktar(dosya_adi, satirlar)`
  ("proformalar"; tek işlem; satırda `id` → o kayıt güncellenir, yoksa yeni kayıt [kaynak_anahtar `aktarim:<uuid>`];
  boş hücre silmez; `iptal` durumu değişmez; dosya bağı ve ön ödeme işaretlerine dokunmaz) + `siparis_defteri_aktarimlari`.
- Okuma (`lib/siparis/siparis-excel.ts`, ortak okuyucu `lib/siparis/xlsx-oku.ts`; satır dolgu rengi de okunur): başlık
  satırı "Proforma … Paketleme" (sistemin Excel indir çıktısı da okunur). Durum: YEŞİL satır + BL → sevk_edildi, yeşil
  BL yok → bl_eksik, yeşil değil + BL → rezervasyonlu, "ÖN ÖDEMESİ ALINMIŞ" bölümü → on_odeme_alindi, "ALINMAMIŞ" →
  onay_bekliyor. Tutar formülü yoksa fiyat × miktar. Sayı olmayan fiyat → uyarı, boş gönderilir.
- Eşleşme İSTEMCİDE (önizleme = yazılan): proforma anahtarı (boşluksuz, büyük harf, sondaki revize "R" yok) +
  1) aynı BL, 2) ikisinde BL yok, 3) aynı miktar + konteyner, 4) Excel sırasına en yakın. Eşleşmeyen sistem kaydı
  "dosyada yok" olarak listelenir, SİLİNMEZ.
- Tablo: export Excel'iyle birebir 11 başlık + sistem sütunları (Durum, Ön ödeme, Dosya / Booking).
- Canlı kontrol: export'un 10.11 dosyası 189 satır → 0 yeni, 9 değişecek (yeşil olmayan, booking'li 8 satır
  "sevk edildi" → "rezervasyonlu" düzeltmesi + 1 revize proforma no), 180 aynı; geri alınan kuru çalıştırma doğru.
- Test: e2e_siparis 59 (kurgusal `siparis_ornek.xlsx`), yerel Postgres'te RPC senaryoları.

## 4.6 Sipariş akışı: bölümlü liste + ön ödeme TUTARI + planda "rezervasyon alınmadı" (11.11.2026)
Kullanıcı: "Export proforma oluşturuyor; durumu boş. Ön ödeme gelince TUTAR yazarak 'ön ödeme alındı' işaretleyecek;
kayıt yükleme planına ve sipariş listesine otomatik dahil edilecek, rezervasyonu olmadığı için 'rezervasyonu alınmadı'
diye ilerleyecek." Excel'deki bölümler + "en güncel en altta".
- HATA (bizim): Excel aktarımı "ÖN ÖDEMESİ VEYA ONAYI ALINMAMIŞ" başlığını tanımadı → 11 sipariş yanlışlıkla
  on_odeme_alindi oldu; canlıda geri alındı (guncelleyen = "duzeltme: aktarim bolum hatasi (11.11)"). Okuyucu: karar
  "ÖN ÖDEMESİ"nin hemen ardındaki kelimeyle ("ALINMIŞ- … REZERVASYON ALINMAMIŞ" alınmış bölümüdür).
- Migration `20261111120000_siparis_akisi_on_odeme_tutar.sql` (CANLIDA): `siparis_on_odemeler` + tutar / para_birimi;
  `siparis_on_odeme_kaydet(proforma, alindi, tutar, para, tarih)` (alındı için tutar > 0 zorunlu; eski
  `siparis_on_odeme_isaretle` geri uyum için duruyor); `siparis_listesi_veri` + on_odeme_tutar / on_odeme_para ve
  "yalnız proforma ile dosyaya bağlama" artık YALNIZ proformanın Excel'de tek satırı varsa (bölünmüş sevkiyatta bekleyen
  parça sevk edilmiş parçanın dosyasına bağlanıyordu); `yukleme_plani_veri` + kaynak `siparis` satırları (ön ödemesi
  alınmış, rezervasyonu olmayan).
- Ekran: 3 bölüm (+ varsa iptal) — üst "REZERVASYONU ALINAN VE SEVK EDİLEN" (sevk edilenler katlanır, yeşil),
  "ÖN ÖDEMESİ ALINMIŞ- ONAYLI PROFORMA FAKAT HENÜZ REZERVASYON ALINMAMIŞ…", "ÖN ÖDEMESİ VEYA ONAYI ALINMAMIŞ"; bölüm
  başlığında adet / MT / konteyner / tutar; her bölümde eski → yeni. Bekleyen satırda "Ön ödeme alındı" → pencere
  (tutar, para birimi, tarih); alınmış satırda tutar + tarih, "Geri al" (iki adımlı), tutarı olmayan eski kayıtta
  "Tutar gir". Ön ödeme sütunu tablonun sağına sabit. Plan: en üstte "REZERVASYON ALINMADI — ÖN ÖDEMESİ ALINMIŞ
  SİPARİŞLER" bloğu. Excel indir: aynı bölüm başlıklarıyla (geri okunabilir; iptal bölümü aktarılmaz).
- Canlı kontrol: 26 ön ödemesi alınmış (export listesiyle birebir), 16 onay bekleyen (11 Excel + 5 sistem proforması),
  plan +26 "rezervasyon alınmadı"; geri alınan kuru çalıştırma (tutarsız reddedilir → işaret → planda → geri al) doğru.
- Test: e2e_siparis 65.

## 4.7 Ekrana sığan listeler + "güncel" plan görünümü + Sipariş Raporu maili (11.11.2026)
Kullanıcı: "Listeler ekrana sığmalı… sağa kaydırmak zorunda kalıyoruz." / "Tamamlanan son 5 sevkiyat ve güncel kaldığımız
yeri ve ilerisini gösteren bir şey olmalı." / "Sipariş listesi için mail raporlama yapılmalı. İlk başta test adresiyle."
- Tablolar `table-fixed` + yüzde genişlik; iki bilgi tek hücrede üst üste (Ürün / Marka · Paketleme, Liman / BL NO; planda
  16 başlığın hepsi 10 görsel sütunda). Masaüstünde yatay kaydırma yok; yalnız mobilde `overflow-x-auto`.
- Plan "Güncel" (varsayılan): `planGorunumu()` → rezervasyon alınmadı bloğu + "TAMAMLANAN SON 5 SEVKİYAT" (ETD geçmiş son 5)
  + bu hafta ve sonrası. ETD'si boş + haftası geçmiş eski satırlar (ör. Excel'de tarihi okunamayan 2. / 20. hafta) yalnız
  "Tüm yıl"da. Ön ödeme işaretlenince plan CANLI hesaplandığı için anında güncellenir (kopya yok).
- Saf mantık TEK YERDE (web + edge ortak): `supabase/functions/_shared/siparis-liste.ts`, `siparis-xlsx.ts`, `xlsx-yaz.ts`
  (zip'siz XML çekirdek). `lib/siparis/liste.ts`, `lib/siparis/xlsx.ts` yalnız yeniden dışa aktarır; `lib/xlsx-yaz.ts`
  çekirdeği jszip ile paketler.
- Mail: edge `siparis-rapor` + `_shared/siparis-rapor.ts`; migration `20261111130000_siparis_rapor.sql` (CANLIDA):
  `siparis_rapor_gonderimleri` (şirket + gün tek zamanlanmış kayıt) + pg_cron `siparis-rapor` hafta içi 14:00 UTC.
  İçerik: 4 kutu, bugün ön ödemesi işaretlenenler, ön ödemesi alınmış (rezervasyon bekleyen), onay bekleyen (fiyat/tutar
  ile), rezervasyonlu sevk bekleyen, önümüzdeki 14 gün yükleme planı. Ek: sayfadaki "Excel indir" ile AYNI dosya.
  `SIPARIS_RAPOR_CANLI` = "evet" olmadıkça YALNIZ test adresine "[TEST]" gider; canlı alıcılar `SIPARIS_RAPOR_ALICI`
  (kullanıcı onayı olmadan açılmaz). İlk test gönderimi 11.11.2026'da yapıldı.
- Konşimento talimatı: karma ambalajda ("1.000 PIECES OF 25 KG … & 200 PIECES OF 30 KG …") baştaki adet artık toplam kapla
  DEĞİŞTİRİLMEZ (`cokluAmbalaj`); Türkçe "1.000 ADET 25 KG ÇUVALLARDA & 200 ADET 30 KG ÇUVALLARDA".
- Navlun Bildirimi: sağda kare kutularda "yeni bilgi" paneli (son görülme tarayıcıda), kutuya tıklayınca limana gider.
- Test: e2e_siparis 67, e2e_navlun 42 (+ e2e 46, yetki 38, rehber 22, kılavuz+vgm 44, pazar 80, görev 50).

## 4.8 Planda booking'i olan sipariş = "rezervasyonlu" (13.11.2026)
Kullanıcı: "Her şey tablolar, veritabanı ve mailler ile birebir uyuşmalı." Sorun: yükleme planında booking'i alınmış ama
plan satırı siparişe bağlanmamış (`siparis_id` boş) siparişler "ön ödeme alındı / rezervasyon bekliyor" görünüyordu;
navlun raporu bunu rapor içinde müşteri + liman eşleştirmesiyle düşüyordu ve aynı proformadaki BAŞKA siparişin booking'ini
de sayarak gerçekten bekleyen siparişi yanlışlıkla düşürebiliyordu.
- Migration `20261113010000_siparis_plan_rezervasyon_eslesme.sql` (CANLIDA): `siparis_firma_anahtar()`,
  `siparis_liman_anahtar()` (PORT/LİMANI atılır, virgülden önce; SINGAPUR→SINGAPORE, CIBUTI→DJIBOUTI, MALDIVES→MALE);
  `siparis_listesi_veri` yeniden yazıldı: siparişe BAĞLI plan satırları önce kendi siparişini kapatır; bağlanmamış,
  dosyası açılmamış, ETD'si bugün / ileride (ETD boşsa haftası bu hafta / ileride) booking'li plan satırları firma + liman
  anahtarına göre toplanır; ön ödemesi alınmış siparişler ön ödeme tarihi → proforma sırasıyla, kümülatif konteyner bu
  kapasiteyi aşmadıkça "rezervasyonlu" olur. Booking no / ETD yalnız tek booking varsa doldurulur.
- Sayfa, sipariş raporu ve navlun raporu AYNI veritabanı kuralını görür; `_shared/navlun-tablosu.ts`'teki rapor içi
  düşüm kaldırıldı (edge navlun-tablosu v14).
- Navlun raporu ayrıca: aynı ayda gerçekleşen navlun hücreyi alsa da teklif "en iyi" hesabında kalır (`teklifler`);
  acente / hat adları İngilizce büyük harf ("LINK", "LİNK" değil).

## 4.9 Gece veri yedeği: sıkıştırılmış ek + eksik tablolar (13.11.2026)
JSON ~10 MB'ı aşınca (mail ~14 MB) Resend kabul etse de yedek maili alıcıya ulaşmıyordu (son ulaşan 10.11). Edge
`yedekleme-gonder` v47: ek artık `.zip` (DEFLATE 9; içinde aynı JSON), sınır sıkıştırılmış boyuta uygulanır. Sipariş,
plan, navlun, fatura onayı ve rapor gönderim tabloları yedeğe eklendi; `rapor_alicilari` + `rapor_adres_defteri` ayar
tablosu. `scripts/yedekten-geri-yukle.mjs` .zip okur; listede olmayan tabloları paket sırasıyla yükler.

## 4.10 Sipariş raporu: "Onaylı · Rezervasyonu Alınmamış Müşteriler" (13.11.2026)
Kullanıcı: "Sipariş raporunda onaylanmış ama rezervasyonu alınmamış müşteriler özette gösterilmeli."
`_shared/siparis-rapor.ts` `rezervasyonBekleyenTablosu`: "Günün Özeti" kutusunda 4 göstergenin altında; kaynak
`on_odeme_alindi` bölümü (4.8 kuralıyla planda booking'i olan sipariş burada görünmez). Aynı müşteri + aynı liman tek
satır (sipariş adedi), konteyner, en eski ön ödeme tarihi ve bekleme günü (14+ gün kırmızı; tarihi girilmemiş eski
kayıtlar "tarih yok", en altta). Edge siparis-rapor v6 (repo ile birebir). Rapor hâlâ test modunda.

## 4.2 Navlun formu → KALDIRILDI; yerine Navlun Bildirimi (10.11.2026)

- Elle girişli navlun formu kuruldu (migration `20261110130000_navlun_formu.sql`, edge `navlun-formu`) ve kullanıcı
  itirazıyla AYNI GÜN kaldırıldı: "Formu birisi doldurmayacak, form maillerden güncellenecek. Bizim doldurabileceğimiz
  bir alan olmamalı; sistem yalnız hatayla karşılaşınca müdahale edebileceğimiz bir alan olmalı." → migration
  `20261110140000_navlun_formu_kaldir.sql` (tablo + 4 fonksiyon drop); edge `navlun-formu` 410 "kullanım dışı" (panelden
  silinebilir). Formdan HİÇ veri yazılmadı. Sayfa / istemci kodu hiç yayına çıkmadı. GERİ EKLENMEZ.
- Kalan veri düzeltmesi (kullanıcı onayı): IHR-2026-0113 / 0114 / 0115'te navlun ile lokal masraf yer değiştirmişti →
  takas edildi (faturası / talimatı olmayan dosyalar; CI navlunu buradan okur), plana da yansıdı.
- Kullanıcının asıl istediği: "Hangi şirketin nereye ne kadar navlun verdiği; sürekli kendini güncel tutan bir navlun
  bildirimi." Kaynak: operation@'ın acentelere sorduğu "UNEX // <LİMAN> // NAVLUN TALEBİ HK." yazışmaları (execution@
  CC → arşiv Gmail). Teklif biçimleri: kısa metin ("Usd 875/20dc · Cma"), yapılandırılmış metin (MSC POL/POD/VALIDITY,
  Horoz, K+N), PDF ek (Link, K+N). Hedef fiyat yazışması ("Hedef mevcut mudur?") ve kabul ("Navlun rakamı 1800 Usd
  olmak üzere … rezervasyon talebimiz") da okunacak. Arşiv 26.10.2026'dan beri dolu; öncesi için execution@ kutusundan
  Gmail'e tek seferlik içe aktarma (Apps Script `tara` eski tarihli mailleri işlemez: `after:` + mail tarihi kontrolü).

### 4.2.1 Okuyucu: `supabase/functions/_shared/navlun-oku.ts` (10.11.2026)
- Saf fonksiyonlar, yapay zekâ yok. `navlunMesajOku(mesaj, acenteler)` → olaylar: `teklif`, `karsi_teklif`
  ("X usd destek olabilirim"), `hedef` (bizden "Hedef rakamı X"), `hedef_soru`, `hedef_kabul` ("Hedefiniz uygundur"),
  `kabul` (bizden "Navlun bedeli X olmak üzere … booking"), `servis_yok`, `yer_yok`, `ek_teklif` (fiyat PDF/görselde).
- Acente alan adı → ad tablosu REPODA YOK (üçüncü taraf bilgisi); canlıda DB'den parametre olarak verilecek.
- Ayıklananlar: masraf/ceza/KDV'li tutarlar (ör. "Usd 50+Kdv VGM geç bildirim"), rezervasyonu alınmış işin operasyon
  yazışmaları (konu `B<no> //`, "Rezervasyonunuz alınmıştır", "föy ektedir"), liman/terminal gönderenleri.
- Test (yalnız test ortamı, arşivin 26.10–10.11 arası 60 yazışması / 192 mesaj / 88 acente mesajı): 33 fiyat olayı
  (31 teklif + 2 karşı teklif), 6 hedef, 2 kabul, 1 hedef kabulü, 5 servis/yer yok, 12 "fiyat ekte"; kalan 37 acente
  mesajında fiyat yok (bekleme, soru, föy, ekipman). Bilinen eksik: Kuehne+Nagel fiyatı her zaman görsel+PDF'te,
  Link çoğunlukla PDF'te → canlıda Apps Script PDF metnini çıkarıp aynı okuyucuya verecek.

### 4.2.2 Canlı akış (10.11.2026)
- Migration `20261110150000_navlun_bildirimi.sql` (CANLIDA): `navlun_acenteler` (alan adı → ad; veri yalnız DB'de,
  11 acente), `navlun_mesajlari` (Message-ID tekil; durum okundu / bilgi / okunamadi / duzeltildi / yoksayildi),
  `navlun_teklifleri` (olaylar). İstemciye salt okunur ("analiz" veya "proformalar"). `navlun_kaydet` yalnız servis;
  aynı mail yeniden gelirse olayları yenilenir, elle çözülmüş maile dokunulmaz. `navlun_hata_coz` (authenticated +
  yetki): okunamayan maile elle fiyat (kaynak 'elle') ya da yoksay = TEK müdahale alanı.
- Edge `navlun-bildirimi` (v1, verify_jwt; anahtar = PAZAR_GELEN_ANAHTAR, başlık `x-pazar-anahtar`): `kaydet` /
  `durum`. İşleme `_shared/navlun-isle.ts`: fiyat metinde yoksa Apps Script'in gönderdiği ek metni (PDF ya da en
  büyük görselin Drive OCR'ı) okunur; ekten çıkan fiyat ekipman başına TEK değilse (belirsiz) → okunamadi.
  Liman/terminal ve bilinmeyen gönderen kaydedilmez; bizden fiyatsız yazışma kaydedilmez.
- Apps Script `docs/apps-script/navlun.gs`: Pazar betiğiyle AYNI proje (ANAHTAR/ANON ortak), "Drive API" hizmeti
  (OCR için). `navlunGecmis` (26.10'dan bugüne, "BITTI" yazana kadar tekrar), `navlunKur` (15 dk tetikleyici).
- Sayfa `/navlun` "Navlun Bildirimi" (menü: Operasyon; yetki "analiz", yalnız yetkiliye görünür): liman kartları
  (son hareket önce), en iyi 20'DC, hedefimiz, kabul edilen, acente × armatör × ekipman son fiyat, rozetler (karşı
  teklif, hedefi kabul, lokal dahil, PDF'ten / görselden / elle), fiyatsız durumlar (servis yok, yer yok, fiyat ekte),
  arama. Özet: `lib/navlun/ozet.ts` (saf). Test: e2e_navlun 39 + yetkisiz 3 (kurgusal veri).
- İlk canlı okuma (10.11.2026 22:00) sonrası düzeltme (edge v2): ekten okunan bazı tutarlar yanlıştı (K+N PDF'inde
  180 = yan masraf, Draft föy ekindeki 50, MSC genel tarife "WAF & RELAY" konusu, ONE'da gövdedeki POD "USNYC").
  Kurallar: ek YALNIZ mail metni "teklif ekte / aşağıdaki gibidir" diyorsa okunur; ekte fiyat ancak "freight / navlun /
  ocean / all in" kelimesinin yanında ve yan masraf kodu (THC, BL, ISPS, VGM…) değilse kabul; konudaki liman esas;
  genel tarife (&'li konu) liman sayılmaz; ek metni denetim için `ozet`'e yazılır. Yeniden okuma: betik özelliği
  NAVLUN_GECMIS_I silinip navlunGecmis tekrar çalıştırılır (idempotent; kayıtlar yenilenir).
- Edge v3 (11.11.2026): (1) bilinen teklif formları ekten doğrudan okunur (`ekFormuOku`): K+N tipi
  "Ambarli M → X Port → Port … 20GE … Rate Total USD n" (çok rotalı olabilir; rota başına farklı FT varsa armatör/FT
  boş bırakılır) ve Link tipi "Tahliye Limanı … HERŞEY DAHİL TAŞIMA FİYATI 0 n USD"; form tanınmazsa eski sıkı okuma.
  (2) Tabloda olmayan alan adı "NAVLUN TALEBİ" konulu mailde açıkça teklif / servis yok / hedef sorusu yazarsa
  `navlun_acenteler`'e otomatik eklenir (ad: bilinen armatör adı, yoksa alan adı etiketi; kişisel posta, bizim alan,
  pasife alınmış alan adı öğrenilmez). (3) Betik: görsel ekte en büyük 3 görsel sırayla OCR'lanır, bizim imza/logo
  (unex.com.tr) atlanır, fiyat içermeyen görsel gönderilmez.
- Edge v4 (11.11.2026): kullanıcı "bazı destinasyonlar yok" → geçmiş okuma 26.10'dan başlıyordu; 26.10 öncesi biten
  yazışmalar (ör. Beyrut, Cape Town) hiç okunmamıştı → betikte NAVLUN_ILK_TARIH = 2026/09/01 (arşivin tamamı).
  Konudaki booking listesi ("TEMA // … //277… + 277…") liman sanılıyordu → yok sayılır (liman TEMA).
- Navlun Tablosu (11.11.2026): kullanıcı "operasyonun navlun tablosu şablonunda, mevcut bilgilerimizle Excel indir + test
  maili". Şablon: satır = liman (B PORT), C HEDEF, acente / hat başına blok (2. satırda birleşik ad), blokta fiyat alınan
  aylar + TRANSIT + FREE TIME; D4'ten donmuş. Saf: `_shared/navlun-tablosu.ts` (web `lib/navlun/tablo.ts` + edge
  `navlun-tablosu` AYNI dosya). Kaynak: `navlun_teklifleri` (teklif / karşı teklif / hedef kabul; hedef; free time) +
  yükleme planındaki gerçekleşen navlun (konteyner başı, ETD ayı; Excel'de YEŞİL KALIN). Hücre = o ayın SON 20'DC fiyatı
  (20'DC yoksa "40HC n $" metin; USD dışı para metin). Ad eşleri yalnız bu tablo için (KUEHNE/K+N, CMA, HAPAG, MAAERSK,
  ZİM, AKKON LINES, ONE LINE; plan "DRAFT/CMA" = "DRAFT - CMA-CGM"). TRANSIT maillerden henüz OKUNMUYOR (sütun boş).
  Edge `navlun-tablosu` (verify_jwt): yalnız `{test:true}` / yönetici `{deneme:true}`; mail YALNIZ test adresine
  ("[TEST]"), şirket başına 24 saatte 5; zamanlanmış gönderim YOK. Migration `20261111140000_navlun_tablosu.sql`
  (CANLIDA): `navlun_tablosu_gonderimleri`. Sayfa: "Excel indir" + "Test maili" (oturumlu, yönetici değilse 403).
  `_shared/xlsx-yaz.ts`: stiller 15-27 (navlun) SONA eklendi + `dondur`; mevcut stil numaraları değişmedi (siparis-rapor
  edge'i bir önceki, çıktısı aynı çekirdekle çalışıyor; bir sonraki deploy'da eşitlenir). İlk test maili 11.11.2026
  (29 liman, 28 acente/hat). Test: e2e_navlun 60.
- Free time + transit + ham metin (11.11.2026, kullanıcı: "free time otomatik çekilebilmeli; raporu 1 kere hatasız
  dolduralım"): migration `20261111150000_navlun_transit_govde.sql` (CANLIDA) — `navlun_teklifleri.transit_gun` ("35" /
  "46-48"), `navlun_mesajlari.govde / ek_metin / ek_kaynak` (istemciye KAPALI: tablo SELECT yerine kolon SELECT),
  `navlun_kaydet` metni saklar; elle düzeltilmiş maile yalnız metin + BOŞ free time / transit (`ek_bilgi`) eklenir.
  Okuyucu: `freeTimeBul` + DEM / demuraj / "gün serbest" / "free days" (≤60; "serbest süre 6 saat" ELENİR), `transitBul`
  ("Transit süre 46-48 gün", "TT: 85-105 gün", "Transit time 35 days", "T/T", "seyir süresi", Link "Tahmini Transit
  Süre : 28"; gün birimi zorunlu, metinde farklı birden fazla değer = belirsiz), Horoz dikey tablosunda "ORTALAMA
  TRANSİT SÜRE" sütunu. Edge `navlun-bildirimi` v5: `{"islem":"yeniden_isle","sayfa":n}` saklanan metinden 50'şer
  yeniden okur (okuyucu geliştikçe betik gerekmez). Arşiv testi (259 mesaj): Draft tekliflerinin çoğunda free time /
  transit YAZILMIYOR — boş hücre = acente belirtmemiş (uydurulmaz). Sayfa: "Transit" sütunu, Hedef'in açıklaması.
  TEK SEFERLİK: eski mailler metni saklanmadan okunduğu için betikte NAVLUN_GECMIS_I silinip navlunGecmis "BITTI"
  yazana kadar çalıştırılır (yeni mailler 15 dk tetikleyiciyle zaten metinle gelir).
- Günde iki rapor (11.11.2026, kullanıcı: "güncel navlun excelinin ve sipariş raporunun her gün sabah 08.00 ve 17.00
  raporlanması; alıcılar bbt / execution / export / export2; navlun raporunda her raporda en son alınan rakamlar"):
  `_shared/rapor-oturum.ts` (sabah 07:55–09:00 / akşam 16:55–18:00 penceresi, `oturumAdi`). Migration
  `20261111170000_gunluk_raporlar_iki_oturum.sql` (CANLIDA): `oturum` kolonu; sipariş tekilliği şirket + gün + oturum
  (elle hariç), navlun tekilliği şirket + gün + oturum (elle ve test hariç); pg_cron `siparis-rapor-sabah/aksam`,
  `navlun-tablosu-sabah/aksam` (05:00 / 14:00 UTC); eski `siparis-rapor` işi kaldırıldı. Edge `navlun-tablosu` v3:
  anon `{}` yalnız pencerede; `NAVLUN_TABLOSU_CANLI=evet` + `NAVLUN_TABLOSU_ALICI`, değilse "[TEST]" yalnız test adresine;
  mailde "Son rapordan beri gelen teklifler" (önceki gönderimden sonra; ilk raporda son 48 saat) + en iyi tablosunda
  "Son gelen teklif" sütunu (YENİ rozeti). Edge `siparis-rapor` v2: oturum etiketi, "Her gün 08:00 ve 17:00".
  İlk akşam (11.11 17:00) iki rapor da test modunda yalnız test adresine gitti. Canlıya alma: secret'lar
  `SIPARIS_RAPOR_CANLI=evet`, `SIPARIS_RAPOR_ALICI`, `NAVLUN_TABLOSU_CANLI=evet`, `NAVLUN_TABLOSU_ALICI` (kullanıcı girer).
- Rapor mailleri sadeleşti (11.11.2026, kullanıcı: "çok uzun; Kontrol Merkezi'ndeki gibi Otomatik Özet; ekte yalnız
  Excel; tek sayfa"): ortak kabuk `_shared/rapor-kabugu.ts` (başlık + "Otomatik Özet" maddeleri + isteğe bağlı sıkı tablo +
  düğme + dipnot). Sipariş raporu: yalnız 4–7 cümle (açık sipariş / ön ödemeli bekleyen / onay bekleyen / 14 gün yükleme /
  BL eksik / bugün ön ödeme / olası tekrar), tüm satırlar ekte. Navlun raporu: 5 cümle + TÜM limanların tek satırlık sıkı
  tablosu (`limanSatirlari`: son 60 günde her acentenin son 20'DC'si içinde en düşük; yoksa en son teklif gri; FT, TT, hedef,
  son gelen + YENİ). Edge'ler: siparis-rapor v3, navlun-tablosu v4, musteri-ozet-rapor v2 (yeni Excel eki).
- Rapor Alıcıları (11.11.2026): Ayarlar > Rapor Alıcıları (`app/ayarlar/raporlar`, yalnız süper admin). Migration
  `20261111190000_rapor_alicilari.sql` (CANLIDA): `rapor_alicilari` (şirket + rapor: alıcılar ≤6, canlı), RPC
  `rapor_alicilari_liste` / `rapor_alicilari_kaydet` (`yetki_super_admin_sirketi`). Edge'ler `_shared/rapor-alici.ts` ile
  tabloyu okur; satır yoksa eski secret'lar. Canlı ama alıcısız = test. Sayfada Önizle (deneme: mail göndermez, HTML iframe
  sandbox) ve Test maili (yalnız test adresi). Test: e2e_rapor_alici 20.
- Canlı Navlun Haritası + Liman Masası (11.11.2026, kullanıcı: "Navlun Bildirimi açıldığında canlı harita karşılasın;
  liman isimleri, sağda liste + arama, aranan dışındakilerin ışığı sönsün; limana tıklayınca acenteler + chat şeklinde
  navlunlar + navlun raporu önde"): `lib/navlun/harita.ts` (saf: konum + es adlar BEYRUT→BEIRUT, BINGAZI→BENGHAZI…,
  nokta durumu hedefte/üstünde/hedef yok/fiyat yok, grup sohbeti, acente listesi), `components/navlun/navlun-haritasi.tsx`
  (Kontrol Merkezi harita dili: deniz rotaları Mersin çıkışlı, nabız atan noktalar, sağda liste + arama, Enter ilkini açar),
  `components/navlun/liman-masasi.tsx` (önde açılan pencere: rapor kutuları + fiyat merdiveni + acenteler + sohbet;
  "yazıyor…" animasyonu, atla, hareket azaltmada anında, Esc). `analiz-harita.tsx` yalnız `etiketYerlestir` dışa açıldı.
  `lib/liman-koordinat.ts`: BOSTON, SAN JUAN; `lib/deniz-rotasi.ts` LIMAN_GIRISI: SAN JUAN / LA GUAIRA → KARAYIP_KD,
  BOSTON → ATLANTIK_O, VICTORIA → GUARDAFUI. Sohbet = okunan olaylar (mail metninin tamamı değil). Test:
  e2e_navlun_harita 37 (HARITA_TEST=1 ANALIZ_TEST=1), e2e_navlun 66 + 3.
- Sıradaki: gerçek akış başladıktan sonra okunamayan oranı izlenir (PDF biçimleri öğrenilir); "fiyattan rezervasyon
  başlat"; Kontrol Merkezi'ndeki gerçekleşen navlun (dosyalar) ile teklif karşılaştırması.
- 11.11.2026 akşam (2. revize):
  - Sipariş raporu: "Otomatik Özet" yerine **Gelen Ön Ödemeler** tablosu (Müşteri · Konteyner · Varış limanı + toplam);
    akşam raporu bugünü, sabah raporu dün + bugünü gösterir (`onOdemePenceresi`). Bölümden bağımsız (aynı gün
    rezervasyonu alınan da sayılır). Excel eki aynı. Edge `siparis-rapor` v4.
  - Müşteri özeti raporu kaldırıldı (bkz. pazar.md 3.8).
  - Navlun: çıkış yalnız Ambarlı / Asyaport (harita + Liman Masası başlığı); okuyucunun POL'ü yalnız `AMBARLI` /
    `ASYAPORT` (`polNormal`), eski yanlış değerler migration ile düzeltildi. Edge `navlun-bildirimi` v6, `navlun-tablosu` v5
    (yalnız ortak `rapor-alici` / `rapor-kabugu` eşitlemesi).
  - Navlun sayfası: liman kartı başlığında "En iyi 20'DC / Hedefimiz / Kabul edilen" etiket | değer ızgarası (alt alta,
    hizalı); sayfa ortalı (`mx-auto`).
  - Rapor Alıcıları: liste başına en fazla 10 adres; Fatura Talimatı Onayı ve Onaylı Fatura Talimatı listeleri eklendi
    (bkz. ihracat.md "Fatura Talimatı Onayı").
- 12.11.2026 (revize-1112c):
  - Siparişler sayfasında **Sil**: Proforma hücresinde çöp kutusu (yalnız `proformalar` sayfa yetkisi). Excel satırı
    (`excel:`) ve dosyası açılmamış sistem proforması (`proforma:`) silinebilir; dosyası açılmış satır silinmez (önce dosya).
    RPC `siparis_satiri_sil(p_anahtar)` (migration `20261112100000_siparis_satiri_sil.sql`, security definer,
    `ic_sayfa_yetkisi('proformalar')`); anahtarda başka satır kalmazsa `siparis_on_odemeler` kaydı da temizlenir.
    Onay penceresi + bilgi mesajı. Test: e2e_siparis_sil 11.
  - Sipariş raporu: üstte **Günün Özeti** 4 gösterge kutusu (`yoneticiOzeti`): Açık sipariş (kont · MT · tutar),
    Ön ödemeli (rezervasyon bekliyor, en eskisi kaç gün), 14 gün yükleme (booking · kont · ilk ETD), Dikkat (BL eksik +
    14+ gündür onay bekleyen + olası mükerrer). Altında gelen ön ödemeler tablosu. Edge `siparis-rapor` v5.
  - Navlun raporu: "Otomatik Özet" kutusu kaldırıldı (`ozetYok`), tabloya **Anlaşılan** sütunu (bizden giden son kabul).
    Okuyucu kabulü "Anlaşma fiyatımız X usd" yazımını da tanır. Edge `navlun-tablosu` v6, `navlun-bildirimi` v7.
- 12.11.2026 (revize-1112d):
  - **Navlun raporu = Navlun Satın Alma Listesi** (`navlunSatinAlma`, `_shared/navlun-tablosu.ts`): yükleme planında booking'i
    alınmış, ETD'si bugün / ileride (ETD'siz ise haftası bu hafta / ileride) her yükleme; navlun kaynağı dosya / plan, yoksa
    acenteye yazılan son kabul ("anlaşma") maili (aynı liman, hat uyumlu, ETD'den önce, ≤90 gün); yoksa "bilgi yok" (tahmin
    yok). Liman adı `/navlun?liman=X` bağlantısı (o limanın masası açılır; giriş sonrası dönüş `lib/giris-donus.ts`), düğme
    "Diğer navlun fiyatları". Excel: 1. sayfa satın alma listesi, 2. sayfa operasyonun navlun tablosu. Edge `navlun-tablosu` v7.
  - Navlun okuyucu: free time yükleme tarafı kuralı ("Export detention ETD – 14 gün", "boş alım … 14 gün free time") SAYILMAZ;
    "kontrat 14 free" okunur; imzadan sonra yazılan "FT 5 DAYS" notu ekli teklife taşınır. 150 mesaj `yeniden_isle` ile yeniden
    okundu (ör. yanlış 14 gün FT düzeldi, eksik 14 gün FT geldi). Edge `navlun-bildirimi` v8.
  - Rapor Alıcıları sayfası yeniden tasarım (`app/ayarlar/raporlar`): 11 mail türü tek ekranda, Alıcı + CC, adres defteri
    (`rapor_adres_defteri`), migration `20261112110000_rapor_alicilari_cc.sql` (CANLIDA). Aşamalı geçiş (`RaporTanimi.etkin`):
    navlun + müşteri durum = Alıcı + CC; sipariş, fatura onay / dağıtım = Alıcı (CC sonraki dağıtımda); günlük ihracat, DİİB, VGM,
    konşimento hatırlatma, pazar görev, satın alma = "Sabit" (sunucudaki alıcılar görünür, düzenleme sonraki dağıtımda; o
    edge'lerin CC değişikliği hazır, dağıtılmadı). Test: e2e_rapor_alici 53.
  - Müşteri Durum Raporu (edge `musteri-durum-rapor` v1, `_shared/musteri-durum.ts`): siparişi onaylı her müşteriye İngilizce
    durum (fiyat / navlun yok). Şimdilik yalnız yönetici önizleme + [TEST] maili (yalnız test adresi); canlı gönderim kapalı.
- 12.11.2026 (revize-1112e): Navlun raporu iki başlık: üstte **Satın Alınan Navlunlar** (müşteri sütunu eklendi), altta
  **Rezervasyon Bekleyen Müşteriler** (ön ödemeli, booking'siz siparişler: müşteri, varış limanı, konteyner, limanın güncel en iyi
  20'DC teklifi + acentesi). Düğme "Navlun Evreni" (/navlun). Ek tek Excel: "UNEX NAVLUN SATIN ALMA LİSTESİ · <tarih>.xlsx"
  (bekleyenler aynı sayfada ayrı başlıkla; operasyonun navlun tablosu sayfadaki "Excel indir"de). Edge `navlun-tablosu` v8.
  Alıcı doğrulaması: `rapor_alicilari`ndaki kayıtlar son gerçek gönderimlerin alıcılarıyla birebir (günlük ihracat, DİİB, VGM,
  konşimento, pazar görev); alıcı değişmedi.
- 12.11.2026 (revize-1112f) Navlun raporu doğrulaması (kullanıcı: "Bu bilgiler doğru mu, mailleri okudun mu?"): 16 booking arşiv
  mailleriyle tek tek karşılaştırıldı. Anlaşma kaynaklı satırlar doğru: Tema 1450 $ (operation 21–22.10 "Navlun bedeli 1450 usd …
  Polar Ecuador / Leda Maersk"; ilk booking 22.11, diğer ikisi 29.11 gemisine kaydırıldı), Mutsamudu
  4900 $ (bbt 05.11, 13 kont / 6 booking), Mombasa Akkon 1800 $ (operation 05.11 rezervasyon formu). Eksik: Djibouti (Akkon booking)
  — operasyonun "UNEX // DJIBOUTI // N*20 DC // REZERVASYON TALEBİ HK." maillerinde "Navlun rakamı 1850 Usd olmak üzere" yazıyor ama
  konu "NAVLUN" içermediği için okunmuyordu. Düzeltme: edge `navlun-bildirimi` v9 konu "REZERVASYON TALEBİ" olan mailleri de kabul
  eder; konudaki "8*20 DC" parçası liman sayılmaz; `docs/apps-script/navlun.gs` arama sorgusu `subject:(navlun OR "rezervasyon talebi")`
  (arşiv hesabındaki betik güncellenip `navlunGecmis` bir kez çalıştırılmalı).
- 12.11.2026 (revize-1112h) Booking eşleştirmesi (kullanıcı onayı 15:03): arşiv geçmiş taraması tamamlandı (rezervasyon talebi
  mailleri okundu); elle girilmiş geçici Mutsamudu kaydı kullanıcı onayıyla silindi (gerçek kabul maili mevcut). Satın alma listesinde
  navlunu dosya / planda olmayan booking için anlaşma maili seçim önceliği: (1) booking no'nun geçtiği yazışmadaki kabul
  (`navlun_mesajlari.konu`; RE/FW ve booking parçaları atılmış konu = yazışma anahtarı), (2) aynı liman + aynı konteyner adetli
  "REZERVASYON TALEBİ" kabulü (konudaki "N*20 DC"), (3) aynı limandaki son kabul. Hepsinde ETD'den önce, en fazla 90 gün önce, hat
  uyumlu. Satıra eşleşme türü yazılır (mail: "anlaşma · booking / rez. / liman"; Excel KAYNAK sütunu). Edge `navlun-tablosu` v10.
  Sınır: acentelerin booking teyit mailleri (konu yalnız booking no) okunmuyor; tam booking bağlantısı için ayrı bir okuma akışı
  (gelecek faz) gerekir.
- 12.11.2026 (revize-1112i) Canlıya geçiş öncesi gerçek veriyle önizleme: "Rezervasyon Bekleyen Müşteriler" booking'i alınmış
  siparişleri de gösteriyordu (sipariş listesindeki durum booking alınınca hemen değişmiyor). Düzeltme yalnız raporda: aynı müşteri
  (harf/rakam dışı atılmış ad) + aynı limanda listede booking'i olan sipariş, booking konteyner adedi kadar bekleyenden düşülür ve
  başlıkta "N sipariş (M kont.) booking'i üstte olduğu için düşüldü" yazar. Aynı müşteri + liman tek satır ("11 sipariş"). Güncel
  teklifi olmayan limanda son anlaşma fiyatı gösterilir ("son anlaşma · tarih"). `yukleme_plani_veri` değişmedi. Edge v11.
- 12.11.2026 (revize-1112j) CANLIYA GEÇİŞ (kullanıcı: "Raporu canlıya alalım. Rapor gönderimi her gün 17.00. Alıcılar bbt,
  operation, execution, export, export2"): `rapor_alicilari` navlun satırı (5 alıcı, CC yok, canlı). `navlun-tablosu-sabah` cron
  işi pasif (`cron.alter_job(18, active := false)`; geri açmak için `active := true`). Mail dipnotu ve Ayarlar'daki saat "Her gün
  17:00". Son dakika verisinde konteyner adedi boş sipariş de (aynı müşteri + liman booking'i varsa) bekleyenden düşülür. Edge v13.
- 13.11.2026 (revize-1113b) Kaçan teklif — kök neden: acentenin teklif maili sistem/arşiv kapsamı başlamadan (≈16.10.2026) önce
  gelmişse ya da arşive hiç düşmemişse, teklif yalnız sonraki yazışmaların ALINTISINDA kalıyor; betik ve okuyucu alıntıyı
  bilerek kesiyordu, teklif hiç kaydedilmiyordu. Çözüm 1 (alıntıdan kurtarma): `docs/apps-script/navlun.gs` alıntılı tam gövdeyi
  ayrı `alinti` alanında da gönderir (ilk 30.000 karakter); edge `navlun-bildirimi` v10 `_shared/navlun-alinti.ts` (saf) ile
  alıntıyı bloklara ayırır (Outlook From/Sent/Subject + Kimden/Gönderildi/Konu, Gmail "… yazdı:" / "On … wrote:"), yalnız
  ACENTE blokları, üst mailden ESKİ tarihliler okunur; `mesajIsle` "okundu" dönerse `alinti:<hash>` kimliğiyle kaydedilir
  (aynı blok farklı maillerde aynı kimlik → tekrar yok). Aynı gönderen ±4 saat içinde aynı gövde imzasıyla zaten kayıtlıysa
  (asıl mail gelmişse) atlanır. Özet: "Alıntıdan kurtarıldı: … (asıl mail arşive ulaşmamış)". Alıntı saati +03:00 kabul edilir.
  Kurtarma hata verirse normal kayıt ETKİLENMEZ (try/catch). Çözüm 2 (FT/TT tamamlama): acentenin ayrı "bilgi" mailindeki
  free time / transit time, aynı acente + limanın son 7 gündeki teklifinde alan BOŞSA doldurulur (`yeniden_isle` de yapar).
  Arşiv betiği güncellenip `NAVLUN_GECMIS_I` silinerek `navlunGecmis` "BITTI" yazana kadar çalıştırılınca geçmiş yazışmaların
  alıntıları da taranır.
- 13.11.2026 (revize-1113c) Geçmiş taraması sağlaması (10 alıntı kaydı tek tek okundu) + "tt" okuma:
  - Hatalar: bir hattın genel tarifesindeki "$200 PSS artışı" başka limanın fiyatı sanılmış; bir acentenin "USD 2000 .-/20'dv" teklifi 40'lığa
    yazılmış, "IMO lokal farkı USD 165" 20'lik fiyat sanılmış; iki alıntı kaydı, aynı teklifin doğrudan gelen asılının
    çifti (alıntı başlığındaki alt satıra taşan alıcı listesi gövde imzasını bozmuştu).
  - Okuyucu (`_shared/navlun-oku.ts`): "fiyat .-/20'dv" ekipmanı; fiyattan hemen önce "farkı / IMO / PSS / GRI / VGM / telex /
    OBL / etiket / artışı" ya da hemen sonra "PSS / GRI / artış / zam / fark" geçen tutar navlun DEĞİL. Transit: etiket ile sayı
    arasında dolgu kelime ("tt ise 44 gün", "TT tahmini olarak 60 gibi", "tahmini minimum TT 90", "Transit süremizi 50/55 gün");
    açık etikette (tt, t/t, transit time / süre) gün birimi zorunlu değil, yalnız "transit" kelimesinde zorunlu; "Ödeme: TT 30
    gün" ve "TT 14 gün free" transit sayılmaz. Free time: "5 gün standard free".
  - Alıntı korumaları (edge `navlun-bildirimi` v12, `alintiKontrol`): yalnız fiyatlı teklif; aynı acente + liman + tutar ±4 saat
    içinde başka kayıtta varsa atlanır; konudaki liman metinde geçmiyor ve 3+ farklı fiyat varsa (genel tarife) atlanır. Alıntı
    başlığında alt satıra taşan adres listesi başlığa dahil. Yeniden işlemede kurala uymayan alıntı kaydı "bilgi"ye çekilir
    (olayları silinir, kayıt + metin kalır, not: "Alıntı kayda alınmadı: <neden>"); FT/TT tamamlama alıntı kayıtlarından yapılmaz.
  - Yeniden işleme sonrası tüm kayıtlar önceki görüntüyle satır satır karşılaştırıldı: yalnız yukarıdaki düzeltmeler + 3 teklifin
    boş FT / TT alanı (ayrı "bilgi" mailinden) doldu; diğer tüm kayıtlar aynı.
- 13.11.2026 (revize-1113c) Gece yedeği: EK YERİNE GİRİŞ GEREKTİREN LİNK (kullanıcı kararı). Zip'li mail de (~1,2 MB) execution@
  kutusuna ulaşmadı (diğer raporlar ulaşıyor → kurumsal sunucu .zip ekini karantinaya alıyor). Migration
  `20261113140000_yedek_indirme.sql`: özel kova `veri-yedekleri` (public=false, yalnız application/zip, politika YOK),
  `yedek_kayitlari.dosya_yolu / dosya_bayt`, `yedek_indirmeleri` (kim / ne zaman indirdi), RPC `yedek_listesi()` ve
  `yedek_indirme_izni(id)` (ikisi de `yetki_super_admin_sirketi()` ile yalnız süper admin). Edge `yedekleme-gonder` v48: zip
  `<yıl>/ihracat-ai-yedek-GG-AA-YYYY.zip` olarak depoya, mailde ek yok, "Yedeği indir" düğmesi → `/ayarlar/yedekler`; depoya
  yüklenemezse eski yol (ek + uyarı); 30 günden eski zip'ler depodan silinir (kayıt kalır). Yeni edge `yedek-indir`: kullanıcının
  tokeniyle izin RPC'si → 120 sn imzalı link (CORS yalnız ihracatasistanim.com). Sayfa: Ayarlar > Veri Yedekleri (son 60 gece,
  indirme sayısı). Sağlama: deneme modu 72 tablo / uyarısız / düğme var; anonim ve oturumsuz indirme isteği reddedildi.

## 4.11 Haftalık Toplu Navlun Tablosu — Cumartesi 09:00 (13.11.2026)

> **KALDIRILDI (13.11.2026 19:01).** Kullanıcı: "Haftalık navlun maili kaldırılsın. Navlun satın alma ile beraber sadece
> exceli gitsin." + "Her gün". Toplu navlun tablosu (`Navlun_Tablosu_GG.AA.YYYY.xlsx`, Navlun Bildirimi › Excel indir ile
> aynı) artık her gün 17:00 navlun mailinin İKİNCİ EKİ (birincisi UNEX NAVLUN SATIN ALMA LİSTESİ). `{"haftalik": true}` 410
> döner; pg_cron `navlun-tablosu-haftalik` pasif (active=false, silinmedi); Ayarlar › Rapor Alıcıları'ndan satır kaldırıldı
> (veritabanındaki `navlun_haftalik` satırı kullanılmıyor, silinmedi). Aşağısı tarihçe.
Kullanıcı: "Toplu navlun Excel cumartesi günleri gönderilecek 09.00 (navlun satın alma değil; bütün navlunların olduğu, Navlun
Bildirimi sayfasındaki Excel indir kısmı). İlk önce test gönder, onaylarsam canlıya geçireceğiz."
- Edge `navlun-tablosu` `{"haftalik": true}`: ek = `navlunTablosuSayfasi` (sayfadaki "Excel indir" ile aynı dosya, ad
  `Navlun_Tablosu_GG.AA.YYYY.xlsx`), gövde = kısa mektup (kullanıcı: "Sayın Unex Ekibi, Haftalık navlun tablosu ektedir. İyi
  çalışmalar. Sadece Excel; şablon konşimento talimatı uyarısındaki gibi" → `navlunHaftalikHtml`). Anon yalnız Cumartesi
  08:55-10:00 TR; tekrar koruması `oturum = 'haftalik'`. Günlük raporun "YENİ" hesabı haftalık gönderimi saymaz.
- Alıcı: Ayarlar › Rapor Alıcıları "Haftalık Navlun Tablosu" (`rapor_alicilari.rapor = 'navlun_haftalik'`; kurulumda günlük
  navlun alıcılarının kopyası, CANLI KAPALI → zamanlanmış gönderim de yalnız test adresine "[TEST]"). Önizle / Test o satırdan
  (`RaporTanimi.govde = {haftalik: true}`).
- Migration `20261113160000_navlun_haftalik.sql`; pg_cron `navlun-tablosu-haftalik` `0 6 * * 6` (komut günlük işten türetilir).

## 4.12 Navlun karşılaştırma + acente hafızası (13.11.2026 gece)

Kullanıcı: "Beyrut navlununun yanlış gözükmesi beni çırak çıkarttı. Bunu kökten çözmeliyiz ... acenteleri gruplara ayır,
ilettiği mesajları hafızaya al. Kendi kendini geliştiren bir sistem olmalı."

- **Sorun:** "en iyi" yalnız tutara bakıyordu. Evergreen "USD 340 + lokaller" (lokal 356) Beyrut'ta en iyi ve hedefte
  (600) göründü; gerçek 696 (MSC'nin gerçekleşen 700'üyle başa baş, hedefin üstünde).
- **Tek hesap:** `supabase/functions/_shared/navlun-karsilastirma.ts` (uygulama `lib/navlun/karsilastirma.ts` ile aynı
  kod). Karşılaştırma = navlun + çıkış lokali + konteyner başı VGM / mühür (KDV hariç); hedef de bu temelle. Kullanan:
  Navlun Evreni (liman kartı, harita, Liman Masası, sohbet), 17:00 navlun maili (`limanSatirlari`, `guncelEnIyiler`) ve
  satın alma listesi. Excel (operasyonun tablosu) ham teklifleri gösterir, değişmedi.
- **Lokal durumu sırası:** liman kuralı → teklif metni (`lokal_dahil`) → acente hafızası (`navlun_acente_hafizasi`) →
  rezervasyondan öğrenilen (yükleme planı: aynı acentenin aynı limana teklifi = gerçekleşen navlun → "dahil";
  teklif + lokal = gerçekleşen → "hariç") → bilinmiyor. Lokali kesin olmayan teklif ASLA "en iyi" seçilmez ve haritada
  yeşil olmaz (mor "Lokal belirsiz"); listede "?" ve rozetle görünür.
- **Kendi kendini geliştiren:** rezervasyon kanıtları her yüklemede kendiliğinden artar (tabloya yazılmaz, her açılışta
  hesaplanır). Hafızası olmayan acente (Kuehne+Nagel, Link, Esna, ZIM) ilk eşleşen rezervasyonda öğrenilir.
- **Hafızanın ilk hali (araştırma, 13.11 gece; canlıya SQL ile, repoda veri yok):** Draft / Akkon / MSC / Horoz dahil,
  Martı dahil + 44 (VGM 26 + mühür 18), Evergreen hariç + 356 (mail tablosu). Dayanak: rezervasyondaki gerçekleşen
  navlunlar (Tema 1.450, Cibuti 1.850, Mombasa 1.940, Ashdod 800) ve mail ifadeleri ("LI", "Free in ... + lokaller",
  "lokal dahil"). Asya "all in" teklifleri yükleme limanı lokalini İÇERİYOR (ONE, Horoz metinleri); Singapur için
  denenen "yalnız navlun" istisnası aynı gece kaldırıldı (temel = toplam).
- **Açık veri sorunu (dokunulmadı, kullanıcıya bildirildi):** Singapur rezervasyonlarında navlun 100–175, lokal 100–400
  girilmiş; net navlun = navlun − lokal eksiye düşüyor (fatura talimatı FOB'u etkileyebilir).
- Testler: `tests/navlun-karsilastirma.test.ts` (Beyrut 696, belirsiz en iyi seçilmez, öğrenme, mail tarafı).

## 4.13 Navlun okuyucu: "+ USD 30 ENS FEE" navlunu masraf saydırıyordu (16.11.2026)
- Kullanıcı: Imagesa'nın (Marguisa acentesi) 11.11 Malabo teklifi Navlun Bildirimi'nde yok. Kök neden (canlıda doğrulandı:
  `navlun_mesajlari` ve `navlun_acenteler`'de Imagesa kaydı 0): `tutarlar()` masraf filtresi tutarın 60 karakter öncesi /
  30 karakter sonrasına bakıyordu; "USD 3350 / 20’DC" satırının altındaki "+ USD 30 ENS FEE / BL" pencereye girdi → 3350
  "fee" sayıldı → teklif çıkmadı → bilinmeyen alan adı (imagesa-tr.com) otomatik öğrenilmedi → mail hiç kaydedilmedi.
- Düzeltme (`_shared/navlun-oku.ts`): `kalemCevresi()` pencereyi tutarın KENDİ kalemine daraltır (yeni tutar "+ USD",
  "USD", "$" ya da satır sonu keser; "USD 50+Kdv" gibi tek "+" kesmez). "Liman masrafları dahil" pencere sınırında
  bölünmeden temizlenir. Ayrıca: `POD : X & Y` (ya da virgül) çoklu varış → konu limanı listedeyse her liman için ayrı
  teklif; armatör gövdede yoksa imzadan ("As agent for Marguisa…"); Marguisa armatör listesine eklendi; "liman/lokal
  masrafları dahil", "local charges incl." lokal dahil; "dahil değildir" / "not incl." lokal HARİÇ.
- Yalnız `navlun-bildirimi` edge'i bu dosyaları kullanır (deploy bu). Mail yeniden beslenmeli: Apps Script
  `NAVLUN_SON` = 1794344400000 (11.11.2026 00:00 TSİ) → 15 dk'lık `navlunTara` 11.11'den beri yeniden okur
  (Message-ID ile idempotent, tekrar kayıt olmaz).
- Testler: `tests/navlun-oku.test.ts` (kurgusal; edge kodu es2018+ olduğu için çalışma anında yüklenir, Next
  typecheck'i izlemez).

## 4.14 Ön ödeme dağıtımı — sipariş takibinde sevkiyatlara yüzdeyle (16.11.2026)
- Kullanıcı: "Ön ödeme tutarı proformadaki ön ödeme yüzdesine göre evraklara-sevkiyatlara bölünmeli … 10 konteynerlik
  siparişte 40.000 USD geldi; 5 konteyner yüklendi, kalan siparişe devam et ile açılan sonraki 5'e otomatik devretmeli.
  Tek seferlik dosya ise sorun yok. Toplam bedel yüklenen konteynere ve anlaşmadaki yüzdeye göre. Euro da gelebilir."
- Önceki durum (kök sorun): proformadan dosya açılırken avans = proformanın TÜM ön ödemesi; "siparişe devam et" ilk
  dosyanın avansını AYNEN kopyalıyordu; Harun Bey çok sevkiyatlı proformayı Excel'de -1…-5 satırlarına bölüp her birine
  ön ödemeyi elle hesaplıyordu.
- Kural (veritabanı, migration `20261116170000_on_odeme_dagitimi.sql`, CANLIDA; kurgusal proformayla geri alınan testte havuz, devreden, yükleme farkı, kapalı / elle kilit, EUR karşılık, geri al ve tek seferlik doğrulandı): yalnız SİPARİŞ TAKİBİ (proformanın en az bir
  dosyası `ana_siparisler`'e bağlı). Havuz = `siparis_on_odemeler.tutar` (farklı dövizse `karsilik_tutar`, sipariş
  dövizinde); oran = `siparis_on_odemeler.oran`, boşsa dosyanın ödeme şartından (`on_odeme_orani_oku`, TS eşi
  `lib/on-odeme.ts onOdemeOrani`). Dosyalar açılış sırasıyla: pay = fatura `toplam_tutar` × oran, en fazla havuzda
  kalan; kilitli dosya (Kapalı / fatura talimatı gönderildi / `ham_veri.avans_elle`) mevcut avansını korur ve havuzdan
  düşer. Yazılan: `ham_veri.avans_tutari` (+ iz `ham_veri.avans_dagitim`) → faturadaki ÖDENECEK TUTAR. Havuz geri
  alınırsa dağıtımla yazılan avans temizlenir. Eksik ön ödeme: önce açılan dosya önce alır, sonrakiler 0.
  Fazla: "devreden" olarak görünür (elle karar).
- Tetikler: `siparis_on_odemeler` (tutar / döviz / oran / karşılık) ve `ihracat_dosyalari` (açılış, toplam_tutar,
  proforma, sipariş, durum, fatura talimatı). Tek seferlik dosyaya, havuzu olmayan proformaya DOKUNMAZ (canlıda
  geçişte değişen kayıt yok: ön ödemesi girilmiş 16 proformanın hiçbiri sipariş takibinde değildi).
- Ekran: Siparişler → "Ön ödeme alındı" penceresinde yüzde, farklı dövizde karşılık ve dosya bazında dağılım
  önizlemesi; Ödeme kartında "otomatik dağıtıldı" / "elle girildi" notu (elle değiştirilen avans dağıtımdan çıkar,
  alan boşaltılırsa otomatiğe döner). Siparişe devam et: avans kopyalanmaz; başlangıç = tutar × ödeme şartı yüzdesi.
- RPC: `siparis_on_odeme_kaydet(+p_oran, p_karsilik)` (eski 5 parametreli sürüm kaldırıldı; istemci isimli parametreyle
  çağırır), `siparis_on_odeme_dagilimi(proforma)` (okuma). Testler: `tests/on-odeme.test.ts`.

## 4.15 Navlun raporu kontrolü (16.11.2026 akşam raporu)
- Kullanıcı: "Bu raporun doğruluğunu kontrol et; eksik kısımlar var." Canlı veri + mail kutusuyla satır satır karşılaştırıldı.
- HATA 1 (BAKEBS, Dar es Salaam): sistem proforması `UNEXBSC061126` limanı "DAR SALAAM", plan Excel'i "DAR ES SELAM" →
  müşteri + liman eşleşmesi tutmadı; booking'i planda olan sipariş "Rezervasyon Bekleyen"de 0 konteyner ve "teklif yok"
  göründü. Düzeltme: `siparis_liman_anahtar` DAR ES SALAAM yazımlarını birleştirir (migration
  `20261116180000_siparis_liman_konteyner.sql`, CANLIDA) + `navlun-tablosu.ts LIMAN_ESLER`.
- HATA 2: sistem proformalarında konteyner boş (0 sayılıyordu). `siparis_listesi_veri` gösterimde MT / 25'ten türetir;
  plan eşleşmesindeki birikimli kural değişmedi (kuru çalıştırma: yalnız BAKEBS rezervasyonlu oldu, 4 proformaya adet geldi).
- HATA 3: "navlun bedelini 1780 usd olarak dikkate alıyoruz" (ESNA, 12.11) kabul okunmuyordu → booking "bilgi yok".
  `navlun-oku.ts` kabul kalıbı eklendi (yalnız dikkate al / kabul et / onayla ile; "rica ederiz" kabul değil).
- HATA 4: "COOL LINK" / "COOL LINK& MARKETING PTE LTD" ayrı satır → biri diğerinin başıysa (≥ 6 harf) tek satır.
- Doğru bulunanlar: 17 booking / 70 kont / 159.750 $ toplamı; Cibuti'de güncel teklif yok (yalnız Akkon 1.850 kabulleri);
  Riviera (Beyrut, 23 kont) sistem rezervasyonunda ETD 14.11 ve 23 konteynerin DBA'sı yüklü → raporda yok (plan Excel'i 18.11
  diyor; kullanıcıya soruldu).
- Testler: `navlun-oku.test.ts` (kabul), `navlun-karsilastirma.test.ts` (bekleyen birleştirme + DAR SALAAM).
- 16.11.2026 kullanıcı cevabı: "Riviera ETD 18.11" ve BAKEBS kalan 3 konteyner için "Güncel yükleme planı işte bu yüzden
  var" → YÜKLEME PLANI ESASTIR (migration `20261116200000_plan_etd_kismi_booking.sql`, CANLIDA):
  `yukleme_plani_veri` ETD = plan Excel'i, boşsa rezervasyon (eskiden tersi; fark eden 3 booking: Riviera 14→18.11,
  Black Stallion 19→26.11, OM General kapalı). `siparis_listesi_veri` kısmi booking: booking siparişin bir kısmını
  karşılıyorsa sipariş "ön ödeme alındı" kalır (booking no yazılır), yeni kolon `bekleyen_konteyner` = kalan; navlun
  raporu / yükleme planı "rezervasyon bekleyen" bunu kullanır (BAKEBS: 5 sipariş, 2 booking → 3 bekliyor). Kuru
  çalıştırmada başka fark yok. ESNA 1.780 $ kabulü yeniden okumayla kaydedildi (+ Paramaribo 3.330 $ kabulü).

## 4.16 Veri tutarlılığı paketi (16.11.2026, kullanıcı onayı)
Migration `20261116210000_veri_tutarliligi.sql` (+ `..210500` aday eşiği), CANLIDA. Geçişte `siparis_listesi_veri` ve
`yukleme_plani_veri` çıktısı md5 ile karşılaştırıldı: birebir aynı (194 / 234 satır).
- **Liman / firma eş sözlüğü** `ad_esleri` (tur liman|firma, kaynak/hedef = eşleşme anahtarı, *_ad = ekranda yazılan).
  `ad_esi(company, tur, anahtar)`; yazma yalnız RPC `ad_esi_kaydet` / `ad_esi_sil` (analiz|proformalar). Kullananlar:
  `siparis_listesi_veri` (plan eşleşmesi fkey/lkey), edge `navlun-tablosu` (`esleriYukle` + `firmaAnahtari`; okunamazsa
  sabit eşler), Navlun sayfası Excel indir, `veri_tutarsizliklari`. Evrak kontrolleri BİLEREK bağlı değil (birebir yazım).
  Koddaki sabit eşler (SINGAPUR, CIBUTI, MALDIVES, DAR ES …) yedek olarak durur ve tabloya tohumlandı. Ekran:
  Ayarlar > Liman ve Firma Eşleri (`/ayarlar/esler`, süper admin).
- **Aynı sipariş eşleştirmesi** `siparis_eslesmeleri` (proforma_anahtar ↔ defter_id, ikisi de tekil). Sistem proforması
  listeden gizlenir, ön ödemesi Excel satırına geçer (Excel satırının kendi kaydı varsa o önceliklidir); çıktıda
  `eslesik_proforma`. RPC: `siparis_eslesme_adaylari` (aynı firma 3 / önek 2 + miktar 2 + tutar 2; eşik 3),
  `siparis_eslestir`, `siparis_eslesme_kaldir`. Ekran: Siparişler'de sistem satırında "Excel'de aynı sipariş var mı?",
  Excel satırında "Sistem: … · ayır". Eşleşen Excel satırının durumu Excel'deki gibi (ör. "rezervasyonlu") sayılır.
- **Kontrol Merkezi "Veri Tutarsızlıkları"** `veri_tutarsizliklari()` (salt okunur, analiz): plan/rezervasyon ETD farkı,
  iki numarayla sipariş (firma + miktar, 45 gün), 30 gün içinde ETD'li navlunsuz booking (dosya/plan navlunu yok ve
  aynı limanda ETD'den 90 gün önceye kadar kabul maili yok), 7+ gün booking bekleyen ön ödemeli sipariş (14+ yüksek),
  yükleme planı / sipariş listesi 3 günden eski, navlun maili 1 günden uzun okunmadı. Kart: `components/analiz/tutarsizliklar-karti.tsx`.
- **Navlun teklif adayları** `navlun_teklif_adaylari()`: son 45 gün "bilgi" + olaysız + bizden değil + (metinde tutar
  ya da acente boş). Edge `navlun-bildirimi`: tanımadığımız alan adından NAVLUN TALEBİ cevabı öğrenilemezse artık
  `adayKaydi` ile olaysız "bilgi" (acente boş) saklanır. `navlun_hata_coz` "bilgi" kayıtlarını da çözer; acentesi boşsa
  `p_acente` ister ve alan adını `navlun_acenteler`'e ekler (pasif kayda dokunmaz). Ekran: Navlun > "Teklif olabilecek mailler".
- **Yeniden oku** `navlun_yeniden_okuma` (şirket başına tek aktif), RPC `navlun_yeniden_oku_iste/_iptal`; edge işlemleri
  `yeniden_oku_al` / `yeniden_oku_ilerle` (service role fonksiyonları). Apps Script `navlunTara`: normal okuma ilk 60 sn'de
  biterse `navlunYenidenOku` (20 yazışma, 3 dk bütçe, Gmail sırası `konum`); NAVLUN_SON'a dokunmaz. navlun.gs yeniden yapıştırılmalı.

## 4.17 Navlun raporu: "Tek Teklifle Karar Verilen Limanlar" (16.11.2026, kullanıcı onayı)
- Talebi olan liman (rezervasyon bekleyen sipariş ya da ETD'si bugün/ileride booking) son 30 günde en fazla TEK acente /
  hat bloğundan 20'DC USD teklif almışsa raporda üçüncü bölüm + bekleyen tablosunda "tek teklif" etiketi ("yeni navlun
  talebi açın"). Teklif hiç yoksa "teklif yok · son <tarih>". Hesap: `navlunSatinAlma().tekTeklif`, `limanTeklifVerenleri`.
- 16.11.2026 gece (kullanıcı: "benim onayım olmadan canlıya mail almak yok"): bölüm ve "tek teklif" etiketi varsayılan
  KAPALI; yalnız secret `NAVLUN_TEK_TEKLIF=evet` iken rapora girer (açmak için kod deploy gerekmez). Önizlemede bulunan
  karışıklık düzeltildi: "Güncel en iyi" 60 günlük penceredendi (TEMA'da 46 günlük başka acente teklifi) → yerine
  penceredeki teklifin kendisi (`teklif`) + limandaki son anlaşma (`anlasma`; ör. DAR ES SALAAM tek teklif 3.250, anlaşma 1.780).
- Sağlık taraması dersi (16.11.2026): "kesim saati geçti, fatura talimatı işaretli değil" kontrolü YANLIŞ alarm verdi;
  faturası kesilmiş/yüklenmiş dosyada talimat gönderilmiş demektir (IHR-2026-0112). Bu kontrol yapılırken
  `fatura_no` / `fatura_dosya_url` dolu dosya "talimat tamam" sayılır.

## 4.18 Operasyon bağlantıları (16.11.2026, kullanıcı onayı) — migration 20261116230000_operasyon_baglantilari.sql
- **Fatura → talimat işareti**: `trg_fatura_talimat_isaretle` (BEFORE INSERT / UPDATE OF fatura_no, fatura_dosya_url):
  fatura no ya da fatura PDF'i İLK girildiğinde `fatura_talimati_gonderildi=true`. Elle kaldırılan işarete sonradan
  dokunulmaz (yalnız boştan dolana geçişte). Geçiş: faturası olup işareti boş 5 açık dosya işaretlendi
  (IHR-2026-0112..0116). Sonuç: bu dosyalara otomatik fatura talimatı maili gitmez (fatura zaten kesilmiş).
- **Rezervasyon formu önerisi** `rezervasyon_onerisi(booking, varış, etd, konteyner)` + `components/rezervasyon-onerisi.tsx`:
  booking yükleme planındaysa gemi / sefer / acente / ETD / kesimler / ekipman / ardiyesiz / konteyner / plan navlunu
  YALNIZ boş alanlara ("Boş alanları doldur"). Navlun anlaşması (navlun_teklifleri tur='kabul', aynı liman, ETD−90 gün;
  sıra: booking no konuda > REZERVASYON TALEBİ > liman) "Kullan" ile navlun alanına. Varış limanı plandan doldurulmaz
  (dosyanın alanı). FOB grubunda navlun önerilmez; para birimi dosyanınkinden farklıysa önerilmez.
  Booking onay mailleri (konusunda "navlun" yok) navlun.gs'e gelmiyor; kaynak şimdilik yükleme planı.
- **Proforma navlun referansı** `navlun_liman_referansi(liman)` + `components/navlun/liman-referansi.tsx`: CFR/CIF teslim
  ifadesinden liman (`teslimdenVarisLimani`, SQL ile aynı kural), son 60 gün acente başına son 20'DC USD teklif ve son
  anlaşma. Yalnız bilgi; proformaya yazılmaz. Tek teklifte "ikinci acenteden teyit" notu.
- **ETD değişimi** `trg_plan_etd` (AFTER UPDATE OF etd ON sevkiyat_plani, yalnız değiştiyse): bağlı rezervasyon
  (`rezervasyon_id` ya da `booking_anahtar`) ETD'si plana eşitlenir, ETA planın kaydığı gün kadar kayar; olay
  `etd_degisimleri`'ne yazılır. Hatırlatmalar (ödeme / konşimento) `gemi_kalkis_tarihi`'ni okuduğu için kendiliğinden
  kayar; ETD değişimi mail TETİKLEMEZ. Hata aktarımı durdurmaz (warning). Kontrol Merkezi: `veri_tutarsizliklari()`
  'etd_degisti' (onem 'bilgi', 7 gün, kartta mavi).

## 4.19 Sipariş Listesi sekmeleri (16.11.2026) — yalnız arayüz, veritabanı değişmedi

Kontrol Merkezi / Pazar / Ana Panel düzeni (`app/siparisler/page.tsx`, saf yardımcılar `lib/siparis/gorunum.ts`, test `tests/siparis-gorunum.test.ts`):

- **Sabit üst:** 6 kart aynı; tıklayınca ilgili sekme açılır ("Olası tekrar" ilk şüpheli satırın sekmesini açar).
- **Kaynak eski şeridi:** `veri_tutarsizliklari()` içindeki `kaynak_eski` kalemleri (plan / sipariş listesi 3 günden eski — Kontrol Merkezi ile aynı kural). "Plan yükle" / "Liste yükle" mevcut Excel aktarım pencerelerini açar. RPC `analiz` yetkisi ister; okunamazsa şerit görünmez.
- **(21.11.2026 değişti, bkz. 4.26)** **Sekmeler (`?sekme=`; varsayılan rezervasyonlu adreste yazılmaz):** `rezervasyonlu` (rezervasyonlu + BL eksik) · `rez_bekleyen` (ön ödeme alındı, rezervasyon yok; turuncu sayı) · `onay` · `sevk` (sevk edilen + iptal) · `plan`. Her durum tam bir sekmede (`sekmeSayilari` toplamı = satır sayısı). Eski "sevk edilenleri göster" düğmesi kalktı.
- **Arama:** tek kutu, Türkçe harf duyarsız; sekme sayıları aramaya göre daralır, boş sekmede "diğer sekmelerde N sonuç" yazar.
- **Bağlantılar:** müşteri adı → `/pazar?musteri=` (Pazar yetkisi varsa); rezervasyonlu satırın dosya no'su → `/panel?dosya=` (sevk edilen / kapalı dosya Ana Panel'de olmayabileceği için yalnız rezervasyonlu).
- "Dosyaya dönüştür" bu sayfada yok: rezervasyon operasyondan gelir, sipariş kendiliğinden sekme değiştirir.

## 4.20 "Onay geldi" akışı (17.11.2026)

Kullanıcı: "Harun Bey proforma yapacak, müşteriye atacak, imzalı proforma veya ön ödeme gelirse proforma ön onayı alınmış
ama rezervasyonu alınmamış olarak düşecek." Akış (yeni ekran yok, mevcut parçalar bağlandı):

1. Proforma Oluştur → kaydet → Sipariş Listesi "Onay bekleyen" (değişmedi).
2. Satırdaki **"Onay geldi"** (eski "Ön ödeme alındı") penceresi: **Ön ödeme geldi** (mevcut form, tutar zorunlu,
   `siparis_on_odeme_kaydet` DEĞİŞMEDİ) | **İmzalı proforma geldi** (yalnız onay tarihi; yeni `siparis_onay_imzali`,
   migration `20261117100000`). İkisi de `siparis_on_odemeler.alindi = true` → sipariş "Rezervasyon bekleyen"e geçer
   (`siparis_listesi()` değişmedi). `onay_turu` kolonu: `imzali` / `on_odeme` / null. İmzalı onayda tutar boş kalır;
   satırda "Alındı · Tutar gir" görünür. Daha önce girilmiş tutar imzalı onayda SİLİNMEZ.
3. Dosyası açılmamış sistem proformasında (`anahtar = proforma:<id>`) ve Proforma Yükle yetkisi varsa
   **"Kaydedince dosyayı aç"** (varsayılan işaretli) → `/yeni-dosya?proforma=<id>`: `kayitliProformaPdf`
   (`lib/proforma/okuma-pdf.ts`) Proforma Oluştur'un indirdiği PDF'in aynısını üretir (şirket şablonu + İMZALI),
   sayfa dosyayı yüklenmiş gibi seçer, kullanıcı "Başlat" ile onaylar → yapay zekâsız okuma + mevcut dosya açma akışı.
4. Rezervasyon / sevk: değişmedi.

## 4.21 Navlun denetimi — tablo ile mailler karşılaştırıldı (19.11.2026)
Bulunan sınıf hataları ve düzeltmeler (testler `tests/navlun-denetim-19kasim.test.ts`, veriler kurgu):
- **İmza kesimi**: teklif selamlamadaki "Saygılarımla,"dan SONRA yazılınca mail okunamadı sayılıyordu. `imzadanKes`: ardındaki 300
  karakterde fiyat olan imza kelimesi kesim noktası değildir.
- **ONE armatörü**: desen yalnız küçük harf "one" yakalıyordu (İngilizce kelime). Büyük harf `ONE` (BİR / TANE / CONTAINER değilse),
  "One line", "Ocean Network Express" ONE'dır; fiyata en yakın armatör seçilir ("Msc dışı alternatif ... Hat:ONE" → ONE).
- **FT10** bitişik free time okunur.
- **Genel tarife**: EUR satırlar `para_birimi = EUR` ile yazılır (önceden atılıyordu). Şart metnindeki koşullu
  "Ayrıca belirtilmediği müddetçe ... lokal masrafları dahil değildir" KARAR VERMEZ (null → acente hafızası). DERS (19.11.2026
  17:26): ilk sürüm bunu "hariç" yaptı; MSC hafızası (kullanıcı onaylı, 22.10 tarifesi "lokallerimiz dahil") devre dışı kaldı,
  MSC-tek limanlar haritada "—" (lokal belirsiz) göründü. Geri alındı. Tahliye / varış / gümrük tarafının "dahil değildir"i
  çıkış lokalini hariç yapmaz; "pol lokaller & BL ücreti dahil" dahildir. "lokal masrafları dahil değildir" "dahil" sayılmaz.
- **Sabit yerleşimli teklif formu (knFormu)**: rota sayısı kadar "FT N DAYS - ARMATÖR" çifti varsa sırayla rotalara verilir.
- **Elle düzeltilen teklif**: armatör boşsa ek formun yorumundaki tek armatör yazılır (`ek_bilgi.ek_armator`, RPC).
- **RPC `navlun_kaydet`** (migration 20261119140000): para birimi yazılır; aynı mesajda aynı liman + ekipman için ELLE satır
  varsa otomatik satır yazılmaz (çift sayım yok).
- **Tablo (acente hafızası)**: armatörsüz teklif, aynı acente + limandaki teklifler TEK armatörlüyse ona bağlanır (ayrı
  "ACENTE" sütunu açılmaz); iki armatör varsa dokunulmaz. TOAMASINA = TAMATAVE.
- Yeniden okumada bulunan eski hatalar: sonraki satırdaki soru ("Hedef var mıdır?") önceki satırdaki fiyatı soru sayıyordu (satır sonu korunarak bakılır); "masrafı usd 250 /20' & usd 300 /40'" devamındaki tutar navlun sanılıyordu.
- Sıralı yeniden okumada: "14 MERGED free time ... Tt/ 46 gün" free time 46 okunuyordu (merged deseni + transit etiketi geçilmez); takip cevabı "Bu teklife 14 gun verebiliriz. 36 gun via ..." free time / transit olarak okunur. Yeniden okuma SIRAYLA (sayfa 0,1,2...) çalıştırılmalı; takip mailleri teklifleri ancak kendilerinden önce işlenmişse tamamlar.
- Teklif adayları (migration 20261119150000): aynı gönderen + liman 60 dk içinde "Düzeltme ..." ile başlayan mail attıysa önceki mail listeden düşer. "14 free 28 gun tt" transit okunur.
- "lokal (masrafları) hariç" de hariç sayılır (varış / POD tarafı hariç). Hafızaya mail kanıtıyla iki acente eklendi (biri dahil, biri hariç + fabrika dolum lokal tutarı; veriler tabloda, repoda değil). Navlun sayfasındaki "Test maili" butonu kaldırıldı.
- Açık konu: bizden giden "kabul" maillerinde acente boş (alıcı adresi betikten gelmiyor); "Anlaşılan" sütununda görünür.

## 4.22 Rapor saatleri sadeleştirildi (19.11.2026, kullanıcı: "gün içinde çok rapor gidiyor")
- Günlük ihracat raporu ve iç piyasa raporu: YALNIZ 17:00 (sabah / öğle cron işleri `active=false`, silinmedi).
- Sipariş raporu: YALNIZ cumartesi 09:00 (20.11.2026; `siparis-rapor-sabah` = `0 6 * * 6`, akşam işi kapalı; sabah penceresi 08:55–10:00).
- DİİB raporu: cumartesi 09:00 (20.11.2026), fatura bölümü son 7 gün (`DIIB_RAPOR_GUN`). Edge penceresi 08:55–10:00; cron
  değişikliği (migration 20261119170000) yeni edge deploy edildikten SONRA uygulanır.
- Navlun raporu değişmedi (her gün 17:00).

## 4.23 Birleşik fatura yükleme (20.11.2026)
- Dosya bir fatura grubundaysa (ve grupta DİİB bölünmesi yoksa) Muhasebe › Fatura tek yüklemedir: kontrol grubun toplamlarıyla
  (`grupFaturaToplami`: tüm konteynerler, net/brüt/kap, tutar, tüm booking'ler, gemiler), aynı PDF / fatura no / tarih / sonuç
  gruptaki BÜTÜN dosyalara yazılır (`grupFaturasiYaz`). Aynı PDF birden çok dosyada durduğu için depodan yalnız hiçbir dosya
  kullanmıyorsa silinir (`faturaAdresiKullaniliyor`).
- Önce tek dosyaya yüklenmiş fatura: o dosyada "Yeniden kontrol" grup kontrolünü yapar ve faturayı bütün dosyalara yayar.

## 4.24 Ticaret yapılan ülke: elle düzeltme + Surinam (20.11.2026)
- `ihracat_dosyalari.ticaret_ulkesi` (migration 20261120120000): elle girilen ülke; boşsa alıcı adresinden (`dosyaTicaretUlkesi`).
  Fatura talimatı penceresinde "Değiştir" (liste + serbest yazım, "Adresten bul" = elle değeri sil); birleşikte gruptaki bütün
  dosyalara yazılır. Talimat metni, PDF, bayrak, fatura onayı, DİİB ve Kontrol Merkezi bu kuralı kullanır.
- Ülke listesine Surinam, Guyana, Trinidad ve Tobago, Barbados, Belize, Bahamalar, Porto Riko eklendi (Paramaribo / Port of Spain /
  Georgetown limanları da).

## 4.25 Sipariş listesi Excel: elle güncellenen düzen + "sistem esastır" korumaları (21.11.2026)
Kullanıcı: "Harun Bey sipariş listesini sistemde değil manuel olarak güncelledi. Bizde sistemi buna göre güncellemeliyiz."
Dosya `Unex_İhracat_Sipariş_Listesi_21.11.2026.xlsx`: hafta ara başlıkları ("47.HAFTA (15 KASIM - 21 KASIM)"),
"YÜKLEMESİ PLANLANACAK SİPARİŞLER" / "PEŞİNAT BEKLENEN SİPARİŞLER" bölümleri, onay kutulu "Ön Ödeme" / "Bakiye" / "Release" sütunları.
- Okuyucu (`lib/siparis/siparis-excel.ts`, `xlsx-oku.ts` `mantiksal`): hafta başlığı atlanır; YÜKLEMESİ PLANLANACAK →
  ön ödeme alındı bölümü, PEŞİNAT BEKLENEN → onay bekliyor bölümü. "Ön Ödeme" DOĞRU/YANLIŞ yeşil olmayan BL'siz satırda
  bölümden önce gelir. Bakiye / Release sistemde yok, okunmaz. ESKİ okuyucu bu dosyada YÜKLEMESİ PLANLANACAK satırlarını
  "onay bekliyor" yapardı.
- Önizleme korumaları (`siparisOnizleme(excel, mevcut, sistem)`, bilgi `siparisSistemBilgisiOku`):
  1) Dosyası olan satırda Excel BL'si dosyanın booking'iyle çelişiyorsa BL DEĞİŞMEZ (`blKorunan`; 21.11 dosyasında
     EMT160926-4R ↔ EMT300926R BL'leri yer değiştirmişti, sistem: 0124 = ISB2105393, 0130 = ISB2105390).
  2) Yalnız revize eki farkı (…-1 → …-1R) proforma no'yu değiştirmez (DB `siparis_anahtar` "-1R"yi korur; ön ödeme kaydı
     ve dağıtımı eski anahtarda kalır).
  3) Defterde satırı olmayan SİSTEM PROFORMASI (Proforma Oluştur) Excel kopyası olarak eklenmez (`sistemde`); eklenirse
     proforma satırı gizlenir ve "Onay geldi → dosyayı aç" akışı kaybolurdu.
- 21.11 dosyası kuru çalıştırma (geri alındı): 4 yeni (SOSAR 50 MT ZIMUIST26809823 → 0131'e bağlanır, SOSAR çift sayımı
  biter; AQI 50 MT B261102149; OMG091126 2×250 booking'li), 39 güncelleme (ön ödeme alındı 14, sevk 12, AQI 375→325,
  OMG 750→250, SOSAR 100→50), 8 sistem proforması eklenmedi, 2 BL korundu; ARG GROUP (UNEXAGI101126) dosyada yok, dokunulmadı.

## 4.26 Sipariş Listesi sayfası Yükleme Planı ile açılır (21.11.2026) — yalnız arayüz, veritabanı değişmedi

Kullanıcı: "Rezervasyonlu sekmesi zaten güncel yükleme planı anlamına geliyor; kaldıralım, sipariş listesi açıldığında
yükleme planı karşılasın. Sevk edilen kısmını da kaldıralım; İhracatlar sayfasında geriye dönük her şeyi kontrol edebiliyoruz."

- **Sekmeler:** `plan` (varsayılan, adreste yazılmaz) · `rez_bekleyen` · `onay` · `formlar`. `rezervasyonlu` ve `sevk`
  kaldırıldı; eski adresler (`?sekme=rezervasyonlu`, `?sekme=sevk`) bilinmeyen değer sayılır → Yükleme Planı.
- `satirSekmesi`: ön ödeme alındı → `rez_bekleyen`, onay bekliyor → `onay`, rezervasyonlu / BL eksik → `plan`,
  sevk edildi / iptal → `null` (sayfada sekmesi yok; İhracatlar). `sekmeSayilari` yalnız iki liste sekmesini sayar.
- Kaldırmadan önce canlı kontrol: 17 rezervasyonlu + BL eksik satırın 15'inin booking'i planda (Excel'de rezervasyonlu
  satırın BL sütunu booking'dir: OMG091126 AKKIST26054134 / 281349160, SIM061126 594600105360). Kalan 2 satır (SAMREX
  UNEXSGT040526, STE AFRICAN UNEXSAB030626) Excel'de yeşil ama BL'siz eski sevkiyatlar; "Sistemde karşılığı olmayan
  siparişler" şeridinde listelenir, "BL eksik" kartı şeridi açar.
- Şeritteki "Listede göster": rezervasyonlu / BL eksik satır Yükleme Planı'nda booking (yoksa BL, yoksa firmanın ilk iki
  kelimesi; `planAramaMetni`) ile aranır. Planda arama yapılınca tüm yıl taranır (eski haftalar "Güncel" görünümde gizli kalmasın).
- Kartlar: "Açık sipariş" ve "Rezervasyonlu" → Yükleme Planı. "Liste yükle" / sipariş Excel aktarımı her sekmeden açılır.
- Excel indir değişmedi (tüm satırlar, sevk edilenler dahil).


## 4.27 İş akışı revizeleri (21.11.2026) — migration 20261121080000_is_akisi_revizeleri.sql

Kullanıcı: "Resmen bir iş akışı oluşturmaya başlıyoruz." Beş madde; hiçbir mevcut kayıt silinmez / değişmez.

1. **Silinen proformalar (Proforma Oluştur).** Kaynak: `denetim_kayitlari` (proformalar DELETE; silinen satır taslağıyla).
   `proforma_silinenler(limit)` numara başına en son silmeyi verir (aynı numarayla yeniden var olan hariç);
   `proforma_geri_yukle(denetim_id)` satırı AYNEN (id, taslak, tarih, oluşturan) geri yazar → Sipariş Listesi'nde yeniden
   "Onay bekleyen". Arayüz: `components/proforma/silinen-proformalar.tsx` (müşteri bazında grup; "Geri yükle" /
   "Geri yükle ve düzenle"), `?silinen=1` paneli açık getirir. Saf: `lib/proforma/silinen.ts`, veri: `lib/proforma/veri.ts`.
   Sipariş Listesi'nden silinen Excel satırları (siparis_defteri) bu listede yoktur (proforma değil).
2. **Ön ödeme → dosya.** "Onay geldi" + "Kaydedince dosyayı aç" → `/yeni-dosya?proforma=<id>&otomatik=1`: okuma
   kendiliğinden başlar; yalnız tek sevkiyat / kısmi sevkiyat (sipariş takibi) seçimi kullanıcıya kalır (iş kararı).
3. **Kalan ödeme.** `siparis_defteri.bakiye_odendi / bakiye_tutar` (Excel "Bakiye": DOĞRU = alındı, tutar = kalan; boş hücre
   silmez; `siparis_listesi_aktar` yamalı). `siparis_bakiye_durumu()` = defter bakiyesi + dosyaların konşimento durumları.
   Hesap TEK YERDE `supabase/functions/_shared/siparis-odeme.ts`: ön ödeme proforma toplamına oranla satırlara dağıtılır;
   kalan = satır tutarı − pay; bakiye alındı (Excel DOĞRU / konşimento Telex·Seawaybill·Vesaik) → 0; onay bekleyen → tamamı;
   ön ödeme tutarı yoksa Excel'e yazılan kalan, o da yoksa "bilinmiyor". Sayfa: "Ön ödeme / Kalan ödeme" sütunu + bölüm
   özetinde kalan toplamı; Excel indir sona "Ön Ödeme Payı" + "Kalan Ödeme" (sipariş raporu mailinin eki değişmedi).
   İlk Excel aktarımında Bakiye sütunu dolu satırlar bir kez "değişen" görünür (sistemde ilk kez dolar).
4. **Yükleme Planı: rezervasyon bekleyenler.** Plan `kaynak = siparis` satırları tablo yerine üstteki panelde
   (`components/siparis/rezervasyon-bekleyen.tsx`): ön ödeme tarihi / bekleme günü / kalan, varış limanının son 120 gün
   navlun teklifleri (acente başına en son, 20'DC öncelik, ucuzdan; `navlun_teklifleri`), free time, transit ve tek aksiyon
   (`plan_bekleyen_aksiyonlari`): rezervasyonsuz açık dosya → "Rezervasyon ekle" (dosya › Rezervasyon › yeni) · sipariş
   takibi → "Sevkiyat aç" (`/ihracatlar?siparis=` sevkiyat seçimi penceresini açar) · sistem proforması → "Dosya aç"
   (`?otomatik=1`) · hiçbiri → "Proforma yükle". Saf: `lib/siparis/plan-bekleyen.ts`.
5. **ETD-ETA Excel'i ETA'yı yazar.** Eskiden aktarım YALNIZ KONŞİMENTO sütununu yazıyordu; ETA'lar hep elle girilmişti
   (yazan bir sürüm hiç olmadı; yükleme planı ETD'yi değiştirince ETA aynı gün kadar kayıyordu). `odeme_excel_yukleme_kaydet`
   `p_etalar` aldı (3 parametreli eski imza kaldırıldı). Kural (istemci + veritabanı): ETD ≤ ETA ≤ ETD + 180 gün; uyumsuz
   satır "kontrol edin" listesinde, uygulanmaz (ör. ETA 27.01.2026 / ETD 18.12.2026). Excel'de boş ETA silmez.

Test: `tests/is-akisi-revizeleri.test.ts` (kurgusal veri).

### 23.11.2026 Ayarlar > Rapor Alıcıları: Önizle / Test maili çalışmıyordu
- Kök neden: sayfa edge'i TARAYICIDAN çağırıyordu; `siparis-rapor`, `navlun-tablosu`, `musteri-durum-rapor` CORS ön kontrolünü
  (OPTIONS) karşılamıyor → `OPTIONS 403` ("zamanlanmış rapor saati değil"), asıl istek hiç gitmiyordu (log 23.11 00:39 UTC).
- Çözüm (canlı edge'lere dokunmadan): `app/api/rapor-edge/route.ts` aynı kökenli sunucu yolu; izinli 3 edge, yalnız
  `{deneme | test | musteri}`, kullanıcının kendi token'ı iletilir (yetki edge'de). `lib/rapor-alicilari.ts edgeCagir` buraya gider.
- Netlify sunucu yolu ~10 sn: rapor 6-8 sn sürüyor; 502/503/504'te "mail büyük olasılıkla gitti" mesajı. Kalıcı iyileştirme
  (isteğe bağlı): üç edge'e OPTIONS + CORS başlığı eklenip doğrudan çağrıya dönülebilir.
- Sayfa: son önizle / test sonucu ekranda kalır (kime gitti, konu ya da hata ayrıntısı); test maili yalnız test adresine gider notu.
- 21.11 Cumartesi raporu "yanlış": rapor 09:00'da gitti, sipariş Excel'i aynı gün 13:44'te yeniden içe aktarıldı (eski satırlar);
  kod hatası yok. Güncel veride rezervasyon bekleyen 17 sipariş / 64 konteyner (Ana Panel mavi satırlarıyla aynı).

### 23.11.2026 Sipariş Excel'i tablo görünümü (kullanıcı: "tablo halinde; ilk kaldığı yer karşılamalı; başlıklar görünmeli")
- `_shared/xlsx-yaz.ts` XlsxSayfa yeni alanlar: `filtre` (autoFilter + gizli _FilterDatabase adı), `baslangic` (açılışta görünen /
  seçili hücre; dondurulmuşsa alt bölmenin topLeftCell'i), `yazdirBaslik` (Print_Titles). Eski çağrılar etkilenmez.
- Sipariş Listesi: başlık satırı sabit (A2), filtre düğmeleri, basılı her sayfada başlık; açılış ilk SEVK EDİLMEMİŞ sipariş
  satırında (yoksa ilk ara bölüm başlığı). Bölüm başlıkları korunur (Excel'den geri okuma bunlara dayanır; bu yüzden Excel
  "Tablo" nesnesi değil filtre kullanıldı: tablo nesnesi içinde birleştirilmiş satır olamaz).
- Yükleme Planı: açılış bu haftanın (yoksa sonraki ilk haftanın) blok başlığında; her blokta başlıklar zaten var.
- Web "Excel indir" Netlify ile gelir; mail eki için `siparis-rapor` edge'i yeniden yüklenmeli (önizlemede onaydan sonra).

## Sipariş bildirim formu · Lojistik seçimi (23.11.2026)
- Kullanıcı: "Harun Bey Excel indirip gönderdiği için takip sağlanamadı. Onayı ve rezervasyonu alınmış yüklemeler Süleyman Bey'e
  mail gitsin; oradan sipariş bildirim formu gönderilmesi gerekenleri seçsin. Şu an yüklenenleri dahil etme." Seçimler: hafta içi
  her sabah; ilk konteyner tartılınca (DBA) listeden çıkar; ilk etapta yalnız sensei test adresi; canlıda seçilen formlar uretim@ +
  CC (Rapor Alıcıları › Sipariş Bildirim Formu).
- Migration `20261123140000_siparis_formu_lojistik.sql` (CANLI): rapor `siparis_formu_lojistik` (lojistik@, canlı KAPALI),
  `siparis_formu_secimleri` (token, 3 gün; istemciye kapalı), `siparis_formu_tartilanlar()`, cron `siparis-formu-lojistik`
  (hafta içi 05:27 UTC; edge yalnız CANLI iken gönderir).
- Liste: `_shared/siparis-formu-lojistik.ts` (test: `tests/siparis-formu-lojistik.test.ts`). Formu gitmemiş / işaretlenmemiş,
  tartılmamış, gemisi kalkmamış; en yakın boş ekipman önce. Mailde booking no YOK.
- Edge siparis-formu v10 (CANLI): `lojistik_ozet` (cron / test / Rapor Alıcıları önizle-test: booking'siz deneme|test),
  `lojistik_bilgi|lojistik_gonder|lojistik_kapat` (token). Lojistik canlı değilken seçilen formlar YALNIZ test adresine, işaret
  kaydedilmez. "Zaten gönderildi" = alıcısız gonderildi kaydı (Siparişler'de "Kapatıldı"); ozet.secim = seçim id.
- Sayfa: `/siparis-formu-sec/[token]` (girişsiz; AppShell yok). Rapor köprüsü IZINLI'ye siparis-formu eklendi.
- 23.11.2026 10:5x ilk test listesi sensei adresine gitti: 7 yükleme (1 hazır). Sistemden gerçekten gönderilmiş form YOK; 19.11'deki
  6 Eastbourne kaydı "Kapatıldı" (yükleme başlamıştı).
- CANLIYA ALIŞ: Ayarlar › Rapor Alıcıları › "Sipariş Formu · Lojistik Seçimi" Canlı. Kullanıcı onayı olmadan açılmaz.

## Sipariş bildirim formu · Export hatırlatma + Gönder butonu (23.11.2026)
Kullanıcı (son karar): "Gönder butonu ile üretime Unex AI mail olarak göndersin. Çuval yüklenmeden ve spekler girilmeden
gönderilemesin. Hatırlatma her sabah gönderilsin." Lojistik seçim adımı ve otomatik gönderim KALDIRILDI.
- Gönderim: yalnız Siparişler › Sipariş Formları › "Üretime gönder" (edge `siparis-formu` v12 `{"gonder": true, booking}`;
  gönderen Unex AI, etiket [Önemli]; alıcı/CC: Rapor Alıcıları `siparis_formu`). Çuval görseli + spek + üretim + SKT tamam değilse
  düğme kapalı, edge de reddeder. Kaydet'ten sonra form tamamsa ekranda "Üretime gönder ile iletebilirsiniz" yazar.
- Hatırlatma: edge `siparis-formu-spek` v3, cron `siparis-formu-spek` 08:17 hafta içi, rapor `siparis_formu_spek` CANLI
  (migration `20261123170000_siparis_formu_export_hatirlatma_canli.sql`; alıcı export@, hitap Pazar ekibinden). Liste
  `_shared/siparis-formu-spek.ts` `spekListesi` (formu gitmemiş, tartılmamış, gemisi kalkmamış + giriş eksiği; ACİL = boş ekipmana
  ≤ 2 gün). Düğme → `/siparisler?sekme=formlar`. Mailde booking no yok. Bu anahtar form gönderimini ETKİLEMEZ.
- Uygulama içi uyarı: `components/export-form-uyarisi.tsx` (app-shell); edge `siparis-formu` `export_bekleyen`; yalnız
  `siparis_formu_spek` alıcısı olan kullanıcıda; masaüstü bildirimi günde bir; Siparişler sayfasında gizli.
- Lojistik cron kapalı (migration `20261123160000`); `siparis_formu_lojistik` kodu / `/siparis-formu-sec` sayfası yedek.
- 23.11.2026 ekran süzgeci: Sipariş Formları varsayılan listesi (bu hafta + sonrası) artık formu GÖNDERİLMEMİŞ, ilk konteyneri
  TARTILMAMIŞ ve gemisi KALKMAMIŞ yüklemeyi ekipman tarihi geçmiş olsa da gösterir (AL-QASRAWI: ekipman 21.11, ETD 28.11 gizleniyordu).
  `siparis_formu_listesi()` her satıra `tartildi` ekler (migration `20261123180000_siparis_formu_listesi_tartildi.sql`);
  `lib/siparis-formu.ts` `ListeFormu`. Hatırlatma maili ile ekran aynı kuralı kullanır.
- 23.11.2026 canlı alıcılar (migration `20261123190000_siparis_formu_alicilar_0800.sql`): hatırlatma `siparis_formu_spek` →
  export@ + execution@ (CC yok), cron `siparis-formu-spek` hafta içi 08:00 TR ('0 5 * * 1-5'; edge başlığındaki 08:17 notu eski).
  Üretime giden form `siparis_formu` → alıcı uretim@, execution@, operation@, sales@, lojistik@; CC bbt@.

## 4.28 Navlun: tek hesap yeri + Navlun Merkezi (24.11.2026, Aşama 1-2, kullanıcı onayı)
- Kullanıcı: "Alt tarafı navlun okuyacağız. Bizim için 1 konteynerin maliyeti demek." ve "Kartlar tek başına çalışmamalı."
- **Aşama 1 (tek hesap):** edge `navlun-bildirimi` `{"islem":"degerlendir"}` her teklifin konteyner başı toplamını
  (`_shared/navlun-kalem.ts` + `navlun-karsilastirma.ts`), geçerliliğini (teklif > acente alışkanlığı > 21 gün), durumunu
  (kesin / kontrol / eksik / suresi_doldu) ve liman başına en iyiyi `navlun_teklif_degerlendirme`'ye; yükleme planındaki
  gerçekleşen navlunun teklifle karşılaştırmasını `navlun_gerceklesen_kontrol`'e yazar (`_shared/navlun-degerlendirme.ts`).
  Her kayıt / yeniden işlemeden sonra ve cron `navlun-degerlendir` (7,22,37,52. dakika; rapor anahtarı vault'tan) ile çalışır.
  Günün TCMB kuru `doviz_kurlari`'na. İş kayıtlarına YAZMAZ. Süresi dolan teklif "en iyi" seçilmez; ETD'ye göre elenmez.
  Gerçekleşen kontrolü rezervasyon tarihindeki (yoksa ETD) teklifle; FOB hariç; farklı para biriminde o günün kuru.
- **Aşama 2 (ekran):** `/navlun/merkez` (yetki "navlun"; eski `/navlun` Aşama 3'e kadar yerinde, "Yeni görünüm" bağlantısı).
  TEK okuma `lib/navlun/merkez-veri.ts`; saf kurallar `lib/navlun/merkez.ts` (test: `tests/navlun-merkez.test.ts`).
  Sekmeler: Limanlar / Kontrol / Gerçekleşen / Acenteler / İşlem kaydı; yalnız açık sekme çizilir.
- **Kontrol işlemleri** tek RPC `navlun_kontrol_isle` (migration `20261124210000_navlun_kontrol_isle.sql`), her biri
  `navlun_kontrol_islemleri`'ne iz (önce / sonra / gerekçe / e-posta): Düzelt ve Kaydet (mail → `navlun_hata_coz`),
  Yoksay, Kural olarak öğret (acente hafızası lokal dahil / hariç + tutar; lokali belirsiz teklifler ACENTE başına tek kalem),
  Olduğu Gibi Onayla (yalnız tutmayan gerçekleşen, gerekçe zorunlu). Düzelt / öğret sonrası `navlun_degerlendir_tetikle()`
  cron komutunu hemen çalıştırır. 48 saati geçen kalem kırmızı ve başta.
- Yapay zekâ okuma (Gemini) yalnız secret `NAVLUN_YZ = acik` iken; varsayılan kapalı.
