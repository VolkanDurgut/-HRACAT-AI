"use client";
import React, { useState } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

type Variant = "warning" | "danger" | "info";
type Position = "top" | "bottom";
type Align = "center" | "left" | "right";

type Props = {
  /** Tooltip icinde gosterilecek metin. Kalin baslik icin **metin** kullanabilirsiniz (basit markdown destegi yok, JSX verin). */
  children: React.ReactNode;
  /** Ikon rengi/tonu: warning (sari/amber), danger (kirmizi), info (mavi/gri) */
  variant?: Variant;
  /** Tooltip'in ikona gore konumu */
  position?: Position;
  /** Tooltip'in yatay hizalamasi. right = tooltip sola dogru acilir (sag kenardaki ikonlar icin). */
  align?: Align;
  /** Tooltip genisligi (Tailwind width sinifi) */
  width?: string;
  /** Ikon boyutu */
  size?: number;
  /** Ikon yaninda kucuk bir metin rozeti de gostermek icin (opsiyonel) */
  badge?: string;
};

const variantStyles: Record<Variant, { icon: React.ElementType; color: string; badgeBg: string }> = {
  warning: { icon: AlertCircle, color: "text-amber-500 hover:text-amber-600", badgeBg: "bg-amber-50 text-amber-600" },
  danger: { icon: AlertTriangle, color: "text-red-500 hover:text-red-600", badgeBg: "bg-red-50 text-red-600" },
  info: { icon: Info, color: "text-slate-400 hover:text-slate-500", badgeBg: "bg-slate-100 text-slate-500" },
};

/**
 * Ortak bilgi/uyari ikonu + hover tooltip component'i.
 * Tum proje boyunca tutarli bir bildirim gorseli saglamak icin kullanilir.
 *
 * Ornek kullanim:
 * <InfoTooltip variant="warning">
 *   <span className="font-semibold text-amber-600">Konteyner adedi gerekli.</span> Rezervasyon sekmesinden ekleyin.
 * </InfoTooltip>
 */
export default function InfoTooltip({
  children,
  variant = "warning",
  position = "top",
  align = "center",
  width = "w-56",
  size = 13,
  badge,
}: Props) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, color, badgeBg } = variantStyles[variant];

  const positionClasses = position === "top"
    ? "bottom-full mb-1.5"
    : "top-full mt-1.5";

  // Yatay hizalama: right => tooltip sola dogru acilir (ekran sagindan tasmayi onler)
  const alignClasses =
    align === "right" ? "right-0" :
    align === "left"  ? "left-0"  :
    "left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.preventDefault()}
        className={`inline-flex items-center gap-1 ${color} transition-colors`}
      >
        <Icon size={size} />
        {badge && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute ${alignClasses} ${positionClasses} ${width} max-w-[calc(100vw-2rem)] p-2.5 rounded-lg shadow-lg border bg-white z-20 animate-fade-in`}
          style={{ borderColor: "#E2E8F0" }}
        >
          <p className="text-xs text-slate-700 leading-relaxed">{children}</p>
        </div>
      )}
    </div>
  );
}
