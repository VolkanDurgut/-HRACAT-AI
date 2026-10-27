import type { Metadata } from "next";

// Departman satin alma talebi (26.10.2026): girissiz, departmana ozel kalici baglanti.
// Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Satın Alma Talep Formu · Unex Gıda",
  description: "Unex Gıda departman satın alma talep formu",
  robots: { index: false, follow: false },
};

export default function TalepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
