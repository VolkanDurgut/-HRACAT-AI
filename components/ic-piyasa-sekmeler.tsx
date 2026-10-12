"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Users, ClipboardList } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Ic Piyasa alt menusu (12.10.2026): Fiyat Formu / Is Emirleri / Musteriler.
 * Hepsi ayni "ic_piyasa" sayfa yetkisiyle acilir (AppShell /ic-piyasa onekini
 * yetkiye esler).
 */
const SEKMELER = [
  { href: "/ic-piyasa", etiket: "Fiyat Formu", ikon: FileText },
  { href: "/ic-piyasa/is-emirleri", etiket: "İş Emirleri", ikon: ClipboardList },
  { href: "/ic-piyasa/musteriler", etiket: "Müşteriler", ikon: Users },
];

export function IcPiyasaSekmeler() {
  const pathname = usePathname() || "";
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border p-1 w-fit max-w-full" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="İç Piyasa bölümleri">
      {SEKMELER.map(({ href, etiket, ikon: Ikon }) => {
        const aktif = href === "/ic-piyasa" ? pathname === "/ic-piyasa" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={aktif ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${aktif ? "text-white" : "hover:bg-white/5"}`}
            style={aktif ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}
          >
            <Ikon size={14} /> {etiket}
          </Link>
        );
      })}
    </nav>
  );
}
