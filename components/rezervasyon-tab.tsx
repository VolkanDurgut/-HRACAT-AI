"use client";
import React, { useState } from "react";
import { supabase, Rezervasyon, Dosya, MTS_PER_KONTEYNER, depoDosyalariniTopluSil, yazmaHatasi } from "@/lib/supabase";
import { formatDateTR, getCutOffDays, getCutOffLabel, formatCutoffSaat, formatCutoffTarih, formatCurrency } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Trash2, Plus, Package, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type TabKey = "proforma" | "evraklar" | "rezervasyon" | "konteynerler";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  onNavigateTab: (tab: TabKey) => void;
  companyId: string; // Şirket bazlı izolasyon için eklendi
};

/** Silme onay penceresinde gosterilen hedef + bagli konteyner ozeti. */
type SilmeHedefi = {
  id: string;
  bookingNo: string;
  konteynerSayisi: number;
  dbaSayisi: number;
  irsaliyeSayisi: number;
};

const emptyForm = {
  booking_no: "", gemi_adi: "", sefer_no: "", acente_ismi: "", gemi_kalkis_tarihi: "", talimat_cutoff: "", talimat_cutoff_saat: "",
  beyanname_cutoff: "", beyanname_cutoff_saat: "", ekipman_alim_yeri: "", ekipman_alim_tarihi: "",
  yuklenme_limani: "", konteyner_adedi: 0,
  ardiyesiz_giris: "",
  navlun_tutari: "", lokal_masraf_tutari: "",
};

const formatSaatInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
};

const buildFormFromRez = (rez: Rezervasyon, dosya: Dosya) => ({
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
  navlun_tutari: dosya.navlun_tutari?.toString() || "",
  lokal_masraf_tutari: dosya.lokal_masraf_tutari?.toString() || "",
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

function buildDosyaPayload(form: typeof emptyForm) {
  return {
    navlun_tutari: form.navlun_tutari ? parseFloat(form.navlun_tutari) : null,
    lokal_masraf_tutari: form.lokal_masraf_tutari ? parseFloat(form.lokal_masraf_tutari) : null,
  };
}

/** Tum alanlar doldurulmadan kayit yapilamaz. */
function validateForm(form: typeof emptyForm): Record<string, string> {
  const e: Record<string, string> = {};
  const zorunlu = "Zorunlu alan";
  if (!form.booking_no) e.booking_no = zorunlu;
  else if (form.booking_no.length > 50) e.booking_no = "Maksimum 50 karakter";
  if (!form.gemi_adi) e.gemi_adi = zorunlu;
  if (!form.sefer_no) e.sefer_no = zorunlu;
  if (!form.acente_ismi) e.acente_ismi = zorunlu;
  if (!form.yuklenme_limani) e.yuklenme_limani = zorunlu;
  if (!form.konteyner_adedi || form.konteyner_adedi <= 0) e.konteyner_adedi = zorunlu;
  if (!form.gemi_kalkis_tarihi) e.gemi_kalkis_tarihi = zorunlu;
  if (!form.talimat_cutoff) e.talimat_cutoff = zorunlu;
  if (!form.talimat_cutoff_saat) e.talimat_cutoff_saat = zorunlu;
  if (!form.beyanname_cutoff) e.beyanname_cutoff = zorunlu;
  if (!form.beyanname_cutoff_saat) e.beyanname_cutoff_saat = zorunlu;
  if (!form.ekipman_alim_tarihi) e.ekipman_alim_tarihi = zorunlu;
  if (!form.ardiyesiz_giris) e.ardiyesiz_giris = zorunlu;
  if (!form.ekipman_alim_yeri) e.ekipman_alim_yeri = zorunlu;
  if (!form.navlun_tutari) e.navlun_tutari = zorunlu;
  if (!form.lokal_masraf_tutari) e.lokal_masraf_tutari = zorunlu;
  return e;
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
 *
 * Donus: guncelleme gerekmiyorsa veya basariliysa true; tutar guncellemesi
 * BASARISIZ olursa false (cagiran taraf kullaniciyi uyarir - 01.10.2026).
 */
async function syncDevamEdenDosyaTutari(dosyaId: string, companyId: string): Promise<boolean> {
  if (!companyId) return true;
  const { data: dosya } = await supabase
    .from("ihracat_dosyalari")
    .select("ana_siparis_id")
    .eq("id", dosyaId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!dosya?.ana_siparis_id) return true;

  const { data: anaSiparis } = await supabase
    .from("ana_siparisler")
    .select("toplam_mts, urun_detaylari_master")
    .eq("id", dosya.ana_siparis_id)
    .eq("company_id", companyId)
    .maybeSingle();
  const masterUrunler = (anaSiparis?.urun_detaylari_master as any[]) || [];
  const toplamSiparisMts = anaSiparis?.toplam_mts || 0;
  if (masterUrunler.length === 0 || toplamSiparisMts <= 0) return true;

  const { data: tumRezervasyonlar } = await supabase
    .from("rezervasyonlar")
    .select("konteyner_adedi")
    .eq("dosya_id", dosyaId)
    .eq("company_id", companyId);
  const toplamKonteynerAdedi = (tumRezervasyonlar || []).reduce((s, r: any) => s + (r.konteyner_adedi || 0), 0);
  if (toplamKonteynerAdedi <= 0) return true;

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

  const { data, error } = await supabase
    .from("ihracat_dosyalari")
    .update({ urun_detaylari: urunDetaylari, toplam_tutar: toplamTutar })
    .eq("id", dosyaId)
    .eq("company_id", companyId)
    .select("id");
  const hata = yazmaHatasi(error, data);
  if (hata) {
    console.error("Urun tutarlari guncellenemedi:", hata);
    return false;
  }
  return true;
}

/**
 * Rezervasyon kaydedildikten SONRA calisan ikincil adimlarin (navlun/lokal
 * masraf ve siparis tutari) sonucuna gore dogru mesaji gosterir. Ana kayit
 * zaten basarili oldugu icin bu adimlarin hatasi "kaydedildi ANCAK ..." diye
 * acikca soylenir, sessizce yutulmaz (01.10.2026).
 */
function ikincilAdimMesaji(navlunHatasi: string | null, tutarBasarili: boolean, basariMesaji: string): { mesaj: string; tur: "success" | "error" } {
  if (navlunHatasi) return { mesaj: `Rezervasyon kaydedildi ancak navlun / lokal masraf kaydedilemedi: ${navlunHatasi}`, tur: "error" };
  if (!tutarBasarili) return { mesaj: "Rezervasyon kaydedildi ancak ürün tutarları güncellenemedi. Lütfen rezervasyonu tekrar kaydedin.", tur: "error" };
  return { mesaj: basariMesaji, tur: "success" };
}

function RezervasyonFormFields({ form, update, updateSaat, errors, dosya }: {
  form: typeof emptyForm;
  update: (field: string, value: string | number) => void;
  updateSaat: (field: string, value: string) => void;
  errors: Record<string, string>;
  dosya: Dosya;
}) {
  const hataGoster = (alan: string) => errors[alan] && <p className="text-xs text-red-400 mt-0.5">{errors[alan]}</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Booking No *</label>
        <input value={form.booking_no} onChange={(e) => update("booking_no", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} maxLength={50} />
        {hataGoster("booking_no")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Gemi Adi *</label>
        <input value={form.gemi_adi} onChange={(e) => update("gemi_adi", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: NAVIOS AZURE" />
        {hataGoster("gemi_adi")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Sefer No (Voyage No) *</label>
        <input value={form.sefer_no} onChange={(e) => update("sefer_no", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: 1BM21S1MA" />
        {hataGoster("sefer_no")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Acente Ismi *</label>
        <input value={form.acente_ismi} onChange={(e) => update("acente_ismi", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} placeholder="orn: MSC, CMA CGM" />
        {hataGoster("acente_ismi")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Yukleme Limani *</label>
        <input value={form.yuklenme_limani} onChange={(e) => update("yuklenme_limani", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        {hataGoster("yuklenme_limani")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Konteyner Adedi *</label>
        <input type="number" min={0} value={form.konteyner_adedi} onChange={(e) => update("konteyner_adedi", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        {hataGoster("konteyner_adedi")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Gemi Kalkis Tarihi *</label>
        <input type="date" value={form.gemi_kalkis_tarihi} onChange={(e) => update("gemi_kalkis_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {hataGoster("gemi_kalkis_tarihi")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Talimat Cut-Off *</label>
        <input type="date" value={form.talimat_cutoff} onChange={(e) => update("talimat_cutoff", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {hataGoster("talimat_cutoff")}
        {form.talimat_cutoff && (
          <>
            <input type="text" value={form.talimat_cutoff_saat} onChange={(e) => updateSaat("talimat_cutoff_saat", e.target.value)} placeholder="Saat (orn: 1200)" maxLength={5} className="w-full px-3 py-2 border rounded-lg text-sm mt-1.5 text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            {hataGoster("talimat_cutoff_saat")}
          </>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Beyanname Cut-Off *</label>
        <input type="date" value={form.beyanname_cutoff} onChange={(e) => update("beyanname_cutoff", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {hataGoster("beyanname_cutoff")}
        {form.beyanname_cutoff && (
          <>
            <input type="text" value={form.beyanname_cutoff_saat} onChange={(e) => updateSaat("beyanname_cutoff_saat", e.target.value)} placeholder="Saat (orn: 1200)" maxLength={5} className="w-full px-3 py-2 border rounded-lg text-sm mt-1.5 text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            {hataGoster("beyanname_cutoff_saat")}
          </>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ekipman Alim Tarihi *</label>
        <input type="date" value={form.ekipman_alim_tarihi} onChange={(e) => update("ekipman_alim_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {hataGoster("ekipman_alim_tarihi")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ardiyesiz Giris Tarihi *</label>
        <input type="date" value={form.ardiyesiz_giris} onChange={(e) => update("ardiyesiz_giris", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
        {hataGoster("ardiyesiz_giris")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ekipman Alim Yeri *</label>
        <input value={form.ekipman_alim_yeri} onChange={(e) => update("ekipman_alim_yeri", e.target.value.toUpperCase())} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        {hataGoster("ekipman_alim_yeri")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Navlun Tutari (Konteyner Basi, {dosya.para_birimi || "USD"}) *</label>
        <input type="number" step="0.01" value={form.navlun_tutari} onChange={(e) => update("navlun_tutari", e.target.value)} placeholder="orn: 400" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        {hataGoster("navlun_tutari")}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Lokal Masraf (Konteyner Basi, {dosya.para_birimi || "USD"}) *</label>
        <input type="number" step="0.01" value={form.lokal_masraf_tutari} onChange={(e) => update("lokal_masraf_tutari", e.target.value)} placeholder="orn: 150" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
        {hataGoster("lokal_masraf_tutari")}
      </div>
    </div>
  );
}

function RezervasyonCard({ rez, dosya, onRefresh, onDeleteRequest, companyId }: {
  rez: Rezervasyon;
  dosya: Dosya;
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
    setForm(buildFormFromRez(rez, dosya));
    setErrors({});
    setEditing(true);
  };

  const handleSave = async () => {
    const e = validateForm(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const { data: rezData, error: rezError } = await supabase
      .from("rezervasyonlar").update(buildPayload(form)).eq("id", rez.id).eq("company_id", companyId).select("id");
    const rezHata = yazmaHatasi(rezError, rezData);
    if (rezHata) {
      // Kayit basarisiz: pencere ACIK kalir, girilen bilgiler kaybolmaz.
      showToast(`Rezervasyon kaydedilemedi: ${rezHata}`, "error");
      setSaving(false);
      return;
    }
    const { data: dosyaData, error: dosyaError } = await supabase
      .from("ihracat_dosyalari").update(buildDosyaPayload(form)).eq("id", rez.dosya_id).eq("company_id", companyId).select("id");
    const tutarBasarili = await syncDevamEdenDosyaTutari(rez.dosya_id, companyId);
    const sonuc = ikincilAdimMesaji(yazmaHatasi(dosyaError, dosyaData), tutarBasarili, "Rezervasyon guncellendi.");
    showToast(sonuc.mesaj, sonuc.tur);
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
        <div className="rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
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
          <RezervasyonFormFields form={form} update={update} updateSaat={updateSaat} errors={errors} dosya={dosya} />
        </div>
      </div>
    );
  }

  const talimatLabel = getCutOffLabel(rez.talimat_cutoff);
  const beyanLabel = getCutOffLabel(rez.beyanname_cutoff);

  const paraBirimi = dosya.para_birimi || "USD";
  const navlunTutari = dosya.navlun_tutari;
  const lokalMasrafTutari = dosya.lokal_masraf_tutari;

  return (
    <div className="rounded-xl border shadow-sm p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex items-start justify-between mb-3 pb-3 border-b" style={{ borderColor: CARD_BORDER }}>
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
        <div className="flex gap-2 shrink-0">
          <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20">
            Duzenle
          </button>
          <button onClick={() => onDeleteRequest({ id: rez.id, bookingNo: rez.booking_no })} className="text-red-400 hover:text-red-300">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2.5 text-sm">
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Yukleme Limani</p><p className="font-medium text-white">{rez.yuklenme_limani || "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Konteyner Adedi</p><p className="font-medium text-white">{rez.konteyner_adedi}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Navlun (Kont. Basi)</p><p className="font-medium text-white">{navlunTutari ? formatCurrency(navlunTutari, paraBirimi) : "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Lokal Masraf (Kont. Basi)</p><p className="font-medium text-white">{lokalMasrafTutari ? formatCurrency(lokalMasrafTutari, paraBirimi) : "-"}</p></div>
        </div>

        <div className="border-t" style={{ borderColor: CARD_BORDER }} />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Talimat Cut-Off</p>
            {rez.talimat_cutoff ? (
              <p className="font-medium text-white">{formatCutoffTarih(rez.talimat_cutoff)} <span className="font-normal" style={{ color: TEXT_MUTED }}>{formatCutoffSaat(rez.talimat_cutoff)}</span></p>
            ) : <p className="font-medium text-white">-</p>}
          </div>
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Beyanname Cut-Off</p>
            {rez.beyanname_cutoff ? (
              <p className="font-medium text-white">{formatCutoffTarih(rez.beyanname_cutoff)} <span className="font-normal" style={{ color: TEXT_MUTED }}>{formatCutoffSaat(rez.beyanname_cutoff)}</span></p>
            ) : <p className="font-medium text-white">-</p>}
          </div>
          <div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Gemi Kalkis</p>
            <p className="font-medium text-white">
              {rez.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : "-"}
              {rez.gemi_kalkis_tarihi && (
                <span className={`ml-1 font-medium ${getCutOffLabel(rez.gemi_kalkis_tarihi).color}`}>{getCutOffLabel(rez.gemi_kalkis_tarihi).text}</span>
              )}
            </p>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: CARD_BORDER }} />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ekipman Alim Tarihi</p><p className="font-medium text-white">{rez.ekipman_alim_tarihi ? formatDateTR(rez.ekipman_alim_tarihi) : "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ardiyesiz Giris Tarihi</p><p className="font-medium text-white">{(rez as any).ardiyesiz_giris ? formatDateTR((rez as any).ardiyesiz_giris) : "-"}</p></div>
          <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ekipman Alim Yeri</p><p className="font-medium text-white">{rez.ekipman_alim_yeri || "-"}</p></div>
        </div>
      </div>
    </div>
  );
}

export default function RezervasyonTab({ dosyaId, dosya, rezervasyonlar, onRefresh, companyId }: Props) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<SilmeHedefi | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const { showToast } = useToast();

  const updateNew = (field: string, value: string | number) => {
    setNewForm((prev) => ({ ...prev, [field]: value }));
    setNewErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const updateNewSaat = (field: string, value: string) => {
    setNewForm((prev) => ({ ...prev, [field]: formatSaatInput(value) }));
  };

  const handleAcNewForm = () => {
    setNewForm({
      ...emptyForm,
      navlun_tutari: dosya.navlun_tutari?.toString() || "",
      lokal_masraf_tutari: dosya.lokal_masraf_tutari?.toString() || "",
    });
    setNewErrors({});
    setShowNewForm(true);
  };

  const handleSaveNew = async () => {
    const e = validateForm(newForm);
    setNewErrors(e);
    if (Object.keys(e).length > 0) return;

    setSavingNew(true);
    const { data: rezData, error: rezError } = await supabase
      .from("rezervasyonlar").insert({ company_id: companyId, dosya_id: dosyaId, ...buildPayload(newForm) }).select("id");
    const rezHata = yazmaHatasi(rezError, rezData);
    if (rezHata) {
      // Kayit basarisiz: form ACIK kalir, girilen bilgiler kaybolmaz.
      showToast(`Rezervasyon eklenemedi: ${rezHata}`, "error");
      setSavingNew(false);
      return;
    }
    const { data: dosyaData, error: dosyaError } = await supabase
      .from("ihracat_dosyalari").update(buildDosyaPayload(newForm)).eq("id", dosyaId).eq("company_id", companyId).select("id");
    const tutarBasarili = await syncDevamEdenDosyaTutari(dosyaId, companyId);
    const sonuc = ikincilAdimMesaji(yazmaHatasi(dosyaError, dosyaData), tutarBasarili, "Rezervasyon eklendi.");
    showToast(sonuc.mesaj, sonuc.tur);
    setShowNewForm(false);
    setNewForm(emptyForm);
    setSavingNew(false);
    onRefresh();
  };

  // Cop kutusuna basildiginda: once bu rezervasyona bagli konteynerler sayilir,
  // onay penceresi neyin silinecegini ACIKCA soyler (talep: 01.10.2026).
  // Neden: konteynerler.rezervasyon_id FK'si ON DELETE CASCADE - rezervasyon
  // silinince bagli TUM konteynerler (DBA/irsaliye/kantar verisi dahil)
  // veritabani tarafindan otomatik silinir. Eskiden pencere bundan hic
  // bahsetmiyordu.
  const handleDeleteRequest = async (hedef: { id: string; bookingNo: string }) => {
    const { data, error } = await supabase
      .from("konteynerler")
      .select("dba_dosya_url, irsaliye_dosya_url")
      .eq("rezervasyon_id", hedef.id)
      .eq("company_id", companyId);
    if (error) {
      showToast(`Rezervasyon bilgisi okunamadı: ${error.message}`, "error");
      return;
    }
    const liste = data || [];
    setDeleteTarget({
      ...hedef,
      konteynerSayisi: liste.length,
      dbaSayisi: liste.filter((k) => !!k.dba_dosya_url).length,
      irsaliyeSayisi: liste.filter((k) => !!k.irsaliye_dosya_url).length,
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget || siliniyor) return;
    const hedef = deleteTarget;
    setSiliniyor(true);
    try {
      // Silmeden HEMEN once bagli konteynerlerin storage dosyalarini TAZE oku
      // (pencere acikken baska biri konteyner/DBA eklemis olabilir).
      const { data: bagliKonteynerler } = await supabase
        .from("konteynerler")
        .select("dba_dosya_url, irsaliye_dosya_url")
        .eq("rezervasyon_id", hedef.id)
        .eq("company_id", companyId);

      const { data: silinen, error } = await supabase
        .from("rezervasyonlar").delete().eq("id", hedef.id).eq("company_id", companyId).select("id");
      const silmeHatasi = yazmaHatasi(error, silinen);
      if (silmeHatasi) {
        // Silme basarisizsa HICBIR dosyaya dokunulmaz.
        showToast(`Rezervasyon silinemedi: ${silmeHatasi}`, "error");
        return;
      }

      // Veritabani silmesi BASARILI olduktan sonra: CASCADE ile silinen
      // konteynerlerin DBA/irsaliye PDF'leri storage'da yetim kalmasin
      // (best-effort, bkz. lib/supabase/storage.ts).
      const urls = (bagliKonteynerler || []).flatMap((k: any) => [k.dba_dosya_url, k.irsaliye_dosya_url]);
      await depoDosyalariniTopluSil(urls);

      // Siparis takipli dosyalarda urun tutarlari kalan rezervasyonlara gore
      // yeniden olceklenir - kaydet/ekle akisiyla ayni kural.
      const tutarBasarili = await syncDevamEdenDosyaTutari(dosyaId, companyId);

      const kontSayisi = (bagliKonteynerler || []).length;
      const silindiMesaji = kontSayisi > 0
        ? `${hedef.bookingNo} ve bağlı ${kontSayisi} konteyner silindi.`
        : `${hedef.bookingNo} silindi.`;
      if (tutarBasarili) {
        showToast(silindiMesaji, "success");
      } else {
        showToast(`${silindiMesaji} Ancak ürün tutarları güncellenemedi; kalan rezervasyonlardan birini tekrar kaydedin.`, "error");
      }
      onRefresh();
    } finally {
      setSiliniyor(false);
      setDeleteTarget(null);
    }
  };

  const silmeAciklamasi = (() => {
    if (!deleteTarget) return "";
    const temel = `${deleteTarget.bookingNo} rezervasyonunu silmek istediğinize emin misiniz?`;
    if (deleteTarget.konteynerSayisi === 0) return temel;
    const belgeler: string[] = [];
    if (deleteTarget.dbaSayisi > 0) belgeler.push(`${deleteTarget.dbaSayisi} DBA`);
    if (deleteTarget.irsaliyeSayisi > 0) belgeler.push(`${deleteTarget.irsaliyeSayisi} irsaliye`);
    const belgeMetni = belgeler.length > 0 ? ` (${belgeler.join(", ")} belgesi dahil)` : "";
    return `${temel} DİKKAT: Bu rezervasyona bağlı ${deleteTarget.konteynerSayisi} konteyner${belgeMetni} de kantar ve ağırlık bilgileriyle birlikte KALICI OLARAK silinecek. Bu işlem geri alınamaz.`;
  })();

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={deleteTarget && deleteTarget.konteynerSayisi > 0 ? "Rezervasyon ve konteynerleri silinecek" : "Emin misiniz?"}
        description={silmeAciklamasi}
        confirmLabel={deleteTarget && deleteTarget.konteynerSayisi > 0 ? "Evet, Hepsini Sil" : "Evet, Sil"}
        cancelLabel="Hayir"
        onConfirm={handleDelete}
        destructive
        loading={siliniyor}
        loadingLabel="Siliniyor..."
      />

      {rezervasyonlar.map((rez) => (
        <RezervasyonCard key={rez.id} rez={rez} dosya={dosya} onRefresh={onRefresh} onDeleteRequest={handleDeleteRequest} companyId={companyId} />
      ))}

      {!showNewForm ? (
        <div>
          {rezervasyonlar.length === 0 && (
            <EmptyState icon={<Package size={36} />} title="Henuz rezervasyon yok" description="Bu dosyaya bir rezervasyon ekleyin" />
          )}
          <button onClick={handleAcNewForm}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors mt-2">
            <Plus size={16} /> Yeni Rezervasyon Ekle
          </button>
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowNewForm(false); setNewForm(emptyForm); }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold text-sm mb-4" style={{ color: "white" }}>Yeni Rezervasyon</h4>
            <RezervasyonFormFields form={newForm} update={updateNew} updateSaat={updateNewSaat} errors={newErrors} dosya={dosya} />
            <div className="flex gap-3 mt-6">
              <button onClick={handleSaveNew} disabled={savingNew} className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {savingNew ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button onClick={() => { setShowNewForm(false); setNewForm(emptyForm); }} className="px-5 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 transition-all" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                Iptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}