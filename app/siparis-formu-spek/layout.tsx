import type { Metadata } from "next";

// SIPARIS BILDIRIM FORMU - export spek onay sayfasi (23.11.2026): girissiz, sabah mailindeki tokenli baglanti.
// Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Ürün Speki Onayı · Sipariş Bildirim Formu",
  description: "UNEX Gıda ürün speki onayı",
  robots: { index: false, follow: false },
};

export default function SiparisFormuSpekLayout({ children }: { children: React.ReactNode }) {
  return children;
}
