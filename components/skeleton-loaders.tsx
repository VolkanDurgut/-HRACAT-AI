"use client";

import React from "react";

export function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border p-6 animate-pulse" style={{ borderColor: "#E2E8F0" }}>
      <div className="h-8 w-8 bg-slate-200 rounded-lg mb-3"></div>
      <div className="h-4 bg-slate-200 rounded w-2/3 mb-3"></div>
      <div className="h-8 bg-slate-200 rounded w-1/3"></div>
    </div>
  );
}

export function FileCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border p-5 animate-pulse" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[280px]">
          <div className="h-5 bg-slate-200 rounded w-20 mb-2"></div>
          <div className="h-6 bg-slate-200 rounded w-40 mb-3"></div>
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 rounded w-32"></div>
            <div className="h-4 bg-slate-200 rounded w-28"></div>
            <div className="h-4 bg-slate-200 rounded w-24"></div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-3 bg-slate-200 rounded w-16 mb-1"></div>
              <div className="h-4 bg-slate-200 rounded w-28"></div>
            </div>
          ))}
        </div>
        <div className="lg:w-[240px] space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-3 bg-slate-200 rounded w-20 mb-1"></div>
              <div className="h-4 bg-slate-200 rounded w-32"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden animate-pulse" style={{ borderColor: "#E2E8F0" }}>
      <div className="border-b bg-slate-50 px-4 py-3 flex gap-4" style={{ borderColor: "#E2E8F0" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-200 rounded flex-1"></div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-4" style={{ borderColor: "#F1F5F9" }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-slate-200 rounded flex-1"></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div>
          <div className="h-7 bg-slate-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
        </div>
        <div className="h-9 bg-slate-200 rounded w-40"></div>
      </div>
      <div className="flex gap-1 border-b" style={{ borderColor: "#E2E8F0" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 bg-slate-200 rounded w-28 mb-px"></div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-6 space-y-4" style={{ borderColor: "#E2E8F0" }}>
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3 bg-slate-200 rounded w-20 mb-2"></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 bg-slate-200 rounded"></div>
                <div className="h-8 bg-slate-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border p-6 space-y-4" style={{ borderColor: "#E2E8F0" }}>
          {[1, 2].map((i) => (
            <div key={i}>
              <div className="h-3 bg-slate-200 rounded w-20 mb-2"></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 bg-slate-200 rounded"></div>
                <div className="h-8 bg-slate-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
