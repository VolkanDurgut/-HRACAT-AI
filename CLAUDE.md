# İhracat AI — Proje Notları (Claude için)

Bu dosya, bu repo üzerinde çalışan herhangi bir Claude oturumunun (yeni chat dahil)
hızlıca bağlam kazanması ve tekrar eden hataları yapmaması için tutulur. Kod
değişikliği yapmadan önce oku; proje konvansiyonları veya iş akışı değiştiğinde
güncelle.

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

## Günlük yedek (`supabase/functions/yedekleme-gonder`)

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
- Yeni bir iş tablosu eklenirse `YEDEKLENECEK_TABLOLAR` listesine de eklenmeli.
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
  `GERI_BILDIRIM_ALICI` secret'i mesensei282@gmail.com yapıldı (yedek + rapor +
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
  (mesensei282 kullanıcı isteğiyle rapordan çıkarıldı). Gönderen adı
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
- ÖNEMLİ: `{"deneme":true}` mail GÖNDERMEZ (sadece HTML döner). Kullanıcı
  "test maili" isterse deneme OLMADAN gönderilir → o slotun kaydı yazılır;
  aynı slotun otomatik maili için kullanıcı o satırı siler.
- Test: gövde `{"deneme":true,"slot":"sabah"|"aksam"[,"tarih":"YYYY-MM-DD"]}` →
  mail/kayıt yok, yanıtta konu + özet + satırlar + HTML. 07.10.2026 canlı
  doğrulama: akşam 1 konteyner/25.040 kg, sabah (06.10) 3/75.260 kg — SQL ile
  birebir; gerçek test maili yedek adresine gitti, ikinci çağrı "zaten
  gönderilmiş" ile atlandı.

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
- Supabase Auth'ta "Allow new users to sign up" KAPALI (kullanıcı teyit etti,
  01.10.2026).
- `handle_new_user` tetikleyicisi yeni kullanıcıya KENDİ izole şirketini açar;
  bilerek değiştirilmedi (yabancı biri Unex şirketine değil boş bir şirkete
  düşer). Yeni şirketlerin `ai_document_limit` varsayılanı 0'dır; Unex'in
  kotası 100000.
- Veritabanındaki `depositors` ve `contact_messages` tabloları (ve
  `atomic_upsert_pending_depositor` fonksiyonu) kullanıcının BAŞKA bir
  projesine ait — **dokunma, silme, raporlarda sorun olarak işaretleme.**

## İç Piyasa — Yan Mamul Fiyat Bilgilendirme Formu (11.10.2026)

- Sayfa `app/ic-piyasa/page.tsx` (menüde "İç Piyasa", SADECE `sayfa_yetkileri.ic_piyasa`
  açık kullanıcıya görünür; kilitli/soluk hali gösterilmez). Yetki anahtarı eklendi:
  `SayfaYetkileri` tipi + varsayılanlar (`lib/auth-context.tsx`), `SAYFA_YETKI_MAP`
  (`components/app-shell.tsx`), `ilkErisilebilirSayfa` (en sonda), Yetkilendirme etiketi.
  Mevcut kullanıcılarda anahtar yok → false; yetkiyi süper admin Yetkilendirme'den açar.
- PEŞİN / VADELİ (14.10.2026, kullanıcı isteği): panel sütunları Ürün / Ambalaj / Peşin
  Fiyat / Vadeli Fiyat / Vade / KDV / Teslim. ÖDEME sütunu panelden ve formdan KALDIRILDI.
  `pesin_fiyat`, `vadeli_fiyat` (numeric 12,2; canlıda 12.10'da Gemini elle eklemişti →
  migration `20261014100000_ic_piyasa_pesin_vadeli.sql` "if not exists" ile resmileştirdi,
  canlıya uygulandı, veri değişmedi). `vade_gun` artık VADELİ fiyatın vadesi (seçenekler
  7–60, `VADELI_VADE_SECENEKLERI`). Satır kuralı (`satirEksigi`): en az bir fiyat; vadeli
  varsa vade > 0. Yalnız peşin/yalnız vadeli ürün olabilir → formda boş sütun "—".
  `birim_fiyat` / `odeme` sütunları eski, panel YAZMAZ/OKUMAZ. Form kalemi iki kuşak:
  yeni {pesin_fiyat, vadeli_fiyat, vade_gun|null}, eski {birim_fiyat, vade_gun(0=peşin),
  odeme} — OKUMA HER ZAMAN `kalemFiyatlari()` ile (eski tek fiyat vadesine göre peşin ya da
  vadeli sütununa düşer). ESKİ (tek fiyatlı) formlar (`eskiBicimForm`: hiçbir kalemde
  pesin_fiyat/vadeli_fiyat anahtarı yok) PDF ve görselde GÖNDERİLDİĞİ HALİYLE çizilir
  (Vade / Ödeme / Teslim / Birim Fiyat — c167fd9 çıktısıyla piksel aynı, ölçüldü); listede
  "Tek fiyatlı (eski biçim)" etiketi. AMBALAJ (14.10.2026, kullanıcı kararı — ürün adının
  altındaki soluk yazı gözden kaçıyordu): yeni formlarda PDF'te AYRI SÜTUN (Ürün | Ambalaj |
  Teslim | Peşin | Vadeli), teslimle aynı boy/koyulukta; sığmayan metin tek satır + "…".
  Görselde ürün adının yanında açık lacivert zeminli etiket (sığmazsa alt satırın başına).
  Uzun ad / 8 ürün stres testi yapıldı.
  İLETİŞİM (14.10.2026): formun alt bilgisindeki "Sipariş ve bilgi" kişisi panelden
  düzenlenir (Form Oluştur kartı → Düzenle: ad, telefon, WhatsApp hattı, e-posta).
  Güncel değer `ic_piyasa_ayarlari.form_iletisim_*` (boşsa `VARSAYILAN_ILETISIM` = Burak
  Tuncay); kayıt SADECE form_iletisim_* sütunlarını upsert eder (bildirim ayarları
  değişmez). Her yeni form onay anındaki bilgiyi `ic_fiyat_formlari.iletisim` (jsonb)
  içinde DONDURUR; eski formlarda NULL → varsayılan (gönderildikleri bilgi). Okuma
  `iletisimOku()`, metin `iletisimSatiri()`, doğrulama `iletisimHatasi()` (DB kısıtlarıyla
  aynı). Ayar okunamazsa form oluşturma kapanır (yanlış kişiyle form gitmesin). Form
  seçimi tek yerde: `FORM_SUTUNLARI`. Migration `20261014110000_ic_piyasa_form_iletisim.sql`
  (canlıya uygulandı). Listede yalnız eski formlar varsa sarı uyarı: yeni tasarım için
  "Formu Onayla ve Oluştur" (kullanıcı eski formun PDF'ini yeni tasarım sanıyordu).
  NOT: takip sayfası, WhatsApp şablonu ve genel sayfa alt bilgisinde Burak Bey'in
  numarası hâlâ sabit (bu adımda kapsam dışı). PDF (yeni formlar): iki sağa yaslı fiyat sütunu (vadeli altında "30 Gün vade ·
  + KDV"); görsel: her satırda PEŞİN / VADELİ · 30 GÜN etiketli iki fiyat. İş emri formu:
  her ürün için "Peşin" ve "Vadeli · N Gün" düğmeleri (peşin → vade 0); iş emrinin kendi
  Ödeme alanı (Çek/Havale) DURUR, formdan doldurulmaz. Test: Playwright, bellekte Supabase
  taklidi (panel kaydet gövdesinde birim_fiyat/odeme yok, form kalemleri, eski form PDF,
  iş emri doldurma), yerel PG'de migration iki kez + canlı benzeri durum.
- (14.10 öncesi) Yönetim paneli: Ürün / Ambalaj / Birim Fiyat (TL/kg, KDV hariç) / Vade (gün, 0 = Peşin) /
  Ödeme / Teslim satırları eklenir, düzenlenir, silinir, sıralanır → "Kaydet"
  (`ic_fiyat_kalemleri`). "Formu Onayla ve Oluştur" kayıtlı tabloyu `ic_fiyat_formlari.kalemler`
  içine DONDURUR; numara `FBF-YYYY-NNNN` (sayaç `ic_fiyat_formu_sira`) ve geçerlilik
  (TR takvimiyle onay günü + 3 gün) SUNUCUDA tetikleyiciyle verilir, istemcinin gönderdiği
  değer ezilir. Onaylı form değiştirilemez/silinemez (UPDATE/DELETE yetkisi yok); fiyat
  değişirse yeni form. Tetikleyici numara vermeden ÖNCE boş kalem ve şirket kontrolü
  yapar (reddedilen kayıt sayaç boşluğu bırakmasın). Migration
  `20261011200000_ic_piyasa_fiyat_formu.sql` (yerel PG'de RLS/numara/değiştirilemezlik
  testleri geçti).
- Tasarım (REVİZE 12.10.2026, kullanıcının örnek formu esas alındı, marka renkleriyle):
  lacivert üst bant → SOLDA logo karosu + "Fiyat Bilgilendirme Formu / Yan Mamul Ürünler",
  SAĞDA firma kaşe bilgileri (FORM_SIRKET: unvan, adres, T/F, e-posta/web, VD — örnek
  formdaki sahte A.Ş./Mersis bilgileri KULLANILMAZ); koyu bilgi şeridi (Form No / Onay /
  Geçerlilik / Dönem: Haftalık Bilgilendirme); "Sayın Müşterimiz / İş Ortağımız" hitap
  kutusu; özel gün bandı; ürün-fiyat tablosu; BİLGİLENDİRME VE SEVKİYAT ŞARTLARI (4 madde,
  `formSartlari`: 2. madde ürünlerin KDV seçimine göre yazılır, 3. madde geçerlilikle
  çelişmeyecek şekilde netleştirildi — kullanıcı onayı); SİPARİŞ SÜRECİ zaman çizelgesi
  (`SIPARIS_SURECI`, 4 adım: Sipariş Onayı → Yükleme ve Tartım → Yola Çıkış → Teslim ve
  Kapanış; sistemdeki gerçek bildirim akışıyla birebir); alt bilgi: Sipariş ve bilgi
  (Burak Tuncay) + sertifikalar. KAŞE / İMZA ALANI YOK (her iki taraf için, kullanıcı
  kararı). Başlıkta "İç Piyasa" yazısı YOK (11.10 ve 12.10 kararı). 7 ürüne kadar tek
  sayfa (gerekirse satırlar 11→10 mm sıkışır), daha uzunda bölüm sonraki sayfaya geçer.
  Eski tasarım: 3 bilgi kartı + geçerlilik kutusu (11.10.2026), yerine geçti.
- Özel günler (12.10.2026): `lib/ic-piyasa/ozel-gunler.ts`. Kullanıcı seçimi: milli
  bayramlar + yılbaşı (her yıl otomatik), dini bayramlar ve KANDİLLER (Diyanet takvimi,
  elle; 2026–2027 girildi, iki kaynakta karşılaştırıldı). SEKTÖR GÜNLERİ SEÇİLMEDİ.
  Kural: onay günü + 6 gün içine denk gelen gün(ler), en fazla 2; hesap onay gününe bağlı
  (aynı form her indirildiğinde aynı bant). PDF uzun kurumsal metni, telefon görseli kısa
  metni (`kisa`) kullanır. Panelde "Bu formda kutlama bandı çıkacak" bilgisi; liste bitmeden
  60 gün önce panel uyarır (`DINI_KAPSAM_SONU` = 2027-12-31 → 2028 tarihleri eklenmeli).
- Önceki kararlar (11.10.2026): Fatura Talimatı görünümü REDDEDİLDİ; kurumsal B2B dil:
  büyük sağa yaslı fiyatlar, koyu alt bant (form no · Sayfa x/y · web). Uzun listede sayfa
  bölünür (tek sayfaya zorla sıkıştırma YOK). Renkler logodan (#283474 / #F4A07C). Yazı
  tipi Inter (OFL), TR alt kümesi `lib/fonts/inter-tr-base64.ts` (PDF'e gömülü).
- KDV: her satırda "KDV Hariç / KDV Dahil" seçimi (`ic_fiyat_kalemleri.kdv_dahil`, varsayılan
  false; migration `20261011230000_ic_piyasa_kdv_secimi.sql`). Formda fiyat altında
  "TL/kg · + KDV" veya "TL/kg · KDV Dahil". Eski formlarda alan yok → KDV hariç sayılır.
  KOD PUSH EDİLMEDEN ÖNCE bu migration canlıya uygulanmalı (yoksa Kaydet hata verir).
- Ortak kurallar TEK yerde: `lib/ic-piyasa/fiyat-formu.ts` (tipler, `GECERLILIK_GUN = 3` —
  migration ile AYNI olmalı, şirket bilgileri `FORM_SIRKET`, biçimlendirme, `kdvYazi`). PDF:
  `lib/ic-piyasa/fiyat-formu-pdf-builder.ts` (jsPDF + Inter; Türkçe içerikli — "PDF
  İngilizce" kuralının bilinçli istisnası). Telefon görseli 1080×1350:
  `lib/ic-piyasa/fiyat-formu-gorsel.ts` (canvas + Inter FontFace, aynı tasarım dili).
  Liste/indirme/paylaş: `components/ic-piyasa-gecmis-formlar.tsx` (listenin üstünde
  gönderim talimatı; "Paylaş" sadece dosya paylaşımı destekleyen cihazda — telefonda
  Paylaş → WhatsApp → kişi; bilgisayarda indir → WhatsApp sohbetine sürükle).
- Formdaki iletişim: Burak Tuncay · 0541 339 60 04 · buraktuncay@unex.com.tr
  (`FORM_SIRKET.iletisimAd/Tel/Eposta`).
- Gece yedeği: iki tablo `YEDEKLENECEK_TABLOLAR`'a eklendi; `yedekleme-gonder` v9 olarak
  canlıya DEPLOY EDİLDİ (11.10.2026). Deneme çalışması: 21/21 tablo, geri yükleme testi
  21/21 birebir, uyarı yok.
- CANLI DURUM (11.10.2026 kontrol): migration kullanıcı tarafından SQL Editor ile
  UYGULANDI (bu yüzden `supabase_migrations` geçmişinde görünmez). İki tablo + RLS (6
  politika) + 2 tetikleyici yerinde; yetkiler sadece authenticated (tablolarda
  SELECT/INSERT/UPDATE/DELETE, formlarda SELECT/INSERT; TRUNCATE yok, anon yok).
  `ic_piyasa` yetkisi buraktuncay@ ve volkandurgut.tr@ için açık. Canlı test: boş
  form reddedildi, sayaç harcanmadı (ilk gerçek form FBF-2026-0001 olur).
- Sıradaki (plan): WhatsApp otomatik gönderim (Meta Cloud API + mevcut numara için
  Coexistence/BSP) ayrı faz; müşteriye sistemden mail ASKIDA kuralı burada da geçerli.

## İç Piyasa — Müşteri, İş Emri, Kantar Yurt İçi (Parça 1, 12.10.2026)

- Akış (kullanıcı kararı): Burak Bey talimat verir → **Volkan** iş emri açar
  (`/ic-piyasa/is-emirleri`) → **kantarcı** Kantar Paneli › "Yurt İçi · İrsaliye"
  sekmesinden her araç için irsaliye PDF'ini yükler; plaka + net kg irsaliyeden okunur,
  kantarcı kontrol edip onaylar (okunamazsa elle, BÜYÜK HARF). Yurt içinde DBA YOK (DBA
  sadece konteyner tartımında). Kantarcı fiyatı GÖRMEZ, müşteri adı maskeli.
- Alt menü: `components/ic-piyasa-sekmeler.tsx` (Fiyat Formu / İş Emirleri / Müşteriler);
  hepsi `ic_piyasa` yetkisiyle (AppShell `/ic-piyasa` önekini eşler).
- Hedef: TONAJ (`hedef_tur='kg'`, ekranda ton girilir) veya ARAÇ SAYISI
  (`hedef_tur='arac'`) — Burak Bey bazen tonaj bazen araç sayısı verir. Tutar HER ZAMAN
  gerçek net kg × birim fiyat. Fiyat/vade/ödeme/teslim geçerli FBF formundan tek tıkla
  gelir (`fiyat_formu_no` yazılır), müşteriye özel fiyat elle değiştirilebilir.
- Migration `20261012100000_ic_piyasa_is_emri_sevk.sql`: `ic_musteriler`,
  `ic_is_emirleri` (IE-YYYY-NNNN, sayaç `ic_is_emri_sira`, tetikleyici numaradan ÖNCE
  doğrular), `ic_sevkler`, bucket `ic-piyasa-belgeler`
  (`{company_id}/irsaliye/{is_emri_id}/...pdf`), denetim tetikleyicileri.
  Yetki: tablolar SADECE `ic_sayfa_yetkisi('ic_piyasa')` + şirket; kantarcı tablolara
  doğrudan erişemez → `kantar_ic_is_emirleri()`, `kantar_ic_son_sevkler()`,
  `kantar_ic_sevk_ekle(p_veri, p_kaydet)` (SECURITY DEFINER; `p_kaydet=false` kuru
  kontrol → uyarılar; aynı irsaliye no/ETTN ikinci kez girilemez; müşteri VKN'si
  kantarcıya gösterilmez, sadece "uyuşmuyor" uyarısı). Sevk INSERT politikası YOK.
  Sevk silme (hatalı giriş) sadece yetkili: önce kayıt, başarılıysa PDF.
  Yerel PG16 + PostgREST 12 ile uçtan uca test edildi (RLS, maskeleme, sayaç boşluğu,
  FK silme engelleri, storage politikaları).
- İrsaliye okuma: `lib/ic-piyasa/irsaliye-oku.ts` — tarayıcıda `unpdf@1.1.0` (pdf.js,
  dinamik import, ücretsiz, yapay zekâ yok). Logo e-İrsaliye PDF'lerinde gerçek metin var
  (örnekler IRS2026000002477/2468). Okunanlar: irsaliye no, tarih, ETTN, araç/dorse plaka,
  şoför ADI, alıcı VKN, kalemler (kg/ton → kg; Adet ise net okunmaz). **Şoför TCKN
  okunmaz/saklanmaz (KVKK).** Build'deki "Critical dependency: the request of a
  dependency is an expression" uyarısı pdf.js kaynaklı, zararsız.
  NOT: unpdf 0.x `canvas`'ı optionalDependency olarak kurar (Netlify'da yerel derleme
  riski) → 1.x seçildi (`@napi-rs/canvas` opsiyonel peer, kurulmaz).
- Kantar Paneli TEK EKRAN (revize 12.10.2026, kullanıcı isteği; sekme KALDIRILDI):
  ≥1536px (2xl) İhracat · DBA (sol, biraz geniş) ve Yurt İçi · İrsaliye (sağ) YAN YANA,
  her sütun kendi içinde kayar, sayfa kaymaz. <1536px alt alta tek kaydırma + üstte
  bölüme atlama düğmeleri (sayılarla), bölüm başlıkları yapışkan. 1280/1366'da yan yana
  denendi: ihracat tablosundaki DBA düğmesi taşıyordu → bilinçli olarak 1536. İHRACAT
  AKIŞININ İÇERİĞİ DEĞİŞMEDİ. Üstteki "Yenile" iki bölümü de yeniler.
  Bileşen: `components/kantar-yurt-ici.tsx` (dakikada bir + sekmeye dönünce yenilenir).
- CANLI DURUM (12.10.2026 03:15 kontrol): migration kullanıcı tarafından SQL Editor ile
  UYGULANDI; 3 tablo + 10 politika + bucket + 3 depo politikası + fonksiyonlar yerinde,
  anon RPC yetkisi yok. Rol testleri (canlıda, rollback'li): kantar@ tablolara 0 satır
  görür, sadece RPC; muhasebe@ hiçbirine erişemez. Netlify daca8f1 yayında.
- Gece yedeği: 3 tablo `YEDEKLENECEK_TABLOLAR`'a eklendi; `yedekleme-gonder` v10
  DEPLOY EDİLDİ. Deneme çalışması: 24/24 tablo, geri yükleme testi 24/24 birebir.
- Mesaj şablonları (12.10.2026): `supabase/functions/_shared/mesaj-sablonlari.ts` TEK KAYNAK
  (import yok; Next tarafı `lib/ic-piyasa/mesaj-sablonlari.ts` üzerinden yeniden dışa aktarır) —
  siparis_alindi, arac_cikis_saati, arac_yola_cikti, siparis_tamamlandi (UTILITY),
  haftalik_fiyat_formu (MARKETING, PDF ekli), cikis_onayi_talebi (ekip). Meta onayına
  kadar `elleGonderimMetni` (wa.me, link metin sonunda), sonra aynı gövde Meta şablonu
  + "Siparişim" URL düğmesi (`/takip/{token}`). `sablonKurallariniDenetle` Meta
  kurallarını denetler. Metin değişirse Meta'da yeniden onay gerekir; Burak Bey onayı
  olmadan değiştirilmez. Mesajlarda fiyat YOK (takip sayfasında).
- Sonraki fazlar: GPS ve Logo (GO3/Wings) entegrasyonu; Pazartesi fiyat listesi gönderimi
  (müşteri listesi Burak Bey'den gelecek); Meta WhatsApp Cloud API.

## İç Piyasa — Bildirimler, Müşteri Takip, Lojistik Çıkış Onayı (Parça 2, 12.10.2026)

- Migration `20261012200000_ic_piyasa_bildirim_cikis.sql` (kod push edilmeden ÖNCE canlıya
  uygulanmalı: sayfalar `takip_token`, `cikis_*` kolonlarını ve yeni `kantar_ic_son_sevkler`
  dönüşünü okur). İhracat tablolarına dokunmaz.
- `ic_piyasa_ayarlari` (şirket başına tek satır): lojistik adı/e-posta/telefon + yetkili
  e-posta. Bildirimler › Ayarlar kartından düzenlenir. Unex: Süleyman Bey,
  lojistik@unex.com.tr, 0553 268 91 01. Lojistik e-postası boşsa çıkış talebi `hata`
  durumunda kalır (ekranda görünür).
- `ic_bildirimler` = GİDEN MESAJ KUTUSU (outbox). Sadece tetikleyiciler/RPC'ler yazar;
  authenticated yalnızca durum/islem_zamani/isleyen/hata günceller. Metin SAKLANMAZ:
  şablon adı + `degerler` (sıralı dizi) saklanır, metin `mesaj-sablonlari.ts`'ten üretilir.
  - İş emri açılınca `siparis_alindi`, tamamlanınca `siparis_tamamlandi`, iptalde bekleyen
    müşteri mesajları `atlandi`.
  - Sevk girilince `cikis_onayi_talebi` → lojistiğe E-POSTA (otomatik, Resend,
    bildirim@ihracatasistanim.com) içinde tek dokunuşluk `/cikis/{cikis_token}` linki.
  - Çıkış: `ic_cikis_uygula` (tek kural yeri). "Çıktı" → müşteriye `arac_yola_cikti`
    (ilerleme metniyle); "Saat" → `arac_cikis_saati` (önceki saat mesajının yerine geçer);
    "Bugün değil" → yetkiliye e-posta. Çıktı bir kez işlenir (sonraki istekler `zaten`).
    İptal edilmiş iş emrinde çıkış işlenmez.
  - `ic_bildirim_zamanla`: planlanan saat gelince / 60 dk cevap yoksa lojistiğe hatırlatma;
    +30 dk (planlıda) veya 120 dk (bekleyende) hâlâ yoksa yetkiliye uyarı. Son 3 gün.
  - E-posta: `ic_bildirim_eposta_al` (skip locked) + `ic_bildirim_eposta_sonuc` (3 deneme,
    sonra `hata`).
- "Siparişiniz tamamlandı" tekrar koruması (migration `20261012220000`): iş emri yeniden
  açılınca BEKLEYEN tamamlandı mesajı atlanır; tekrar kapatılınca eskisi atlanıp güncel
  toplamlarla yenisi hazırlanır. Gönderilmiş mesaja dokunulmaz. Hiç sevki olmayan iş emri
  kapatılırsa tamamlandı mesajı hazırlanmaz.
- Uyarı e-postaları (cevap yok / bugün çıkmayacak) Alıcı + CC (kullanıcı kararı 12.10.2026:
  Alıcı execution@unex.com.tr, CC bbt@unex.com.tr). `ic_piyasa_ayarlari.yetkili_cc` (virgülle,
  boşluksuz, en fazla 5; CHECK), gönderim anında `ic_bildirim_eposta_al` `ic_bildirimler.cc`'yi
  doldurur (yalnız alici='yetkili'), edge function Resend'e `cc` verir. Lojistik e-postasında CC
  YOK. Migration `20261012210000_ic_piyasa_yetkili_cc.sql`.
- MÜŞTERİYE E-POSTA YOK (askıda kuralı). Müşteri mesajları WhatsApp kanalında `bekliyor`
  olarak durur; Meta onayına kadar Bildirimler sayfasından "WhatsApp'ta Gönder" (wa.me,
  ücretsiz) → "Gönderildi mi?" onayı ile işaretlenir. Telefon / WhatsApp izni yoksa uyarı.
  Sekmede bekleyen mesaj sayısı rozeti (`bildirimSayaciniYenile()` olayıyla tazelenir).
- Edge function `ic-piyasa` (verify_jwt AÇIK, anon anahtarla çağrılır; dosyalar `index.ts` +
  `../_shared/mesaj-sablonlari.ts`): `takip` (token → bilgi + 15 dk imzalı irsaliye PDF
  linkleri, depo yolu yanıtta yok), `cikis_bilgi`, `cikis_uygula`, `isle` (zamanla + e-posta
  kuyruğu, 20'şer). Token'lı RPC'ler (`ic_takip_bilgi`, `ic_cikis_token_*`) SADECE
  service_role. Token = 32 hex; biçim dışı token DB'ye gitmeden 404.
- pg_cron `ic-piyasa-bildirim` `*/2 * * * *` → `functions/v1/ic-piyasa` gövde
  `{"islem":"isle"}`, anon anahtar, timeout 30 sn (diğer işlerle aynı kalıp; komut
  `docs/felaket-kurtarma.md` adım 6).
- Girişsiz açık sayfalar (açık tema, logo, noindex): `/takip/[token]` müşteri sipariş takibi
  (durum zaman çizelgesi, araçlar + irsaliye PDF, ticari koşullar — fiyat SADECE burada,
  mesajlarda yok); `/cikis/[token]` lojistik mobil ekranı (Şimdi çıkıyor / Saat seç /
  Bugün çıkmayacak; ad isteğe bağlı, localStorage `ic-cikis-ad`). Çerçeve
  `components/genel-sayfa-cerceve.tsx`, API `lib/ic-piyasa/genel-api.ts`.
- İş Emirleri sayfası: Çıkış sütunu + yetkili adına çıkış işleme
  (`ic_cikis_isle_yetkili`), müşteri takip linki (aç/kopyala), iptal edilmiş iş emrini
  "araç kayıtlarıyla tamamen sil" (`ic_is_emri_tamamen_sil` → dönen PDF yolları SONRA
  depodan silinir). Müşteri silinemezse bağlı iş emirleri listelenir.
- Fiyat kalemleri/formları politikaları `ic_piyasa` yetkisine daraltıldı (kantarcı
  okuyamaz); `ic_fiyat_formu_hazirla` yetkiyi sayaçtan ÖNCE kontrol eder.
- Gece yedeği: `ic_bildirimler` normal tablo olarak; `ic_piyasa_ayarlari` (id kolonu YOK,
  anahtar company_id) pakete `_ic_piyasa_ayarlari` olarak girer (`AYAR_TABLOLARI`) — çünkü
  `yedek_geri_yukleme_testi` satırları `id` ile eşleştirir; id'siz tablo normal listeye
  konursa her gece "[UYARI]" çıkar (12.10.2026 deneme çalışması yakaladı).
- BİLİNEN EKSİK (felaket kurtarma): `scripts/yedekten-geri-yukle.mjs` `TABLO_SIRASI`'nda
  HİÇBİR `ic_*` tablosu yok (FBF'den beri). Veri gece yedeğinde VAR ama betik yüklemez.
  Eklemek basit değil: REST ile insert tetikleyicileri çalıştırır (FBF/IE numaraları
  yeniden verilir, iş emri insert'i yeni bildirim satırı üretir). Gerekirse SQL ile
  `set session_replication_role = replica` altında elle yüklenir. Ayrı iş olarak planlanmalı.
- CANLI DURUM (12.10.2026 04:55 TR): migration kullanıcı tarafından SQL Editor ile UYGULANDI
  (2 tablo, 7 çıkış kolonu, takip_token, 11 fonksiyon, 8 tetikleyici; token RPC'leri
  anon/authenticated'a kapalı doğrulandı). Netlify 3c5eb49 yayında. Edge function
  `ic-piyasa` v1 deploy (canlı test: geçersiz token 404, `isle` 200). `ic_piyasa_ayarlari`
  Unex satırı yazıldı. pg_cron `ic-piyasa-bildirim` (jobid 5) çalışıyor. `yedekleme-gonder`
  v12: deneme 26 tablo, geri yükleme testi 25/25, uyarı yok.
- 12.10.2026 10:15: `ic-piyasa` v3 ("Bugün çıkmayacak" e-postasında "Bildiren" satırı;
  CC canlıda uçtan uca test edildi). Prova kayıtlarının silinmesi için
  kullanıcıya korumalı SQL verildi (MCP üzerinden canlı DELETE izin vermiyor).
- Testler (scratchpad, yerel PG16 + PostgREST 12 + fonksiyon Node'da Deno taklidiyle):
  SQL, fonksiyon ve Playwright e2e (bildirim kutusu, çıkış mobil, takip mobil) geçti.

## İç Piyasa — Form silme ve düzenlenebilir şartlar (14.10.2026)

- Migration `20261014130000_ic_piyasa_form_sil_sartlar.sql` (SADECE ekleme).
  CANLIYA kod push'undan ÖNCE uygulanmalı: sayfa `FORM_SUTUNLARI` ile `sartlar`
  sütununu okur, sütun yoksa form listesi okunamaz.
- Form silme: "Oluşturulan Formlar"da çöp kutusu + onay penceresi. Kural
  (kullanıcı kararı): iş emrine bağlı form silinemez (`ic_fiyat_formu_silinebilir_mi`
  BEFORE DELETE tetikleyicisi, hata 23503 mesajı ekranda). Silinen formun tam
  kopyası `denetim_kayitlari`'nda (`denetim_ic_fiyat_formlari`). UPDATE yetkisi
  yine YOK; numara tekrar verilmez.
- Şartlar: `ic_piyasa_ayarlari.form_sartlari` (jsonb metin dizisi, 1-8 madde,
  5-500 karakter; `ic_sartlar_gecerli` kısıtı; NULL = varsayılan 4 madde,
  `VARSAYILAN_SARTLAR`). `{KDV}` = ürünlerin KDV seçimine göre cümle
  (`kdvCumlesi`). Onayda `{KDV}` çözülmüş hali `ic_fiyat_formlari.sartlar`'a
  DONDURULUR; PDF `formSartlari(form)` önce ona bakar, NULL (eski form) →
  varsayılan (gönderildiği metinle birebir). Varsayılanla aynı kayıt NULL yazılır.
  Uzun şartlar PDF'te 2. sayfaya geçer (bilinçli, sıkıştırma yok). Telefon
  görselinde şartlar yok.
- Sipariş takibi düzeltmesi (14.10.2026, kullanıcı onayı): IHR-2026-0095 tek
  seferlik açılmıştı → `ana_siparisler` UNEXOMG290926 (OM GENERAL TRADING, 500
  MTS) açılıp bağlandı; dosya kalemleri standart oransal kuralla 250 MTS /
  118.750 USD (10 FCL) yapıldı (önceki: 500 MTS / 237.500 USD; denetim kaydında).

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

## İç Piyasa — Fiyat formu sütun düzeni ve beyaz üst bant (15.10.2026)

- Migration `20261015100000_ic_piyasa_form_sutunlari.sql` (SADECE ekleme; kod
  push'undan ÖNCE uygulanır — sayfa `form_sutunlari`, `ozel_degerler`, `sutunlar` okur).
- Panel (Fiyat Tablosu): standart sütun başlıklarındaki göz düğmesiyle Ambalaj /
  Peşin / Vadeli / Vade / KDV / Teslim formda gösterilir/gizlenir (Ürün her zaman;
  peşin+vadeli birlikte gizlenemez). "Sütun Ekle" ile en fazla 3 serbest metin
  sütunu (başlık 2-24, değer ≤ 40 karakter). Gizli sütunun verisi SİLİNMEZ; panelde
  soluk görünür, formda çıkmaz ve zorunlu sayılmaz. Hepsi "Kaydet" ile.
- Veri: `ic_piyasa_ayarlari.form_sutunlari` ({gizli, ozel}; NULL = varsayılan),
  `ic_fiyat_kalemleri.ozel_degerler` ({id: metin}), onayda `ic_fiyat_formlari.sutunlar`
  + `kalemler[].ozel` DONDURULUR. Gizli fiyat forma null yazılır (iş emri önermesin).
  Ortak mantık `lib/ic-piyasa/fiyat-formu.ts` (`sutunAyariOku`, `sutunGorunur`,
  `formKalemleri(satirlar, ayar)`, `satirEksigi(k, ayar)`).
- PDF: varsayılan düzende (eski formlar dahil) ESKİ sabit sütun konumları birebir;
  aksi halde `tabloDuzeni` metin sütunlarını paylaştırır, fiyatlar sağa yaslı. Vade
  ve KDV fiyatın altındaki küçük yazıdadır (gizliyse düşer). Telefon görselinde
  ambalaj etiketi / alt satır (teslim + "Başlık: değer") / KDV satırı ayara göre.
- Üst bant (PDF + devam sayfası + telefon görseli) BEYAZ, yazılar lacivert, logo
  karosuz (Burak Bey, mockB seçildi). Seftali şerit ve alt lacivert bant aynı.

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
  genişliği ~%0,4 fark). Sayfa 2'de her ürün kendi satırında ("1) …"). Sığmazsa
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
- Testler (scratchpad): okuyucu 25 kontrol (3 gerçek DBA + 5 DBA olmayan PDF + 13 bozuk +
  yükleten boş), SQL 49 kontrol + eşzamanlılık, edge function 32 (yerel PG + Node), görev 25
  (pwsh 7, tr-TR kültürü). Windows'a özel kısımlar (DPAPI, Görev Zamanlayıcı, icacls) sadece
  ayrıştırıcıyla kontrol edildi; kurulum betiği her adımı doğrulayıp raporlar.

## Genel çalışma prensibi

- Değişiklik küçük/nettse direkt yap, geniş kapsamlı/geri alınamaz bir şeyse
  önce sor.
- Bir önceki oturumdan/chat'ten gelen bağlam (özet nedeniyle) eksik olabilir —
  emin olmadığın proje detayı varsa (örn. "bu migration uygulandı mı", "bu
  bundle'ı nasıl uyguluyorsun") tahmin etme, kullanıcıya sor ya da bu dosyayı
  güncel tut.
