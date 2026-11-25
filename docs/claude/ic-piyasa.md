# İç Piyasa — Claude notları

> 02.11.2026: CLAUDE.md'den bölünerek taşındı, metin DEĞİŞTİRİLMEDİ (bölüm sırası korunur).
> Bu konudaki yeni notlar bu dosyaya eklenir. Proje çapındaki kurallar kök `CLAUDE.md`'de.

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
  kutusu; ürün-fiyat tablosu; BİLGİLENDİRME VE SEVKİYAT ŞARTLARI (4 madde,
  `formSartlari`: 2. madde ürünlerin KDV seçimine göre yazılır, 3. madde geçerlilikle
  çelişmeyecek şekilde netleştirildi — kullanıcı onayı); SİPARİŞ SÜRECİ zaman çizelgesi
  (`SIPARIS_SURECI`, 4 adım: Sipariş Onayı → Yükleme ve Tartım → Yola Çıkış → Teslim ve
  Kapanış; sistemdeki gerçek bildirim akışıyla birebir); alt bilgi: Sipariş ve bilgi
  (Burak Tuncay) + sertifikalar. KAŞE / İMZA ALANI YOK (her iki taraf için, kullanıcı
  kararı). Başlıkta "İç Piyasa" yazısı YOK (11.10 ve 12.10 kararı). 7 ürüne kadar tek
  sayfa (gerekirse satırlar 11→10 mm sıkışır), daha uzunda bölüm sonraki sayfaya geçer.
  Eski tasarım: 3 bilgi kartı + geçerlilik kutusu (11.10.2026), yerine geçti.
- ÖZEL GÜN BANDI KALDIRILDI (23.10.2026, kullanıcı kararı: "çok gereksiz, doğru
  çalıştıramıyoruz"). 12.10'da eklenen bayram/kandil kutlama bandı önceden kutlama
  yapıyordu (FBF-2026-0009, onay 23.10 → "29 Ekim ... kutlu olsun"); aynı gün denenen
  "resmî tatil bilgisi" satırı da beğenilmedi. `lib/ic-piyasa/ozel-gunler.ts` SİLİNDİ;
  PDF, telefon görseli ve paneldeki bilgi satırı kaldırıldı. GERİ EKLENMEZ. Eski formlar
  yeniden indirilince bantsız çizilir (veri değişmedi, DB'de alan yoktu).
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
  `ic_piyasa` yetkisi buraktuncay@ ve eski kişisel adres için açık. Canlı test: boş
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
- Görüntü (taranmış) irsaliye PDF'i (22.10.2026, canlıda ilk Bonkalit aracı): PDF metin
  değil resimse okunamaz (AI/OCR YOK, bilinçli). O zaman pencerede plaka/net/dorse'nin
  yanında "İrsaliye no" alanı da çıkar (A-Z0-9, 3-20, büyük harf; boş bırakılabilir →
  sunucu "İrsaliye numarası okunamadı" uyarısı verir, eski davranış). Dosya adı ETTN ise
  (`XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.pdf`, "(1)" eki olabilir) ETTN dosya adından
  alınır → mükerrer irsaliye kontrolü yine çalışır. Okunan değer varsa elle alan GİZLİ.
  RPC değişmedi (irsaliye_no/ettn zaten p_veri'den geliyordu). irsaliye_no, araç yola
  çıktı mesajında kullanılır — bu yüzden elle girilmesi önemli.
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
  kadar `elleGonderimMetni` (wa.me), sonra aynı gövde Meta şablonu. 22.10.2026'dan
  beri müşteri mesajlarında bağlantı/düğme YOK (aşağıdaki 22.10.2026 bölümü). `sablonKurallariniDenetle` Meta
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
  - `ic_bildirim_zamanla`: planlanan saat gelince / 60 dk cevap yoksa lojistiğe hatırlatma
    (tek sefer). Son 3 gün. Yetkiliye "Cevap yok / Lojistikten çıkış cevabı gelmedi"
    (`cikis_cevap_yok`) uyarısı 09.11.2026 kullanıcı talebiyle KAPATILDI ("Bize ilave bir
    bilgilendirme gelmesin"; migration `20261109200000`). Geri açmadan önce kullanıcıya sor.
    Şablon edge'de duruyor ama artık üretilmiyor; `cikis_uyari` kolonu kullanılmıyor.
  - E-posta: `ic_bildirim_eposta_al` (skip locked) + `ic_bildirim_eposta_sonuc` (3 deneme,
    sonra `hata`).
- "Siparişiniz tamamlandı" tekrar koruması (migration `20261012220000`): iş emri yeniden
  açılınca BEKLEYEN tamamlandı mesajı atlanır; tekrar kapatılınca eskisi atlanıp güncel
  toplamlarla yenisi hazırlanır. Gönderilmiş mesaja dokunulmaz. Hiç sevki olmayan iş emri
  kapatılırsa tamamlandı mesajı hazırlanmaz.
- Uyarı e-postaları (bugün çıkmayacak; cevap yok kapalı) Alıcı + CC (kullanıcı kararı 12.10.2026:
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

## İç Piyasa — Sipariş Formundan İş Emri (21.10.2026)

- Süreci başlatan belge: müşteriyle imzalanan Unex Excel şablonu "SİPARİŞ FORMU" PDF'i
  (örnek: Alize - Kırık Buğday - 14.10.2026; GERÇEK metin katmanı var). İş Emirleri
  sayfasında ana düğme **"Sipariş Formundan Aç"** (`components/ic-siparis-formu-penceresi.tsx`),
  yanında eski "Yeni İş Emri" (elle) durur.
- Okuma `lib/ic-piyasa/siparis-formu-oku.ts` (saf, YAPAY ZEKÂ YOK, tarayıcıda unpdf):
  etiket solda / değer aynı satırda sağda → KONUMA göre; seçimler (ürün cinsi, nakliye,
  ödeme) "✔" (✓ ☑ ✅ veya tek "X") işaretinin hemen sağındaki metin. Ürün adı
  `urunAdi` (K.BUĞDAY → "Kırık Buğday", BASLANGIC_URUNLERI yazımı). Miktar TON/KG → kg;
  fiyat TL/KG (TL/TON → /1000 + uyarı; döviz → boş + uyarı); "+ KDV" → hariç, "KDV DAHİL"
  → dahil, yazmıyorsa null + uyarı; Vadeli → "… 30 Gün" → 30, Peşin → 0. Yetkili satırında
  e-posta varsa e-posta sayılır. Şüphede alan BOŞ + `uyarilar` (tahmin yok). Metin yoksa
  (`metin_yok`, taranmış) / başlık yoksa (`form_degil`) → müşteri listeden seçilir, form
  yine eklenir, alanlar elle. Testler: gerçek form + 36 varyant (scratchpad `sf/test.ts`).
- Müşteri (kullanıcı kararları 21.10.2026): eşleşme önce VKN, sonra ünvan (`katla`; iki aynı
  ünvanda eşleşme yok). Kart yoksa formdaki bilgilerle yeni kart önerilir, **WhatsApp izni
  KAPALI gelir** (kullanıcı işaretler). Kart varsa farklar tablosu; kart SADECE "kartı
  güncelle" işaretlenirse ve SADECE farklı + formda dolu alanlarla güncellenir
  (`musteriKartiFarklari`; boş form alanı kartı silmez). Aynı müşteri + form tarihi + ürünle
  açık iş emri varsa mükerrer uyarısı (engellemez).
- İş emri formu (`components/ic-is-emri-form.tsx`, `onDolum` prop): okunanlar alanlara
  yazılır, kullanıcı onaylayınca kaydedilir. Nakliye Alıcıya → "Fabrika Teslim", Satıcıya →
  "Adrese Teslim" (`nakliyedenTeslim`); formda ödeme aracı olmadığı için Ödeme BOŞ gelir
  (amber uyarı). Yeni "Sipariş Formu" bölümü düzenlemede de var: form ekle/değiştir/kaldır,
  sipariş tarihi, nakliye, teslim süresi, ürün özellikleri (≤20; ad ≤40, değer ≤60).
  Ürün özellikleri SADECE iş emrinde; kantar paneli DEĞİŞMEDİ (kullanıcı kararı).
- PDF: `ic-piyasa-belgeler/<şirket>/siparis/<uuid>.pdf`. Sıra: (değişiyorsa eski yol kayıttan
  TAZE okunur) → PDF yüklenir → kayıt; kayıt olmazsa yeni PDF geri silinir; başarılıysa eski
  PDF silinir. İş emri "Sil" sonrası ve `ic_is_emri_tamamen_sil` (artık form yolunu da
  döndürür) sonrası PDF depodan silinir.
- Migration `20261021100000_ic_piyasa_siparis_formu.sql` (SADECE ekleme + izin daraltma;
  kod push'undan ÖNCE): `ic_is_emirleri.siparis_tarihi / nakliye (alici|satici) /
  teslim_suresi_gun / urun_ozellikleri (jsonb dizi ≤20) / siparis_formu_yolu (kendi
  şirketinin siparis/ klasörü, .pdf, ".." yok — CHECK) / siparis_formu_adi`. Depo:
  `siparis/` yalnız ic_piyasa yükler; **kantarcı artık SADECE `irsaliye/` okur** (önceden
  şirket klasörünün tamamını okuyabiliyordu; sipariş formunda fiyat var). Yerel PG'de 39
  migration + yeni migration 2 kez + 19 izin/kısıt testi geçti.
- Testler: okuyucu 37, yardımcılar 17 (`sf/yardimci_test.ts`), Playwright 42 (`sf/e2e.py`:
  yeni müşteri, farklı kart, kayıt hatasında PDF geri silme, form olmayan PDF, 390 px).
- TEK ADIM (22.10.2026, kullanıcı: "bütün bilgiler formda, neden iki kere iş yapıyoruz"):
  okunan bilgiler AYNI pencerede düzenlenebilir alanlar (ürün, ambalaj, ton, fiyat, KDV,
  vade, ödeme aracı [isteğe bağlı, uyarısız], nakliye→teslim, teslim süresi, tarih);
  tek "İş Emrini Aç" / "Müşteri Kartını Oluştur ve İş Emrini Aç" → kart (gerekirse) →
  PDF → iş emri (`lib/ic-piyasa/is-emri-ac.ts` `isEmriniFormlaAc`; kayıt olmazsa PDF
  geri silinir). Kart oluştuktan sonra iş emri hata verirse kart SEÇİLİ kalır, tekrar
  denemede ikinci kart açılmaz. İkinci pencere (tam iş emri formu) SADECE okunamayan
  PDF'te ("İş emrini hazırla"). Not / talimat / özellik düzeltme açıldıktan sonra
  "Düzenle"den. Playwright `sf/e2e2.py` 24/24.

## İç Piyasa — Bağlantısız müşteri mesajları, irsaliye paylaşımı, müşteri detayı (22.10.2026)

- Müşteri WhatsApp mesajlarında BAĞLANTI YOK (kullanıcı onayı: "ihracatasistanim"
  alan adı müşteriye tutarsız görünüyordu). `mesaj-sablonlari.ts`'ten siparis_alindi,
  arac_cikis_saati, arac_yola_cikti, siparis_tamamlandi'nın "Siparişim" düğmesi
  kaldırıldı; gövde sonları buna göre yazıldı. `cikis_onayi_talebi` (şirket içi) çıkış
  bağlantısını KORUR. `takip/` sayfası ve `takip_token` duruyor (Bildirimler'de iç
  "Takip sayfası" bağlantısı). Edge function bu şablonları gönderimde kullanmıyor
  (Meta yok) → yeniden yayın gerekmedi. Meta'ya gönderilirken: `meta_ust` alanı —
  üç şablonda Unex logolu GÖRSEL başlık, arac_yola_cikti'de BELGE başlık (irsaliye
  PDF'i). Logo ayrıca gönderen numaranın WhatsApp profil fotoğrafı olmalı. Metinler
  Burak Bey'e bildirilmeli (CLAUDE.md kuralı; Meta'ya henüz gönderilmedi).
- Bildirimler › "Aracınız yola çıktı": `ic_bildirimler.sevk_id → ic_sevkler` ile
  irsaliye okunur. Cihaz dosya paylaşımını destekliyorsa (telefon, WhatsApp masaüstü
  uygulaması) "Paylaş (mesaj + irsaliye)" → `navigator.share({files,text})`, sonra
  "gönderdiniz mi?" onayı. Desteklemiyorsa (WhatsApp Web) "WhatsApp'ta Gönder" +
  "İrsaliyeyi indir" (dosya adı irsaliye no) + "PDF'i sohbete sürükleyin" yönergesi.
- Müşteriler: satırdaki kalem → "Detay" (satıra tıklamak da açar). Sağ panel
  `components/ic-musteri-detay.tsx` (yalnız okur): kart bilgileri, özet (iş emri / açık /
  sevk ton / araç), iş emirleri (sipariş tarihi, ilerleme, durum, sipariş formu PDF),
  son 10 araç (çıkış durumu, irsaliye PDF). Düzenle / Sil panelden; Esc önce üstteki
  pencereyi kapatır.
- Mükerrer kart engeli `musteriMukerrer` (`lib/ic-piyasa/siparis-formu.ts`): aynı ünvan
  (`katla`, Türkçe harf/noktalama farkı yok) veya aynı telefon başka kartta (pasif dahil)
  varsa yeni kart AÇILMAZ. Müşteriler formunda uyarı; sipariş formu penceresinde mevcut
  aktif kart seçilir, kullanıcı farkları görüp tekrar onaylar (pasifse aktifleştirme
  istenir). Testler: yardımcılar 23, Playwright `sf/e2e3.py` (detay, mükerrer, paylaşım).
- İletişim satırı (22.10.2026, kullanıcı: müşteri soruları Süleyman Bey'e gitsin):
  `iletisim: true` olan 4 müşteri şablonunda alt bilgiden önce "Sorularınız için
  lojistik sorumlumuz {ad}: {telefon}" (`iletisimSatiri`). Ad/telefon Bildirimler ›
  Ayarlar'daki KAYITLI lojistik sorumlusundan; biri boşsa satır yazılmaz. DB/SQL değişmedi.
  Meta'ya geçişte govdeye değişken olarak eklenecek. Kalıcı çözüm önerisi: ortak şirket
  WhatsApp Business numarası (logolu profil, Süleyman Bey + yetkili bağlı cihaz).
- Sipariş formu YENİ SÜRÜM (21.10.2026, Bonkalit): fiyat etiketi "Ürün Kg Fiyatı"
  (değer "15,90 TL", birim etiketten → TL/kg, KDV yazmaz → uyarı, varsayılan KDV Hariç);
  sağ etiket sütunu x≈313. Özellik tablosunda çok satırlı etiket ("HCL'de / Çözülmeyen /
  Kül") ve sola taşan değer (Aflatoksin x≈93): etiket sütunu = bölgedeki en küçük x,
  değer = +40pt sağı; hizalı olmayan etiket satırı bloğu değere en iyi ortalayan satıra
  bağlanır. Okuyucu testleri 45 (`sf/test.ts` 9. bölüm, `sf/bonkalite.pdf`).

## İç Piyasa — Açılış İş Emirleri, Ana Panel düzeni, tek ekran Bildirimler (22.10.2026)

- Menüdeki "İç Piyasa" artık `/ic-piyasa/is-emirleri`'ne gider (sidebar `isActive`: tüm
  `/ic-piyasa` alt sayfalarında aktif); `ilkErisilebilirSayfa` da oraya. Sekme sırası:
  İş Emirleri · Bildirimler · Müşteriler · Fiyat Formu. Fiyat Formu adresi `/ic-piyasa`
  olarak KALDI (yer imleri bozulmasın).
- İş Emirleri = Ana Panel düzeni: tablo (İş Emri No + durum · Müşteri + fiyat/vade · Ürün +
  ambalaj/teslim · Sipariş tarihi + teslim süresi · Yükleme ilerleme çubuğu · Araçlar + çıkış
  bekleyen · İşlemler [sipariş formu ikonu, Detay]) + altında DURUM ADIMLARI satırı
  (Sipariş Formu → Müşteriye Bildirildi [siparis_alindi gönderildi; bekliyorsa amber] →
  Yükleme %/araç → Yola Çıktı x/y → Tamamlandı; irsaliye uyarısı, "n mesaj gönderilmeyi
  bekliyor" → Bildirimler, yüklenen tutar). Satıra / Detay'a tıklayınca eski detay (bilgiler,
  araç tablosu, çıkış işleme, Düzenle/Kapat/İptal/Sil) aynı tabloda açılır — işlev kaybı yok.
  Bildirim durumu için `ic_bildirimler` (is_emri_id, sablon, durum, kanal) okunur; okunamazsa
  adımlar gri kalır.
- Bildirimler TEK EKRAN (sekmeler kaldırıldı): 3 özet kutu (Gönderilecek / Bugün Gönderilen /
  E-posta Sorunu) → "Gönderilecek Mesajlar" kartları (davranış aynı) → "Bildirim Akışı":
  WhatsApp (gönderilen/atlanan) + şirket içi e-postalar tek tabloda (Kanal, Mesaj, İş emri,
  Alıcı + Müşteri/Lojistik/Yetkili, Oluşturma, Durum, İşlem); filtre Tümü / WhatsApp /
  Şirket içi e-posta / Sorunlu (hata veya yeniden denenen e-posta) + arama (iş emri, müşteri,
  plaka, alıcı). Mesaj kutusu max-h 22rem (iletişim satırı görünsün). Veri/SQL değişmedi.
- Bildirim Akışı satırına tıklayınca (22.10.2026, kullanıcı isteği) altında ayrıntı açılır
  (aynı anda tek satır): WhatsApp → müşteriye giden METİN (`elleGonderimMetni`, kayıtlı
  `degerler` + güncel şablon + iletişim satırı; "şablon sonradan değiştiyse küçük fark
  olabilir" notu — metin DB'de saklanmadığı için) + telefon + "Metni kopyala"; e-posta →
  Alıcı, CC (`ic_bildirimler.cc`), Plaka/Sipariş/Ürün/Net (+ Planlanan saat / Bildiren),
  deneme sayısı (alan sırası edge function `epostaOlustur` ile aynı). Lojistiğin tek
  kullanımlık çıkış bağlantısı GÖSTERİLMEZ (tıklanırsa çıkış işlenebilir).
- Testler: `sf/e2e5.py` (menü, sekme sırası, tablo, adımlar, detay, mobil; tek ekran filtre/
  arama). `sf/e2e.py`'nin "okunanlar" iki kontrolü TEK ADIM'dan (b16aa95) beri eskidir
  (okunanlar artık giriş alanlarında; `e2e2.py` kapsar).

## İç Piyasa — Sistem öncesi (geçmiş) araç kaydı ve sipariş listesi eşitleme (23.10.2026)

- Amaç (kullanıcı): Burak Bey'in Excel "Sipariş Listesi" ile sistemi eşitlemek. Belgeler
  farklı olabilir (Unex sipariş formu / müşterinin sipariş yazısı, ör. Trakya Birlik
  ASA0006704 / sadece WhatsApp mesajı) → elle "Yeni İş Emri": her PDF "Sipariş Formu"
  olarak eklenebilir, sipariş no "Müşteri sipariş no"ya, mesaj metni Notlar'a. Fiyat boş
  bırakılabilir (Artı Grup TMO buğday, fiyat sonra). Bu müşteriler siparişten haberdar →
  açılışta oluşan "Siparişiniz alındı" mesajı Bildirimler'de "Atla" (kullanıcı kararı).
- Sistem öncesi yüklenen araçlar (kullanıcı kararı: "bildirimsiz geçmiş araç"): İş emri
  detayında "Sistem öncesi araç ekle" (`components/ic-gecmis-sevk-penceresi.tsx`, sadece
  AÇIK iş emri). İrsaliye PDF'i ZORUNLU (kolon NOT NULL; okunabiliyorsa plaka / net /
  irsaliye no / tarih / ETTN dolar, görüntü PDF'te elle; ETTN dosya adından da alınır),
  yükleme tarihi (bugün veya geçmiş ≤365 gün), irsaliye no zorunlu. Sıra: PDF depoya →
  RPC; RPC hata verirse PDF geri silinir.
- Migration `20261023100000_ic_piyasa_gecmis_sevk.sql` (SADECE ekleme; KOD PUSH'UNDAN ÖNCE —
  İş Emirleri araç tablosu ve müşteri detayı `gecmis` kolonunu okur): `ic_sevkler.gecmis`
  (varsayılan false; sadece `ic_gecmis_sevk_ekle` true yazar, sonradan değişmez).
  `ic_sevk_koru`: geçmişte `cikis_durumu='cikti'`, `cikis_isleyen='Sistem öncesi kayıt'`.
  `ic_bildirim_sevk`: geçmişte ERKEN ÇIKIŞ → lojistik e-postası YOK; çıkış hiç işlenmediği
  için müşteriye "yola çıktı" mesajı da YOK. `ic_gecmis_sevk_ekle(p_veri)` SECURITY DEFINER,
  yalnız `ic_piyasa` + kendi şirketi (kantarcı/anon kapalı); kantarla aynı plaka/net/
  mükerrer irsaliye no-ETTN/dosya yolu kuralları; zaman = girilen günün 12:00 (TR) →
  olusturma / irsaliye_tarihi / cikis_zamani. Ekranda geçmiş araçta SAAT YAZILMAZ
  (`cikisEtiketi` `gecmis` → "Yola çıktı"), "Sistem öncesi" rozeti. İlerleme, tutar,
  kantar listesi ve sonraki müşteri mesajları geçmiş araçları SAYAR (eşitlemenin amacı).
- Testler: yerel PG (migration 2 kez, 14 senaryo: bildirimsizlik, normal kantar sevki
  hâlâ bildirim üretir, yetki, mükerrer, tarih, kapalı iş emri, bayrak kilidi, anon),
  Playwright `sip/gecmis_e2e.py` 24 (metin + görüntü irsaliye, hatada PDF geri silme, mobil);
  e2e2/e2e3/e2e5 regresyon geçti.

## İç Piyasa — Müşteriye e-posta kanalı, irsaliye ekli (23.10.2026)

- KARAR (kullanıcı, 23.10.2026): WhatsApp'ı olmayan müşterilere (Trakya Birlik, Tarım Kredi —
  sadece e-posta var) mesajlar e-postayla, "yola çıktı"da irsaliye PDF'i EKLİ, tam otomatik.
  01.10.2026 "müşteriye sistemden e-posta ASKIDA" kuralı İÇ PİYASA müşteri bilgilendirmeleri
  için şu şartla kalktı: gönderen KENDİ alan adımız (unex.com.tr, Resend'de doğrulanmış;
  ücretsiz planda 3 alan adı) + ayardan AÇIKÇA açılmadıkça hiçbir müşteri e-postası
  sistemden gitmez. İhracat (draft onay vb.) için askı kuralı AYNEN geçerli.
- Kanal kuralı TEK YER `ic_bildirim_ekle` (migration `20261023120000_ic_piyasa_musteri_eposta.sql`):
  alici='musteri' → müşteri WhatsApp'lı (telefon + izin) ise WhatsApp (değişmedi); değilse
  kartta geçerli tek e-posta varsa kanal='eposta', hedef=e-posta; ikisi de yoksa eskisi gibi
  WhatsApp (ekranda "telefon yok"). Müşteriler listesinde "E-posta" rozeti aynı kuralla.
- Ayarlar (`ic_piyasa_ayarlari`): `musteri_eposta_gonderen` (UI yalnız @unex.com.tr kabul eder),
  `musteri_eposta_cc` (≤5; kullanıcı: bbt@, execution@, lojistik@), `musteri_eposta_aktif`
  (varsayılan false; gönderen yoksa açılamaz — CHECK), `musteri_eposta_aktif_zaman`
  (tetikleyici yazar: false→true anı, kapatınca null; istemci yazamaz).
- Kuyruk `ic_bildirim_eposta_al`: müşteri e-postası SADECE aktif + gönderen var + satır
  `olusturma >= aktif_zaman` ise alınır → açmadan önce biriken eski mesajlar ASLA toplu
  gitmez (ekranda "Outlook ile gönder" ile elle). CC müşteri için `musteri_eposta_cc`'den.
  `ic_musteri_eposta_bilgi(p_id)` (SADECE service_role): gönderen, yanıt (lojistik e-postası),
  iletişim, irsaliye yolu/no. `ic_musteri_eposta_deneme()` (ic_piyasa yetkisi): deneme için.
- Edge function `ic-piyasa` v4 (23.10.2026 deploy; v3 repo ile birebir doğrulandıktan sonra):
  müşteri e-postası `from: "Unex Gıda <gönderen>"`, `reply_to` lojistik, HTML + text,
  "yola çıktı"da irsaliye PDF'i depodan service_role ile okunup base64 EK (`<irsaliye no>.pdf`);
  irsaliye yoksa / okunamazsa e-posta GÖNDERİLMEZ (hata, 3 deneme). Hedef CC'de de varsa
  CC'den düşer. `islem:"musteri_deneme"`: kullanıcı JWT'si ile `/auth/v1/user` → SADECE
  kullanıcının KENDİ adresine "[DENEME]" e-postası (son irsaliye ekli); anon anahtarla 401.
  Şirket içi e-postalar DEĞİŞMEDİ (bildirim@ihracatasistanim.com).
- Metin TEK KAYNAK `_shared/mesaj-sablonlari.ts`: `musteriEpostaKonusu` (konu: "Aracınız yola
  çıktı · IE-… · plaka · İrsaliye …"), `musteriEpostaMetni` (WhatsApp gövdesi + iletişim satırı
  + "Saygılarımızla, Unex Gıda…"), `musteriEpostaHtml` (lacivert/şeftali kurumsal şablon,
  "Etiket: değer" satırları tablo; BAĞLANTI ve GÖRSEL YOK — logo ihracatasistanim.com'dan
  yüklenirdi). Telefon WhatsApp'la aynı biçim (0553 268 91 01).
- Bildirimler: e-posta kanalı müşteri mesajı, otomatik gönderim kapalıyken (ya da açılıştan
  önce oluşmuşsa) "Gönderilecek Mesajlar"da kart: Alıcı / CC / Konu / Ek + "Outlook ile gönder"
  (mailto: to, cc, subject, body — Türkçe karakterli; gizli `<a>` ile açılır) + "İrsaliyeyi
  indir" + "Gönderildi mi?" onayı / Atla. Açıkken akışta "Otomatik gönderilecek". Ayarlar >
  "Müşteri e-postası": gönderen, CC, Kaydet, "Deneme e-postası (kendime)", "Otomatik
  gönderimi aç" (ConfirmDialog) / "kapat". Akış filtresi "Şirket içi e-posta" → "E-posta".
  Sekme rozeti ve İş Emirleri "n mesaj bekliyor" müşteri e-postasını da sayar.
- AÇMA ADIMLARI (kullanıcı): Resend > Domains > unex.com.tr ekle → verdiği DKIM (TXT
  `resend._domainkey`) + `send` alt alan MX/TXT kayıtlarını DNS'e gir → Verify → (API anahtarı
  yalnız ihracatasistanim.com'a kısıtlıysa "Full access" anahtar) → Bildirimler > Ayarlar >
  Deneme → gelen kutusu kontrolü → Otomatik gönderimi aç. Kök SPF'teki ÇİFT kayıt sorunu
  (01.10.2026 tespiti) Resend'i engellemez (Resend `send.unex.com.tr` kullanır, DKIM ile
  hizalanır) ama günlük Outlook postası için ayrıca düzeltilmeli.
- Testler: yerel PG 15 senaryo (`sip/eposta_test.sql`), edge function Node + sahte Resend 21
  (`edge3/test.mjs`: ek birebir, CC, hata durumlarında e-posta gitmez, şirket içi değişmedi,
  deneme yalnız kendine), Playwright 29 (`sip/eposta_e2e.py`), e2e2/3/4/5/8 + gecmis_e2e regresyon.

## İç Piyasa — ALIŞ siparişleri, Gelen Araç, Sipariş Raporu (30.10.2026)

- Kullanıcı: "İç piyasa kısmını artık bizimle eşitlemek istiyorum. Hem satış hem alış var." Kaynak:
  lojistiğin günlük Excel'i (`27.10.2026_SİPARİŞ ALIM RAPORU.xlsx`, her gün bir sayfa, üstte SATIŞ altta
  ALIŞ SİPARİŞ RAPORU, tamamlanan satır YEŞİL, sevk/teslim miktarı formülle "=87620+165940+…").
  Gerçek Excel repoda YOK (müşteri/fiyat verisi; scratchpad `icpiyasa/in/`).
- Kararlar (30.10.2026, AskUserQuestion): teslim alınan aracı KANTARCI girer; TMO'dan çekilip DOĞRUDAN
  müşteriye giden araç TEK kayıtla iki tarafa sayılır; alış fiyatı/tedarikçi AYRI yetki `ic_alis`;
  ilk teslimat = alış + rapor + (onaylı) ilk eşitleme. Tespit: 27.10'da Artı Grup satışı sevk 157.540 =
  Pınarhisar TMO alışı teslim 157.540 → aynı araçlar iki tabloya ayrı ayrı yazılıyordu.
- Migration `20261030100000_ic_alis.sql` (SADECE ekleme; satış/ihracat tablolarına DOKUNMAZ; KOD PUSH'UNDAN
  ÖNCE canlıya uygulanmalı — yoksa Alış sayfası "okunamadı" der, Kantar'daki bölüm sessizce gizlenir):
  `ic_tedarikciler` (ünvan tekil `upper(btrim)`; VKN tekil), `ic_alis_siparisleri` (AS-YYYY-NNNN, sayaç
  `ic_alis_sira`, tetikleyici `ic_alis_hazirla` numaradan ÖNCE doğrular; miktar_kg, birim_fiyat 4 hane +
  para_birimi TRY/USD/EUR, kdv, vade_gun, termin, teslim adresten|fabrika, depo, urun_kodu),
  `ic_alis_teslimler` (her araç / parti; `gecmis` = sistem öncesi PARTİ: plaka boş olabilir ve 60 ton araç
  sınırına tabi değil [Excel'de 105.740 tek terim], ≤5.000 ton; normal araç ≤60.000 kg; `sevk_id` UNIQUE →
  `ic_sevkler` ON DELETE SET NULL; kayıt DEĞİŞMEZ — `ic_alis_teslim_koru`, yalnız FK'nin sevk_id'yi
  NULL'lamasına izin verir). RLS: tablolar SADECE `ic_sayfa_yetkisi('ic_alis')` + şirket; teslim
  INSERT/DELETE politikası YOK (yalnız fonksiyonlar).
- Fonksiyonlar: `kantar_ic_alis_siparisleri()` / `kantar_ic_alis_son_teslimler(p_gun)` (kantar VEYA
  ic_alis; FİYATSIZ; tedarikçi adı AÇIK — müşteri değil, araç hangi depodan geliyor bilinmeli),
  `kantar_ic_alis_teslim_ekle(p_veri, p_kaydet)` (kuru kontrol/kayıt; plaka 12 saat kontrolü BOŞLUKSUZ
  karşılaştırır; %5 aşım uyarısı; irsaliye no/ETTN alış tarafında tekil). DOĞRUDAN SEVK (`is_emri_id`
  dolu): irsaliye PDF ZORUNLU ve SATIŞ klasöründe (`{şirket}/irsaliye/{is_emri_id}/…`); satış kaydı
  mevcut `kantar_ic_sevk_ekle()` ile AÇILIR (aynı kurallar, aynı lojistik çıkış onayı/müşteri bildirimi
  akışı), satış uyarıları "Satış: …" önekiyle birleşir, iki kayıt aynı işlemde bağlanır.
  `ic_alis_gecmis_teslim_ekle(p_veri)` (yalnız ic_alis; tarih bugün/≤365 gün, TR 12:00),
  `ic_alis_teslim_sil(p_id)` (dönen yol SONRA depodan silinir; doğrudan sevkte PDF satışa ait → null,
  satış kaydı İş Emirleri'nden ayrıca silinir), `ic_alis_belge_okunabilir` (alış yetkilisi bağlı satış
  irsaliyesini okuyabilsin). `ic_belge_silinebilir` GENİŞLETİLDİ (eski koşullar aynen + alış), depo
  politikaları `ic_belge_insert/select` yeniden oluşturuldu (eski koşullar aynen + `alis/` klasörü).
  Süper adminlere (execution@, bbt@) `ic_alis` yetkisi verilir.
- Arayüz: menü "Yurt İçi › İç Piyasa Alış" (`/ic-piyasa/alis`; AppShell'de `/ic-piyasa/alis` →
  `ic_alis` eşlemesi `/ic-piyasa`'dan ÖNCE; sidebar `isActive` İç Piyasa'yı alış sayfasında yakmaz).
  `IcPiyasaSekmeler` artık yetkiye göre süzer: İş Emirleri · Alış (ic_alis) · Sipariş Raporu · Bildirimler
  · Müşteriler · Fiyat Formu. Alış sayfası: 4 özet kutu (açık / teslim alınacak / bugün / kapatmaya
  hazır = kalan ≤%1 veya ≤2 ton, `alisKapatmayaHazir`), tablo (sığma ölçüldü: 1366 ve 1440'ta yatay
  kaydırma YOK — Araç sütunu ilerleme altına alındı), satır açılınca detay + teslimler + Düzenle /
  Sistem öncesi teslim ekle (Excel formülünü yapıştır → satırlara aç, `formulTerimleri`) / Kapat / İptal /
  Yeniden aç / Sil (teslimsiz). "Tedarikçiler" görünümü (ekle/düzenle/pasif/sil — siparişi olan silinmez).
  Form `components/ic-alis-siparis-form.tsx` (aynı pencerede yeni tedarikçi; sipariş hata verirse kart
  SEÇİLİ kalır, ikinci kart açılmaz). Kapatma ELLE (satış iş emri gibi), otomatik değil.
- Kantar Paneli: `components/kantar-gelen-arac.tsx` Yurt İçi sütununda satış iş emirlerinin ALTINDA
  (`KantarYurtIci altBolum` — aynı kaydırma alanı). "Araç Teslim Al": irsaliye PDF'i (okunur) veya
  "İrsaliye yok, elle gir"; "Doğrudan müşteriye sevk" + iş emri seçimi (dosya değişince seçim korunur).
  Fonksiyon yoksa/yetki yoksa bölüm HİÇ görünmez. Kantarcı fiyat görmez.
- Sipariş Raporu `/ic-piyasa/rapor` (ic_piyasa; alış tablosu yalnız ic_alis): Excel'in iki tablosu,
  aktif + "Tamamlanan: Bugün / 7 / 30 gün / Tümü" (varsayılan 7; kapanış zamanına göre), iptal girmez,
  toplam tutar = SİPARİŞ × fiyat (Excel'deki gibi; araç hedefli iş emrinde sevk × fiyat), doğrudan
  sevkli iş emri teslimi "TMO". Hesap SAF `lib/ic-piyasa/siparis-raporu.ts`; Excel çıktısı
  `lib/ic-piyasa/siparis-raporu-xlsx.ts` + YENİ PAKETSİZ yazıcı `lib/xlsx-yaz.ts` (jszip; stil seti
  sabit, yeşil FF92D050). Sona "SİSTEM NO" (IE/AS) sütunu eklendi. İndirme adı ASCII
  `GG.AA.YYYY_SIPARIS_ALIM_RAPORU.xlsx` (Chromium Türkçe harfli `download` adını "download" yapıyordu).
- Gece yedeği: 3 tablo `YEDEKLENECEK_TABLOLAR` + mail.ts adları; `yedekleme-gonder` migration'dan
  SONRA yeniden DEPLOY edilmeli (yoksa yeni tablolar yedeğe girmez). Geri yükleme betiğinde hiçbir
  `ic_*` tablosu yok (bilinen eksik, bkz. Parça 2).
- Testler (scratchpad `alis/`): yerel PG16 tüm zincir (veriye bağlı 2 e-posta migration'ı atlanır,
  `restore/db_kur3.sh`) + `test.sql` 40+ senaryo (numara/sayaç, yetki/izolasyon, kantar fiyatsız,
  doğrudan sevk iki kayıt + bildirim, değişmezlik, FK, depo politikaları) + migration 2. kez; birim
  `birim.ts` 40 (27.10 Excel rakamları birebir: 698.060 / 1.940 / 242.460 / 3.487.500; xlsx openpyxl
  ile açılır); Playwright `e2e.mjs` 46 (alış akışı, formül, kantar irsaliyesiz + doğrudan sevk, rapor +
  xlsx indirme, yetki süzme/yönlendirme, fonksiyon yokken gizli bölüm, 1366/1440 sığma, 390 mobil);
  regresyon sf/e2e2/3/5/8 + kantar_irs geçti (e2e5 sekme sırası beklentisi güncellendi).
- İLK EŞİTLEME (27.10 sayfası → canlı) GERÇEK VERİ: kullanıcı onayı olmadan YAPILMAZ. Satış tarafında
  geçmiş araç PDF'siz eklenemez (`ic_gecmis_sevk_ekle` irsaliye zorunlu kuralı DEĞİŞMEDİ).
- CANLI (30.10.2026): migration MCP ile İKİ PARÇADA uygulandı (`ic_alis_1_tablolar` sadece ekleme,
  `ic_alis_2_depo_yetki` depo politikaları + revoke + yetki; tek parça denemesi 3 kez "Migration was
  cancelled" döndü — onay penceresi). Sonuç repodaki dosyayla AYNI. `yedekleme-gonder` v23 (deneme 38
  tablo, geri yükleme 36/36). İlk eşitleme (kullanıcı onaylı, 28.10 Excel'i): AS-2026-0001…0005
  (Havsa 698.060 / Büyükevren 107.640 / Uzunköprü 245.540 kg PARTİ olarak `gecmis`; Pınarhisar
  400 t araç araç irsaliyeyle), IE-2026-0004 Trakya ASA0006744, 0005/0006 Tarım Kredi (Balıkesir /
  Alpullu, yeni kart "TARIM KREDİ YEM SAN. VE TİC. A.Ş."), 0007/0008 Artı Grup 300 t / 320 t (kart
  e-faturadan: VKN 0850397225; DEPO TESLİM — araçları müşteri TMO'dan çeker). siparis_alindi mesajları
  aynı işlemde "atlandi". NOT: `ic_is_emirleri.birim_fiyat` 2 hane → 17,7283 → 17,73 kaydedildi, tam
  fiyat notta (4 haneye genişletme kullanıcı onayı bekliyor).
- 30.10.2026 OLAY: lojistik geçmiş tarihli 16 aracı (Pınarhisar 10, Trakya 3, Tarım Kredi 3) Kantar'dan
  NORMAL araç olarak girdi → 16 çıkış onayı e-postası gitti, hatırlatma/uyarı e-postaları başlayacaktı.
  Düzeltme (SQL): irsaliye saatiyle `cikis_durumu='cikti'`, `cikis_isleyen='Sistem öncesi kayıt
  (lojistik, 30.10)'` (müşteri mesajı ÜRETİLMEDİ; e-postadaki bağlantı "zaten işlendi" der). Pınarhisar
  10 aracı yanlış iş emrine (IE-0008) girilmişti → IE-0007'ye taşındı (264.040 kg; bildirimlerin
  is_emri_id'si de). PDF'ler depoda IE-0008 klasöründe kaldı (yol kayıtta doğru; taşımak gerekmez).
  DERS: geçmiş araçlar Kantar'dan GİRİLMEZ ("Sistem öncesi araç ekle" / Claude'a irsaliye ile).

## İç Piyasa — Kapanış raporu, kalan/eksik/fazla takibi, Kantar sadeleştirme (30.10.2026)

- Kullanıcı (lojistikle görüşme sonrası): "Kantar panelinde iç piyasa kısmında kalan tonaj gözükecek;
  sipariş tamamlandığında otomatik mail (test test adresi, canlıda execution@, bbt@,
  lojistik@); eksik / az kapanma takibi, kalan veya fazla giden; müşteriler şifreli gözükmesin; Kantar
  paneli çok karışık, her şey çok büyük, tek ekranda yönetilebilir olmalı."
- Migration `20261030180000_ic_kapanis_raporu_kantar.sql` (KOD PUSH'UNDAN ÖNCE — Bildirimler ayar
  sorgusu `kapanis_eposta` okur): `ic_piyasa_ayarlari.kapanis_eposta` (virgülle ≤5, CHECK; Unex =
  test adresi), `ic_bildirimler.alici` + 'ekip', `ic_bildirim_is_emri` (gövde AYNEN +
  'tamamlandi'ya HER geçişte `siparis_kapanis` e-postası: hedef = ilk adres, CC = diğerleri; satır
  CC'si `ic_bildirim_eposta_al`'ın else dalıyla korunur; ayar boşsa rapor yok; iptalde yok),
  `kantar_ic_is_emirleri` / `kantar_ic_son_sevkler` `musteri_maskeli` kolonu artık GERÇEK ad (kısa ad,
  yoksa ünvan; imza aynı, DROP yok). Değerler dizisi sırası migration başlığında.
- Hesap TEK YER `_shared/mesaj-sablonlari.ts`: `teslimFarki` (tonaj ±%1 = "Tam", araçta eşit sayı),
  `kalanMetni`, `kapanisOzeti` (e-posta / Bildirimler satırları), `kapanisKonusu`. Edge function
  `ic-piyasa` `epostaOlustur` → "Sipariş tamamlandı / eksik kapandı / fazla kapandı" (müşteriye GİTMEZ).
- Bildirimler › Ayarlar: "Sipariş kapanış raporu · Alıcılar" (küçük harf, tekrarsız; boş = kapalı);
  akışta alıcı "Ekip · rapor", detayda rapor satırları. Canlıya geçiş = bu alana execution@, bbt@,
  lojistik@ yazmak (kod gerekmez).
- İş Emirleri: Yükleme hücresinde `KalanRozet` (`components/ic-kalan-rozet.tsx`): açık → "Kalan / Fazla /
  Hedef tamam", tamamlanan → "Kapanış: Tam / Eksik … / Fazla …"; filtre "Eksik / Fazla Kapanan".
- Kantar Paneli: iki sütun artık xl (≥1280) itibariyla (1.2fr / 1fr), özet kartları → başlık sayaçları
  (`Sayac`), Yurt İçi'nde SEKMELER "Satış · İş Emirleri (n)" / "Alış · Gelen Araç (n)" (seçim
  localStorage `kantar-yurt-ici-sekme`; alış fonksiyonu yoksa sekme gizli). Kartlar yerine SIKI tablolar
  (`table-fixed` + colgroup; iş emri · ürün · müşteri tek hücrede; ilerleme + kalan; küçük "Araç ekle" /
  "Teslim al"). DBA bekleyen tablosunda müşteri kodu Dosya hücresine taşındı. Ölçüm: 1280/1366/1440/1920
  tablolarda yatay kaydırma YOK, sütunlar ekrana sığar; 1100'de alt alta; 390 taşma yok.
  `KantarYurtIci` `altBolum` prop'u KALDIRILDI. Doğrudan sevk açıklaması netleştirildi.
- Testler (scratchpad `kapanis/`): `test.sql` (K1–K10: ayar boş, 3 alıcı CC, kuyruk CC korunur, araç
  hedefli, iptal, CHECK'ler, kantar gerçek ad, anon kapalı) + migration 2. kez; `birim.ts` 26; edge
  `edge/test.mjs` (eski A–F + G kapanış); Playwright `kantar.mjs` (4 genişlik + sekmeler + pencereler),
  `ic.mjs` (rozetler, filtre, Bildirimler ayarı). Regresyon: alis/e2e.mjs (sekme + "Teslim al" için
  güncellendi) 47, sf/e2e2/3/5/8, sf/kantar_irs ("Araç ekle"), kantar/e2e.mjs, km/e2e.mjs.
- KAPANIŞ E-POSTASI 2. SÜRÜM (30.10.2026 akşam, kullanıcı: "Gelen mail görünümü çok kötü. İhracat
  günlük rapordaki gibi bir sistem yapmalıyız; sipariş aşımı panelde zaten tespit ediliyor"):
  `supabase/functions/_shared/ic-kapanis-rapor.ts` (SAF, yalnız HTML/konu; hesap yine `kapanisOzeti`)
  — günlük raporun dili: logo + "Unex Gıda İç Piyasa / Sipariş Kapanış Raporu" + sağda IE no ve kapanış
  saati, 3 özet kutusu (Sipariş Hedefi · Gerçekleşen · Sonuç; renk tam yeşil / eksik amber / fazla
  LACİVERT — aşım alarm gibi gösterilmez), tam değilse sakin bilgi kutusu, "Sipariş Bilgileri"
  (müşteri kısa ad + ünvan, ürün, teslim, sipariş tarihi, kapanış · kapatan · süre gün), "Araç Bazında
  Sevkiyat" (tarih, plaka/dorse, irsaliye no, net; sistem öncesi etiketli; toplam), yeşil "İş emirlerini
  uygulamada aç". Konu: "İç Piyasa Kapanış Raporu — IE… · {kısa ad} | 264,04 / 300 ton · Eksik 35,96
  ton (%12)". Edge `ic-piyasa` (canlı v10): `kapanisEpostasi` araçları + teslim/kısa adı service role
  REST ile okur (is_emri_id UUID biçimi doğrulanır); okunamazsa rapor araç listesi olmadan YİNE gider.
  `epostaOlustur`'dan eski kapanış dalı kaldırıldı; `kapanisKonusu` (eski) Next tarafında duruyor.
  Deploy dosyaları ÜÇ: `index.ts`, `../_shared/ic-kapanis-rapor.ts`, `../_shared/mesaj-sablonlari.ts`.
  DERS (v9): deploy içeriği elle kopyalanırken `MUSTERI_EPOSTA_SABLONLARI`'ndan bir öğe düştü → v10 ile
  düzeltildi; HER DEPLOY SONRASI `get_edge_function` çıktısı repo dosyalarıyla birebir karşılaştırılır.
  Test: `kapanis/edge/test.mjs` G bölümü (konu, kutular, araç tablosu, servis anahtarı, veri yokken
  gönderim, geçersiz id sorgulanmaz). Görsel: `kap2/` (900/390).
- 30.10 akşam: lojistiğin TOPLU girdiği 4 araç (IE-0007: 45 PA 4585, 03 AFU 638; IE-0008: 01 V 0138,
  01 ASL 807) kullanıcı isteğiyle `cikti` + `cikis_isleyen='Toplu yükleme (lojistik, 30.10)'`
  (müşteri mesajı ÜRETİLMEDİ). NOT: IE-0007 bununla 318.940 / 300.000 kg (hedef aşıldı).

## İç Piyasa — Siparişler arası tonaj devri + Günlük İç Piyasa Raporu (04.11.2026)

- Kullanıcı: "IE-2026-0007 … 318.940 / 300.000 kg · Fazla 18,94 ton. Buradaki fazlalık olan 18.940 bu dosyaya
  aktarılmalı: IE-2026-0008 … 55.020 / 320.000 kg." Araç / irsaliye BÖLÜNMEZ (tek irsaliye) → araç taşınmaz,
  DEVİR kaydı: `ic_is_emirleri.devir_kg` (net; + gelen, − giden) + `ic_is_emri_devirleri` (kayıt, geri alınabilir,
  denetimli). **Yüklenen = araç net toplamı + devir_kg** — İş Emirleri (`yuklenenKg`, lib/ic-piyasa/is-emri.ts),
  Kantar (`kantar_ic_is_emirleri`), Sipariş Raporu, müşteri detayı, Kantar %5 aşım uyarısı
  (`kantar_ic_sevk_ekle`), kapanış değerleri ve günlük rapor AYNI kural. Müşteri takip sayfası ve müşteriye
  "sipariş tamamlandı" mesajı GERÇEK araç toplamını gösterir (devir iç muhasebe).
- Migration `20261104150000_ic_devir_gunluk_rapor.sql` (yalnız ekleme; KOD PUSH'UNDAN ÖNCE): `devir_kg` kolonu +
  `ic_devir_koru` tetikleyicisi (doğrudan değiştirme ENGELLİ; yalnız fonksiyonlar `ic.devir_izin` ile),
  `ic_is_emri_devir_ekle(kaynak, hedef, kg, açıklama)` (aynı şirket + aynı müşteri + aynı ürün, ikisi de tonaj
  hedefli, hedef AÇIK, kaynak iptal değil, miktar ≤ kaynağın FAZLASI), `ic_is_emri_devir_geri_al(id)`.
  RLS: kayıt tablosu SELECT (şirket + ic_piyasa); yazma politikası YOK. `kantar_ic_sevk_ekle` ve
  `ic_bildirim_is_emri` gövdeleri canlıdaki halinden DESENLE yamalandı (`regexp_replace`, tam bir eşleşme
  yoksa HATA; 2. kez çalışınca atlar) — tüm gövde kopyalanmadı (CRLF'li canlı gövde korunur).
- Arayüz: İş Emirleri satırında "Devir ±x kg · araçlar y kg" notu; detayda "Tonaj devri" listesi + "Geri al";
  fazlası olan siparişte "Fazlayı aktar (x kg)" → `components/ic-devir-penceresi.tsx` (adaylar: aynı müşteri,
  aynı ürün, açık, tonaj hedefli). Devirli iş emri silinemez ("önce devri geri alın").
- GÜNLÜK İÇ PİYASA RAPORU: edge function `ic-gunluk-rapor` (hesap + HTML SAF `_shared/ic-gunluk-rapor.ts`):
  özet kutuları (Bugün Yüklenen · Bugün Gelen · Açık Satış kalan · Açık Alış kalan), Bugün Yüklenenler — Satış
  (saat = irsaliye, müşteri · IE · ürün, plaka/dorse, irsaliye no, çıkış durumu, net), Bugün Gelenler — Alış
  (doğrudan müşteriye sevk etiketli), Bugün Kapanan Siparişler (Tam/Eksik/Fazla — kapanış e-postasının yerine),
  Açık Satış (hedef, yüklenen [devir dahil notu], araç, +bugün, kalan/fazla), Açık Alış. FİYAT YOK. Gün = TR.
  pg_cron `ic-gunluk-rapor` 16:00 UTC (19:00 TR; komut `gunluk-rapor-aksam`tan türetilir, anahtar repoda YOK).
  Anon: yalnız 18:55–19:59 penceresi, şirket+gün tek (`ic_gunluk_rapor_gonderimleri`, kısmi benzersiz
  `where not test`); `{"test":true}` (anon veya yetkili) ayarlı alıcılara "[TEST]" gönderir, 24 saatte ≤3, 19:00'u
  ENGELLEMEZ; `{"deneme":true}` yalnız yetkili (HTML döner). Alıcılar `ic_piyasa_ayarlari.gunluk_rapor_eposta`
  (Bildirimler › Ayarlar "Günlük iç piyasa raporu"; Unex başlangıç test adresi).
- KAPANIŞ E-POSTASI KAPATILDI (kullanıcı: "fazlalık maili kötü, kaldırabiliriz"): `kapanis_eposta` = null
  (tetikleyici ayar boşsa üretmez; Ayarlar'daki alan günlük rapor alanıyla değiştirildi). Kod/şablon duruyor.
- Gece yedeği: `ic_is_emri_devirleri` eklendi (mail.ts adı). `ic_gunluk_rapor_gonderimleri` iz kaydı, yedekte yok.
- Test (scratchpad `icdevir/`, `icrapor/`): yerel PG senaryo T1–T26 (koruma, yetki, şirket izolasyonu, kurallar,
  kantar 73.960 / 300.000, %5 uyarısı devirle, kapanış 300.000 / müşteri mesajı 318.940, geri al, anon kapalı) +
  migration 2. kez; rapor birim 13 (TR gün sınırı, devir, doğrudan sevk, kapanan, boş gün, fiyatsız) + 900/390
  görsel; Playwright `e2e_icdevir.mjs` 14 (IC_TEST=1 mock).

## İç Piyasa — İrsaliye okunamayınca elle giriş tamamlandı (04.11.2026)

- Kullanıcı: "Bazen irsaliyeleri okumuyor (görsel PDF); öyle durumlar için manuel ekleme yapmalıyız." Plaka / net /
  irsaliye no zaten elle yazılıyordu (22.10.2026). İki eksik kapatıldı (`lib/ic-piyasa/irsaliye-elle.ts`, SAF):
  1) KISMEN okunan PDF'te (ör. plaka okundu, net okunamadı) ekran yeşil "İrsaliyeden okundu" diyordu → artık
     "Okunamadı: net ağırlık, irsaliye tarihi — elle yazın" satırı (`okunamayanAlanlar`; ETTN dosya adındaysa
     irsaliye no istenmez).
  2) İrsaliye TARİHİ okunamazsa elle tarih + saat (varsayılan şimdi, Türkiye saati; gelecek > 10 dk ve 30 günden
     eski reddedilir, `elleTarihIso` → `+03:00`). Boş bırakılırsa eski davranış (kayıt saati).
- Kantar Yurt İçi (satış) ve Araç Teslim Al (alış, yalnız PDF yüklendiyse) aynı. RPC / veritabanı DEĞİŞMEDİ
  (`irsaliye_tarihi` zaten `p_veri`'den okunuyordu). Görüntü PDF'ten metin okuma (OCR / yapay zekâ) bilinçli YOK.
- Test: birim 10 (alanlar, tarih sınırları) + Playwright `e2e_irselle.mjs` 24 (1440 + 390; görüntü PDF, gelecek
  tarih engeli, kaydet isteğinde elle tarih; IC_TEST=1 mock'a kantar RPC'leri eklendi).

## İç Piyasa — Günlük rapor günde 3 oturum + şirket alıcıları (04.11.2026 akşam)

- Kullanıcı: "Alıcılar execution@ / bbt@ / lojistik@ olarak gitmeli. Bugün 17.15'te gitsin. Bundan sonraki
  günlerde sabah öğle akşam." İhracat raporuyla aynı düzen, 15 dk sonra (aynı anda iki rapor gelmesin):
  SABAH 09:15 = DÜNÜN raporu ("Dün Yüklenenler"), ÖĞLE 12:15 ve AKŞAM 17:15 = bugünün (o ana kadar).
  `IC_RAPOR_SAATI` (`_shared/ic-gunluk-rapor.ts`) tek yer; konu "… İç Piyasa Raporu — 04.11.2026 Akşam | …".
- Migration `20261104170000_ic_gunluk_rapor_oturum.sql` (CANLIDA): `ic_gunluk_rapor_gonderimleri.oturum`
  (sabah/ogle/aksam, eski kayıt = aksam), tekrar koruması (şirket, gün, oturum); alıcılar Unex için 3 şirket
  adresi; pg_cron `ic-gunluk-rapor-sabah/-ogle/-aksam` (06:15 / 09:15 / 14:15 UTC), eski tek iş kaldırıldı.
  Anon pencere: oturum saatinden 5 dk önce – 60 dk sonra. `ic-gunluk-rapor` v2 deploy, repoyla birebir.
- İlk gerçek gönderim 04.11.2026 17:15:05 (akşam oturumu, 3 alıcı). Saat değişikliği = sabit + 3 cron işi.


## Raporda "İrsaliye İncele" (06.11.2026)

- İç piyasa günlük raporunda (yüklenen ve gelen tabloları) irsaliye no'nun altında
  "İrsaliye İncele ›" bağlantısı: `/belge/irsaliye?s=<ic_sevkler.id>` ya da `?a=<ic_alis_teslimler.id>`
  (`_shared/ic-gunluk-rapor.ts` `irsaliyeHucresi`; sorgu UUID ile doğrulanır). Dosya yoksa
  yalnız numara yazılır.
- Sayfa (`app/belge/irsaliye/page.tsx`) oturum ister; satırı şirkete göre okur, PDF'i 10 dk'lık
  imzalı adresle gösterir (Yeni sekmede aç / İndir). Mailde oturumsuz açılırsa giriş sonrası
  aynı sayfaya döner (`lib/giris-donus.ts`, yalnız `/belge/` yolları, sessionStorage).
- 06.11.2026 ALIŞ EŞİTLEME (kullanıcı onaylı; lojistik "siparişler açılmamış" dedi; 05.11 Sipariş Alım
  Raporu Excel'i): yeni tedarikçi kartları LÜLEBURGAZ AJANS, İPSALA AJANS; AS-2026-0006 Lüleburgaz
  500 t (1223, 7202002 MAYDÜ), AS-2026-0007 İpsala 590 t (1222, 7201001 MAYDÜ), AS-2026-0008 İpsala
  1.940 kg (Havsa AS-0001'den kalan, 07.10 / termin 21.10). AS-0001 700.000 → 698.060 kg (teslim
  698.060). Kapatmalar MANUEL (kullanıcı tercihi): AS-0001/0003/0004 tam teslim ama "açık"; Alış
  satırı açılınca "Tamamlandı olarak kapat". Satış tarafı Excel ile birebir (IE-0007 fazlası 18.940 kg
  04.11'de IE-0008'e devredilmişti).
- 06.11.2026 HIZLI "TAMAMLA" (kullanıcı: "iş emirleri kısmında siparişi tamamla yok sanırım"): buton
  vardı ama Detay'ın en altındaydı. Artık hedefe ulaşan (İE: `hedefTamam` ≥ %98 / araç hedefi; Alış:
  `alisKapatmayaHazir`) AÇIK siparişte satırda "Kapatmaya hazır" rozeti + İşlemler'de "Tamamla"
  (testid `kapatmaya-hazir`, `hizli-tamamla`, `alis-hizli-tamamla`); aynı onay penceresi, detay
  açılmaz. İE "Açık İş Emri" kutusunda "N kapatmaya hazır". İE kapatma onayı artık yüklenen / hedefi ve
  araç varsa müşteriye "Siparişiniz tamamlandı" mesajının Bildirimler'e hazırlanacağını yazar
  (`kapatmaAciklamasi`; tetikleyici değişmedi, müşteri mesajı araç toplamıyla — 04.11 kararı).
  Kapatma her zaman ELLE (otomatik kapatma yok). e2e `e2e_tamamla.mjs` (IC_TEST) 17/17.

## Lojistik talebiyle açılan satış iş emirleri (10.11.2026)

- Lojistik (WhatsApp ile gelen iki kepek satışı) için 2 satış iş emri kullanıcı onayıyla SQL ile açıldı (ekran akışıyla
  aynı alanlar: müşteri kartı, ürün, miktar, fiyat, vade, teslim şekli, nakliye, termin, talimat veren, açan
  execution@). Ürün özellikleri bir önceki aynı ürünlü iş emrinden kopyalandı (kontrol notu düşüldü).
- "Sipariş alındı" müşteri bildirimleri `bekliyor` bırakıldı (tasarım gereği elle gönderilir).


## Günlük rapor: tedarikçi / müşteri bazında toplam + İrsaliye Evreni (13.11.2026)
Kullanıcı: "İpsala Ajans toplam gelen, Lüleburgaz Ajans toplam gelen tonaj ve araç sayısı ile belirtilmeli; İrsaliye İncele
tıklandığında ilgili irsaliyeleri inceleyebileceği bir evren karşılamalı; tek ekranda; mümkünse 3D, belge havada okunabilir."
- Mail (`_shared/ic-gunluk-rapor.ts`, seçenek `gruplu`): "Gelenler"in başında **tedarikçi bazında toplam** (alış nolar, araç,
  ton, payı gösteren çubuk, "İrsaliyeleri İncele (n)"), "Yüklenenler"in başında aynısı **müşteri bazında**. Satırdaki
  "İrsaliye İncele" de evreni o belge seçili açar. Edge `ic-gunluk-rapor` artık `tedarikci_id` / `musteri_id` okur.
- Onaya kadar zamanlanmış rapor ESKİ görünümde (`GRUPLU_CANLI = false`); yeni görünüm yalnız `{"test_adresine": true}` ile
  (anon da çağırabilir; "[TEST]" YALNIZ `IC_RAPOR_TEST_ALICISI`, varsayılan test adresi; isteğe bağlı `tarih`, `oturum`; 3 / 24 saat).
- Ekran `/belge/irsaliyeler?tur=alis|satis&gun=YYYY-MM-DD[&k=<tedarikçi / müşteri id>][&odak=<teslim / sevk id>]`
  (`app/belge/irsaliyeler/page.tsx` veri, `components/irsaliye-evreni.tsx` görünüm): solda araçlar, ortada seçili irsaliye
  havada (geçişte 3B gelir, süzülür, üzerine gelince durur; arkada sıradaki belgeler kart yığını), sağda bilgiler; ← → ,
  büyük okuma, yeni sekme, indir. Kayıtlar RLS + company_id; belgeler 15 dk imzalı adres. Seçili belge adreste `odak`.
  Eski tek belge sayfası `/belge/irsaliye?s= / ?a=` eski mailler için durur.
- **Kalan (13.11.2026, "Kalan tonajlar da gözükmeli"):** özet tablolarda her siparişin yanında kalanı ("Kalan X ton" /
  "Fazla" / "Tamam" / kapalıysa "Kapandı") ve "Kalan" toplam sütunu; hesap Açık Satış / Açık Alış ile aynı
  (alış: miktar − tüm teslimler; satış: `kalanMetni`, devir dahil; toplam yalnız pozitif kg kalanlar). Evrende üstte
  "Kalan" kutucuğu, sağ panelde sipariş başına ilerleme çubuğu + kalan (seçili belgenin siparişi şeftali çerçeveli);
  kalan okunamazsa belgeler yine görünür.
- **Bütün kısımlarda kalan (13.11.2026, "İç piyasa raporunda bütün kısımlarda aynı durum olmalı"; yalnız `gruplu`):**
  araç satırlarında siparişin kalanı; Yüklenen / Gelen kutularında ve bölüm başlıklarında "kalan X ton" (günün
  araçlarının bağlı olduğu açık siparişler); Açık Satış / Açık Alış başında müşteri / tedarikçi bazında kalan (hedef,
  gerçekleşen, % çubuğu, kalan) + tablolarda TOPLAM satırı; Kapananlarda TOPLAM + "Eksik kapanan". Araç hedefli
  satış kalanı tonaja çevrilmez, "+ n araç" yazılır. Tek hesap: `alisKalanDurumu`, `acikSatis.kalan` (kalanMetni).
  `gruplu` kapalıyken HTML önceki sürümle bayt bayt aynı (kontrol edildi).
- **SADE RAPOR (13.11.2026 akşam; yukarıdaki iki maddenin yerini alır):** kullanıcı: "Satış ve alış olarak ikiye
  ayıracaksın ... Müşteri ismi - kalan, Araç, Bugün, Kalan, İrsaliyeler ... Rapor ip gibi olmalı. Aynı başlıktaki alt
  alta gözükmeli." `gruplu` artık `icRaporSadeHtml`: yalnız iki bölüm (Satış / Alış), her biri TEK tablo; müşteri /
  tedarikçi başlık satırı (araç, bugün ton, kalan toplamı, "İrsaliyeleri İncele (n)") ve altında siparişleri
  (↳ no · ürün, araç, ton, kalan / Kapandı). Günün aracı olan + açık olan bütün siparişler listelenir. Ayrıntı
  tabloları, kutular, kapananlar sade raporda YOK. Eski görünüm (zamanlanmış rapor) 13.11 öncesi haliyle aynı.
- **CANLI (13.11.2026 19:01, kullanıcı: "İç piyasa raporu onaylıdır"):** `GRUPLU_CANLI = true`; zamanlanmış rapor (09:15 /
  12:15 / 17:15) sade görünümle gider. Eski görünüm kodu geri dönüş için duruyor (`gruplu` kapalıyken).
- **Test modları anahtarlı (13.11.2026, güvenlik 2. tur):** anon `{"test": true}` (ayarlı GERÇEK alıcılara "[TEST]") ve
  `{"test_adresine": true}` artık `x-test-anahtar` başlığı ister (Vault `rapor_test_anahtari`, migration
  `20261113210000`). Başlıksız anon yalnız zamanlanmış rapor. SQL'den test:
  `headers := jsonb_build_object(..., 'x-test-anahtar', (select decrypted_secret from vault.decrypted_secrets where name='rapor_test_anahtari' limit 1))`.

## Alış · Bakiye Birleştir (25.11.2026)
- Kullanıcı: "İç piyasa kısmı için alış birleştirilmesi gerekiyor" (tedarikçiye verilen dilekçe: birden çok alış sözleşmesinin
  kalan bakiyesi tek depodan çekilecek). Önceki elle aktarımlar (AS-2026-0008, AS-2026-0011) yalnız notla yapılmıştı.
- Alış sayfası › "Bakiye Birleştir" (components/ic-alis-birlestir.tsx): açık ve kalanı (miktar − teslim alınan) olan alışlar
  seçilir; tedarikçi / ürün / kod / depo / termin / açıklama girilir. Aynı ürün şartı; kantarda irsaliyesi bekleyen araç varsa
  birleştirilmez (önce irsaliye).
- RPC `ic_alis_bakiye_birlestir` (migration 20261125140000, security definer, ic_alis yetkisi): yeni AÇIK alış (miktar = kalanlar
  toplamı, notta kaynak dökümü); teslim alınmış kaynak "tamamlandı" (miktar = teslim alınan), hiç teslim almamış kaynak "iptal"
  (notta "tamamı … aktarıldı"). Kayıt `ic_alis_birlestirmeleri` (kaynakların önceki miktar / durum / notu; denetim tetikleyicisi).
- Geri al (`ic_alis_birlestirme_geri_al`): yeni alışa araç alınmadıysa kaynaklar aynen geri döner, yeni alış silinir. Listede
  hedefte "Birleştirme · N kaynak" rozeti; hedefte "Sil" yerine "Birleştirmeyi geri al".
- İlk kullanım 25.11.2026: 4 alışın kalanı 1.668.580 kg → AS-2026-0012 (rollback denemesi: kapanış / açılış / geri al doğru).
