"use client";

// 05.11.2026: Proforma "Ayarlar" (Musteri Kartlari / Urunler / Sablon Metinleri) KALDIRILDI.
// Kullanici: "Yeni proforma olustur kisminda ayarlar kismina artik ihtiyacimiz yok." Proformalar
// gecmis dosyalardan ve Kayitli Proformalar'dan doldurulur; tablolar (ihracat_musterileri,
// ihracat_urunleri, proforma_ayarlari) bos ve /proformalar onlari okumaya devam eder (bos ->
// varsayilan sablon). Veri silinmedi. Eski baglantilar bozulmasin diye /proformalar'a yonlendirir.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProformaMusterilerPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/proformalar"); }, [router]);
  return null;
}
