# İhracat — Claude notları

> 02.11.2026: CLAUDE.md'den bölünerek taşındı, metin DEĞİŞTİRİLMEDİ (bölüm sırası korunur).
> Bu konudaki yeni notlar bu dosyaya eklenir. Proje çapındaki kurallar kök `CLAUDE.md`'de.

### Canlı cut-off sayacı ve 10 saat uyarısı (01.10.2026)

- Gerçek an: `cutoffZamanMs` (ham değer + sabit Türkiye UTC+3; bilgisayarın
  saat dilimine bağlı değil). Panelde `components/cutoff-sayac.tsx`
  (`CutoffSayac`), tüm sayaçlar `lib/use-simdi.ts` tek ortak saniye
  zamanlayıcısıyla işler. Renk: >48s nötr, 48–10s amber, <10s kırmızı, geçmiş
  "Süresi doldu".
- `components/cutoff-uyarilari.tsx` AppShell'de her sayfanın üstünde; panel
  veya draft_onay yetkisi olanlara, açık dosyaların TÜM rezervasyonlarında
  son 10 saate girmiş cut-off'ları listeler. Her cut-off için bir kez
  masaüstü bildirimi + toast (localStorage `cutoff-bildirimleri-v1`,
  anahtar cut-off değerini içerir → kaydırılırsa yeniden bildirir). Veri 5
  dakikada bir / sayfa değişiminde / sekmeye dönüşte yenilenir. Tarayıcı
  özelliğidir: uygulama açık değilse bildirim gelmez.
- Müşteri onayı alınmamışsa "Hatırlatma maili": `buildDraftHatirlatmaMailtoUrl`
  (`lib/draft-onay-mail.ts`), Draft Onay maili ile aynı alıcı + CC.
- 48 saat (draft) hatırlatması: metin kullanıcının verdiği şablon (01.10.2026),
  kalan saat dinamik (`kalanSaatMetni`, en yakın tam saat). Konu ilk draft
  mailinin birebir "RE:" li hali ki istemci aynı konuşmada gruplasın. mailto
  var olan maili YANITLAYAMAZ (hep yeni ileti) ve Outlook, gövdesi dolu
  mailto iletisine varsayılan imzayı EKLEMEZ (protokol sınırı) — imza elle
  (İleti > İmza) eklenir. Cut-off hatırlatması ayrı metin/konu ile kalır.

## Birden fazla Proforma No / Lot No (01.10.2026)

- Ayrı kolon YOK: ikinci numara mevcut `proforma_no` / `lot_no` alanına
  `" / "` ayırıcıyla yazılır ("UNEXCCS270826 / UNEXBFB090926"). Parçala /
  birleştir yalnızca `lib/coklu-no.ts` (`noParcala`, `noBirlestir`) ile; en
  fazla 2 numara (`AZAMI_NO_SAYISI`). Bu sayede fatura talimatı, tüm evraklar,
  mailler ve arama ek kod olmadan ikisini birlikte gösterir.
- Düzenleme: Proforma kartı (`components/proforma-card.tsx`) ve Ek Bilgiler'deki
  Lot No → `CokluNoGirisi`. Kartlarda her numara ayrı satır
  (`cokluNoSatirlari` + `CopyableField gosterim`), dar tablo hücrelerinde
  `CokluNoKisa` ("A +1", tamamı tooltip'te). Dosya adlarında "A-B".
- Health Certificate'te iki lot kutuya iki satır sığsın diye `LOT_STIL` ile
  biraz yukarı alınıp küçültülür; diğer evraklarda yer zaten yeterli.
- `ana_siparisler.proforma_no` (sipariş kimliği) tek numara kalır, değişmez.

## Rezervasyon formu — FOB teslimde navlun opsiyonel (05.10.2026)

- Rezervasyon formunda tüm alanlar zorunludur; İSTİSNA: teslim şekli FOB /
  FCA / FAS / EXW ise (navlunu alıcı öder) Navlun ve Lokal Masraf boş
  bırakılabilir, etikette "*" çıkmaz, formun altında açıklama görünür.
  Karar tek yerde: `lib/teslim-sekli.ts → navlunAliciyaAitMi` (teslim_sekli
  serbest metin, kelime olarak aranır: "FOB AMBARLI" da FOB sayılır).
  Girilirse yine kaydedilir. Kullanıcı isteği: IHR-2026-0090 (FOB).
- Commercial Invoice "SHIPMENT TERMS": FOB / FCA / FAS / EXW → teslim şekli +
  YÜKLEME limanı ("FOB AMBARLI PORT"); diğerleri → + varış limanı (değişmedi).
  Tek yer: `lib/teslim-sekli.ts → teslimSekliLimani`. Eskiden FOB'da da varış
  ekleniyordu ("FOB Mariel Port, Cuba" – IHR-2026-0076). Canlı 20 dosyada
  kontrol: sadece 2 FOB dosyası değişti. Arşivlenmiş eski PDF'ler değişmez,
  evrak yeniden üretilince düzelir.
- Fatura Talimatı (PDF + mail metni) FOB grubunda: proforma fiyatı FOB
  sütununa yazılır, CIF "-", navlun girilmiş olsa bile DÜŞÜLMEZ (eskiden
  fiyat "CIF Birim Fiyat" altında çıkıyordu; IHR-2026-0076'da navlun düşülüp
  FOB 106.250 yerine 81.250 çıkıyordu). Kural tek yerde:
  `hesaplaFobFreightCifToplamlari(...).fiyatlarFob` (`lib/cutoff-utils.ts`);
  mail metni aynı kuralı `navlunAliciyaAitMi` ile uygular. Canlı 21 dosya
  eski/yeni PDF karşılaştırması: 18 CIF/CFR birebir, sadece 3 FOB değişti;
  Commercial Invoice HTML'i 21'inde de birebir aynı.
- Birden fazla proforma TEK evrak seti (05.10.2026, BIRRAKA 5 FCL: UNEXBIS170626-1
  100 MTS @410 + UNEXBIS120526 25 MTS @413): büyük proforma yüklenir, sipariş
  takibi "Tek Seferlik Dosya", ikinci no Proforma kartından eklenir, ikinci
  proformanın kalemi Ürün Detayları'na AYRI SATIR (farklı fiyat) eklenir →
  miktar/toplam otomatik güncellenir; CI/PL/Fatura Talimatı/Sigorta tüm
  satırları kullanır. Avans = alınan avansların toplamı (Ödeme kartı), CI'da
  TEK banka çıkar (proformalardaki banka farklıysa kullanıcı seçer).
- Boş navlun/lokal masraf evrakları bozmaz: Fatura Talimatı, ECTN satırları
  ve Ek Bilgiler kartı null değeri "–" gösterir / FOB sütununu hesaplamaz.

## Varış limanı rezervasyonda + ticaret yapılan ülke (08.10.2026)

- Rezervasyon formunda "Varış Limanı *" alanı var ama AYRI KOLON YOK: navlun
  gibi DOSYANIN alanına (`ihracat_dosyalari.varis_limani`) yazılır
  (`buildDosyaPayload`). Böylece Lojistik kartı, Commercial Invoice, fatura
  talimatı ve günlük rapor tek kaynaktan okur. Form dosyanın değeriyle dolu
  açılır; yazım AYNEN korunur (büyük harfe çevrilmez, sadece kırpılır).
  Doğrulama Lojistik kartıyla aynı (`varisLimaniSorunu`: boş / yükleme
  limanıyla aynı / Türkiye limanı olamaz). Rezervasyon kartında da görünür.
- Fatura talimatı (PDF + mail) "Ulke" satırı ikiye ayrıldı:
  "Gidecegi Ulke" = varış limanının ülkesi, "Ticaret Yapilan Ulke" = proformadaki
  BUYER'ın (`alici_adresi`) ülkesi. Ayrı ülke alanı yok; serbest metinden
  `lib/ulke-bul.ts` bulur (TR/EN/FR/ES yazımlar, metnin sonuna en yakın
  eşleşme, aynı yerde en uzun: "EQUATORIAL GUINEA" > "GUINEA"; varışta ülke
  yoksa bilinen liman: MARIEL → KÜBA). Sonuç Türkçe büyük harf (mail ASCII:
  `asciiYap`). Bulunamazsa TAHMİN YOK: "BELIRLENEMEDI - alici adresini kontrol
  edin". Canlıdaki tüm alıcı adresleri/varış limanları doğru tanındı (0091:
  İSPANYA → KÜBA, 0076/0065: MEKSİKA → KÜBA, 0077: MAURİTİUS → KOMORLAR).
  Yeni bir ülke/yazım tanınmazsa `ULKELER` listesine eklenir.
- Daha önce gönderilmiş fatura talimatlarının KAYITLI mail metni
  (`fatura_talimati_metni`) değişmez; PDF her zaman güncel veriden üretilir.
- Ürün başına konteyner adedi (muhasebe, 14.10.2026, 0094: 2 BOUHO @465 +
  2 Ble d'Or @490): PDF ürün tablosunda "Konteyner" + "Miktar (MTS)" sütunları,
  mailde ürün satırının sonunda `[2 konteyner, 50 MTS]`. Tek kaynak
  `lib/urun-konteyner-dagilimi.ts` (saf fonksiyon). Kural Packing List ile
  aynı: konteynerin MARKASI ürün adının içinde geçiyorsa o ürüne sayılır
  (büyük/küçük harf, ' / ’ farkı yok). Marka tek satırı gösteriyorsa kesin;
  aynı marka birden çok satırda (0092: 2 × SAAD, fark proforma/fiyat) ya da
  hiç eşleşme yoksa MİKTARA göre paylaştırılır ve `*` + dipnotla "tahmini"
  işaretlenir. Kısmi eşleşmede eşleşmeyenler sessizce bir ürüne yazılmaz,
  `!` dipnotuyla bildirilir. Çok ürünlü dosyada doğru sonuç için ürün adına
  marka yazılmalı: "ALL PURPOSE WHEAT FLOUR (BOUHO BRAND)".

## Rezervasyon silme

- `konteynerler.rezervasyon_id` FK'si `ON DELETE CASCADE`: rezervasyon
  silinince bağlı konteynerler de silinir. `components/rezervasyon-tab.tsx`
  onay penceresinde bağlı konteyner/DBA/irsaliye sayısını gösterir, DB silmesi
  başarılı olursa konteyner PDF'lerini storage'dan temizler ve
  `syncDevamEdenDosyaTutari`'yı çalıştırır.

## Draft Onay akışı (özet)

- Sayfa: `app/draft-onay/page.tsx`, satır bileşeni:
  `components/draft-onay-karti.tsx`.
- Bir dosyanın bu listede görünmesi için: `draft_bl_dosya_url` dolu olmalı VE
  Commercial Invoice + Packing List + Certificate of Origin + Phytosanitary +
  Health Certificate hepsi `lib/document-readiness.ts`'teki fonksiyonlara göre
  hazır olmalı (bkz. `tamEvrakSetiHazirMi`).
- Durum akışı: Bekliyor → Onayla (ekip) → Gönderildi İşaretle (ekip, mail dışarıdan
  gönderiliyor, sadece işaretleniyor) → [Müşteri Onayladı | Revize İstendi]
  (48 saat yanıtsız kalırsa "Süre Doldu" kırmızı rozeti).
- 48 saat kuralı TEK yerde: `lib/draft-onay-sure.ts` (`draftYanitSonuMs`,
  `draftSuresiDoldu`); süre "Gönderildi İşaretle" anında
  (`draft_mail_gonderildi_tarihi`, gerçek UTC) başlar. Satırda canlı sayaç
  (`components/draft-yanit-sayaci.tsx`) + "Hatırlatma" mailto butonu (süre
  dolana kadar; son 10 saatte kırmızı). Son 10 saate girenler uygulama geneli
  uyarı kartında "Draft Onay 48s" olarak çıkar ve bir kez bildirilir
  (`components/cutoff-uyarilari.tsx`, anahtar gönderim anını içerir). Müşteri
  mail şablonunda "Unless we receive any feedback within 48 hours, it will be
  deemed approved." cümlesi var; süre dolunca satırda "onaylanmış sayılır"
  notu çıkar ama durum otomatik değiştirilmez (01.10.2026).
- Tablo düzeni (revize 01.10.2026): 6 sütun — Dosya/Müşteri, Proforma/Booking,
  İlgili Evraklar, Kalkış/ETA, Durum, Aksiyonlar. Her hücre 2 satır, tüm
  satırlar eşit yükseklikte; 1366 ve 1536 px ekranda yatay kaydırma YOK
  (yeni sütun/buton eklerken bunu ölçerek koru). Durum = rozet + tek satır
  bilgi (yanıt beklenirken 48s sayaç). Aksiyonlarda sadece SIRADAKİ adım
  görünür (Onayla → Gönderildi İşaretle → Müşteri Onayladı/Revize/Hatırlat);
  tamamlanan adımlar Durum hücresinin tooltip'inde adım geçmişi olarak.
- Revize istenirse `draft_onaylandi` / `draft_mail_gonderildi` /
  `draft_musteri_onayi_alindi` bayrakları sıfırlanır (dosya baştan Onayla
  adımına döner), ama `draft_revize_notu/tarihi/isaretleyen` geçmiş kayıt
  olarak silinmez.
- Evrak ikonları (sıra = Taslak Onay Paketi ZIP sırası): 1 CI, 2 PL, 3 Draft BL,
  4 CoO, 5 Phyto, 6 Health, 7 Quality, 8 Fumigation. Quality/Fumigation sadece
  müşterinin `sevkiyat_evraklari` listesinde isteniyorsa görünür/pakete girer,
  müşteriye özel ayarlarla (`lib/musteri-evrak-ayarlari.ts`) ve DRAFT
  filigranıyla üretilir; bilgisi eksikse sarı uyarı ikonu çıkar, pakete
  eklenmez, dosya listeden DÜŞMEZ (01.10.2026). Listeye giriş kriteri
  (`tamEvrakSetiHazirMi`) bilerek değiştirilmedi.
- İlgili Evraklar iki satır (03.10.2026): üst satır DRAFT (yeşil, mevcut
  davranış), hemen altında aynı sırayla ORİJİNAL (mavi, `FileCheck2`). İkisi
  de belgeyi HTML olarak yeni sekmede açar (Evraklar sekmesindeki PDF
  butonlarından daha keskin); orijinal satırı filigransızdır, aynı
  builder'ları kullanır (ECTN dahil) ve veritabanına YAZMAZ. Orijinal BL
  dosyası sistemde olmadığı için BL'nin altı boş bırakılır (sütunlar hizalı).
  Satır etiketi ("Draft/Orijinal") bilerek yok: 1366 px'te tabloyu taşırıyor;
  açıklama sayfa başlığında.
- Sadece **Açık** dosyalar listelenir (`isDosyaAcik`), kapalı dosyalar draft
  evrakları tamamlanmış olsa bile burada görünmez (kullanıcı kararı,
  30.09.2026).

### Müşteriye otomatik mail gönderimi — ASKIDA (karar: 01.10.2026)

- Draft onay / hatırlatma mailleri hâlâ `mailto:` ile kullanıcının kendi
  Outlook'undan gönderiliyor. `mailto` var olan bir maili YANITLAYAMAZ (hep yeni
  ileti açar; konu aynı tutularak istemcide aynı konuşmada gruplanır) ve
  gövdeli mailto'ya Outlook varsayılan imzayı EKLEMEZ.
- Sistemden otomatik gönderim konuşuldu ve kullanıcı kararıyla **askıya
  alındı**. Kural: "mailin spama düşme ihtimali varsa kullanılmaz."
  - Seçenek A (Resend, `bildirim@ihracatasistanim.com`): müşteriye yabancı
    alan adından gittiği için spam riski → REDDEDİLDİ.
  - Seçenek B (Promail SMTP ile `execution@unex.com.tr` adına sistemden
    gönderim): ancak unex.com.tr SPF hatası düzeltilip test gönderimi
    yapıldıktan sonra konuşulabilir.
- Tespit: unex.com.tr maili Promail'de (mx1/mx2.promail.com.tr) ve alan adında
  İKİ ayrı SPF TXT kaydı var (`v=spf1 redirect=_spf.yandex.net` ve
  `v=spf1 +a include:_spf.promail.com.tr -all`) → SPF PermError. Kullanıcıya
  tek kayda indirilmesi (Yandex kaydının silinmesi) söylendi.

## Evraklar listesi satır düzeni (02.10.2026)

- "İhracat Evrakları" satırlarının sağı SABİT düzende: [aksiyon butonları]
  [kalem yuvası] (`components/evrak-ikon-yuvasi.tsx`). Kopyala ikonları
  kullanıcı isteğiyle KALDIRILDI (02.10.2026) — geri eklenmez.
  İkonu olmayan satırda yuva boş ama aynı genişlikte durur; Draft/Orijinal
  butonları tüm satırlarda aynı hizadadır. CI satırındaki ECTN kutusu
  butonların ALTINDA (yanda başlığı kesiyordu). Yeni ikon/buton eklerken bu yuvaları kullan, butonların
  yanına doğrudan ikon ekleme (hizayı kaydırır). İhracatlar sayfasındaki
  `show="both"` görünümü ayrı, bu kurala dahil değil.

- Evraklar sekmesindeki "N taslak evrak müşteri onayı bekliyor / Taslakları
  Müşteriye Gönder" kutusu (`taslak-evrak-mail-section.tsx`) kullanıcı
  kararıyla KALDIRILDI (02.10.2026): taslaklar müşteriye Draft Onay
  akışından gidiyor; kutu sadece 4 evrak türünü sayıyor ve CC/paket/48s
  takibi olmayan ikinci bir yol açıyordu. Geri eklenmez. Sadece okuma
  yapıyordu; `dosya_evraklari` kayıtları etkilenmedi.

## VGM Gönder butonu kaldırıldı (09.10.2026)

- Dosya detayı → Konteynerler sekmesi başlığındaki "VGM Gönder" (mailto
  penceresi, `components/vgm-mail-section.tsx`) kullanıcı isteğiyle
  KALDIRILDI — geri eklenmez. VGM artık "VGM İndir" ile PDF olarak indirilip
  gönderiliyor (`lib/vgm-pdf-builder.ts → indirVgmPdf`); buton tek VGM aksiyonu
  olduğu için ana (ACCENT) görünümde, tüm konteynerlerde VGM girilmişse aktif.
- `ihracat_dosyalari.vgm_gonderildi` kolonu ve `getDosyaAkisDurumu().vgmGonderildi`
  SİLİNMEDİ (eski kayıtların verisi; okuyan ekran yok). Yeni yazan da yok.

## Konteyner no / mühür no düzeltme (10.10.2026)

- Konteynerler sekmesinde her iki hücrede kalem ikonu (`KimlikHucresi`,
  `components/konteyner-tab.tsx`): değere tıklamak eskisi gibi KOPYALAR, kalem
  düzeltme kutusunu açar. Kayıt SADECE Enter / onay ikonuyla (blur ile değil),
  Esc / çarpı vazgeçer; hata varsa kutu açık kalır.
- Kurallar tek yerde: `useKonteynerForm().handleKimlikDuzelt` — karar DB'deki
  GÜNCEL kayda göre. Konteyner no zorunlu + `^[A-Z]{4}[0-9]{7}$`; DBA yüklü
  konteynerin NUMARASI değiştirilemez (DBA yüklenirken belgedeki no ile birebir
  eşleştirildi; hücrede kilit ikonu + açıklama). Mühür no DBA varken de
  değişir (kırılan mühür), boş bırakılabilir. Aynı dosyada aynı konteyner /
  mühür no ikinci kez olamaz (DB'de unique kısıt YOK, kontrol uygulamada).
  `updated_by/at` yazılır; eski değer `denetim_konteynerler` tetikleyicisiyle
  `denetim_kayitlari`na düşer. Daha önce üretilip arşivlenmiş evrak PDF'leri
  değişmez, evrak yeniden üretilince güncel no basılır.

## Yük Sigortası Talimatı — 10. evrak (02.10.2026)

- Evraklar listesindeki 10. satır ("Insurance Policy", sadece müşterinin
  `sevkiyat_evraklari` listesinde sigorta varsa görünür):
  `components/sigorta-talimati-section.tsx`. "İndir" PDF'i doğrudan indirir
  (boş alan varken kapalı); kalem ikonu otomatik alanların düzeltildiği
  pencereyi açar, oradan PDF indirilir. Mail bölümü kullanıcı isteğiyle
  KALDIRILDI (02.10.2026) — geri eklenmez. Veritabanına hiçbir şey yazılmaz.
- Alan kuralları tek yerde: `lib/sigorta-talimati.ts` (şablon, kullanıcının
  verdiği Word dosyası; IHR-2026-0071 ile birebir doğrulandı). Tarih HER ZAMAN
  bugün (Türkiye saati); Gönderici "UNEX GIDA SAN VE TİC LTD ŞTİ", Malın Cinsi
  "BUĞDAY UNU", Taşıma Şekli "KONTEYNER / GEMİ" SABİT. Acente "DRAFT/HAPAG"
  gibi ise hat kısmı alınır (HAPAG → HAPAG-LLOYD, CMA → CMA CGM). Ambalaj
  satırı detaylı ambalajın Türkçesi ("PIECES OF … PP BAGS+KRAFT" → "ADET …
  PP+KRAFT ÇUVAL").
- Butonlar Fatura Talimatı ile aynı koşulda açılır: rezervasyon var ve
  konteynerler tamamlanmış.
- PDF `lib/sigorta-talimati-pdf-builder.ts` (jsPDF, vektör, Roboto TR) —
  TÜRKÇE içerikli tek PDF; "PDF içerikleri İngilizce" kuralının bilinçli
  istisnası. Dosya adı `10- SIGORTA TALIMATI- <booking>- <proforma>.pdf`.

## Sayılar ve varış limanı kuralları (03.10.2026)

- Ürün kalemi miktarları `lib/sayi-oku.ts` (`sayiOku`, `kalemMiktari`) ile
  okunur. `parseFloat("252,45")` 252 verdiği için ESFIRA siparişinde
  "Kalan 3,35 MTS" görünüyordu (doğrusu 2,90). Yeni kodda miktar okurken
  `parseFloat(String(u.miktar_mts ...))` YAZMA, bu fonksiyonları kullan.
- Devam Eden Siparişler'de "Siparişi Tamamla" butonu (onay penceresiyle):
  `ana_siparisler.tamamlandi / tamamlanma_tarihi / tamamlayan` (migration
  `20261003130000_ana_siparis_tamamlama.sql`, canlıya UYGULANDI 03.10.2026).
  Kayıt ve dosyalar silinmez; sadece listeden düşer.
- Varış limanı kuralı (kullanıcı: "varış limanı yükleme limanı ile aynı
  olamaz"): `lib/varis-limani-kontrol.ts`. Boş / yükleme limanıyla aynı /
  Türkiye limanı ise geçersiz.
  - Yeni dosya: geçersizse aynı müşterinin son GEÇERLİ varış limanı yazılır,
    yoksa boş bırakılır; kullanıcıya sarı uyarı + toast. Okunan ham değer
    `ham_veri.varis_limani_duzeltme` içinde saklanır.
  - Lojistik kartı: geçersiz varış limanı KAYDEDİLMEZ (boş bırakmaya izin var).
    Sadece varış limanı değiştirildiyse ve sadece formdaki yükleme limanıyla
    karşılaştırılır (eski kayıtta diğer alanların kaydı engellenmez).
  - YILPORT listede bilerek yok (yurt dışı terminalleri var).
  - Analiz: geçersiz kayıt liman listelerine girmez.
- Veri düzeltmesi: IHR-2026-0076 (ESMAAGRIC, FOB) varış limanı "Ambarlı
  Port" → "Mariel Port, Cuba" (kullanıcı onayı, 03.10.2026). Proforma
  "FOB Ambarlı" yazdığı için yükleme limanı varışa okunmuştu.
- Proforma okuma (edge function `proforma-oku`) talimatı DEĞİŞTİRİLMEDİ;
  koruma uygulama tarafında.

## Evrak yazdırma — tek sayfa kuralı (07.10.2026)

- HTML evrakların iki çıktı yolu var: (1) uygulamanın PDF'i (`lib/html-to-pdf.ts`,
  html2canvas → EKRAN stilleri, 800px genişlik, A4 sınırı ≈1131px), (2) tarayıcıdan
  yazdır / "PDF olarak kaydet" (`@media print` + `@page`). İkincisinde `.sheet`
  min-height'ı basılabilir alanı (A4 − kenar boşlukları; 12mm'de 273mm ≈1032px)
  AŞMAMALI, yoksa `margin-top:auto` footer her zaman 2. sayfaya düşer.
- Quality sertifikası bu yüzden yazdırınca footer'ı 2. sayfaya atıyordu
  (UNEXBFB090926 / IHR-2026-0086). Düzeltme: print'te `min-height: 270mm` +
  hafif sıkıştırma (hücre/boşluk; yazı boyutu aynı). Uzun alıcı metinli 0073 ve
  zorlama vakası dahil tek sayfa; uygulama PDF'i birebir aynı kaldı.
- Commercial Invoice 30.09'da aynı sebeple düzeltilmişti (print min-height:0).
  Fumigation (min-height 1000px < 1032px) ve Packing List (10mm kenar) yazdırınca
  tek sayfa — kontrol edildi. Yeni şablonda bu kurala uy.
- Packing List YAZDIRMA taşması (12.10.2026, IHR-2026-0092, 10 konteyner): basılabilir
  genişlik 190mm = 718px, ekrandaki iç genişlik 736px → ürün açıklaması her satırda 2
  satıra kırılıyor, 8+ konteynerde imza + alt not 2. sayfaya düşüyordu. Düzeltme: print'te
  `.sheet { width:736px; zoom:0.9755 }` (ekran düzeninde dizilip orantılı küçülür).
  Ölçüm (Chromium yazdır): eski 8/10/12 konteyner → 2 sayfa, yeni → 1 sayfa; 5 → 1/1.
  Uygulamanın PDF düğmesi (html2canvas) bu sorunu YAŞAMIYORDU (0092 eski kodla da tek
  sayfa) — taşma, belgeyi yeni sekmede açıp tarayıcıdan yazdırınca oluyordu.
- `lib/html-to-pdf.ts` (12.10.2026): (1) A4'ü %1'den az aşan görüntü tek sayfaya
  oturtulur (`SIGDIRMA_TOLERANSI`): CoO / Phyto / Health 800×1132px olduğundan eskiden
  BOŞ bir 2. sayfa açılıyordu; şimdi tek sayfa, görsel fark yok. (2) `:where(table)` font
  devralma kuralı: ölçümde PL/CI/QC/FC çıktıları eski kodla PİKSEL PİKSEL AYNI (etkisiz,
  güvenlik amaçlı kaldı). Bu iki dosya + `ic-piyasa` e-posta metni ("Bildiren" satırı)
  başka bir oturumda yazıldı, bu oturumda ölçülüp doğrulanarak benimsendi.

## Sipariş takibi — marka / kalem bazlı (07.10.2026)

- Devam Eden Siparişler (İhracatlar sayfası) artık her sipariş KALEMİNİ
  (ürün adı, genelde markayı içerir: "... (SAAD BRAND)") ayrı izler: Sipariş /
  Sevk Edildi / Kalan / Dosyası Açılmamış — FCL (25 MTS) ve çuval
  (MTS×1000/ambalaj kg) cinsinden. Bir kalemdeki fazla diğerinin eksiğini
  KAPATMAZ (eskiden UNEXCCS270826'da 0088'in 10 FCL ASLI'si 5 FCL SAAD
  eksiğini kapatıp siparişi "bitti" gösteriyordu). Fazla sayılan kalem "+x
  FCL fazla", eşleşmeyen kalem uyarı olarak görünür.
- Tek hesap yeri: `lib/siparis-takip.ts` (saf fonksiyonlar), veri:
  `lib/siparis-takip-veri.ts`. Kullananlar: İhracatlar kartı
  (`components/siparis-takip-karti.tsx`), "Siparişe Devam Et" ön dolumu
  (`acikKalemler` = henüz hiçbir dosyada olmayan miktar), Yeni Dosya'daki
  "Mevcut sipariş bulundu" ekranı. Tek kalemli siparişte "Toplam Taahhüt"
  (toplam_mts) esas alınır. Sevk kuralı değişmedi: kapalı dosya = tamamı, açık
  dosya = DBA'lı konteyner oranı.
- Kalem → sipariş: `urun_detaylari[].siparis_id` (şema değişikliği YOK, JSON
  alanı). Boş = dosyanın ana_siparis_id'si, "yok" = hiçbir siparişe
  sayılmaz, id = o sipariş. Ürün Detayları kartında "Sayıldığı sipariş"
  seçimi (aynı alıcının siparişleri). İki proformalı dosya: 0092 = 5 SAAD
  (270826) + 5 SAAD (160926).
- Rezervasyon kaydında kalemleri siparişe göre ORANSAL yeniden yazma
  (`syncDevamEdenDosyaTutari`) artık SADECE kalemler hâlâ otomatik haldeyse
  (`oransalYenidenYazilabilirMi`: boş ya da siparişin tüm kalemleri aynı fiyat
  ve oranda). Markaya özel parti, elle eklenen/silinen kalem, değişen fiyat
  veya etiketli kalem KORUNUR; tonaj konteyner adedini tutmuyorsa uyarı
  çıkar. Eskiden her rezervasyon kaydında bu düzeltmeler sessizce siliniyordu.

## Siparişe Devam Et — Sevkiyat Seçimi (16.10.2026)

- "Siparişe Devam Et" artık dosyayı hemen açmaz: `components/siparis-devam-penceresi.tsx`
  açılır. Her sipariş kalemi için onay kutusu + FCL (varsayılan: eskisi gibi
  dosyası açılmamış miktarın tamamı). FCL dosyalanmamış miktara eşitse KESİN MTS
  kullanılır (252,45 MTS = 10,1 FCL → 252,45; 252,5 değil).
- Detaylı ambalaj ve marka SEÇİMDEN önerilir (düzenlenebilir, "Öneriye dön").
  Eskiden ilk dosyadan AYNEN kopyalanıyordu → 0095 / 0077'deki yanlış çuval
  sayıları. Kural (`lib/siparis-devam.ts` `detayliAmbalajOner`): ilk dosyanın
  metni şablon; kalemin markasını içeren segment aynen (sayı değişir), yoksa ilk
  segment başka markası değiştirilerek türetilir (+ kontrol notu), şablon yoksa
  "PIECES OF 25 KG BAGS (MARKA BRAND)" + not. Segmentler ", " ile birleşir.
  Marka: tüm seçili kalemlerin parantezli markası varsa "SAAD BRAND" /
  "ASLI BRAND & SAAD BRAND", yoksa ilk dosyanın markası.
- Dosyalanmamış miktarı aşan seçim: satırda uyarı + onay kutusu zorunlu.
- Kap kontrolü (`kapUyumsuzlugu`): detaylı ambalajdaki kap toplamı ≠
  konteynerlerin "Kap Adeti" toplamı ise Lojistik kartında ve Konteynerler
  tablosunun TOPLAM satırında uyarı. Sadece tüm konteynerler eklenmiş ve
  hepsinin kap adedi girilmişse kontrol edilir (yanlış alarm yok). Fatura
  talimatı / CoO / Phyto / Health / sigorta metni AYNEN kullanır; CI / PL tek
  segmentte sayıyı zaten konteynerden düzeltir.
- Kapsam dışı: Yeni Dosya'daki "Mevcut sipariş bulundu" (yüklenen proformadan)
  akışı değişmedi. Veritabanı değişikliği YOK. Testler: saf fonksiyonlar tsx ile
  (28 senaryo), pencere Playwright ile.

## Draft Onay — Kapanan dosyalar ve arama (16.10.2026)

- `/draft-onay` iki sekme: **Aktif Dosyalar** (28.09 kuralı aynen: açık + tam evrak
  seti) ve **Kapanan Dosyalar** (kapalı + Draft BL'li, en yeni üstte). Şema değişikliği YOK.
- Kapanan satır `DraftOnayKarti arsiv` modunda: SALT görüntüleme — evraklar (draft/
  orijinal) ve Taslak Onay Paketi; Onayla / Gönderildi / Müşteri Onayladı / Revize /
  Hatırlat YOK, kırmızı süre vurgusu yok, durum "Kapalı" (+ müşteri onay tarihi).
  Her standart belge `check*Readiness` ile kontrol edilir; eksikse uyarı ikonu,
  eksik belgeli dosyada paket indirilmez (toast ile eksikler).
- Arama (iki sekmede birden, sayaçlar "bulunan/toplam"): dosya no, müşteri,
  proforma, booking, konteyner, fatura no, BL no. Büyük/küçük harf ve I/ı/İ/i farkı
  gözetilmez (`IHR` tr-küçük harfte `ıhr` olur — `sadelestir` ı→i yapar); boşluk/tire
  gözetmeden de eşleşir. Sonuç diğer sekmedeyse "Sonuçlara git" bandı.

## Cut-off tamamlandı + Gümrük Beyannamesi (16.10.2026)

- Kural TEK YERDE: `lib/cutoff-utils.ts` → `talimatCutoffTamamMi` (konşimento
  talimatı VEYA Draft BL yüklü) ve `beyannameCutoffTamamMi` (beyanname dosyası
  yüklü). Tamamlanan cut-off'ta geri sayım / uyarı YOK, tarih yine görünür.
- `CutoffSayac` → `tamamEtiketi` verilirse sayaç çalışmaz, tarih + yeşil rozet
  ("Talimat gönderildi" / "Draft BL alındı" / "Beyanname yüklendi"; `tamamHref`
  ile belge açılır). Kullanıldığı yerler: Ana Panel sütunları + "Cut-off
  Yaklaşan" filtresi, Rezervasyon kartı, üst uyarı bandı (`cutoff-uyarilari`).
- Kontrol Merkezi: beyanname cut-off "tamam" = beyanname yüklü VEYA fatura
  kesildi (fatura kuralı yükleme alanı öncesi dosyalar için korunur).
- Beyanname: `components/beyanname-section.tsx` (Sevkiyat Evrakları, Draft BL
  altı). Kolonlar `ihracat_dosyalari.beyanname_dosya_url / _adi /
  _yukleme_tarihi` (migration `20261016110000_beyanname_dosyasi.sql`, sadece
  ekleme). Depo: `konsimento-talimatlari/<dosya_id>/beyanname/...` (mevcut
  politika). PDF/JPG/PNG ≤ 20 MB, AI kontrolü yok. Dosya silinince depo
  temizliğine dahil (`dosyaninStorageUrlleriniTopla`). Kolonlar
  `DOSYA_LISTE_KOLONLARI`'nda (draft_bl_dosya_url de oraya taşındı) — migration
  uygulanmadan kod yayına alınırsa listeler hata verir: ÖNCE SQL.

## Proforma Oluşturucu (17.10.2026)

- SADELEŞTİRME (kullanıcı geri bildirimi 17.10.2026: "çok karışık, adım adım ne
  yapacağımı anlamadım, önizleme yok"): günlük kullanım TEK EKRAN —
  `app/proformalar/page.tsx` = **Yeni Proforma**. Üç kutu: 1 Müşteri (aranabilir
  liste: kayıtlı kartlar + geçmiş dosyalardaki kartsız alıcılar; seçilince son
  proforma / son dosyadaki adres, ilgili kişi, ÜRÜNLER, teslim, ödeme, sevkiyat,
  banka gelir; listede yoksa "Yeni müşteri: …" ile ünvan yazılır, kod önerilir),
  2 Ürünler (iki katlı satır kartı; tutar / FCL / çuval otomatik), 3 Ödeme ve
  Sevkiyat (+ "Diğer ayrıntılar": proforma no, tarih, paketleme, marka satırı,
  evraklar — hepsi otomatik, elle değiştirilince "Otomatik" ile geri alınır).
  Sağda CANLI ÖNİZLEME (indirilecek PDF'in kendisi, blob iframe; başsız test
  tarayıcısında beyaz görünür, gerçek Chrome'da çizer). Altta eksik listesi +
  "Taslak PDF İndir". "Geçmişten Aktar" KALDIRILDI (liste geçmişi zaten gösterir).
- Bu teslimatta veritabanına HİÇBİR ŞEY YAZILMAZ (kaydetme / proforma listesi /
  Harun Bey "Onayla ve İmzala" sonraki teslimat; imzalı PDF kayıtsız kalmasın).
  İndirilen dosya `UNEX…-TASLAK.pdf` (imzasız).
- Ayarlar (sağ üst "Ayarlar", `components/proforma-sekmeler.tsx`):
  `/proformalar/musteriler` (Müşteri Kartları, isteğe bağlı), `/proformalar/urunler`,
  `/proformalar/sablon`. Kart varsa bilgiler karttan, ürünler son dosyadan gelir.
- Kurallar TEK YERDE `lib/proforma/belge.ts` (saf): `sayiCoz` ("252,45",
  "50.000"), proforma no UNEX+KOD+GGAAYY, geçerlilik tarih+4, paketleme
  "15.000 PIECES OF 25 KG PP BAGS (ASLI BRAND) // …", marka satırı "ASLI BRAND &
  SAAD BRAND", 1. sayfa ikinci kutu ödeme metninden (`%30 ADVANCE` → ADVANCE =
  toplam×%30; "50.000 USD DEPOSIT" → DEPOSIT 50.000; diğer → BALANCE = toplam),
  `eksikler`, `belgeOlustur` → `ProformaBelgesi`.
- PDF `lib/proforma/pdf.ts` (jsPDF, vektör): DRAFT_Proforma__Contract.xlsx
  ölçüleri birebir (sütun karakter × 5,25 pt, satır pt, sol 0,25 in, üst 0,75 in,
  gri F2/D9/BF/A6, ince/kalın çizgi, logo / imza konumları). Yazı tipi Roboto
  Condensed (`lib/fonts/roboto-condensed-base64.ts`, OFL; Aptos Narrow ile harf
  genişliği ~%0,4 fark). [29.10.2026: Sayfa 2 artık "1) …" listesi DEĞİL — bkz. aşağıda sozlesmeSatirlari.] Sığmazsa
  `sik` kademesi (boşluk daralır → yazı 1 pt küçülür); 4 ürün + uzun açıklama
  3 sayfada kalıyor (test edildi). Bilinçli farklar: tarihler her yerde
  dd/mm/yyyy (şablonda sayfa 2 mm-dd-yy idi), "10-Insurance" → "10.".
- Veri temeli (migration `20261017120000_proforma_veri_temeli.sql`, canlıda
  UYGULANDI 17.10.2026): `ihracat_musterileri` (kod ^[A-Z]{2,6}$ tekil, unvan
  tekil), `ihracat_urunleri` (ad MARKA HARİÇ), `proforma_ayarlari` (NULL =
  varsayılan). RLS: şirket + `ic_sayfa_yetkisi('proformalar')`. Yetki:
  `proformalar` (sayfa; bbt@, ihracat@, volkandurgut.tr@) + `proforma_imza`
  (işlem; SADECE ihracat@ — Harun Bey). Yedekleme v13'te yeni tablolar var
  (deneme: 29 tablo, geri yükleme testi 27/27); geri yükleme betiğine eklendi.
- Sabit metinler `lib/proforma/sabitler.ts` (taslaktan AYNEN, sadece kesin yazım
  hataları düzeltildi). Insurance Policy SADECE CIF/CIP'te basılır. Bankalar tek
  kaynak `lib/bankalar.ts`; proformada USD + EUR hesapları birlikte.
- Sıradaki teslimat: proforma kaydı (tablo + migration), proforma listesi,
  Harun Bey "Onayla ve İmzala" (imzalı PDF, kilit, revizyon), yeni müşterinin
  imzada karta dönüşmesi; sonra Yeni Dosya Aç entegrasyonu.

## Proforma Yükle — AI asistan görünümü (25.10.2026)

- Kullanıcı: "Yeni dosya aç, Proforma Yükle olarak; AI ajanı gibi modern, sadece PDF yükle
  gibi kalmasın". Menü / sayfa başlığı / Kontrol Merkezi boş durum düğmesi "Proforma Yükle"
  (ikon `FileUp`); Yetkilendirme etiketi "Proforma Yükle (yeni dosya)". ADRES `/yeni-dosya` ve
  yetki anahtarı `yeni_dosya` DEĞİŞMEDİ (yer imleri / yetkiler bozulmasın).
- Görünüm `components/proforma-asistan.tsx`: `ProformaAsistanYukleme` (asistan başlığı,
  hitaplı karşılama `kullaniciHitabi`, okunan bilgi etiketleri, sürüklerken yanan alan,
  dosya çipi + kaldır, "Proformayı Oku ve Dosyayı Hazırla"), `ProformaAsistanIlerleme`
  (adımlar sayfanın GERÇEK `asama` durumuna bağlı: okuma → liman → siparis → dosya; sahte
  zamanlayıcı yok, sadece saniye sayacı), `ProformaOkumaOzeti` (dosya açılmadan önce
  alıcı / proforma no / tutar / miktar / teslim-ödeme / limanlar; kritik alan boşsa
  "Okunamadı — dosyada kontrol edin", varış limanı düzeltme notu burada).
- İş mantığı DEĞİŞMEDİ: `proforma-oku` çağrısı, `varisLimaniniDogrula`, ana sipariş soruları,
  `createDosya` insert gövdesi (sadece dönüşe `dosya_no` eklendi), proforma PDF arşivi.
  Okuma hatası artık ayrı mesaj ("Proforma okunamadı…", dosya seçili kalır); kayıt hatası
  eski mesaj. PDF kontrolü uzantıya da bakar (bazı Windows'ta tür boş gelir).
  Başarı ekranı ve rezervasyon adımında "İhracat dosyası oluşturuldu · IHR-…" +
  "Dosyayı Görüntüle". Test scratchpad `proforma/test.py` 29/29 (okuma/liman/sipariş
  adımları, özet, tek seferlik / takip başlat / mevcut sipariş, okuma hatası, mobil 390).
  `yenidosya_test.py` / `devam_test.py` eski düğme adını ("Dosyayı Oluştur") kullanır.

## Evrak hazırlık uyarısı — "Bekleniyor: …" (25.10.2026)

- Kullanıcı: "CI hizasındaki sarı ünlem (üzerine gelince eksikler) kalksın; yerine orada
  yanıp sönen uyarı, hangi belgeler yüklenince evrak oluşacak". Evraklar listesindeki 7 evrak
  (`evrak-olustur-buttons.tsx` → `renderEvrakButonlari`, tek satır ve İhracatlar çekmecesindeki
  "both" görünümü) + Sigorta talimatı (`sigorta-talimati-section.tsx`) artık InfoTooltip yerine
  `components/evrak-hazirlik-uyarisi.tsx` (`EvrakHazirlikUyarisi`) gösterir:
  "● Bekleniyor: Fatura · Konşimento talimatı". Nokta yanıp söner + kenar hafifçe ışıldar
  (`globals.css` `.evrak-uyari-nokta/.evrak-uyari-nabiz`; "hareketi azalt" ayarında durur).
  Alan ayrıntısı (Fatura: Fatura No, Fatura Tarihi …) title + aria-label'da.
- Alan → kaynak eşlemesi TEK YER `lib/evrak-hazirlik-kaynak.ts` (`eksikKaynaklari`, iş akışı
  sırası: Proforma bilgileri · Lojistik bilgileri · Rezervasyon · Konteyner bilgileri · Fatura ·
  Konşimento talimatı · Draft BL · Ek Bilgiler). `document-readiness.ts` / `sigorta-talimati.ts`'e
  YENİ eksik etiketi eklenirse buraya da eklenir (eklenmezse kaybolmaz, kendi adıyla en sonda
  çıkar; birim testi tüm etiketlerin eşlendiğini denetler). Sigorta engeli: rezervasyon yoksa
  "Rezervasyon", konteyner eksikse "Konteyner bilgileri (1/2)".
- Hazırlık KURALLARI, butonlar, Draft/Orijinal hizası DEĞİŞMEDİ. Satır: telefonda uyarı başlığın
  altına iner (flex-wrap); geniş ekranda başlık tam kalır, uyarı kendi içinde 2 satıra kırılır.
  InfoTooltip bileşeni diğer sayfalarda kullanılmaya devam ediyor (silinmedi).
- Testler (scratchpad `evrak/`): eşleme birim 6/6 (35 etiket), Playwright 19/19 (CI/QC/Health/
  Sigorta metinleri, BL'de uyarı yok, hazır dosyada uyarı yok + Draft hizası, hareketi azalt,
  mobil 390), İhracatlar çekmecesi; e2e2/3/5/8 + proforma regresyon geçti.

## DBA Otomatik Yükleme (20.10.2026)

- Kılavuz: `docs/kantar-dba-otomatik.md`. Solas (kantar PC, DESKTOP-61P8TC5, Win10 Pro
  22H2) DBA'yı `C:\Truck Scale\DBA\<12 hane belge no>_<yükleten>.pdf` olarak yazar
  (belge no = kantar no 2587 + yıl + sıra). Dosya adında konteyner no YOK; PDF'in
  içinde (JasperReports, GERÇEK METİN katmanı).
- Kantar PC görevi `scripts/kantar-dba/dba-ajan.ps1` (Görev Zamanlayıcı, SYSTEM, her
  dakika; PS 5.1 uyumlu, SADECE ASCII). İş kuralı İÇERMEZ; PDF'i edge function
  `dba-otomatik`e gönderir (verify_jwt KAPALI; yetki `x-cihaz-anahtari`, DB'de sadece
  SHA-256 özeti, `kantar_cihazlari`). Solas klasörüne YAZMAZ. Durum `C:\UnexDBA\durum.json`,
  anahtar DPAPI LocalMachine `anahtar.dat`, klasör izni SYSTEM + Yöneticiler (SID ile).
  Kurulum `kurulum.ps1` (önce sunucuyla dener, sonra kurar), kaldırma `kaldir.ps1`.
- PDF okuma `supabase/functions/_shared/dba-metin.ts` (saf TS, YAPAY ZEKÂ YOK): unpdf
  metni etiketleri ayrı / değerleri ayrı bloklarda verir → KONUMA göre (aynı satır,
  sağ sütun) eşlenir. Çift kontrol: sayfada tek ISO 6346 geçerli konteyner no, belge no
  = dosya adı, kantar no + Unex VKN, ağırlık tutarlılığı, plaka biçimi. Şüphede
  "okunamadi" (elle yüklenir). pdf.js aldığı ArrayBuffer'ı detach eder → okuyucuya KOPYA.
- Karar TEK YERDE (migration `20261020100000_dba_otomatik_yukleme.sql`):
  `dba_otomatik_esles` → `dba_otomatik_degerlendir` (yazmaz) → canlıda PDF depoya
  (elle yüklemeyle aynı yol `dba/<dosya_id>/<konteyner>_<ms>.pdf`) → `dba_otomatik_uygula`
  (satır FOR UPDATE, koşullar yeniden, `dba_dosya_url is null` koşullu yazım; olmazsa
  PDF geri silinir). ASLA üzerine yazmaz. `konteynerler (company_id, dba_belge_no)` TEKİL
  indeks (aynı DBA iki konteynere yazılamaz). Denetim kaydında `degistiren_email =
  dba-otomatik`. `dba_kontrol_sonucu.kaynak = 'otomatik'` (panelde "Oto" rozeti).
- `kantar_cihazlari.canli = false` = DENEME MODU (okur/eşleştirir/kaydeder, konteynere ve
  depoya YAZMAZ). Canlıya geçiş/geri alma tek UPDATE; acil durdurma `aktif = false`.
- Durumlar (`dba_otomatik_kayitlari`, belge başına tek satır): yuklendi, eslesti (deneme),
  zaten_yuklu, beklemede (10 dk'da bir, 72 saat), eslesmedi, cakisma (30 dk, 72 saat),
  okunamadi, yoksayildi. "yuklendi/eslesti" sonradan "zaten_yuklu"ya düşürülmez.
  Görev `tekrar_dk`'ya uyar (null = bir daha gönderme); ağ/5xx hatasında 2/5/10/30 dk.
- Kantar Paneli `components/kantar-dba-otomasyon.tsx`: `kantar_dba_otomasyon_durumu()` +
  `dba_otomatik_yoksay()` (kantar yetkisi + kendi şirketi). Cihaz yoksa / fonksiyon yoksa
  HİÇBİR ŞEY göstermez. Tablolar istemciye kapalı (sadece bu iki RPC).
- `x-islem: dogrulama` (cihaz anahtarıyla, SALT OKUNUR): kayıtlı DBA PDF'lerini okuyup
  sistemdeki değerlerle karşılaştırır (`?bas=0&adet=10`).
- Yedek: iki tablo `YEDEKLENECEK_TABLOLAR` + geri yükleme `TABLO_SIRASI`'nda.
- "Yükleten Ünvan" BOŞ olabilir (`BOS_OLABILIR`): Eylül belgelerinin 32'sinde operatör boş
  bırakmış; yapay zekâ 5'ine liman adı yazmıştı. Boşsa Solas dosyayı `<12 hane>_.pdf`
  adlandırır → görev deseni `^\d{12}_.*\.pdf$` (görev v1.0.1).
- CANLI DOĞRULAMA (20.10.2026, edge function v2, `dogrulama`): kayıtlı 174 DBA'nın 174'ü
  okundu; konteyner no / plaka / dara / VGM / tartım / payload / araç boş 174'ünde birebir;
  tek fark 5 belgede yapay zekânın yanlış yükleteni. 18 eşzamanlı istekte platform 7'sine
  503 BOOT_ERROR verdi (kod hatası değil; görev tek tek gönderir, 503'te 2 dk sonra dener).
  Doğrulamada kullanılan ilk anahtar sohbette paylaşıldığı için İPTAL edildi
  (`aktif=false`); kantar PC için yeni anahtar üretildi. `yedekleme-gonder` v14: 31 tablo,
  geri yükleme testi 29/29.
- KONTEYNER SONRADAN GİRİLİRSE (20.10.2026, kullanıcı isteği): görev 1.1.0 "beklemede"
  belgeleri her dakika PDF'siz `x-islem: bekleyen` ({"belgeler":[...]} ≤50) ile sorar;
  sunucu (edge function v3, kayıt + `dba_otomatik_esles`, SALT OKUNUR, sinyal yerine
  geçer) hâlâ beklemede OLMAYANLARI `hazir` döner, görev onları aynı çalışmada gönderir
  → konteyner eklendikten 1–2 dk sonra DBA yüklenir. 1.1.0+ görevde beklemedeki PDF'in
  yedek tekrarı 60 dk (eski görevde 10). Veritabanı değişikliği YOK.
  Görev güncelleme kantar PC'de `guncelle.ps1` (anahtar istemez).
- ELLE TARTIM (26.10.2026, kullanıcı: "DBA tartımı yetkili kantarımızda unutuldu, liman
  girişinde yapıldı, DBA'yı yükleyemiyoruz"; ilk vaka CXDU1012624 / IHR-2026-0103):
  "Yüklendi" her yerde (44 yer) `dba_dosya_url` doluluğuna bağlı olduğu için elle kayıt da
  "ELLE GİRİLEN TARTIM KAYDI — resmî DBA değildir" PDF'i üretip (`lib/elle-tartim-pdf.ts`,
  jsPDF + Roboto) DBA yerine bağlar; aynı kolonlar (plaka, tare_kg, vgm_kg, dba_dosya_*,
  dba_yukleme_tarihi, dba_kontrol_sonucu). `dba_belge_no` BOŞ (dba-otomatik doğrulaması
  belge nosuz kaydı atlar); ayırt edici `dba_kontrol_sonucu.elle_giris = true` (konteyner
  sekmesi + Kantar panelinde amber "Elle" rozeti). VGM boşsa net + dara (SOLAS metot 2,
  vgm-pdf-builder ile aynı tanım). `tartim_tarih_saat` = çıkış zamanı, DBA biçiminde
  ("DD.MM.YYYY HH:MM:SS") → rapordaki yüklendiği gün doğru. Saf doğrulama/kayıt
  `lib/elle-tartim.ts`; yazım `useDbaUpload().elleTartimKaydet` (sadece DBA'sı boş
  konteynere, `.is('dba_dosya_url', null)`); arayüz Konteynerler sekmesinde "Bekleniyor"
  altındaki "Elle gir" → `components/elle-tartim-penceresi.tsx`. Geri alma = DBA'yı kaldır
  (X; PDF de silinir). Veritabanı değişikliği YOK. Test scratchpad `elle/` (19 kontrol + PDF).
- ELLE YÜKLEME KORUMASI (20.10.2026, `lib/hooks/use-dba-upload.ts`, tek kullanan Kantar
  Paneli): başlamadan güncel kayıt okunur (DBA doluysa yeşil "zaten yüklü" bilgisi, AI
  okuma / depo yükleme YOK), yazım `.is('dba_dosya_url', null)` koşullu; 0 satırsa
  "zaten yüklü" + yüklenen PDF geri silinir. Eski "yeniden yüklemede eski PDF'i sil"
  yolu kaldırıldı (DBA değiştirmek = Konteynerler sekmesinde kaldır + yükle).
  `kantar-dba-otomasyon` beklenmeyen RPC yanıtında paneli çökertmez (biçim kontrolü).
- KURULUM İZİN HATASI (20.10.2026): ilk kurulum `icacls ... (OI)(CI)F /T` ile dosyaları
  İZİNSİZ bırakıyordu (görev sonucu 1, günlük yok). Düzeltme: izin önce sadece klasöre,
  sonra `icacls "C:\UnexDBA\*" /reset /T` + okunabilirlik kontrolü.
- Testler (scratchpad): okuyucu 25 kontrol (3 gerçek DBA + 5 DBA olmayan PDF + 13 bozuk +
  yükleten boş), SQL 49 kontrol + eşzamanlılık, edge function 45 (yerel PG + Node), görev 31, elle yükleme koruması Playwright 10
  (pwsh 7, tr-TR kültürü). Windows'a özel kısımlar (DPAPI, Görev Zamanlayıcı, icacls) sadece
  ayrıştırıcıyla kontrol edildi; kurulum betiği her adımı doğrulayıp raporlar.

## Sevkiyat belgeleri depoda ayrı mı? (28.10.2026)

- Kullanıcı: "DBA, fatura, Draft BL, konşimento, beyanname, proforma — bunların hepsi
  veritabanında neden ayrı tutulmuyor?" (yedek mailindeki tek satır).
- CEVAP: ayrı tutuluyor. DB: `ihracat_dosyalari.{fatura,konsimento,draft_bl,beyanname,proforma}_
  dosya_url/_adi/...`, `konteynerler.{dba,irsaliye}_dosya_url`. Depo: tek kova
  "konsimento-talimatlari" (adı tarihsel; kayıtlı bağlantılar bu ada bağlı → TAŞINMAZ), her tür
  kendi klasöründe: `dba/<dosya>/`, `fatura/<dosya>/`, `irsaliye/<dosya>/`, `<dosya>/draft-bl/`,
  `<dosya>/beyanname/`, `<dosya>/proforma/`, kökte `<dosya>/<ad>` = konşimento talimatı.
  28.10 canlı: DBA 223 (130,8 MB), Fatura 32, Draft BL 32, Konşimento 21, Proforma 13, Beyanname 8.
- Yedek maili (`yedekleme-gonder` v22): `sevkiyatBelgeTuru(yol)` (mail.ts) ile kova altında tür
  bazında döküm; `belgeTurleri` deneme yanıtında da döner. Ayrıca `satin_alma_urunleri` gece
  yedeğine eklendi (geri yükleme testi tabloları otomatik tanır).
- Test: `scratchpad/yd/test.mjs` (yol sınıflandırma + mail sırası/konumu).

## Quality belgesi kontrolleri (28.10.2026)

- Kullanıcı: "Quality belgesi için gerekli kontrolleri sağlayalım… güncel sevkiyat bilgilerine
  göre hazırlanması gerekiyor. Aynı üründen iki satır olduğunda tek ürün olarak geçsin."
- `lib/urun-tanimi.ts` `urunTanimiTekil(urun_tanimi, ham_veri)`: urun_tanimi hâlâ otomatik
  birleşimle (yeni-dosya: `description || urun_adi` + ", ") aynıysa proforma satır adları
  tekilleştirilir (harf/boşluk/’ farkı yok; ilk yazım + sıra korunur). Elle değiştirilmiş
  metne dokunulmaz (tek istisna: tamamen aynı parçalar "X, X"). Canlı: 33 dosyadan 5'inde
  tekrar vardı (0072, 0075, 0081, 0102, 0103), beşi de otomatik. Veri DEĞİŞMEZ.
  ŞİMDİLİK yalnız Quality "Description of goods" kullanır (CoO / Phyto / Health / PL
  varsayılan ürün adı hâlâ ham urun_tanimi — kullanıcıya soruldu).
- `checkKaliteSertifikasiReadiness`: konteyner sayısı rezervasyon adetleri toplamından az →
  "Konteyner girişi eksik (x/y) - B/L ağırlığı eksik hesaplanır", fazla → "Konteyner sayısı
  rezervasyondan fazla"; belge oluşmaz (Draft Onay paketinde "eklenmeyenler"e yazılır).
  Rezervasyonda adet yoksa eski davranış.
- `app/dosya/[id]` ve `app/draft-onay` rezervasyonları `olusturma_tarihi, id` sırasıyla
  çeker (önce SIRASIZDI; tüm belgeler gemi/sefer/liman için `rezervasyonlar[0]` kullanır,
  güncellenen satır sona kayabiliyordu). Canlıda şu an çok rezervasyonlu dosya yok.
- AÇIK KONU (kullanıcıya soruldu, değiştirilmedi): "Date of inspection = Production Date + 1"
  kuralı (30.09.2026 talimatı). Açık dosyalarda muayene tarihi konteyner girişinden ÖNCE
  (0102: 16.10 vs 21.10; 0103: 21.10 vs 22-23.10; 0104: 21.10 vs 24-26.10) — belge metni
  "numune yükleme sırasında alındı" diyor. Ayrıca 0103 varış limanı "TEMA PORT, BASIS".
- Test: `scratchpad/qc/test.mjs` (17 vaka), `qc/uctan.mjs` (builder + hazırlık).

## Konşimento talimatı hatırlatması (27.10.2026)

- Kullanıcı: "Bütün konteyner girildiğinde konşimento talimatı gönderilebilir anlamına geliyor."
  Alıcı operation@unex.com.tr, CC bbt@ / execution@ / export@. Hatırlatma maili + talimatta
  istenen dosya bilgileri (fatura talimatı gibi), personel excelden bilgi toplamasın. Örnekler:
  AKKON (AKKIST26050686) Word formu, HAPAG/CRISA (37983286) PDF. Kararlar (AskUserQuestion):
  OTOMATİK + elle tekrar; canlıya ilk geçiş TEST adresine.
- Migration `20261027140000_konsimento_hatirlatma.sql`: tablo `konsimento_hatirlatmalari`
  (dosya başına TEK satır; durum bekliyor/gonderiliyor/gonderildi/hata/atlandi; tetik
  otomatik/elle; son gönderimin test/alıcı/cc; gönderim sayısı). Tetikleyiciler: konteyner
  INSERT, konteynerin dosya_id değişimi, rezervasyon konteyner_adedi değişimi →
  `kh_tamamlanma_kontrol`: rezervasyon adedi > 0, eklenen = adet, konşimento talimatı
  YÜKLENMEMİŞ, BL no YOK, talimat cut-off / gemi kalkışı 3 günden eski DEĞİL → kuyruk
  (`on conflict do nothing`: ikinci kez otomatik gitmez). Konteyner DÜZENLEMEK tetiklemez.
  Tetikleyici ASLA hata fırlatmaz (warning; konteyner kaydı etkilenmez). Kuyruk RPC'leri
  (`kh_kuyruk_al` kilitler + mail verisi, `kh_sonuc`, `kh_bekleyen_var`) SADECE service_role;
  `kh_elle_iste` authenticated + dosya okuma politikasıyla aynı rol kuralı (admin / ihracat /
  muhasebe / süper admin), tüm konteynerler şart, 2 dk tekrar koruması. Hata → 10 dk sonra,
  en fazla 3 deneme. Otomatik satır işlenmeden talimat/BL girildiyse `atlandi`.
- Edge function `konsimento-hatirlatma` (verify_jwt AÇIK): `isle` (cron, anon; yanıtta sadece
  sayılar) ve `elle` (kullanıcı oturumu, hemen gönderir). Mail şablonu
  `_shared/konsimento-hatirlatma.ts` (saf): rezervasyon (booking, acente, gemi/sefer, limanlar,
  navlun PREPAID / FOB grubunda COLLECT), taraflar (shipper SABİT Unex bloğu + vergi no;
  consignee = dosya.consignee yoksa proforma alıcısı + uyarı; notify = ham_veri.notify yoksa
  "Alıcı ile aynı" + uyarı), mal tanımı TR/EN (BUĞDAY UNU / WHEAT FLOUR sabit, ambalaj
  `ambalajTurkce`, net/brüt), GTİP 11010015 SABİT, kap adedi, konteyner tablosu + toplam,
  dosya/proforma/lot/beyanname no, talimat cut-off (geçtiyse kırmızı), "Dosyayı uygulamada aç"
  (`/dosya/<id>?tab=evraklar`). FİYAT YOK. Booking no gövdede (operasyon maili; günlük rapor
  kuralı burada geçerli değil), konuda yok.
- MOD: secret `KONSIMENTO_HATIRLATMA_CANLI=evet` DEĞİLSE mail SADECE
  `KONSIMENTO_HATIRLATMA_TEST_ALICISI` (varsayılan mesensei282@gmail.com) adresine, "[TEST]"
  konulu ve sarı şeritte canlı alıcılar yazılı gider. Alıcılar secret ile değişir:
  `KONSIMENTO_HATIRLATMA_ALICI`, `KONSIMENTO_HATIRLATMA_CC` (varsayılanlar
  `_shared/konsimento-hatirlatma-sabitler.ts`).
- pg_cron `konsimento-hatirlatma` `*/2`: `net.http_post(...) where public.kh_bekleyen_var()`
  → kuyruk boşken fonksiyon çağrılmaz. Komut `docs/felaket-kurtarma.md` adım 6.
- Uygulama: `KonsimentoTalimatiSection` başlığının altında şerit (sadece kayıt varsa ya da tüm
  konteynerler girilmiş ve talimat yüklenmemişse): hazırlanıyor / gönderildi (TEST rozeti, alıcı,
  CC, kaçıncı gönderim) / hata / atlandı + "Hatırlatmayı gönder / Tekrar gönder / Tekrar dene"
  (talimat yüklenince düğme gizli). Kuyruktayken 20 sn'de bir tazelenir.
- Ortak kurallar TEK YERE taşındı: `_shared/ihracat-ortak.ts` (`navlunAliciyaAitMi`,
  `ambalajTurkce`); `lib/teslim-sekli.ts` ve `lib/sigorta-talimati.ts` yeniden dışa aktarır
  (davranış birebir aynı).
- Gece yedeği: `konsimento_hatirlatmalari` BİLEREK yedekte değil (gönderim günlüğü; kaybı
  veri kaybı değildir).
- CANLI (27.10.2026): migration `konsimento_hatirlatma` uygulandı (7 fonksiyon; kuyruk
  RPC'leri anon/authenticated'a KAPALI, `kh_elle_iste` sadece authenticated doğrulandı).
  Edge `konsimento-hatirlatma` v1 (duman: `isle` 200 `{gonderilen:0}`, anonla `elle` 403).
  pg_cron jobid 6 `konsimento-hatirlatma` `*/2` (anahtar `gunluk-yedek-maili` işinden).
  MOD: TEST (secret `KONSIMENTO_HATIRLATMA_CANLI` girilmedi) → mailler mesensei282@.

## Kantar Paneli — Sevkiyat Durumu + müşteri kodu (28.10.2026)

- Kullanıcı: "Kantar panelinde hangi sevkiyattan kaç tane dolu gözükebilmeli. Çuval isimleri,
  konteyner no, mühür no, müşteri ismi (şifrelenecek, anlaşılabilir şekilde)." Gizleme biçimi
  kullanıcı seçimi (AskUserQuestion): **proformadaki müşteri kodu** (CCS, CME, IKY, ARH).
- GÜVENLİK DÜZELTMESİ: `kantar_dosya_listesi()` kantara TAM `alici_firma` döndürüyordu; gizleme
  yalnız tarayıcıdaydı (geliştirici araçlarında tam ad görünürdü). Kantar rolü
  `ihracat_dosyalari`nı doğrudan okuyamaz (RLS rol bazlı) → tek kaynak bu fonksiyondu.
  Migration `20261028120000_kantar_musteri_kodu.sql` (SADECE fonksiyon; tablo/veri değişmez):
  `kantar_musteri_kodu(proforma_no, alici_firma)` (ilk proforma "UNEX<KOD><rakam>" → KOD; yoksa
  ünvanın baş harfleri — hukuki ekler ve tek harfler hariç, en fazla 4; yoksa "—"),
  yeni `kantar_sevkiyat_listesi()` (alıcı adı YERİNE `musteri_kodu`), eski
  `kantar_dosya_listesi()` imzası aynı ama `alici_firma` kolonu artık KOD döner. anon'a kapalı.
  İstemci kopyası `lib/kantar-sevkiyat.ts musteriKodu` BİREBİR (yalnız migration öncesi yedek
  yolda: yeni fonksiyon yoksa PGRST202 → eski fonksiyon + istemcide kod). Canlı 33 dosyanın
  33'ünde proforma kodu çıktı.
  CANLI (28.10.2026): migration uygulandı; kantar@ oturumuyla (rollback'li) doğrulama: yeni ve eski
  fonksiyon açık 4 dosyada ARH / IKY / CME / CCS döner, `ihracat_dosyalari` doğrudan 0 satır; 3
  fonksiyon anon'a kapalı.
- Sevkiyat Durumu (`components/kantar-sevkiyat-durumu.tsx`, hesap `lib/kantar-sevkiyat.ts`
  `sevkiyatOzetleri`, saf): her açık sevkiyat kartı = dosya no · müşteri kodu · çuval (konteyner
  markaları "BRAND"sız, farklıysa "SAAD & ASLI"; yoksa dosya markası) · "Dolu x / y" + 3 renkli
  çubuk (dolu yeşil · ekipmanı alınmış boş turuncu · alınmamış gri) · durum (Yükleniyor / Dolum
  bekliyor / Başlamadı / Yükleme tamamlandı; sıra bu). y = max(rezervasyon konteyner_adedi
  toplamı, eklenen) — günlük rapor / Ana Panel ile aynı. Rezervasyonsuz: "Rezervasyon
  bekleniyor". Karta tıklayınca konteyner no · mühür · çuval · durum (boşlar önce). Arama
  çuval ve müşteri kodunu da arar. "Gizle/Göster" (localStorage `kantar-sevkiyat-gizli`,
  telefonda DBA listesine hızlı inmek için). DBA yükleme akışı DEĞİŞMEDİ; tablolardaki
  Müşteri sütunu kodu gösterir. Rezervasyon sorgusuna `konteyner_adedi` eklendi (RLS zaten açık).
- Kılavuz: Kantar evreni 2 ekran (`kantar`, `kantar-dba`; adım bazında `ekran` alanı,
  `KilavuzAdimi.ekran`). Kılavuz çekim taklidi artık Realtime'ı da taklit eder ("Canlı" rozeti).
- Test: yerel PG16 (migration 2 kez, kantar doğrudan okuyamaz, kod doğru, tam ad sızmaz, başka
  şirket görünmez, anon reddedilir), birim `scratchpad/kantar/birim.ts` 21, Playwright
  `kantar/e2e.mjs` (kartlar, liste, ad sızmıyor, arama, gizle/göster, migration öncesi yedek
  yol, 390 px), kılavuz e2e + km e2e regresyon.

## Packing List — tek sayfa / konteyner eki (28.10.2026)

- Kullanıcı: "20 konteynerlik yüklemede packing 2 sayfa çıkıyor. Sığıyorsa sığdıralım, sığmıyorsa
  'konteyner bilgileri ektedir' yazıp bütün konteyner bilgilerini 2. sayfaya atalım."
- `lib/packing-list-builder.ts`: belgenin sonundaki küçük betik `.sheet` yüksekliğini ölçer
  (ekrandaki "yazdırmadan önce" ipucu kutusu ölçüme KATILMAZ — PDF'te/yazdırmada görünmez) ve
  kademe seçer: normal → `.sik` (boşluklar daralır) → `.cok-sik` (tablo 9px, logo/imza küçük)
  → `.ekli` (1. sayfada "CONTAINER DETAILS ARE ATTACHED – n CONTAINERS (SEE PAGE 2)" + TOTAL;
  2. sayfa `.sheet.sheet-ek` "Packing List – Container Details": Invoice No/Date, Buyer, Vessel,
  tam tablo + toplam + imza; DRAFT filigranı varsa ek sayfaya da kopyalanır; ek sayfa da
  taşarsa `.ek-sik`). Sınır 1120px (A4 800px'te 1131; yazdırmada ~1129). Logo / imza
  `width/height` sabit → ölçüm görsel yüklenmesine bağlı değil. `window.__sayfaDuzeni()`.
- `lib/html-to-pdf.ts`: yakalamadan önce `__sayfaDuzeni` varsa çağırır (tablo uyum stili
  eklendikten SONRA); birden fazla GÖRÜNÜR `.sheet` varsa her biri yeni sayfadan başlar.
  Tek `.sheet`li diğer evraklar (CI, CoO, Phyto, Health, QC, FC) BİREBİR eski davranış.
- Ölçüm (Chromium, scratchpad `pl/test.mjs`, uygulama PDF'i + tarayıcı yazdırma): kısa
  bilgilerle 20 konteyner `sik` 1 sayfa, 30'a kadar `cok-sik` 1 sayfa; uzun adres + iki ürün:
  20 / 30 konteyner `cok-sik` 1 sayfa; 31+ → 2 sayfa (ek); 60'a kadar ek sayfa tek sayfa.

## Sevkiyat Evrakları — AI asistan yükleme alanları (28.10.2026)

- Kullanıcı: "Sevkiyat evrakları kısmındaki evrak yükleme alanları Proforma Yükleme tarzında; chat
  animasyonu ve yapay zekâ enerjisi gibi."
- `components/evrak-asistan.tsx` (SADECE görünüm): `EvrakAsistanYukleme` (İhracat AI satırı +
  sohbet balonu: yazıyor noktaları → harf harf + okunacak bilgi etiketleri + sürükle-bırak /
  klavye ile seçim + tür kontrolü), `EvrakAsistanKilitli` (ön koşul eksikse nedeni),
  `EvrakAsistanIsleniyor` (GERÇEK geçen süre + kontrol edilen alanlar; sahte adım YOK).
  CSS `globals.css` `.evrak-ai-*` (hareketi azaltta durur).
- Kullananlar: Fatura (`fatura-upload-section`, kilit: konteynerler eksik), Konşimento talimatı
  (kilit: konteynerler eksik; ESKİ alan "sürükleyip bırakın" diyordu ama bırakmayı
  desteklemiyordu — düzeldi), Draft BL, Beyanname (AI okuması YOK → "Beyanname almaya hazır",
  mesaj dürüst). Yükleme / AI kontrol / kayıt / depo temizliği / hata ve sonuç kartları
  DEĞİŞMEDİ. Kılavuzda Sevkiyat Evrakları 2 ekran (`dosya-evrak`, `dosya-evrak-2`).
- Test: scratchpad `ea/e2e.mjs` (4 asistan, mesajlar, etiketler, yanlış tür, sürükle-bırak,
  işleniyor, hata akışı, kilitli, yüklü dosya, hareketi azalt, 390 px).

## Menü: "Draft Onay" → "İhracat Evrakları" (28.10.2026)

- Kullanıcı kararı. Menü etiketi, sayfa başlığı (`app/draft-onay/page.tsx`), Yetkilendirme
  etiketi, üst uyarı bandındaki bağlantı ve kılavuz bölüm adı "İhracat Evrakları". ADRES
  `/draft-onay` ve yetki anahtarı `draft_onay` DEĞİŞMEDİ (yer imleri / yetkiler bozulmasın).
  Süreç adı olarak "Draft Onay 48s" (uyarı bandı) ve açıklamalardaki draft onay ifadeleri durur.
  Dosya detayındaki "İhracat Evrakları" kartı aynı adı taşır (kılavuz çekiminde
  `main h3` ile ayrılır). Kılavuz ekran görüntülerinin tamamı yeni menüyle yeniden çekildi.

## Tarım il evrakları (4-5-6): TO ORDER yerine NOTIFY; ürün adı tek sefer (28.10.2026)

- Kullanıcı kararı: Certificate of Origin (4), Phytosanitary (5), Health Certificate (6)
  alıcı kutusuna "TO ORDER" YAZILMAZ. `lib/tarim-alici.ts` `tarimBelgesiAlicisi(dosya)`:
  consignee gerçek firma ise aynen; "TO ORDER" / "To Order" / "TO THE ORDER OF …" ise
  `ham_veri.notify` dizisinin İLK dolu kaydı ("SAME AS CONSIGNEE" atlanır; 2. notify genelde
  acente / also notify, örn. 0091); notify yoksa alici_firma + alici_adresi; o da yoksa "-"
  ve hazırlık kontrolü "Notify (consignee TO ORDER; notify bilgisi yok)" eksiği verir
  (`tarimBelgesiAliciEksigi`, yalnız bu 3 belgenin kontrolünde). Health'teki iletişim
  kısaltması (buildKisaAliciAdresi) seçilen metne uygulanır. VERİ DEĞİŞMEZ; Packing List,
  Commercial Invoice, Draft BL, Fumigation, Quality konşimentodaki consignee'yi göstermeye
  devam eder.
- Ürün adı: aynı ürün (ör. 25 KG + 50 KG satırları) tek ad, farklı ürünler ayrı ayrı —
  `urunTanimiTekil` artık CoO, Phytosanitary, Packing List (konteyner satırı varsayılanı),
  Fumigation ve Quality'de kullanılır. Health'te ürün adı zaten sabit "WHEAT FLOUR".
  Commercial Invoice ürün satırları fiyat/ambalaj taşıdığı için AYRI kalır.

## ETD/ETA — Konşimento (ödeme) durumu + ödeme hatırlatma maili (28.10.2026)

- Kullanıcı: Harun Bey'in haftalık ETD-ETA Excel'inde KONŞİMENTO sütununda Telex / Seawaybill /
  Vesaik olmayanlar = ödemesi alınmamış. Bunlara hatırlatma maili + gönderim takibi.
- DB (migration `20261028140000_odeme_takibi.sql`, CANLIYA UYGULANDI 28.10.2026 — yalnız ek kolon
  ve tablo, veri değişmedi): `rezervasyonlar.konsimento_durumu` (x | alindi | telex | seawaybill |
  vesaik | kargo | kuehne | acente; null = girilmedi) + `_tarihi` + `_kaynak` (elle|excel).
  `odeme_hatirlatmalari` değişmez kayıt (şablon, alıcı, CC, konu, gövde, gönderen, zaman; RLS
  okuma = şirket + etd_eta yetkisi; doğrudan insert/update/delete YOK). Yazma YALNIZ fonksiyonlarla:
  `odeme_konsimento_guncelle(rez, durum)`, `odeme_konsimento_toplu(jsonb ≤500, tek işlem)`,
  `odeme_hatirlatma_kaydet(rez, sablon, alici, cc, konu, govde)` — hepsi etd_eta yetkisi + kendi
  şirketi; anon yok. Yerel PG 16 senaryo testi (`odeme/pg/test.sql`).
- Kural (`lib/odeme-takibi.ts`): ödeme alındı = telex/seawaybill/vesaik; "Ödeme Bekleyen" = ETD ≤
  bugün ve ödeme alınmamış (boş dahil). Kargo/Kuehne/Acente kullanıcı kuralı gereği "bekliyor".
- Şablonlar kullanıcının 3 metniyle BİREBİR (yalnız firma, adet × tip, booking dolar). Tip
  konteynerlerden ("20DC" → "20 DC", karışık/yoksa "20 DC"). Şablon 3: ETA ≤ bugün "has arrived
  at", değilse "is approaching". Konu "Payment Reminder – Booking No: …". Öneri: ETA geçmiş → 3,
  daha önce hatırlatıldıysa → 2, yoksa 1.
- Gönderim Outlook (mailto, CRLF) — ihracat müşterisine sistemden doğrudan mail ASKIDA kuralı
  korunur. "Evet, gönderildi" → kayıt; "Hayır" → kayıt yok. Alıcıyla aynı adres CC'den düşer.
  CC tarayıcıda hatırlanır ama YALNIZ @unex.com.tr adresleri (müşteri adresi başka müşteriye
  taşınmasın). Alıcı varsayılanı `ham_veri.alici_email` (yoksa elle).
- Excel'den güncelle (`lib/etd-excel.ts`, `components/etd-excel-aktar.tsx`): .xlsx/.xlsm
  TARAYICIDA jszip+DOMParser ile okunur (makro çalışmaz, dosya yüklenmez). Yıl sayfaları eskiden
  yeniye, sütunlar başlıktan; KONŞİMENTO sütunu olmayan sayfa (2023) sessizce atlanır. Booking no
  (yoksa B/L) harf+rakam anahtarıyla eşleşir; Excel'de boş hücre sistem değerini SİLMEZ; tanınmayan
  değer atlanır ve gösterilir. Önizlemede satır seçimi → toplu fonksiyon. 24.10 dosyasıyla: 33/33
  eşleşti, 18 ödeme bekleyen; sistemde olmayan ESMAAGRIC 26CTA00192 bilgi olarak listelenir.
- Sayfa: Konşimento açılır seçimi + Hatırlatma sütunu (son: "x gün önce · Ş2 · n kez"), "Ödeme
  Bekleyen" kartı/filtresi, başlıkta "Excel'den güncelle". 2xl altında Acente ve B/L sütunları
  gizli (1440'ta tablo sığsın; arama yine BL'de arar). Kolon yoksa (42703) sayfa eski hâliyle
  çalışır. Testler: `odeme/e2e.mjs` 34/34 (mailto, kayıt parametreleri, CC kuralı, Excel önizleme,
  geri uyum, mobil taşma yok). Kılavuz ETD bölümü 6 adım, ekran yeniden çekildi.
- TUR + SIRA (28.10.2026 akşam, kullanıcı: "Excel her eklendiğinde ödeme alınması gerekenler
  tespit edilmeli… aynı müşteri tekrar listedeyse 2. mesaj; sıra ile"). Migration
  `20261028170000_odeme_excel_turu.sql` (CANLIYA UYGULANDI): `odeme_excel_yuklemeleri` (dosya adı,
  güncellenen, özet jsonb, yükleyen, zaman; RLS okuma etd_eta; doğrudan yazma YOK) +
  `odeme_excel_yukleme_kaydet(dosya, satirlar, ozet)` = durumlar (`odeme_konsimento_toplu` ile aynı
  doğrulama) + kayıt TEK işlem; değişiklik yoksa da kaydedilir. EN SON yükleme = hatırlatma TURU
  başlangıcı: ödeme bekleyen ve turdan sonra hatırlatma gitmemiş → "Bu tur hatırlatılacak" (kartta
  sayı; filtrede bunlar üstte). Tur kaydı yoksa önceki herhangi bir hatırlatma "gönderildi" sayılır
  (ilk canlı yükleme 28.10 bu tablo yokken yapıldı → kayıtsız). SIRA sevkiyat (booking) bazında:
  0 gönderim → şablon 1, 1 → 2, 2+ → 3 (`siradakiSablon`); buton "Hatırlat · n. mesaj", pencerede
  "Sıradaki" rozeti (ETA'ya göre öneri KALKTI; 3. şablon metni yine ETA'ya göre arrived/approaching).
  Aynı müşterinin YENİ sevkiyatı 1'den başlar. Yükleme sonrası özet bandı (güncellenen, ödeme
  bekleyen, bu tur, ödemesi gelen, yeni bekleyen) + başlık altında "Son Excel: tarih · dosya ·
  kişi". "Gönderilen Mailler (n)" sekmesi: tarih, firma/dosya, booking, kaçıncı mesaj + metin,
  alıcı, gönderen, güncel ödeme durumu (arama burada da çalışır). `odeme/e2e.mjs` 51/51.
- EKRANA SIĞMA + "X ne demek" (28.10.2026): tablo 9 sütun — B/L booking'in altında ("BL …", farklıysa),
  acente gemi adının altında, dosya no firma adının altında; hücre dolgusu px-2; firma ≤148px, liman/gemi
  ≤125px. 1280/1366/1440/1536/1600/1920 genişlikte yatay kaydırma YOK (`odeme/olc.mjs`). Filtrelerin
  altında Konşimento açıklama şeridi (X = serbest bırakılmadı, Alındı ✓ = orijinal elimizde → ödeme
  bekliyor; Telex/Seawaybill/Vesaik = ödeme alındı) + seçimin ipucunda `KONSIMENTO_ACIKLAMA`.

## Proforma PDF — kaybolan çizgiler (29.10.2026)

- Kullanıcı: "Proforma oluşturulduğunda form bilgilerinin arasındaki bazı çizgiler gözükmüyor."
  Kök neden (`lib/proforma/pdf.ts`): satır döngülerinde ince (0,5 pt) ayırıcı çizgi çizildikten SONRA
  bir sonraki satırın gri dolgusu çiziliyor ve çizginin alt yarısını örtüyordu → PACKAGING..PAYMENT
  etiket sütunu, ürün tablosu (açıklama + toplam sütunları, toplam satırının üstü) ve Sales Contract
  alanları (QUANTITY..PAYMENT, tam genişlik gri) arasında çizgi görünmüyordu.
- Düzeltme: `BekleyenCizgi` + `cizgileriCiz()` — bu bloklarda çizgiler biriktirilir, dolgular bittikten
  sonra en üstte çizilir (banka tablosu da aynı kurala alındı). Ölçüler, yazılar ve sayfa düzeni
  DEĞİŞMEDİ (önce/sonra piksel karşılaştırması: yalnız çizgi bölgeleri farklı, 3. sayfa birebir).
  Yeni dolgu + çizgi eklerken: ÖNCE dolgu, SONRA çizgi.

## Proforma PDF — gerçek proformaya benzerlik + imzalı indirme (29.10.2026)

- Kullanıcı gerçek Excel proformasını ("Ikyboat Proforma & Contract.pdf") ve paneldekini gönderdi:
  "tasarım benzeme eksiklikleri, yazı fontu farklı; PDF indir dediğimizde Harun Bey'in imzası ile
  imzalanmış inmeli". Orijinal pdfplumber ile ÖLÇÜLDÜ, `lib/proforma/pdf.ts` buna göre:
  - Sütun: karakter × **5,645 pt** (eskiden 5,25 → tablo %7,5 dardı; A..J 486 pt, sayfa 2-3 509 pt).
  - Çizgi: ince **0,96 pt**, kalın **2,88 pt** (eskiden 0,5 / 1,5). Ürün satırı tam genişlik F2.
  - Tarih **gg.aa.yyyy** (`tarihYaz`, belge.ts; eski "bilinçli fark dd/mm/yyyy" KALKTI).
  - Yazı: Aptos Narrow → **Sofia Sans Semi Condensed** (OFL; 11 aday ölçüldü, genişlik farkı ~%2,
    görünüş en yakın); Calibri (sayfa 2-3 "Date / Revision", "Page x/N") → **Carlito** (Calibri ile
    aynı ölçüler); Arial Bold alt bilgi → **Helvetica-Bold** (Arial ölçüleri, PDF standart yazısı;
    metinde Latin-1 dışı Türkçe harf varsa gövde yazısına düşer, satır sığmazsa 6 pt'ye kadar
    küçülür, alta kırılıp binmez). Fontlar `lib/fonts/proforma-fontlari-base64.ts` (fontsource
    WOFF → fontTools birleştir/subset; Latin-1 + Latin Ext-A), lisans `lib/fonts/LISANSLAR-proforma.txt`.
    Aptos/Calibri Microsoft fontu: AÇIK depoya KONMAZ. `roboto-condensed-base64.ts` silindi.
  - Special Conditions satır aralığı 1,38 (orijinal ~13,8 pt). "APPROVAL OF CUSTOMER": ünvan 11 pt
    kalın + adres altında en fazla 2 satır (`onayAlicisi`).
- İMZA: `app/proformalar/page.tsx` `IMZALI = true` — önizleme ve "PDF İndir" Harun Bey imzalı
  (dosya adı `UNEX….pdf`, -TASLAK yok; alt çubuk "Harun Bey imzalı"). `proforma_imza` yetkisi
  bu akışta KULLANILMIYOR (kullanıcı kararı); kayıt/kilit/revizyon hâlâ sonraki adım.
- Kılavuz proforma ekranı yeniden çekildi (odeme noktası ELLE: x 68, y 43,9, w 25, h 8,6).
- Sales Contract (sayfa 2) satırları `sozlesmeSatirlari` (belge.ts, 29.10.2026 kullanıcı: "Quantity
  1) 100 2) 25 niye; aynı ürün iki kere yazıyor"): QUANTITY = TOPLAM ("125 METRIC TONE"); COMMODITY =
  aynı ürün TEK sefer, farklı ürünler " & "; UNIT PRICE = tek fiyat "410 USD PER TONE", tek ürün +
  farklı fiyat "410 USD & 413 USD PER TONE" (orijinal biçim), farklı ürün + farklı fiyat her ürün kendi
  satırında "ÜRÜN: 410 USD PER TONE". Kalem dökümü 1. sayfa tablosunda kalır.
- Ödeme hatırlatma penceresindeki "imzanız Outlook'ta eklenir" notu YANLIŞTI (gövdeli mailto'ya
  Outlook imza eklemez): "İleti > İmza ile ekleyin" olarak düzeltildi.

## İhracatlar — Devam Eden Siparişler kompakt liste (03.11.2026)

- Kullanıcı: "siparişi kalan müşterilerin göründüğü alan çok yer kaplıyor". Eskiden her sipariş
  ayrı kart + açık marka tablosuydu (5 siparişte ~1.500 px). Şimdi `SiparisTakipListesi`
  (`components/siparis-takip-karti.tsx`): tek panel, sipariş başına TEK SATIR — Proforma /
  müşteri · markalar + ilerleme (sevk / sipariş FCL) · Kalan FCL · Dosyası açılmamış FCL ·
  Tamamla / Siparişe Devam Et. Marka bazlı tablo (fazla / eşleşmeyen uyarıları dahil) satıra
  tıklayınca açılır; uyarı varsa satırda ⚠. Başlıkta toplam (sipariş sayısı, kalan, dosyası
  açılmamış) + "Gizle / Göster". 1280–1920 px'te 5 sipariş ≈ 400 px; mobilde satır kart olur.
- Hesap (`lib/siparis-takip.ts`), Tamamla onayı ve Siparişe Devam Et penceresi DEĞİŞMEDİ.
  Eski `SiparisTakipKarti` kaldırıldı (tek kullanan bu sayfaydı). Test: Playwright 24.

## Proforma — kayıtlı proformalar + 2. sayfa ilave satır (03.11.2026)

- Kullanıcı: "Hazırlanan proformalar kayıtlı kalmalı ve düzenlenebilmeli" + "2. sayfadaki QUANTITY …
  PAYMENT kısmına ilave satır eklenebilmeli".
- Migration `20261103100000_proforma_kayit.sql` (CANLIDA, adı `proforma_kayit`, md5 b02baf9e…):
  `proformalar` — `taslak` jsonb = ekranın TAMAMI (`ProformaTaslak`), özet kolonlar (proforma_no
  [şirket içinde TEKİL, büyük harf], alici_unvan, tarih, para_birimi, toplam, toplam_mts,
  olusturan/guncelleyen_email). PDF dosyası SAKLANMAZ; her zaman taslaktan üretilir. RLS
  ihracat_musterileri ile aynı (şirket + `proformalar` sayfa yetkisi), anon kapalı; updated_at +
  denetim tetikleyicisi (silinen kaydın kopyası denetimde). Yerel PG: 2 kez çalıştırma + 9 senaryo.
- Ekran (`app/proformalar/page.tsx`): "Kayıtlı Proformalar (n)" listesi (ara, Aç, Sil + onay),
  "Yeni proforma", alt çubukta "Kaydet" ve "Kaydet ve PDF İndir" (indirilen her proforma kayıtlı
  kalır; kayıt başarısızsa PDF İNMEZ; değişiklik yoksa yeniden yazmaz). Açılan kayıt "Proforma
  Düzenle" başlığıyla aynı kayda yazılır; kaydedilmemiş değişiklik varken başka kayıt / yeni form →
  onay penceresi. Kaydetmek için en az ünvan + proforma no (`kayitEksigi`); diğer eksikler yalnız
  PDF'i engeller. Aynı no → "zaten kayıtlı" (23505). Saf kurallar `lib/proforma/kayitli.ts`.
- Eski / bozuk taslak `taslakNormalle` (belge.ts) ile güncel biçime gelir (yeni alan eklenirse
  bosTaslak'taki varsayılan dolar; ProformaTaslak'a alan eklerken bosTaslak'a da ekle).
- İlave satır: `ProformaTaslak.ekSatirlar` / `ProformaBelgesi.ekSatirlar` ({baslik, deger}; en fazla
  6, başlık ≤24 [etiket sütunu kaydırmaz, 7,5 pt'ye kadar küçülür], değer ≤500, büyük harf basılır,
  yarım satır = eksik). PDF'te PAYMENT'tan SONRA aynı gri biçimde; PAYMENT kendi yüksek satırını
  korur, kalın alt çizgi en sonda. İlave satır yokken PDF eskisiyle PİKSEL PİKSEL aynı (3 sayfa, AE 0).
- Gece yedeği: `proformalar` → `YEDEKLENECEK_TABLOLAR` + mail.ts "Kayıtlı proformalar" + geri yükleme
  betiği. `yedekleme-gonder` v24 (canlı = repo birebir; deneme: 39 tablo, geri yükleme 37/37, uyarı yok).
- Test: birim (taslakNormalle, eksikler, kayitSatiri, hata mesajları), PDF karşılaştırma, Playwright 24.
- Sonraki adım (konuşulmadı): Harun Bey "Onayla ve İmzala" kilidi / revizyon numarası.

## Fatura talimatı — ÖN TALİMAT (rezervasyon / konteyner öncesi) (03.11.2026)

- Kullanıcı (IHR-2026-0110, Filistin / Aşdod): karşı ülkenin ihracatçılar birliğinden M24 kodu
  alınması için fatura, rezervasyon ve konteyner belli olmadan kesilmek zorunda; sistem rezervasyon +
  tüm konteynerler girilmeden talimat hazırlatmıyordu.
- Kural TEK YER `lib/fatura-talimati-durum.ts` (`faturaTalimatiDurumu`): "tam" = rezervasyondaki
  konteyner adedinin hepsi eklendi (ESKİ kural, değişmedi); "on" = ürün kaleminde miktar var ama
  rezervasyon / konteyner eksik (eksikler listesiyle); "yok" = ürün miktarı yok (düğmeler kapalı).
- Ön talimatta düğmeler "Ön Fatura Talimatı" / "Ön Talimat İndir", önce ONAY penceresi (eksikler +
  "Filistin (M24) gibi durumlar için"). PDF başlığı "FATURA TALIMATI (ON TALIMAT)" + turuncu not kutusu,
  konu "… | ON TALIMAT", dosya adı `Fatura_Talimati_<no>-ON.pdf`; CIF'te navlun / konteyner yoksa FOB "-" +
  dipnot. Mail metni "*** ON FATURA TALIMATI ***" ile başlar. Ön talimat DB'ye YAZILMAZ
  (`fatura_talimati_gonderildi` / `_metni` değişmez → "konşimento bekleniyor" erken çıkmaz; kayıtlı ön
  metin tam talimatta kullanılmaz, yeniden üretilir). Tam talimat PDF'i eskisiyle PİKSEL AYNI (AE 0).
- AÇIK SORU (kullanıcıya soruldu): Aşdod'a giden Filistin sevkiyatında "Gideceği Ülke" ne yazılmalı?
  `gidecegiUlke("ASHDOD PORT")` tanımıyor → satır basılmıyor; "Ticaret Yapılan Ülke" FİLİSTİN (adresten).
  Karar gelmeden LIMAN_ULKE'ye ASHDOD EKLENMEDİ (İSRAİL yazdırmak süreci riske atabilir).
- Test: durum birim 6, PDF karşılaştırma, Playwright 12 (onay / vazgeç / metin / -ON.pdf / DB'ye yazmama).

## İhracatlar — kapalı dosya detayında "VGM Gör" (03.11.2026)

- Kullanıcı: "İhracatlar sayfasında kapanan dosyalar arasından birine tıkladığında açılan bilgi
  sayfasında konteynerler kısmında ilgili konteynere VGM gör butonu eklenmeli ve ilgili DBA'ya
  yönlendirilmeli."
- `app/ihracatlar/page.tsx` detay penceresi, Konteynerler tablosuna "DBA" sütunu: `dba_dosya_url`
  varsa "VGM Gör" (`data-testid vgm-gor`, yeni sekmede o konteynerin DBA'sı; Konteynerler
  sekmesindeki indirme bağlantısıyla aynı URL). Elle tartım kaydında (`elleTartimMi`) yanında
  "Elle" etiketi; belge yoksa soluk "DBA yok". Kapalı karar "VGM Gönder" (mailto) ile
  KARIŞTIRILMAZ: bu yalnız belgeyi açar, mail göndermez.

## Fatura talimatı — kalem FOB birimi ORANLA düşülür (03.11.2026)

- Kullanıcı (IHR-2026-0110 faturası): "Neden kesilen faturada FOB birim uyuşmuyor… aynı oranda
  düşmek gerekiyor sanırım." Logo faturada navlunu kalemlere FOB TUTARIYLA ORANTILI dağıtıyor
  (satır başına oran 2.400 / 65.308,68 = %3,67486). Eskiden talimat kg başına EŞİT tutar
  düşüp 3 ondalık yazıyordu (0,450 → 0,434; 0,470 → 0,454); Logo'da CIF birim 0,44994888 /
  0,47068385, toplam 67.708,68 çıktı (0,32 USD sapma).
- Artık `lib/cutoff-utils.ts → fobBirimFiyati`: FOB birim = CIF birim × (toplam FOB / toplam
  CIF); gösterim `formatFobBirimFiyatKg` 8 ondalık (0,43404939). Logo'ya aynen girilince satır
  tutarları 49.915,68 / 10.859,92 / 4.533,40 = 65.309,00, CIF birimler 0,450 / 0,470 tam.
  Toplam FOB / CIF ve lokal masraf mantığı (net navlun = navlun − lokal) DEĞİŞMEDİ.
  Kullanıldığı yer: talimat PDF'i, talimat mail metni, Ek Bilgiler kartı (üçü aynı fonksiyon).
  CIF birim 3 ondalık kaldı. Test: /home/claude/test/fob/fob_test.ts (Logo taklidi).

## Fatura talimatı — Aracı Banka = proformadaki banka (04.11.2026)

- Kullanıcı: "Proforma da hangi banka varsa fatura talimatında da o bankanın geçerli olmasını
  istiyorum." 25.09.2026'daki sabit `DENIZBANK A.S.` (FATURA_TALIMATI_SABIT_BANKA) KALDIRILDI.
- `lib/supabase/constants.ts → faturaTalimatiBankasi(dosya)` = `dosya.banka` (boşluk düzeltilmiş);
  boşsa satır yazılmaz. Talimat PDF'i + mail metni aynı fonksiyon. Proforma / CI'daki banka
  seçimi DEĞİŞMEDİ. Canlı 04.11: 36 dosyanın hepsinde banka dolu (Denizbank 19, Ziraat 12,
  Vakıfbank 5); kayıtlı talimat metinlerinde çakışan banka yok.
