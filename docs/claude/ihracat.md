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
- 05.11.2026 BAYRAK: "Ticaret Yapilan Ulke" satırında ülke bayrağı (PDF: `bayrakPng` canvas ile
  PNG, satır başına; modal: `UlkeBayrak`). DİİB Takibi'nde "Cari · Ülke" ve bekleyen yüklemeler
  "Alıcı · Ülke" sütunlarında bayrak. Bayraklar `lib/bayraklar.ts` (country-flag-icons 1.6.20, MIT,
  gömülü SVG; yeni paket yok). Ülke bulunamazsa bayrak çizilmez.
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
- Proforma "Ayarlar" KALDIRILDI (05.11.2026, kullanıcı kararı): sağ üst buton ve
  `components/proforma-sekmeler.tsx` silindi; `/proformalar/musteriler`, `/urunler`, `/sablon`
  sadece `/proformalar`'a yönlendirir. Tablolar (ihracat_musterileri / ihracat_urunleri /
  proforma_ayarlari) boş ve DB'de duruyor; `/proformalar` okumaya devam eder (boş → varsayılan
  şablon, bilgiler geçmiş dosyadan). Şablon metni değişikliği artık kod (lib/proforma) üzerinden.
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
  `proformalar` (sayfa; bbt@, ihracat@, eski kişisel adres) + `proforma_imza`
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
  `KONSIMENTO_HATIRLATMA_TEST_ALICISI` (varsayılan test adresi) adresine, "[TEST]"
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
  MOD: TEST (secret `KONSIMENTO_HATIRLATMA_CANLI` girilmedi) → mailler test adresi.
  05.11.2026 CANLI: kullanıcı onayıyla secret girildi (alıcı operation@, CC execution@ / bbt@ / export@ —
  varsayılanlar; ayrı ALICI/CC secret'ı yok).

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

## Fatura talimatı — Aracı Banka = proformadaki banka, YENİ dosyalarda (04.11.2026)

- Kullanıcı: "Proforma da hangi banka varsa fatura talimatında da o bankanın geçerli olmasını
  istiyorum" + "Aslında bundan sonraki yüklemeler için geçerliydi."
- `lib/supabase/constants.ts → faturaTalimatiBankasi(dosya)`: dosya **04.11.2026 (TR saati) ve
  sonrasında açıldıysa** `dosya.banka` (boşsa satır yazılmaz); daha eski dosyalarda 25.09.2026'daki
  sabit `DENIZBANK A.S.` aynen. Talimat PDF'i + mail metni aynı fonksiyon. Proforma / CI'daki banka
  seçimi DEĞİŞMEDİ.

## DİİB Takibi `/diib` — sistem kendi doldurur + fatura bölünmesi (04.11.2026)

- Kullanıcı: Burak Bey'in "UNEX İHRACATLAR" Excel'inin İHRACAT kısmı SİSTEMDE (İTHALAT sonra);
  "Excelden içeriye alınmamalı. Sistem bunu kendi takip etmeli ve aynı formu doldurabilmeli."
  (İlk sürümdeki Excel içe aktarma KALDIRILDI, kullanıcı itirazı — GERİ EKLENMEZ.) "DİİB'in
  kalanı yetmezse tam kapatabilmek için 2 ayrı fatura". DİİB no yazımında **D2 doğru** (04219).
- Migration `20261104100000_diib_takibi.sql` (yalnız ekleme): `diib_belgeleri` (belge_no,
  anahtar "yyyy-nnnnn", izin kg, taahhüt = izin × 0,97 × 0,74, **devir_kg / devir_tutar** =
  sistem öncesi ihracat [ilk sistem dosyası IHR-2026-0065, 02.09.2026], kullanım sırası, durum),
  `diib_ihracatlari` (YALNIZ elle / "sistem" = düzeltilmiş dosya satırı; fatura no tekil),
  `diib_dosya_bolunmeleri`. Bileşik FK (diib_id, company_id). RLS şirket + **ihracatlar**.
- Satırlar = faturası kesilmiş dosyalar (fatura no / tarih / alıcı / kg / birim / tutar dosyadan;
  beyanname no dosyadan). `lib/diib/hesap.ts`: `diibBul` (dosyanın serbest DİİB metni → yıl+sıra),
  otomatik satır, bölünmüş dosya parça başına, faturasız açık dosya "bekleyen", `bolunmeOnerisi`,
  `kgOku` (Türkçe binlik nokta; yalnız kg alanları). Gerçekleşen = devir + satırlar.
- Beyanname no: `lib/beyanname-oku.ts` (unpdf, YAPAY ZEKÂ YOK; "8 hane + EX + 8/9 hane", tek
  belirgin numara yoksa null). `beyanname-section.tsx` yüklemede aynı kayıtla `beyanname_no`
  yazar (okunamazsa alan değişmez). DİİB sayfasında "Beyannamelerden oku" (yüklü beyannamesi
  olup numarası boş dosyalar; `beyanname_no is null` koşuluyla yazar).
- "Excel'e aktar" (`lib/diib/excel-yaz.ts`, jszip): GENEL TABLO + her DİİB sayfası Burak Bey'in
  biçiminde (devir satırı + GERÇEKLEŞEN / ÖNGÖRÜLEN / KALAN / HAK EDİLEN). İçeri ALMAZ.
- "Kullanımda" = en son kesilen faturanın yazıldığı (kalanı olan) DİİB.
- Dosya kartı + 2 faturalı talimat: `components/diib-bolunme-karti.tsx` (Proforma + Sevkiyat
  Evrakları), `lib/diib/bolunme-talimat.ts`; talimat PDF + mail "FATURA BOLUNMESI" bölümü; bölünmesiz
  talimat ESKİSİYLE AYNI. Sevkiyat evraklarına (CI vb.) DOKUNULMADI.
- 05.11.2026 "dağılımlı fatura için kap, net ve brüt": her "N. fatura toplami" satırının altında
  `Kap … · Net … KG · Brüt … KG` (`parcaAgirliklari` / `parcaAgirlikMetni`): kap = net ÷ ambalaj kg,
  brüt = net × (toplam brüt ÷ toplam net), son parça kalanı alır (toplamlar konteyner tablosuyla aynı).
  PDF ve mail metninde (ASCII) aynı.
- 04.11 mutabakat (ayrıntı repoda YOK; repo herkese açık): İLK analizim ("Excel'de bir yükleme iki kez
  sayılmış") YANLIŞTI. Doğrusu: (1) kısmi yükleme — proforma 375 MT, bu yüklemede 10 konteyner 250.000 kg
  (kalanı sonraki hafta); sistem proforma miktarını sayıyordu. (2) Bir faturada dosyanın ürün miktarı
  konteyner netlerinden farklıydı; Burak Bey'in kg'ı konteyner netiyle aynı. İkisi düzeltilince sistem
  Burak Bey'in bölünmesini birebir verdi. DERS: DİİB miktarı = yüklenen (konteyner net), proforma değil.
- Elle bölme (04.11): kalan yetse de "Yine de iki faturaya böl (elle)" (muhasebe/gümrük kaydı farklıysa).
  İki parçada birini yazınca diğeri yüklemenin kalanına tamamlanır. Aynı DİİB'e yazılmış, faturası
  kesilmemiş DİĞER açık yüklemeler kartta uyarı olarak yazar (kalan, önce faturalanandan düşer).
- SIRALI bekleyen (04.11, kullanıcı: "faturası kesilmemiş yüklemeler kısmında farklı gözüküyor"): eskiden her
  bekleyen yükleme AYNI kalana göre ayrı hesaplanıyordu (iki yükleme aynı kalanı paylaşınca ikisi de "tek fatura").
  Artık `siraliBekleyenler` (hesap.ts): rezervasyon **talimat cut-off → ETD → dosya no** sırasıyla (ilk sürümde
  beyan cut-off idi; kullanıcı: "SAAD şu an yükleniyor, faturası daha önce kesilecek" → önce yüklenen önce); öncekinin payı
  (kayıtlı bölünme / tek fatura / öneri) sonrakinin kalanından düşer. DİİB sayfası tablosu ve dosya kartı AYNI
  sonucu verir (`bekleyenSiraGetir`, veri.ts). Cut-off metinden HAM okunur (cutoff-utils). Kalanı biten DİİB'in
  yüklemesi tamamen sonraki DİİB'e düşüyorsa "bölünme gerekmez, DİİB No değişmeli" yazar (1 parçalık bölünme
  kaydedilmez).
- DİİB miktarı (`diibMiktari`, 04.11): dosyanın TÜM konteynerlerinde net ağırlık varsa YÜKLENEN net toplam
  (`yuklenenKgleri`, veri.ts, sayfalı), yoksa proforma. Faturası kesilmemiş kısmi yüklemede tutar yüklenen
  oranında. Kart ve tablo "yüklenen · proforma X" yazar. Fatura talimatında bölünme toplamı ürün miktarına
  eşit değilse bölünme YAZILMAZ ve talimat penceresinde kırmızı uyarı çıkar (`bolunmeUyumsuz`).
- DÜZELTME (04.11 akşam): konteynerler sisteme parça parça girilirken (10 konteynerlik rezervasyonda 6'sı
  girilmiş, hepsinin neti dolu) "tümü tartıldı" sanılıp eksik miktar yüklenen sayılıyordu → bölünmenin ikinci
  parçası 100 MT eksik çıktı. Artık girilen konteyner sayısı rezervasyonlardaki `konteyner_adedi` toplamından
  AZSA proforma miktarı kullanılır (`yuklenenHesapla`, hesap.ts SAF; rezervasyon okunamazsa proforma). Canlı
  kontrol: yalnız o dosya etkilendi, faturası kesilmiş hiçbir dosyanın sonucu değişmedi; kayıtlı bölünme yoktu.
- Test: hesap (canlı dosya özetleri yerelde), bölünme, kgOku, beyanname okuma (gerçek 2 beyanname
  yerelde; repoda veri YOK), Excel yazma (openpyxl ile okundu), e2e_diib 22 + e2e_diib_dosya 25 + sıra birim testi.

## Commercial Invoice ECTN — CIF dosyada sigorta girilmezse uyarı (04.11.2026)

- Kullanıcı: "CIF yükleme, ECTN yapılacak; 'TOTAL CFR DJIBOUTI' neden CFR?" Etiket kuralı (30.09.2026, değişmedi):
  INSURANCE girilmişse "TOTAL CIF <liman>", değilse "TOTAL CFR <liman>". Canlı: önceki 11 CIF + ECTN dosyasının
  HEPSİNDE sigorta elle girilmiş (10×20DC'de 250 USD); bu dosyada girilmemişti → CFR yazdı. Kod hatası değil.
- Eklenen: Evraklar'da ECTN kutusunun yanında amber "CIF · sigorta girilmedi → TOTAL CFR yazar" düğmesi
  (`ectn-cif-sigorta-uyari`; CIF + ECTN + sigorta yok + etiket elle değil). Tıklayınca ECTN penceresi açılır.
  Sigorta girilince FOB sigorta kadar azalır, satır TOTAL CIF olur, TOPLAM DEĞİŞMEZ. Evrak verisine dokunulmadı.

## DİİB — güncel DİİB otomatik, Ayarlar kaldırıldı, beyanname numaraları, sade konşimento hatırlatması (05.11.2026)

- Beyanname no: kullanıcı onayıyla (Excel "ÜNEX İHRACATLAR 10.01.2026", yalnız beyanname no) faturası kesilmiş ve
  beyanname no'su BOŞ 24 dosyaya (IHR-2026-0065…0094; UNX601–689) fatura no eşleşmesiyle yazıldı; dolu alanların
  üzerine yazılmadı, 18 karakter biçim kontrolü, işlem "24 değilse geri al" korumalı. Excel'deki diğer 175 fatura
  sistemde ya dolu ya yok. Excel'de bir çakışma (UNX…514 iki farklı numara) ve bir hatalı numara (UNX…564, 19 hane)
  vardı; ikisi de sistemdeki dosyalarla eşleşmediği için kullanılmadı.
- Beyanname okuma (değişmedi): Evraklar'da beyanname PDF'i yüklenince numara metinden okunur (`lib/beyanname-oku.ts`,
  yapay zekâ yok; `\d{8}EX\d{8}`, tek ve belirgin değilse yazmaz) ve dosyaya yazılır. DİİB Takibi'ndeki
  "Beyannamelerden oku" düğmesi YALNIZ beyannamesi yüklü + numarası boş + faturalı dosya varsa çıkar (toplu okuma).
  Görüntü (taranmış) PDF'te okunamaz → Ek Bilgiler'den elle.
- GÜNCEL DİİB: yeni dosya (Proforma Yükle) DİİB No'su `guncelDiibNoGetir` (lib/diib/veri.ts) → `guncelDiib`
  (hesap.ts SAF): kullanım sırasına göre İLK aktif DİİB'den, faturalı satırlar + bekleyen yüklemelerin payı
  (kayıtlı bölünme / tek / öneri; `siraliBekleyenler`) düşüldükten sonra kalanı > 0 olan. Metin
  `diibAlanMetni`: "14.05.2026 TARİH 2026-D1-02576" (mevcut dosyalardaki biçim; `diibAnahtari` geri okur).
  Okunamazsa / hepsi dolmuşsa boş (Ek Bilgiler'den). Canlı kontrol: CRISA bölünmesi kayıtlıyken 04219 kalanı 0 →
  güncel = 02576. Ayarlar > İhracat Ayarları sayfası KALDIRILDI (`/ayarlar/ihracat` → `/diib` yönlendirir; menüden
  çıktı). `companies.varsayilan_diib_no` kolonu duruyor, OKUNMUYOR (veri silinmedi).
- Konşimento hatırlatması: kullanıcı "sadece hatırlatma geçmeli, dosya bilgisi vermemeli" → `khMail` yalnız
  dosya no + alıcı + konteyner sayısı + talimat cut-off + "Dosyayı uygulamada aç". Rezervasyon / taraflar / mal /
  konteyner / proforma-lot-beyanname blokları kaldırıldı (`khOzet` duruyor). Konu "Hatırlatma: konşimento talimatı
  gönderilebilir · <dosya> · <alıcı>". `konsimento-hatirlatma` v2 deploy. Mod hâlâ TEST (secret
  `KONSIMENTO_HATIRLATMA_CANLI` yok → yalnız test adresine).

## Fatura — yapay zekâsız okuma, DİİB'e bölünmüş yüklemede 2 fatura, Ana Panel evrak durumu (05.11.2026)

- Kullanıcı: "Fatura yüklemede yapay zekâ çalışıyor; masrafsız ve doğru okutamaz mıyız?" Unex
  e-Faturaları metin katmanlı ve etiketleri sabit → `lib/fatura-oku.ts` (`faturaMetniOku`,
  `faturaKarsilastir`, `pdfMetni` = unpdf). Okunan: fatura no / tarih, DİİB (`DD.MM.YYYY / YYYY /D1-NNNNN`,
  `DD.MM.YYYY TARİH YYYY-D2-NNNNN`, tarihsiz), ödenecek + mal toplamı, NET / BRÜT / KAP ADEDİ, konteyner
  noları. Kontrol: konteyner (fazlası her zaman, eksiği tek faturada), net/brüt (50 kg ya da %0,2 pay),
  kap (birebir), tutar (ödenecek ya da mal toplamı, 2 birim pay), para birimi; bölünmüş faturada DİİB.
  Satıcı unvanı / DİİB yazım biçimi KARŞILAŞTIRILMAZ (yapay zekânın yanlış alarmlarıydı).
  Fatura no OKUNAMAZSA eski `fatura-kontrol` (Gemini) yedek; sonuçta `kaynak: "metin" | "yapay_zeka"`,
  ekranda "Metinden okundu · ücretsiz" rozeti. Edge function DEĞİŞMEDİ.
- 2 fatura (kullanıcı: "DİİB dağılımında 2 fatura yüklemek durumundayız"): migration
  `20261105140000_diib_bolunme_fatura_belgesi` → `diib_dosya_bolunmeleri.fatura_tarihi / fatura_dosya_url /
  fatura_dosya_adi / fatura_yukleme_tarihi / fatura_kontrol_sonucu`. Bölünme (2+ parça) varsa Muhasebe
  kartı parça başına yükleme alanı gösterir; beklenen = parçanın kg / tutar (`faturaBolunmesi`) / kap-brüt
  (`parcaAgirliklari`) / DİİB'i. Parçanın fatura no'su parçaya yazılır (DİİB Takibi bunu kullanır).
  1. parça ayrıca `ihracat_dosyalari.fatura_*`'ya yansır (panel, raporlar); bölünmüşte dosyanın DİİB No'su
  DEĞİŞMEZ. Bölünme kaldırılınca 2+. parça PDF'leri depodan silinir; dosya silinince parça PDF'leri de
  (`dosyaninStorageUrlleriniTopla`).
- Ana Panel: her dosyanın altında "EVRAKLAR" satırı — sıra Konşimento Talimatı · Fatura · Draft BL ·
  Beyanname; yüklenen yeşil ve tıklanınca açılır, eksik kesik çerçeveli; sonda "Eksik: …". Bölünmüşte
  "Fatura 1/2". Test: scratchpad `e2e_fatura_parca.mjs` (FATURA_TEST=1), `fatura/test.mts` (gerçek iki
  e-Fatura metniyle; örnekler repoda YOK).


## Ana Panel evraklar + konteyner rezervasyon ön seçimi (06.11.2026)

- Ana Panel'de her dosyanın ikinci satırının başında "EVRAKLAR n/4" (testid `evrak-sayac`) ve
  sırayla Konşimento Talimatı gönderildi / Fatura kesildi / Draft BL alındı / Beyanname
  gönderildi çipleri; altında "Tüm evraklar tamam" ya da "Eksik: …". Cut-off ve rezervasyon
  rozetlerinde "Beyanname yüklendi" yerine "Beyanname gönderildi".
- Konteynerler sekmesi: dosyanın TEK rezervasyonu varsa "Konteyner Ekle" ve "Toplu Ekle"
  formlarında rezervasyon kendiliğinden seçilir (kullanıcı değiştirebilir).

## Proforma Yükle: sistem proformasını yapay zekâsız okuma (06.11.2026)

- Proforma Oluştur'un indirdiği PDF'in bilgisinde Title "Proforma <NO>", Creator "İhracat AI" yazar.
  Proforma Yükle önce bunu dener (`lib/proforma/okuma-pdf.ts`, tarayıcıda unpdf): no ile Kayıtlı
  Proformalar'daki taslak (`proformalar.taslak`) bulunur, alanlar PDF'i çizen AYNI `belgeOlustur` ile
  taslaktan üretilir (`lib/proforma/okuma.ts`), proforma-oku ile aynı alan adlarında döner.
- Doğrulama: proforma no, alıcı unvanının ilk 3 kelimesi, toplam ve her kalemin miktar / fiyat / tutarı
  PDF metninde aynen yazmalı. Biri tutmazsa (PDF indirildikten sonra taslak değişmiş), kayıt yoksa,
  Creator farklıysa, kullanıcının Proformalar yetkisi yoksa (RLS) ya da herhangi bir hata olursa
  sessizce eski yapay zekâ okumasına (edge proforma-oku) geçilir; akış durmaz.
- Liman: teslim ifadesindeki liman YALNIZ Türkiye limanıysa (FOB AMBARLI) yükleme limanı; değilse teslim
  şekli ne olursa olsun varış limanı ("FOB SANTIAGO DE CUBA BASIS" → varış SANTIAGO DE CUBA). 06.11.2026
  ilk canlı denemede (IHR-2026-0111, sonra silindi) yükleme limanına varış yazılmıştı; düzeltildi.
- Okunan kayıtta `okuma_kaynagi: "sistem_proformasi"` (ham_veri'de denetim izi); okuma özetinde
  "yapay zekâ kullanılmadı" satırı (testid `proforma-okuma-kaynak`).
- Test: gerçek proforma türleri (CFR / CIF / FOB, EUR, çok kalem) birebir; e2e `e2e_pfoku` (mock
  `PF_OKU_TEST=1`; mock proforma-oku çağrılırsa 500 döner, test çağrılmadığını doğrular).

## Gümrük beyannamesi kontrolü — yapay zekâsız, ücretsiz (06.11.2026)

- Kullanıcı: "Beyanname de okutulmasını ve kontrol sağlanmasını istiyorum, en azından ücretsiz bir
  şekilde sistemdeki bilgiler ile kontrol sağlanabilmeli." Beyanname PDF'leri metin katmanlı; okuma
  tarayıcıda unpdf ile, YAPAY ZEKÂ YOK, edge fonksiyonu yok.
- Migration `20261106120000_beyanname_kontrolu.sql` (yalnız ekleme, nullable): `ihracat_dosyalari`
  `beyanname_kontrol_sonucu jsonb`, `beyanname_devam_dosya_url`, `beyanname_devam_dosya_adi`.
- `lib/beyanname-kontrol.ts` (saf): `beyannameMetniOku` (beyanname no, döviz + toplam bedel, fatura
  no / tarih, ISO 6346 kontrol haneli konteynerler — boşluklu yazım dahil, DİİB'ler, gemi (MV/MS/MT
  öneki atılır), Incoterm, kalem neti, devam listesi "KGM … GENEL TOPLAM") +
  `beyannameKarsilastir` (fatura no SIRA SAYI olarak — müşavir 10 hane yazıyor; tarih; toplam ±1
  aynı döviz; konteynerler küme; net toplam; DİİB yıl+sıra, D1/D2 farkı NOT; gemi; teslim şekli
  CFR=CNF; varış yeri / ülke / alıcı bulunamazsa "bilgi", uyumsuzluk sayılmaz).
- Yükleme yeri (06.11.2026 2. adım; kullanıcı: "yükleme yeri bizde de MARPORT"): beyannamedeki
  "eşyanın bulunduğu yer" (`G` + 4 hane + ad; önceki / sonraki kutuya bitişik yazılabilir →
  BAŞLANGIÇ eşleşmesi) ile REZERVASYONUN yükleme limanı (yoksa dosyanınki). Dosya alanı proformadan
  gelir ve rezervasyondan farklı olabilir (IHR-2026-0108: dosya KUMPORT, rezervasyon + beyanname
  MARPORT). Başka bilinen terminal yazıyorsa "uyuşmuyor", okunamazsa "bilgi".
- `lib/beyanname-beklenen.ts`: dosya + konteynerler (net hepsi > 0 ise toplam) + rezervasyon gemisi
  + bölünmüş DİİB'ler (`diib_dosya_bolunmeleri` → `diib_belgeleri`).
- Çok kalemli (bölünmüş DİİB) beyannamede 2. kalem "Tek Tip Gümrük Beyannamesi Devam Listesi"
  ayrı PDF'tir (gümrük devir belgesi DEĞİL). Gümrük Beyannamesi kartında "Devam listesi ekle":
  BEYAN NO ana beyannameyle aynı olmalı; yeni ana beyanname yüklenince farklı no'lu devam silinir.
  Devam yoksa net / DİİB "okunamadı" + "Devam listesini ekleyin" ipucu.
- Sonuç kartı (testid `beyanname-kontrol*`): uyumlu / uyuşmuyor / okunamadı satırları, "Yeniden
  kontrol et". Kontrol yüklemeyi DURDURMAZ; yalnız uyarır. Storage temizliği devam dosyasını da siler.
- Test: gerçek beyanname + devam (repo dışı) 11/11 uyumlu; eski biçim beyanname; e2e `e2e_beyan`
  (mock `FATURA_TEST=1 BEYAN_TEST=1`, kurmaca PDF'ler).

## Konşimento talimatı: acente şablonları, otomatik oluşturma, ücretsiz kontrol (06.11.2026)

- Kullanıcı: "Beyanname kontrol mekanizmasının aynısı konşimentoda. Her acentenin talimat şablonu farklı,
  sisteme tanıtacağız. Talimat sistemdeki bilgilerle otomatik oluşturulacak; tüm konteynerler alınınca
  test olarak sensei adresine gidecek, Talimat Gör ile açılıp indirilecek (iç piyasa irsaliyesi gibi).
  Consignee / notify aynı müşterinin önceki sevkiyatından otomatik; yeni müşteride elle."
- KAYIT (`supabase/functions/_shared/konsimento-sablon.ts`, uygulama + edge ortak):
  AKKON → Akkon Lines formu · MSC → web sitesi (talimat OLUŞTURULMAZ, yalnız hatırlatma) ·
  DRAFT (Maersk/CMA/Hapag), ESNA, ADMIRAL → standart (DRAFT/MAERSK formu; kullanıcı: "ESNA/HAPAG ve
  ADMIRAL için DRAFT/MAERSK talimatı geçerli") · tanımsız acente → standart, "varsayılan" rozetiyle;
  dosyada elle değiştirilebilir (`ham_veri.konsimento_talimati.sablon`).
- Model `lib/konsimento/talimat.ts` (saf): booking (çok rezervasyonda "A + B"), shipper (form başına
  sabit Unex bloğu + "ON BEHALF OF" ek satırı), consignee (`dosya.consignee`), notify
  (`ham_veri.notify`), gemi/sefer (standart "POLAR X 645W", Akkon "M/V X / SEG..."), yükleme (Ambarlı
  terminalleri: standart "ISTANBUL-MARPORT", Akkon "MARPORT - AMBARLI"), tahliye (varış limanının ilk
  parçası, "PORT" atılır), mal tanımı EN/TR (varsayılan WHEAT FLOUR / BUĞDAY UNU, değiştirilebilir),
  ambalaj (detaylı ambalaj, parantezli marka atılır, adet konteyner toplamından), GTİP 11010015, navlun
  PREPAID / FOB grubunda COLLECT, BL tipi, Akkon BL adedi 3/3 + özel ibareler, konteyner tablosu +
  toplamlar, eksikler listesi. Dosya adı "<booking> <ALICI-ilk-kelime> KONSIMENTO TALIMATI.pdf".
- PDF `lib/konsimento/talimat-pdf.ts` (jsPDF + autotable, Inter: gömülü Carlito alt kümesinde ş/ğ/ı/İ
  YOK). Akkon formunda gümrük müşaviri bloğu ŞİRKET AYARI: `companies.konsimento_gumruk_musaviri`
  (repo herkese açık; değer canlıda SQL ile girildi, repoda yok).
- Kontrol `lib/konsimento/kontrol.ts` (yapay zekâsız): form tanıma (standart / Akkon), değerin belgede
  GEÇMESİ ile karşılaştırma (metin sırası forma göre değişiyor), konteyner satırı ISO 6346 + mühür / kap /
  net / brüt. Alanlar: booking (Akkon formunda alan yok → bilgi), gemi/sefer (sefer farkı uyuşmuyor),
  limanlar, konteynerler, mühür, kap/net/brüt, toplamlar, navlun, GTİP, consignee, notify. Yükleme:
  tanınan form + dosyada consignee varsa ÜCRETSİZ kontrol (taraflar dosyada kalır); aksi halde eski
  yapay zekâ kontrolü (yeni müşteride consignee/notify'ı talimattan okur). "Yeniden kontrol et".
  Gerçek örnekler (repo dışı): standart 12/12 uyumlu; Akkon örneğinde sefer SEG0426W, sistemde SEG0426E.
- Hafıza: migration `20261106160000_konsimento_taraf_hafizasi.sql` — `trg_dosya_taraf_doldur` (BEFORE
  INSERT): aynı şirket + aynı alıcı (büyük harf / boşluk sade) en son dosyadan consignee (boşsa),
  notify, konşimento tercihleri (şablon hariç) + `consignee_kaynak='onceki_sevkiyat'`, `taraf_kaynagi`.
  Asla hata fırlatmaz; mevcut dosyalara dokunmaz. Geçmiş seçenekler `lib/konsimento/taraf-gecmisi.ts`
  (en yeni önce, tekil). Canlı test: geri alınan işlemle (iz kalmadı).
- Arayüz: Konşimento Talimatı kartında `components/konsimento-talimat-hazirlik.tsx` (şablon rozeti,
  consignee/notify + kaynağı, "Taraflar ve tercihler" formu: geçmiş çipleri, "Consignee ile aynı",
  ON BEHALF OF, mal tanımı, BL tipi, form seçimi, Akkon BL adedi / özel ibare; tüm konteynerler girilince
  "Talimatı Gör" + "İndir"). Sayfa `/belge/konsimento?d=<dosya>` (oturum; PDF her açılışta güncel
  veriden; Yeni sekmede aç / İndir; MSC'de bilgi). Kontrol satırları testid `konsimento-kontrol*`.
- Hatırlatma maili (`_shared/konsimento-hatirlatma.ts`): standart/Akkon'da konu "Konşimento talimatı
  hazır", "Talimatı Gör" + "Dosyayı aç", consignee/notify eksikse uyarı; MSC'de konu "Hatırlatma:
  konşimento talimatı (MSC web)", yalnız "Dosyayı uygulamada aç". Mod değişmedi: CANLI değilse yalnız
  test adresi (test adresi). Mail şablonu override'ı (elle form seçimi) görmez, acenteye bakar.
- Testler: unit `/home/claude/test/kons/{model,donus,kh,kontrol_gercek}.mts`, e2e `e2e_kons.mjs`
  (mock `FATURA_TEST=1 KONS_TEST=1`) 20/20.

## Üretim / son kullanım tarihi otomatiği (10.11.2026)

Kullanıcı: "Üretim ve tüketim tarihi her zaman o yüklemeye ait boş ekipman alım tarihi - 1 gün.
Sadece OM GENERAL için üretim-tüketim arası 15 ay, diğerleri 1 yıl."

- Migration `20261110010000_uretim_tarihi_otomatik.sql` (veritabanı tetikleyicisi; ekran yolundan bağımsız):
  - `uretim_tarihi = min(rezervasyonlar.ekipman_alim_tarihi) - 1 gün` (birden fazla rezervasyonda EN ERKEN alım).
  - `son_kullanim_tarihi = uretim + 12 ay`; alıcı `OM GENERAL…` ile başlıyorsa `+ 15 ay`.
  - Yalnız **Açık** dosyalar. Rezervasyon ekle / alım tarihi değiştir / sil / dosya değiştir → yeniden hesap.
- `ihracat_dosyalari.uretim_tarihi_elle`: tarihlerden biri herhangi bir yoldan değişirse `true`
  (sistem bir daha yazmaz). İkisi de boşaltılırsa `false` → hemen yeniden otomatik hesap.
  Migration anında dolu olan tüm tarihler elle sayıldı (geçmiş / kapalı dosyalara dokunulmadı).
- Ek Bilgiler kartı: otomatik tarihte etiket "Üretim Tarihi · otomatik"; düzenleme penceresinde kural ipucu.
- Fonksiyonlar `security definer`, `anon/authenticated` için EXECUTE kapalı; tetikleyici asla hata fırlatmaz.
- Test: canlıda `begin … rollback` ile 8 senaryo + yetkili kullanıcı (RLS) senaryosu; e2e `e2e_uretim.mjs`.

## Proforma Yükle — rezervasyon ekranında "Yeni Proforma Ekle" (10.11.2026)

Proforma yüklenince açılan "İhracat dosyası oluşturuldu" şeridinde **Yeni Proforma Ekle** düğmesi
(`data-yeni-proforma`). Aynı sayfada temiz yükleme adımına döner; önceki dosyanın durumu taşınmaz.
Ürün kütüphanesi (`ihracat_urunleri`) 10.11.2026'da kayıtlı proformalardaki 5 üründen dolduruldu (kullanıcı onayı).

## Fatura kontrolü — ücretsiz, alan alan (10.11.2026)

Kullanıcı: "Ücretsiz beyanname kontrol mekanizması iyi çalışıyor. Aynı şekilde fatura kontrolünde de ücretsiz
ve sağlam bir kontrol yapılmasını rica edeceğim. Önemli bilgiler kontrol edilmeli."

- `lib/fatura-oku.ts`: `faturaEkOku` e-Fatura metninden ek alanları okur (iki Unex şablonu: "Genel Açıklamalar"
  satırları ve üst blok): alıcı (SAYIN …), teslim şekli, GTİP, gemi, çıkış / varış limanı, marka, ödeme şekli,
  aracı banka, rezervasyon (sipariş) no, konteyner adedi.
- `faturaKarsilastir` artık `kontroller[]` (beyanname kontrolü biçimi: uyumlu / uyusmuyor / okunamadi / bilgi) döndürür.
  Uyuşmazlık sayılanlar: tutar + döviz, konteyner, net / brüt, kap, DİİB (tek faturada dosyanın DİİB'i; D1/D2 farkı not),
  teslim şekli, gemi, çıkış limanı (tanınan terminal farklıysa), varış limanı (faturada yazıp farklıysa), marka,
  ödeme şekli, aracı banka (tanınan bankalar farklıysa). Alıcı (baş harf desteği), rezervasyon no, GTİP: bulunamazsa / farklıysa "elle bakın".
  Eski `uyusmazliklar` dizisi korunur (eski kayıtlar ve rozet aynı).
- **Yapay zekâ yedeği kaldırıldı**: metni olmayan (taranmış / görsel) fatura `faturaOkunamadiSonucu()` ile
  "Elle kontrol" olarak kaydedilir; fatura no uydurulmaz. `fatura-kontrol` edge fonksiyonu canlıda duruyor ama uygulama çağırmıyor.
- Ekran (`components/fatura-upload-section.tsx`): alan listesi (`fatura-alanlar`), "Elle kontrol" rozeti ve kartı (`fatura-okunamadi`).
- Test: `fatura/test2.mts` (iki gerçek fatura metni, yerel; repoda yok), e2e `e2e_fatura_parca.mjs` (alan listesi), `e2e_fatura_okunamadi.mjs`.

## VGM Raporu maili — tüm konteynerlerin VGM'i girilince (10.11.2026)

Kullanıcı: "Toplam bütün konteynerlerin VGM'i hazır olduğunda operation mailine VGM raporu gönderilsin. Mailde VGM indir
butonu olsun. Tıklayınca hemen indirebilsin." Metin: "Kolay gelsin Volkan Bey, VGM Raporu ektedir. Lütfen ilgili acenteye
gönderimini sağlayalım." Canlı alıcılar (kullanıcı 10.11.2026): **To: operation@**, CC: bbt@, execution@, export@, export2@.

- Edge `vgm-rapor` (pg_cron, anon): yalnız `VGM_RAPOR_CANLI = evet` iken tarar. Koşul: **Açık** dosya, rezervasyon konteyner
  adedi > 0, girilen konteyner ≥ adet, her konteynerde `vgm_kg > 0`. Dosya başına bir kez (`vgm_rapor_gonderimleri`, kısmi
  benzersiz index; `hata` 3 denemeye kadar tekrar). Mail: PDF eki + "VGM İndir" (depodaki PDF'in 30 günlük imzalı adresi,
  giriş gerekmez) + "Dosyayı aç". Konu: `VGM Raporu · <dosya no> · <alıcı> · Rezervasyon <booking>`; rezervasyon no Acente kutusunda ve
  Sevkiyat Bilgileri tablosunda da var (kullanıcı 10.11.2026; bu mailde booking no İSTENİYOR). Tema: Günlük İhracat Raporu ile aynı.
- `{"test": true, "dosya_id"}`: "[TEST]" yalnız test adresine (`VGM_RAPOR_TEST_ALICISI`, varsayılan test adresi), 24 saatte 5;
  gönderilmiş saymaz. `{"onceden_isaretle": true}` (service_role): canlıya geçerken şu an tamam olan açık dosyalar `onceden`
  (geriye dönük mail gitmez).
- **Anında gönderim** (kullanıcı 10.11.2026: "en geç 10 dakika değil, hemen; konteyner sayısı kadar DBA yüklendiğinde"):
  `trg_vgm_rapor_konteyner` (konteynerler insert/update vgm_kg,dosya_id/delete) ve `trg_vgm_rapor_rezervasyon`
  (konteyner_adedi update/delete) → `vgm_dosya_tamam()` true ve işaretli değilse `net.http_post` ile `vgm-rapor` hemen
  çağrılır (anahtar cron komutundan okunur, repoda yok; tetik hata verirse yalnız uyarı, kayıt bozulmaz). 10 dakikalık
  `vgm-rapor` cron'u yedek/yeniden deneme. Canlıya geçiş 10.11.2026: IHR-2026-0110 `onceden`, cron kuruldu.
- PDF çizimi tek yerde: `supabase/functions/_shared/vgm-pdf.ts` (uygulamadaki "VGM İndir" — `lib/vgm-pdf-builder.ts` — ve mail
  aynı çizim). Edge fontu: `_shared/roboto-vgm-base64.ts` (Roboto alt kümesi, Latin-1 + Türkçe; ~25 KB, edge ile birlikte dağıtılır).
- Secret'lar: `VGM_RAPOR_CANLI`, `VGM_RAPOR_ALICI` (varsayılan operation@), `VGM_RAPOR_CC` (varsayılan bbt@, execution@, export@, export2@). Secret geçersizse varsayılan kullanılır.

## Konşimento talimatı hatırlatması + VGM raporu — canlı denetim (10.11.2026)

Kullanıcı: "Bütün konteynerler teslim alındığında operation@ adresine konşimento talimatı maili gidiyor mu? Bütün
konteynerler dolduğunda VGM raporu operation@'a gönderiliyor mu? Canlıda olduğuna emin olmalıyız. CC: bbt@, execution@,
export@, export2@."
- Bulgu 1: konşimento hatırlatması hiç canlıya alınmamıştı (`KONSIMENTO_HATIRLATMA_CANLI` yok → yalnız test adresi; kuyrukta
  yalnız 2 elle/test kaydı). Kullanıcı secret'ı `evet` girer.
- Bulgu 2: `kh_tamamlanma_kontrol` ve `kh_kuyruk_al` "BL no doluysa hatırlatma yok" diyordu; Ek Bilgiler kartı BL no'yu booking
  no ile önceden doldurduğu için mail kuyruğa hiç girmiyordu. Migration `20261110110000_konsimento_bl_kosulu.sql`: yalnız
  talimat dosyası yüklüyse atlanır. ROLLBACK provası: eksik konteynerler eklenince satır `bekliyor/otomatik` oldu.
- `KH_VARSAYILAN_CC` + export2@. Edge `konsimento-hatirlatma` v19: `{"islem":"ayar"}` salt okunur → `{canli, alici, cc}`
  (mail atmadan canlı doğrulama; secret değeri dönmez).
- VGM raporu: cron yanıtı `{ok:true,...}` (canlı; kapalıysa `canli:false` döner). Alıcı/CC test mailinin şeridinde görünür.

## Konteyner içeriği, DİİB fatura bağlantısı, bekleyen evrak animasyonu (11.11.2026)

- Kullanıcı: "Bir konteynerde 2 farklı ürün var; packing'de o konteynerin 2 ürün ismi yazması normal; bir konteynere 2 ayrı
  çuval ekleyebilmeliyiz. Diğer konteynerde tek ürün yazmalı." Migration `20261111160000_konteyner_kalemleri.sql` (CANLIDA):
  `konteynerler.kalemler jsonb` (null ya da 1–6 kalem: ürün, çuval markası, kap, net kg). `lib/konteyner-icerik.ts` (saf),
  `components/konteyner-icerik.tsx`: Konteynerler sekmesinde marka hücresinin altında "Ürün seç" / ürün adı / "N ürün";
  pencere ürünleri proformadan, çuvalı marka listesinden ya da serbest alır; birden çok kalemde kap + net zorunlu; toplam
  konteynerle tutmazsa uyarı (kayıt yine yapılır). Dosyada tek ürün varsa ve kalem girilmemişse düğme görünmez.
  `lib/packing-list-builder.ts`: kalemli konteyner kalem başına satır (seri, konteyner, mühür, brüt birleşik); tek kalemde
  konteynerin kap / net'i. Mevcut veri DEĞİŞMEDİ: kalemi olmayan konteyner eskisi gibi basılır. Test: e2e_kalem 10
  (FATURA_TEST=1 KALEM_TEST=1).
- "DİİB raporunda ilgili faturayı inceleyebilmeli": DİİB Takibi ayrıntısında fatura no → fatura PDF'i (bölünmüş dosyada
  parçanın PDF'i; `fatura-ac`), `/diib?fatura=NO` ilgili DİİB'i açar ve aramayı faturaya süzer. DİİB günlük mailinde
  "Bugün kesilen faturalar"daki fatura no bu bağlantıya gider (giriş gerekir; mailde PDF adresi YOK). Edge
  `diib-gunluk-rapor` v18. Test: e2e_diib 24.
- Ana Panel: bekleyen evrak ikonları (`evrak-bekliyor-ikon`) yavaşça döner (2,8 sn); "hareket azaltma" tercihinde durur.

## Fatura Talimatı Onayı (11.11.2026 akşam)

Kullanıcı: "Bütün konteynerler yüklendiğinde fatura talimatı operation / execution / export / export2 / bbt adresine onaya
gönderilmeli; onay veya revize butonları olmalı. Onaylanırsa onaylanmış fatura talimatı (muhasebe dahil) dağıtım listesine
gitmeli. Konu: FATURA VE BEYANNAME TALİMATI HAKKINDA // ALICI // 6 * 20 DC // LİMAN."
- Migration `20261111200000_fatura_onay_musteri_ozet_kaldir.sql`: `fatura_talimati_onaylari` (bekliyor → onaylandi |
  revize; yazma YALNIZ edge, şirket kullanıcıları okur; dosya + mod başına tek bekleyen), `fatura_onay_adaylari()`
  (service_role; açık, talimatı gönderilmemiş, rezervasyondaki konteynerlerin hepsi girilmiş dosya = `faturaTalimatiDurumu`
  "tam"), pg_cron `fatura-onay-tara` her 10 dk.
- Edge `fatura-onay`: anon/cron tarama (aynı modda kaydı olmayan adaya kayıt + "İncele ve Onayla" maili, çalışma başına 5);
  kullanıcı `{gonder}` elle / tekrar onaya gönder; `{karar:"onay", pdf}` dağıtım maili PDF ekli (canlıysa dosyada
  `fatura_talimati_gonderildi = true`); `{karar:"revize", not}` not onay grubuna. Karar YALNIZ onay listesindekiler
  (+ testte test adresi); `durum=eq.bekliyor` koşullu PATCH ile çift karar engellenir; mail gitmezse karar geri alınır.
- Alıcılar: Ayarlar > Rapor Alıcıları → "Fatura Talimatı Onayı" (`fatura_onay`) ve "Onaylı Fatura Talimatı"
  (`fatura_dagitim`). Canlı kapalıyken onay ve dağıtım mailleri yalnız test adresine "[TEST]". Adresler DB'de (repoda yok).
- Sayfa `/fatura-onay?id=` (`app/fatura-onay/page.tsx`, giriş gerekir; girişten sonra geri döner): PDF dosya
  sayfasındaki üreticiyle tarayıcıda (`lib/fatura-onay.ts` → `talimatPdfUret`), Onayla ve gönder / Revize iste (not zorunlu).
- Dosya sayfası > Konteynerler: `components/fatura-onay-durumu.tsx` son durum + "Onaya gönder" / "Tekrar onaya gönder".
- Mail kalıpları: `supabase/functions/_shared/fatura-onay.ts` (dağıtım metni kullanıcının verdiği metin, aynen).

- **14.11.2026 ONAY ADIMI KALDIRILDI** (kullanıcı: "Onayla gönder kısmını kaldırmalıyız. Sadece fatura talimatı gönderilsin:
  Harun Bey merhaba, fatura talimatı ektedir gibi; müşteri, konteyner adedi, varış limanı. PDF indir butonu eklenecek." Alıcı:
  export@, execution@, bbt@, operation@, export2@). Konteynerler tamamlanınca (pg_cron 10 dk) edge `fatura-onay` doğrudan
  talimat mailini atar: konu aynı kalıp, gövde `talimatMailiHtml` ("Harun Bey merhaba," + müşteri / konteyner / varış limanı /
  dosya + "Fatura Talimatını İndir (PDF)" → `/fatura-onay?id=…&indir=1`; sayfa PDF'i tarayıcıda üretip bir kez kendiliğinden
  indirir, giriş gerekir). PDF sunucuda üretilmez (üretici tarayıcıya bağlı: bayrak `canvas`), mailde ek yok. Kayıt durumu
  `gonderildi` (migration `20261114100000_fatura_talimati_onaysiz.sql`; eski `bekliyor/onaylandi/revize` yalnız geçmiş).
  Alıcılar: Ayarlar > Rapor Alıcıları > "Fatura Talimatı" (`fatura_onay`, Alıcı + CC); `fatura_dagitim` KULLANILMIYOR
  (satırı duruyor, ekrandan kalktı). `{karar}` çağrıları 410. Dosyadaki `fatura_talimati_gonderildi` işaretine DOKUNULMAZ
  (konşimento beklentisini başlatır; dosya sayfasındaki "Fatura Talimatı" maili işaretler). Dosya sayfası: "Şimdi gönder" /
  "Tekrar gönder". Canlıya geçiş: Ayarlar'da listeyi Canlı yap; o an adaylar (konteynerleri tam, talimatı işaretlenmemiş açık
  dosyalar) 10 dk içinde canlı mail alır. Test: `tests/fatura-talimati-mail.test.ts`.

## Fatura kontrolünde ağırlık payı kaldırıldı (12.11.2026)

Kullanıcı: "Net kg faturada yanlış yazılmış, neden uyarı göstermedi? Bu büyük bir güvensizlik." Sebep: `lib/fatura-oku.ts`
ağırlıkta 50 kg ya da %0,2 pay tanıyordu; 575.000 kg'da 1.150 kg (= 23.000 çuvalın darası; faturada net yerine brüt
yazılmış) pay içinde kaldı. Fatura, sistemdeki konteyner (kantar) ağırlıklarından hazırlanır, birebir tutmalı:
- Net / brüt ağırlıkta pay yalnız 1 kg yuvarlama (`AGIRLIK_PAYI_KG`); farkta satıra "Fark … kg" notu.
- Faturada net = brüt ve sistemde brüt > net ise ayrıca "net ağırlık brüte eşit yazılmış (dara düşülmemiş)" notu.
- Kayıtlı sonuçlar ekranda `kayitliSonucuDenetle` ile bugünkü kuralla yeniden değerlendirilir (kayıt değişmez).
- Fatura kartında "Yeniden kontrol et": yüklü PDF depodan indirilip yeniden okunur; yalnız `fatura_kontrol_sonucu`
  güncellenir (tek fatura ve DİİB parçaları). Eski (yapay zekâ ile kontrol edilmiş) faturalar bununla denetlenebilir.
- Test: scratchpad `fatura/test3.mts`, e2e_fatura_parca 23.
- Not: kullanılmayan yapay zekâ kontrolünün (`fatura-kontrol`) istemi küçük ağırlık farklarını yok saymayı söylüyor;
  istemci artık bu fonksiyonu çağırmıyor.
- 12.11.2026 (revize-1112c): kontrol kartlarındaki "Metinden okundu · ücretsiz" etiketi ve özet metnindeki "Fatura metninden
  okundu (yapay zekâ kullanılmadı)" ifadesi kaldırıldı (kullanıcı: "programı ucuz gösteriyor"). Kayıtlı eski özetler ekranda
  `ozetTemizle` ile temizlenir (kayıt değişmez).

### 14.11.2026 FATURA TALİMATI MAİLİ CANLIDA
- Ayarlar > Rapor Alıcıları > Fatura Talimatı canlı: bbt@, execution@, operation@, export@, export2@.
- Geçiş anında hazır olan eski dosyalar (IHR-2026-0110 / 0112 / 0113 / 0114) için kullanıcı mail İSTEMEDİ:
  `fatura_talimati_onaylari` durum 'atlandi' (test=false) kaydı yazıldı (migration 20261114140000); dosya
  sayfasında "gönderilmedi (canlıya geçişte atlandı)" + "Şimdi gönder". IHR-2026-0115 ilk taramada gerçek gitti.

### 16.11.2026 FOB BİRİM FİYATI: TON BAŞINA EŞİT DÜŞÜM
- Kullanıcı (ekibin elle hesabı, IHR-2026-0115): navlun 1.850 / 25 t = 74, lokal 400 / 25 t = 16 →
  490 − 74 + 16 = 432, 470 − 74 + 16 = 412 FOB. "Lütfen görseldeki yönteme geçelim."
- `fobBirimFiyati(cif, toplamCif, toplamFob, toplamMiktarMt)`: FOB = CIF − (toplamCif − toplamFob) / toplam MT
  (sabit 25 değil: toplam tonaja bölünür). Toplam FOB değişmedi (CIF − net navlun × konteyner).
  Talimat PDF'i, metin talimat, Ek Bilgiler kartı ve fatura bölünmesi (`faturaBolunmesi`: kg payı) aynı hesap.
- ÖNCEKİ (03.11): oransal FOB = CIF × toplamFob/toplamCif (Logo navlunu tutarla orantılı dağıttığı için).
  Ton başı yöntemde Logo'da navlun MİKTARA (kg) göre dağıtılmalı; yoksa faturadaki CIF birimler sapar
  (0115'te oransal dağıtımda 491,85 / 469,08). Test: tests/fob-ton-basi.test.ts.

## Belge kontrolleri: konteyner no + Draft BL yapay zekâsız (16.11.2026)
Kullanıcı (IHR-2026-0116 Akkon talimatı): "İlgili konteyner orada var fakat yine de yanlış gösteriyor. Fatura / konşimento
talimatı / Draft BL / beyanname kontrolleri en doğru şekilde yapılmalı."
- Neden: PSRU2219194 belgede ve sistemde AYNI, ama ISO 6346 kontrol hanesi tutmuyor (son hane 2 olmalı). Talimat ve
  beyanname okuyucuları kontrol hanesi tutmayan numarayı atıyordu → "Belgede yok" (yanlış alarm).
- `lib/konteyner-no.ts` (tek kaynak): `belgedekiKonteynerler(metin, sistemdekiler)` — sistemdeki numara kontrol hanesine
  bakılmadan eşleşir; sistemde olmayan aday yalnız ISO geçerliyse sayılır. `kontrolHanesiHatalari` → ayrı
  "Konteyner no (ISO)" satırı (durum `bilgi` = elle bakın; uyuşmazlık SAYILMAZ, özet sonuna not). Kullananlar:
  `lib/konsimento/kontrol.ts` (talimat + Draft BL), `lib/beyanname-kontrol.ts` (`konteynerAdaylari`).
  Fatura okuyucusu zaten kontrol hanesine bakmıyordu. Konteyner sekmesinde girişte / tabloda uyarı (kayıt engellenmez).
  DBA otomatik okuyucu (`_shared/dba-metin.ts`) kontrol hanesi tutmayan numarayı hâlâ reddeder (bilinçli; elle yükleme).
- Draft BL: eski kontrol yalnız yapay zekâydı (16 dosyanın 14'ünde "uyumsuz": BL no, dara, tip, MARPORT/AMBARLI).
  Yeni `draftBlMetniniKontrolEt` şablondan bağımsız: değer belgede GEÇİYOR MU (booking, gemi/sefer, yükleme limanı eşdeğer
  yazımlar [Ambarlı terminalleri, Asyaport=Tekirdağ], tahliye limanı anahtarı, konteyner seti, mühürler, konteyner brütü,
  toplam brüt/net/kap [25050 / 25.050 / 25,050.000], consignee/notify unvanı). Dara ve tip karşılaştırılmaz. Metin yoksa /
  konteyner bulunamazsa null → yapay zekâ yedeği. Yapay zekâ yalnız BL no / consignee / notify okur (hata verirse yerel sonuç
  kaydedilir). "Yeniden kontrol et" (eski yapay zekâ sonuçlarında "Yapay zekâsız yeniden kontrol et") yüklü PDF'i yeniden okur.
- Ortak görünüm: `components/belge-kontrol-listesi.tsx` (talimat + Draft BL). Test: `tests/belge-kontrol.test.ts`.

## Sevkiyat haritası: aktif limanlar yeşil + Tekirdağ çıkışı (16.11.2026)
Kullanıcı: "Sevkiyat haritası en doğru hali ile güncellenmeli ve şu an sevkiyatı olan limanlar yeşil olarak belirtilmeli."
- `lib/sevkiyat-aktif.ts`: dosya durumu ("Kapalı" = evrak tamam; gemi denizde olabilir) yerine rezervasyon tarihleri:
  YOLDA (ETD ≤ bugün, ETA ≥ bugün; ETA yoksa kalkıştan ≤ 45 gün), YÜKLEMEDE (ileri ETD ya da açık dosya ETD'siz),
  TAMAMLANDI. Aktiflik TÜM dosyalardan (filtreden bağımsız). Harita: yeşil + nabız = aktif, gri = tamamlanmış; rotalar aynı
  renk; ipucunda "Yolda / Yüklemede … en yakın varış / kalkış". Başlıkta "N aktif".
- Çıkış: Asyaport Tekirdağ/Barbaros'ta (40°54'N 27°28'E) — artık İstanbul'dan çizilmez (`lib/liman-koordinat.ts` CIKISLAR,
  `lib/deniz-rotasi.ts` "Tekirdağ" → MARMARA_G). Mardaş Ambarlı'dadır (İstanbul). Varış limanlarının koordinatları canlı
  verideki 12 limanda kontrol edildi (hepsi birebir, yaklaşık konum yok). Test: `tests/sevkiyat-haritasi.test.ts`.

## Menşe Şahadetnamesi + Phytosanitary: yalnız resmi mal adı (16.11.2026)
Kullanıcı (IHR-2026-0112 taslakları): COO'da "sadece WHEAT FLOUR", Phyto'da "sadece WHEAT FLOUR /Triticum sp." yazmalı
(ticari ad, "FOR BISCUIT / FOR WAFER", nem / protein spesifikasyonu, marka yazılmaz). Genel kural: iki belgenin eşya tanımı
`lib/konsimento/talimat.ts` `resmiMalAdiEn(ham_veri)` = konşimento talimatındaki İngilizce mal adı (dosyaya özel, Konşimento
talimatı > "Mal tanımı (EN) · BL, Menşe, Phyto") yoksa `WHEAT FLOUR`. Ambalaj / NET-GROSS / LOT / REF satırları aynı.
Fatura, çeki listesi, Health, Fumigation, Quality eskisi gibi ürün tanımını yazar. Test: `tests/resmi-mal-adi.test.ts`.

## Belgelerde marka uyumu (16.11.2026)
Kullanıcı (IHR-2026-0113): "Çuval/marka bilgisi LAILA; packing ve invoice gibi belgelerde 'PREMIUM QUALITY WHEAT FLOUR
(BLACKSTALLION BRAND)' ve 'PP BAGS (BLACKSTALLION BRAND' yazıyor." Neden: ürün açıklaması proformadan gelir ve markayı
parantezle taşır; sevkiyatta marka değişince eski marka belgelere aynen basılıyordu.
Kural (`lib/urun-tanimi.ts` `gercekMarkalar` + `markayaUyarla`; VERİ DEĞİŞMEZ, yalnız belgede): gerçek marka = konteyner
markaları (yoksa dosya.marka; "UNEX (KRAFT)" → UNEX). Gerçek marka TEK ve metinde TEK bir "(X BRAND)" varsa ve X farklıysa
→ "(GERÇEK BRAND)". Birden fazla marka ya da birden fazla parantez: belirsiz, dokunulmaz. Uygulanan yerler: Commercial
Invoice (ürün satırları + PACKAGING), Packing List (açıklama sütunu konteynerin kendi markasıyla + PACKAGING), Quality,
Fumigation, Fatura Talimatı PDF (ürün adı + ambalaj). Test: `tests/marka-uyumu.test.ts`.

## Kantar Paneli · İhracat sekmeleri (16.11.2026) — yalnız arayüz

`app/kantar/page.tsx` (İhracat sütunu; Yurt İçi sütunu değişmedi), `components/kantar-sevkiyat-durumu.tsx`, saf yardımcılar `lib/kantar-gorunum.ts` (test `tests/kantar-gorunum.test.ts`):

- **Başlık sayaçları:** Aktif dosya (dolumu bitmemiş, rezervasyonlu) · DBA bekleyen · Tamamlanan.
- **Eksik dolum şeridi:** "Dolum sürüyor · IHR-… 3/8 dolu"; tıklayınca o dosya aramaya yazılır. Hepsi tamamsa görünmez.
- **Sekmeler (`?sekme=aktif|tamamlanan`, varsayılan aktif):** Aktif dolumlar = bitmemiş sevkiyat kartları ("Tamamlanan N dosyayı göster" anahtarı; arama varken hepsi) + DBA bekleyen tablo (DBA yükleme burada, değişmedi). DBA tamamlanan = tamamlanan konteyner tablosu, gün düğmeleri (zaten yalnız kaydı olan günler) + arama.
- **`?dosya=`:** sayfa açılırken dosya no arama kutusuna yazılır (kartlar ve tablolar süzülür), adresten silinir.
- **Bağlantılar (yetkiye bağlı):** dosya no → `/panel?dosya=` yalnız Ana Panel yetkisi olana (kantar operatöründe düz yazı; müşteri adı kantara hâlâ gelmez). Ana Panel detay satırındaki "DBA x/y" adımı → `/kantar?dosya=` yalnız Kantar yetkisi olana.
- Dokunulmayan: DBA yükleme / otomatik DBA, canlı yenileme, sayım kuralı (`lib/kantar-sevkiyat.ts`).

## Ana Panel — İş emirleri (22.11.2026) — migration 20261122090000_panel_is_emirleri.sql

Kullanıcı: "Ön ödemesi alınmış proformalar Ana Panel'de görünmeli; rezervasyonu belliyse rezervasyonlu olarak. Mevcut iş
emrine hemen ulaşalım, proforma aramayalım."

- `panel_is_emirleri()` (yetki: `panel` ya da `proformalar`; ~1 sn): dosyası HENÜZ AÇILMAMIŞ iş emirleri.
  - **rezervasyonlu**: Yükleme Planı'nda booking'i olan (ETD son 7 gün ve sonrası, ETD'siz eski satırlar hariç), sistemde
    rezervasyonu / dosyası olmayan satırlar. Proforma: plan satırı, yoksa Sipariş Listesi'nde BL sütununda bu booking'i
    taşıyan satır. Sipariş Listesi'nde "sevk edildi" olan booking alınmaz.
  - **on_odeme**: Yükleme Planı'nın rezervasyon bekleyen (ön ödemesi alınmış) satırları + ön ödeme tarihi (eşleştirilmiş
    sistem proformasının kaydı da okunur: UNEXSIM061126 → UNEXBSC061126).
  - **aksiyonlar**: `plan_bekleyen_aksiyonlari_ic(sirket, liste)` (iç; istemciye kapalı). `plan_bekleyen_aksiyonlari` artık
    yetki kontrolü + bu iç fonksiyon; davranış aynı.
- Arayüz: `components/panel/is-emirleri.tsx` (dosya tablosunun üstünde iki `AcilirSerit`; açık/kapalı tercihi tarayıcıda).
  Rezervasyonlu: booking, gemi/sefer, acente, liman, ETD, talimat/beyan cut-off sayaçları (`CutoffSayac`), en yakın cut-off
  üstte; 2 gün içinde/geçmiş varsa şerit kırmızı. Ön ödemeli: ön ödeme tarihi + kaç gündür beklediği (≥7 gün sarı).
  Aksiyon (`lib/siparis/plan-bekleyen.ts` `bekleyenAksiyonu`): Rezervasyon ekle / Sevkiyat aç / Dosya aç (?otomatik=1) /
  Proforma yükle; düğmeler `proformalar` yetkisiyle. Saf: `lib/panel/is-emirleri.ts`; veri: `lib/panel/veri.ts`.
- Ana Panel dosya tablosunu beklemez; iş emirleri 5 dakikada bir ve sekmeye dönüldüğünde yenilenir; okunamazsa şerit gizli.
- Test: `tests/panel-is-emirleri.test.ts`.

## Booking'e göre sipariş takibi (22.11.2026) — DB değişikliği yok

Kullanıcı: "Ana panelde dosya aç dediğimde o rezervasyona ait konteyner sayısından sipariş takibini otomatikleştiremez miyiz?"

- Ana Panel rezervasyonlu iş emri: "Dosya aç" / "Sevkiyat aç" adresine `&booking=<no>&fcl=<konteyner>` eklenir
  (`lib/panel/is-emirleri.ts` bookingliAksiyon). Ön ödeme satırı ve "Rezervasyon ekle" / "Proforma yükle" aynen.
- Karar `lib/siparis-devam.ts` bookingKarari(hedefMts, bookingFcl). Hedef: yeni siparişte "Toplam Taahhüt"
  (varsayılan proforma miktarı), devam eden siparişte dosyası açılmamış miktar.
  - |booking − hedef| ≤ 0,5 FCL → tek (yeni: tek seferlik dosya; devam: siparişin kalanı). Kusurat (10,1 FCL) ayrı sevkiyat sayılmaz.
  - booking < hedef → sipariş takibi; bu dosya booking FCL'i × 25 MTS.
  - booking > hedef → otomatik karar YOK, uyarı; seçim kullanıcıda. Miktar okunamazsa da öneri yok.
- Proforma Yükle (`?booking=&fcl=`): "Booking'e göre öneri" kartı + tek "Onayla" düğmesi; eski seçenekler altta durur.
- Sevkiyat Seçimi penceresi `booking` alırsa FCL'i açık kalemlere SIRAYLA dağıtarak açılır (bookingSecimleri); seçim
  toplamı booking'den farklıysa uyarı (engel değil). İhracatlar `?siparis=&booking=&fcl=` aynı.
- Test: tests/booking-siparis-takibi.test.ts (kurgusal veri).

## Test ortamı (22.11.2026)

Kullanıcı: "Mevcut durum kayıtlı kalsın, farklı bir test alanında devam edelim; test ortamında deneyip duruma göre canlıya alalım."

- Test alanı = Netlify dal / PR önizlemesi. `next.config.js`: CONTEXT `deploy-preview` | `branch-deploy` → `NEXT_PUBLIC_ORTAM=test`;
  production ve CONTEXT'siz derleme `canli` (`lib/ortam.ts`, yalnız tam "test" test sayılır).
- Önizleme CANLI veritabanına bağlıdır (ayrı DB yok). Bu yüzden test ortamında:
  - her sayfada "Test ortamı" şeridi (`components/test-ortami-seridi.tsx`),
  - Proforma Yükle (tek / yeni sipariş / devam) ve İhracatlar "Sevkiyat aç" PROVA modunda: `ihracat_dosyalari` /
    `ana_siparisler` YAZILMAZ, oluşacak kayıt `components/prova-penceresi.tsx` ile gösterilir (`lib/prova.ts`).
  - Diğer sayfalardaki işlemler gerçek kayıttır (şerit bunu söyler).
- Akış: özellik dalı → PR (main'e) → Netlify önizleme + GitHub "Kod Kontrolu" → kullanıcı onayı → PR birleştirilir → canlı.

## Ana Panel — Tek iş listesi (23.11.2026) — migration 20261123090000_panel_odeme_bekleyenleri.sql (CANLIDA, sürüm 20261122210457)

Kullanıcı: "Bu sayfa çok karışık; tek sayfa şeklinde verebilmeliyiz. Açık sevkiyatlar, rezervasyonu alınmışlar açık sevkiyat
olarak görülmeli. Ödeme bekleyenler gri, kocaman 'Ödeme bekliyor'; ödeme gelince aktif hale gelecek." + "Bunlar otomatik
belirlenemiyor mu" → durum tamamen kayıtlardan.

- Kalkanlar: cut-off çubuğu (`components/panel/cutoff-cubugu.tsx`, dosya duruyor, kullanılmıyor), iki iş emri şeridi
  (`components/panel/is-emirleri.tsx`, aynı), dosya sekmeleri (Tümü / Cut-Off / Rezervasyon Bekleyen / Açık).
- Tek tablo (`lib/panel/is-listesi.ts` isListesiKur; satırlar `components/panel/is-listesi-satirlari.tsx`, dosya satırı
  `app/panel/page.tsx`'te eskisi gibi + ilk sütun Durum ve renkli sol kenar):
  - Cut-off (kırmızı): belgesi verilmemiş talimat / beyanname cut-off'u 0–3 gün (eski "Cut-Off Yaklaşan" kuralı).
  - Açık sevkiyat (yeşil): rezervasyonlu açık dosya + booking'li, dosyası açılmamış iş emri ("Dosya açılmadı").
  - Rezervasyon bekliyor (mavi): rezervasyonsuz açık dosya (satırdan "Rezervasyon ekle") + ön ödemesi alınmış, booking'siz sipariş.
  - Ödeme bekliyor (gri, soluk, kesikli "ÖDEME BEKLİYOR"): `panel_odeme_bekleyenleri()` = Sipariş Listesi "Onay bekleyen"
    (`siparis_listesi_veri` durum onay_bekliyor). Pasif; yalnız "Sipariş Listesi" bağlantısı. İşaretlenince maviye geçer.
- Tekrar yok: booking'li iş emri rezervasyonsuz dosyayı işaret ediyorsa dosya satırı gizli; ön ödeme iş emri rezervasyonsuz
  dosyayı işaret ediyorsa iş emri gizli; ödeme bekleyen proforma başka satırda varsa (R eki dahil) gösterilmez.
- Sıra: cut-off > açık > rezervasyon bekliyor > ödeme; grup içinde en yakın cut-off / en eski bekleyen üstte.
- Filtre `?filtre=` tumu | acik (açık + cut-off) | cutoff | rez_bekliyor | odeme; eski `rezervasyon` → rez_bekliyor.
  Arama: müşteri / proforma / dosya no / booking. `?dosya=` vurgusu aynen (filtre / arama gizliyorsa Tümü'ye döner).
- Veri: dosyalar dakikada bir; iş emirleri + ödeme bekleyenler 5 dakikada bir PARALEL (biri okunamazsa diğeri gelir).
- Özet kartları duruyor (Cut-off kartı metni: "listede kırmızı satırlar").
- Test: tests/panel-is-listesi.test.ts (kurgusal veri).

## Ana Panel — Günlük yükleme hedefi (23.11.2026) — DB değişikliği yok

Kullanıcı: "Günlük yüklenmesi gereken konteyner sayısını hesaplayabilmeli. Talimat cut-off = konşimento talimatının
gönderilmesi; o tarihe kadar bütün konteynerler alınmış olmalı. Beyanname = bütün konteynerlerin dolu şekilde içeri
girmiş olması. Günlük yükleme hesaplanmalı."

- Hesap `lib/panel/gunluk-yukleme.ts` (saf; test tests/panel-gunluk-yukleme.test.ts):
  - Boş alım = rezervasyon adedi − eklenen konteyner; TALİMAT cut-off gününe kadar (talimat / draft BL / beyanname varsa tamam).
  - Yükleme = rezervasyon adedi − DBA'lı konteyner; hedef = BEYANNAME cut-off gününden bir önceki iş günü (geçmişte son dolu
    konteyner cut-off'tan ortada ~2 gün önce; cut-off günü son çare → "gecikme"). Beyanname varsa tamam.
  - Pencere: boş ekipman tarihinden (rezervasyon `ekipman_alim_tarihi`, plan `bos_ekipman_tarihi`) önce plan yok; yoksa hedeften
    en fazla 5 iş günü önce.
  - İş günleri ve kapasite son 75 günün DBA TARTIM günlerinden (Bugün Yüklenen ile aynı kural, `efektifTartimBilgisi`):
    en az 3 gün yükleme yapılan hafta günleri (canlı: Pzt–Cmt, Pazar yok); ortalama / %75 / en yüksek (canlı 5,6 / 7 / 13).
  - Plan: en yakın hedef önce (EDF), her gün aynı hız; gereken hız = tüm hedefleri tutturan EN DÜŞÜK günlük adet.
    Bugün tartılanlar bugünün kotasından düşer: gün içinde yükledikçe kalan azalır, bugünün hedefi SABİT kalır (büyümez);
    fazla yüklenirse sonraki günlerin yükü azalır.
    Risk: ≤ %75 normal, ≤ en yüksek "ortalamanın üstünde", üstü "en yüksek günü aşıyor"; geçmiş < 10 gün "bilinmiyor".
  - Cut-off'lar duvar saati (gün = metnin ilk 10 karakteri), DBA tartım günü İstanbul.
- Kaynak: açık dosyalar (rezervasyonlu) + dosyası açılmamış booking'ler (Yükleme Planı; alınan / dolu 0 sayılır, "takip edilemiyor").
  Beyanname cut-off'u olmayan plan dışı (sayısı kartta).
- Görünüm: `components/panel/gunluk-yukleme-karti.tsx` — bugün yüklenen / hedef + bugün alınacak boş, gereken hız ve geçmiş
  kapasite, önümüzdeki 6 iş günü (güne tıklayınca müşteri bazında). Liste satırında Konteyner sütununda "Bugün: 1 boş al ·
  2 yükle" ya da "Hedef: Per 26.11". Veri `yuklemeGecmisiOku` (lib/panel/veri.ts), iş emirleriyle 5 dakikada bir.

### Günlük yükleme — kural güncellemesi (23.11.2026 gece)

Kullanıcı: "Talimat cut-off'u için tartım gerekmez; rezervasyon kadar konteyner numarası yeterli. Talimat tarihi sabittir.
Ekipman alım tarihi ve ardiyesiz giriş rezervasyonda belirtilir; ardiyesiz giriş değişebilir." + "50'lik 1,5 saatte, 25'lik
3–3,5 saatte doluyor." + "Cumartesiyi dahil et" (iş günleri zaten geçmişten: Pzt–Cmt).

- Boş alım: talimat cut-off'una kadar (sabit, en kötü durum); en erken ekipman alım tarihi. Kartta bugün alınacak boşlar
  talimat saatiyle ("son 15:00").
- **Bugün en az** (sert): beyanname cut-off'u − 3 sa (yol ~2 + kapı ~1) − dolum (50 kg 1,5 / 25 kg veya bilinmiyor 3,5) 07:00'den
  önce kalıyorsa son gün bir önceki iş günü (`sertSonGun`). En az = sonraki her iş günü geçmişin en yüksek günü kadar
  yüklense bile bugün yüklenmesi ZORUNLU kalan adet.
- **Önerilen**: hedef beyannameden bir önceki iş günü (sert son günü geçemez), dengeli hız (değişmedi).
- Ardiyesiz giriş (yumuşak): yükleme en erken ardiyesiz girişin bir önceki iş günü; sert son güne sığmıyorsa "ardiye riski".
- Çuval: `cuvalKgOku` (ambalaj / detaylı ambalaj; karışıkta 25). Gün kutularında ≈ dolum saati.
- Değişiklik takibi (sonraki iş): rezervasyon değişiklikleri `denetim_kayitlari`'nda (23.09'dan beri); panelde "değişti" gösterimi.

### Günlük yükleme — araç (23.11.2026 gece)

Kullanıcı: "Konteyner yüklemelerinde dışarıya araba taşırmaya çalış. Tarihlere yetişebildiğimiz an kenara boşa araba çıkartmaya çalış."
- Tur = yol ~2 + dolum (50 kg 1,5 / 25 kg 3,5) + yol ~2 + kapı ~1 sa (`turSaati`: 25 kg 8,5, 50 kg 6,5); araç günde ~13 sa
  (`ARAC_GUNLUK_SAAT`; 50 kg'da 2 tur, 25 kg'da 1 tur — geçmişte araç başına çoğunlukla 1, bazen 2 tur). Dorse değişmez: tur = 1 konteyner.
- Günün turları araçlara yerleştirilir (`aracIhtiyaci`, büyükten küçüğe ilk sığan); bugün tartılanların turları bugüne dahil.
- Plan seçimi: cut-off'ları tutturan en düşük hızdan başlayıp +4 hıza kadar denenir; EN YOĞUN GÜNÜN ARAÇ SAYISI en az olan
  seçilir (eşitlikte düşük hız). Kartta "Araç: bugün N / 8 · M araç boşa çıkabilir", gün kutusunda "N araç · M boşta";
  en yoğun gün filoyu (FILO_ARAC = 8) aşarsa kırmızı "Filo yetmiyor".
- Canlı hafta (23–26.11): 5 / 3 / 5 / 5 araç; alt sınır 18 araç-gün / 4 gün → 5 (en iyisi). Parametreler ileride
  Sevkiyat Parametreleri sayfasına taşınacak (araç takip paneli ölçümleriyle).
- 23.11.2026 (kullanıcı: "8 saat çalışıyorlar, bazen mesai oluyor"): normal gün `ARAC_GUNLUK_SAAT` = 8 sa → her tur ayrı araç;
  mesaiyle `MESAI_GUNLUK_SAAT` = 13 sa (50 kg'da araç başı 2 tur). Plan seçimi önce normal mesaide en yoğun günün aracını, sonra
  mesaili aracı en aza indirir. Kart: "bugün 6 / 8 · 2 araç boşa çıkabilir · mesaiyle 5 araç". 25 kg turu (~8,5 sa) 8 saati
  az aşıyor; araç takibi ölçümüyle netleşecek.
- 23.11.2026 Ana Panel "Yükleme başladı" (sarı, en üstte): rezervasyonlu dosyada en az 1 konteyner alınmış ve dolu (DBA'lı)
  sayı rezervasyon adedinin altında. Hepsi dolunca normal duruma döner (evrak bekleyen dolu dosyalar sarı kalmaz). Sarılar
  kalan konteyner çoktan aza (eşitse toplam, sonra talimat); altında kırmızı + yeşil TEK sıra, ilk talimat cut-off'u erken
  olan üstte. Sarı satırın cut-off'u yakınsa "Cut-off yakın" notu ve Cut-off filtresinde de görünür (lib/panel/is-listesi.ts).
- 23.11.2026 Ana Panel her ekrana uyum (kullanıcı: "%100 iken yana kaydırma istemiyorum"): liste 10 sütundan 6'ya indi
  (Durum | Sipariş: proforma + müşteri + liman + booking · ETD | Konteyner | Cut-off: talimat + beyanname alt alta | Evraklar |
  İşlemler). 1500 px altı Evraklar sütunu gizli (Konteyner hücresinde "Evrak n/4" sayacı, ▾ detayda tam durum); 1280 px altı
  (240 px kenar çubuğuyla tablo sığmaz) satırlar kart olur (tablette 4, telefonda 2 sütun). Sınıf sabitleri:
  components/panel/is-listesi-satirlari.tsx (LISTE_SATIR, HUCRE*). Detay düğmesi yazısı yalnız 2xl'de.
- 23.11.2026 (kullanıcı: "Böyle de çok amatörce oldu"): Cut-off hücresi tek satırlı iki çizgiye indi
  ("TALİMAT 26.11 12:00 [3g 08:45]" / "BEYAN …"; tamamsa yeşil "Gönderildi" / "Draft BL"; CutoffSatiri). Satır yüksekliği
  Sipariş hücresiyle eşit; hücre dolgusu py-2.5; dosyasız iş emrinde Evraklar "—". Evraklar sütunu 1500 px ve üstü.
- 23.11.2026 Özet kartları doğrulandı (canlı veri): Aktif 14 ✓, Bugün yüklenen (DBA tartım günü) ✓, Cut-off 1 ✓ (BAKEBS talimat
  15:00, 24 saat kuralı). "Yüklenecek Konteyner" → "Bu Hafta Yüklenecek" (haftalikYukleme: hedef günü bu hafta / geçmiş
  işlerin kalanı, dosyası açılmamış booking'ler dahil; eski kart yalnız açık dosyaları sayıyordu: 13 → bu hafta 23). Cut-off
  kartı dosyasız booking'leri de sayar; alt yazı "listede kırmızı satırlar" yerine en yakın uyarı (liste kırmızısı 0-3 gün).

## Kantar bağlantısı — Aşama 0, deneme (24.11.2026) — migration 20261124100000_kantar_tartimlari.sql (CANLIDA)
Kantar bilgisayarı = DBA ajanının bilgisayarı. Kantar programı BAYKON "Truck Scale" 8.06 (C:\Truck Scale); tartımlar yerel SQL
Server Express `.\SQLEXPRESS` → `TruckSolas` veritabanı: `dbo.RECORDS` (tamamlanan; ID, PLATE_NO, QUESTION_1 firma, _2 ürün,
_3 rezervasyon (booking son hanesi), _4 irsaliye no, _5 şoför (ALINMAZ), _6 "konteyner-mühür", _7 dorse, _8 liman,
ENTRY/EXIT_DATE_TIME, WEIGHT_1/2, TICKET_NO_*, SOLAS_02 DBA no, SOLAS_03 konteyner, SolasStatu, CHANGE, EXTRA_3 = FIRST kaydı),
`dbo.FIRST` (ilk tartımı yapılmış, ikinci tartımı bekleyen). Access dosyaları (Log/Truck.mdb) eski, kullanılmıyor.
Canlı gösterge ağda Modbus TCP (port 502), büyük ekran ayrı TCP — Faz 4 (bağlanılmadı).
- **Kullanıcı kuralları:** evraklardaki kg'a DOKUNULMAZ (25.000 / 25.050 gibi değerler aynen; kantar kg'ı yalnız kontrol/bilgi).
  İç piyasada kantar irsaliyenin yerine GEÇMEZ; irsaliye kg ile kantar kg KARŞILAŞTIRILIR.
- **İzin:** scripts/kantar-dba/kantar-izin.ps1 (tek seferlik, Yönetici): SYSTEM hesabına yalnız TruckSolas `db_datareader`
  + DENY INSERT/UPDATE/DELETE/EXECUTE/ALTER/CREATE (kullanıcıyı kendisi oluşturduysa). Önceki durumu C:\UnexDBA\kantar-izin-onceki.json'a
  yazar; SYSTEM sysadmin ise hiçbir şey değiştirmez; SYSTEM adına test eder (okuma var, yazma kapalı), başarısızsa geri alır.
  `-Kaldir` ile yalnız kendi oluşturduğunu geri alır. Şifre kullanmaz. Truck Scale `sa` ile bağlanıyor; ona dokunulmaz.
- **Ajan 1.2.0** (scripts/kantar-dba/dba-ajan.ps1; guncelle.ps1 ile kurulur): her dakika SALT SELECT; ilk çalışma son 14 gün,
  sonra `ID > son` + son 2 saatte çıkanlar, günde bir son 3 gün; FIRST anlık kopya. `x-islem: tartim` ile dba-otomatik'e
  (1.2.0) gönderir → `kantar_tartim_kaydet` (yalnız service_role) → `kantar_tartimlari` (upsert, cihaz+kayıt no) ve
  `kantar_bekleyenler` (yenilenir). Okuma hatası DBA akışını etkilemez (saatte bir günlüğe). ayar.json `"kantar":{"aktif":false}` kapatır.
- **Karşılaştırma (deneme raporu):** `kantar_karsilastirma(p_bas, p_bit)` (panel / kantar yetkisi, salt okunur): her tartım için
  tür = ihracat (konteyner no → konteynerler: dosya, mühür kantar/sistem — rakamlar karşılaştırılır, booking kantardaki rezervasyon
  no ile bitiyor mu) / ic_satis (irsaliye no → ic_sevkler) / ic_alis (irsaliye no → ic_alis_teslimler) / plaka (aynı gün aynı plaka)
  / eslesmedi; iç piyasada `kg_farki` = irsaliye kg − kantar net; giriş-çıkış dakikası; bekleyenler. Hiçbir iş kaydı değişmez.
  Doğrulama (23.11 gerçek kayıtlarla, işlem geri alındı): bir iç satış sevkinde kantar neti = irsaliye neti (fark 0);
  bir ihracat konteynerinde dosya, mühür ve booking tutuyor.
- Sonraki aşamalar: 1) ihracat (konteyner anında dolu, mühür, booking kontrolü), 2) iç piyasa (sevk/alış eşleştirme, eşleşmeyen
  tartım, kg farkı), 3) ana panel "şu an dolduruluyor" + ölçülen dolum süreleri, 4) canlı gösterge.
