# Felaket Kurtarma Kılavuzu — İhracat AI

> Son prova: **05.10.2026** (temiz Postgres 17 + PostgREST, gerçek yedek formatı,
> uçtan uca). Bu kılavuzdaki her adım o provada çalıştırıldı.

## Ne zaman kullanılır?

Supabase projesine (`tnzbihsfbhqzkcliicdk`) erişim kalıcı olarak kaybedilirse:
proje silindi, hesap kapandı, veritabanı bozuldu, yanlışlıkla toplu veri silindi
vb. Geçici kesintide (Supabase arızası, proje duraklatıldı) **bu kılavuz
uygulanmaz**; Supabase panelinden proje yeniden başlatılır.

## Hedefler (RPO / RTO)

| | Hedef | Bugünkü durum (05.10.2026) |
|---|---|---|
| **RPO – veri** (en fazla ne kadar veri kaybedilir) | 24 saat | ✅ Her gece 03:00 tam yedek (mail eki). En kötü durumda son yedekten sonraki gün kaybolur. |
| **RPO – denetim geçmişi** | 7 gün | ✅ Yedekte son 7 gün var; daha eskisi yedekte yok (bilinçli, mail boyutu). |
| **RPO – PDF dosyaları** | — | ⚠️ **Yedek YOK.** Supabase Storage'da duruyor; proje kaybolursa PDF'ler de kaybolur. Karar bekliyor (aşağıda). |
| **RTO** (sistem ne kadar sürede ayağa kalkar) | ≤ 2 saat | ✅ Bu kılavuz + `scripts/yedekten-geri-yukle.mjs` ile yaklaşık 1–2 saat (PDF'ler hariç). |

Her gece yedek, **gerçekten geri yüklenerek** test edilir
(`public.yedek_geri_yukleme_testi`): mailde "Geri yükleme testi: 19/19 tablo
birebir" satırı görünmüyorsa veya konu `[UYARI]` ile başlıyorsa incelenmeli.

## Gerekenler

- En son yedek maili eki: `ihracat-ai-yedek-GG-AA-YYYY.json`
- Bu repo (GitHub: `VolkanDurgut/-HRACAT-AI`) ve bilgisayarda Node.js 18+
- Supabase CLI (önerilir) veya Supabase panelindeki SQL Editor
- Gizli anahtarlar (değerleri BURADA YAZMAZ; şifre yöneticisinde/ilgili panellerde):
  - `GEMINI_API_KEY` (Google AI Studio) — proforma/DBA/fatura/konşimento okuma
  - `RESEND_API_KEY` (Resend paneli) — yedek ve geri bildirim mailleri
  - `GERI_BILDIRIM_ALICI` — yedek/geri bildirim maillerinin gideceği adres

## Adımlar

### 1) Yeni Supabase projesi (~5 dk)
Supabase panelinde yeni proje açın (bölge: mümkünse aynı, `ap-northeast-2`).
Proje ayarlarından şunları not edin: **Project URL**, **anon key**,
**service_role key**, **Project ref**.

### 2) Eklentiler (~2 dk)
Database → Extensions: **pg_cron** ve **pg_net** açılır (diğerleri hazır gelir).

### 3) Şema (~5 dk)
`supabase/migrations/` altındaki dosyaların **hepsi, dosya adı sırasıyla**
çalıştırılır:
```
supabase link --project-ref <YENI_REF>
supabase db push
```
CLI yoksa: SQL Editor'de her dosyayı sırayla açıp çalıştırın. Hepsi hatasız
geçmelidir (05.10.2026 provası: 24/24 hatasız, canlıyla 518/519 nesne birebir;
tek fark 6. adımdaki zamanlanmış iş).

### 4) Edge function'lar ve gizli anahtarlar (~10 dk)
```
supabase secrets set GEMINI_API_KEY=... RESEND_API_KEY=... GERI_BILDIRIM_ALICI=...
supabase functions deploy proforma-oku konsimento-kontrol dba-oku fatura-kontrol destek-asistan geri-bildirim-gonder yedekleme-gonder gunluk-rapor-gonder
# istege bagli: gunluk raporu sirket adreslerine gondermek icin (virgulle)
supabase secrets set GUNLUK_RAPOR_ALICILARI=adres1@...,adres2@...
```
(Hepsi `verify_jwt` açık; varsayılan ayar budur. `depo-karantina` tek seferlik
bir araçtı, yeni projeye kurulmaz.)

### 5) Veriyi geri yükle (~5 dk)
Önce **sadece plan** (hiçbir şey yazmaz):
```
HEDEF_SUPABASE_URL=https://<YENI_REF>.supabase.co HEDEF_SERVICE_ROLE_KEY=<yeni service_role> node scripts/yedekten-geri-yukle.mjs ihracat-ai-yedek-GG-AA-YYYY.json
```
Plan doğruysa aynı komutun sonuna `--onayla` ekleyin. Betik:
kullanıcıları **aynı kimlikle** (geçici şifreyle) oluşturur → tetikleyicinin
açtığı boş şirket/rol kayıtlarını temizler → 19 tabloyu bağ sırasına göre yükler
→ kendi oluşturduğu denetim kayıtlarını siler → sonucu veritabanında
doğrular ("19/19 tablo birebir").
Kilitler: canlı proje ve dolu veritabanı hedef olarak reddedilir.

Betiğin sonunda yazanları uygulayın:
- SQL Editor: `select setval('public.ihracat_dosya_sira', <N>);` (N betikte yazar)
- Geçici şifreleri kullanıcılara güvenli yoldan iletin (şifreler yedekte yoktur).

### 6) Zamanlanmış işler: gece yedeği + günlük rapor (~3 dk)
SQL Editor'de (YENİ projenin adresi ve **anon** anahtarıyla):
```sql
select cron.schedule('gunluk-yedek-maili', '0 0 * * *', $cmd$
  select net.http_post(
    url := 'https://<YENI_REF>.supabase.co/functions/v1/yedekleme-gonder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YENI_ANON_KEY>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);
```

Günlük sevkiyat raporu (08:45 dünün raporu, 12:00 ve 17:00 bugünün raporu; UTC 05:45 / 09:00 / 14:00):
```sql
select cron.schedule('gunluk-rapor-sabah', '45 5 * * *', $cmd$
  select net.http_post(
    url := 'https://<YENI_REF>.supabase.co/functions/v1/gunluk-rapor-gonder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YENI_ANON_KEY>'),
    body := '{"slot":"sabah"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);
select cron.schedule('gunluk-rapor-ogle', '0 9 * * *', $cmd$
  select net.http_post(
    url := 'https://<YENI_REF>.supabase.co/functions/v1/gunluk-rapor-gonder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YENI_ANON_KEY>'),
    body := '{"slot":"ogle"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);
select cron.schedule('gunluk-rapor-aksam', '0 14 * * *', $cmd$
  select net.http_post(
    url := 'https://<YENI_REF>.supabase.co/functions/v1/gunluk-rapor-gonder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YENI_ANON_KEY>'),
    body := '{"slot":"aksam"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);
```

### 7) Kimlik doğrulama ayarları (~3 dk)
Authentication → Providers/Settings: **"Allow new users to sign up" KAPALI**
(kayıtlar manuel). Site URL: `https://ihracatasistanim.com`.

### 8) Uygulamayı yeni projeye bağla (~5 dk)
Netlify → Site configuration → Environment variables:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` yeni değerler →
Deploys → "Trigger deploy".

### 9) Doğrulama (~10 dk)
- Giriş yap; Dashboard, Ana Panel, İhracatlar, Kantar Paneli açılıyor mu?
- Bir dosyanın rezervasyon/konteyner/evrak sekmeleri dolu mu?
- Yeni bir deneme dosyası aç → numarası beklenen sıradan mı? Sonra sil.
- Edge function: yedekleme-gonder deneme modu (mail atmaz):
  `select net.http_post(url:='https://<YENI_REF>.supabase.co/functions/v1/yedekleme-gonder', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <YENI_ANON_KEY>'), body:='{"deneme": true}'::jsonb, timeout_milliseconds:=60000);`
  → `select content from net._http_response order by id desc limit 1;`
  içinde `"birebir":19,"tablo_sayisi":19` görülmeli.

## PDF dosyaları (açık konu)

- Yedekte PDF'lerin **kendisi yok**, sadece listesi var (`_storage_dosya_listesi`).
- Eski proje hâlâ erişilebilirse (ör. duraklatılmış), dosyalar eski projeden
  indirilip yeni projeye **aynı yolla** yüklenebilir.
- Kayıtlardaki dosya bağlantıları (`*_dosya_url`) **eski projenin adresine ve
  anahtarına imzalıdır**; dosyalar taşınsa bile yeni projede bu bağlantıların
  yeniden imzalanması gerekir (yol aynı kalır, sadece imza değişir).
- Sistem evraklarının (CI, PL, CoO, Phyto, Health, Quality, Fumigation, Sigorta)
  PDF'i veriden **yeniden üretilebilir**; kaybolan asıl dosyalar kullanıcının
  yüklediği proforma, DBA, irsaliye, fatura, Draft BL ve konşimento
  talimatlarıdır (çoğu e-posta/acente sistemlerinde de mevcuttur).

## Prova nasıl tekrarlanır?

05.10.2026 provası: yerelde Postgres 17 + Supabase taklidi (roller, auth,
storage, cron, net) kuruldu, tüm migration'lar sırayla çalıştırıldı, şema
"parmak izi" (tablo/sütun/kısıt/indeks/RLS/politika/fonksiyon/tetikleyici/bucket)
canlıyla karşılaştırıldı; ardından gerçek yedek formatında örnek veriyle bu
betik çalıştırılıp kaynak ve hedef veritabanları tablo tablo karşılaştırıldı.
Şema değiştiğinde (yeni migration) prova tekrarlanmalı; canlıya doğrudan SQL ile
yapılan her değişiklik **mutlaka repoya migration olarak da eklenmeli**
(05.10.2026'da bu yapılmadığı için repo canlıdan sapmıştı).
