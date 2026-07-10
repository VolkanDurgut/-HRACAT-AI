"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { useRouter } from "next/navigation";
import { Settings, Loader2, Save, User } from "lucide-react";

type KullaniciYetki = {
  user_id: string;
  email: string;
  sayfa_yetkileri: {
    dashboard: boolean;
    panel: boolean;
    yeni_dosya: boolean;
    ihracatlar: boolean;
    kantar: boolean;
    analiz: boolean;
    ayarlar: boolean;
  };
  sekme_yetkileri: {
    proforma: boolean;
    evraklar: boolean;
    rezervasyon: boolean;
    konteynerler: boolean;
  };
};

const SAYFA_ETIKETLER: Record<string, string> = {
  dashboard:   "Dashboard",
  panel:       "Ana Panel",
  yeni_dosya:  "Yeni Dosya Aç",
  ihracatlar:  "İhracatlar",
  kantar:      "Kantar Paneli",
  analiz:      "Analiz",
  ayarlar:     "Ayarlar",
};

const SEKME_ETIKETLER: Record<string, string> = {
  proforma:     "Proforma Bilgileri",
  evraklar:     "Sevkiyat Evrakları",
  rezervasyon:  "Rezervasyon",
  konteynerler: "Konteynerler",
};

export default function AyarlarPage() {
  const { yetkiler, user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [kullanicilar, setKullanicilar] = useState<KullaniciYetki[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Yetkisi yoksa ana panele yönlendir
  useEffect(() => {
    if (!yetkiler.sayfa_yetkileri.ayarlar) {
      router.push("/panel");
    }
  }, [yetkiler, router]);

  const fetchKullanicilar = useCallback(async () => {
    // Tüm kullanıcı yetkilerini çek
    const { data: yetkiData } = await supabase
      .from("kullanici_yetkileri")
      .select("user_id, sayfa_yetkileri, sekme_yetkileri");

    if (!yetkiData) { setLoading(false); return; }

    // Her user_id için email'i auth tablosundan çek
    const { data: { users } } = await supabase.auth.admin.listUsers();

    const enriched: KullaniciYetki[] = yetkiData.map((y: any) => {
      const authUser = users?.find((u: any) => u.id === y.user_id);
      return {
        user_id: y.user_id,
        email: authUser?.email || y.user_id,
        sayfa_yetkileri: y.sayfa_yetkileri,
        sekme_yetkileri: y.sekme_yetkileri,
      };
    });

    // Kendi hesabımızı listenin başına al
    enriched.sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      return a.email.localeCompare(b.email);
    });

    setKullanicilar(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchKullanicilar(); }, [fetchKullanicilar]);

  const handleToggle = (
    userId: string,
    tip: "sayfa" | "sekme",
    key: string,
    value: boolean
  ) => {
    setKullanicilar(prev => prev.map(k => {
      if (k.user_id !== userId) return k;
      if (tip === "sayfa") {
        return { ...k, sayfa_yetkileri: { ...k.sayfa_yetkileri, [key]: value } };
      } else {
        return { ...k, sekme_yetkileri: { ...k.sekme_yetkileri, [key]: value } };
      }
    }));
  };

  const handleSave = async (userId: string) => {
    setSaving(userId);
    const kullanici = kullanicilar.find(k => k.user_id === userId);
    if (!kullanici) return;

    const { error } = await supabase
      .from("kullanici_yetkileri")
      .update({
        sayfa_yetkileri: kullanici.sayfa_yetkileri,
        sekme_yetkileri: kullanici.sekme_yetkileri,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      showToast("Kayıt sırasında hata oluştu.", "error");
    } else {
      showToast("Yetkiler kaydedildi.", "success");
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-amber-500" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={22} style={{ color: "#1B2B4B" }} />
          <h1 className="text-2xl font-bold" style={{ color: "#1B2B4B" }}>Yetkilendirme</h1>
        </div>
        <p className="text-slate-500 text-sm ml-7">Kullanıcıların sayfa ve sekme erişimlerini yönetin</p>
      </div>

      <div className="space-y-4">
        {kullanicilar.map((k) => (
          <div key={k.user_id} className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
            {/* Kullanıcı başlığı */}
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <User size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{k.email}</p>
                  {k.user_id === user?.id && (
                    <p className="text-xs text-amber-600">Siz</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleSave(k.user_id)}
                disabled={saving === k.user_id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {saving === k.user_id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Kaydet
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sayfa yetkileri */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Sayfa Erişimi</h3>
                <div className="space-y-2">
                  {Object.entries(SAYFA_ETIKETLER).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer group">
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">{label}</span>
                      <button
                        onClick={() => handleToggle(k.user_id, "sayfa", key, !k.sayfa_yetkileri[key as keyof typeof k.sayfa_yetkileri])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          k.sayfa_yetkileri[key as keyof typeof k.sayfa_yetkileri]
                            ? "bg-amber-500"
                            : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            k.sayfa_yetkileri[key as keyof typeof k.sayfa_yetkileri]
                              ? "translate-x-4"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sekme yetkileri */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dosya Sekme Erişimi</h3>
                <div className="space-y-2">
                  {Object.entries(SEKME_ETIKETLER).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer group">
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">{label}</span>
                      <button
                        onClick={() => handleToggle(k.user_id, "sekme", key, !k.sekme_yetkileri[key as keyof typeof k.sekme_yetkileri])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          k.sekme_yetkileri[key as keyof typeof k.sekme_yetkileri]
                            ? "bg-amber-500"
                            : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            k.sekme_yetkileri[key as keyof typeof k.sekme_yetkileri]
                              ? "translate-x-4"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}