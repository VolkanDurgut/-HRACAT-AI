"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
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
};

// "/ayarlar" (ve alt sayfaları, örn. /ayarlar/yetkilendirme) BİLEREK yukarıdaki
// haritaya dahil edilmedi. Bu bölüm artık "sayfa_yetkileri.ayarlar" bayrağıyla
// değil, sabit süper-admin e-posta listesiyle (bkz. lib/auth-context.tsx)
// kontrol ediliyor — aşağıdaki isAyarlarPath + isSuperAdmin kontrolüne bakın.
const AYARLAR_PREFIX = "/ayarlar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, yetkiler, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "";

  const isAyarlarPath = pathname.startsWith(AYARLAR_PREFIX);

  // Bu render için "bu sayfayı görmeye yetkili mi" sorusunun cevabı — hem
  // yönlendirme efektinde hem de aşağıdaki render kapısında (gate) AYNI
  // mantık kullanılır, ikisi arasında tutarsızlık olmaz.
  const authorized = useMemo(() => {
    if (isAyarlarPath) return isSuperAdmin;
    const yetkiKey = Object.entries(SAYFA_YETKI_MAP).find(([path]) => pathname.startsWith(path))?.[1];
    if (!yetkiKey) return true; // haritada olmayan yollar (örn. "/") kısıtlanmıyor
    return !!yetkiler.sayfa_yetkileri[yetkiKey];
  }, [isAyarlarPath, isSuperAdmin, pathname, yetkiler]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (pathname !== "/" && !authorized) {
      if (isAyarlarPath) {
        router.replace("/panel");
        return;
      }
      const gidilecek = Object.entries(SAYFA_YETKI_MAP).find(
        ([, key]) => yetkiler.sayfa_yetkileri[key]
      )?.[0];
      router.replace(gidilecek || "/panel");
    }
  }, [user, loading, authorized, isAyarlarPath, yetkiler, router, pathname]);

  // ÖNEMLİ — GERÇEK GATE:
  // Önceki sürümde bu bileşen yetkisiz durumda SADECE yönlendirme
  // tetikliyordu ama içeriği ("children") her koşulda render ediyordu.
  // Yönlendirme (router.replace) bir sonraki tick'te gerçekleştiği için,
  // arada geçen kısa sürede gerçek veriler ve butonlar ekrana basılıyor,
  // kısıtlı bir kullanıcı bu pencerede sayfayla etkileşime girebiliyordu.
  // Şimdi: oturum/izin bilgisi netleşene kadar VEYA yetkisiz olduğu
  // kesinleşince, "children" hiç render edilmiyor — sadece yönlendirme
  // gerçekleşene kadar nötr bir yükleniyor ekranı gösteriliyor.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B0F14" }}>
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) return null;

  if (pathname !== "/" && !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B0F14" }}>
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

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