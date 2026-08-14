"use client";

import React from "react";

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
    <div className="rounded-xl border p-12 text-center" style={{ backgroundColor: "#12161F", borderColor: "#1E2530" }}>
      <div className="flex justify-center mb-4" style={{ color: "#3A4152" }}>{icon}</div>
      <p className="text-lg font-medium" style={{ color: "#8B95A5" }}>{title}</p>
      {description && <p className="text-sm mt-1" style={{ color: "#5A6272" }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
