import type { Metadata } from "next";

// Unex satin alma cek listesi (26.10.2026): execution@'ye giden maildeki girissiz baglanti.
export const metadata: Metadata = {
  title: "Satın Alma Çek Listesi · Unex Gıda",
  description: "Unex Gıda onaylı satın alma çek listesi",
  robots: { index: false, follow: false },
};

export default function CekLayout({ children }: { children: React.ReactNode }) {
  return children;
}
