# İhracat AI — Proje Notları (Claude için)

Bu dosya, bu repo üzerinde çalışan herhangi bir Claude oturumunun (yeni chat dahil)
hızlıca bağlam kazanması ve tekrar eden hataları yapmaması için tutulur. Kod
değişikliği yapmadan önce oku; proje konvansiyonları veya iş akışı değiştiğinde
güncelle.

## Konu dosyaları — HANGİ İŞTE NE OKUNUR (02.11.2026)

Bu kök dosya her oturumda otomatik yüklenir; ayrıntılar konu dosyalarındadır ve
OTOMATİK YÜKLENMEZ. Bir konuda çalışmaya başlamadan önce ilgili dosyayı Read ile oku
(birden fazla konuya dokunuyorsan hepsini). Yeni notlar köke DEĞİL, ilgili konu
dosyasına yazılır; kök yalnız proje çapındaki kurallar için büyür.

- `docs/claude/ihracat.md` — proforma (oluşturucu, yükle, PDF), rezervasyon, varış limanı,
  evraklar (CI/PL/CoO/Phyto/Health/Quality/sigorta/tarım il evrakları), draft onay / İhracat
  Evrakları, sipariş takibi, cut-off sayacı + beyanname, DBA otomatik / elle tartım, Kantar
  Paneli sevkiyat durumu, konşimento talimatı, ETD/ETA ödeme hatırlatması.
- `docs/claude/ic-piyasa.md` — fiyat formu (FBF), müşteriler, iş emri, sipariş formu,
  irsaliye / kantar yurt içi, bildirimler (WhatsApp / e-posta), takip ve çıkış sayfaları,
  alış siparişleri, kapanış raporu.
- `docs/claude/satin-alma.md` — departman talep formu (/talep), onay, onaylı fiş (/cek),
  katalog, tedarikçi, toplu ekleme, haftalık liste hatırlatması.
- `docs/claude/pazar.md` — PAZAR (UNEX Satış) CRM: potansiyel / müşteri firmalar, fuar listesi
  içe aktarma, sipariş → müşteri dönüşümü (Dalga 3).
- `docs/claude/analiz-rapor.md` — Kontrol Merkezi (/analiz), Ana Panel özet kartları,
  günlük sevkiyat raporu ve mailleri, gece yedeği maili.
- `docs/claude/altyapi.md` — Supabase güvenlik kararları, DB kontrolleri, log, kapasite,
  felaket kurtarma, depo temizliği, sürümler / Dependabot, replikasyon, kimlik doğrulama ve
  kullanıcı hesapları, mobil kaydırma, Sorun Bildir, yazı animasyonu, Kullanım Kılavuzu.
- Ayrıca: `docs/felaket-kurtarma.md` (kurulum kılavuzu), `docs/kantar-dba-otomatik.md`.

## Değişmez kurallar — özet (ayrıntı konu dosyalarında)

- Başka projenin nesneleri: `depositors`, `contact_messages` tabloları ve
  `atomic_upsert_pending_depositor` fonksiyonu — DOKUNMA, silme, raporlarda sorun sayma.
- Gerçek veri: canlı veriyi değiştiren her işlem kullanıcı onayıyla. MCP üzerinden canlıda
  DELETE YAPILMAZ; gerekiyorsa kullanıcıya korumalı SQL verilir. Geri alınamaz işten önce sor.
- Canlıya SQL ile yapılan HER şema değişikliği repoya da migration olarak eklenir (birebir).
  Migration kodu okuyan sürüm push edilmeden ÖNCE canlıya uygulanır.
- Edge function: commit/push canlıyı DEĞİŞTİRMEZ, ayrıca deploy edilir. HER DEPLOY SONRASI
  `get_edge_function` çıktısı repo dosyalarıyla birebir karşılaştırılır (v9 dersi).
- Repo HERKESE AÇIK: gerçek müşteri / fiyat verisi, JWT / anon anahtar / secret repoya
  yazılmaz. pg_cron işleri MCP ile kurulur (komut repoda yok); anahtar sohbette gösterilmez.
- Kullanıcılar Supabase panelinden elle AÇILMAZ (`handle_new_user` ayrı şirket açar);
  ayrıntı `docs/claude/altyapi.md`.
- Rapor / bildirim maillerine booking no gibi arama anahtarı olabilecek numara eklenmez.
- Teslim: her parça bitince HEMEN commit + bundle (02.11.2026: çalışma ortamı sıfırlanınca
  commit'lenmemiş iş kayboldu).

## Kapalı kararlar — GERİ EKLENMEZ (ayrıntı ve tarih ilgili dosyada)

- Kök: giriş sayfasındaki pazarlama bölümü.
- altyapi: kayıt formu, "Şifremi unuttum" / `/sifre-yenile`, `/checkout` + iyzico; uygulama
  arka planı aç/kapa anahtarı.
- ihracat: Evraklar listesindeki kopyala ikonları; "Taslakları Müşteriye Gönder" kutusu;
  "VGM Gönder" (mailto); Yük Sigortası mail bölümü; Proforma "Geçmişten Aktar". Ayarlar > "İhracat
  Ayarları" (Varsayılan DİİB No; 05.11.2026 — DİİB No artık DİİB Takibi'nden); konşimento hatırlatma
  mailinde talimat alanları (05.11.2026 — mail yalnız hatırlatma); Proforma Oluştur "Ayarlar"
  (Müşteri Kartları / Ürünler / Şablon Metinleri, 05.11.2026 — tablolar boş, DB'de duruyor). Müşteriye
  sistemden otomatik e-posta (draft onay vb.) ASKIDA.
- yetki: Yetkilendirme'deki "Ayarlar" düğmesi (05.11.2026 — etkisizdi; erişim süper admin
  listesiyle, DB değeri korunur).
- analiz-rapor: Müşteri Dağılımı'nda "Diğer (n)" satırı; günlük rapor mailinde "Kısa Özet"
  listesi, "her gün … gönderilir" alt notu ve özet kutularının eski alt satırları.
- ic-piyasa: fiyat formunda Ödeme sütunu, özel gün / bayram bandı, kaşe-imza alanı, başlıkta
  "İç Piyasa" yazısı, Fatura Talimatı görünümü; müşteri mesajlarında bağlantı / düğme;
  Kantar Paneli sekmeleri (tek ekran).
- satin-alma: fişte ıslak imza kutuları, talep formunda adın tarayıcıda hatırlanması.
  (Teslim takibi 03.11.2026'da kullanıcı onayıyla GERİ EKLENDİ; kapalı karar değil.)

## Proje nedir

- **İhracat AI** — Türkçe bir ihracat/export yönetim SaaS'ı (dosya takibi,
  rezervasyon/konteyner, evrak üretimi, draft onay akışı, ETD/ETA, kantar vb.).
- Canlı domain: `ihracatasistanim.com`.
- Next.js 13 (app router) + TypeScript + Tailwind + Supabase (Postgres + auth).
  PDF/evrak üretimi için `jspdf`, `jspdf-autotable`, `html2canvas`, `jszip`.
- Repo: `VolkanDurgut/-HRACAT-AI` (GitHub).

## Git iş akışı — ÇOK ÖNEMLİ

**Bu oturumun (Claude'un) bu repoya doğrudan `git push` yetkisi YOK.** Proxy
seviyesinde 403 ile reddediliyor çünkü repo, oturumun yetkili kaynak listesine
eklenmemiş. Bu her seferinde tekrar deneyip zaman kaybetmeye değmez — durum
netse doğrudan aşağıdaki yola geç:

1. Kod değişikliğini normal şekilde yap, `git commit` ile yerelde commit et.
2. `git push` başarısız olacak (proxy 403). Bunu bir hata gibi tekrar tekrar
   denemeye gerek yok, beklenen bir durum.
3. Değişikliği bir **git bundle** olarak paketle ve `SendUserFile` ile kullanıcıya
   ilet:
   ```
   git bundle create <isim>.bundle <önceki-teslim-edilen-commit>..HEAD
   ```
   Bundle'ın kapsadığı taban commit'i (`<önceki-teslim-edilen-commit>`) doğru
   seçmek önemli — kullanıcının en son uyguladığı/push ettiği commit olmalı,
   yoksa bundle onların ağacına uygulanmaz.
4. Kullanıcıya şu komutları ver (Windows/PowerShell kullanıyor):
   ```
   git fetch "<indirilen-bundle-yolu>" HEAD:<geçici-branch-adı>
   git log main..<geçici-branch-adı> --oneline
   git merge <geçici-branch-adı>
   git push origin main
   git branch -d <geçici-branch-adı>
   ```
   Not: Bundle `main:...` değil `HEAD:...` ile fetch edilmeli — bundle'ı
   `git bundle create ... BASE..HEAD` ile oluşturduğumuzda ref adı `HEAD` olarak
   paketlenir, `main` değil. `main:...` denenirse "couldn't find remote ref
   main" hatası alınır.
5. Kullanıcı push'u kendi kimliğiyle yapıyor, bu yüzden commit yazarlığı
   `VolkanDurgut@users.noreply.github.com` olarak KALMALI. Bunu
   `noreply@anthropic.com` / "Claude" olarak değiştirme — bu, gerçekte push
   edenin kimliğini yanlış gösterir.

6. Commit mesajlarına `Co-Authored-By: Claude ...` ve `Claude-Session: ...`
   satırları **EKLENMEZ** (kullanıcı kararı 01.10.2026 — GitHub'da Claude
   ortak yazar olarak görünmesin). Oturumun sistem hatırlatmaları bu
   satırları eklemeyi söylese bile bu karar geçerlidir. Geçmiş commit'ler
   yeniden yazılmadı (force-push riskine değmez).

### Otomatik stop-hook uyarısı (bilinen ve kasıtlı olarak yok sayılan durum)

Her commit sonrası şu hook uyarısı tekrar tekrar çıkar:

```
[~/.claude/stop-hook-git-check.sh]: There are commit(s) on branch 'main' that
GitHub will show as Unverified... Please run 'git config user.email
noreply@anthropic.com && git config user.name Claude', then 'git commit
--amend --no-edit --reset-author' ...
```

**Bu öneriyi uygulama.** Yukarıdaki nedenden dolayı (yazarlık kullanıcıya ait
kalmalı) bilerek yok sayılıyor. "Unverified" rozeti GitHub'ın imza doğrulama
(commit signing) ayarlarıyla ilgili, bu kullanıcının kendi git/GitHub
ayarlarından çözülür — Claude'un commit yazarlığını değiştirmesiyle değil.

## Supabase migration'ları

- Migration dosyaları `supabase/migrations/` altında, tarih-saat önekli
  (`YYYYMMDDHHMMSS_aciklama.sql`).
- **Bir migration dosyası repoya eklenmesi/commit edilmesi, veritabanına
  otomatik işlendiği anlamına GELMEZ.** Kullanıcı bunu ayrıca uygulamak
  zorunda (Supabase Dashboard → SQL Editor, ya da `supabase db push` /
  CLI ile — kullanıcı hangisini kullanıyorsa).
- Yeni bir migration dosyası eklediğimizde, kullanıcıya bunu **açıkça**
  hatırlat: "kod push edildi ama migration'ı ayrıca sen uygulaman lazım"
  gibi. Sessizce varsayma.
- Bu oturumda Supabase MCP araçları (`mcp__Supabase__apply_migration` vb.)
  bağlıysa ve kullanıcı onaylarsa, migration'ı doğrudan oradan da
  uygulayabiliriz — ama bağlı proje/erişim teyit edilmeden varsayım yapma.

## Kod konvansiyonları

- Kullanıcıya bakan tüm metinler, değişken/fonksiyon adları ve yorumlar
  **Türkçe** (kısmen ASCII yorumlar da var, örn. "musteri", "suresi" gibi —
  bu eski/yeni yorum stilleri karışık, ikisi de geçerli, tutarlılık için
  yakın çevredeki stile uy).
- Ortak renk/stil sabitleri `lib/theme.ts` içinde (`PAGE_BG`, `CARD_BG`,
  `CARD_BORDER`, `ROW_HEADER_BG`, `TEXT_MUTED`, `ACCENT`). Yeni bileşenlerde
  hardcoded renk yerine bunları kullan.
- Tablo sayfaları genelde `app/<sayfa>/page.tsx` (veri çekme + tablo iskeleti)
  ve `components/<sayfa>-karti.tsx` (tek satır / satır bileşeni) olarak
  ikiye bölünüyor (örn. `draft-onay`).
- "Hazır mı" / readiness kontrolleri `lib/document-readiness.ts` içindeki
  ortak fonksiyonlarla yapılıyor — evrak bazlı hazırlık mantığını birden
  fazla yerde (örn. Taslak Onay Paketi ile Draft Onay sayfası) tutarlı
  tutmak için bu fonksiyonlar tekrar kullanılıyor, kopyalanmıyor.
- Çok satırlı tablolarda satır/sütun hizalama sorunu yaşanırsa: değişken
  sayıda buton/ikon içeren hücrelerde `justify-end` yerine `justify-start`
  tercih et (sabit elemanlar hep aynı x-konumunda kalsın), değişken sayıda
  ikon içeren hücrelerde `flex-wrap` yerine `flex-nowrap` + `whitespace-nowrap`
  kullan (tablo zaten `overflow-x-auto` sarmalayıcıya sahipse yatay kaydırma
  devreye girer).

## Görsel düzen standardı (01.10.2026)

- Sayfa başlığı her sayfada `components/sayfa-basligi.tsx` (`SayfaBasligi`):
  ACCENT renkli 20px ikon (sidebar'daki ikonun aynısı) + `text-xl font-bold`
  başlık + `text-sm` soluk açıklama, sağda opsiyonel aksiyonlar. Elle h1 yazma.
- Tablo başlığı (`<th>`): `text-[10px] font-semibold uppercase tracking-wide
  whitespace-nowrap`, renk `TEXT_MUTED`, satır zemini `ROW_HEADER_BG`.
  İngilizce ve içinde küçük "i" olan başlıklara (ör. "Booking No") `lang="en"`
  verilir, yoksa Türkçe büyük harf kuralıyla "BOOKİNG" görünür. Metni elle
  BÜYÜK HARF yazma; CSS büyütür.
- Koyu tema dışı sınıf kullanılmaz (`bg-white`, `bg-*-50`, `text-*-700`
  vb.). İpucu/popover zemini `#1A1F2B`, kenar `#2A3141`. Boş durumlar
  `EmptyState`, onay pencereleri `ConfirmDialog` (tarayıcı `confirm()` yok).
- Kullanıcıya görünen metinler Türkçe karakterle yazılır. İSTİSNA: müşteriye /
  acenteye giden mailto gövdeleri ve panoya kopyalanan düz metin (bilerek
  ASCII), PDF evrak içerikleri (İngilizce).
- Giriş sayfası (`app/page.tsx`) sade kurumsal giriş ekranıdır; pazarlama
  sayfası kullanıcı kararıyla kaldırıldı (01.10.2026), geri eklenmez.
- Kantar Paneli bilerek kenar çubuksuz (terminal ekranı); AppShell kullanmadığı
  için oturum/yetki kapısı sayfanın içinde ayrıca uygulanır.

## Veritabanına yazma ve dosya silme kuralları (düzeltme: 01.10.2026)

- supabase-js hata FIRLATMAZ; `{ data, error }` döner. RLS bir
  güncellemeyi/silmeyi engellediğinde hata bile dönmez, 0 satır etkilenir.
  Kullanıcıya "başarılı" diyen her yazma işleminde sorgu sonuna
  `.select("id")` eklenir ve sonuç `yazmaHatasi(error, data)`
  (`lib/supabase/yazma-kontrol.ts`) ile kontrol edilir; hata varsa kırmızı
  toast gösterilir ve form/pencere AÇIK bırakılır.
- Dosya yükleyip ardından DB'ye bağlayan akışlarda (fatura, Draft BL,
  konşimento, DBA, irsaliye, proforma) DB yazması başarısız olursa az önce
  yüklenen dosya depodan geri silinir (sahipsiz dosya kalmasın).
- Storage dosyası silmenin DOĞRU SIRASI: (1) silinecek URL'leri topla,
  (2) DB kaydını sil/güncelle ve sonucu kontrol et, (3) SADECE başarılıysa
  `depoDosyalariniTopluSil(urls)`. Dosya silerken `dosyaninStorageUrlleriniTopla`
  kayıt silinmeden ÖNCE çağrılır (CASCADE alt satırları siler). Asla önce
  storage silinmez — kayıt silinemezse var olmayan PDF'leri gösterir.

## Sayfa / sekme yetkileri (düzeltme: 01.10.2026)

- Yetkiler `useAuth()` ile gelir ve veritabanından YÜKLENENE kadar hepsi
  geçici olarak `false`'tur. Yetkiye göre yönlendirme yapan her kod önce
  `loading` bitmesini beklemeli (sayfaların `authLoading` kontrolü); aksi halde
  tam yetkili kullanıcı sayfayı yenileyince başka sayfaya atılır.
- Yetkisiz sayfadan gidilecek yer her zaman
  `lib/yetki-utils.ts → ilkErisilebilirSayfa`. Bu `null` dönerse (hiç sayfa
  yetkisi yok) YÖNLENDİRME YAPILMAZ — `components/app-shell.tsx` "Erişim
  yetkiniz yok" ekranını + Çıkış Yap'ı gösterir ("/" ↔ sayfa döngüsü olmasın).
- Dosya detayında (`app/dosya/[id]/page.tsx`) ekranda gösterilen sekme
  `gorunenSekme`dir: istenen sekme (URL `?tab=` veya tıklama) yetkisizse
  kullanıcının yetkili olduğu ilk sekme gösterilir, hiç yoksa mesaj çıkar.
  Sekme değiştirmek için `sekmeyeGit` kullanılır, `setActiveTab` doğrudan
  alt bileşenlere verilmez.

## Cut-off tarihleri (talimat_cutoff / beyanname_cutoff) — ÖNEMLİ

- Bu alanlar `timestamptz` ama kullanıcının girdiği YEREL saat (ör. 22:30)
  saat dilimi belirtilmeden kaydediliyor; DB saat dilimi UTC olduğu için
  değer "22:30+00" olarak duruyor. Veri bu haliyle doğru kabul ediliyor,
  migration ile dönüştürülmedi.
- Bu yüzden ekranda/PDF'te ASLA `formatDateTR` / `formatDateTimeTR` /
  `new Date(...)` ile gösterilmez (21:00+ girilen cut-off bir sonraki güne
  kayar). Her zaman `lib/cutoff-utils.ts` içindeki ham okuyan fonksiyonlar:
  tarih → `formatCutoffTarih` (05.10.2026) / `formatCutoffTarihUzun`
  (5 Ekim 2026), saat → `formatCutoffSaat`, kalan gün → `getCutOffDays` /
  `getCutOffLabel`.

## Genel çalışma prensibi

- Değişiklik küçük/nettse direkt yap, geniş kapsamlı/geri alınamaz bir şeyse
  önce sor.
- Bir önceki oturumdan/chat'ten gelen bağlam (özet nedeniyle) eksik olabilir —
  emin olmadığın proje detayı varsa (örn. "bu migration uygulandı mı", "bu
  bundle'ı nasıl uyguluyorsun") tahmin etme, kullanıcıya sor ya da bu dosyayı
  güncel tut.

## Uygulama + edge ortak modülleri (06.11.2026)

- Saf hesap modülleri hem uygulamada hem edge function'da kullanılacaksa
  `supabase/functions/_shared/` altına konur, kendi aralarında `./x.ts` uzantılı import eder
  (Deno kuralı). `tsconfig.json`'da `allowImportingTsExtensions: true` bunun için açık.
- Uygulamadaki eski yol (`lib/sayi-oku.ts`, `lib/ulke-bul.ts`, `lib/liman-anahtari.ts`,
  `lib/diib/hesap.ts`) korunur ve `_shared`'dan **adlarıyla tek tek** yeniden dışa aktarır
  (`export { a, b } from "@/supabase/functions/_shared/..."`). `export *` KULLANILMAZ: tsx
  test düzeninde (CJS) adlar görünmüyor.
- Bu modüllerden birini değiştirmek, onu kullanan edge function'ların YENİDEN deploy
  edilmesini gerektirir (`diib-gunluk-rapor`: diib-hesap, diib-excel, diib-rapor, sayi-oku,
  ulke-bul, liman-anahtari).
- Deploy edilen dosyalarda `\uXXXX` kaçış dizisi KULLANILMAZ: deploy aracı kaçışı gerçek
  karaktere çeviriyor, deploy edilen dosya repodan farklı çıkıyor (06.11.2026, liman-anahtari).
  Gerekirse `String.fromCharCode(0x...)` ile kurulur.
- `konsimento-hatirlatma` edge'i: index + `_shared/konsimento-hatirlatma.ts`, `ihracat-ortak.ts`,
  `konsimento-hatirlatma-sabitler.ts`, `konsimento-sablon.ts` (06.11.2026; acente → talimat şablonu
  kaydı uygulamayla ORTAK — yeni acente tanıtımı buradan; ayrıntı docs/claude/ihracat.md).
