# Altyapı, güvenlik ve kullanıcılar — Claude notları

> 02.11.2026: CLAUDE.md'den bölünerek taşındı, metin DEĞİŞTİRİLMEDİ (bölüm sırası korunur).
> Bu konudaki yeni notlar bu dosyaya eklenir. Proje çapındaki kurallar kök `CLAUDE.md`'de.

## Supabase güvenlik tarayıcısı — bilinçli kararlar (01.10.2026)

- `pg_net` public şemada kalıyor (WARN `extension_in_public`): public'te bu
  eklentiye ait HİÇBİR nesne yok (fonksiyonları `net` şemasında), eklenti
  taşınamıyor (relocatable=false); düzeltmek için sil-yeniden-kur gerekir ki
  bu, istek geçmişini siler ve gece yedeğini tetikleyen cron'u riske atar.
  Risk > fayda → dokunma.
- Sızdırılmış şifre koruması (HaveIBeenPwned) Supabase Free planda
  açılamıyor; organizasyon Free plandadır.
- Fonksiyonlarda `search_path` her zaman sabitlenir (`SET search_path =
  public`); bkz. migration 20261001005150.
- `Dosya` tipi (`lib/supabase/types.ts`) canlı `ihracat_dosyalari`
  kolonlarıyla birebir tutulur. Tabloya kolon eklenirse tipe de eklenmeli;
  `(dosya as any).alan` yazılmaz. Sadece JSON alanlarında (`ham_veri`,
  `urun_detaylari` vb.) iç yapıya erişim için cast kabul edilir.

## Veritabanı genel kontrolü (03.10.2026)

- `public.nextval(text)` sarmalayıcısı anon anahtarıyla RPC'den çağrılabiliyordu
  → anon/authenticated/public EXECUTE kaldırıldı, anon'un `ihracat_dosya_sira`
  USAGE yetkisi kaldırıldı. ÖNEMLİ DERS: `auto_dosya_no` tetikleyicisindeki
  `nextval('ihracat_dosya_sira')` bu sarmalayıcıya çözümleniyordu (bilinmeyen
  tipli literal → text tercih edilir; `EXPLAIN VERBOSE` ile görüldü). Tetikleyici
  artık `pg_catalog.nextval('public.ihracat_dosya_sira'::regclass)` kullanır.
  Bir fonksiyonun yetkisini kaldırmadan ÖNCE aynı adlı çağrıların hangi
  fonksiyona çözümlendiğini `EXPLAIN VERBOSE` ile kontrol et.
  (Migration `20261003150000`; canlıda ilk denemede ~1 dk dosya oluşturma
  kapalı kaldı, o sürede dosya açılmadı; authenticated ile geri alınan test
  insert'i doğrulandı, sıra 89'a geri alındı.)
- Rezervasyonlarda baş/son boşluklu 5 kayıt temizlendi; rezervasyon kaydı
  artık metin alanlarını kırpar. Navlun/lokal masraf ve ödeme kartındaki
  tutarlar `sayiOku` ile okunur ("1250,50" artık 1250 değil).
- Bilerek bırakılanlar: performans uyarıları (19 dosyada etkisiz). Kayda
  bağlı olmayan ~36 MB PDF 05.10.2026'da karantinaya alındı (aşağıya bkz.).

## Log / kilitlenme kontrolü (05.10.2026)

- Supabase yönetilen sunucu: işletim sistemi loglarına erişim yok. Bakılacak
  yerler: `query_logs` (postgres_logs, postgrest_logs, edge_logs, auth_logs,
  function_logs), `pg_stat_database` (deadlocks, conflicts, temp),
  `pg_stat_activity` / `pg_locks` / `pg_blocking_pids`, `pg_stat_statements`,
  `cron.job_run_details`, `net._http_response`, `pg_replication_slots`.
- 05.10.2026 durumu: 56 günde 0 deadlock, 0 conflict, bekleyen kilit / açık
  işlem yok, rollback %0,12, cache hit %100, Postgres'te ERROR/FATAL yok,
  tüm API istekleri 2xx.
- PostgREST'teki "Warp server error: Thread killed by timeout manager"
  kayıtları HATA DEĞİL (boşta kalan keep-alive bağlantılarının kapatılması);
  aynı anda 4xx/5xx yoksa yok say. `SELECT name FROM pg_timezone_names`
  (authenticator, ~400 ms) PostgREST şema önbelleği sorgusudur, uygulamadan
  gelmez.

## Donanım / altyapı ve kapasite (05.10.2026)

- SQL Server'daki .mdf/.ldf ayrımı ve auto-growth ayarının karşılığı yok:
  veri ve WAL aynı yönetilen diskte (`/data/pgdata`), büyümeyi Supabase
  yönetir. Bizim sınırımız plan kotası: Free → DB 500 MB, dosya deposu 1 GB,
  50 MB tek dosya, yedek yok, 1 hafta hareketsizlikte proje durdurulur.
- 05.10.2026: DB 20 MB (%4), depo ~159 MB (%15,5). Depo haftada 40–65 MB
  büyüyor (DBA PDF'leri ~93 MB, Draft BL ~2 MB/adet, CoO/Phyto orijinal
  ~3,7 MB/adet) → %85'e tahmini 11–18 hafta. Nano sınıfı ayarlar
  (shared_buffers 224 MB, work_mem ~2 MB, max_connections 60), cache hit
  %100, checkpoint'ler sağlıklı. CPU/RAM trendi MCP'den okunamaz →
  Supabase panel → Reports → Database.
- Kapasite izleme gece yedek mailinde: `public.veritabani_boyutu_bayt()`
  (sadece service_role EXECUTE; migration `20261005110000`, canlıya
  UYGULANDI) + storage envanteri toplamı. %85 → uyarı (konu `[UYARI]`),
  %90 → "KRİTİK". Plan değişirse `DB_KOTA_BAYT` / `DEPO_KOTA_BAYT` güncellenir.
- Yedek fonksiyonu okuma isteklerinde 5xx / ağ hatasında 2 kez yeniden dener
  (`geciciHatadaTekrarla`): 05.10.2026 deneme çalışmasında 19 satırlık
  `ihracat_dosyalari` PostgREST'ten tek seferlik HTTP 555 döndü.
- DÜZELTİLDİ (05.10.2026): DBA / irsaliye / Draft BL / fatura / konşimento
  yeniden yüklenince ve "kaldır"da, ayrıca sistem evrak arşivinin adı
  değişince (DRAFT → ORİJİNAL) ESKİ dosya depodan silinir. Tek yardımcı:
  `lib/supabase/storage.ts → eskiDepoDosyasiniSil(eskiUrl, yeniUrl)`. Sıra:
  eski URL kayıttan TAZE okunur → yeni dosya yüklenir → kayıt güncellenir ve
  kontrol edilir → SADECE başarılıysa eski silinir. Kayıt başarısızsa eskiye
  dokunulmaz, yeni yüklenen geri silinir (konşimentoda bu geri alma eksikti,
  eklendi). Eski ve yeni aynı yolsa (upsert) hiçbir şey silinmez. Hiçbir depo
  dosyası iki kayıtta paylaşılmıyor (05.10.2026 doğrulandı; "Siparişe Devam
  Et" dosya URL'si kopyalamaz) — paylaşım eklenirse bu kural yeniden düşünülmeli.

## Felaket kurtarma / geri yükleme testi (05.10.2026)

- Kılavuz: `docs/felaket-kurtarma.md` (RPO/RTO, adım adım kurulum). Veri
  geri yükleme aracı: `scripts/yedekten-geri-yukle.mjs` (canlı projeyi ve dolu
  veritabanını REDDEDER; `--onayla` olmadan yazmaz). Yerel uçtan uca prova ile
  test edildi (Postgres 17 + PostgREST, gerçek yedek formatı: 19/19 tablo,
  kullanıcı kimlikleri, roller birebir; silme CASCADE ve dosya no sayacı çalışıyor).
- Repo canlıdan SAPMIŞTI (temiz veritabanında 2 migration hata veriyordu;
  denetim sistemi, `kantar_dosya_listesi`, 9 FK'nin ON DELETE CASCADE'i, rol
  bazlı ihracat politikaları, bucket ayarları yoktu). Kapatıldı:
  `20261001005100_nextval_sarmalayici.sql` + `20261005130000_canli_sema_senkronu.sql`
  (canlıdan birebir, idempotent, canlıya uygulanması GEREKMEZ). Prova:
  24/24 migration hatasız, canlıyla 518/519 nesne birebir (fark: projeye özel
  cron işi, kılavuz adım 6). `20261005090000` cron güncellemesi "iş varsa"
  korumasına alındı (boş projede alter_job(NULL) kurulumu durdurmasın).
- KURAL: canlıya SQL ile yapılan HER şema değişikliği repoya migration olarak
  da eklenir; şema değişince prova tekrarlanır (kılavuz son bölüm).
- Gece yedeği (v5) her gece paketi `public.yedek_geri_yukleme_testi(jsonb)`
  ile canlıyla aynı yapıdaki GEÇİCİ tablolara gerçekten yükler, satırları
  DEĞER olarak (jsonb eşitliği; JS sondaki sıfırları düşürdüğü için md5 değil)
  karşılaştırır, bağları kontrol eder → mailde "Geri yükleme testi: x/y".
  Pakete `_kullanicilar` (kimlik + e-posta, ŞİFRE YOK) eklendi:
  `public.yedek_kullanici_listesi()`. İkisi de sadece service_role (migration
  `20261005140000`, `20261005150000`, canlıya UYGULANDI).
- RPO: veri ≤24 saat, denetim 7 gün, PDF'ler YEDEKSİZ (karar bekliyor). RTO ≈1–2 saat.
  Kayıtlardaki dosya URL'leri eski projeye imzalı; proje değişirse yeniden imzalanmalı.

## Depo temizliği — KARANTİNA (05.10.2026)

- Hiçbir kayda bağlı olmayan 68 dosya (36,7 MB) SİLİNMEDİ; aynı bucket'ta
  `_karantina/2026-10-05/<eski yol>` altına TAŞINDI (geri alınabilir).
  Kanıt: tüm tablolar (JSON dahil) tarandı; 47'si yeniden yüklemeyle eskimiş
  kopya (aynı belgenin DAHA YENİ sürümü kayıtta), 5'i silinmiş dosyalara ait
  (e0d1264e: IHR-2026-0072'nin mükerrer DBA'ları, ccb9d562: test konteyneri
  ABCD1234567, 644ebc69: 26.08'de silinmiş dosyanın faturası), 16'sı
  sistemin yeniden üretebildiği eski evrak arşivi (HTML / sonradan orijinali
  basılmış taslak). Liste md5 `7991d1e970067a7955801bbb2fb1e9b0`.
- Taşıma sonrası: 241 kayıt referansının 0'ı kırık, karantinada 68 dosya.
- Araç: edge function `depo-karantina` (repoda `supabase/functions/depo-karantina`).
  `{"islem":"rapor"}` değişiklik yapmaz; `"geri_al"` hepsini eski yerine
  taşır; `{"kontrol":[bucket, yol]}` dedektörü sınar. KALICI SİLME İÇERMEZ.
  Her taşımadan önce dosyanın kayıtlarda kullanılıp kullanılmadığı tekrar
  kontrol edilir (kullanılıyorsa atlanır).
- KAPANDI (09.10.2026, kullanıcı onayı): karantina KALICI SİLİNDİ. Önce
  salt okunur `silme_kontrol` (68/68 silinebilir) + bağımsız SQL taraması (tüm
  tablolar/JSON: canlı kayıtta 0 eşleşme; sadece `denetim_kayitlari`nda 0076
  ailesinin eski Draft BL değişim izleri), sonra `kalici_sil` 68/68. Depo
  170 → 136 MB; 266 kayıt referansının 0'ı kırık. `depo-karantina` artık
  hiçbir şey yapmayan stub (HTTP 410); çalışan sürüm git geçmişinde.
- Not: IHR-2026-0086'nın CI ve Phyto arşiv kayıtları "…-DENEME.pdf" adlı
  dosyaları gösteriyor (kayda bağlı, dokunulmadı; evrak yeniden üretilince
  ad düzelir ve eski arşiv otomatik silinir).

## Yazılım / sürüm uyumluluğu (05.10.2026)

- Veritabanı: Postgres 17.6 (Supabase imajı 17.6.1.155). PG17 üretici
  desteği 08.11.2029'a kadar. Güvenlik yamaları (17.10, 17.11) Supabase
  imaj güncellemesiyle gelir; güncellemeyi kullanıcı panelden yapar
  (Project Settings → Infrastructure, kısa kesinti → mesai dışı). Claude
  bunu kendisi tetiklemez.
- Geçersiz nesne kontrolü: Postgres'te Oracle'daki gibi "INVALID" durumu
  YOK. Bakılacaklar: `pg_index.indisvalid/indisready`,
  `pg_constraint.convalidated`, `pg_trigger.tgenabled`, cron işleri ve
  hataları; fonksiyon gövdeleri bağımlılık takibine girmediği için
  ÇALIŞTIRILARAK sınanır. 05.10.2026: hepsi temiz.
- Next.js 13.5.1 → 13.5.11 (aynı ana sürümün son yaması; `next`,
  `eslint-config-next`, `@next/swc-wasm-nodejs` sabit sürüm). `@next/swc-*`
  ikilileri 13.5.9 görünür: next 13.5.11 bunları böyle ister, normaldir.
  Next 13 artık güvenlik desteği almıyor; `npm audit` kalan "critical"
  uyarısı ancak Next 15'e geçişle kapanır (ayrı, kapsamlı test gerektiren
  iş). Kalan "high" uyarıların hepsi derleme araçları (tailwind/eslint
  zinciri), sunucuda çalışmaz.
- Dependabot (`.github/dependabot.yml`, 05.10.2026): ana sürüm (major)
  yükseltmeleri ÖNERİLMEZ (Next 13→16 PR'ı build'i kırıyordu; Netlify
  önizlemesi "Failed" görünür, canlıyı ETKİLEMEZ). `next`, `@next/*`,
  `eslint-config-next` tek grupta gelir (sürümleri aynı olmalı; #3'te
  yardımcı paket tek başına 16'ya çıkıyordu). Diğer minor/patch tek haftalık
  PR. Ana sürüm geçişleri planlı iş olarak elle yapılır.
- Önizleme (Deploy Preview) PR'ına aittir; canlı = Netlify'de "Production"
  satırı ve `main` commit'i. Kontrol: get-project → currentDeploy → commit_ref.
- `dependency-audit.yml` CI'ı `npm audit --audit-level=high` ile Next 13 ve
  derleme araçlarındaki bilinen uyarılar yüzünden KIRMIZI kalır (Next 15
  geçişine kadar beklenen durum; deploy'u engellemez).

## Yüksek erişilebilirlik / replikasyon (05.10.2026)

- Free plan: TEK veritabanı sunucusu. Read replica, standby, otomatik
  failover YOK (read replica Pro plan + Small compute ister; ayrıca HA
  Supabase'in kendi altyapısında). `pg_stat_replication` boş, kalıcı
  replikasyon slotu yok, `pg_is_in_recovery()=false`, `hot_standby=off` →
  izlenecek lag yok. WAL arşivleme açık (`pg_stat_archiver`: 0 hata) ama
  Free planda kullanıcıya geri yükleme (PITR) sunulmaz.
- Tek "replikasyon": Supabase Realtime, Kantar Paneli için
  `supabase_realtime` yayınındaki `konteynerler` tablosunu mantıksal
  replikasyonla dinler. Slot (`supabase_realtime_messages_replication_slot_*`)
  panel açıkken oluşur, kimse bağlı değilken kapanır; `max_slot_wal_keep_size
  = 512MB` takılı slotun diski doldurmasını engeller. Kontrol:
  `select slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) from pg_replication_slots`.
- Kantar Paneli bağlantı dayanıklılığı (`app/kantar/page.tsx`): canlı kanal
  (yeniden) bağlanınca, sekmeye dönülünce, internet gelince ve görünürken
  dakikada bir liste yenilenir (kopukken kaçan değişiklikler telafi edilir).
  Okuma başarısızsa liste BOŞALTILMAZ (eskiden kesinti anında "konteyner yok"
  görünüyordu), başlıkta "Bağlantı yok · SS:DD" çıkar; telefonda Yenile
  butonunda renkli nokta. Aynı anda biten yenilemelerde sadece en sonuncusu
  ekrana yazılır (`istekSira`).
- Felaket kurtarma (proje tamamen kaybolursa): `docs/felaket-kurtarma.md`.

## Kimlik doğrulama / kullanıcılar (karar: 01.10.2026)

- Uygulamayı **sadece Unex Gıda** kullanıyor. Kayıt formu YOK; kullanıcılar
  Supabase Dashboard'dan manuel ekleniyor. Giriş ekranında (`app/page.tsx`)
  SADECE e-posta + şifre ile giriş var; "Şifremi unuttum" akışı ve
  `/sifre-yenile` sayfası da kullanıcı kararıyla kaldırıldı (şifre sıfırlama
  yönetici işi). `/checkout` ve `/api/checkout` (iyzico deneme çekimi) de
  kaldırıldı — bunların hiçbiri geri eklenmemeli. `iyzipay` /
  `@types/iyzipay` npm paketleri ve `next.config.js`'teki ilgili ayar da
  kaldırıldı; build artık hiçbir IYZICO_* ortam değişkenine ihtiyaç duymaz.
- Giriş ekranı arka planı (22.10.2026, kullanıcının dünya haritası görseli): SADECE
  `app/page.tsx`. Orijinal 5504×3072 PNG 17 MB → WebP 5 boyut `public/images/giris/
  giris-arka-{828,1280,1920,2560,3840}.webp` (18–184 KB, toplam ~430 KB), `<img srcSet
  sizes="max(100vw, 179vh)">` (dik ekranda yüksekliğe göre seçer), üstte koyu radyal örtü,
  kart %90 opak + blur. Görsel yüklenemezse koyu zemin kalır. Orijinal PNG repoya EKLENMEDİ.
- UYGULAMA İÇİ (22.10.2026, kullanıcı isteği): aynı görsel `components/arka-plan-gorseli.tsx`
  (`ArkaPlanGorseli tur="giris"|"uygulama"`) ile AppShell'de TAM EKRAN, `position: fixed`
  (kaydırmada yeniden çizilmez), daha koyu örtü (%60–84). Kartlar/tablolar OPAK kalır
  (okunurluk); görsel boşluklarda ve kenarlarda görünür. HER ZAMAN AÇIK — "Arka plan"
  aç/kapa anahtarı kullanıcı kararıyla KALDIRILDI (22.10.2026), geri eklenmez (eski
  localStorage `arka-plan-gorseli` değeri artık okunmaz). Kantar Paneli de görselli
  (`app/kantar/page.tsx` kök kabı `relative isolate`; dar ekranda yapışkan bölüm başlığı
  %92 opak, 2xl'de saydam). Girişsiz sayfalar (takip, çıkış, rapor) görselsiz. Sayfa
  geçişinde görsel yeniden indirilmez (önbellek).
- KENAR ÇUBUĞU macOS tarzı (22.10.2026, kullanıcı isteği; `components/sidebar.tsx`):
  masaüstünde YÜZEN panel (sol/üst/alt 12px boşluk, 224px, 16px köşe, gölge; içerik
  `md:ml-[240px]` değişmedi). Cam (rgba(16,20,28,0.62) + blur 20px — tek öğe, performans
  sorunu yok). Bölüm başlıkları: İhracat /
  Operasyon / Yurt İçi / Yönetim (süper admin). Aktif öğe: yumuşak yeşil zemin + solda
  3px çizgi + yeşil ikon + `aria-current`. Altta kullanıcı kartı (baş harf avatar,
  e-posta, Çıkış). Mobil çekmece aynı stil. Menü öğeleri, sırası ve
  yetki/kilit davranışı DEĞİŞMEDİ. Test `sf/e2e7.py`.
- Supabase Auth'ta "Allow new users to sign up" KAPALI (kullanıcı teyit etti,
  01.10.2026).
- `handle_new_user` tetikleyicisi yeni kullanıcıya KENDİ izole şirketini açar
  (yabancı biri Unex şirketine değil boş bir şirkete düşer). İSTİSNA (27.10.2026,
  migration `20261027160000_yeni_kullanici_unex.sql`, kullanıcı: "yeni kullanıcı eklediği
  gibi Yetkilendirme sayfasında görünsün, yetki ayarları yapılıp kaydedilebilir hazır
  olsun"): `@unex.com.tr` adresleri eklendiği an Unex'e bağlanır, rol `uretim` (dosya
  verisi GÖRMEZ), TÜM sayfa/sekme yetkileri KAPALI ("YETKİ BEKLİYOR" rozeti). Diğer
  adresler eskisi gibi kendi boş şirketine düşer ve Yetkilendirme'de "Onay bekleyen
  kullanıcılar" bölümünde çıkar; "Unex'e ekle" (rol seçilir, yetkiler kapalı başlar).
  RPC'ler (`yetki_kullanici_listesi` rol + kayıt/son giriş, `yetki_bekleyen_kullanicilar`,
  `yetki_kullanici_ekle`, `yetki_rol_ata` — kendi rolü değişmez) SADECE süper admin
  (`yetki_super_admin_sirketi`, RLS ile aynı sabit liste). Sayfada Rol sütunu (Yönetici /
  İhracat / Muhasebe dosyaları görür), değişmeyen satırda Kaydet kapalı, kullanıcı sütunu
  yatay kaydırmada sabit. Canlıda operation@unex.com.tr (26.10, kendi şirketinde) bu
  bölümden eklenir.
  CANLI (27.10.2026): migration `yeni_kullanici_unex` uygulandı; süper admin oturumuyla
  doğrulama: liste 7 Unex kullanıcısı, onay bekleyen = operation@unex.com.tr;
  `yetki_super_admin_sirketi` anon/authenticated'a kapalı, diğer 4 RPC sadece authenticated. Yeni şirketlerin `ai_document_limit` varsayılanı 0'dır; Unex'in
  kotası 100000.
- Veritabanındaki `depositors` ve `contact_messages` tabloları (ve
  `atomic_upsert_pending_depositor` fonksiyonu) kullanıcının BAŞKA bir
  projesine ait — **dokunma, silme, raporlarda sorun olarak işaretleme.**

## Mobil kaydırma ve ekran sabitliği (24.10.2026)

- Kullanıcı: "mobilde ekran kayıyor, çok hızlı aşağı kayıyor, kaydırma profesyonel olmalı".
  Tamamı CSS (`app/globals.css` başındaki "Mobil kaydirma" bölümü) + 2 küçük bileşen
  değişikliği; veri / SQL / sayfa düzeni DEĞİŞMEDİ. Doğal (iOS/Android) kaydırma hızına
  DOKUNULMAZ (scroll ele geçiren JS yok — erişilebilirlik ve "takılma" riski).
- Arka plan görseli (`ArkaPlanGorseli`) `.sabit-zemin` sınıfıyla `100lvh` + ayrı katman:
  telefonda adres çubuğu açılıp kapanırken görsel yeniden boyutlanıp kaymıyor.
  `data-sabit-zemin` işareti olan sayfalarda (giriş, AppShell, Kantar) html/body zemini
  koyu `#0B0F14` ve `overscroll-behavior-y: none` (üst/altta lastik esneme + beyaz zemin
  yok; Android'de aşağı çekip yenileme de kapanır — sayfalarda Yenile düğmesi / otomatik
  yenileme var). Girişsiz açık tema sayfalar (rapor, takip, çıkış) ETKİLENMEZ.
- Dokunmatik cihazda (`hover: none` + `pointer: coarse`): metin giriş alanları / select /
  textarea 16px (iOS 16px altında alana dokununca sayfayı yakınlaştırıp yana kaydırıyordu;
  pinch-zoom açık kalır, `maximum-scale` KULLANILMAZ). Açık pencere (`aria-modal`) veya
  `fixed inset-0 bg-black/…` örtüsü (mobil menü dahil) varken `html` kaydırması kilitli;
  konum korunur. Masaüstünde kilit ve yazı boyu DEĞİŞMEDİ (kaydırma çubuğu kayması olmasın).
- Pencereler, `fixed overflow-y-auto` paneller, mobil menü listesi: `overscroll-behavior:
  contain` (iç kaydırma sona gelince arkadaki sayfa kaymaz). `.overflow-x-auto` tablolarda
  yatay zincirleme yok. iOS yatay çevirmede yazı büyütme kapalı (`text-size-adjust: 100%`).
- Yeni pencere yazarken: `fixed inset-0 bg-black/..` örtüsü veya `aria-modal="true"` kullan
  (kilit otomatik gelir). AppShell `main`'deki `overflow-x-hidden` BİLEREK bırakıldı
  (`clip`'e çevirmek proformalardaki `sticky` öğeleri ilk kez çalıştırıp düzeni değiştirir).
- Test (scratchpad `mobil/`): iPhone 13 ile 26 sayfa/sekme (veri dolu dahil) yatay taşma 0,
  16px altı giriş 0; davranış 16/16 (görsel sabit, menü/pencere kilidi + konum, masaüstü
  değişmedi, rapor açık tema). Regresyon e2e2/3/4/5/8, gecmis_e2e, eposta_e2e geçti.
  `sf/e2e7.py`'nin "Arka plan" anahtarı adımı 22.10'dan beri eskidir.

## Sorun Bildir — kişiye özel teşekkür (25.10.2026)

- `components/destek-widget.tsx` gönderim sonrası: "Mesajınız alındı, Burak Bey." +
  "Unex'e sağladığınız katkı için teşekkür ederiz." + türe göre cümle (`TESEKKUR_DETAYI`:
  sorun incelenecek / öneri değerlendirmeye alındı / şikayet öncelikli) + "Volkan Durgut ·
  İhracat AI". Sadece ekran; edge function, e-posta ve gönderim gövdesi DEĞİŞMEDİ.
- Kullanıcı adları Supabase'te KAYITLI DEĞİL (user_metadata boş; 25.10.2026 kontrol). Hitap
  `lib/kullanici-hitap.ts` (`HITAPLAR`, e-posta → "Ad Bey/Hanım"; e-posta `toLowerCase`, TR
  locale DEĞİL) ya da ileride `user_metadata.hitap`. Listede yoksa İSİMSİZ "Mesajınız alındı."
  (yanlış isim / Bey-Hanım tahmini yapılmaz). Kayıtlı: bbt@ Burak, ihracat@ Harun, lojistik@
  Süleyman, volkandurgut.tr@ Volkan. kantar@, mudur@, muhasebe@ isimsiz (kullanıcıdan bekleniyor).
  Yeni kullanıcı eklenince listeye bir satır eklenir. Test scratchpad `destek/test.py` 16/16.

## Giriş e-postaları değişti (27.10.2026) — GÜNCEL HESAPLAR

- `volkandurgut.tr@gmail.com` → `execution@unex.com.tr` (Volkan Durgut, id 6536cef7…,
  admin + SÜPER ADMİN) ve `ihracat@unex.com.tr` → `export@unex.com.tr` (Harun Bey,
  id 2cb21809…, rol ihracat, `proforma_imza`). Aynı kullanıcı / şifre / rol / yetkiler.
  Migration `20261027200000_hesap_eposta_degisimi.sql` (tek transaction): auth.users +
  auth.identities + kullanici_yetkileri.email; 3 RLS politikası; `yetki_super_admin_sirketi`
  ve `kh_elle_iste` (canlı tanımdan yalnız e-posta değiştirilerek; izinler korunur);
  sonda "eski adres kaldı mı" doğrulaması. CANLI uygulandı.
- SÜPER ADMİN = `execution@unex.com.tr` + `bbt@unex.com.tr`. Aynı liste: RLS, 2 fonksiyon,
  `lib/auth-context.tsx` SUPER_ADMIN_EMAILS, `gunluk-rapor-gonder/yetki.ts`
  SUPER_ADMIN_EPOSTALARI. NOT: canlı `gunluk-rapor-gonder` henüz eski listeyle çalışıyor
  (yeniden yüklenmedi); etkisiz, çünkü orada yetki "süper admin VEYA admin rolü" ve
  execution@ admin. Bir sonraki deploy'da yeni liste gider.
- Hitap (`lib/kullanici-hitap.ts`): execution@ "Volkan Bey", export@ "Harun Bey".
- DEĞİŞMEDİ: geri bildirim / yedek kişisel alıcı varsayılanı (`GERI_BILDIRIM_ALICI`
  yoksa volkandurgut.tr@gmail.com) — bu bir mail ALICISI, giriş hesabı değil.
- `mudur@unex.com.tr` silinecek ("artık müdür yok"): iş kaydı yok (yalnız rol + yetki satırı).
  MCP ile DELETE yapılmaz; kullanıcıya korumalı SQL verildi (iş kaydı varsa durur).

## Burak Tuncay giriş e-postası (14.10.2026)

- `buraktuncay@unex.com.tr` → `bbt@unex.com.tr` (aynı kullanıcı id 3a9ff910…,
  aynı şifre / rol / yetkiler). Migration `20261014150000_burak_eposta_bbt.sql`
  (tek transaction): 3 RLS politikası (kullanici_yetkileri yönetimi,
  ihracat_dosyalari okuma, denetim okuma), auth.users + auth.identities,
  kullanici_yetkileri.email. Kod: `SUPER_ADMIN_EMAILS` (lib/auth-context.tsx).
  Aynı komut önce panelden elle açılmış BOŞ `bbt@` hesabını (7c41b472…, hiç
  giriş yok) ve tetikleyicinin onun için açtığı boş şirketi (32a8d2cc…) korumalı
  biçimde siler. Panelden elle kullanıcı açmak `handle_new_user` ile AYRI şirket
  oluşturur — kullanıcılar mevcut şirkete bağlanacak şekilde eklenmeli.
  Süper admin e-postası değişirse bu ikisi BİRLİKTE güncellenir.
- Eski formlardaki (iletisim = NULL) "buraktuncay@" bilgisi bilinçli olarak
  korunur (`VARSAYILAN_ILETISIM`; form gönderildiği haliyle açılır). Yeni
  formlar panel ayarından (bbt@) gelir.

## Yazı animasyonu (27.10.2026)

- Kullanıcı: Proforma Yükle karşılama mesajı "chatte yazıyor gibi" yazılsın; diğer sayfalarda
  bilgilendirme metinleri de her açılışta yazı animasyonuyla gelsin.
- `components/yazi-animasyonu.tsx` (`YaziAnimasyonu`): harf harf yazar, bitince imleç kaybolur;
  tam metin görünmez kopya olarak yer ayırır (yer kayması YOK), ekran okuyucu için `sr-only`
  tam metin, `prefers-reduced-motion` açıkken animasyonsuz; toplam süre sınırlı (`enUzunMs`);
  yazım bittikten sonra metin değişirse (veri yüklenince sayı değişimi) yeniden yazmaz.
  CSS: `globals.css` `.yazi-imlec`, `.yazi-nokta`.
- `SayfaBasligi`: `aciklama` STRING ise animasyonlu (12 ms/harf, en fazla 0,9 sn); JSX
  açıklamalar aynen. Tüm uygulama sayfa başlıkları bunu kullanır.
- `ProformaAsistanYukleme`: karşılama balonu önce 0,65 sn "yazıyor" üç noktası, sonra
  harf harf (20 ms/harf, en fazla 2,6 sn); yetenek etiketleri yazım bitince belirir. Yükleme
  alanı baştan kullanılabilir (animasyon hiçbir şeyi bekletmez).

## Kullanım Kılavuzu `/kilavuz` + küçük revizeler (28.10.2026)

- Kullanıcı: "UNEX GIDA - İHRACAT AI KULLANIM KILAVUZU… aynı arka plan ve tema, ekran
  görüntüleri, animasyonlu anlatım… kamera hareketi ile farklı bir evrene geçer gibi; aynı
  geçişler tüm sayfaların arasında; evrenden evrene, logo temalı; konulu olmalı."
- Sayfa `app/kilavuz/page.tsx` (+ `layout.tsx` başlık/noindex). Oturum gerekir, sayfa yetkisi
  GEREKMEZ; AppShell kullanmaz (Kantar gibi kendi kapısı). Menüde alt karttaki "Kullanım
  Kılavuzu" (herkese). Kapak → 14 evren → son ekran. Konu / hikâye / adımlar TEK YER
  `lib/kilavuz/konular.ts` (hikâye: kurgusal IHR-2026-0141 Nordline, 10 konteyner un,
  Mersin → Tema). Evren geçişi: sahne büyüyüp kaybolur (geri: uzaklaşır), Unex logosu ortada
  belirir, halka portal açılır, yeni evren dairesel açılır; yıldız alanı (`components/kilavuz/
  yildiz-alani.tsx`, tuval) ışık çizgisine döner; evren rengi `@property --klv-a/b` ile süzülür.
  Bölüm içinde `components/kilavuz/ekran-sahnesi.tsx` kamerası işaret noktasına yaklaşır
  (1–2,1x), odak dışı kararır, numara nabız atar; adım metni `YaziAnimasyonu`. Klavye ← →,
  telefonda kaydırma, `?k=<bolum>` / `?k=son`, localStorage `kilavuz-konum` ("kaldığınız
  yerden"). "Hareketi azalt"ta portal/kamera/yıldız hareketi yok. Bulanıklık filtresi
  BİLEREK yok (büyük katmanda yavaş + başsız Chromium'da bloklu görünüyordu).
- EKRAN GÖRÜNTÜLERİ KURGUSAL veriyle (repo açık; gerçek müşteri/booking YOK):
  `public/kilavuz/<ekran>.webp` (1920×1200, toplam ~1,1 MB) + işaret noktaları
  `lib/kilavuz/ekran-noktalari.ts` (OTOMATİK, ekranın yüzdesi). Üretici scratchpad `kl/`:
  `veri.mjs` (kurgusal veri), `mock.mjs` (Supabase taklidi + Inter yazı tipi), `cek.mjs`
  (çekim + Playwright ile öğe kutuları → json), `isaret.py` (kontrol görseli). Bir sayfa
  görünümü değişirse: build → `node cek.mjs ham noktalar.json` → webp + ts üretimi (bu oturumdaki
  python betiği) → konular.ts'te `nokta` anahtarları aynı kalmalı.
  PROFORMA OLUŞTUR ekranı (28.10.2026, kullanıcı: "burada proforma gözükmeli"): çekimde kurgusal
  müşteri seçilip form doldurulur (`once`); başsız Chromium PDF çizmediği için önizlemedeki
  PDF'in KENDİSİ (blob) alınır, 1. sayfası `pdftoppm` ile aynı kutuya yerleştirilir
  (`kl/pdf_yerlestir.py`; tek ekran: `node cek.mjs ham x.json proforma-olustur`). "odeme"
  noktası ELLE (PDF'teki şartlar satırları; form uzadığı için kutusu ekran dışına düşüyor).
- Diğer: Kontrol Merkezi "Otomatik Özet" cümleleri sohbet gibi SIRAYLA yazılır (`OzetKarti`,
  yer kayması yok, filtre değişince yeniden yazmaz). Menü "Proformalar" → "Proforma Oluştur"
  (adres/yetki aynı; Yetkilendirme etiketi de).
- Test: `scratchpad/kl/e2e.mjs` (menü, kapak, geçiş fazları, kamera, 14 evren × tüm adımlar
  odak çerçevede, son ekran, ?k=, kaldığınız yer, mobil 390 + kaydırma, hareketi azalt, özet).

## Yetkilendirme sayfası — kart düzeni (03.11.2026)

- Kullanıcı: "ekrana sığmıyor, bazı yetkileri vermek için sağa kaydırmak gerekiyor; mobilde çok
  kötü, alt alta yetki gör düğmeleriyle sıralanmalı". 17 sütunluk tablo (min 1560 px) KALDIRILDI.
- `app/ayarlar/yetkilendirme/page.tsx`: kullanıcı başına KART — üstte e-posta / rozetler, Rol,
  "Sayfa x/13 · Sekme y/4" özeti, Geri al (yalnız değişiklik varsa) + Kaydet ("Kayıtlı").
  Yetkiler `YETKI_GRUPLARI` ile kenar çubuğu bölümlerine göre (İhracat / Operasyon / Yurt İçi /
  Şirket İçi / Yönetim / Dosya sekmeleri), her yetki tam satır tıklanan anahtar düğmesi
  (`YetkiDugmesi`, role=switch, aria-label "e-posta · etiket" — eski tabloyla aynı).
  Masaüstünde açık; mobilde (<640 px) kartlar alt alta, "Yetkileri gör / gizle" ile açılır.
- YENİ SAYFA YETKİSİ eklenirken `SAYFA_ETIKETLER` + `YETKI_GRUPLARI` ikisine birden eklenir.
- Kayıt mantığı (yetki_rol_ata + kullanici_yetkileri UPDATE + yazmaHatasi) DEĞİŞMEDİ.
  Test: Playwright 38 (1280/1366/1536/1920 yatay taşma 0, 390 mobil, kaydet / geri al / rol).

## Kullanım Kılavuzu — sağdaki "Sonraki" göstergesi (03.11.2026)

- Kullanıcı: "Kullanım kılavuzunda sağ kaydırınca sayfanın değişeceğini net bir şekilde ifade
  edebilmeliyiz. Ekranın sağında temaya uygun büyük bir şekilde gözükmeli."
- `app/kilavuz/page.tsx`: sağ kenarda sabit dikey panel (`data-testid kilavuz-sonraki`,
  masaüstü 72px × ≤460px, telefon 40px). Evren renginde kenar / parıltı, 3 kayan ok (`klv-ok`,
  "hareketi azalt"ta durur), dikey yazı: masaüstü "→ <sıradaki adım / evren>"
  (`sonrakiBaslik`), telefon "Sağa kaydırın". Tıklayınca `ileri()`. Son ekranda YOK.
  `main` sağdan `pr-12 md:pr-24` boşluk alır (panel içeriği / İleri düğmesini örtmez).
  Kaydırma (touch) ve ← → davranışı DEĞİŞMEDİ. Test: e2e_kilavuz_vgm (1440/1366/390).

## Gece yedeği — DİİB tabloları (04.11.2026)

- `yedekleme-gonder` YEDEKLENECEK_TABLOLAR'a `diib_belgeleri`, `diib_ihracatlari`,
  `diib_dosya_bolunmeleri` eklendi (sıra: belgeler önce; FK). Edge deploy migration canlıya
  uygulandıktan SONRA yapılır (tablo yokken yedek hata verir).
