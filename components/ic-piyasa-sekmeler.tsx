"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Users, ClipboardList, Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Ic Piyasa alt menusu (12.10.2026): Fiyat Formu / Is Emirleri / Bildirimler /
 * Musteriler. Hepsi ayni "ic_piyasa" sayfa yetkisiyle acilir (AppShell
 * /ic-piyasa onekini yetkiye esler). Bildirimler'de gonderilmeyi bekleyen
 * musteri mesaji sayisi rozet olarak gorunur.
 */
// 22.10.2026: Is Emirleri ilk sekme ve menunun acilis sayfasi; Fiyat Formu sona alindi
// (adresi /ic-piyasa olarak kaldi - yer imleri bozulmasin).
const SEKMELER = [
  { href: "/ic-piyasa/is-emirleri", etiket: "İş Emirleri", ikon: ClipboardList },
  { href: "/ic-piyasa/bildirimler", etiket: "Bildirimler", ikon: Bell },
  { href: "/ic-piyasa/musteriler", etiket: "Müşteriler", ikon: Users },
  { href: "/ic-piyasa", etiket: "Fiyat Formu", ikon: FileText },
];

/** Sayfa verisi degisince (is emri acildi, mesaj isaretlendi) rozet hemen tazelensin. */
export function bildirimSayaciniYenile() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ic-bildirim-yenile"));
}

export function IcPiyasaSekmeler() {
  const pathname = usePathname() || "";
  const { companyId } = useAuth();
  const [bekleyen, setBekleyen] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let iptal = false;
    const say = async () => {
      const { count } = await supabase.from("ic_bildirimler").select("id", { count: "exact", head: true })
        // Elle gonderilecek musteri mesajlari: WhatsApp + musteri e-postasi (23.10.2026)
        .eq("company_id", companyId).eq("durum", "bekliyor").or("kanal.eq.whatsapp,alici.eq.musteri");
      if (!iptal) setBekleyen(count || 0);
    };
    say();
    const z = window.setInterval(() => { if (document.visibilityState === "visible") say(); }, 60_000);
    window.addEventListener("ic-bildirim-yenile", say);
    return () => { iptal = true; window.clearInterval(z); window.removeEventListener("ic-bildirim-yenile", say); };
  }, [companyId, pathname]);

  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border p-1 w-fit max-w-full" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="İç Piyasa bölümleri">
      {SEKMELER.map(({ href, etiket, ikon: Ikon }) => {
        const aktif = href === "/ic-piyasa" ? pathname === "/ic-piyasa" : pathname.startsWith(href);
        const rozet = href === "/ic-piyasa/bildirimler" && bekleyen > 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={aktif ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${aktif ? "text-white" : "hover:bg-white/5"}`}
            style={aktif ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}
          >
            <Ikon size={14} /> {etiket}
            {rozet && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-[18px] text-center bg-amber-500 text-black" aria-label={`${bekleyen} mesaj bekliyor`}>{bekleyen}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
