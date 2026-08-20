"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/sidebar";
import DestekWidget from "@/components/destek-widget";
import { Loader2 } from "lucide-react";

const SAYFA_YETKI_MAP: Record<string, keyof import("@/lib/auth-context").SayfaYetkileri> = {
  "/dashboard": "dashboard",
  "/panel": "panel",
  "/yeni-dosya": "yeni_dosya",
  "/ihracatlar": "ihracatlar",
  "/etd-eta": "etd_eta",
  "/analiz": "analiz",
  "/kantar": "kantar",
  "/ayarlar": "ayarlar",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, yetkiler } = useAuth();
  const router = useRouter();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!loading && user && pathname !== "/") {
      const yetkiKey = Object.entries(SAYFA_YETKI_MAP).find(([path]) => pathname.startsWith(path))?.[1];
      if (yetkiKey && !yetkiler.sayfa_yetkileri[yetkiKey]) {
        const gidilecek = Object.entries(SAYFA_YETKI_MAP).find(
          ([, key]) => yetkiler.sayfa_yetkileri[key]
        )?.[0];
        router.replace(gidilecek || "/panel");
      }
    }
  }, [user, loading, yetkiler, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B0F14" }}>
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: "#0B0F14" }}>
      <Sidebar />
      <main className="md:ml-[240px] min-h-screen w-full md:w-[calc(100%-240px)] max-w-full overflow-x-hidden">
        <div className="p-4 md:p-6 pt-16 md:pt-6">{children}</div>
      </main>
      <DestekWidget />
    </div>
  );
}