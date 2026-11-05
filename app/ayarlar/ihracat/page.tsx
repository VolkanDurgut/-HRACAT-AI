"use client";

// 05.11.2026: "Ihracat Ayarlari" (Varsayilan DIIB No) KALDIRILDI. Kullanici: "DIIB takibini ekledigimize
// gore Ayarlar kismindaki DIIB numarasi kaldirilmali; her ihracat dosyasinda guncel DIIB otomatik
// doldurulmali." Yeni dosyanin DIIB No'su artik DIIB Takibi'nden (lib/diib/veri.ts guncelDiibNoGetir).
// Eski baglantilar / yer imleri bozulmasin diye sayfa DIIB Takibi'ne yonlendirir.
// companies.varsayilan_diib_no kolonu veritabaninda duruyor (okunmuyor; veri silinmedi).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function IhracatAyarlariPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/diib"); }, [router]);
  return null;
}
