"use client";
import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  loading = false,
  loadingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <AlertDialogContent style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription style={{ color: TEXT_MUTED }}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            className="hover:bg-white/5 hover:text-white"
            style={{ backgroundColor: "transparent", borderColor: CARD_BORDER, color: TEXT_MUTED }}
          >
            {cancelLabel || "Hayır"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { if (loading) { e.preventDefault(); return; } onConfirm(); }}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 text-white ${destructive ? "bg-red-600 hover:bg-red-700" : "hover:brightness-110"} ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
            style={destructive ? undefined : { backgroundColor: ACCENT }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? (loadingLabel || "İşleniyor...") : (confirmLabel || "Evet")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}