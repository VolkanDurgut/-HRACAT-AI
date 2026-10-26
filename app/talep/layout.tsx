import type { Metadata } from "next";

// Departman satin alma talebi (26.10.2026): girissiz, departmana ozel kalici baglanti.
// Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Satın Alma Talebi · Unex Gıda",
  description: "Unex Gıda departman ihtiyaç listesi",
  robots: { index: false, follow: false },
};

export default function TalepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
