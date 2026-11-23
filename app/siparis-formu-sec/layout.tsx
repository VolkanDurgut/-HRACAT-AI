import type { Metadata } from "next";

// SIPARIS BILDIRIM FORMU - lojistik secim sayfasi (23.11.2026): girissiz, sabah mailindeki tokenli baglanti.
// Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Sipariş Bildirim Formu · Lojistik",
  description: "UNEX Gıda sipariş bildirim formu seçimi",
  robots: { index: false, follow: false },
};

export default function SiparisFormuSecLayout({ children }: { children: React.ReactNode }) {
  return children;
}
