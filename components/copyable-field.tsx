"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";

export function CopyableField({
  label,
  value,
  monospace = false,
  dark = false,
}: {
  label: string;
  value: string | null | undefined;
  monospace?: boolean;
  dark?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setShowTooltip(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      setShowTooltip(false);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="group relative">
      {label && <p className={`text-xs mb-0.5 ${dark ? "text-[#8B95A5]" : "text-slate-400"}`}>{label}</p>}
      <div
        className={`flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 -mx-1 transition-colors ${dark ? "hover:bg-white/5" : "hover:bg-slate-50"}`}
        onClick={handleCopy}
      >
        <p className={`text-sm font-medium break-all ${monospace ? "font-mono tracking-tight" : ""} ${dark ? "text-white" : "text-slate-700"}`}>
          {value || "—"}
        </p>
        {value && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {copied ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} className={dark ? "text-[#8B95A5]" : "text-slate-400"} />
            )}
          </span>
        )}
      </div>
      {showTooltip && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 animate-fade-in">
          Kopyalandı!
        </div>
      )}
    </div>
  );
}
