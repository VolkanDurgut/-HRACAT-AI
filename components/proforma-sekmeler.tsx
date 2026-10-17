"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Package, ScrollText, ArrowLeft } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Proforma AYARLARI alt menusu (17.10.2026, sadelestirme). Gunluk kullanim
 * /proformalar (Yeni Proforma) ekranidir; bu sekmeler yalnizca kalici kartlar,
 * urun listesi ve sablon metinleri icindir. Hepsi "proformalar" yetkisiyle.
 */
const SEKMELER = [
  { href: "/proformalar/musteriler", etiket: "Müşteri Kartları", ikon: Users },
  { href: "/proformalar/urunler", etiket: "Ürünler", ikon: Package },
  { href: "/proformalar/sablon", etiket: "Şablon Metinleri", ikon: ScrollText },
];

export function ProformaSekmeler() {
  const pathname = usePathname() || "";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Link href="/proformalar" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>
        <ArrowLeft size={14} /> Yeni Proforma
      </Link>
      <nav className="flex flex-wrap gap-1 rounded-xl border p-1 w-fit max-w-full" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="Proforma ayarları">
        {SEKMELER.map(({ href, etiket, ikon: Ikon }) => {
          const aktif = pathname.startsWith(href);
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
    </div>
  );
}
