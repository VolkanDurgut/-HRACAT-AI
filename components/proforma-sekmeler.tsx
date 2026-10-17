"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Package, ScrollText } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Proformalar alt menusu (17.10.2026). Hepsi "proformalar" sayfa yetkisiyle
 * acilir (AppShell /proformalar onekini yetkiye esler). 2. asamada
 * "Proformalar" (liste + sihirbaz) sekmesi en basa eklenecek.
 */
const SEKMELER = [
  { href: "/proformalar", etiket: "Müşteriler", ikon: Users },
  { href: "/proformalar/urunler", etiket: "Ürünler", ikon: Package },
  { href: "/proformalar/sablon", etiket: "Şablon Metinleri", ikon: ScrollText },
];

export function ProformaSekmeler() {
  const pathname = usePathname() || "";
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border p-1 w-fit max-w-full" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="Proforma bölümleri">
      {SEKMELER.map(({ href, etiket, ikon: Ikon }) => {
        const aktif = href === "/proformalar" ? pathname === "/proformalar" : pathname.startsWith(href);
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
