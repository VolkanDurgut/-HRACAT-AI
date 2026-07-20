"use client";
import React, { useState } from "react";
import { supabase, Dosya, Rezervasyon } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { formatDateTR, formatCurrency } from "@/lib/cutoff-utils";
import { Pencil, Check, X } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string; // SaaS şirket bazlı izolasyon için eklendi
};

export default function EkBilgilerCard({ dosya, rezervasyonlar, onRefresh, companyId }: Props) { // companyId eklendi
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const urunler = (dosya.urun_detaylari as any[]) || [];
  const navlunBirimFiyati = (dosya as any).navlun_tutari; // konteyner basi
  const lokalMasrafBirimFiyati = (dosya as any).lokal_masraf_tutari; // konteyner basi
  const konteynerAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const navlunToplam = navlunBirimFiyati && konteynerAdedi > 0 ? parseFloat(navlunBirimFiyati) * konteynerAdedi : null;
  const lokalMasrafToplam = lokalMasrafBirimFiyati && konteynerAdedi > 0 ? parseFloat(lokalMasrafBirimFiyati) * konteynerAdedi : null;
  const navlunBekleniyor = !!(navlunBirimFiyati || lokalMasrafBirimFiyati) && konteynerAdedi === 0;

  // Toplam miktar ve toplam CIF hesapla
  const toplamMiktar = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);
  const toplamCif = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0);

  // Navlun + Lokal Masraf payi (MTS basina)
  const toplamDusulecek = navlunToplam !== null && lokalMasrafToplam !== null
  ? navlunToplam - lokalMasrafToplam
  : navlunToplam !== null
  ? navlunToplam
  : 0;
  const dusulecekVarMi = navlunToplam !== null || lokalMasrafToplam !== null;
  const dusulecekPerMts = dusulecekVarMi && toplamMiktar > 0 ? toplamDusulecek / toplamMiktar : 0;
  const toplamFob = dusulecekVarMi ? toplamCif - toplamDusulecek : null;

  // FOB kusuratli mi kontrolu - kusuratsiz olmasi icin onerilen lokal masraf degeri
  const toplamFobYuvarlanmis = toplamFob !== null ? Math.round(toplamFob * 100) / 100 : null;
  const fobKusuratli = toplamFob !== null && Math.abs(toplamFob - Math.round(toplamFob)) > 0.01;
  const onerilenLokalMasrafToplam = fobKusuratli && konteynerAdedi > 0
    ? (lokalMasrafToplam || 0) - (toplamFob - Math.round(toplamFob))
    : null;
  const onerilenLokalMasrafBirim = onerilenLokalMasrafToplam !== null ? onerilenLokalMasrafToplam / konteynerAdedi : null;

  // Avans dusulmus odenecek tutar
  const avansTutari = (dosya.ham_veri as any)?.avans_tutari;
  const odenecekTutar = dosya.toplam_tutar && avansTutari ? dosya.toplam_tutar - avansTutari : null;

  // Veritabanındaki notify dizisini (array), ekranda rahat düzenlemek için çift satır boşlukla metne çeviriyoruz
  const mevcutNotify = (dosya.ham_veri as any)?.notify || [];
  const notifyText = Array.isArray(mevcutNotify) ? mevcutNotify.join("\n\n") : "";

  // Consignee: DB'de text kolonu. Kaynak bilgisi ham_veri icinde metadata olarak tutulur.
  const consigneeText = (dosya as any).consignee || "";
  const consigneeKaynak = (dosya.ham_veri as any)?.consignee_kaynak || null;

  // Cuval marka listesi: ham_veri icinde dizi olarak tutulur. Konteyner tablosundaki secim listesini besler.
  const mevcutMarkaListesi = (dosya.ham_veri as any)?.marka_listesi || [];
  const markaListesiText = Array.isArray(mevcutMarkaListesi) ? mevcutMarkaListesi.join("\n") : "";

  const buildEmptyForm = () => ({
    notify: notifyText,
    consignee: consigneeText,
    marka_listesi: markaListesiText,
    lot_no: (dosya as any).lot_no || "",
    marka: (dosya as any).marka || "",
    navlun_tutari: (dosya as any).navlun_tutari?.toString() || "",
    lokal_masraf_tutari: (dosya as any).lokal_masraf_tutari?.toString() || "",
    beyanname_no: (dosya as any).beyanname_no || "",
    fatura_no: (dosya as any).fatura_no || "",
    fatura_tarihi: (dosya as any).fatura_tarihi || "",
    bl_no: (dosya as any).bl_no || rezervasyonlar[0]?.booking_no || "",
    diib_no: (dosya as any).diib_no || "",
    diib_tarihi: (dosya as any).diib_tarihi || "",
    uretim_tarihi: (dosya as any).uretim_tarihi || "",
    son_kullanim_tarihi: (dosya as any).son_kullanim_tarihi || "",
    });

  const [form, setForm] = useState(buildEmptyForm);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditStart = () => {
    setForm(buildEmptyForm());
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    // Consignee elle degistirildiyse kaynagi "manuel" olarak isaretle
    const consigneeDegisti = (form.consignee || "") !== (consigneeText || "");
    const yeniKaynak = consigneeDegisti ? "manuel" : consigneeKaynak;

    const payload = {
      consignee: form.consignee || null,
      lot_no: form.lot_no || null,
      marka: form.marka || null,
      navlun_tutari: form.navlun_tutari ? parseFloat(form.navlun_tutari) : null,
      lokal_masraf_tutari: form.lokal_masraf_tutari ? parseFloat(form.lokal_masraf_tutari) : null,
      beyanname_no: form.beyanname_no || null,
      fatura_no: form.fatura_no || null,
      fatura_tarihi: form.fatura_tarihi || null,
      bl_no: form.bl_no || null,
      diib_no: form.diib_no || null,
      diib_tarihi: form.diib_tarihi || null,
      uretim_tarihi: form.uretim_tarihi || null,
      son_kullanim_tarihi: form.son_kullanim_tarihi || null,
      // Mevcut ham_veri objesini bozmadan, düzenlediğimiz yeni notify listesini ekliyoruz
      ham_veri: {
        ...(dosya.ham_veri as any || {}),
        notify: form.notify ? form.notify.split("\n\n").map(n => n.trim()).filter(Boolean) : [],
        consignee_kaynak: form.consignee ? yeniKaynak : null,
        marka_listesi: form.marka_listesi ? form.marka_listesi.split("\n").map(m => m.trim()).filter(Boolean) : []
      }
    };

    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId); // Şirket kilidi enjekte edildi
    showToast("Ek bilgiler guncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  const renderUrunFiyatlari = (forEdit: boolean) => {
    if (urunler.length === 0) return null;
    return (
      <div className={forEdit ? "p-3 rounded-lg bg-slate-50 border" : ""} style={forEdit ? { borderColor: "#E2E8F0" } : undefined}>
        {forEdit && <p className="text-xs text-slate-500 mb-2">Proformadan otomatik hesaplanir, buradan duzenlenemez</p>}
        <div className="space-y-2">
          {urunler.map((u: any, i: number) => {
            const ad = u.urun_adi || u.description || "Urun";
            const cifBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
            const fobBirim = dusulecekVarMi ? cifBirim - dusulecekPerMts : null;
            return (
              <div key={i}>
                <p className="text-sm font-medium text-slate-700">{ad}</p>
                <p className="text-xs text-slate-500">
                  CIF: {formatCurrency(cifBirim, dosya.para_birimi)}
                  {fobBirim !== null && ` — FOB: ${formatCurrency(fobBirim, dosya.para_birimi)}`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t grid grid-cols-2 gap-3" style={{ borderColor: "#E2E8F0" }}>
          <div>
            <p className="text-xs text-slate-400">Toplam CIF</p>
            <p className="text-sm font-semibold text-slate-700">{formatCurrency(toplamCif, dosya.para_birimi)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-slate-400">Toplam FOB</p>
              {navlunBekleniyor && (
                <InfoTooltip variant="warning">
                  <span className="font-semibold text-amber-600">Konteyner adedi gerekli.</span> Navlun tutarı kaydedildi, FOB hesaplanması için Rezervasyon sekmesinden konteyner adedini girin.
                </InfoTooltip>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {toplamFob !== null ? (
                formatCurrency(toplamFob, dosya.para_birimi)
              ) : navlunBekleniyor ? (
                <span className="text-amber-600">Bekliyor</span>
              ) : (
                "Navlun/Lokal Masraf girilmedi"
              )}
            </p>
          </div>
        </div>
        {navlunToplam !== null && (
          <p className="text-xs text-slate-400 mt-2">
            Navlun: {formatCurrency(navlunBirimFiyati, dosya.para_birimi)} x {konteynerAdedi} konteyner = {formatCurrency(navlunToplam, dosya.para_birimi)}
          </p>
        )}
        {lokalMasrafToplam !== null && (
          <p className="text-xs text-slate-400 mt-1">
            Lokal Masraf: {formatCurrency(lokalMasrafBirimFiyati, dosya.para_birimi)} x {konteynerAdedi} konteyner = {formatCurrency(lokalMasrafToplam, dosya.para_birimi)}
          </p>
        )}
        {fobKusuratli && onerilenLokalMasrafBirim !== null && (
          <div className="mt-2 p-2 rounded-lg bg-blue-50 border" style={{ borderColor: "#BFDBFE" }}>
            <p className="text-xs text-blue-700">
              FOB tutarı küsüratlı çıkıyor. Lokal masrafı <strong>{formatCurrency(onerilenLokalMasrafBirim, dosya.para_birimi)}</strong> (konteyner başı) olarak girerseniz FOB küsüratsız olur.
            </p>
          </div>
        )}
      </div>
    );
  };

  if (!editing) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-3" style={{ borderColor: "#E2E8F0" }}>
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Ek Bilgiler</h3>
          <button onClick={handleEditStart} className="text-amber-500 hover:text-amber-700 text-xs font-medium inline-flex items-center gap-1">
            <Pencil size={12} /> Duzenle
          </button>
        </div>

        {renderUrunFiyatlari(false)}

        {consigneeText && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Consignee (ALICI)</p>
              {consigneeKaynak === "manuel" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">elle girildi</span>
              )}
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 whitespace-pre-wrap text-sm text-slate-700 font-medium">
              {consigneeText}
            </div>
          </div>
        )}

        {mevcutNotify.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notify (BİLDİRİM YAPILACAK TARAF)</p>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 whitespace-pre-wrap text-sm text-slate-700 font-medium">
              {notifyText}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <CopyableField label="Lot No" value={(dosya as any).lot_no} />
          <CopyableField label="Marka" value={(dosya as any).marka} />
          {mevcutMarkaListesi.length > 1 && (
            <CopyableField label="Çuval Markaları" value={mevcutMarkaListesi.join(", ")} />
          )}
          <CopyableField label="Navlun (Konteyner Basi)" value={formatCurrency(navlunBirimFiyati, dosya.para_birimi)} />
          <CopyableField label="Lokal Masraf (Konteyner Basi)" value={formatCurrency(lokalMasrafBirimFiyati, dosya.para_birimi)} />
          <CopyableField label="Beyanname No" value={(dosya as any).beyanname_no} />
          <CopyableField label="Fatura No" value={(dosya as any).fatura_no} />
          <CopyableField label="Fatura Tarihi" value={formatDateTR((dosya as any).fatura_tarihi)} />
          <CopyableField label="BL No" value={(dosya as any).bl_no} />
          <CopyableField label="DIIB No" value={(dosya as any).diib_no} />
          <CopyableField label="DIIB Tarihi" value={formatDateTR((dosya as any).diib_tarihi)} />
          <CopyableField label="Uretim Tarihi" value={formatDateTR((dosya as any).uretim_tarihi)} />
          <CopyableField label="Son Kullanim Tarihi" value={formatDateTR((dosya as any).son_kullanim_tarihi)} />
        </div>

        {odenecekTutar !== null && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border" style={{ borderColor: "#FDE68A" }}>
            <p className="text-xs text-amber-700">Avans Düşülmüş Ödenecek Tutar</p>
            <p className="text-sm font-bold text-amber-800">{formatCurrency(odenecekTutar, dosya.para_birimi)}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 space-y-3" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Ek Bilgiler</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Navlun Tutari (Konteyner Basi, {dosya.para_birimi || "USD"})</label>
          <input type="number" step="0.01" value={form.navlun_tutari} onChange={(e) => update("navlun_tutari", e.target.value)} placeholder="orn: 400" className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Lokal Masraf (Konteyner Basi, {dosya.para_birimi || "USD"})</label>
          <input type="number" step="0.01" value={form.lokal_masraf_tutari} onChange={(e) => update("lokal_masraf_tutari", e.target.value)} placeholder="orn: 150" className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        {konteynerAdedi > 0
          ? `Rezervasyonda ${konteynerAdedi} konteyner var. Girilen fiyatlar bu adetle carpilip CIF'ten dusulup FOB hesaplanir.`
          : "Rezervasyonda konteyner adedi tanimli degil, toplam tutarlar hesaplanamaz."}
      </p>

      {renderUrunFiyatlari(true)}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Lot No</label>
          <input value={form.lot_no} onChange={(e) => update("lot_no", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Marka</label>
          <input value={form.marka} onChange={(e) => update("marka", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Çuval Marka Listesi (her satıra bir marka yazın — konteyner tablosunda seçim listesi olarak çıkar)</label>
          <textarea value={form.marka_listesi} onChange={(e) => update("marka_listesi", e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm resize-y" style={{ borderColor: "#E2E8F0" }} placeholder="DIVA BRAND&#10;MILA BRAND" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Beyanname No</label>
          <input value={form.beyanname_no} onChange={(e) => update("beyanname_no", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fatura No</label>
          <input value={form.fatura_no} onChange={(e) => update("fatura_no", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fatura Tarihi</label>
          <input type="date" value={form.fatura_tarihi} onChange={(e) => update("fatura_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">BL No</label>
          <input value={form.bl_no} onChange={(e) => update("bl_no", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">DIIB No</label>
          <input value={form.diib_no} onChange={(e) => update("diib_no", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">DIIB Tarihi</label>
          <input type="date" value={form.diib_tarihi} onChange={(e) => update("diib_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Uretim Tarihi</label>
          <input type="date" value={form.uretim_tarihi} onChange={(e) => update("uretim_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Son Kullanim Tarihi</label>
          <input type="date" value={form.son_kullanim_tarihi} onChange={(e) => update("son_kullanim_tarihi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
        </div>
        
        <div className="col-span-2 md:col-span-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Consignee (Alıcı — firma adı ve adresi. Konşimento talimatı yüklenmediyse buradan elle girebilirsiniz.)</label>
          <textarea value={form.consignee} onChange={(e) => update("consignee", e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg text-sm resize-y" style={{ borderColor: "#E2E8F0" }} placeholder="ALICI FIRMA LTD.&#10;Adres satırı...&#10;Şehir, Ülke" />
        </div>

        <div className="col-span-2 md:col-span-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Notify (Birden fazla Notify varsa aralarında bir boş satır bırakarak yazın)</label>
          <textarea value={form.notify} onChange={(e) => update("notify", e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg text-sm resize-y" style={{ borderColor: "#E2E8F0" }} placeholder="Firma Adı A.Ş.&#10;Adres satırı...&#10;&#10;İkinci Notify Firma...&#10;Adres..." />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-1" style={{ backgroundColor: "#1B2B4B" }}>
          <Check size={14} /> {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button onClick={() => setEditing(false)} className="px-5 py-2 rounded-lg text-slate-600 text-sm font-medium border hover:bg-slate-50 transition-all inline-flex items-center gap-1" style={{ borderColor: "#E2E8F0" }}>
          <X size={14} /> Iptal
        </button>
      </div>
    </div>
  );
}
