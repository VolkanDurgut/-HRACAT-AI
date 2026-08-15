"use client";

import React from "react";
import { CARD_BG, CARD_BORDER } from "@/lib/theme";

export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border p-6 animate-pulse" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="h-8 w-8 rounded-lg mb-3" style={{ backgroundColor: CARD_BORDER }}></div>
      <div className="h-4 rounded w-2/3 mb-3" style={{ backgroundColor: CARD_BORDER }}></div>
      <div className="h-8 rounded w-1/3" style={{ backgroundColor: CARD_BORDER }}></div>
    </div>
  );
}

export function FileCardSkeleton() {
  return (
    <div className="rounded-xl border p-5 animate-pulse" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[280px]">
          <div className="h-5 rounded w-20 mb-2" style={{ backgroundColor: CARD_BORDER }}></div>
          <div className="h-6 rounded w-40 mb-3" style={{ backgroundColor: CARD_BORDER }}></div>
          <div className="space-y-2">
            <div className="h-4 rounded w-32" style={{ backgroundColor: CARD_BORDER }}></div>
            <div className="h-4 rounded w-28" style={{ backgroundColor: CARD_BORDER }}></div>
            <div className="h-4 rounded w-24" style={{ backgroundColor: CARD_BORDER }}></div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-3 rounded w-16 mb-1" style={{ backgroundColor: CARD_BORDER }}></div>
              <div className="h-4 rounded w-28" style={{ backgroundColor: CARD_BORDER }}></div>
            </div>
          ))}
        </div>
        <div className="lg:w-[240px] space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-3 rounded w-20 mb-1" style={{ backgroundColor: CARD_BORDER }}></div>
              <div className="h-4 rounded w-32" style={{ backgroundColor: CARD_BORDER }}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border overflow-hidden animate-pulse" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="border-b px-4 py-3 flex gap-4" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 rounded flex-1" style={{ backgroundColor: CARD_BORDER }}></div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-4" style={{ borderColor: CARD_BORDER }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 rounded flex-1" style={{ backgroundColor: CARD_BORDER }}></div>
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
          <div className="h-7 rounded w-48 mb-2" style={{ backgroundColor: CARD_BORDER }}></div>
          <div className="h-4 rounded w-32" style={{ backgroundColor: CARD_BORDER }}></div>
        </div>
        <div className="h-9 rounded w-40" style={{ backgroundColor: CARD_BORDER }}></div>
      </div>
      <div className="flex gap-1 border-b" style={{ borderColor: CARD_BORDER }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 rounded w-28 mb-px" style={{ backgroundColor: CARD_BORDER }}></div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border p-6 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3 rounded w-20 mb-2" style={{ backgroundColor: CARD_BORDER }}></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 rounded" style={{ backgroundColor: CARD_BORDER }}></div>
                <div className="h-8 rounded" style={{ backgroundColor: CARD_BORDER }}></div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-6 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          {[1, 2].map((i) => (
            <div key={i}>
              <div className="h-3 rounded w-20 mb-2" style={{ backgroundColor: CARD_BORDER }}></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 rounded" style={{ backgroundColor: CARD_BORDER }}></div>
                <div className="h-8 rounded" style={{ backgroundColor: CARD_BORDER }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
