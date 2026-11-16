# Analiz, Kontrol Merkezi ve Raporlar — Claude notları

> 02.11.2026: CLAUDE.md'den bölünerek taşındı, metin DEĞİŞTİRİLMEDİ (bölüm sırası korunur).
> Bu konudaki yeni notlar bu dosyaya eklenir. Proje çapındaki kurallar kök `CLAUDE.md`'de.

## Analiz sayfası hesap kuralları (`app/analiz/page.tsx`, 01.10.2026)

- Konteyner sayısı her kartta tek kaynaktan: dosyanın rezervasyonlarındaki
  `konteyner_adedi` toplamı; rezervasyon yoksa eklenmiş konteyner sayısı
  (`konteynerSayisi`). Eklenen konteyner sayısı rezervasyondakinden farklı
  olabiliyor (örn. IHR-2026-0089: rez 4, eklenen 2) — analiz rezervasyonu esas alır.
- Tarih esası "sevkiyat tarihi" = en erken ETD, yoksa `olusturma_tarihi`
  (`sevkiyatTarihi`). Yıl filtresi (veriden üretilir), aylık grafik ve "Son
  Tamamlanan Sevkiyatlar" sırası buna göre.
- Varış limanı serbest metin; `lib/liman-anahtari.ts` farklı yazımları tek
  İngilizce büyük harf ada indirger (DJIBOUTI, SINGAPORE…) — SADECE gruplama
  için, kayıt ve evraklar değişmez. Yeni bir Türkçe yazım çıkarsa
  `TURKCE_ADLAR`'a eklenir. Gemi adları da "M/V", "MV" öneki ve boşluk farkı
  yok sayılarak birleştirilir.
- Yüzdeler "toplamdaki pay"; çubuk uzunluğu listedeki en büyüğe göre. Birim
  fiyat ve transit süresinde yüzde yok. Tüm çubuklar tek renk (`ACCENT`); çift
  ölçekli grafik kullanılmaz (aylık grafik sadece hacim, konteyner alt yazıda).
- Birden fazla para birimi varsa kur çevrimi yapılmadığı için sayfada uyarı çıkar.
- ACENTE NAVLUN FİYATLARI (25.10.2026, kullanıcı: "acentelere verdiğimiz ücretler de görünsün;
  limana göre fiyat farklı"): Acenteler kartı `AcenteNavlunKarti` — üst kısım eskisiyle aynı
  (konteyner · pay · rezervasyon), altında acentenin gittiği HER liman: son navlun / kont.
  (en son sevkiyat tarihli dosya; ipucunda dosya no + konteyner ağırlıklı ortalama), fiyat
  değiştiyse aralık, lokal masraf, dosya · konteyner. Navlun girilmemişse "Navlun alıcıya ait
  (FOB)" (`navlunAliciyaAitMi`) ya da "Navlun girilmemiş". Kaynak: navlun/lokal DOSYADA konteyner
  başı (`navlun_tutari`, `lokal_masraf_tutari`), acente REZERVASYONDA; şema değişmedi. Hesap TEK
  YER `lib/analiz-acente-navlun.ts` (`acenteLimanNavlunlari`, saf; liman `analizLimani` ile
  birleştirilir, geçersiz liman "Liman belirtilmemiş" en altta, farklı para birimi ayrı satır).
  Durum / yıl filtreleri uygulanır. Test scratchpad `acente/` birim 13 + Playwright 11.
- PANEL DÜZENİ (26.10.2026, kullanıcının örnek analiz paneli esas alındı): üstte 5 gösterge
  (`GostergeKutusu`: Hacim / Konteyner / MTS aylık eğilim çizgisiyle [ileri tarihli aylar
  hariç], Ortalama Birim Fiyat = toplam hacim / toplam MTS, Tamamlanan ilerleme çubuğuyla);
  "Aylık Sevkiyat" büyük grafik (`AylikGrafik`, TEK eksen, ölçü seçimi Hacim / Konteyner /
  MTS — çift eksen YOK; ETD'si bu aydan ileri aylar kesikli "Planlanan"); "Müşteri Dağılımı"
  ve "Teslim Şekli" `DagilimKarti` (pay şeridi + lejant; ilk 6 sabit sıralı kategorik renk,
  kalanı gri "Diğer (n)"; 7. renk üretilmez); "Otomatik Özet" (`OzetKarti`,
  `lib/analiz-ozet.ts` `analizOzeti` — YAPAY ZEKÂ YOK, ekrandaki toplamlardan kurala göre
  cümle; tahmin yok). Bileşenler `components/analiz-paneli.tsx` (hesap YAPMAZ). Hesap
  kuralları, Varış Limanları / Acenteler / Birim Fiyat / Transit / Gemi / Son Tamamlanan
  kartları DEĞİŞMEDİ; eski "Müşteriler" listesi Müşteri Dağılımı'na dönüştü. Test
  scratchpad `analizpanel/` (özet birim 11, Playwright 28 — 1280/1527/1920/390) + acente 11.
- DÜZEN DÜZELTMESİ (26.10.2026, kullanıcı: "çok tutarsız"): KURAL — aynı satırdaki kartlar
  AYNI yükseklikte (grid varsayılan stretch; `items-start` KULLANILMAZ), kısa kart uzun kartın
  yanında boşluk bırakmaz. Satırlar: 5 gösterge (hepsinde ayraçlı dipnot: bu ay / liman birim
  fiyat aralığı / tamamlanma %; eğilim çizgisi SADECE ≥3 ay) → Aylık Sevkiyat (8) + Otomatik
  Özet (4) → 4 sıralama kartı (Müşteri Dağılımı · Varış Limanları · Birim Fiyat · Transit) →
  "Acenteler ve Navlun Fiyatları" TAM GENİŞLİK, içi 4 sütun → Teslim Şekli (3) · Gemi (4) ·
  Son Tamamlanan (5). Tüm kartlar `Panel` çerçevesi (aynı başlık / ikon / sağ etiket).
  Yüzde her yerde tam sayı (`yuzdeMetni`, "<%1"); tutarlar kuruşsuz (`tutarKurussuz`).
  Dağılım kartlarının altında toplam satırı. Test `analizpanel/test.py` 36 (satır
  yükseklik eşitliği, acente 4 sütun, dipnotlar) + acente 11.
- SEVKİYAT HARİTASI + son düzen (26.10.2026, kullanıcının ikinci örnek görseli): satırlar
  6 gösterge (Teslim Şekli artık GÖSTERGE: en çok kullanılan + pay şeridi; ayrı kart
  kaldırıldı; ≥1400 px tek satır) → Aylık (8) + Özet (4) → **Sevkiyat Haritası (8) + Varış
  Limanları (4)** → Müşteri Dağılımı · Birim Fiyat · Transit → Acenteler (tam genişlik) →
  Gemi (5) + Son Tamamlanan (7) (1492 px'te tablolar kesilip yatay kaydırma çıkıyordu;
  gemi adı artık satır kırar). Harita `components/analiz-harita.tsx`: Türkiye çıkış limanı
  (yükleme limanından: Marport/Kumport/Mardaş/Asyaport/Ambarlı = İstanbul; Mersin, İzmir,
  İskenderun, Gemlik) → varış limanı TEMSİLÎ eğri (gerçek rota değil, altta yazılı), dairenin
  büyüklüğü konteyner (karekök ölçek), üzerine gelince/odakta ayrıntı (konteyner, dosya,
  hacim, $/MTS, teslim), etiketler çakışmayacak şekilde yerleşir (sığmayan gizlenir).
  Koordinat tablosu `lib/liman-koordinat.ts` (`limanAnahtari` anahtarlarıyla; listede
  05.11.2026 "havuza yeni eklenen limanlar otomatik görünmeli": liste ~200 limana çıktı
  (ASHDOD dahil); `limanKonumu(anahtar, ulke)` sırası: birebir → ad içinde bilinen liman
  ("NHAVA SHEVA JNPT") → ülkenin ana limanı `ULKE_ANA_LIMAN` (ülke: varış limanı metninden,
  yoksa alıcı adresinden; nokta KESİK çerçeveli, ipucunda "Yaklaşık konum"). Hiçbiri yoksa
  kart altında "Haritada konumu olmayan: …"). Dünya haritası `lib/dunya-haritasi.ts` = Natural Earth 110m önceden SVG yoluna
  çevrildi (YENİ PAKET YOK; üretici scratchpad `harita/gen.mjs`). Kart zemini opak + üstte
  çok hafif yeşil ton (`KART_ZEMINI`). Müşteri adları 2 satıra kadar. Test
  `analizpanel/test.py` 54 (1280/1366/1492/1527/1920/390; tablolarda yatay kaydırma yok,
  harita noktaları/hat/ipucu/etiket) + acente 11 + özet birim 11.
- MÜŞTERİ DAĞILIMI SAYFALI (26.10.2026, kullanıcı: "Diğer (14) çirkin, bütün müşteriler
  görünmeli; 2. sayfaya kart / dönme animasyonuyla geçilsin"): "Diğer" satırı KALDIRILDI —
  geri eklenmez. `DagilimKarti` tüm müşterileri 6'lık sayfalarda (= kategorik renk sayısı),
  sıra numarasıyla gösterir; renkler sayfadaki sıraya göre (sayfa içinde tekil). Pay şeridinde
  TÜM müşteriler: o anki sayfanınkiler renkli, diğerleri soluk (#2A3343); bölüme tıklamak o
  sayfaya gider. Alt satırda toplam + ‹ noktalar 1/n ›. Geçişte satırlar sırayla yukarıdan
  çevrilerek gelir (`.dagilim-cevir`, globals.css); 8 sn'de bir kendiliğinden ilerler — fare
  üstünde / odak içeride / "hareketi azalt" açıkken DURUR (azaltta animasyon da yok). Filtre
  değişince 1. sayfaya döner. Teslim Şekli kartı zaten göstergeye taşındığı için `DagilimKarti`
  yalnız müşteride. Test `analizpanel/test.py` 63 + `test_azalt.py` 3.
- DENİZ ROTASI (26.10.2026, kullanıcı: "haritayı gerçek deniz rotası yapamıyor muyuz?"):
  harita hatları artık temsilî eğri DEĞİL, deniz yolu: `lib/deniz-rotasi.ts` (saf) — ~110
  deniz düğümü (boğaz/kanal eksenleri, açık deniz noktaları) + kenarlar, Dijkstra ile EN KISA
  yol: Çanakkale → Ege → Süveyş → Kızıldeniz → Bab-el Mandeb (Doğu Afrika / Asya, Malakka),
  Cebelitarık → Batı Afrika / Atlantik → Florida Boğazı / Rüzgâr Geçidi (Küba, Veracruz),
  İstanbul Boğazı → Karadeniz. Mersin/İskenderun Çanakkale'den GEÇMEZ. Gemilerin anlık izi
  (AIS) ücretli dış servis ister — YAPILMADI; rota YAKLAŞIKTIR (aktarma limanı, armatörün
  Ümit Burnu tercihi vb. farklı olabilir; harita altında yazar). İpucu: "İstanbul → DJIBOUTI:
  ≈ 2.170 deniz mili · Çanakkale Boğazı → Süveyş Kanalı → Bab-el Mandeb" (kart sol üstte
  sabit, rotayı kapatmaz). Ağa bağlı olmayan liman → eski temsilî eğri (ince kesik) + not.
  05.11.2026: `LIMAN_GIRISI`'nde olmayan liman en yakın deniz düğümüne (≤ 450 nm,
  `enYakinDugum`) bağlanır; en yakın düğümden düz hat karadan geçecek limanlar
  `ROTASIZ_LIMANLAR` (temsilî hat). Yeni 05.11 limanları rota_test'ten GEÇİRİLMEDİ (scratchpad
  bu oturumda yok) — elle gözden geçirildi; ilk fırsatta testte doğrulanmalı.
  YENİ LİMAN: `LIMAN_KOORDINAT` + `LIMAN_GIRISI` (bağlı deniz düğümü), gerekirse düğüm/kenar;
  SONRA MUTLAKA scratchpad `harita/rota_test.ts` (Natural Earth 1:50m: hiçbir düğüm/kenar/
  yumuşatılmış köşe karaya girmez — boğaz/kanal kenarları `dar: true` ile muaf; her çıkış ×
  her liman rotalı; ~4 dk sürer). 26.10: 163 kenar, 345 rota, 142 köşe temiz.

## Kontrol Merkezi (eski adı Dashboard, `/dashboard`) — 10.10.2026
- İş akışı hesabı TEK YERDE: `lib/dashboard-akis.ts` (`dosyaAkisiHesapla`,
  saf fonksiyon). Adım sırası: Rezervasyon → Konteyner → Yükleme (DBA) →
  Fatura → Konşimento. Konteyner adedi günlük raporla AYNI kural:
  `max(rezervasyonlardaki toplam, eklenen)`.
- Cut-off "tamam" kuralı (beyanname_no fiilen girilmediği için kanıtlanabilir
  adıma bağlı): Talimat → konşimento talimatı VEYA Draft BL var; Beyanname →
  fatura var. Tamamlanan cut-off gri tik gösterir, kırmızı alarm vermez.
- Rezervasyonlar ETD'ye göre sıralanır; kartta en erken ETD'li booking + "+N".
- Veri: sadece açık dosyaların detayı + son 10 kapalı dosya (toplam sayı
  `count: exact`) + son 2 günde DBA'sı yüklenen konteynerler (Bugün Yüklenen,
  DBA tartım tarihine göre). Hata yutulmaz: kırmızı bant + "Yeniden dene";
  önceki veri ekranda kalır. Sayfa görünürken dakikada bir + sekmeye dönünce yenilenir.
- Özet 4 kutu: Aktif Dosya (alt satır: rezervasyon bekleyen), Bugün Yüklenen
  (+ Günlük Rapor), Yüklenecek Konteyner (rapordaki "açık sevkiyatlarda kalan"
  ile aynı), Cut-off Uyarısı (≤ 2 gün kalan/geçmiş ve ilgili adım bitmemiş).
- Nabız (animate-pulse) SADECE acil durumda: cut-off ≤ 1 gün ve adım bitmemiş.
- Tüm adımlar tamamsa "Kapatmaya hazır" rozeti (dosya detayından kapatılır).
- Menüde adı "Kontrol Merkezi"; sidebar markası `companies.company_name` +
  "İhracat AI" (Unex Gıda / İhracat AI).

## Günlük yedek (`supabase/functions/yedekleme-gonder`)

**Çağrı anahtarı (13.11.2026, güvenlik incelemesi):** her çağrı `x-cron-anahtar` başlığı ister (Vault
`yedek_cron_anahtari`, migration `20261113200000`; doğrulama `public.yedek_cron_anahtari_dogrula`, yalnız service_role).
Başlık yok / yanlış → hiçbir şey okunmadan 401 (eskiden anon `{"deneme": true}` sınırsızdı). Elle deneme / test: SQL'den
`'x-cron-anahtar', (select decrypted_secret from vault.decrypted_secrets where name='yedek_cron_anahtari' limit 1)`.

- pg_cron `gunluk-yedek-maili` her gece 00:00 UTC (03:00 TR) fonksiyonu anon
  anahtarla çağırır; fonksiyon veritabanı JSON yedeğini Resend ile
  `GERI_BILDIRIM_ALICI` adresine mail eki olarak gönderir.
- Cron çağrısı `timeout_milliseconds := 60000` ile yapılır (05.10.2026,
  migration `20261005090000`). Varsayılan 5 sn'de fonksiyon (~10 sn) bitmeden
  zaman aşımı yazılıyordu; yedek alınsa da cevap `net._http_response`'a
  gelmiyordu. Son gecenin sonucu: `select status_code, content from
  net._http_response order by id desc limit 1` (pg_net ~6 saat saklar) veya
  `yedek_kayitlari`.
- Canlıdaki sürüm repodaki koddur (Supabase v5, 05.10.2026). Fonksiyonu değiştirince
  ayrıca DEPLOY edilmesi gerekir (Supabase MCP `deploy_edge_function` veya CLI)
  — commit/push tek başına canlıyı değiştirmez.
- Yeni bir iş tablosu eklenirse `YEDEKLENECEK_TABLOLAR` listesine de eklenmeli. Mail görünümü
  (`mail.ts` → `TABLO_BILGISI`) için Türkçe ad + grup da eklenir (eklenmezse "Diğer"de teknik
  adıyla çıkar).
- MAIL GÖRÜNÜMÜ (26.10.2026, kullanıcı: "günlük rapor gibi temaya uygun; 0 olanlar nedir?"):
  `supabase/functions/yedekleme-gonder/mail.ts` (saf, görünüm) — günlük raporla aynı dil (logo,
  lacivert #283474 / şeftali #F4A07C): durum bandı (yeşil "Yedek alındı ve doğrulandı" ya da
  kırmızı "Dikkat edilmesi gerekenler"), 4 kutu (Toplam kayıt · Geri yükleme testi · Veritabanı
  · Dosya deposu + doluluk çubuğu), tablolar Türkçe adıyla GRUPLU (İhracat operasyonu / Evrak
  ayarları / Proforma / İç piyasa / Kantar ve DBA / Kullanıcılar ve sistem), dosya deposu
  klasörleri Türkçe açıklamalı, altta ek + öneri. Konu, alıcı, ek, yedek içeriği, geri yükleme
  testi, kapasite eşikleri DEĞİŞMEDİ. Deneme yanıtına `html` eklendi (önizleme; veri yok).
  SIFIR KAYITLI TABLOLAR (26.10.2026 kod + DB kontrolü, `BOS_ACIKLAMA`): `sevkiyatlar`,
  `plakalar` = KULLANILMIYOR (ilk tasarımdan; kodda okuyan/yazan yok; rezervasyon/konteyner
  `sevkiyat_id` FK'leri hep NULL) — SİLİNMEDİ (geri alınamaz; kullanıcı onayıyla ayrı migration);
  `acente_teklifleri` = özellik var ("Acentelerden Teklif Al", Proforma Yükle sonrası) henüz
  kullanılmadı (`acenteler`de Haziran'dan 2 deneme kaydı: MSC, MAERSK — volkandurgut e-postalı);
  `banka_presetleri`, `ihracat_musterileri`, `proforma_ayarlari` = boş olması normal
  (isteğe bağlı / varsayılan); `ihracat_urunleri` da "Boş · normal" (06.11.2026, kullanıcı onayı;
  önce açıklamasız "Boş" sarı rozetle çıkıyordu; v32 deploy, repo ile birebir, deneme 41/41).
  Test scratchpad `yedekmail/` (esbuild + Deno/fetch taklidi:
  deneme, gerçek, uyarılı senaryo; 820/390 px görüntü).
- TEST MAILI (26.10.2026, v16): gövde `{"test_maili": true}` → 20 saatlik tekrar koruması
  ATLANIR, aynı alıcıya "[TEST] " konulu TAM mail (ek dahil, üstte kesik çizgili amber
  "TEST GÖNDERİMİ" notu) gider; `yedek_kayitlari.durum='test'` yazılır (migration
  `20261026031500_yedek_test_maili` CANLIDA UYGULANDI — check constraint'e 'test' eklendi).
  'test' satırı gece yedeğinin tekrar korumasına SAYILMAZ (o sadece basarili/uyarili sayar).
  Kötüye kullanım: son 24 saatte en fazla 3 test (`TEST_GUNLUK_SINIR`), aşılırsa HTTP 429.
  Tetikleme: SQL `net.http_post` (Bearer `cron.job` 'gunluk-yedek-maili' komutundan alınır,
  sohbette gösterilmez). İlk canlı test 26.10.2026 03:15 TR: 200, 1385 kayıt, 31/31.
- ALICILAR (26.10.2026, v17): gece yedeği secret `YEDEK_ALICILARI` (virgülle; geçersiz adres
  atlanır, tekrar edilen tek sayılır) adreslerine gider; secret yoksa `GERI_BILDIRIM_ALICI`.
  TEST maili HER ZAMAN `GERI_BILDIRIM_ALICI`'ya (test adresi) gider, şirkete test düşmez;
  test notunda "Gece yedeğinin alıcıları: …" yazar. `GERI_BILDIRIM_ALICI` DEĞİŞTİRİLMEZ
  (Sorun Bildir mailleri de onu kullanır). Kullanıcı onayıyla (26.10.2026 03:34)
  `YEDEK_ALICILARI` = bbt@unex.com.tr, execution@unex.com.tr panelden girildi; ilk gece
  yedeği bu adreslere 27.10.2026 03:00.
  `denetim_kayitlari` sadece son 7 günüyle girer; `depositors` ve
  `contact_messages` bilerek hariç.
- Tablolar 1000'erlik sayfalarla çekilir; okunamayan tablo mail konusunda
  `[UYARI]` olarak raporlanır. PDF dosyalarının kendisi yedekte YOK, sadece
  dosya listesi (`_storage_dosya_listesi`) var.
- Her gerçek çalışma `yedek_kayitlari` tablosuna yazılır (RLS açık, politika
  yok → sadece service_role). Son 20 saatte başarılı yedek varsa yeni mail
  gönderilmez. Test için gövde `{"deneme": true}`: mail/kayıt yok, sadece özet.

## Günlük sevkiyat raporu (07.10.2026)

- Sayfa `app/rapor/gunluk/page.tsx` (Dashboard → Günlük Rapor; `?tarih=YYYY-MM-DD`
  ile geçmiş gün) + her gün 09:00, 12:00 ve 17:00 (TR) giden şirket içi mail. İkisi de
  AYNI hesabı kullanır: `supabase/functions/_shared/gunluk-rapor.ts`
  (`gunlukRaporHesapla`, saf TS, import yok; Next tarafı `@/supabase/functions/
  _shared/gunluk-rapor` ile içe aktarır, `lib/cutoff-utils.ts` tartım
  fonksiyonlarını oradan yeniden dışa aktarır). Hesap değişecekse SADECE orası.
- Sevkiyat satırı (kullanıcı örneği): "VIADUC HOL HOL SARLU - 4x - LE SOLEIL -
  Yükleme Tamamlandı ✔" = müşteri - konteyner adedi - marka (çuval) - durum.
  Adet = rezervasyonlardaki `konteyner_adedi` toplamı (eklenen daha fazlaysa o);
  "yüklendi" = DBA yüklü (Kantar Paneli ile aynı). Durum: hepsi DBA'lı →
  Tamamlandı ✔, en az biri → "Yükleniyor x/n", hiçbiri → Yükleme Bekliyor.
  Marka konteynerlerin markası ("BRAND" atılır, farklıysa "SAAD & ASLI"), yoksa
  dosyanın markası. Sadece AÇIK dosyalar; günün yüklenenleri efektif tartım
  gününe göre (DBA'daki tartım tarihi, yoksa yükleme anı TR).
- Özet kutuları (revize 07.10.2026, kullanıcı "Yükleme Tamamlanan 7 ne
  alaka" dedi): 3 kutu — "{Gün} Yüklenen" (konteyner + kg), "Açık Sevkiyat"
  (x yüklendi · y yükleniyor · z başlamadı), "Yükleme Bekleyen Konteyner"
  (rezervasyonu var, DBA'sı yok; toplam = yüklenen + bekleyen). Hiç konteyneri
  yüklenmemiş sevkiyatın rozeti "Yükleme Başlamadı" (eskiden "Yükleme
  Bekliyor" idi, bekleyen konteyner ile karışıyordu). Mailden "Kısa Özet"
  metin listesi ve "her gün 08:00/17:00 gönderilir" alt notu kullanıcı
  isteğiyle KALDIRILDI — geri eklenmez.
- Alıcı 07.10.2026: kullanıcının Google Workspace maili askıda olduğu için
  `GERI_BILDIRIM_ALICI` secret'i test adresi yapıldı (yedek + rapor +
  geri bildirim aynı adrese). Mail açılınca secret geri değiştirilir.
- Revize 2 (07.10.2026): başlık "Güncel İhracat Raporu" (eski: Günlük
  Sevkiyat ve Kantar Raporu; mail konusu da), mailde logo
  (`https://ihracatasistanim.com/images/logo.png`). Rozet "Yükleniyor 2/5" →
  "2/5 Yüklendi" = 5 konteynerin 2'si DOLDURULUP tartıldı (DBA); boş ekipman
  alımı sayılmaz. "+1 bugün" → "Bugün 1 konteyner yüklendi". Fatura sütunu:
  kural uygulamayla aynı (`fatura_dosya_url` dolu = kesildi; no + tarih
  gösterilir). Yeni bölüm "Yüklemesi Tamamlanan Sevkiyatlar — Plaka ve Tonaj"
  (konteyner no / plaka / net, satırda 2 konteyner, sevkiyat toplamı; canlıda
  SQL ile birebir 1.128.420 kg). Sayfadaki Ek artık sadece devam eden
  sevkiyatlar (+ "x konteyner henüz eklenmedi").
- Revize 3 (07.10.2026): başlık "{şirket} İhracat AI" ("Unex Gıda İhracat AI").
  Renkler LOGODAN: lacivert `#283474` (başlık yazıları, tablo başlıkları, üst
  çizgi) + şeftali/turuncu `#F4A07C` (bölüm başlığı çubuğu). Durum renkleri
  (yeşil/amber/kırmızı) anlam taşıdığı için değişmedi. 3. kutu "Yüklenecek
  Konteyner" = rezerve (rezervasyondaki toplam) − yüklenen (DBA'lı); alt metin
  "rezerve 61 · yüklenen 50".
- Revize 4 (07.10.2026): EKİPMAN durumu. Sistemde ayrı ekipman alanı YOK;
  boş ekipman alınınca konteyner no (+mühür) eklenir, dolup tartılınca DBA
  yüklenir. Buna göre devam eden / başlamamış sevkiyatta rozetin altında 3 renkli
  çubuk (dolu yeşil · ekipmanı alınmış boş amber · alınmamış gri) + "Ekipman
  6/10 · Dolu 3 · Dolum bekleyen 3" (`ekipmanOzetMetni`; alanlar `eklenen`,
  `yuklenen`, `dolumBekleyen`, `ekipmanAlinmayan`). 3. kutuya "boş ekipman
  (dolum bekleyen)" toplamı eklendi. Tamamlanan sevkiyat başlığında "Varış:"
  (dosyanın `varis_limani`, gösterimde büyük harf; kayıt değişmez).
- Mail: edge function `gunluk-rapor-gonder` (canlıda v7). pg_cron
  `gunluk-rapor-sabah` 06:00 UTC (09:00 TR; 10.10.2026'dan beri — önce 08:00, sonra 08:45) → DÜNÜN raporu, `gunluk-rapor-aksam` 14:00 UTC
  → BUGÜNÜN raporu. Alıcı: secret `GUNLUK_RAPOR_ALICILARI` (virgülle), yoksa
  `GERI_BILDIRIM_ALICI` (yedek adresi). Şirket adreslerine geçiş = sadece secret
  ayarı, kod/deploy gerekmez. Müşteriye GİTMEZ.
- Tekrar koruması: `rapor_gonderimleri` (rapor_tarihi, slot, company_id
  benzersiz; RLS açık, politika yok; migration `20261007120000`, canlıya
  UYGULANDI). Aynı slot ikinci kez gönderilmez; gönderim hatasında kayıt silinir.
  Bir slotu yeniden göndermek için o satır silinir. Gece yedeğine dahil değil
  (iz kaydı).
- Revize 5 (09.10.2026, kullanıcı: "bana bile karışık geliyor"): sabah maili
  08:45. Bölüm sırası: {Gün} Yüklenen Konteynerler → Sevkiyat Durumu — Açık
  Dosyalar → Tamamlananlar (Plaka ve Tonaj) (sayfada en sonda Ek). Özet
  kutuları sade: "Açık Sevkiyat" altında müşteri isimleri
  (`acikMusteriSatirlari`, tekrarsız, "(2 sevkiyat)", en fazla 4 satır);
  "x yüklendi · y devam · z başlamadı / Fatura: …" ve "rezerve · yüklenen /
  boş ekipman" alt satırları KALDIRILDI — geri eklenmez (bilgi tabloda
  satır bazında var). Ekipman satırı "Ekipman alındı 6/10 · Dolum bekleyen 3"
  ("Dolu x" rozetle aynı sayıydı). Mailde kutular eşit yükseklikte (kenarlık
  hücrede).
- Öğle raporu (09.10.2026): pg_cron `gunluk-rapor-ogle` 09:00 UTC (12:00 TR) →
  BUGÜNÜN raporu, slot `ogle` (başlık "Öğle raporu · 12:00", konu "Öğle").
  `rapor_gonderimleri.slot` CHECK'i sabah/ogle/aksam (migration
  `20261009090000`, canlıya UYGULANDI). Edge function v9.
- Alıcılar (09.10.2026): secret `GUNLUK_RAPOR_ALICILARI` =
  bbt@, execution@, operation@, export@ unex.com.tr (kullanıcı panelden girer;
  değer MCP'den geçmez). Gece yedeği hâlâ `GERI_BILDIRIM_ALICI`.
  Rapor artık yedek adresine DÜŞMEZ: secret yoksa mail gitmez, hata döner
  (test adresi kullanıcı isteğiyle rapordan çıkarıldı). Gönderen adı
  "{şirket} İhracat AI" ("Unex Gıda İhracat AI"; eskiden "İhracat AI").
- Booking no MAİLDE YOK (12.10.2026, kullanıcı kararı): acente maillerinde booking ile
  arama yapılınca günde 3 rapor maili sonuçları gömüyordu. Mailde "Dosya" sütunu sadece
  dosya no gösterir + "Booking numaraları rapor sayfasında yer alır" notu; booking
  `/rapor/gunluk` sayfasında görünmeye devam eder (ortak hesap değişmedi). Mail metnine
  arama anahtarı olabilecek yeni bir numara (booking, konşimento vb.) EKLENMEZ.
  Edge function v14 deploy; canlı deneme: 5 açık booking'in 0'ı mailde.
- ÇAĞRI YETKİSİ (16.10.2026, güvenlik denetimi; edge function v15,
  `gunluk-rapor-gonder/yetki.ts`): anon anahtar (pg_cron dahil) ile SADECE o anki
  zamanlanmış slot gönderilir — pencere TR 08:55–09:59 sabah, 11:55–12:59 öğle,
  16:55–17:59 akşam; gövdedeki slot farklıysa 403; deneme 403; yanıtta şirket
  adı/özet yok (`{ok,slot,tarih,gonderilen,atlanan}`). Deneme ve slot/tarih seçimi
  SADECE geçerli kullanıcı oturumu + admin rolü / süper admin ile ve yalnızca kendi
  şirketi için (`Authorization: Bearer <kullanıcı access_token>`). Anon anahtarla
  deneme / pencere dışı test ARTIK YAPILAMAZ; slot penceresi dışında yeniden
  gönderim gerekirse yetkili kullanıcı oturumuyla çağrılır. Cron saatleri
  değişirse `SLOT_TR_SAATI` de BİRLİKTE güncellenir. Süper admin listesi
  `SUPER_ADMIN_EPOSTALARI` (auth-context + RLS ile aynı).
- CUT-OFF (19.10.2026, kullanıcı isteği; edge function v16): sayfa ve 3 mailde
  sevkiyat tablosunun son sütunu "ETD · Cut-off" — ETD + Talimat ve Beyanname
  cut-off'u (dd.mm ss:dd, girildiği YEREL saatle; `cutoffAyristir` new Date
  KULLANMAZ) ve durumu. Kural uygulamayla AYNI: talimat tamam = konşimento
  talimatı VEYA Draft BL ("✔ Draft BL alındı"), beyanname tamam = beyanname
  dosyası. Eşikler `CutoffSayac` ile aynı (>48 sa normal, 48–10 amber, <10
  kırmızı, geçmiş "Süresi geçti"). Birden fazla rezervasyonda EN ERKEN değer.
  Özet kutularının altında "Cut-off Uyarısı (n)" kutusu SADECE belgesi
  yüklenmemiş ve 48 saatten az kalan / geçen cut-off varsa (en acil önce); mail
  konusuna "· n cut-off uyarısı". Kalan süre GÖNDERİM / sayfa açılış anına göre
  (sabah raporu dünü özetler ama cut-off güncel). Hesap `_shared/gunluk-rapor.ts`
  (`cutoffDurumu`, `cutoffUyarilari`; `gunlukRaporHesapla(..., simdiMs)`).
  Sorgular: dosyada `konsimento_dosya_url, draft_bl_dosya_url,
  beyanname_dosya_url`, rezervasyonda `talimat_cutoff, beyanname_cutoff`.
  Booking no mailde hâlâ YOK.
- AÇIK SEVKİYAT KUTUSU (25.10.2026, kullanıcı: "+2 müşteri daha çirkin; açık olanların HEPSİ
  görünmeli; tamamlananlar yeşil, konteynere alınanlar sarı, işlem yapılmayanlar normal"):
  sayfa + 3 mailde TÜM müşteriler (sınır YOK), `acikMusteriler` (`_shared/gunluk-rapor.ts`):
  müşterinin TÜM açık sevkiyatları birlikte → hepsi DBA'lı = `tamamlandi` (yeşil #047857,
  kalın), en az birinde konteyner eklendi / yüklendi = `islemde` (amber #B45309, kalın —
  beyaz zeminde okunur sarı), hiçbiri = `baslamadi` (normal #334155). Birden fazla durum
  varsa altta küçük lejant. `acikMusteriSatirlari` artık sınırsız (geriye uyum). Edge
  function v17 (mail); sayfa Netlify. Test: scratchpad `mailfn/calistir_renk.mjs` (6 müşteri,
  renkler) + `rapor2/test.py` (sayfa 8/8).
- ÖNEMLİ: `{"deneme":true}` mail GÖNDERMEZ (sadece HTML döner). Kullanıcı
  "test maili" isterse deneme OLMADAN gönderilir → o slotun kaydı yazılır;
  aynı slotun otomatik maili için kullanıcı o satırı siler.
- Test: gövde `{"deneme":true,"slot":"sabah"|"aksam"[,"tarih":"YYYY-MM-DD"]}` →
  mail/kayıt yok, yanıtta konu + özet + satırlar + HTML. 07.10.2026 canlı
  doğrulama: akşam 1 konteyner/25.040 kg, sabah (06.10) 3/75.260 kg — SQL ile
  birebir; gerçek test maili yedek adresine gitti, ikinci çağrı "zaten
  gönderilmiş" ile atlandı.

## Kontrol Merkezi → Analiz, özet kartları Ana Panel'de (28.10.2026)

- Kullanıcı: "Mevcut Kontrol Merkezi kaldırılmalı; Analiz sayfası Kontrol Merkezi olarak devam
  etmeli; 4 kutu (Aktif Dosya / Bugün Yüklenen / Yüklenecek Konteyner / Cut-off Uyarısı) Ana
  Panele taşınmalı; Aktif Dosya artık tıklanamaz."
- `app/dashboard/page.tsx` SİLİNDİ. `next.config.js` redirect `/dashboard → /analiz` (yer imleri).
  Menü: "Kontrol Merkezi" = `/analiz` (yetki `analiz`), en üstte; ayrı "Analiz" öğesi yok.
  Analiz sayfa başlığı "Kontrol Merkezi" (LayoutDashboard ikonu).
- `components/panel-ozet-kartlari.tsx` (`PanelOzetKartlari`): eski dashboard hesaplarıyla BİREBİR
  (lib/dashboard-akis; bugün yüklenen = efektifTartimBilgisi, son 2 gün DBA, kapalı dosyalar
  dahil). Ana Panel verisini kullanır; panel artık dakikada bir + sekmeye dönünce yenilenir.
  Aktif Dosya kartı tıklanamaz (ipucu listesi durur). Cut-off satırları dosyaya bağlantı.
- Açılış: `ilkErisilebilirSayfa` sırası panel, analiz, kantar, ihracatlar… (dashboard çıktı);
  giriş sonrası ve logo bağlantısı da buna göre. `dashboard` yetki anahtarı DB'de durur ama
  KULLANILMAZ; Yetkilendirme'de "analiz" = "Kontrol Merkezi" (ilk sütun), dashboard sütunu yok.
  Canlı: dashboard ve analiz yetkisi herkes için aynıydı → erişim değişmedi.
- Test: `scratchpad/km/e2e.mjs` (açılış, menü, 4 kart değerleri, tıklanamaz kart, /dashboard
  yönlendirmesi, kantar kullanıcısı).


## Kontrol Merkezi sadeleştirme: 3 sekme (16.11.2026)

- Kullanıcı: "13 bileşen tek ekranda, bilişsel aşırı yük; tekrar eden liman verisi; acente kartları sıkışık".
  HESAPLAR DEĞİŞMEDİ (yalnız yerleşim). Sabit üst: filtreler + 6 gösterge + Veri Tutarsızlıkları çubuğu.
- Sekmeler (`?sekme=` adreste; genel'de parametre yok, `history.replaceState`):
  1. **Genel Bakış**: Aylık Sevkiyat + Sevkiyat Haritası (50/50), Otomatik Özet + Müşteri Dağılımı.
  2. **Lojistik & Rotalar** (`lojistik`): `LimanPerformansTablosu` (components/analiz/liman-performans.tsx) = eski
     Varış Limanları + Birim Fiyat (Liman) + Ortalama Transit Süresi; tüm limanlar (eskiden ilk 8), başlığa tıkla sırala
     (`limanSirala`: boş değer her yönde en altta). Altında Gemi Başına Konteyner (modal aynen) + Son Tamamlanan.
  3. **Maliyet & Acenteler** (`maliyet`): `AcenteNavlunTablosu` (components/analiz/acente-navlun-tablosu.tsx) — acente
     başlık satırı (konteyner · pay · rez.) + liman satırları; filtre acente + liman arama (`acenteFiltrele`; başlık
     toplamları filtreyle değişmez). Tüm acenteler (eskiden ilk 8).
- Veri Tutarsızlıkları: kalem yoksa HİÇ görünmez; tek satır çubuk (tür sayıları), tıklayınca ayrıntı. Açık/kapalı
  `localStorage["kontrol-merkezi:tutarsizlik-acik"]`; tercih yoksa "yüksek" kalem varsa açık başlar.
- Saf yardımcılar `lib/analiz-tablolar.ts`, test `tests/analiz-tablolar.test.ts`. `AylikGrafik` `className` aldı
  (varsayılan `xl:col-span-8`, eski kullanım aynı).

## Ana Panel sadeleştirme (16.11.2026 gece)

- Kontrol Merkezi / Pazar ile aynı mimari; HESAPLAR AYNI. Saf modül `lib/panel-gorunum.ts` (test `tests/panel-gorunum.test.ts`):
  `panelFiltrele` (eski sayfa içi filtre), `cutoffUyarilari` (eski özet kartı hesabı; `CUTOFF_UYARI_GUN` 2), `dosyaEslesir`.
- Sabit üst: 4 kart (Cut-off kartı yalnız sayaç "n uyarı · m dosya") + `components/panel/cutoff-cubugu.tsx` (yoksa gizli;
  `localStorage["panel:cutoff-acik"]`, varsayılan açık; satıra tıklayınca tablo satırı vurgulanır) + filtre sekme çubuğu
  (sayılarla). Adres: `?filtre=cutoff|rezervasyon|acik` (eski `?filter=` okunur, yazılırken silinir).
- Tablo tek satır: yeni "Evraklar" sütunu `EvrakRozetleri` (n/4 + KT · FT · BL · BY; tamam yeşil/belge, bölünmüş fatura
  eksikse amber, yoksa soluk). "Eksik: …" metni kaldırıldı. ▾ detay satırı: tam evrak rozetleri + adımlar (Rezervasyon,
  Konteynerler, Fatura, DBA, VGM) + mal cinsi / gemi.
- Bağlantılar: müşteri adı → `/pazar?musteri=<alıcı>` (yalnız pazar yetkisi; Pazar `pazar_anahtarlar` ile firmayı bulup
  kartı açar); evrak ikonu → `/dosya/<id>?tab=evraklar`; `?dosya=<id | dosya no | proforma no>` satırı vurgular, filtre
  gizliyorsa "Tümü"; açık dosyalarda yoksa ve kimlikse `/dosya/<id>`. Kontrol Merkezi "ETD farkı" / "ETD değişti"
  bağlantıları `/panel?dosya=<id>` (tutarsizliklar-karti `hedefBaglanti`).

## DİİB günlük raporu (06.11.2026)

- Edge function `diib-gunluk-rapor`, pg_cron `diib-gunluk-rapor` `0 14 * * *` (17:00 TR).
  Hesap DİİB Takibi sayfasıyla AYNI (`_shared/diib-hesap.ts`); e-posta HTML'i
  `_shared/diib-rapor.ts`; ek, sayfadaki "Excel'e aktar" ile AYNI XLSX (`_shared/diib-excel.ts`,
  uygulamada `lib/diib/excel-yaz.ts` yalnız zip'ler).
- İçerik: özet kutuları (kalan, gerçekleşen, bugün kesilen, faturası bekleyen), güncel DİİB,
  DİİB durumu (doluluk + bekleyen + "sonra" kalanı), bugün kesilen faturalar, faturası
  kesilmemiş yüklemeler (talimat cut-off sırası, DİİB payı / bölünme önerisi). Fiyat yalnız
  DİİB tutarları. Müşteriye gitmez; booking no yok.
- Secret'lar: `DIIB_RAPOR_CANLI` ("evet" değilse her gönderim yalnız test adresine "[TEST]"),
  `DIIB_RAPOR_ALICI` (virgülle, en fazla 6), `DIIB_RAPOR_TEST_ALICISI`.
  CANLI (06.11.2026 10:50 TR, kullanıcı onayı): alıcılar bbt@ + execution@ (unex.com.tr), secret'lar
  kullanıcı tarafından girildi; doğrulama: anon `{"test":true}` → 403 "yalnızca yetkili" (= CANLI açık).
  İlk deneme sırasında CANLI henüz "evet" değildi, test adresi'e 1 adet [TEST] maili gitti.
- Çağrı yetkisi ic-gunluk-rapor ile aynı ilke: anon yalnız 16:55-18:00 TR penceresinde;
  anon `{"test":true}` yalnız test modunda, 24 saatte en fazla 3. Admin: `{"deneme":true}`
  (mail yok, HTML döner) / `{"test":true}`.
- DİİB Durumu tablosunda Gerçekleşen'in altında kırılım: "sistem öncesi X + N fatura Y" (06.11.2026;
  kullanıcı 2026/D1-02576'nın 10.662.940 kg gerçekleşenini sordu: 10.492.040 kg = Excel'deki 54 fatura
  (UNX…293-564, 21.05-25.08.2026) devir, + 170.900 kg CRISA 2. faturası UNX…735).
- Tekrar koruması: `diib_rapor_gonderimleri` (şirket + gün için zamanlanmış tek kayıt;
  RLS açık, yalnız service_role).
