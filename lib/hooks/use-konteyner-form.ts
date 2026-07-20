"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase, Konteyner } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";

type FormState = {
  konteyner_no: string;
  muhur_no: string;
  tip: string;
  rezervasyon_id: string;
  marka: string;
};

const EMPTY_FORM: FormState = { konteyner_no: "", muhur_no: "", tip: "20DC", rezervasyon_id: "", marka: "" };

/**
 * Konteynerler sekmesindeki tum form state'ini ve veritabani islemlerini
 * (ekleme, silme, manuel alan kaydetme, kullanici haritasi) yoneten hook.
 * Bilesik component'i (konteyner-tab.tsx) sadece UI cizmekle sorumlu birakir.
 */
export function useKonteynerForm(dosyaId: string, onRefresh: () => void, companyId: string, varsayilanMarka: string = "") {
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; konteynerNo: string } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [kullaniciMap, setKullaniciMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!companyId) return;
    // "updated_by" (user_id) -> email haritası. Kaynak: kullanici_yetkileri
    // (user_id + email + company_id kolonlarını birlikte içeren tek tablo).
    supabase.from("kullanici_yetkileri").select("user_id, email").eq("company_id", companyId).then(({ data, error }) => {
      if (error) {
        console.error("Kullanıcı haritası yüklenemedi:", error.message);
        return;
      }
      const map: Record<string, string> = {};
      (data || []).forEach((u: any) => { if (u.user_id) map[u.user_id] = u.email; });
      setKullaniciMap(map);
    });
  }, [companyId]);

  const update = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }, []);

  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    const pattern = /^[A-Z]{4}[0-9]{7}$/;
    const cleaned = form.konteyner_no.toUpperCase().replace(/\s/g, "");
    if (!cleaned) e.konteyner_no = "Konteyner no zorunlu";
    else if (!pattern.test(cleaned)) e.konteyner_no = "Format: 4 harf + 7 rakam (orn: ABCU1234567)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form.konteyner_no]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    const cleaned = form.konteyner_no.toUpperCase().replace(/\s/g, "");
    const { error } = await supabase.from("konteynerler").insert({
      company_id: companyId, // Yeni konteyner şirkete zimmetlendi
      dosya_id: dosyaId,
      konteyner_no: cleaned,
      muhur_no: form.muhur_no || null,
      tip: form.tip,
      rezervasyon_id: form.rezervasyon_id || null,
      marka: form.marka || varsayilanMarka || null,
    });
    setSaving(false);
    if (error) {
      showToast(`Konteyner eklenemedi: ${error.message}`, "error");
      return;
    }
    setShowForm(false);
    setForm({ ...EMPTY_FORM, marka: varsayilanMarka });
    showToast("Konteyner eklendi.", "success");
    onRefresh();
  }, [validate, form, companyId, dosyaId, showToast, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("konteynerler").delete().eq("id", deleteTarget.id).eq("company_id", companyId); // Şirket kilidi eklendi
    if (error) {
      showToast(`Konteyner silinemedi: ${error.message}`, "error");
      setDeleteTarget(null);
      return;
    }
    showToast(`${deleteTarget.konteynerNo} silindi.`, "success");
    setDeleteTarget(null);
    onRefresh();
  }, [deleteTarget, companyId, showToast, onRefresh]);

  const handleManuelAlanKaydet = useCallback(async (konteynerId: string, alan: "net_agirlik_kg" | "brut_agirlik_kg" | "pieces", deger: number | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("konteynerler").update({
      [alan]: deger,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    }).eq("id", konteynerId).eq("company_id", companyId); // Şirket kilidi eklendi
    if (error) {
      showToast(`Değer kaydedilemedi: ${error.message}`, "error");
      return;
    }
    onRefresh();
  }, [companyId, showToast, onRefresh]);

  const handleTopluEkle = useCallback(async (metin: string, rezervasyonId: string): Promise<{ basarili: number; hatali: string[] }> => {
    const satirlar = metin.trim().split("\n").filter(s => s.trim());
    const basarililar: any[] = [];
    const hatalilar: string[] = [];

    for (const satir of satirlar) {
      const parcalar = satir.trim().split(/\t|;/).map(p => p.trim());
      const konteynerNo = parcalar[0]?.toUpperCase().replace(/\s/g, "");
      const muhurNo = parcalar[1]?.toUpperCase().replace(/\s/g, "") || null;

      const pattern = /^[A-Z]{4}[0-9]{7}$/;
      if (!konteynerNo || !pattern.test(konteynerNo)) {
        hatalilar.push(parcalar[0] || "(boş)");
        continue;
      }
      basarililar.push({
        company_id: companyId, // Toplu eklenen her satıra şirket mührü basıldı
        dosya_id: dosyaId,
        konteyner_no: konteynerNo,
        muhur_no: muhurNo,
        tip: "20DC",
        rezervasyon_id: rezervasyonId || null,
        marka: varsayilanMarka || null,
      });
    }

    if (basarililar.length > 0) {
      const { error } = await supabase.from("konteynerler").insert(basarililar);
      if (error) {
        // Postgres'te coklu satir insert'i hep-ya-da-hic calisir: bir satir
        // kisitlamayi ihlal ederse TUM liste hic eklenmez. Bu durumda hepsini
        // basarisiz olarak raporluyoruz, aksi halde kullanici "N konteyner
        // eklendi" mesaji gorup veritabaninda hicbir kayit olmadigini fark
        // etmeyebilir.
        return {
          basarili: 0,
          hatali: [...hatalilar, ...basarililar.map((b) => `${b.konteyner_no} (veritabani hatasi: ${error.message})`)],
        };
      }
      onRefresh();
    }

    return { basarili: basarililar.length, hatali: hatalilar };
  }, [companyId, dosyaId, onRefresh]);

  const handleHepsineUygula = useCallback(async (kaynak: Konteyner, hedefIds: string[]): Promise<boolean> => {
    if (hedefIds.length === 0) return false;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("konteynerler").update({
      net_agirlik_kg: (kaynak as any).net_agirlik_kg ?? null,
      brut_agirlik_kg: (kaynak as any).brut_agirlik_kg ?? null,
      pieces: (kaynak as any).pieces ?? null,
      marka: (kaynak as any).marka ?? null,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    }).in("id", hedefIds).eq("company_id", companyId); // Şirket kilidi eklendi
    if (error) {
      showToast(`Değerler uygulanamadı: ${error.message}`, "error");
      return false;
    }
    showToast(`${hedefIds.length} konteynere uygulandı.`, "success");
    onRefresh();
    return true;
  }, [companyId, showToast, onRefresh]);

  return {
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
  };
}
