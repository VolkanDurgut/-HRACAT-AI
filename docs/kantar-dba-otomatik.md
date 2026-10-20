# DBA Otomatik Yükleme — Kurulum ve İşletim Kılavuzu

Kantar bilgisayarındaki Solas, her DBA tartımında belgeyi `C:\Truck Scale\DBA`
klasörüne `<12 haneli belge no>_<yükleten>.pdf` adıyla kaydeder
(ör. `258720262193_OM GENERAL.pdf`). Bu sistem o PDF'i 1–2 dakika içinde ilgili
konteynere kendiliğinden yükler. Personelin bir şey yapması gerekmez; elle yükleme
düğmesi yedek olarak yerinde kalır.

## Nasıl çalışır

1. **Kantar bilgisayarı** (`C:\UnexDBA\dba-ajan.ps1`): Görev Zamanlayıcı her
   dakika çalıştırır (bilgisayar açılınca başlar, oturum açılmasa da çalışır).
   Yeni ve yazımı bitmiş PDF'i sunucuya gönderir. Solas'ın klasörüne **hiçbir şey
   yazmaz, taşımaz, silmez**.
2. **Sunucu** (edge function `dba-otomatik`): PDF'i **metin olarak** okur (yapay zekâ
   yok, ücretsiz). Belge no, kantar no, Unex vergi no, konteyner no (ISO kontrol
   hanesiyle), ağırlıklar ve plaka sıkı doğrulanır; en küçük şüphede belge
   "Okunamadı" sayılır.
3. **Karar** (veritabanı, tek yer): Konteyner **açık bir dosyada tam olarak bir
   kez** varsa, DBA'sı **boşsa** ve belge no başka konteynerde **yoksa** yüklenir.
   Konteyner satırı kilitlenir, koşullar yeniden kontrol edilir; personel aynı anda
   elle yüklerse otomatik yükleme geri çekilir. **Asla üzerine yazmaz.**
4. Yüklenen alanlar elle yüklemeyle aynıdır (plaka, dara, VGM, belge no, PDF).
   Kantar Paneli'nde satırın yanında "Oto" rozeti görünür.
5. **Konteyner sonradan girilirse** (DBA önce oluştu, personel konteyneri sonra
   ekledi): belge "Konteyner bekleniyor" durumunda bekler. Görev (1.1.0+) her dakika
   sunucuya PDF göndermeden "konteyner eklendi mi?" diye sorar; eklendiği dakika
   belgeyi gönderir → konteyner eklendikten **1–2 dakika** sonra DBA yüklenir
   (72 saat beklenir). PDF'in kendisi yedek olarak saatte bir yeniden gönderilir.
6. **Mükerrer yükleme yok:** DBA'sı olan konteynerde Kantar Paneli'nde yükleme
   düğmesi yoktur. Ekran yenilenmeden önce otomatik yüklenmişse elle yükleme
   başlamadan durur ("zaten yüklü" bilgisi); aynı anda olursa yazım
   `dba_dosya_url is null` koşuluyla yapıldığı için ikincisi yazılmaz ve yüklediği
   PDF geri silinir. Hiçbir yol mevcut DBA'nın üzerine yazmaz.

## Kantar Paneli › "Otomatik DBA"

- **Deneme modu / Canlı** rozeti, **Bağlı · 1 dk önce** sinyali, bugünün sayısı.
- **Kontrol bekleyen belgeler** (otomatik yüklenemeyenler):

| Durum | Anlamı | Ne yapılır |
|---|---|---|
| Konteyner bekleniyor | Konteyner henüz açık bir dosyaya eklenmemiş | Konteyner eklenince 1–2 dk içinde kendiliğinden yüklenir (72 saat beklenir; görev 1.0.x'te 10 dk) |
| Eşleşmedi | 72 saatte eşleşmedi / konteyner sadece kapalı dosyada | Gerekirse DBA düğmesiyle elle yükleyin ya da listeden kaldırın |
| Çakışma | Konteynerde başka DBA var (yeniden tartım), konteyner birden fazla açık dosyada ya da belge başka konteynerde | Kontrol edip elle düzeltin |
| Okunamadı | PDF DBA değil / doğrulanamadı | DBA düğmesiyle elle yükleyin |

"X" ile kaldırılan belge bir daha otomatik denenmez (konteynere hiçbir şey olmaz).

## İlk kurulum (sırayla)

1. **Supabase › SQL Editor**: `supabase/migrations/20261020100000_dba_otomatik_yukleme.sql`
   (sadece ekleme; mevcut hiçbir şeyi değiştirmez).
2. **Supabase › SQL Editor**: cihaz anahtarı (anahtar **yalnızca bir kez** görünür;
   kopyalayıp güvenli bir yere not edin, kimseyle paylaşmayın):

   ```sql
   with yeni as (select 'unexdba_' || encode(extensions.gen_random_bytes(32), 'hex') as anahtar),
   ekle as (
     insert into public.kantar_cihazlari (company_id, ad, anahtar_ozeti, canli)
     select '387edff1-3aa6-41a4-a370-e42135017043', 'Kantar PC (DESKTOP-61P8TC5)',
            encode(extensions.digest(yeni.anahtar, 'sha256'), 'hex'), false
       from yeni
     returning ad, canli
   )
   select yeni.anahtar, ekle.ad, case when ekle.canli then 'CANLI' else 'DENEME' end as mod
     from yeni, ekle;
   ```

   Cihaz **deneme modunda** açılır: okur, eşleştirir, kaydeder ama konteynere
   **hiçbir şey yazmaz**. Personel bu sürede her zamanki gibi elle yükler.
3. Kod paketi push edilir (Kantar Paneli bölümü). Edge function yayına alınır.
4. **Kantar bilgisayarı** (uzak masaüstü, yönetici hesabı):
   - `UnexDBA-kurulum` klasörünü masaüstüne kopyalayın
     (`dba-ajan.ps1`, `kurulum.ps1`, `kaldir.ps1`).
   - Başlat › "PowerShell" › sağ tık › **Yönetici olarak çalıştır**.
   - `cd "$HOME\Desktop\UnexDBA-kurulum"`
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\kurulum.ps1`
   - Anahtarı yapıştırın (görünmez; sağ tık = yapıştır) › Enter.
   - Betik her adımda `[TAMAM]` yazar; bir sorun olursa `[DURDU]` yazıp durur.
5. Kantar Paneli'nde "Otomatik DBA" bölümü **Deneme modu · Bağlı** görünmelidir.

## Deneme süresi ve canlıya geçiş

2–3 iş günü boyunca sistemin "yüklerdim" dediği her belge, personelin elle yüklediği
konteynerle karşılaştırılır:

```sql
select r.dba_belge_no, r.konteyner_no as otomatik_eslesme, k.konteyner_no as elle_yuklenen,
       case when k.id is null then 'henuz elle yuklenmedi'
            when upper(k.konteyner_no) = r.konteyner_no then 'AYNI' else 'FARKLI' end as sonuc
  from dba_otomatik_kayitlari r
  left join konteynerler k on k.company_id = r.company_id and k.dba_belge_no = r.dba_belge_no
 where r.mod = 'deneme'
 order by r.ilk_gorulme;
```

Hiç "FARKLI" yoksa canlıya geçilir (tek satır, geri almak da aynı satırla):

```sql
update public.kantar_cihazlari set canli = true  where ad = 'Kantar PC (DESKTOP-61P8TC5)';  -- canlı
update public.kantar_cihazlari set canli = false where ad = 'Kantar PC (DESKTOP-61P8TC5)';  -- deneme
```

## Acil durdurma / iptal

- **Anında durdurma (sunucudan):** `update public.kantar_cihazlari set aktif = false where ad = '...';`
  Anahtar geçersiz olur; görev hiçbir şey gönderemez. Yeni anahtarla yeniden kurulur.
- **Kantar bilgisayarından kaldırma:** `kaldir.ps1` (görevi siler, klasörü bırakır).
- Elle yükleme her durumda çalışmaya devam eder.

## Bakım

- Günlük: `C:\UnexDBA\gunluk\YYYY-MM.log` (her belge için tek satır; 6 ay saklanır).
- Gönderilenlerin kaydı: `C:\UnexDBA\durum.json` (silinirse sorun olmaz: sunucu
  yüklenmiş belgeleri tanır, çift yükleme olmaz).
- Görev Zamanlayıcı'da görev adı: **UnexDBA Otomatik Yukleme**.
- **Görev güncelleme (anahtar istemez):** yeni `dba-ajan.ps1` ile aynı klasördeki
  `guncelle.ps1` Yönetici PowerShell'de çalıştırılır
  (`powershell -NoProfile -ExecutionPolicy Bypass -File .\guncelle.ps1`). Sadece görev
  betiğini değiştirir (sözdizimi kontrolü, tek hamlede değiştirme, izin sıfırlama),
  görevi bir kez çalıştırıp sonucu gösterir. Anahtar / ayar / durum / günlük değişmez.
- `kurulum.ps1` yeniden çalıştırılırsa anahtar yeniden istenir (anahtar bir kez
  gösterildiği için elinizde yoksa yeni anahtar üretilir).
- Kurulum 20.10.2026 düzeltmesi: ilk sürüm dosya izinlerini klasörle birlikte
  (`/T`) verdiği için dosyalar izinsiz kalıyordu (görev sonucu 1, günlük yok).
  Düzeltme: `icacls "C:\UnexDBA\*" /reset /T /Q` (kurulum artık bunu kendisi yapar).
