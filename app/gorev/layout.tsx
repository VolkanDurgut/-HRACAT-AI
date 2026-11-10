import type { Metadata } from "next";

// PAZAR "Bugunku musteriniz" gorev sayfasi (10.11.2026): girissiz, gunluk maildeki tokenli baglanti.
// Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Bugünkü Müşteriniz · UNEX Satış",
  description: "UNEX Gıda satış görevi",
  robots: { index: false, follow: false },
};

export default function GorevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
