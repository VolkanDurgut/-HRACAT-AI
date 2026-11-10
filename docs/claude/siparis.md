# Sipariş Defteri + Sevkiyat Planı (Dalga 4) — Claude notları

> 10.11.2026'da başladı. Gerçek müşteri / fiyat verisi REPODA YOK (repo herkese açık); yalnız veritabanında.

## 4.1 Şema + 2026 aktarımı (10.11.2026)

Kullanıcı: "Sipariş listesi her halükârda sisteme eklenmeli ve DİİB gibi otomatik mail gönderilmeli." Yöntem C:
önce Excel'den TEK SEFERLİK aktarım (export'un sipariş listesi + operasyonun yükleme planı), sonra sistem ana kaynak.
"Sadece kontrol merkezindeki raporu 1 yıllık güncel tutalım." Belge yüklenmez; geçmiş yalnız veri.
- Migration `20261110120000_siparis_defteri.sql`: `siparis_defteri` (proforma bazında satır; `kaynak_anahtar` =
  proforma|bl|sıra → aktarım tekrar çalıştırılabilir; durum `onay_bekliyor | on_odeme_alindi | rezervasyonlu |
  sevk_edildi | bl_eksik | iptal`) ve `sevkiyat_plani` (booking bazında; hafta, acente, liman, ekipman, cut-off'lar
  [YEREL saat UTC etiketiyle, rezervasyonlar ile aynı kural], ETD, gemi/sefer, `siparis_id` / `rezervasyon_id` /
  `dosya_id` bağları, konteyner başı `navlun_kont` / `lokal_kont` + kaynak). İstemciye SALT OKUNUR
  (`proformalar` veya `analiz` yetkisi). Yazma yalnız servis / SECURITY DEFINER.
- Aktarım (yerelden SQL, veri repoda yok): 189 sipariş (sipariş listesindeki blok sırası durumu verir: BL'li →
  sevk_edildi, BL'siz → bl_eksik, "ön ödemesi alınmış" → on_odeme_alindi, "ön ödemesi alınmamış" → onay_bekliyor;
  toplam MT Excel ile birebir) + 222 booking (1 tekrar eden booking tek satır).
- Bağlar: sistemdeki 40 rezervasyonun 40'ı plana bağlandı; 146 plan satırı siparişe (sipariş BL alanı "a, b"
  çoklu olabilir); 38 sipariş dosyaya. Sistem dosyalarındaki navlun / lokal 35 bookinge `dosya` kaynağıyla taşındı
  (navlun ile lokal masrafı yer değiştirmiş görünen 3 açık dosya TAŞINMADI; kullanıcıya soruldu).
- DERS: aynı tabloyu tek sorgunun iki CTE'sinde güncelleme → ikinci güncelleme sessizce atlanır; ayrı sorgu.
  Çok ifadeli çağrıda bir ifade hata verirse hepsi geri alınır.
- Sıradaki: navlun formu (girişsiz, öneri = hattın son fiyatı), `/siparisler` sayfası + Excel'e aktar,
  17:00 Sipariş Raporu (execution@, bbt@, export@, export2@; fiyat görünür), yedeğe yeni tablolar, Kontrol Merkezi 12 ay.
