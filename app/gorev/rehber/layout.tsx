import type { Metadata } from "next";

// PAZAR Satis Rehberi (10.11.2026): girissiz, animasyonlu anlatim. Arama motorlarina kapali.
export const metadata: Metadata = {
  title: "Satış Rehberi · UNEX Satış",
  description: "Bugünkü müşteriniz: günlük satış görevinin adım adım anlatımı",
  robots: { index: false, follow: false },
};

export default function RehberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
