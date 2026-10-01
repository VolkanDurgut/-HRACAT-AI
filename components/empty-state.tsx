"use client";

import React from "react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-12 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex justify-center mb-4" style={{ color: "#3A4152" }}>{icon}</div>
      <p className="text-lg font-medium" style={{ color: TEXT_MUTED }}>{title}</p>
      {description && <p className="text-sm mt-1" style={{ color: "#5A6272" }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
