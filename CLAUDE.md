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
- Revize istenirse `draft_onaylandi` / `draft_mail_gonderildi` /
  `draft_musteri_onayi_alindi` bayrakları sıfırlanır (dosya baştan Onayla
  adımına döner), ama `draft_revize_notu/tarihi/isaretleyen` geçmiş kayıt
  olarak silinmez.
- Sadece **Açık** dosyalar listelenir (`isDosyaAcik`), kapalı dosyalar draft
  evrakları tamamlanmış olsa bile burada görünmez (kullanıcı kararı,
  30.09.2026).

## Kimlik doğrulama / kullanıcılar (karar: 01.10.2026)

- Uygulamayı **sadece Unex Gıda** kullanıyor. Kayıt formu YOK; kullanıcılar
  Supabase Dashboard'dan manuel ekleniyor. Giriş ekranında (`app/page.tsx`)
  SADECE e-posta + şifre ile giriş var; "Şifremi unuttum" akışı ve
  `/sifre-yenile` sayfası da kullanıcı kararıyla kaldırıldı (şifre sıfırlama
  yönetici işi). `/checkout` ve `/api/checkout` (iyzico deneme çekimi) de
  kaldırıldı — bunların hiçbiri geri eklenmemeli.
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
