"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X, Banknote, Plus, Loader2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string; // SaaS şirket bazlı izolasyon için eklendi
};

/**
 * Sirketin kendi banka hesaplari - "Duzenle" modalinda tek tikla otomatik
 * doldurmak icin. Her banka hem USD hem EUR hesabina sahip oldugundan,
 * hangisinin kullanilacagi dosyanin KENDI para birimine (dosya.para_birimi)
 * gore otomatik secilir - kullaniciya ekstra bir soru sorulmaz.
 */
const BANKA_PRESETLERI: {
  anahtar: string;
  goruntulenenAd: string;
  banka: string;
  swift: string;
  usd: { hesap_numarasi: string; iban: string };
  eur: { hesap_numarasi: string; iban: string };
}[] = [
  {
    anahtar: "denizbank",
    goruntulenenAd: "Denizbank",
    banka: "DENIZBANK A.S.",
    swift: "DENITRISXXX",
    usd: { hesap_numarasi: "1525-19081507-352", iban: "TR71 0013 4000 0190 8150 7000 02" },
    eur: { hesap_numarasi: "1525-19081507-361", iban: "TR74 0013 4000 0190 8150 7000 45" },
  },
  {
    anahtar: "vakifbank",
    goruntulenenAd: "Vakıfbank",
    banka: "T.C. VAKIFBANK A.S",
    swift: "TVBATR2AXXX",
    usd: { hesap_numarasi: "0015 8048 0198 35658", iban: "TR93 0001 5001 5804 8019 8356 58" },
    eur: { hesap_numarasi: "001 5804 8019 8356 66", iban: "TR71 0001 5001 5804 8019 8356 66" },
  },
  {
    anahtar: "ziraat",
    goruntulenenAd: "Ziraat Bankası",
    banka: "T.C. ZIRAAT BANKASI",
    swift: "TCZBTR2A",
    usd: { hesap_numarasi: "27 0897 5159 0150 06", iban: "TR82 0001 0027 0897 5159 0150 06" },
    eur: { hesap_numarasi: "27 0897 5159 0150 07", iban: "TR55 0001 0027 0897 5159 0150 07" },
  },
];

/** Sirketin banka hesaplarindaki sabit hesap adi - tum bankalarda ayni. */
const SABIT_HESAP_ADI = "UNEX GIDA SAN. VE TIC. LTD. STI.";

type OzelPreset = {
  id: string;
  goruntulenen_ad: string;
  hesap_adi: string | null;
  banka: string | null;
  swift: string | null;
  hesap_numarasi: string | null;
  iban: string | null;
};

/**
 * Banka bilgilerini (Hesap Adi, Banka, SWIFT, IBAN, Hesap Numarasi) gosterir
 * ve kendi basina, Ek Bilgiler karti ile ilgisiz, bagimsiz duzenlenebilir kilar.
 */
export default function BankaBilgileriCard({ dosya, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Kullanicinin kendi kaydettigi banka kartlari (sirket bazli).
  const [ozelPresetler, setOzelPresetler] = useState<OzelPreset[]>([]);
  const [yeniKartFormuAcik, setYeniKartFormuAcik] = useState(false);
  const [kartKaydediliyor, setKartKaydediliyor] = useState(false);
  const [silinenPresetId, setSilinenPresetId] = useState<string | null>(null);

  // Yeni kart EKLEME formu, dosyanin kendi banka bilgilerini gosteren `form`
  // state'inden TAMAMEN AYRI ve bagimsizdir - biri digerini etkilemez.
  const bosYeniKart = () => ({ kartAdi: "", hesap_adi: SABIT_HESAP_ADI, banka: "", swift: "", hesap_numarasi: "", iban: "" });
  const [yeniKart, setYeniKart] = useState(bosYeniKart);
  const yeniKartGuncelle = (field: keyof ReturnType<typeof bosYeniKart>, value: string) => {
    setYeniKart((prev) => ({ ...prev, [field]: value }));
  };

  const ozelPresetleriYukle = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("banka_presetleri")
      .select("id, goruntulenen_ad, hesap_adi, banka, swift, hesap_numarasi, iban")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (!error) setOzelPresetler(data || []);
  }, [companyId]);

  useEffect(() => {
    ozelPresetleriYukle();
  }, [ozelPresetleriYukle]);

  const buildEmptyForm = () => ({
    hesap_adi: (dosya as any).hesap_adi || "",
    banka: (dosya as any).banka || "",
    swift: (dosya as any).swift || "",
    hesap_numarasi: (dosya as any).hesap_numarasi || "",
    iban: (dosya as any).iban || "",
  });
  const [form, setForm] = useState(buildEmptyForm);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditStart = () => {
    setForm(buildEmptyForm());
    setEditing(true);
  };

  /** Modali her kapatista yeni kart mini-formunu da sifirlar - tutarli davranis icin tek noktadan. */
  const handleModalKapat = () => {
    setEditing(false);
    setYeniKartFormuAcik(false);
    setYeniKart(bosYeniKart());
  };

  /**
   * Secilen banka presetini forma uygular. Dosyanin para birimi EUR ise EUR
   * hesabi, aksi halde (USD veya belirtilmemisse) USD hesabi kullanilir.
   */
  const uygulaBankaPreset = (preset: (typeof BANKA_PRESETLERI)[number]) => {
    const paraBirimi = (dosya.para_birimi || "").toUpperCase().trim();
    const hesap = paraBirimi === "EUR" ? preset.eur : preset.usd;
    setForm({
      hesap_adi: SABIT_HESAP_ADI,
      banka: preset.banka,
      swift: preset.swift,
      hesap_numarasi: hesap.hesap_numarasi,
      iban: hesap.iban,
    });
  };

  const uygulaOzelPreset = (preset: OzelPreset) => {
    setForm({
      hesap_adi: preset.hesap_adi || "",
      banka: preset.banka || "",
      swift: preset.swift || "",
      hesap_numarasi: preset.hesap_numarasi || "",
      iban: preset.iban || "",
    });
  };

  const handleKartOlarakKaydet = async () => {
    const ad = yeniKart.kartAdi.trim();
    if (!ad) {
      showToast("Kart için bir isim girin.", "error");
      return;
    }
    if (!yeniKart.banka && !yeniKart.iban) {
      showToast("Kaydetmeden önce en azından Banka veya IBAN alanını doldurun.", "error");
      return;
    }
    setKartKaydediliyor(true);
    const { error } = await supabase.from("banka_presetleri").insert({
      company_id: companyId,
      goruntulenen_ad: ad,
      hesap_adi: yeniKart.hesap_adi || null,
      banka: yeniKart.banka || null,
      swift: yeniKart.swift || null,
      hesap_numarasi: yeniKart.hesap_numarasi || null,
      iban: yeniKart.iban || null,
    });
    setKartKaydediliyor(false);
    if (error) {
      showToast("Kart kaydedilemedi.", "error");
      return;
    }
    showToast(`"${ad}" kart olarak kaydedildi.`, "success");
    setYeniKart(bosYeniKart());
    setYeniKartFormuAcik(false);
    ozelPresetleriYukle();
  };

  const handleOzelPresetSil = async (preset: OzelPreset) => {
    if (!window.confirm(`"${preset.goruntulenen_ad}" kartını silmek istediğinize emin misiniz?`)) return;
    setSilinenPresetId(preset.id);
    const { error } = await supabase.from("banka_presetleri").delete().eq("id", preset.id).eq("company_id", companyId);
    setSilinenPresetId(null);
    if (error) {
      showToast("Kart silinemedi.", "error");
      return;
    }
    showToast("Kart silindi.", "success");
    setOzelPresetler((prev) => prev.filter((p) => p.id !== preset.id));
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      hesap_adi: form.hesap_adi || null,
      banka: form.banka || null,
      swift: form.swift || null,
      hesap_numarasi: form.hesap_numarasi || null,
      iban: form.iban || null,
    };
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Banka bilgileri guncellendi.", "success");
    setSaving(false);
    handleModalKapat();
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Banka Bilgileri</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Hesap Adi" value={(dosya as any).hesap_adi} />
        <CopyableField dark label="Banka" value={(dosya as any).banka} />
        <CopyableField dark label="SWIFT" value={(dosya as any).swift} monospace />
        <CopyableField dark label="Hesap Numarası" value={(dosya as any).hesap_numarasi} monospace />
        <CopyableField dark label="IBAN" value={(dosya as any).iban} monospace />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleModalKapat}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Banka Bilgilerini Duzenle</h3>
              <button onClick={handleModalKapat} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium mb-2" style={{ color: TEXT_MUTED }}>
                Hızlı doldur ({(dosya.para_birimi || "USD").toUpperCase() === "EUR" ? "EUR" : "USD"} hesabı):
              </p>
              <div className="flex flex-wrap gap-2">
                {BANKA_PRESETLERI.map((preset) => (
                  <button
                    key={preset.anahtar}
                    type="button"
                    onClick={() => uygulaBankaPreset(preset)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 transition-colors"
                    style={{ borderColor: CARD_BORDER, color: "white" }}
                  >
                    <Banknote size={12} style={{ color: ACCENT }} /> {preset.goruntulenenAd}
                  </button>
                ))}
                {ozelPresetler.map((preset) => (
                  <div
                    key={preset.id}
                    className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: CARD_BORDER, color: "white" }}
                  >
                    <button type="button" onClick={() => uygulaOzelPreset(preset)} className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                      <Banknote size={12} style={{ color: ACCENT }} /> {preset.goruntulenen_ad}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOzelPresetSil(preset)}
                      disabled={silinenPresetId === preset.id}
                      title="Bu kartı sil"
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                      style={{ color: TEXT_MUTED }}
                    >
                      {silinenPresetId === preset.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                    </button>
                  </div>
                ))}
                {!yeniKartFormuAcik && (
                  <button
                    type="button"
                    onClick={() => setYeniKartFormuAcik(true)}
                    title="Yeni bir banka için boş bir form açar - dosyanın mevcut banka bilgilerini etkilemez"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed hover:bg-white/5 transition-colors"
                    style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
                  >
                    <Plus size={12} /> Yeni Banka Kartı Ekle
                  </button>
                )}
              </div>

              {yeniKartFormuAcik && (
                <div className="mt-3 p-3 rounded-lg border space-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.02)" }}>
                  <p className="text-xs font-medium" style={{ color: "white" }}>Yeni Banka Kartı</p>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                    Bu, aşağıdaki &quot;Banka Bilgilerini Düzenle&quot; formundan tamamen ayrı, boş bir formdur - burayı doldurmak dosyanın mevcut banka bilgilerini değiştirmez, sadece yeni bir hızlı-doldur kartı oluşturur.
                  </p>
                  <input
                    autoFocus
                    value={yeniKart.kartAdi}
                    onChange={(e) => yeniKartGuncelle("kartAdi", e.target.value)}
                    placeholder="Kart adı (ör. Akbank USD) *"
                    className="w-full px-3 py-1.5 border rounded-lg text-xs text-white"
                    style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={yeniKart.hesap_adi} onChange={(e) => yeniKartGuncelle("hesap_adi", e.target.value)} placeholder="Hesap Adı" className="px-3 py-1.5 border rounded-lg text-xs text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    <input value={yeniKart.banka} onChange={(e) => yeniKartGuncelle("banka", e.target.value)} placeholder="Banka *" className="px-3 py-1.5 border rounded-lg text-xs text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    <input value={yeniKart.swift} onChange={(e) => yeniKartGuncelle("swift", e.target.value)} placeholder="SWIFT" className="px-3 py-1.5 border rounded-lg text-xs font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    <input value={yeniKart.hesap_numarasi} onChange={(e) => yeniKartGuncelle("hesap_numarasi", e.target.value)} placeholder="Hesap Numarası" className="px-3 py-1.5 border rounded-lg text-xs font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                  </div>
                  <input value={yeniKart.iban} onChange={(e) => yeniKartGuncelle("iban", e.target.value)} placeholder="IBAN *" className="w-full px-3 py-1.5 border rounded-lg text-xs font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleKartOlarakKaydet}
                      disabled={kartKaydediliyor}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {kartKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Kartı Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() => { setYeniKartFormuAcik(false); setYeniKart(bosYeniKart()); }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5"
                      style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Hesap Adi</label>
                <input value={form.hesap_adi} onChange={(e) => update("hesap_adi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Banka</label>
                <input value={form.banka} onChange={(e) => update("banka", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>SWIFT</label>
                <input value={form.swift} onChange={(e) => update("swift", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Hesap Numarası</label>
                <input value={form.hesap_numarasi} onChange={(e) => update("hesap_numarasi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>IBAN</label>
                <input value={form.iban} onChange={(e) => update("iban", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                <Check size={14} /> {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button onClick={handleModalKapat} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                Iptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}