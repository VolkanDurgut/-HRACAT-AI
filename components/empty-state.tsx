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
    <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex justify-center mb-4 text-slate-300">{icon}</div>
      <p className="text-slate-500 text-lg font-medium">{title}</p>
      {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
