"use client";
import React, { useState, useEffect } from "react";
import { supabase, MTS_PER_KONTEYNER } from "@/lib/supabase";
import { Plus, Mail, Pencil, Trash2, Check, RefreshCw, Loader2 } from "lucide-react";

type Acente = {
  id: string;
  isim: string;
  email: string;
  telefon?: string;
  cc_emails?: string;
  notlar?: string;
};

type Teklif = {
  id?: string;
  dosya_id: string;
  acente_id: string;
  mail_metni?: string;
  mail_konusu?: string;
  son_gonderim_tarihi?: string;
  teklif_fiyat?: string;
  teklif_gecerlilik?: string;
  teklif_notu?: string;
  teklif_tarihi?: string;
};

type AcenteWithTeklif = Acente & { teklif: Teklif | null };

type Props = {
  dosyaId: string;
  proformData: any;
  userId: string;
};

export default function AcenteTeklifSection({ dosyaId, proformData, userId }: Props) {
  const [acenteler, setAcenteler] = useState<AcenteWithTeklif[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Acente | null>(null);
  const [form, setForm] = useState({ isim: "", email: "", telefon: "", cc_emails: "", notlar: "" });
  const [saving, setSaving] = useState(false);

  const [activePanel, setActivePanel] = useState<{ id: string; type: "mail" | "teklif" } | null>(null);
  const [mailMetin, setMailMetin] = useState("");
  const [mailKonusu, setMailKonusu] = useState("");
  const [isReminder, setIsReminder] = useState(false);
  const [teklifForm, setTeklifForm] = useState({ teklif_fiyat: "", teklif_para_birimi: "USD", teklif_gecerlilik: "", teklif_notu: "" });

  useEffect(() => { fetchAcenteler(); }, []);

  const fetchAcenteler = async () => {
    const { data: acenteData } = await supabase.from("acenteler").select("*").order("isim");
    const { data: teklifData } = await supabase.from("acente_teklifleri").select("*").eq("dosya_id", dosyaId);

    const merged: AcenteWithTeklif[] = (acenteData || []).map((a: Acente) => ({
      ...a,
      teklif: (teklifData || []).find((t: Teklif) => t.acente_id === a.id) || null,
    }));
    setAcenteler(merged);
  };

  const parseFiyat = (fiyat?: string) => {
    if (!fiyat) return null;
    const num = parseFloat(fiyat.replace(/[^0-9.,]/g, "").replace(",", "."));
    return isNaN(num) ? null : num;
  };

  const teklifGelenler = acenteler.filter((a) => !!a.teklif?.teklif_tarihi);
  const enDusukFiyat = teklifGelenler.reduce((min, a) => {
    const f = parseFiyat(a.teklif?.teklif_fiyat);
    if (f === null) return min;
    return min === null || f < min ? f : min;
  }, null as number | null);

  const siraliAcenteler = [...acenteler].sort((a, b) => {
    const fa = parseFiyat(a.teklif?.teklif_fiyat);
    const fb = parseFiyat(b.teklif?.teklif_fiyat);
    if (fa !== null && fb !== null) return fa - fb;
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    const ga = !!a.teklif?.son_gonderim_tarihi;
    const gb = !!b.teklif?.son_gonderim_tarihi;
    if (ga !== gb) return ga ? -1 : 1;
    return 0;
  });

  const buildDefaultKonu = () => `Freight Teklif Talebi - ${proformData?.varis_limani || ""}`;
  const buildHatirlatmaKonu = () => `Hatırlatma: Freight Teklif Talebi - ${proformData?.varis_limani || ""}`;

  const hesaplaKonteynerAdedi = () => {
    const miktar = parseFloat(String(proformData?.toplam_miktar || proformData?.miktar || 0));
    if (!miktar || miktar <= 0) return null;
    return Math.max(1, Math.floor(miktar / MTS_PER_KONTEYNER));
  };

  const buildMailMetni = (acente: Acente) => {
    const varis = proformData?.varis_limani || "-";
    const konteynerAdedi = hesaplaKonteynerAdedi();
    const konteynerSatiri = konteynerAdedi ? `Konteyner Adedi: ${konteynerAdedi}` : "";
    return `Sayın ${acente.isim} Ekibi,\n\nAşağıdaki kargo için freight teklifi talep ediyoruz.\n\nVarış Limanı: ${varis}\n${konteynerSatiri}\n\nEn kısa sürede teklifinizi bekliyoruz.\n\nSaygılarımızla`;
  };

  const buildHatirlatmaMetni = (acente: AcenteWithTeklif) => {
    const varis = proformData?.varis_limani || "-";
    const konteynerAdedi = hesaplaKonteynerAdedi();
    const konteynerSatiri = konteynerAdedi ? `Konteyner Adedi: ${konteynerAdedi}` : "";
    const gonderimTarihi = acente.teklif?.son_gonderim_tarihi ? new Date(acente.teklif.son_gonderim_tarihi).toLocaleDateString("tr-TR") : "-";
    return `Sayın ${acente.isim} Ekibi,\n\n${gonderimTarihi} tarihinde gönderdiğimiz freight teklif talebimizi hatırlatmak istedik.\n\nVarış Limanı: ${varis}\n${konteynerSatiri}\n\nTeklifinizi bekliyoruz.\n\nSaygılarımızla`;
  };

  const formatTarih = (tarihi: string) => new Date(tarihi).toLocaleDateString("tr-TR");

  const openMailPanel = (acente: AcenteWithTeklif, reminder = false) => {
    setIsReminder(reminder);
    setActivePanel({ id: acente.id, type: "mail" });
    if (reminder) {
      setMailMetin(buildHatirlatmaMetni(acente));
      setMailKonusu(buildHatirlatmaKonu());
    } else {
      setMailMetin(acente.teklif?.mail_metni || buildMailMetni(acente));
      setMailKonusu(acente.teklif?.mail_konusu || buildDefaultKonu());
    }
  };

  // dosya_id + acente_id icin teklif kaydini upsert eder
  const upsertTeklif = async (acenteId: string, payload: Partial<Teklif>) => {
    const { data: existing } = await supabase
      .from("acente_teklifleri")
      .select("id")
      .eq("dosya_id", dosyaId)
      .eq("acente_id", acenteId)
      .maybeSingle();

    if (existing) {
      await supabase.from("acente_teklifleri").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("acente_teklifleri").insert({ dosya_id: dosyaId, acente_id: acenteId, ...payload });
    }
  };

  const handleMailGonder = async (acente: AcenteWithTeklif) => {
    const ccList = acente.cc_emails ? acente.cc_emails.split(",").map((e: string) => e.trim()).join(",") : "";
    const cc = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
    window.open(`mailto:${acente.email}?subject=${encodeURIComponent(mailKonusu)}${cc}&body=${encodeURIComponent(mailMetin)}`);
    await upsertTeklif(acente.id, {
      mail_metni: isReminder ? acente.teklif?.mail_metni : mailMetin,
      mail_konusu: isReminder ? acente.teklif?.mail_konusu : mailKonusu,
      son_gonderim_tarihi: new Date().toISOString(),
    });
    setActivePanel(null);
    fetchAcenteler();
  };

  const openTeklifPanel = (acente: AcenteWithTeklif) => {
    setActivePanel({ id: acente.id, type: "teklif" });
    const mevcutFiyat = acente.teklif?.teklif_fiyat || "";
    const paraBirimi = mevcutFiyat.includes("EUR") ? "EUR" : "USD";
    const sadeceFiyat = mevcutFiyat.replace(/USD|EUR|\s/g, "");
    setTeklifForm({
      teklif_fiyat: sadeceFiyat,
      teklif_para_birimi: paraBirimi,
      teklif_gecerlilik: acente.teklif?.teklif_gecerlilik || "",
      teklif_notu: acente.teklif?.teklif_notu || "",
    });
  };

  const handleTeklifKaydet = async (acenteId: string) => {
    const fiyatStr = teklifForm.teklif_fiyat ? `${teklifForm.teklif_para_birimi} ${teklifForm.teklif_fiyat}` : "";
    await upsertTeklif(acenteId, {
      teklif_fiyat: fiyatStr,
      teklif_gecerlilik: teklifForm.teklif_gecerlilik || undefined,
      teklif_notu: teklifForm.teklif_notu || undefined,
      teklif_tarihi: new Date().toISOString(),
    });
    setActivePanel(null);
    fetchAcenteler();
  };

  const handleSave = async () => {
    if (!form.isim || !form.email) return;
    setSaving(true);
    if (editTarget) {
      await supabase.from("acenteler").update({
        isim: form.isim, email: form.email, telefon: form.telefon, cc_emails: form.cc_emails, notlar: form.notlar,
      }).eq("id", editTarget.id);
    } else {
      await supabase.from("acenteler").insert({
        isim: form.isim, email: form.email, telefon: form.telefon, cc_emails: form.cc_emails, notlar: form.notlar, created_by: userId,
      });
    }
    setForm({ isim: "", email: "", telefon: "", cc_emails: "", notlar: "" });
    setShowForm(false);
    setEditTarget(null);
    setSaving(false);
    fetchAcenteler();
  };

  const handleEdit = (acente: Acente) => {
    setEditTarget(acente);
    setForm({ isim: acente.isim, email: acente.email, telefon: acente.telefon || "", cc_emails: acente.cc_emails || "", notlar: acente.notlar || "" });
    setShowForm(true);
    setActivePanel(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("acenteler").delete().eq("id", id);
    if (activePanel?.id === id) setActivePanel(null);
    fetchAcenteler();
  };

  return (
    <div className="space-y-3">
      {acenteler.length === 0 && !showForm ? (
        <p className="text-sm text-slate-400">Henüz acente eklenmemiş.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          {siraliAcenteler.map((acente, idx) => {
            const gonderildi = !!acente.teklif?.son_gonderim_tarihi;
            const teklifVar = !!acente.teklif?.teklif_tarihi;
            const fiyatNum = parseFiyat(acente.teklif?.teklif_fiyat);
            const enUygun = enDusukFiyat !== null && fiyatNum === enDusukFiyat && teklifGelenler.length >= 2;
            const isOpen = activePanel?.id === acente.id;

            return (
              <div key={acente.id} className={idx > 0 ? "border-t" : ""} style={{ borderColor: "#F1F5F9" }}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={enUygun ? { backgroundColor: "#F0FDF4" } : undefined}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: teklifVar ? "#22c55e" : gonderildi ? "#f59e0b" : "#cbd5e1" }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{acente.isim}</p>
                    {gonderildi && !teklifVar && (
                      <p className="text-[11px] text-slate-400">{formatTarih(acente.teklif!.son_gonderim_tarihi!)} tarihinde teklif istendi</p>
                    )}
                    {!gonderildi && <p className="text-[11px] text-slate-400">Bu dosya için teklif istenmedi</p>}
                  </div>

                  {teklifVar && (
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${enUygun ? "text-green-700" : "text-slate-700"}`}>{acente.teklif!.teklif_fiyat}</p>
                      {enUygun && <p className="text-[10px] font-medium text-green-600">En uygun</p>}
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {!gonderildi && (
                      <button onClick={() => openMailPanel(acente, false)}
                        className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50" title="Teklif iste">
                        <Mail size={14} />
                      </button>
                    )}
                    {gonderildi && !teklifVar && (
                      <>
                        <button onClick={() => openMailPanel(acente, true)}
                          className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50" title="Hatırlatma gönder">
                          <RefreshCw size={14} />
                        </button>
                        <button onClick={() => openTeklifPanel(acente)}
                          className="p-1.5 rounded-md text-green-600 hover:bg-green-50" title="Teklif geldi, kaydet">
                          <Check size={14} />
                        </button>
                      </>
                    )}
                    {teklifVar && (
                      <button onClick={() => openTeklifPanel(acente)}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" title="Teklifi düzenle">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(acente.id)} className="p-1.5 rounded-md text-red-400 hover:bg-red-50" title="Acenteyi sil">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && activePanel?.type === "mail" && (
                  <div className="px-3 pb-3 space-y-2" style={{ backgroundColor: "#FAFBFC" }}>
                    <p className="text-xs font-medium text-slate-500 pt-1">{isReminder ? "Hatırlatma maili" : "Teklif talebi"} → {acente.email}</p>
                    <input value={mailKonusu} onChange={(e) => setMailKonusu(e.target.value)}
                      className="w-full text-xs text-slate-700 bg-white border rounded-lg px-2.5 py-2" style={{ borderColor: "#E2E8F0" }} />
                    <textarea value={mailMetin} onChange={(e) => setMailMetin(e.target.value)}
                      className="w-full text-xs text-slate-700 bg-white border rounded-lg p-2 resize-none" style={{ borderColor: "#E2E8F0" }} rows={5} />
                    <div className="flex gap-2">
                      <button onClick={() => handleMailGonder(acente)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: "#1B2B4B" }}>
                        <Mail size={12} /> Mail Uygulamasını Aç
                      </button>
                      <button onClick={() => setActivePanel(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}

                {isOpen && activePanel?.type === "teklif" && (
                  <div className="px-3 pb-3 space-y-2" style={{ backgroundColor: "#FAFBFC" }}>
                    <p className="text-xs font-medium text-slate-500 pt-1">Teklif bilgileri</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex gap-1">
                        <select value={teklifForm.teklif_para_birimi} onChange={(e) => setTeklifForm({ ...teklifForm, teklif_para_birimi: e.target.value })}
                          className="text-xs px-2 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }}>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                        <input value={teklifForm.teklif_fiyat} onChange={(e) => setTeklifForm({ ...teklifForm, teklif_fiyat: e.target.value })}
                          placeholder="Fiyat" className="flex-1 text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
                      </div>
                      <input value={teklifForm.teklif_gecerlilik} onChange={(e) => setTeklifForm({ ...teklifForm, teklif_gecerlilik: e.target.value })}
                        placeholder="Geçerlilik (örn: 3 iş günü)" className="text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
                    </div>
                    <input value={teklifForm.teklif_notu} onChange={(e) => setTeklifForm({ ...teklifForm, teklif_notu: e.target.value })}
                      placeholder="Not (opsiyonel)" className="w-full text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
                    <div className="flex gap-2">
                      <button onClick={() => handleTeklifKaydet(acente.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: "#1B2B4B" }}>
                        <Check size={12} /> Kaydet
                      </button>
                      <button onClick={() => setActivePanel(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="p-3 rounded-lg border bg-slate-50 space-y-2" style={{ borderColor: "#E2E8F0" }}>
          <p className="text-xs font-semibold text-slate-700">{editTarget ? "Acente Düzenle" : "Yeni Acente"}</p>
          <input value={form.isim} onChange={(e) => setForm({ ...form, isim: e.target.value })}
            placeholder="Acente adı (örn: Maersk)" className="w-full text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="E-posta" type="email" className="w-full text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
          <input value={form.cc_emails} onChange={(e) => setForm({ ...form, cc_emails: e.target.value })}
            placeholder="CC (virgülle ayırın, opsiyonel)" className="w-full text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
          <input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })}
            placeholder="Telefon (opsiyonel)" className="w-full text-xs px-2.5 py-2 border rounded-lg bg-white" style={{ borderColor: "#E2E8F0" }} />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.isim || !form.email}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1B2B4B" }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => { setShowForm(false); setEditTarget(null); setForm({ isim: "", email: "", telefon: "", cc_emails: "", notlar: "" }); }}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
          <Plus size={14} /> Yeni Acente Ekle
        </button>
      )}
    </div>
  );
}
