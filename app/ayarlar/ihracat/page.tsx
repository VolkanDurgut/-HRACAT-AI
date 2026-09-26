"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { useRouter } from "next/navigation";
import { FileCog, Loader2, Save } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

export default function IhracatAyarlariPage() {
  const { companyId, isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [varsayilanDiibNo, setVarsayilanDiibNo] = useState("");
  const [kayitliDeger, setKayitliDeger] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // AppShell zaten /ayarlar/* icin isSuperAdmin kontrolu yapip yonlendiriyor;
  // buradaki kontrol ikinci bir güvenlik katmanı (defense-in-depth) - bkz.
  // app/ayarlar/yetkilendirme/page.tsx'teki ayni desen.
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace("/panel");
  }, [authLoading, isSuperAdmin, router]);

  const fetchAyar = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("companies")
      .select("varsayilan_diib_no")
      .eq("id", companyId)
      .single();
    const deger = (data as any)?.varsayilan_diib_no || "";
    setVarsayilanDiibNo(deger);
    setKayitliDeger(deger);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchAyar(); }, [fetchAyar]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({ varsayilan_diib_no: varsayilanDiibNo || null })
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      showToast(`Kaydedilemedi: ${error.message}`, "error");
      return;
    }
    setKayitliDeger(varsayilanDiibNo);
    showToast("Varsayılan DİİB No kaydedildi.", "success");
  };

  const degisiklikVarMi = varsayilanDiibNo !== (kayitliDeger || "");

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-2">
        <FileCog size={20} style={{ color: ACCENT }} />
        <h1 className="text-xl font-bold text-white">İhracat Ayarları</h1>
      </div>

      <div className="rounded-xl border shadow-sm p-5 max-w-xl animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <label className="block text-sm font-semibold mb-1 text-white">Varsayılan DİİB No</label>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
          Bu alana girdiğiniz değer, bundan sonra <b>Yeni Dosya Aç</b> ile açılan her
          dosyanın DİİB No alanına otomatik olarak yazılır. Dahilde işleme rejimi
          limiti dolup DİİB No değiştiğinde buradan güncelleyin — siz burayı tekrar
          değiştirene kadar yeni açılan tüm dosyalarda aynı değer kullanılır.
          Zaten açık olan dosyaları etkilemez; onlar Ek Bilgiler kartından ayrı ayrı
          güncellenebilir.
        </p>
        <input
          value={varsayilanDiibNo}
          onChange={(e) => setVarsayilanDiibNo(e.target.value)}
          placeholder="2026-D2-04219  19.08.2026"
          className="w-full px-3 py-2 border rounded-lg text-sm text-white"
          style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !degisiklikVarMi}
          className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: ACCENT, color: "white" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Kaydet
        </button>
      </div>
    </AppShell>
  );
}
