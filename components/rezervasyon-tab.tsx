"use client";
import React, { useState } from "react";
import { supabase, Rezervasyon, MTS_PER_KONTEYNER } from "@/lib/supabase";
import { formatDateTR, getCutOffDays, getCutOffLabel } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Trash2, Plus, Package, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type TabKey = "proforma" | "evraklar" | "rezervasyon" | "konteynerler";

type Props = {
  dosyaId: string;
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  onNavigateTab: (tab: TabKey) => void;
  companyId: string; // Şirket bazlı izolasyon için eklendi
};

const emptyForm = {
  booking_no: "", gemi_adi: "", sefer_no: "", acente_ismi: "", gemi_kalkis_tarihi: "", talimat_cutoff: "", talimat_cutoff_saat: "",
  beyanname_cutoff: "", beyanname_cutoff_saat: "", ekipman_alim_yeri: "", ekipman_alim_tarihi: "",
  yuklenme_limani: "", konteyner_adedi: 0,
  ardiyesiz_giris: "",
};

const formatSaatInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
};

const buildFormFromRez = (rez: Rezervasyon) => ({
  booking_no: rez.booking_no || "",
  gemi_adi: (rez as any).gemi_adi || "",
  sefer_no: (rez as any).sefer_no || "",
  acente_ismi: (rez as any).acente_ismi || "",
  gemi_kalkis_tarihi: rez.gemi_kalkis_tarihi ? rez.gemi_kalkis_tarihi.split("T")[0] : "",
  talimat_cutoff: rez.talimat_cutoff ? rez.talimat_cutoff.split("T")[0] : "",
  talimat_cutoff_saat: rez.talimat_cutoff && rez.talimat_cutoff.includes("T") ? rez.talimat_cutoff.split("T")[1].slice(0, 5) : "",
  beyanname_cutoff: rez.beyanname_cutoff ? rez.beyanname_cutoff.split("T")[0] : "",
  beyanname_cutoff_saat: rez.beyanname_cutoff && rez.beyanname_cutoff.includes("T") ? rez.beyanname_cutoff.split("T")[1].slice(0, 5) : "",
  ekipman_alim_yeri: rez.ekipman_alim_yeri || "",
  ekipman_alim_tarihi: rez.ekipman_alim_tarihi ? rez.ekipman_alim_tarihi.split("T")[0] : "",
  yuklenme_limani: rez.yuklenme_limani || "",
  konteyner_adedi: rez.konteyner_adedi || 0,
  ardiyesiz_giris: (rez as any).ardiyesiz_giris ? (rez as any).ardiyesiz_giris.split("T")[0] : "",
});

function buildPayload(form: typeof emptyForm) {
  return {
    booking_no: form.booking_no,
    gemi_adi: form.gemi_adi || null,
    sefer_no: form.sefer_no || null,
    acente_ismi: form.acente_ismi || null,
    gemi_kalkis_tarihi: form.gemi_kalkis_tarihi || null,
    talimat_cutoff: form.talimat_cutoff ? `${form.talimat_cutoff}T${form.talimat_cutoff_saat || "00:00"}:00` : null,
    beyanname_cutoff: form.beyanname_cutoff ? `${form.beyanname_cutoff}T${form.beyanname_cutoff_saat || "00:00"}:00` : null,
    ekipman_alim_yeri: form.ekipman_alim_yeri || null,
    ekipman_alim_tarihi: form.ekipman_alim_tarihi || null,
    yuklenme_limani: form.yuklenme_limani || null,
    konteyner_adedi: form.konteyner_adedi,
    ardiyesiz_giris: form.ardiyesiz_giris || null,
  };
}

/**
 * Siparis takibi baslatilmis bir dosyada (ana_siparis_id dolu) rezervasyon
 * kaydedildiginde, dosyadaki TUM rezervasyonlarin konteyner adedi toplamina
 * gore, ana siparisin ORIJINAL urun listesi (urun_detaylari_master) oransal
 * olarak olceklenir. Birden fazla urun/fiyat olsa bile her urunun kendi
 * birim fiyati korunur, sadece miktarlar o partide gonderilen orana gore
 * kuculur. Boylece Commercial Invoice, siparisin tamami yerine o partide
 * gonderilen MTS uzerinden dogru tutari gosterir.
 * ana_siparis_id olmayan (tek seferlik) dosyalara hic dokunulmaz.
 */
async function syncDevamEdenDosyaTutari(dosyaId: string, companyId: string) { // companyId içeri alındı
  if (!companyId) return;
  const { data: dosya } = await supabase
    .from("ihracat_dosyalari")
    .select("ana_siparis_id")
    .eq("id", dosyaId)
    .eq("company_id", companyId) // Şirket filtresi enjekte edildi
    .maybeSingle();
  if (!dosya?.ana_siparis_id) return;

  const { data: anaSiparis } = await supabase
    .from("ana_siparisler")
    .select("toplam_mts, urun_detaylari_master")
    .eq("id", dosya.ana_siparis_id)
    .eq("company_id", companyId) // Şirket filtresi enjekte edildi
    .maybeSingle();
  const masterUrunler = (anaSiparis?.urun_detaylari_master as any[]) || [];
  const toplamSiparisMts = anaSiparis?.toplam_mts || 0;
  if (masterUrunler.length === 0 || toplamSiparisMts <= 0) return;

  const { data: tumRezervasyonlar } = await supabase
    .from("rezervasyonlar")
    .select("konteyner_adedi")
    .eq("dosya_id", dosyaId)
    .eq("company_id", companyId); // Şirket filtresi enjekte edildi
  const toplamKonteynerAdedi = (tumRezervasyonlar || []).reduce((s, r: any) => s + (r.konteyner_adedi || 0), 0);
  if (toplamKonteynerAdedi <= 0) return;

  const buPartininMts = toplamKonteynerAdedi * MTS_PER_KONTEYNER;
  const oran = buPartininMts / toplamSiparisMts;

  const urunDetaylari = masterUrunler.map((u: any) => {
    const urunAdi = u.urun_adi || u.description || "";
    const ambalajBoyutu = u.ambalaj_boyutu || u.packaging_size || "";
    const urunToplamMts = parseFloat(String(u.miktar_mts || u.quantity || 0));
    const birimFiyat = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
    const buPartiMts = urunToplamMts * oran;
    const buPartiTutar = buPartiMts * birimFiyat;
    return {
      urun_adi: urunAdi,
      ambalaj_boyutu: ambalajBoyutu,
      miktar_mts: buPartiMts.toFixed(2),
      birim_fiyat_usd: String(birimFiyat),
      toplam_tutar_usd: buPartiTutar.toFixed(2),
    };
  });

  const toplamTutar = urunDetaylari.reduce((s, u) => s + parseFloat(u.toplam_tutar_usd), 0);

  await supabase
    .from("ihracat_dosyalari")
    .update({ urun_detaylari: urunDetaylari, toplam_tutar: toplamTutar })
    .eq("id", dosyaId)
    .eq("company_id", companyId); // Şirket kilidi enjekte edildi
}

function RezervasyonFormFields({ form, update, updateSaat, errors }: {
  form: typeof emptyForm;
  update: (field: string, value: string | number) => void;
  updateSaat: (field: string, value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Booking No *</label>
        <input value={form.booking_no} onChange={(e) => update("booking_no", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} maxLength={50} />
        {errors.booking_no && <p className="text-xs text-red-400 mt-0.5">{errors.booking_no}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Gemi Adi</label>
        <input value={form.gemi_adi} onChange={(e) => update("gemi_adi", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: NAVIOS AZURE" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Sefer No (Voyage No)</label>
        <input value={form.sefer_no} onChange={(e) => update("sefer_no", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: 1BM21S1MA" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Acente Ismi</label>
        <input value={form.acente_ismi} onChange={(e) => update("acente_ismi", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: MSC, CMA CGM" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Yukleme Limani</label>
        <input value={form.yuklenme_limani} onChange={(e) => update("yuklenme_limani", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Konteyner Adedi</label>
        <input type="number" min={0} value={form.konteyner_adedi} onChange={(e) => update("konteyner_adedi", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Gemi Kalkis Tarihi</label>
        <input type="date" value={form.gemi_kalkis_tarihi} onChange={(e) => update("gemi_kalkis_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Talimat Cut-Off</label>
        <input type="date" value={form.talimat_cutoff} onChange={(e) => update("talimat_cutoff", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {form.talimat_cutoff && (
          <input type="text" value={form.talimat_cutoff_saat} onChange={(e) => updateSaat("talimat_cutoff_saat", e.target.value)} placeholder="Saat (orn: 1200)" maxLength={5} className="w-full px-3 py-2 border rounded-lg text-sm mt-1.5 text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        )}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Beyanname Cut-Off</label>
        <input type="date" value={form.beyanname_cutoff} onChange={(e) => update("beyanname_cutoff", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {form.beyanname_cutoff && (
          <input type="text" value={form.beyanname_cutoff_saat} onChange={(e) => updateSaat("beyanname_cutoff_saat", e.target.value)} placeholder="Saat (orn: 1200)" maxLength={5} className="w-full px-3 py-2 border rounded-lg text-sm mt-1.5 text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        )}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ekipman Alim Tarihi</label>
        <input type="date" value={form.ekipman_alim_tarihi} onChange={(e) => update("ekipman_alim_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ardiyesiz Giris Tarihi</label>
        <input type="date" value={form.ardiyesiz_giris} onChange={(e) => update("ardiyesiz_giris", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ekipman Alim Yeri</label>
        <input value={form.ekipman_alim_yeri} onChange={(e) => update("ekipman_alim_yeri", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
      </div>
    </div>
  );
}

function RezervasyonCard({ rez, onRefresh, onDeleteRequest, companyId }: { // companyId eklendi
  rez: Rezervasyon;
  onRefresh: () => void;
  onDeleteRequest: (target: { id: string; bookingNo: string }) => void;
  companyId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const update = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const updateSaat = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: formatSaatInput(value) }));
  };

  const handleEditStart = () => {
    setForm(buildFormFromRez(rez));
    setErrors({});
    setEditing(true);
  };

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (!form.booking_no) e.booking_no = "Booking no zorunlu";
    else if (form.booking_no.length > 50) e.booking_no = "Maksimum 50 karakter";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    await supabase.from("rezervasyonlar").update(buildPayload(form)).eq("id", rez.id).eq("company_id", companyId); // Şirket kilidi eklendi
    await syncDevamEdenDosyaTutari(rez.dosya_id, companyId); // Şirket kimliği paslandı
    showToast("Rezervasyon guncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  if (editing) {
    return (
      <div className="rounded-xl border shadow-sm p-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-sm" style={{ color: "white" }}>Rezervasyonu Duzenle</h4>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="text-green-400 hover:text-green-300 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50">
              <Check size={12} /> {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => setEditing(false)} className="hover:text-white text-xs font-medium inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
              <X size={12} /> Iptal
            </button>
          </div>
        </div>
        <RezervasyonFormFields form={form} update={update} updateSaat={updateSaat} errors={errors} />
      </div>
    );
  }

  const talimatLabel = getCutOffLabel(rez.talimat_cutoff);
  const beyanLabel = getCutOffLabel(rez.beyanname_cutoff);

  return (
    <div className="rounded-xl border shadow-sm p-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-sm" style={{ color: "white" }}>
            Booking: <span className="font-mono">{rez.booking_no}</span>
          </h4>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {(rez as any).gemi_adi && (
              <p className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>Gemi: <span className="font-medium text-white">{(rez as any).gemi_adi}{(rez as any).sefer_no ? ` / ${(rez as any).sefer_no}` : ""}</span></p>
            )}
            {(rez as any).acente_ismi && (
              <p className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>Acente: <span className="font-medium text-white">{(rez as any).acente_ismi}</span></p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20">
            Duzenle
          </button>
          <button onClick={() => onDeleteRequest({ id: rez.id, bookingNo: rez.booking_no })} className="text-red-400 hover:text-red-300">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Yukleme Limani</p><p className="font-medium text-white">{rez.yuklenme_limani || "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Konteyner Adedi</p><p className="font-medium text-white">{rez.konteyner_adedi}</p></div>
        </div>

        <div className="border-t" style={{ borderColor: CARD_BORDER }} />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Talimat Cut-Off</p>
            {rez.talimat_cutoff ? (
              <div>
                <p className="font-medium text-white">{formatDateTR(rez.talimat_cutoff)}</p>
                <p style={{ color: TEXT_MUTED }}>{new Date(rez.talimat_cutoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ) : <p className="font-medium text-white">-</p>}
          </div>
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Beyanname Cut-Off</p>
            {rez.beyanname_cutoff ? (
              <div>
                <p className="font-medium text-white">{formatDateTR(rez.beyanname_cutoff)}</p>
                <p style={{ color: TEXT_MUTED }}>{new Date(rez.beyanname_cutoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ) : <p className="font-medium text-white">-</p>}
          </div>
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Gemi Kalkis</p>
            <p className={`font-medium ${getCutOffLabel(rez.gemi_kalkis_tarihi).color}`}>
              {rez.gemi_kalkis_tarihi ? `${formatDateTR(rez.gemi_kalkis_tarihi)} ${getCutOffLabel(rez.gemi_kalkis_tarihi).text}` : "-"}
            </p>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: CARD_BORDER }} />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ekipman Alim Tarihi</p><p className="font-medium text-white">{rez.ekipman_alim_tarihi ? formatDateTR(rez.ekipman_alim_tarihi) : "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ardiyesiz Giris Tarihi</p><p className="font-medium text-white">{(rez as any).ardiyesiz_giris ? formatDateTR((rez as any).ardiyesiz_giris) : "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ekipman Alim Yeri</p><p className="font-medium text-white">{rez.ekipman_alim_yeri || "-"}</p></div>
        </div>
      </div>
    </div>
  );
}

export default function RezervasyonTab({ dosyaId, rezervasyonlar, onRefresh, companyId }: Props) { // companyId eklendi
  const [showNewForm, setShowNewForm] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; bookingNo: string } | null>(null);
  const { showToast } = useToast();

  const updateNew = (field: string, value: string | number) => {
    setNewForm((prev) => ({ ...prev, [field]: value }));
    setNewErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const updateNewSaat = (field: string, value: string) => {
    setNewForm((prev) => ({ ...prev, [field]: formatSaatInput(value) }));
  };

  const handleSaveNew = async () => {
    const e: Record<string, string> = {};
    if (!newForm.booking_no) e.booking_no = "Booking no zorunlu";
    else if (newForm.booking_no.length > 50) e.booking_no = "Maksimum 50 karakter";
    setNewErrors(e);
    if (Object.keys(e).length > 0) return;

    setSavingNew(true);
    await supabase.from("rezervasyonlar").insert({ company_id: companyId, dosya_id: dosyaId, ...buildPayload(newForm) }); // company_id mühürlendi
    await syncDevamEdenDosyaTutari(dosyaId, companyId); // companyId paslandı
    showToast("Rezervasyon eklendi.", "success");
    setShowNewForm(false);
    setNewForm(emptyForm);
    setSavingNew(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("rezervasyonlar").delete().eq("id", deleteTarget.id).eq("company_id", companyId); // Şirket kilidi eklendi
    showToast(`${deleteTarget.bookingNo} silindi.`, "success");
    setDeleteTarget(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Emin misiniz?"
        description={`${deleteTarget?.bookingNo || ""} rezervasyonunu silmek istediginize emin misiniz?`}
        confirmLabel="Evet, Sil"
        cancelLabel="Hayir"
        onConfirm={handleDelete}
        destructive
      />

      {rezervasyonlar.map((rez) => (
        <RezervasyonCard key={rez.id} rez={rez} onRefresh={onRefresh} onDeleteRequest={setDeleteTarget} companyId={companyId} /> // companyId eklendi
      ))}

      {!showNewForm ? (
        <div>
          {rezervasyonlar.length === 0 && (
            <EmptyState icon={<Package size={36} />} title="Henuz rezervasyon yok" description="Bu dosyaya bir rezervasyon ekleyin" />
          )}
          <button onClick={() => { setNewForm(emptyForm); setShowNewForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors mt-2">
            <Plus size={16} /> Yeni Rezervasyon Ekle
          </button>
        </div>
      ) : (
        <div className="rounded-xl border shadow-sm p-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <h4 className="font-semibold text-sm mb-4" style={{ color: "white" }}>Yeni Rezervasyon</h4>
          <RezervasyonFormFields form={newForm} update={updateNew} updateSaat={updateNewSaat} errors={newErrors} />
          <div className="flex gap-3 mt-6">
            <button onClick={handleSaveNew} disabled={savingNew} className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {savingNew ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => { setShowNewForm(false); setNewForm(emptyForm); }} className="px-5 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 transition-all" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              Iptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
