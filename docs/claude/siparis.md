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
- Sıradaki: `/siparisler` sayfası + Excel'e aktar, 17:00 Sipariş Raporu (execution@, bbt@, export@, export2@; fiyat
  görünür), yedeğe yeni tablolar, Kontrol Merkezi 12 ay.

## 4.2 Navlun formu → KALDIRILDI; yerine Navlun Bildirimi (10.11.2026)

- Elle girişli navlun formu kuruldu (migration `20261110130000_navlun_formu.sql`, edge `navlun-formu`) ve kullanıcı
  itirazıyla AYNI GÜN kaldırıldı: "Formu birisi doldurmayacak, form maillerden güncellenecek. Bizim doldurabileceğimiz
  bir alan olmamalı; sistem yalnız hatayla karşılaşınca müdahale edebileceğimiz bir alan olmalı." → migration
  `20261110140000_navlun_formu_kaldir.sql` (tablo + 4 fonksiyon drop); edge `navlun-formu` 410 "kullanım dışı" (panelden
  silinebilir). Formdan HİÇ veri yazılmadı. Sayfa / istemci kodu hiç yayına çıkmadı. GERİ EKLENMEZ.
- Kalan veri düzeltmesi (kullanıcı onayı): IHR-2026-0113 / 0114 / 0115'te navlun ile lokal masraf yer değiştirmişti →
  takas edildi (faturası / talimatı olmayan dosyalar; CI navlunu buradan okur), plana da yansıdı.
- Kullanıcının asıl istediği: "Hangi şirketin nereye ne kadar navlun verdiği; sürekli kendini güncel tutan bir navlun
  bildirimi." Kaynak: operation@'ın acentelere sorduğu "UNEX // <LİMAN> // NAVLUN TALEBİ HK." yazışmaları (execution@
  CC → arşiv Gmail). Teklif biçimleri: kısa metin ("Usd 875/20dc · Cma"), yapılandırılmış metin (MSC POL/POD/VALIDITY,
  Horoz, K+N), PDF ek (Link, K+N). Hedef fiyat yazışması ("Hedef mevcut mudur?") ve kabul ("Navlun rakamı 1800 Usd
  olmak üzere … rezervasyon talebimiz") da okunacak. Arşiv 26.10.2026'dan beri dolu; öncesi için execution@ kutusundan
  Gmail'e tek seferlik içe aktarma (Apps Script `tara` eski tarihli mailleri işlemez: `after:` + mail tarihi kontrolü).
