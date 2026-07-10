"use client";
import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel || "Hayır"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { if (loading) { e.preventDefault(); return; } onConfirm(); }}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 ${destructive ? "bg-red-600 hover:bg-red-700 text-white" : ""} ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? (loadingLabel || "İşleniyor...") : (confirmLabel || "Evet")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
