import React from "react";

/**
 * Evraklar > "İhracat Evrakları" listesinde satır sonundaki ikon sütunu
 * (düzen: 02.10.2026). Her satırın sağında SABİT genişlikte bir yuva vardır:
 * [düzenle (kalem)]. İkonu olmayan satırda yuva boş ama aynı
 * genişlikte kalır - böylece Draft / Orijinal butonları tüm satırlarda aynı
 * hizaya oturur. Yeni bir satır ikonu eklerken bu yuvayı kullanın; butonların
 * yanına doğrudan ikon EKLEMEYİN (hizayı kaydırır).
 */
export function EvrakIkonYuvasi({ children }: { children?: React.ReactNode }) {
  return <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center">{children}</span>;
}

/** Yuvadaki ikon butonunun ortak görünümü (kalem). */
export const EVRAK_IKON_BUTON_SINIFI =
  "inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors";
