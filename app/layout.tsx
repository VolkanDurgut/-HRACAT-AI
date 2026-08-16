import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast-context";
import ProgressBar from "@/components/progress-bar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "İhracat AI - Export Management System",
  description: "Türk İhracat Yönetim Sistemi",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <AuthProvider>
          <ToastProvider>
            <ProgressBar />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
