# Satın Alma — Claude notları

> 02.11.2026: CLAUDE.md'den bölünerek taşındı, metin DEĞİŞTİRİLMEDİ (bölüm sırası korunur).
> Bu konudaki yeni notlar bu dosyaya eklenir. Proje çapındaki kurallar kök `CLAUDE.md`'de.

## Satın Alma talepleri (26.10.2026)

- Kullanıcı isteği: departmanlardaki yetkili arkadaşlar ihtiyaç listesi hazırlar, "gönder"
  deyince execution@ + bbt@'ye mail gider; Burak Bey kalem bazında onaylar / reddeder,
  sonuç execution@'ye gider. Kararlar (26.10.2026): departmana özel GİRİŞSİZ link, departman
  ORTAK taslağı, sonuç sadece execution@'ye, kategorili genel satın alma.
- Migration `20261026100000_satin_alma.sql` (ihracat / iç piyasa tablolarına DOKUNMAZ):
  `satin_alma_departmanlari` (ad + 32 hex `token`, aktif), `satin_alma_listeleri`
  (taslak → bekliyor → sonuclandi; departman başına TEK taslak, tekil kısmi indeks;
  `liste_no` SA-YYYY-NNNN gönderimde `satin_alma_liste_sira` ile), `satin_alma_kalemleri`
  (kategori / birim CHECK listeleri `_shared/satin-alma.ts` ile BİREBİR; karar kalem bazında).
  Tablolar istemciye SADECE OKUNUR (`satin_alma` yetkisi + aynı şirket); yazmalar fonksiyonla.
  Denetim tetikleyicisi 3 tabloda. Başlangıç: ekteki formdaki 5 departman + süper adminlere
  (volkandurgut.tr@, bbt@) `satin_alma` yetkisi.
- Girişsiz sayfa `/talep/[token]` (açık tema, `GenelSayfaCerceve satisSatiri={false}`, noindex):
  ad soyad (localStorage `sa-talep-ad`), kalem ekle / sil (sadece açık taslaktan), "Listeyi
  gönder" (onay kutusu), son 10 gönderilen liste + kalem kararları ve red nedenleri.
  DB'ye doğrudan erişim YOK: edge function `satin-alma` (verify_jwt AÇIK, anon anahtarla)
  service_role ile `sa_token_bilgi / sa_token_kalem_ekle / sa_token_kalem_sil /
  sa_token_liste_gonder / sa_mail_sonuc` çağırır (anon/authenticated'a KAPALI).
  Sınırlar: taslakta 100 kalem, departman başına 24 saatte 10 gönderim. Pasif departman /
  yenilenmiş token → 404.
- Uygulama içi `/satin-alma` (menüde "Şirket İçi › Satın Alma", sadece yetkiliye görünür;
  yeni sayfa yetkisi `satin_alma`: auth-context, app-shell, yetki-utils, Yetkilendirme
  sayfası): Onay bekleyen (her kalemde Onayla / Reddet + isteğe bağlı red nedeni, "Tümünü
  onayla", not, hepsi seçilmeden kaydet kapalı, ConfirmDialog) · Sonuçlananlar (departman
  filtresi, sonuç mailini tekrar gönder) · Departmanlar ve bağlantılar (ekle, yeniden
  adlandır, aktif/pasif, bağlantı kopyala/aç, Yenile = yeni token). Maildeki
  `/satin-alma?liste=<id>` ilgili listeyi açar. Karar SONRADAN DEĞİŞMEZ. (Sekmeler 26.10.2026
  son hali: Onay bekleyen · Çek listeleri · Departman geçmişi · Departmanlar ve bağlantılar.)
- Karar: edge function `karar` (kullanıcının KENDİ JWT'siyle `sa_karar_ver`; yetki DB'de),
  sonra sonuç maili. Mail gönderilemezse liste YİNE kaydedilir, `gonderim_maili` /
  `sonuc_maili` = 'hata' olur; sayfada "tekrar gönder" (`mail_tekrar`, `sa_liste_mail_verisi`).
- UNEX ÇEK LİSTESİ (kullanıcı 26.10.2026: "onaylanan satın alım olduğunda aktif bir unex çeki
  oluşmalı, execution@'ye onaylanmış çek liste ile gelmeli; ilgili departmanı etiketleyip
  ileteceğim"; "çek" = kontrol listesi olarak yorumlandı): karar anında onaylanan kalem varsa
  listede `cek_token` + `cek_durumu='aktif'` (tamamen reddedilende çek yok). execution@'ye
  konu `[Departman] Onaylı satın alma çek listesi · SA-… (n kalem[, m reddedildi])` (iletme
  için departman etiketi), gövdede kutucuklu tablo + reddedilenler + "Çek listesini aç"
  düğmesi → girişsiz `/cek/[token]` (yazdırılabilir; alındı işaretle / geri al, ad isteğe
  bağlı localStorage `sa-cek-ad`). Uygulamada "Çek listeleri" sekmesinden de işaretlenir
  (`sa_cek_isaretle`, alan_ad = e-posta). Tüm onaylananlar alınınca `tamamlandi`; geri alınca
  `aktif`. Kural tek yerde `sa_cek_uygula`; reddedilen kalem işaretlenemez (tablo kısıtı
  `satin_alma_alindi_onayli`). `cek_token` departman sayfasına ASLA gitmez (`sa_liste_json`
  içermez; sadece karar / mail verisinde).
- DEPARTMAN GEÇMİŞİ: onaylanan tüm alımlar departmanın altında — uygulamada "Departman
  geçmişi" sekmesi (departman başına akordeon, arama, alındı / alınacak), departman
  bağlantısında "Onaylanan alımlarımız" (`sa_token_bilgi.onaylananlar`, en yeni 300 kalem).
- Alıcılar (kod varsayılanı, secret ile değişir): `SATIN_ALMA_ALICILARI` = execution@,
  bbt@; `SATIN_ALMA_SONUC_ALICILARI` = execution@. Gönderen "Unex Gıda Satın Alma
  <bildirim@ihracatasistanim.com>". Mail şablonları `supabase/functions/_shared/satin-alma.ts`
  (saf; uygulama da aynı etiketleri kullanır).
- Gece yedeği: 3 tablo `YEDEKLENECEK_TABLOLAR` + mail.ts "Satın alma" grubu + geri yükleme
  betiği `TABLO_SIRASI`.
- CANLI DURUM (27.10.2026 09:50 TR): migration `satin_alma` UYGULANDI (3 tablo, 16 fonksiyon,
  5 departman, `satin_alma` yetkisi bbt@ + volkandurgut.tr@; RLS açık; token RPC'leri
  anon/authenticated'a KAPALI doğrulandı). Edge function `satin-alma` v1 (canlı duman testi:
  geçersiz token 404, gerçek departman 200, oturumsuz karar 403). `yedekleme-gonder` v19:
  deneme 34 tablo, geri yükleme 32/32, uyarı yok. İlk deneme (26.10) onay penceresi
  yanıtsız kalınca zaman aşımına uğramıştı; o sırada canlıya hiçbir şey yazılmadı.
- Testler (scratchpad `sa/`): yerel PG16 senaryo SQL (yetki, şirket izolasyonu, sınırlar,
  token yenileme), edge function Node'da gerçek PG köprüsüyle (32 kontrol), Playwright e2e
  (girişsiz sayfa masaüstü/mobil, ortak taslak iki cihaz, gönderim maili, karar, sonuç maili,
  departman ekle / token yenile, yetkisiz yönlendirme, geçersiz bağlantı).
- 27.10.2026 GÜNCELLEME (migration `20261027100000_satin_alma_test_sil.sql`):
  - TEST DEPARTMANI: `satin_alma_departmanlari.test` (varsayılan false). Test departmanının
    talep + sonuç + tekrar gönderim mailleri SADECE `SATIN_ALMA_TEST_ALICISI` (varsayılan
    mesensei282@gmail.com) adresine gider, konu "[TEST] " ile başlar, mailde sarı test şeridi.
    `sa_liste_json` ve `sa_token_bilgi` `test` döner; edge function yanıtlarında `test`.
    Uygulamada Departmanlar tablosunda "E-posta: Gerçek / Test" anahtarı, listelerde TEST
    rozeti; talep formu ve fişte "TEST MODU" şeridi. Kullanıcıya önerilen test yolu: ayrı bir
    test departmanı ekle → Test yap → bağlantıdan form gönder → onayla → fişi aç → sil.
  - `sa_departman_kaydet(p_id, p_ad, p_aktif, p_test default null)`: eski 3 parametreli sürüm
    kaldırıldı (3 adlı parametreli çağrı yeni sürüme düşer, test değişmez).
  - DEPARTMAN SİLME: `sa_departman_sil(p_id)` (yetki + şirket kontrollü) önce listeleri
    (kalemler cascade) sonra departmanı KALICI siler, `{departman, liste, kalem}` döner.
    Arayüzde çöp kutusu + ConfirmDialog (destructive) liste / kalem / bekleyen / aktif fiş
    sayısını yazar ve "Pasif" önerir.
  - KURUMSAL TASARIM (kullanıcı: "form görünüşünü beğenmedim, daha profesyonel b2b"):
    `/talep` ve `/cek` artık `components/satin-alma-belge.tsx` (ince lacivert bant, 4px
    köşe, tablo düzeni, nokta+metin durum etiketleri) kullanır; `GenelSayfaCerceve` diğer
    girişsiz sayfalar için AYNEN duruyor. `/talep` = "Satın Alma Talep Formu" (belge başlığı,
    tek satırlık kalem girişi, kalem tablosu / mobilde liste, "Formu onaya gönder", gönderilen
    formlar ve onaylanan alımlar tabloları). `/cek` = "ONAYLI SATIN ALMA FİŞİ" A4 belge (fiş
    no, bilgi tablosu, onaylanan kalemler + teslim alındı kutusu, reddedilenler, 3 imza
    alanı; `@page A4`, yazdır / PDF tek sayfa). Mail metinleri "çek listesi" yerine "Onaylı
    satın alma fişi"; uygulamada sekme "Onaylı fişler" + "Satın alma fişini aç" / "Fiş
    bağlantısını kopyala" (Volkan fişi ilgili departmana iletir). DB adları (`cek_*`) aynı.
  - Edge: Postgres'in İngilizce "permission denied for function" (42501) mesajı Türkçe
    "Bu işlem için yetkiniz yok…" olarak döner.
  - CANLI (27.10.2026): migration `satin_alma_test_sil` uygulandı (6 departman, test=false;
    yeni RPC'ler anon'a kapalı, authenticated'a açık doğrulandı), edge `satin-alma` v2
    (duman testi: bilgi 200 + `test` alanı, oturumsuz karar 403 Türkçe mesaj).
- 27.10.2026 (2) GÜNCELLEME (migration `20261027120000_satin_alma_liste_test.sql`):
  - Test bayrağı FORMA yazılır: `satin_alma_listeleri.test` gönderimde (`sa_token_liste_gonder`)
    departmanın o anki bayrağından kopyalanır, sonradan değişmez. `sa_liste_json.test` =
    taslakta departmanın, gönderilmişte formun bayrağı. (Önceden departman "Gerçek"e dönünce
    test formunun tekrar gönderimi gerçek alıcılara gidiyordu.) Canlıdaki test formu
    SA-2026-0001 kullanıcı onayıyla test=true işaretlendi.
  - Burak Bey onay ekranı (kullanıcı: "liste kalabalıksa zaman alır"): tek satır = tek kalem
    sıkı tablo (# · ürün+kategori+açıklama · miktar · talep eden · Onayla|Reddet segmenti),
    "Kalanları onayla (n)" (karar verilmemişleri onaylar; önce redler işaretlenir), hazır red
    nedenleri (Stokta var · Bütçe dışı · Gerekli değil · Ertelendi; `RED_NEDENLERI`) + serbest
    metin, >3 kalemde kısa "Hızlı karar" ipucu.
  - Fiş: imza kutuları KALDIRILDI (kullanıcı: onay sistemde, ıslak imza gereksiz); yerine
    "Elektronik onay · Onaylayan · Tarih" kaydı.
  - Logo: satın alma maillerinde ve `/talep`·`/cek` üst bandında logonun arkasındaki BEYAZ
    KUTU kaldırıldı (logo lacivert zeminde doğrudan, mailde 64px + ince ayırıcı çizgi); mail
    kartı köşesi 6px, düğme 4px.
  - CANLI (27.10.2026): migration `satin_alma_liste_test` uygulandı, SA-2026-0001 test=true
    (kullanıcı onaylı UPDATE), edge `satin-alma` v3 (duman: bilgi 200, departman test=false,
    gönderilmiş form test=true).

## Satın Alma — ad soyad zorunlu, canlıya geçiş (27.10.2026)

- Kullanıcı: "Satın alma kısmını tam anlamıyla kontrol edelim, aktif hale getireceğiz, test
  verilerini silelim. Her departman satın alma oluştururken isim belirtmeli; Volkan Durgut
  olarak gelmemeli." Sebep: talep formu adı localStorage'da (`sa-talep-ad`) HATIRLIYORDU.
- `/talep`: ad artık hatırlanmaz (eski anahtar ilk açılışta silinir); "Talep eden" her
  oturumda yazılır; gönderim onayında ayrı "Gönderen (ad soyad)" alanı (bu oturumda yazılan
  geçerli ad varsa onunla dolar, yoksa boş). `/cek`: "Teslim alan" hatırlanmaz (`sa-cek-ad`
  silinir), "alındı" işaretlerken ad soyad ZORUNLU (geri alırken değil).
- Kural (en az iki kelime, her biri ≥2 karakter, rakam/@ yok, boşluklar teke iner) TEK
  tanım iki yerde birebir: `_shared/satin-alma.ts` `adSoyadGecerli/adSoyadDuzelt` ve
  migration `20261027180000_satin_alma_ad_soyad.sql` `sa_ad_soyad_gecerli/duzelt`
  (`sa_token_kalem_ekle`, `sa_token_liste_gonder`, `sa_cek_token_isaretle` sunucuda da
  zorunlu tutar). Uygulama içi işaretleme (e-posta ile) değişmedi. Edge function değişmedi.
- DİKKAT: `sa_yetki_kontrol` = `satin_alma` sayfa yetkisi → bu yetkisi olan HERKES karar
  verebilir (27.10 canlı: bbt@, volkandurgut.tr@, operation@, ihracat@).
- CANLI (27.10.2026): migration `satin_alma_ad_soyad` uygulandı (3 token fonksiyonu yalnız
  service_role; doğrulama: "Ayşe Yılmaz" geçerli, "Ayşe" geçersiz). Test verisi (SA-2026-0001
  + Laboratuvar taslağı, hepsi "Volkan Durgut") silinmesi için kullanıcıya korumalı SQL
  verildi (MCP üzerinden DELETE yapılmaz); SQL numaralandırmayı SA-…-0001'e sıfırlar.
  Kullanıcı SQL'i çalıştırdı: 0 liste / 0 kalem / 6 departman, sıradaki form SA-2026-0001.

### Satın alma mail tasarımı v4 (27.10.2026)
- Kullanıcı: "bu tasarımı beğenmedim. Liste büyük olursa her türlü sığıyor değil mi?"
  ESKİ şablonda 100 kalemlik sonuç maili 102,3 KB idi → Gmail 102 KB'den sonra KIRPAR.
- Yeni şablon (`_shared/satin-alma.ts` mail bölümü): /cek fişiyle aynı belge dili — lacivert
  başlık (kutusuz logo, sağda belge adı + no), ince çizgili 2 sütun bilgi tablosu, düz kalem
  tablosu (# | Ürün/hizmet + not | Kategori | Miktar | Öncelik | Talep eden), fişte ayrı
  "Onaylanan" ve "Reddedilen (Red nedeni sütunu)" tabloları, 4px köşeli düğme + yedek bağlantı.
- Boyut: hücre biçimleri `<style>` sınıflarında (her hücrede tekrar yok) + tablo nitelikleri
  yedek. 100 kalem ≈ 26–27 KB (gönderim ve sonuç), 12 kalem ≈ 8 KB. Uzun ürün adları sarar;
  390 px telefonda yatay taşma yok (`@media` dolguları küçültür).
- Konu satırları, düğme metinleri, `/cek/<token>`, "ACİL", test şeridi DEĞİŞMEDİ.
- CANLI: edge `satin-alma` v6 (yalnız şablon; veritabanı değişmedi). Yerel test: edge
  harness 50/50, ölçüm `scratchpad/mail/olc.mjs N`.

### Teslim takibi kaldırıldı (27.10.2026)
- Kullanıcı: "Teslim alınır kısmı gerekli mi anlamadım. Bu kısmı kaldıralım."
- Fiş artık YALNIZ onaylı belge: `/cek` teslim alan alanı + "Teslim alındı" sütunu /
  kutuları yok, durum "Onaylı"; bilgi tablosunda "Onaylanan kalem" / "Reddedilen kalem".
  `/satin-alma` "Onaylı fişler": işaretleme yok, rozet "Onaylı · n/m kalem", filtre
  Onaylı fiş / Tamamı reddedildi; "Departman geçmişi"nde Durum sütunu yok. `/talep`
  onaylanan alımlarda teslim durumu yok. Fiş mailinden işaretleme notu çıktı.
- Veritabanı DEĞİŞMEDİ (alindi / cek_durumu sütunları, sa_cek_isaretle /
  sa_cek_token_isaretle fonksiyonları ve edge "cek_isaretle" işlemi duruyor, arayüz
  kullanmıyor). Edge `satin-alma` v7.
- Departmanlar bilgi kutusundan "Test işaretli departmanın e-postaları…" cümlesi kaldırıldı
  (Test düğmesinin title'ı açıklamayı taşımaya devam eder).

### Mükerrer kontrolü + ürün geçmişi (28.10.2026)
- Kullanıcı: "farklı departmanlarda aynı ürünler geliyor" → hata önleme 3 madde hemen;
  katalog için: "Her manuel olarak yazılan ürün daha önceden sipariş verilen ürünler olarak
  otomatik kayıt altına alınsın." (Ürün bazında birleşik onay / toplu alım listesi henüz YOK.)
- Eşleştirme TEK tanım iki yerde birebir: `_shared/satin-alma.ts` `urunNorm` / `urunEslesme`
  ve migration `20261028100000_satin_alma_mukerrer_urun_gecmisi.sql` `sa_urun_norm`
  (Türkçe harf katlama ç→c ı/İ/I→i ş→s…, küçük harf, harf/rakam dışı → boşluk).
  "ayni" = anahtar eşit; "benzer" = kısa adın TÜM kelimeleri uzun adda (tek kelimede ≥4 harf).
  Canlı PG 17.6'da aynı sonuç doğrulandı.
- Tablo `satin_alma_urunleri` (company_id + ad_norm tekil; ad = ilk yazım, kategori/birim =
  son kullanılan, kullanim sayısı). Tetikleyici `satin_alma_urun_gecmisi`: form taslak →
  bekliyor olunca kalemler eklenir (test formu HARİÇ; reddedilenler de dahil — "yazılan her
  ürün"). İçe aktarma: canlıda 11 ürün. RLS: satin_alma yetkilisi okur; yazma yalnız tetikleyici.
- `sa_token_kalem_ekle`: aynı formda aynı anahtar → 23505 "Bu ürün formda zaten var: X · 3 Adet
  (Ad Soyad). Yeni satır yerine mevcut kalemin miktarını artırın." Yeni `sa_token_kalem_miktar`
  (taslak kalemi; p_acil true ise acil yapar, normal'e çevirmez). Edge `satin-alma` v8:
  işlemler `urunler`, `kalem_miktar`.
- `/talep`: ürün alanı combobox — "Daha önce sipariş verilen ürünler" (yön tuşu/Enter/Esc;
  seçince kategori + birim dolar, imleç miktara). Yazılan ürün için notlar: formda aynısı
  (turuncu kutu + "Mevcut kalemi N Birim yap"; birim farklıysa açıklama; Kalem ekle eklemez),
  formda benzeri, departmanın onay bekleyen formunda, son 30 günde departmana onaylanan.
- `/satin-alma` karar kartı: kalem altında "Bu formda N kez geçiyor", "Başka departmanda da
  onay bekliyor: Dep · ürün · miktar (SA-…)" (aynı formdakiler tek satırda; yalnız aynı test
  durumundaki formlar), "Son 30 günde bu departmana onaylandı: … · tarih (SA-…)"; başlıkta
  "N kalemde not". Hesap istemcide (`kalemNotlariHesapla`, yüklenen son 300 liste).
- Yerel test: `scratchpad/sa/mukerrer.sql`, edge `test.mjs` A2 bölümü, `edge/e2e3.mjs`
  (öneri, mükerrer, birleştirme, notlar, onay ekranı, 31 gün sınırı). e2e2 (50) da geçti.
- Sonraki adım (konuşuldu, yapılmadı): ürün bazında birleşik onay + toplu satın alma listesi;
  ürün geçmişinde yanlış yazımları gizleme / birleştirme ekranı.

### Katalog, tedarikçi, toplu ekleme, haftalık liste (31.10.2026)
- Kullanıcı: "Her hafta perşembe sipariş veriliyor (mutfak alışveriş listesi, Excel); Burak Bey
  onayı gerekiyor" + "ÜRÜNLER HER SEFERİNDE KENDİNİ OTOMATİK KAYIT ETSİN… bir süre sonra
  seçerek ilerleyebilmeliyiz."
- Migration `20261031100000_satin_alma_katalog_haftalik.sql` (CANLIDA, adı
  `satin_alma_katalog_haftalik`; repo dosyası canlı `schema_migrations.statements` metninden
  birebir, md5 ee02bfd2…): birimler + gr / kova / bidon; `satin_alma_kalemleri.tedarikci`;
  katalog (`satin_alma_urunleri`) + tedarikci / son_miktar; `sa_token_urunler` departmana özel
  `dep_*` alanları; `sa_token_kalemler_ekle` (toplu, ≤100, formda olan atlanır, geçersiz satır
  hepsini geri alır, `olusturma = clock_timestamp()` sıra korunur); departman `haftalik_gun`
  (1=Pzt..7), `hatirlatma_eposta` (≤3), `son_hatirlatma`; `sa_departman_haftalik` (yetkili),
  `sa_haftalik_hatirlatma_al / _sonuc` (service_role).
- Edge `satin-alma` v9 (canlı = repo, birebir doğrulandı): `kalemler_ekle`, `haftalik_hatirlatma`
  (pg_cron `satin-alma-haftalik` 06:00 UTC = 09:00 TR, MCP ile kuruldu, komut repoda YOK).
  Haftalık departmanın onay e-postası konusu "Haftalık satın alma listesi: …"; onaylı fiş
  e-postası ve `/cek` onaylananları TEDARİKÇİYE göre gruplar (ilk görünüş sırası,
  belirtilmemiş en sonda, sıra no gruplar boyunca ardışık).
- `/talep`: "Hızlı liste" — Katalogdan seç / Geçen listeyi kopyala (reddedilen seçili gelmez) /
  Excel'den yükle (`lib/satin-alma/excel.ts`, jszip + düzenli ifade, YAPAY ZEKÂ YOK; sütunlar
  başlık + İÇERİĞE göre: örnek dosyada 2. "Birim" sütunu ürün adı; "NOT: X" → açıklama;
  bilinmeyen birim / okunamayan miktar turuncu işaretlenir, SESSİZCE ATLANMAZ). Panel
  `components/satin-alma-toplu.tsx`; formda olan ürün "Formda var", tekrar "Listede tekrar".
  Kalemde Tedarikçi alanı (datalist); öneride "son 8 Kova · 1 kez aldınız · CEM MARKET".
- `/satin-alma` Departmanlar: "Haftalık liste" sütunu (gün + hatırlatma e-postası).
- 02.11.2026 NOT: ilk teslimden önce çalışma ortamı sıfırlandı, commit'lenmemiş ekran kodu
  kayboldu; migration + edge canlıdan birebir geri alındı, ekranlar yeniden yazıldı. Test:
  Excel okuyucu birim testi + Playwright 46 kontrol (taklit edge, gerçek Excel 49 kalem).
  DERS: her parça bitince HEMEN commit + bundle.
