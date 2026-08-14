"use client";
import React, { useState, useEffect, useRef } from "react";

/** Net, Brut, Pieces icin tek satirlik duzenlenebilir hucre. Tiklayinca input'a donusur,
 *  blur veya Enter'da kaydeder, Escape'te vazgecer. */
export function EditableCell({
  value,
  onSave,
  suffix,
  updatedByEmail,
  updatedAt,
}: {
  value: number | null;
  onSave: (newValue: number | null) => Promise<void>;
  suffix?: string;
  updatedByEmail?: string | null;
  updatedAt?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value?.toString() || "");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, value]);

  const commit = async () => {
    setSaving(true);
    const parsed = draft.trim() === "" ? null : parseFloat(draft.replace(",", "."));
    await onSave(isNaN(parsed as number) ? null : parsed);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 px-1.5 py-1 border rounded text-sm text-right text-white"
        style={{ borderColor: "#10B981", backgroundColor: "#12161F" }}
      />
    );
  }

  const tooltipText = updatedByEmail
    ? `Son güncelleyen: ${updatedByEmail}${updatedAt ? ` — ${new Date(updatedAt).toLocaleString("tr-TR")}` : ""}`
    : undefined;

  return (
    <button
      onClick={() => setEditing(true)}
      title={tooltipText}
      className="text-sm text-right w-full hover:bg-white/5 rounded px-1.5 py-1 transition-colors"
    >
      {value !== null && value !== undefined ? (
        <span className="text-white">{value.toLocaleString("tr-TR")}{suffix ? ` ${suffix}` : ""}</span>
      ) : (
        <span className="text-amber-400 italic">Gir</span>
      )}
    </button>
  );
}