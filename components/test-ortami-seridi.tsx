"use client";
import React from "react";
import { AlertTriangle } from "lucide-react";
import { testOrtami } from "@/lib/ortam";

/**
 * TEST ORTAMI SERIDI (22.11.2026): yalniz Netlify onizlemesinde (lib/ortam.ts) her sayfanin ustunde. Onizleme canli
 * veritabanina bagli oldugu icin kullanici unutmasin: dosya acma prova modunda, diger islemler GERCEK kayittir.
 * Canli derlemede hicbir sey cizmez.
 */
export function TestOrtamiSeridi() {
  if (!testOrtami()) return null;
  return (
    <div role="status" data-testid="test-ortami-seridi"
      className="mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-2.5 text-xs"
      style={{ borderColor: "rgba(251,191,36,0.45)", backgroundColor: "rgba(251,191,36,0.10)", color: "#FDE68A" }}>
      <AlertTriangle size={15} className="shrink-0 mt-px text-amber-400" />
      <span>
        <b className="text-amber-300 uppercase tracking-wider">Test ortamı</b> · Veriler canlıdır. Proforma Yükle ve Sevkiyat aç
        burada <b>prova modunda</b>: oluşacak dosya gösterilir, kayıt yapılmaz. Diğer sayfalarda yaptığınız değişiklikler gerçek kayıttır.
      </span>
    </div>
  );
}
