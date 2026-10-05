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
- Bilerek bırakılanlar: performans uyarıları (19 dosyada etkisiz), depoda
  hiçbir kayda bağlı olmayan ~35 MB PDF (silme kullanıcı kararı bekliyor).

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
- Canlıdaki sürüm repodaki koddur (Supabase v4, 05.10.2026). Fonksiyonu değiştirince
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
- AÇIK KONU (kullanıcı kararı bekliyor): DBA / Draft BL / fatura / konşimento /
  irsaliye yeniden yüklenince ESKİ dosya depodan silinmiyor (28 sahipsiz DBA
  ≈17 MB). Düzeltme yapılırsa sıra CLAUDE.md kuralına uyar: yeni dosya yükle →
  DB güncelle ve kontrol et → SADECE başarılıysa eski dosyayı sil.

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

## Genel çalışma prensibi

- Değişiklik küçük/nettse direkt yap, geniş kapsamlı/geri alınamaz bir şeyse
  önce sor.
- Bir önceki oturumdan/chat'ten gelen bağlam (özet nedeniyle) eksik olabilir —
  emin olmadığın proje detayı varsa (örn. "bu migration uygulandı mı", "bu
  bundle'ı nasıl uyguluyorsun") tahmin etme, kullanıcıya sor ya da bu dosyayı
  güncel tut.
