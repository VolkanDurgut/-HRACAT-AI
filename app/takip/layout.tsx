import type { Metadata } from "next";

// Musteri takip sayfasi: arama motorlarina kapali (baglanti kisiye ozel).
export const metadata: Metadata = {
  title: "Sipariş Takibi · Unex Gıda",
  description: "Unex Gıda sipariş ve sevkiyat takibi",
  robots: { index: false, follow: false },
};

export default function TakipLayout({ children }: { children: React.ReactNode }) {
  return children;
}
