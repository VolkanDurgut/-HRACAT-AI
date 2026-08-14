"use client";
import React from "react";
import { Konteyner, Dosya, Rezervasyon, KONTEYNER_TIPLERI, supabase } from "@/lib/supabase";
import { useDbaUpload } from "@/lib/hooks/use-dba-upload";
import { useKonteynerForm } from "@/lib/hooks/use-konteyner-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Trash2, Plus, X, CheckCircle2, AlertTriangle, Loader2, Download, Copy, ClipboardList, CopyPlus
} from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { EditableCell } from "@/components/editable-cell";
import VgmMailSection from "@/components/vgm-mail-section";
import FaturaTalimatiSection from "@/components/fatura-talimati-section";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type TabKey = "proforma" | "evraklar" | "rezervasyon" | "konteynerler";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  onNavigateTab: (tab: TabKey) => void;
  companyId: string; // Şirket bazlı izolasyon için eklendi
};

export default function KonteynerTab({ dosyaId, dosya, konteynerler, rezervasyonlar, onRefresh, onNavigateTab, companyId }: Props) {
  const markaListesi = ((dosya as any)?.ham_veri?.marka_listesi || []) as string[];
  const varsayilanMarka = markaListesi.length === 1 ? markaListesi[0] : "";

  const {
    showForm, setShowForm,
    saving,
    deleteTarget, setDeleteTarget,
    form, errors,
    kullaniciMap,
    update,
    handleSave,
    handleDelete,
    handleManuelAlanKaydet,
    handleTopluEkle,
    handleHepsineUygula,
  } = useKonteynerForm(dosyaId, onRefresh, companyId, varsayilanMarka);

  const [showTopluForm, setShowTopluForm] = React.useState(false);
  const [topluMetin, setTopluMetin] = React.useState("");
  const [topluRezId, setTopluRezId] = React.useState("");
  const [topluSaving, setTopluSaving] = React.useState(false);

  const handleTopluKaydet = async () => {
    if (!topluMetin.trim()) return;
    setTopluSaving(true);
    const { basarili, hatali } = await handleTopluEkle(topluMetin, topluRezId);
    if (hatali.length > 0) {
      showToast(`${basarili} konteyner eklendi. Hatalı: ${hatali.join(", ")}`, "error");
    } else {
      showToast(`${basarili} konteyner başarıyla eklendi.`, "success");
    }
    setTopluMetin("");
    setShowTopluForm(false);
    setTopluSaving(false);
  };

  // DBA yukleme - ortak hook kullaniliyor
  const { yukleniyor: dbaYukleniyor, hatalar: dbaHata, yukleDba, kaldirDba, inputRefs: dbaInputRefs } = useDbaUpload();
  const { showToast } = useToast();

  const handleDbaKaldir = async (konteyner: Konteyner) => {
    await kaldirDba(konteyner.id);
    onRefresh();
  };

  const handleKopyala = async (deger: string, etiket: string) => {
    await navigator.clipboard.writeText(deger);
    showToast(`${etiket} kopyalandi.`, "success");
  };
  
  const scrollToBolum = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTumunuKopyala = async () => {
    const baslik = ["No", "Konteyner No", "Muhur No", "Tip", "Plaka", "Dara (KG)", "Net (KG)", "Brut (KG)", "Kap Adeti", "VGM (KG)"].join("\t");
    const satirlar = konteynerler.map((k, i) => [
      i + 1,
      k.konteyner_no,
      k.muhur_no || "",
      k.tip,
      k.plaka || "",
      k.tare_kg || "",
      k.net_agirlik_kg || "",
      (k as any).brut_agirlik_kg || "",
      (k as any).pieces || "",
      k.vgm_kg || "",
    ].join("\t"));
    const metin = [baslik, ...satirlar].join("\n");
    await navigator.clipboard.writeText(metin);
    showToast("Tum konteyner bilgileri kopyalandi.", "success");
  };

  const [uygulaConfirm, setUygulaConfirm] = React.useState(false);

  const ilkKonteyner = konteynerler[0];
  const ilkKonteynerDolu = !!ilkKonteyner && (
    (ilkKonteyner as any).net_agirlik_kg != null ||
    (ilkKonteyner as any).brut_agirlik_kg != null ||
    (ilkKonteyner as any).pieces != null
  );
  const digerlerindeVeriVar = konteynerler.slice(1).some((k) =>
    (k as any).net_agirlik_kg != null ||
    (k as any).brut_agirlik_kg != null ||
    (k as any).pieces != null
  );

  const uygulaOnayli = async () => {
    setUygulaConfirm(false);
    const hedefIds = konteynerler.slice(1).map((k) => k.id);
    await handleHepsineUygula(konteynerler[0], hedefIds);
  };

  const uygulaButonaTikla = () => {
    if (digerlerindeVeriVar) {
      setUygulaConfirm(true);
    } else {
      uygulaOnayli();
    }
  };

  // ---- Hesaplamalar ----
  const rezervasyonKonteynerAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const eklenenKonteynerAdedi = konteynerler.length;
  const faturaTalimatiHazir = rezervasyonKonteynerAdedi > 0 && eklenenKonteynerAdedi === rezervasyonKonteynerAdedi;
  const dbaYuklenenSayisi = konteynerler.filter(k => k.dba_dosya_url).length;

  const toplamNet = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
  const toplamBrut = konteynerler.reduce((s, k) => s + ((k as any).brut_agirlik_kg || 0), 0);
  const toplamKapAdeti = konteynerler.reduce((s, k) => s + ((k as any).pieces || 0), 0);

  return (
    <div className="space-y-4">
      {/* Konteyner tablosu */}
      {konteynerler.length > 0 && (
        <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          {/* DBA ilerleme ozeti */}
          {konteynerler.length > 0 && (
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
              <div className="flex items-center gap-3">
                <p className="text-xs font-medium" style={{ color: TEXT_MUTED }}>DBA Durumu</p>
                <div className="w-32 rounded-full h-1.5" style={{ backgroundColor: CARD_BORDER }}>
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ backgroundColor: ACCENT, width: konteynerler.length > 0 ? `${(dbaYuklenenSayisi / konteynerler.length) * 100}%` : "0%" }} />
                </div>
                <p className="text-xs font-semibold" style={{ color: ACCENT }}>{dbaYuklenenSayisi}/{konteynerler.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => scrollToBolum("vgm-bolumu")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                  VGM Gönder
                </button>
                <button onClick={() => scrollToBolum("fatura-talimati-bolumu")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                  Fatura Talimatı
                </button>
                <button onClick={() => scrollToBolum("fatura-talimati-bolumu")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                  Konşimento Talimatı
                </button>
                {konteynerler.length >= 2 && ilkKonteynerDolu && (
                  <button onClick={uygulaButonaTikla}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                    <CopyPlus size={13} /> İlk Konteyneri Uygula
                  </button>
                )}
                <button onClick={handleTumunuKopyala}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
                  style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <ClipboardList size={13} /> Tumunu Kopyala
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold w-8" style={{ color: TEXT_MUTED }}>No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Konteyner No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Muhur No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Tip</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Çuval</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Plaka</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Dara</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Net</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Brüt</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Kap Adeti</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>VGM</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>DBA</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {konteynerler.map((k, i) => {
                  const markaListesi: string[] = ((dosya as any)?.ham_veri?.marka_listesi || []) as string[];
                  const dbaVeri = k.dba_kontrol_sonucu as { uyusmazliklar?: string[] } | null;
                  const uyusmazlik = (dbaVeri?.uyusmazliklar?.length ?? 0) > 0;
                  return (
                    <tr key={k.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-white font-mono cursor-pointer hover:text-amber-400"
                          onClick={() => handleKopyala(k.konteyner_no, "Konteyner no")}>
                          {k.konteyner_no}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono" style={{ color: TEXT_MUTED }}>
                        {k.muhur_no ? (
                          <span className="cursor-pointer hover:text-amber-400"
                            onClick={() => handleKopyala(k.muhur_no!, "Muhur no")}>
                            {k.muhur_no}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{k.tip}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>
                        <MarkaHucresi konteynerId={k.id} deger={(k as any).marka} secenekler={markaListesi} companyId={companyId} onKaydedildi={onRefresh} />
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{k.plaka || <span style={{ color: "#4A5262" }}>-</span>}</td>
                      <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{k.tare_kg ? `${k.tare_kg} KG` : <span style={{ color: "#4A5262" }}>-</span>}</td>
                      <td className="px-4 py-3">
                        <EditableCell
                          value={k.net_agirlik_kg}
                          suffix="KG"
                          onSave={(val) => handleManuelAlanKaydet(k.id, "net_agirlik_kg", val)}
                          updatedByEmail={(k as any).updated_by ? kullaniciMap[(k as any).updated_by] : null}
                          updatedAt={(k as any).updated_at}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          value={(k as any).brut_agirlik_kg}
                          suffix="KG"
                          onSave={(val) => handleManuelAlanKaydet(k.id, "brut_agirlik_kg", val)}
                          updatedByEmail={(k as any).updated_by ? kullaniciMap[(k as any).updated_by] : null}
                          updatedAt={(k as any).updated_at}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          value={(k as any).pieces}
                          onSave={(val) => handleManuelAlanKaydet(k.id, "pieces", val)}
                          updatedByEmail={(k as any).updated_by ? kullaniciMap[(k as any).updated_by] : null}
                          updatedAt={(k as any).updated_at}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-right" style={{ color: k.vgm_kg ? ACCENT : undefined }}>
                        {k.vgm_kg ? `${k.vgm_kg} KG` : <span className="font-normal" style={{ color: "#4A5262" }}>-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {dbaYukleniyor[k.id] ? (
                          <Loader2 size={16} className="animate-spin mx-auto" style={{ color: TEXT_MUTED }} />
                        ) : k.dba_dosya_url ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {uyusmazlik ? (
                              <AlertTriangle size={14} className="text-amber-400" aria-label="Uyusmazlik var" />
                            ) : (
                              <CheckCircle2 size={14} className="text-green-400" />
                            )}
                            <a href={k.dba_dosya_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium hover:text-white" style={{ color: TEXT_MUTED }}>
                              <Download size={12} />
                            </a>
                            <button onClick={() => handleDbaKaldir(k)} className="hover:text-red-400" style={{ color: "#4A5262" }}>
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            Bekleniyor
                          </span>
                        )}
                        {dbaHata[k.id] && <p className="text-xs text-red-400 mt-0.5">{dbaHata[k.id]}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setDeleteTarget({ id: k.id, konteynerNo: k.konteyner_no })} className="hover:text-red-400" style={{ color: "#4A5262" }}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {konteynerler.length > 0 && (
                <tfoot>
                  <tr className="border-t-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <td colSpan={7} className="px-4 py-3 text-xs font-bold text-right" style={{ color: TEXT_MUTED }}>TOPLAM</td>
                    <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: "white" }}>
                      {toplamNet > 0 ? `${toplamNet.toLocaleString("tr-TR")} KG` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: "white" }}>
                      {toplamBrut > 0 ? `${toplamBrut.toLocaleString("tr-TR")} KG` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: "white" }}>
                      {toplamKapAdeti > 0 ? toplamKapAdeti.toLocaleString("tr-TR") : "-"}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Emin misiniz?"
        description={`${deleteTarget?.konteynerNo || ""} konteynerini silmek istediginize emin misiniz?`}
        confirmLabel="Evet, Sil" cancelLabel="Hayir"
        onConfirm={handleDelete} destructive
      />

      <ConfirmDialog
        open={uygulaConfirm}
        onOpenChange={(open) => { if (!open) setUygulaConfirm(false); }}
        title="Değerler üzerine yazılsın mı?"
        description="Diğer konteynerlerde girilmiş çuval markası, net, brüt ve kap değerleri ilk konteynerinkiyle değiştirilecek. Devam edilsin mi?"
        confirmLabel="Evet, Uygula" cancelLabel="Vazgeç"
        onConfirm={uygulaOnayli}
      />

      {!showForm ? (
        showTopluForm ? null : rezervasyonlar.length === 0 ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
            <div>
              <h4 className="text-sm font-medium text-amber-300">Rezervasyon Gerekli</h4>
              <p className="text-xs text-amber-400/90 mt-1">
                Konteyner ekleyebilmek için öncelikle sisteme en az bir adet rezervasyon girmeniz gerekmektedir. Lütfen <strong className="font-semibold">Rezervasyon</strong> sekmesinden kayıt oluşturun.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(true); setShowTopluForm(false); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
              <Plus size={16} /> Konteyner Ekle
            </button>
            <button onClick={() => { setShowTopluForm(true); setShowForm(false); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/10"
              style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}>
              <ClipboardList size={16} /> Toplu Ekle
            </button>
          </div>
        )
      ) : (
        <div className="rounded-xl border shadow-sm p-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Konteyner No *</label>
              <input value={form.konteyner_no} onChange={(e) => update("konteyner_no", e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border rounded-lg text-sm uppercase text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="ABCU1234567" />
              {errors.konteyner_no && <p className="text-xs text-red-400 mt-0.5">{errors.konteyner_no}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Muhur No</label>
              <input value={form.muhur_no} onChange={(e) => update("muhur_no", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm uppercase text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Tip</label>
              <select value={form.tip} onChange={(e) => update("tip", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                {KONTEYNER_TIPLERI.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Rezervasyon</label>
              <select value={form.rezervasyon_id} onChange={(e) => update("rezervasyon_id", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                <option value="">-</option>
                {rezervasyonlar.map((r) => <option key={r.id} value={r.id}>{r.booking_no}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              Iptal
            </button>
          </div>
        </div>
      )}
        {showTopluForm && (
        <div className="rounded-xl border shadow-sm p-6 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Toplu Konteyner Ekle</p>
            <button onClick={() => setShowTopluForm(false)} className="hover:text-white" style={{ color: TEXT_MUTED }}><X size={16} /></button>
          </div>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Excel'den kopyaladığınız konteyner ve mühür numaralarını yapıştırın. Her satır bir konteyner, iki sütun arasında Tab olmalı.</p>
          <textarea
            value={topluMetin}
            onChange={(e) => setTopluMetin(e.target.value)}
            placeholder={"CAAU2037116\tAKKON640418\nCAIU3509082\tAKKON640376"}
            rows={6}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Rezervasyon</label>
            <select value={topluRezId} onChange={(e) => setTopluRezId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <option value="">-</option>
              {rezervasyonlar.map((r) => <option key={r.id} value={r.id}>{r.booking_no}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleTopluKaydet} disabled={topluSaving || !topluMetin.trim()}
              className="px-5 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}>
              {topluSaving ? "Ekleniyor..." : "Ekle"}
            </button>
            <button onClick={() => setShowTopluForm(false)}
              className="px-5 py-2 rounded-lg text-sm font-medium border hover:bg-white/5"
              style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              İptal
            </button>
          </div>
        </div>
      )}

      <div id="vgm-bolumu">
        <VgmMailSection
          dosyaId={dosyaId}
          dosya={dosya}
          konteynerler={konteynerler}
          rezervasyonlar={rezervasyonlar}
          dbaYuklenenSayisi={dbaYuklenenSayisi}
          onRefresh={onRefresh}
          companyId={companyId}
        />
      </div>

      <div id="fatura-talimati-bolumu">
        <FaturaTalimatiSection
          dosyaId={dosyaId}
          dosya={dosya}
          konteynerler={konteynerler}
          rezervasyonlar={rezervasyonlar}
          faturaTalimatiHazir={faturaTalimatiHazir}
          eklenenKonteynerAdedi={eklenenKonteynerAdedi}
          rezervasyonKonteynerAdedi={rezervasyonKonteynerAdedi}
          onRefresh={onRefresh}
          companyId={companyId}
        />
      </div>
    </div>
  );
}
// Konteyner bazinda cuval markasi hucresi.
// Marka listesi doluysa acilir liste, bossa serbest metin olarak calisir.
function MarkaHucresi({ konteynerId, deger, secenekler, companyId, onKaydedildi }: {
  konteynerId: string; deger: string | null; secenekler: string[]; companyId: string; onKaydedildi: () => void;
}) {
  const [duzenle, setDuzenle] = React.useState(false);
  const [taslak, setTaslak] = React.useState(deger || "");
  const [kaydediyor, setKaydediyor] = React.useState(false);

  const kaydet = async (yeniDeger: string) => {
    setKaydediyor(true);
    try {
      await supabase.from("konteynerler").update({ marka: yeniDeger || null }).eq("id", konteynerId).eq("company_id", companyId);
      onKaydedildi();
    } finally {
      setKaydediyor(false);
      setDuzenle(false);
    }
  };

  if (kaydediyor) return <span className="text-xs" style={{ color: TEXT_MUTED }}>Kaydediliyor...</span>;

  if (!duzenle) {
    return (
      <span className="cursor-pointer hover:text-emerald-400 text-sm" onClick={() => { setTaslak(deger || ""); setDuzenle(true); }} title="Düzenlemek için tıklayın">
        {deger || <span style={{ color: "#4A5262" }}>-</span>}
      </span>
    );
  }

  if (secenekler.length > 0) {
    return (
      <select autoFocus value={taslak} onChange={(e) => kaydet(e.target.value)} onBlur={() => setDuzenle(false)} className="text-sm border rounded px-2 py-1 w-full text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
        <option value="">- Seçiniz -</option>
        {secenekler.map((s) => (<option key={s} value={s}>{s}</option>))}
      </select>
    );
  }

  return (
    <input autoFocus value={taslak} onChange={(e) => setTaslak(e.target.value)} onBlur={() => kaydet(taslak)} onKeyDown={(e) => { if (e.key === "Enter") kaydet(taslak); if (e.key === "Escape") setDuzenle(false); }} className="text-sm border rounded px-2 py-1 w-full text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="Marka" />
  );
}