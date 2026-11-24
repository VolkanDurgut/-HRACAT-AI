"use client";
/** Navlun Merkezi ortak parcalari (24.11.2026). Gorunum mevcut navlun sayfasiyla ayni dilde (koyu tema, rozetler). */
import React from "react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import type { DegerlendirmeDurumu, GerceklesenDurumu } from "@/lib/navlun/merkez";

export type RozetRengi = "yesil" | "sari" | "gri" | "mavi" | "kirmizi" | "mor";
const RENK: Record<RozetRengi, [string, string]> = {
  yesil: ["rgba(16,185,129,0.14)", "#6EE7B7"], sari: ["rgba(251,191,36,0.14)", "#FCD34D"], gri: ["rgba(148,163,184,0.12)", "#94A3B8"],
  mavi: ["rgba(96,165,250,0.14)", "#93C5FD"], kirmizi: ["rgba(239,68,68,0.14)", "#FCA5A5"], mor: ["rgba(167,139,250,0.14)", "#C4B5FD"],
};

export function Rozet({ metin, renk, title }: { metin: string; renk: RozetRengi; title?: string }) {
  const r = RENK[renk];
  return <span title={title} className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: r[0], color: r[1] }}>{metin}</span>;
}

export const DURUM_ROZETI: Record<DegerlendirmeDurumu, [string, RozetRengi]> = {
  kesin: ["kesin", "yesil"], kontrol: ["kontrol", "kirmizi"], eksik: ["lokal belirsiz", "sari"], suresi_doldu: ["süresi doldu", "gri"],
};
export const GERCEKLESEN_ROZETI: Record<GerceklesenDurumu, [string, RozetRengi]> = {
  tutuyor: ["tutuyor", "yesil"], eski_teklifle_tutuyor: ["eski teklifle tutuyor", "mavi"], tutmuyor: ["tutmuyor", "kirmizi"],
  teklif_yok: ["teklif yok", "gri"], fob: ["FOB", "gri"], eksik: ["bilgi eksik", "sari"],
};

export const tutarYaz = (x: number, para = "USD") => `${x.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${para === "USD" ? "$" : para === "EUR" ? "€" : para}`;
export const gunYaz = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "2-digit" });
};
export const zamanYaz = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const norm = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");

export function Kart({ children, testId, kenar }: { children: React.ReactNode; testId?: string; kenar?: string }) {
  return <div className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: kenar || CARD_BORDER }} data-testid={testId}>{children}</div>;
}

export function Bos({ metin }: { metin: string }) {
  return <p className="px-4 py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>{metin}</p>;
}

export const GIRDI = "h-8 rounded-lg border bg-transparent px-2 text-sm text-white";
