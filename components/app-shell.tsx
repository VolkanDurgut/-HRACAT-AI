"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import Sidebar from "@/components/sidebar";
import DestekWidget from "@/components/destek-widget";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { PAGE_BG, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

const SAYFA_YETKI_MAP: Record<string, keyof import("@/lib/auth-context").SayfaYetkileri> = {
  "/dashboard": "dashboard",
  "/panel": "panel",
  "/yeni-dosya": "yeni_dosya",
  "/ihracatlar": "ihracatlar",
  "/etd-eta": "etd_eta",
  "/analiz": "analiz",
  "/kantar": "kantar",
  "/draft-onay": "draft_onay",
};

// "/ayarlar" (ve alt sayfaları, örn. /ayarlar/yetkilendirme) BİLEREK yukarıdaki
// haritaya dahil edilmedi. Bu bölüm artık "sayfa_yetkileri.ayarlar" bayrağıyla
// değil, sabit süper-admin e-posta listesiyle (bkz. lib/auth-context.tsx)
// kontrol ediliyor — aşağıdaki isAyarlarPath + isSuperAdmin kontrolüne bakın.
const AYARLAR_PREFIX = "/ayarlar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, yetkiler, isSuperAdmin, signOut } = useAuth();
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

  // Yetkisiz bir sayfadaysa gidilecek yer: kullanicinin erisebildigi ILK sayfa
  // (lib/yetki-utils.ts). Hic sayfa yetkisi yoksa null - bu durumda
  // YONLENDIRME YAPILMAZ, asagida "Erisim yetkiniz yok" ekrani gosterilir.
  // (Duzeltme 01.10.2026: eskiden hedef bulunamayinca "/panel"e, oradan "/"a,
  // oradan "/dashboard"a yonlendirilip sonsuz dongude bitmeyen bir yukleniyor
  // ekraninda kaliniyordu.)
  const yonlendirmeHedefi = useMemo(
    () => ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri),
    [yetkiler]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (pathname !== "/" && !authorized && yonlendirmeHedefi && yonlendirmeHedefi !== pathname) {
      router.replace(yonlendirmeHedefi);
    }
  }, [user, loading, authorized, yonlendirmeHedefi, router, pathname]);

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
    if (!yonlendirmeHedefi) {
      // Kullanicinin HICBIR sayfa yetkisi yok: bitmeyen yukleniyor ekrani
      // yerine ne oldugunu acikca soyleyen bir ekran + cikis butonu.
      return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: PAGE_BG }}>
          <div className="w-full max-w-md rounded-xl border p-8 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <ShieldAlert size={36} className="mx-auto mb-4 text-amber-400" />
            <h1 className="text-lg font-bold text-white mb-2">Erişim yetkiniz yok</h1>
            <p className="text-sm leading-relaxed mb-1" style={{ color: TEXT_MUTED }}>
              Hesabınıza henüz hiçbir sayfa için yetki tanımlanmamış. Erişim için yöneticinizle iletişime geçin.
            </p>
            {user.email && (
              <p className="text-xs mb-6" style={{ color: TEXT_MUTED }}>{user.email}</p>
            )}
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 transition-colors text-white"
              style={{ borderColor: CARD_BORDER }}
            >
              <LogOut size={14} /> Çıkış Yap
            </button>
          </div>
        </div>
      );
    }
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