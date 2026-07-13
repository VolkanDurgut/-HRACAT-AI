"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Save } from "lucide-react";

type KullaniciYetki = {
  user_id: string;
  email: string;
  sayfa_yetkileri: Record<string, boolean>;
  sekme_yetkileri: Record<string, boolean>;
};

const SAYFA_ETIKETLER: Record<string, string> = {
  dashboard:  "Dashboard",
  panel:      "Ana Panel",
  yeni_dosya: "Yeni Dosya Aç",
  ihracatlar: "İhracatlar",
  etd_eta:    "ETD/ETA",
  kantar:     "Kantar Paneli",
  analiz:     "Analiz",
  ayarlar:    "Ayarlar",
};

const SEKME_ETIKETLER: Record<string, string> = {
  proforma:     "Proforma",
  evraklar:     "Sevkiyat Evrakları",
  rezervasyon:  "Rezervasyon",
  konteynerler: "Konteynerler",
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value ? "bg-amber-500" : "bg-slate-200"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}

export default function YetkilendirmePage() {
  const { yetkiler, user, companyId } = useAuth(); // Global context'ten companyId alındı
  const router = useRouter();
  const { showToast } = useToast();
  const [kullanicilar, setKullanicilar] = useState<KullaniciYetki[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!yetkiler.sayfa_yetkileri.ayarlar) router.push("/panel");
  }, [yetkiler, router]);

  const fetchKullanicilar = useCallback(async () => {
    if (!user || !companyId) return; // Güvenlik duvarı kontrolü

    const { data } = await supabase
      .from("kullanici_yetkileri")
      .select("user_id, email, sayfa_yetkileri, sekme_yetkileri")
      .eq("company_id", companyId) // Sadece bu şirketin çalışanlarının yetkileri listelenir
      .order("email");

    if (!data) { setKullanicilar([]); setLoading(false); return; }

    const sorted = [...data].sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      return (a.email || "").localeCompare(b.email || "");
    });

    setKullanicilar(sorted);
    setLoading(false);
  }, [user, companyId]);

  useEffect(() => { fetchKullanicilar(); }, [fetchKullanicilar]);

  const handleToggle = (userId: string, tip: "sayfa" | "sekme", key: string, value: boolean) => {
    setKullanicilar(prev => prev.map(k => {
      if (k.user_id !== userId) return k;
      if (tip === "sayfa") return { ...k, sayfa_yetkileri: { ...k.sayfa_yetkileri, [key]: value } };
      return { ...k, sekme_yetkileri: { ...k.sekme_yetkileri, [key]: value } };
    }));
  };

  const handleSave = async (userId: string) => {
    if (!companyId) return;
    setSaving(userId);
    const k = kullanicilar.find(k => k.user_id === userId);
    if (!k) return;
    const { error } = await supabase
      .from("kullanici_yetkileri")
      .update({ sayfa_yetkileri: k.sayfa_yetkileri, sekme_yetkileri: k.sekme_yetkileri, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("company_id", companyId); // Güncelleme yetkisi şirket doğrulamasına kilitlendi
    if (error) showToast("Kayıt sırasında hata oluştu.", "error");
    else showToast("Yetkiler kaydedildi.", "success");
    setSaving(null);
  };

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-amber-500" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck size={20} style={{ color: "#1B2B4B" }} />
        <h1 className="text-xl font-bold" style={{ color: "#1B2B4B" }}>Yetkilendirme</h1>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-48">Kullanıcı</th>
                <th className="px-2 py-3 text-center text-xs font-semibold text-slate-500 border-l" style={{ borderColor: "#E2E8F0" }} colSpan={8}>
                  Sayfa Erişimi
                </th>
                <th className="px-2 py-3 text-center text-xs font-semibold text-slate-500 border-l" style={{ borderColor: "#E2E8F0" }} colSpan={4}>
                  Sekme Erişimi
                </th>
                <th className="px-4 py-3 w-20 border-l" style={{ borderColor: "#E2E8F0" }}></th>
              </tr>
              <tr className="border-b" style={{ borderColor: "#E2E8F0" }}>
                <th></th>
                {Object.values(SAYFA_ETIKETLER).map((label, i) => (
                  <th key={i} className={`px-2 py-2 text-center text-[10px] text-slate-400 font-medium ${i === 0 ? "border-l" : ""}`} style={{ borderColor: "#E2E8F0" }}>
                    {label}
                  </th>
                ))}
                {Object.values(SEKME_ETIKETLER).map((label, i) => (
                  <th key={i} className="px-2 py-2 text-center text-[10px] text-slate-400 font-medium border-l" style={{ borderColor: "#E2E8F0" }}>
                    {label}
                  </th>
                ))}
                <th className="border-l" style={{ borderColor: "#E2E8F0" }}></th>
              </tr>
            </thead>
            <tbody>
              {kullanicilar.map((k) => (
                <tr key={k.user_id} className="border-b last:border-0 hover:bg-slate-50" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{k.email || k.user_id}</p>
                      {k.user_id === user?.id && <p className="text-[10px] text-amber-600">Siz</p>}
                    </div>
                  </td>
                  {Object.keys(SAYFA_ETIKETLER).map((key, i) => (
                    <td key={key} className={`px-2 py-3 text-center ${i === 0 ? "border-l" : ""}`} style={{ borderColor: "#E2E8F0" }}>
                      <div className="flex justify-center">
                        <Toggle
                          value={!!k.sayfa_yetkileri[key]}
                          onChange={(v) => handleToggle(k.user_id, "sayfa", key, v)}
                        />
                      </div>
                    </td>
                  ))}
                  {Object.keys(SEKME_ETIKETLER).map((key) => (
                    <td key={key} className="px-2 py-3 text-center border-l" style={{ borderColor: "#E2E8F0" }}>
                      <div className="flex justify-center">
                        <Toggle
                          value={!!k.sekme_yetkileri[key]}
                          onChange={(v) => handleToggle(k.user_id, "sekme", key, v)}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-4 py-3 border-l" style={{ borderColor: "#E2E8F0" }}>
                    <button
                      onClick={() => handleSave(k.user_id)}
                      disabled={saving === k.user_id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      {saving === k.user_id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      Kaydet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}