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

## 3.5 Gelen cevap tespiti + görev sayfası akışı (10.11.2026)

Kullanıcı: "Cevap bildirmeden yeni müşteriye geçilebilmeli; ama temasa geçtiğini bildirmeden geçememeli."
"Fuar listesinde telefonlar mevcut; paylaş butonu olsun, WhatsApp'tan hızlı temas. Bizim müşterilerimizin telefonuna
gerek yok, WhatsApp grupları var." Cevap tespiti onaylandı (arşiv Gmail + Apps Script).

Görev sayfası:
- "Bugün atla" kalktı. "Yeni müşteriyle devam et" (alt şerit + başarı ekranı) yalnız bu görevde temas kaydı
  (Gönderdim ya da sonuç) varken açık: `pazar_gorev_bilgi` → `gorev.temas_var`. Sonuç bildirmek zorunlu değil.
- WhatsApp: yetkilinin her numarası için ayrı düğme (fuar listesinden: 714 potansiyel yetkiliden 688'inde telefon);
  numarasız müşteride "WhatsApp grubuna gönder" (wa.me/?text, grup seçilir); telefonda "Paylaş" (Web Share API).
- Arşivden gelen son cevap sayfanın üstünde: tarih, gönderen, konu, alıntısız metin + sistemin önerisi ("Öneriyi kaydet").

Migration `20261110080000_pazar_gelen.sql`:
- `pazar_gelenler` (mesaj_id = Message-ID tekil, gönderen, konu, özet ≤2000, tarih, tür cevap / otomatik, öneri).
- `pazar_gelen_kaydet(mesajlar)`: kendi alan adlarımız / sistem adresleri atlanır; yetkili e-postası, yoksa özel alan adı
  (ücretsiz posta servisleri hariç, tek firma) ile eşleşir; eşleşmeyen kaydedilmez. Otomatik yanıt süreci etkilemez.
  Süreçteki firmada (sorgulandı / hatırlatma / sessiz) gerçek cevap → aşama "cevap", hatırlatma durur, 30 gün bekler,
  temas kaydı (işleyen "arşiv (otomatik)"); süreç dışı yazışmada 14 gün sorgulama seçilmez. Öneri yalnız öneri:
  ilgilenmiyor > sipariş > teklif (anahtar kelime, yapay zekâ yok). 10.11 canlı deneme (ROLLBACK): doğru.
- Edge `pazar-gorev` v3: `{islem: "gelen"}` + başlık `x-pazar-anahtar` = secret `PAZAR_GELEN_ANAHTAR` (≥24 karakter,
  sabit süreli karşılaştırma; secret yoksa 503).
- Apps Script: `docs/apps-script/pazar-gelen.gs` (arşiv hesabında; ANAHTAR + ANON betik özelliklerinde, repoda gizli yok;
  10 dk tetikleyici; alıntı satırlarını keser; imleç + 1 saat geri tarama, tekrar Message-ID ile elenir).
- Posta: unex.com.tr = Promail üzerinde SmarterMail; execution@ zaten arşive yönlendiriyor. export@ / export2@ için de
  SmarterMail yönlendirmesi ("kopyasını kutuda bırak") önerildi; Outlook'u etkilemez.
- Yedek: `pazar_ekip`, `pazar_gelenler` yedekleme listesinde (yedekleme-gonder v43).
- Test: `e2e_gorev.mjs` 43 kontrol (sıradaki kilidi, atla yok, gelen cevap + öneri, WhatsApp gönderdim).

## 3.5b Canlı kurulum ve öneri düzeltmesi (10.11.2026)

- Kullanıcı `PAZAR_GELEN_ANAHTAR` secret'ını girdi, Apps Script'i arşiv hesabına kurdu (proje "Pazar Gelen Cevap",
  tetikleyici `tara` 10 dk). İlk çalışma (son 2 gün): 3 müşteri cevabı kaydedildi (üçü de yetkili e-postasıyla birebir
  eşleşme; süreç dışı yazışma → 14 gün sorgulama seçilmez), 43 eşleşmeyen mail kaydedilmedi.
- Öneri kuralı `pazar_gelen_oneri(konu, özet)` fonksiyonuna taşındı (migration `20261110090000_pazar_gelen_oneri.sql`):
  "confirmed / signed / approved PI, proforma, contract" ve "order ref" → sipariş (önceden "teklif" çıkıyordu); konu da
  değerlendirilir; mevcut kayıtların önerisi yeniden hesaplandı.
- export@ / export2@ yönlendirmesi şimdilik açılmadı (kullanıcı: görev mailleri execution@'ı CC'ler); bir–iki hafta izlenecek.

## 3.6 Takip ekranı + nedenli atlama + canlıya alma (10.11.2026)

Kullanıcı: "Her ihtimale karşı müşteriyi atla butonu olmalı; neden kısa yazılmalı, yazılanlar hafızaya alınıp bir sonraki
atlamada seçenek olarak gösterilmeli." + "Pazar sayfası çok dağınık; tutarlı, düzenli, kolay okunabilir olmalı. Burak Bey
önündeki ekranda gerekli takibi yapabilmeli." + "Canlıya alalım."
- Migration `20261110100000_pazar_atla_takip.sql`: `pazar_gorev_isle('atla')` neden ZORUNLU (≥3 karakter →
  `pazar_temaslar.konu`, 120); `pazar_gorev_bilgi.temas_var` atlamayı da sayar; `atlama_nedenleri` (şirketin en sık /
  en yeni 8 nedeni); `pazar_takip(gün)` (Takip sekmesi; token'sız; yalnız `pazar` yetkisi).
- Görev sayfası: "Müşteriyi atla" → neden paneli (önceki nedenler çip, serbest metin, ≥3 karakter) → başarı ekranında
  neden + "Yeni müşteriyle devam et". Geçmişte atlama nedeni görünür.
- Pazar sayfası üç sekme: **Takip** (varsayılan; `components/pazar/takip.tsx`: Bugün — kişi başına görevler, durum
  [mail / WhatsApp / sonuç / atlandı + neden], ilerleme, son 7 gün; Gelen cevaplar — son 14 gün + öneri; Süreçteki
  firmalar — aşama, son temas + işleyen, sonraki adım [gecikti kırmızı / bugün sarı]) | Müşterilerimiz (aşama etiketi) |
  Potansiyel. Üst kartlar: bugün işlenen, süreçteki firma, gelen cevap (14 gün), siparişsiz müşteri.
- Canlı: 10.11 test görevleri (12, dokunulmamış) temizlendi; pg_cron `pazar-gorev` `*/30 6-8 * * 1-5` (UTC = TR
  09:00–11:30; edge kişi başına günde bir mail). Gönderim `PAZAR_GOREV_CANLI=evet` secret'ına bağlı (kullanıcı girer).
  11.11 prova (ROLLBACK): Harun Bey 6 siparişsiz; Şafak Bey 4 siparişsiz + 2 potansiyel; yazışan 3 müşteri dışarıda.
- Test: `e2e_gorev.mjs` 50 (atla paneli, seçenek, zorunlu neden), `e2e_pazar.mjs` 80 (sekmeler, Takip bölümleri).

## 3.7 Satış Rehberi + duyuru maili (10.11.2026)

Kullanıcı: "Konu ile ilgili bilgilendirici mail iletmeli miyiz? İlk etapta mesensei282'ye test. Kullanım kılavuzu gibi
düşün; aynı UNEX kullanım kılavuzundaki gibi görüntülü animasyonlu bir sunum."
- Kılavuz sunumu ortak bileşene çıkarıldı: `components/kilavuz/sunum.tsx` → `KilavuzSunum` (konular, noktalar, başlık,
  konum anahtarı, çıkış, kapak/son metinleri prop). `/kilavuz` davranışı DEĞİŞMEDİ (e2e_kilavuz_vgm 44).
- `/gorev/rehber` (girişsiz, noindex): "Satış Rehberi", 7 evren (`lib/pazar/rehber.ts`): sabah maili → müşteriyi tanı →
  mesaj/Outlook → WhatsApp → sonuç + atla → otomatik cevap → Takip. Ekranlar `public/kilavuz/{pazar-mail, gorev-*,
  pazar-takip}.webp` (KURGUSAL mock veri, kişi adı yok), noktalar `lib/pazar/rehber-noktalari.ts` (OTOMATİK).
- Edge `pazar-gorev` v6: `{"islem":"duyuru","test":true}` → ekipteki her kişi için tanıtım maili YALNIZ test adresine;
  gerçek gönderim `{"islem":"duyuru"}` + `x-pazar-anahtar` zorunlu, kişi başına bir kez (`atanan = duyuru-<kod>`).
  Mail: başlangıç günü, 4 adım, "Sistem sizin için takip eder", "Rehberi izle (3 dakika)" → `/gorev/rehber`.
- Test: `e2e_rehber.mjs` 22. 10.11 duyuru testi: 2 mail, yalnız mesensei282.

## 3.8 Müşteri Özeti raporu — departmanlara günlük talimat (11.11.2026)

Kullanıcı: "Her müşteri için özet raporu oluşturulsun. Veritabanına göre. Her gün müşterilere gönderilmesi için mail ile
talimat verilecek departmanlara. Potansiyel müşterilerimiz için özet rapor oluşturulsun. Alıcı: operation, export,
export2, execution, bbt. Şimdilik test maili sensei ile."
- Migration `20261111180000_musteri_ozet_raporu.sql` (CANLIDA): `musteri_ozet_gonderimleri` (canlı zamanlanmış gönderim
  şirket + gün tek), `musteri_ozet_veri(p_company)` (YALNIZ service_role; müşteriler + geçerli e-postaları, dosyalar
  `pazar_anahtar` ile, rezervasyonlar, ödeme hatırlatmaları, onay / ön ödeme bekleyen siparişler, 14 günlük gelen
  cevaplar, potansiyel özeti), pg_cron `musteri-ozet-rapor` 05:00 UTC = 08:00 TR her gün.
- Saf: `supabase/functions/_shared/musteri-ozet.ts`. Talimat kuralları (departman + ACİL / BUGÜN / BİLGİ):
  Operasyon — rezervasyonsuz açık dosya, ön ödemesi alınmış sipariş, 3 gün içinde talimat cut-off, draft revizesi;
  Export — draft gönderilmedi / onay bekliyor (2+ gün), proforma onayı (3+ gün), son 3 günde gelen cevap, varışa ≤7 gün,
  45+ gün siparişsiz; Execution — gemi kalktı fatura yok, ödeme bekliyor (konşimento Telex / Seawaybill / Vesaik değil;
  `lib/odeme-takibi` ile aynı kural; ETD'den 120 günden eski olan düşer; varışta ya da 21+ gün ACİL).
- Mail: özet kutuları, departman talimatları, aktif müşteri kartları (sevkiyatlar, açık proformalar, İngilizce durum metni
  — fiyat / ödeme YOK — ve "Müşteriye özeti Outlook'ta hazırla" mailto; e-postası yoksa uyarı), siparişsiz müşteriler,
  potansiyel (aşamalar, ülkeler, "proforma verilmiş henüz müşterimiz olmayan firmalar", görüşme sürecindekiler).
  Müşteriye sistemden mail GİTMEZ.
- Edge `musteri-ozet-rapor` (verify_jwt): anon `{}` yalnız sabah penceresi; `MUSTERI_OZET_CANLI=evet` +
  `MUSTERI_OZET_ALICI` (en fazla 6) değilse "[TEST]" yalnız test adresine; anon `{test:true}` yalnız test modunda (24 saatte 5);
  yönetici `{deneme:true}` HTML döner. İlk test 11.11.2026: 24 müşteri, 17 aktif, 41 talimat (11 acil), 16 proformalı potansiyel.
- Test: `test/mozet/test.mts` (kurgusal veri, 19 kontrol).
- Revize (11.11.2026 akşam, kullanıcı: "beğenmedim, şimdilik canlıya almayacağız"): mail kısa (Otomatik Özet 5 cümle + en
  acil 8 iş), tüm işler / müşteriler (İngilizce metin + e-posta) / sevkiyatlar / potansiyel EKTEKİ EXCEL'de. pg_cron
  `musteri-ozet-rapor` PASİF (cron.alter_job active=false); Ayarlar > Rapor Alıcıları'ndan Önizle / Test maili ile denenir.

## Sıradaki adımlar

Duyurunun gerçek gönderimi (kullanıcı onayıyla) · İlk canlı sabahın kontrolü (11.11): gönderim kaydı, görevler, işlemeler · export@ / export2@ yönlendirmesi gerekirse ·
Dalga 4 Yönetim Paneli · Dalga 5 Transit.
