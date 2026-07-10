"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { Ship, Search, Loader2, AlertCircle, Bell } from "lucide-react";
import { formatDateTR } from "@/lib/cutoff-utils";

type SevkiyatSatir = {
  rezervasyon_id: string;
  dosya_id: string;
  dosya_no: string;
  alici_firma: string | null;
  konteyner_adedi: number;
  varis_limani: string | null;
  acente_ismi: string | null;
  booking_no: string | null;
  bl_no: string | null;
  gemi_adi: string | null;
  sefer_no: string | null;
  etd: string | null;
  eta: string | null;
  eta_guncelleme_tarihi: string | null;
};

function kalanGun(eta: string): number {
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const etaTarih = new Date(eta);
  etaTarih.setHours(0, 0, 0, 0);
  return Math.round((etaTarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
}

export default function EtdEtaPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [satirlar, setSatirlar] = useState<SevkiyatSatir[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [etaFilter, setEtaFilter] = useState<"hepsi" | "eksik" | "tamam">("hepsi");
  const [editingEta, setEditingEta] = useState<{ id: string; value: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: rezData } = await supabase
      .from("rezervasyonlar")
      .select("id, dosya_id, booking_no, gemi_adi, sefer_no, acente_ismi, yuklenme_limani, konteyner_adedi, gemi_kalkis_tarihi, eta, eta_guncelleme_tarihi")
      .order("gemi_kalkis_tarihi", { ascending: false });

    if (!rezData || rezData.length === 0) { setLoading(false); return; }

    const dosyaIds = Array.from(new Set(rezData.map((r: any) => r.dosya_id)));
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, alici_firma, varis_limani, bl_no")
      .in("id", dosyaIds);

    const dosyaMap: Record<string, any> = {};
    (dosyaData || []).forEach((d: any) => { dosyaMap[d.id] = d; });

    const rows: SevkiyatSatir[] = rezData.map((r: any) => {
      const dosya = dosyaMap[r.dosya_id] || {};
      return {
        rezervasyon_id: r.id,
        dosya_id: r.dosya_id,
        dosya_no: dosya.dosya_no || "-",
        alici_firma: dosya.alici_firma,
        konteyner_adedi: r.konteyner_adedi,
        varis_limani: dosya.varis_limani || r.yuklenme_limani,
        acente_ismi: r.acente_ismi,
        booking_no: r.booking_no,
        bl_no: dosya.bl_no,
        gemi_adi: r.gemi_adi,
        sefer_no: r.sefer_no,
        etd: r.gemi_kalkis_tarihi,
        eta: r.eta,
        eta_guncelleme_tarihi: r.eta_guncelleme_tarihi,
      };
    });

    setSatirlar(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEtaKaydet = async (rezervasyonId: string, etaValue: string) => {
    setSaving(rezervasyonId);
    const { error } = await supabase
      .from("rezervasyonlar")
      .update({ eta: etaValue || null, eta_guncelleme_tarihi: etaValue ? new Date().toISOString() : null })
      .eq("id", rezervasyonId);

    if (error) {
      showToast("ETA kaydedilemedi.", "error");
    } else {
      setSatirlar(prev => prev.map(s =>
        s.rezervasyon_id === rezervasyonId ? { ...s, eta: etaValue || null, eta_guncelleme_tarihi: etaValue ? new Date().toISOString() : null } : s
      ));
      showToast("ETA kaydedildi.", "success");
    }
    setSaving(null);
    setEditingEta(null);
  };

  // ETA'sı yaklaşan: bugün veya sonraki 7 gün içinde
  const yaklasanlar = useMemo(() =>
    satirlar
      .filter(s => s.eta)
      .map(s => ({ ...s, kalanGun: kalanGun(s.eta!) }))
      .filter(s => s.kalanGun >= 0 && s.kalanGun <= 7)
      .sort((a, b) => a.kalanGun - b.kalanGun),
    [satirlar]);

  const filtered = useMemo(() => {
    let rows = satirlar;
    if (etaFilter === "eksik") rows = rows.filter(s => !s.eta);
    if (etaFilter === "tamam") rows = rows.filter(s => !!s.eta);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter(s =>
        [s.alici_firma, s.dosya_no, s.varis_limani, s.booking_no, s.bl_no, s.gemi_adi, s.acente_ismi]
          .some(f => f?.toLowerCase().includes(term))
      );
    }
    return rows;
  }, [satirlar, search, etaFilter]);

  const eksikEtaSayisi = satirlar.filter(s => !s.eta).length;

  return (
    <AppShell>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Ship size={20} style={{ color: "#1B2B4B" }} />
          <h1 className="text-xl font-bold" style={{ color: "#1B2B4B" }}>ETD / ETA</h1>
        </div>
        <p className="text-slate-500 text-sm ml-7">Sevkiyat kalkış ve varış tarihleri</p>
      </div>

      {/* ETA'sı Yaklaşan Sevkiyatlar */}
      {yaklasanlar.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700">ETA'sı Yaklaşan Sevkiyatlar</h2>
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{yaklasanlar.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {yaklasanlar.map(s => (
              <div
                key={s.rezervasyon_id}
                className={`bg-white rounded-xl border p-4 shadow-sm ${s.kalanGun === 0 ? "border-red-300 bg-red-50/30" : s.kalanGun <= 2 ? "border-orange-200" : "border-amber-100"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{s.alici_firma || "—"}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.dosya_no}</p>
                  </div>
                  <span className={`shrink-0 ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.kalanGun === 0
                      ? "bg-red-100 text-red-600"
                      : s.kalanGun <= 2
                      ? "bg-orange-100 text-orange-600"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {s.kalanGun === 0 ? "Bugün" : `${s.kalanGun} gün`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                  <div><span className="text-slate-400">Liman: </span><span className="text-slate-700">{s.varis_limani || "—"}</span></div>
                  <div><span className="text-slate-400">Kont: </span><span className="text-slate-700 font-semibold">{s.konteyner_adedi}</span></div>
                  <div><span className="text-slate-400">Gemi: </span><span className="text-slate-700 truncate">{s.gemi_adi || "—"}</span></div>
                  <div><span className="text-slate-400">ETA: </span><span className="text-slate-700 font-semibold">{formatDateTR(s.eta!)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Özet Kartlar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: "#E2E8F0" }}>
          <p className="text-xs text-slate-400 mb-1">Toplam Sevkiyat</p>
          <p className="text-2xl font-bold" style={{ color: "#1B2B4B" }}>{satirlar.length}</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: "#E2E8F0" }}>
          <p className="text-xs text-slate-400 mb-1">ETA Girilmiş</p>
          <p className="text-2xl font-bold text-green-600">{satirlar.length - eksikEtaSayisi}</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: eksikEtaSayisi > 0 ? "#FCA5A5" : "#E2E8F0" }}>
          <p className="text-xs text-slate-400 mb-1">ETA Eksik</p>
          <p className={`text-2xl font-bold ${eksikEtaSayisi > 0 ? "text-red-500" : "text-slate-300"}`}>{eksikEtaSayisi}</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, booking, BL, gemi, liman ile ara..."
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            style={{ borderColor: "#E2E8F0" }}
          />
        </div>
        <div className="flex rounded-lg border overflow-hidden text-xs font-medium" style={{ borderColor: "#E2E8F0" }}>
          {(["hepsi", "eksik", "tamam"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setEtaFilter(f)}
              className={`px-3 py-2 transition-colors ${etaFilter === f ? "bg-amber-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              {f === "hepsi" ? "Hepsi" : f === "eksik" ? "ETA Eksik" : "ETA Tamam"}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Firma Adı</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Kont.</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Varış Limanı</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Acente</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Booking No</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">B/L No</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">ETD</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">ETA</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Gemi Adı</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">Kayıt bulunamadı</td>
                  </tr>
                ) : filtered.map((s) => {
                  const gun = s.eta ? kalanGun(s.eta) : null;
                  const yaklasan = gun !== null && gun >= 0 && gun <= 7;
                  return (
                    <tr
                      key={s.rezervasyon_id}
                      className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${!s.eta ? "bg-red-50/30" : yaklasan ? "bg-amber-50/40" : ""}`}
                      style={{ borderColor: "#F1F5F9" }}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800 max-w-[150px] truncate">{s.alici_firma || "—"}</td>
                      <td className="px-3 py-2 text-center font-semibold" style={{ color: "#1B2B4B" }}>{s.konteyner_adedi}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{s.varis_limani || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">{s.acente_ismi || "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{s.booking_no || "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{s.bl_no || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{s.etd ? formatDateTR(s.etd) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {editingEta?.id === s.rezervasyon_id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={editingEta.value}
                              onChange={(e) => setEditingEta({ id: s.rezervasyon_id, value: e.target.value })}
                              className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                              style={{ borderColor: "#E2E8F0" }}
                              autoFocus
                            />
                            <button
                              onClick={() => handleEtaKaydet(s.rezervasyon_id, editingEta.value)}
                              disabled={saving === s.rezervasyon_id}
                              className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-medium"
                            >
                              {saving === s.rezervasyon_id ? <Loader2 size={10} className="animate-spin" /> : "Kaydet"}
                            </button>
                            <button
                              onClick={() => setEditingEta(null)}
                              className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingEta({ id: s.rezervasyon_id, value: s.eta || "" })}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                              s.eta
                                ? yaklasan
                                  ? "text-amber-700 bg-amber-100 hover:bg-amber-200"
                                  : "text-green-700 bg-green-50 hover:bg-green-100"
                                : "text-red-500 bg-red-50 hover:bg-red-100"
                            }`}
                          >
                            {!s.eta && <AlertCircle size={10} />}
                            {s.eta ? formatDateTR(s.eta) : "Gir"}
                            {yaklasan && gun !== null && (
                              <span className="text-[9px] font-bold">
                                {gun === 0 ? " (bugün)" : ` (${gun}g)`}
                              </span>
                            )}
                          </button>
                        )}
                        {s.eta_guncelleme_tarihi && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {new Date(s.eta_guncelleme_tarihi).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{s.gemi_adi || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}