import type { Metadata } from "next";

// Lojistik cikis onayi sayfasi: arama motorlarina kapali (tek kullanimlik baglanti).
export const metadata: Metadata = {
  title: "Araç Çıkışı · Unex Gıda",
  description: "Unex Gıda lojistik araç çıkış bildirimi",
  robots: { index: false, follow: false },
};

export default function CikisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
