"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { LayoutDashboard, FolderOpen, FolderPlus, Archive, LogOut, Menu, X, Weight, BarChart3, User, Anchor, Settings, ChevronDown, ShieldCheck, Ship } from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  yetkiKey: keyof import("@/lib/auth-context").SayfaYetkileri;
};

const mainItems: MenuItem[] = [
  { label: "Dashboard",     href: "/dashboard",  icon: <LayoutDashboard size={18} />, yetkiKey: "dashboard" },
  { label: "Ana Panel",     href: "/panel",       icon: <FolderOpen size={18} />,      yetkiKey: "panel" },
  { label: "Yeni Dosya Aç", href: "/yeni-dosya", icon: <FolderPlus size={18} />,      yetkiKey: "yeni_dosya" },
  { label: "İhracatlar",    href: "/ihracatlar",  icon: <Archive size={18} />,         yetkiKey: "ihracatlar" },
];

const opsItems: MenuItem[] = [
  { label: "ETD/ETA",       href: "/etd-eta", icon: <Ship size={18} />,      yetkiKey: "etd_eta" },
  { label: "Kantar Paneli", href: "/kantar",  icon: <Weight size={18} />,    yetkiKey: "kantar" },
  { label: "Analiz",        href: "/analiz",  icon: <BarChart3 size={18} />, yetkiKey: "analiz" },
];

const ayarlarAltMenu = [
  { label: "Yetkilendirme", href: "/ayarlar/yetkilendirme", icon: <ShieldCheck size={15} /> },
];

const NAVY = "#14213D";

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, user, yetkiler } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(pathname.startsWith("/ayarlar"));

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  };

  const closeMobile = () => setMobileOpen(false);

  const renderItem = (item: MenuItem) => {
    const active = isActive(item.href);
    const accessible = yetkiler.sayfa_yetkileri[item.yetkiKey];

    if (accessible) {
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={closeMobile}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 ${
            active ? "font-medium text-white" : "text-slate-500 font-medium hover:bg-slate-100 hover:text-slate-700"
          }`}
          style={active ? { backgroundColor: NAVY } : undefined}
        >
          <span className="shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      );
    }

    return (
      <div
        key={item.href}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 cursor-not-allowed select-none"
        title="Bu bölüme erişim yetkiniz yok"
      >
        <span className="shrink-0">{item.icon}</span>
        <span>{item.label}</span>
      </div>
    );
  };

  const navContent = (
    <>
      <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: NAVY }}>
          <Anchor size={17} className="text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-[15px] leading-tight" style={{ color: NAVY }}>İhracat AI</h1>
          <p className="text-slate-400 text-[11px]">Export Management</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {mainItems.map(renderItem)}

        <div className="pt-3 pb-2 px-3">
          <div className="h-px bg-slate-200" />
        </div>

        {opsItems.map(renderItem)}

        {/* Ayarlar accordion */}
        {yetkiler.sayfa_yetkileri.ayarlar ? (
          <div>
            <button
              onClick={() => setAyarlarAcik(!ayarlarAcik)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                pathname.startsWith("/ayarlar")
                  ? "text-amber-600"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <span className="shrink-0"><Settings size={18} /></span>
              <span className="flex-1 text-left">Ayarlar</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${ayarlarAcik ? "rotate-180" : ""}`}
              />
            </button>
            {ayarlarAcik && (
              <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-3">
                {ayarlarAltMenu.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors duration-150 ${
                      isActive(item.href)
                        ? "font-medium text-amber-600 bg-amber-50"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 cursor-not-allowed select-none"
            title="Bu bölüme erişim yetkiniz yok"
          >
            <span className="shrink-0"><Settings size={18} /></span>
            <span>Ayarlar</span>
          </div>
        )}
      </nav>

      <div className="px-3 pb-3 pt-2 border-t border-slate-200 space-y-1">
        {user?.email && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <User size={13} className="text-slate-400" />
            </div>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={() => { signOut(); closeMobile(); }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150"
        >
          <LogOut size={18} />
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-[60] md:hidden p-2 rounded-lg text-white shadow-lg transition-transform duration-150 active:scale-95"
        style={{ backgroundColor: NAVY }}
      >
        <Menu size={22} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[55] bg-black/40 md:hidden transition-opacity duration-200" onClick={closeMobile} />
      )}

      <aside
        className={`fixed left-0 top-0 bottom-0 w-[240px] flex flex-col z-[56] bg-white border-r-2 border-slate-200 transition-transform duration-300 ease-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button onClick={closeMobile} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={20} />
        </button>
        {navContent}
      </aside>

      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[240px] flex-col z-50 bg-white border-r-2 border-slate-200">
        {navContent}
      </aside>
    </>
  );
}