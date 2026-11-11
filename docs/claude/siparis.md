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
- Sıradaki: gerçek akış başladıktan sonra okunamayan oranı izlenir (PDF biçimleri öğrenilir); "fiyattan rezervasyon
  başlat"; Kontrol Merkezi'ndeki gerçekleşen navlun (dosyalar) ile teklif karşılaştırması.
