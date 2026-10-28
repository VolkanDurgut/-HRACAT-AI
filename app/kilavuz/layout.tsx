import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Kılavuzu · Unex Gıda İhracat AI",
  robots: { index: false, follow: false },
};

export default function KilavuzLayout({ children }: { children: React.ReactNode }) {
  return children;
}
