"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, FolderOpen, FileUp, Archive, LogOut, Menu, X, Weight, User, Anchor, Settings, ChevronDown, ShieldCheck, Ship, FileCheck2, FileCog, Wheat, FileSignature, ShoppingCart } from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  yetkiKey: keyof import("@/lib/auth-context").SayfaYetkileri;
};

const mainItems: MenuItem[] = [
  // 28.10.2026: eski Kontrol Merkezi (/dashboard) kaldirildi; Analiz sayfasi "Kontrol
  // Merkezi" adiyla en uste geldi (adres ve yetki "analiz" ayni). 4 ozet karti Ana Panel'de.
  { label: "Kontrol Merkezi", href: "/analiz", icon: <LayoutDashboard size={18} />, yetkiKey: "analiz" },
  { label: "Ana Panel",     href: "/panel",       icon: <FolderOpen size={18} />,      yetkiKey: "panel" },
  // Proforma olusturucu (17.10.2026): "Yeni Dosya Ac"in hemen ustunde (kullanici karari)
  { label: "Proformalar",   href: "/proformalar", icon: <FileSignature size={18} />,   yetkiKey: "proformalar" },
  // 25.10.2026: "Yeni Dosya Ac" -> "Proforma Yukle" (kullanici karari; adres ve yetki ayni)
  { label: "Proforma Yükle", href: "/yeni-dosya", icon: <FileUp size={18} />,        yetkiKey: "yeni_dosya" },
  { label: "İhracatlar",    href: "/ihracatlar",  icon: <Archive size={18} />,         yetkiKey: "ihracatlar" },
  { label: "Draft Onay",    href: "/draft-onay",  icon: <FileCheck2 size={18} />,      yetkiKey: "draft_onay" },
];

const opsItems: MenuItem[] = [
  { label: "ETD/ETA",       href: "/etd-eta", icon: <Ship size={18} />,      yetkiKey: "etd_eta" },
  { label: "Kantar Paneli", href: "/kantar",  icon: <Weight size={18} />,    yetkiKey: "kantar" },
];

// Ic Piyasa (11.10.2026): SADECE yetkisi olan kullaniciya gorunur (diger
// menulerin aksine soluk/kilitli hali de gosterilmez - bu bolum ihracat
// kullanicilarinin ekranini degistirmesin).
const icPiyasaItems: MenuItem[] = [
  // 22.10.2026: acilis sayfasi Is Emirleri (kullanici karari); tum /ic-piyasa alt sayfalarinda aktif
  { label: "İç Piyasa", href: "/ic-piyasa/is-emirleri", icon: <Wheat size={18} />, yetkiKey: "ic_piyasa" },
];

// Satin Alma (26.10.2026): departman ihtiyac listelerinin onayi. Ic Piyasa gibi
// SADECE yetkisi olana gorunur.
const sirketIciItems: MenuItem[] = [
  { label: "Satın Alma", href: "/satin-alma", icon: <ShoppingCart size={18} />, yetkiKey: "satin_alma" },
];

const ayarlarAltMenu = [
  { label: "Yetkilendirme", href: "/ayarlar/yetkilendirme", icon: <ShieldCheck size={15} /> },
  { label: "İhracat Ayarları", href: "/ayarlar/ihracat", icon: <FileCog size={15} /> },
];

const NAVY = "#10B981";
const BORDER = "#1E2530";
const TEXT_MUTED = "#8B95A5";

// Marka: "{Sirket} Ihracat AI" (gunluk rapor maili/sayfasi ile ayni). Sidebar her
// sayfada yeniden olustugu icin sirket adi modul seviyesinde bir kez okunur.
let sirketAdiOnbellek: { companyId: string; ad: string } | null = null;

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, user, yetkiler, isSuperAdmin, companyId } = useAuth();
  const [sirketAdi, setSirketAdi] = useState(
    companyId && sirketAdiOnbellek?.companyId === companyId ? sirketAdiOnbellek.ad : ""
  );

  useEffect(() => {
    if (!companyId) return;
    if (sirketAdiOnbellek?.companyId === companyId) { setSirketAdi(sirketAdiOnbellek.ad); return; }
    let iptal = false;
    supabase.from("companies").select("company_name").eq("id", companyId).maybeSingle()
      .then(({ data }) => {
        const ad = (data?.company_name || "").trim();
        if (!ad) return; // okunamazsa varsayilan "Ihracat AI" kalir
        sirketAdiOnbellek = { companyId, ad };
        if (!iptal) setSirketAdi(ad);
      });
    return () => { iptal = true; };
  }, [companyId]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(pathname.startsWith("/ayarlar"));

  const isActive = (href: string) => {
    if (href.startsWith("/ic-piyasa")) return pathname.startsWith("/ic-piyasa");
    return pathname.startsWith(href);
  };

  const closeMobile = () => setMobileOpen(false);

  // macOS tarzi (22.10.2026): yuzen, kenarlari yuvarlak cam panel; arka plan gorseli
  // her zaman acik oldugu icin yari saydam + bulanik (harita alttan sezilir).
  const panelStil: React.CSSProperties = {
    backgroundColor: "rgba(16,20,28,0.62)", borderColor: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)",
  };

  const renderItem = (item: MenuItem) => {
    const active = isActive(item.href);
    const accessible = yetkiler.sayfa_yetkileri[item.yetkiKey];

    if (accessible) {
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={closeMobile}
          aria-current={active ? "page" : undefined}
          className={`group relative flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
            active ? "text-white" : "hover:bg-white/[0.06] hover:text-white"
          }`}
          style={active ? { backgroundColor: "rgba(16,185,129,0.16)" } : { color: TEXT_MUTED }}
        >
          {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: NAVY }} />}
          <span className="shrink-0" style={active ? { color: NAVY } : undefined}>{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </Link>
      );
    }

    return (
      <div
        key={item.href}
        className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium cursor-not-allowed select-none opacity-40"
        style={{ color: TEXT_MUTED }}
        title="Bu bölüme erişim yetkiniz yok"
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </div>
    );
  };

  const Bolum = ({ baslik }: { baslik: string }) => (
    <p className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#5B6576" }}>{baslik}</p>
  );

  const basHarf = (user?.email || "?").trim().charAt(0).toLocaleUpperCase("tr");

  const navContent = (
    <>
      <Link href={ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri) || "/panel"} onClick={closeMobile} className="mx-2 mt-2 px-3 py-3 rounded-xl flex items-center gap-3 hover:bg-white/[0.05] transition-colors">
        <img src="/images/logo.png" alt="Unex" className="w-9 h-9 object-contain shrink-0" />
        <div className="min-w-0">
          {sirketAdi && <p className="text-[11px] font-medium leading-tight truncate" style={{ color: TEXT_MUTED }}>{sirketAdi}</p>}
          <h1 className="font-semibold text-[15px] leading-tight text-white">İhracat AI</h1>
        </div>
      </Link>
      <div className="mx-4 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />

      <nav className="flex-1 px-2 pb-3 overflow-y-auto overscroll-contain" aria-label="Ana menü">
        <Bolum baslik="İhracat" />
        <div className="space-y-0.5">{mainItems.map(renderItem)}</div>

        <Bolum baslik="Operasyon" />
        <div className="space-y-0.5">{opsItems.map(renderItem)}</div>

        {icPiyasaItems.some((i) => yetkiler.sayfa_yetkileri[i.yetkiKey]) && (
          <>
            <Bolum baslik="Yurt İçi" />
            <div className="space-y-0.5">{icPiyasaItems.filter((i) => yetkiler.sayfa_yetkileri[i.yetkiKey]).map(renderItem)}</div>
          </>
        )}

        {sirketIciItems.some((i) => yetkiler.sayfa_yetkileri[i.yetkiKey]) && (
          <>
            <Bolum baslik="Şirket İçi" />
            <div className="space-y-0.5">{sirketIciItems.filter((i) => yetkiler.sayfa_yetkileri[i.yetkiKey]).map(renderItem)}</div>
          </>
        )}

        {/* Ayarlar accordion — SADECE süper admin e-postaları görebilir (bkz. lib/auth-context.tsx) */}
        {isSuperAdmin ? (
          <>
            <Bolum baslik="Yönetim" />
            <button
              onClick={() => setAyarlarAcik(!ayarlarAcik)}
              aria-expanded={ayarlarAcik}
              className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              style={{ color: pathname.startsWith("/ayarlar") ? "#FFFFFF" : TEXT_MUTED }}
            >
              <span className="shrink-0"><Settings size={18} /></span>
              <span className="flex-1 text-left">Ayarlar</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${ayarlarAcik ? "rotate-180" : ""}`} />
            </button>
            {ayarlarAcik && (
              <div className="ml-[18px] mt-0.5 space-y-0.5 border-l pl-2.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                {ayarlarAltMenu.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`flex items-center gap-2 h-8 px-2 rounded-lg text-[13px] transition-colors duration-150 ${
                      isActive(item.href) ? "font-medium text-white" : "hover:bg-white/[0.06] hover:text-white"
                    }`}
                    style={{ color: isActive(item.href) ? "#FFFFFF" : TEXT_MUTED, backgroundColor: isActive(item.href) ? "rgba(16,185,129,0.16)" : undefined }}
                  >
                    <span className="shrink-0" style={isActive(item.href) ? { color: NAVY } : undefined}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : null /* Süper admin değilse Ayarlar/Yetkilendirme menüde hiç görünmez — soluk placeholder bile göstermiyoruz */}
      </nav>

      <div className="m-2 p-2 rounded-xl border space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.025)" }}>
        {user?.email && (
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #10B981, #283474)" }}>{basHarf}</span>
            <p className="text-xs leading-snug truncate min-w-0" style={{ color: TEXT_MUTED }} title={user.email}>{user.email}</p>
          </div>
        )}
        <button
          onClick={() => { signOut(); closeMobile(); }}
          className="flex items-center gap-2.5 w-full h-8 px-2 rounded-lg text-[13px] font-medium hover:bg-red-500/10 hover:text-red-400 transition-colors duration-150"
          style={{ color: TEXT_MUTED }}
        >
          <LogOut size={16} />
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Menüyü aç"
        className="fixed top-4 left-4 z-[60] md:hidden p-2 rounded-lg text-white shadow-lg transition-transform duration-150 active:scale-95"
        style={{ backgroundColor: NAVY }}
      >
        <Menu size={22} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[55] bg-black/50 md:hidden transition-opacity duration-200" onClick={closeMobile} />
      )}

      <aside
        className={`fixed left-2 top-2 bottom-2 w-[240px] flex flex-col z-[56] rounded-2xl border shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]"
        }`}
        style={panelStil}
      >
        <button onClick={closeMobile} aria-label="Menüyü kapat" className="absolute top-4 right-4 hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
          <X size={20} />
        </button>
        {navContent}
      </aside>

      {/* Masaustu: yuzen panel (sol/ust/alt 12px bosluk); icerik md:ml-[240px] ile cakismaz */}
      <aside className="hidden md:flex fixed left-3 top-3 bottom-3 w-[224px] flex-col z-50 rounded-2xl border shadow-[0_8px_32px_rgba(0,0,0,0.35)]" style={panelStil} aria-label="Kenar çubuğu">
        {navContent}
      </aside>
    </>
  );
}
