"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler } from "@/components/ic-piyasa-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Users, Plus, Search, Loader2, Pencil, Trash2, X, Save, AlertCircle, MessageCircle, CalendarClock } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { IcMusteri, hataMesaji, telefonNormallestir, telefonYazi } from "@/lib/ic-piyasa/is-emri";

/**
 * Ic Piyasa - Musteri kartlari (12.10.2026).
 * Is emri, fiyat listesi gonderimi ve (ileride) WhatsApp bildirimleri bu
 * kartlara baglanir. Iş emri olan musteri silinemez; pasife alinir.
 */

type Taslak = {
  unvan: string;
  kisa_ad: string;
  vergi_dairesi: string;
  vergi_no: string;
  adres: string;
  yetkili_ad: string;
  telefon: string;
  eposta: string;
  whatsapp_izin: boolean;
  haftalik_fiyat_listesi: boolean;
  notlar: string;
  aktif: boolean;
};

const BOS: Taslak = {
  unvan: "", kisa_ad: "", vergi_dairesi: "", vergi_no: "", adres: "", yetkili_ad: "",
  telefon: "", eposta: "", whatsapp_izin: false, haftalik_fiyat_listesi: false, notlar: "", aktif: true,
};

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

function taslaktan(m: IcMusteri): Taslak {
  return {
    unvan: m.unvan, kisa_ad: m.kisa_ad || "", vergi_dairesi: m.vergi_dairesi || "", vergi_no: m.vergi_no || "",
    adres: m.adres || "", yetkili_ad: m.yetkili_ad || "", telefon: m.telefon ? telefonYazi(m.telefon) : "",
    eposta: m.eposta || "", whatsapp_izin: m.whatsapp_izin, haftalik_fiyat_listesi: m.haftalik_fiyat_listesi,
    notlar: m.notlar || "", aktif: m.aktif,
  };
}

export default function IcMusterilerPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const [musteriler, setMusteriler] = useState<IcMusteri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [pasifleriGoster, setPasifleriGoster] = useState(false);

  const [duzenlenen, setDuzenlenen] = useState<IcMusteri | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [taslak, setTaslak] = useState<Taslak>(BOS);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<IcMusteri | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const { data, error } = await supabase.from("ic_musteriler").select("*").eq("company_id", companyId).order("unvan");
    if (error) { setOkumaHatasi(error.message); setYukleniyor(false); return; }
    setMusteriler((data || []) as IcMusteri[]);
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return musteriler.filter((m) =>
      (pasifleriGoster || m.aktif) &&
      (!q || [m.unvan, m.kisa_ad, m.vergi_no, m.yetkili_ad, m.telefon].some((v) => (v || "").toLocaleLowerCase("tr").includes(q)))
    );
  }, [musteriler, arama, pasifleriGoster]);

  const yeniAc = () => { setDuzenlenen(null); setTaslak(BOS); setFormAcik(true); };
  const duzenleAc = (m: IcMusteri) => { setDuzenlenen(m); setTaslak(taslaktan(m)); setFormAcik(true); };

  const kaydet = async () => {
    if (!companyId) return;
    const unvan = taslak.unvan.trim().replace(/\s+/g, " ");
    if (!unvan) { showToast("Ünvan boş olamaz.", "error"); return; }
    const vergiNo = taslak.vergi_no.replace(/\D/g, "");
    if (vergiNo && !/^\d{10,11}$/.test(vergiNo)) { showToast("Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalı.", "error"); return; }
    const tel = telefonNormallestir(taslak.telefon);
    if (tel === undefined) { showToast("Telefon numarası geçersiz. Örnek: 0532 111 22 33", "error"); return; }
    const eposta = taslak.eposta.trim();
    if (eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) { showToast("E-posta adresi geçersiz.", "error"); return; }
    if (taslak.whatsapp_izin && !tel) { showToast("WhatsApp izni için telefon numarası gerekli.", "error"); return; }

    const kayit = {
      unvan,
      kisa_ad: taslak.kisa_ad.trim() || null,
      vergi_dairesi: taslak.vergi_dairesi.trim() || null,
      vergi_no: vergiNo || null,
      adres: taslak.adres.trim() || null,
      yetkili_ad: taslak.yetkili_ad.trim() || null,
      telefon: tel,
      eposta: eposta || null,
      whatsapp_izin: taslak.whatsapp_izin,
      haftalik_fiyat_listesi: taslak.haftalik_fiyat_listesi,
      notlar: taslak.notlar.trim() || null,
      aktif: taslak.aktif,
    };
    setKaydediliyor(true);
    const sonuc = duzenlenen
      ? await supabase.from("ic_musteriler").update(kayit).eq("id", duzenlenen.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_musteriler").insert({ ...kayit, company_id: companyId }).select("id");
    setKaydediliyor(false);
    const hata = yazmaHatasi(sonuc.error, sonuc.data);
    if (hata) { showToast(`Kaydedilemedi: ${hataMesaji({ message: hata })}`, "error"); return; }
    showToast(duzenlenen ? "Müşteri güncellendi." : "Müşteri eklendi.", "success");
    setFormAcik(false);
    getir();
  };

  const sil = async () => {
    if (!silinecek || !companyId) return;
    setSiliniyor(true);
    const { data, error } = await supabase.from("ic_musteriler").delete().eq("id", silinecek.id).eq("company_id", companyId).select("id");
    setSiliniyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      // Bagli is emirleri varsa hangileri oldugunu ve ne yapilacagini soyle
      if (/ic_is_emirleri_musteri_id_fkey/.test(hata)) {
        const { data: bagli } = await supabase.from("ic_is_emirleri").select("is_emri_no, durum").eq("company_id", companyId).eq("musteri_id", silinecek.id).order("olusturma");
        const liste = (bagli || []).map((b: { is_emri_no: string; durum: string }) => `${b.is_emri_no} (${b.durum === "acik" ? "Açık" : b.durum === "tamamlandi" ? "Tamamlandı" : "İptal"})`).join(", ");
        showToast(`Bu müşteriye bağlı iş emirleri var: ${liste}. Önce İş Emirleri'nden silin (araç girilmiş olanı önce iptal edip "tamamen sil") ya da müşteriyi pasife alın.`, "error");
      } else {
        showToast(hataMesaji({ message: hata }), "error");
      }
      setSilinecek(null);
      return;
    }
    showToast("Müşteri silindi.", "success");
    setSilinecek(null);
    getir();
  };

  if (authLoading || (yetkili && yukleniyor && !okumaHatasi)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} /></div>
      </AppShell>
    );
  }

  const aktifSayi = musteriler.filter((m) => m.aktif).length;
  const listeSayi = musteriler.filter((m) => m.aktif && m.haftalik_fiyat_listesi).length;

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<Users size={20} />}
        baslik="İç Piyasa · Müşteriler"
        aciklama="Yurt içi müşteri kartları. İş emirleri ve fiyat listesi gönderimi bu kartlara bağlanır."
        sag={
          <button onClick={yeniAc} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
            <Plus size={14} /> Yeni Müşteri
          </button>
        }
      />
      <IcPiyasaSekmeler />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> Müşteriler okunamadı: {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Aktif Müşteri</p>
          <p className="text-2xl font-bold text-white mt-1">{aktifSayi}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Pazartesi Fiyat Listesi</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{listeSayi}</p>
        </div>
      </div>

      <div className="rounded-xl border shadow-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Ünvan, vergi no, yetkili veya telefon ile ara..." className={`${inputSinif} pl-9`} style={inputStil} />
          </div>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: TEXT_MUTED }}>
            <input type="checkbox" checked={pasifleriGoster} onChange={(e) => setPasifleriGoster(e.target.checked)} className="accent-emerald-500" /> Pasifleri göster
          </label>
        </div>

        {liste.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Users size={30} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
            <p className="text-sm" style={{ color: TEXT_MUTED }}>{musteriler.length === 0 ? "Henüz müşteri kaydı yok." : "Aramayla eşleşen müşteri yok."}</p>
            {musteriler.length === 0 && (
              <button onClick={yeniAc} className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
                <Plus size={14} /> İlk müşteriyi ekle
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                  {["Ünvan", "Vergi", "Yetkili / Telefon", "E-posta", "Bildirim", ""].map((b, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liste.map((m) => (
                  <tr key={m.id} className={`border-t ${m.aktif ? "" : "opacity-50"}`} style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{m.unvan}</p>
                      {(m.kisa_ad || !m.aktif) && (
                        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{m.kisa_ad}{!m.aktif && " · Pasif"}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                      <p className="text-white">{m.vergi_no || "-"}</p>
                      <p className="text-xs">{m.vergi_dairesi || ""}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-white">{m.yetkili_ad || "-"}</p>
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>{telefonYazi(m.telefon)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: TEXT_MUTED }} title={m.eposta || ""}>{m.eposta || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.whatsapp_izin && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400"><MessageCircle size={10} /> WhatsApp</span>}
                        {m.haftalik_fiyat_listesi && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-400"><CalendarClock size={10} /> Pazartesi listesi</span>}
                        {!m.whatsapp_izin && !m.haftalik_fiyat_listesi && <span className="text-xs" style={{ color: TEXT_MUTED }}>-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => duzenleAc(m)} title="Düzenle" className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><Pencil size={14} /></button>
                      <button onClick={() => setSilinecek(m)} title="Sil" className="p-1.5 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formAcik && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="musteri-form-baslik">
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <h2 id="musteri-form-baslik" className="text-base font-semibold text-white">{duzenlenen ? "Müşteriyi Düzenle" : "Yeni Müşteri"}</h2>
              <button onClick={() => !kaydediliyor && setFormAcik(false)} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Alan etiket="Ünvan *" tam>
                <input value={taslak.unvan} onChange={(e) => setTaslak({ ...taslak, unvan: e.target.value })} placeholder="Erdoğanlar Un Gıda San. Tic. Ltd. Şti." className={inputSinif} style={inputStil} autoFocus />
              </Alan>
              <Alan etiket="Kısa ad">
                <input value={taslak.kisa_ad} onChange={(e) => setTaslak({ ...taslak, kisa_ad: e.target.value })} placeholder="Erdoğanlar Un" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Yetkili kişi">
                <input value={taslak.yetkili_ad} onChange={(e) => setTaslak({ ...taslak, yetkili_ad: e.target.value })} placeholder="Ad Soyad" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Vergi dairesi">
                <input value={taslak.vergi_dairesi} onChange={(e) => setTaslak({ ...taslak, vergi_dairesi: e.target.value })} className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Vergi no / TCKN" not="İrsaliyedeki alıcıyla karşılaştırılır">
                <input value={taslak.vergi_no} onChange={(e) => setTaslak({ ...taslak, vergi_no: e.target.value })} inputMode="numeric" placeholder="10 veya 11 hane" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Telefon (WhatsApp)">
                <input value={taslak.telefon} onChange={(e) => setTaslak({ ...taslak, telefon: e.target.value })} inputMode="tel" placeholder="0532 111 22 33" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="E-posta">
                <input value={taslak.eposta} onChange={(e) => setTaslak({ ...taslak, eposta: e.target.value })} inputMode="email" placeholder="satinalma@firma.com.tr" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Adres / teslim adresi" tam>
                <textarea value={taslak.adres} onChange={(e) => setTaslak({ ...taslak, adres: e.target.value })} rows={2} className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Not" tam>
                <textarea value={taslak.notlar} onChange={(e) => setTaslak({ ...taslak, notlar: e.target.value })} rows={2} className={inputSinif} style={inputStil} />
              </Alan>
              <div className="sm:col-span-2 grid gap-2 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                <Onay deger={taslak.whatsapp_izin} degis={(v) => setTaslak({ ...taslak, whatsapp_izin: v })} baslik="WhatsApp bildirim izni var" aciklama="Müşteri sipariş ve sevk bilgilendirmelerini WhatsApp'tan almayı kabul etti." />
                <Onay deger={taslak.haftalik_fiyat_listesi} degis={(v) => setTaslak({ ...taslak, haftalik_fiyat_listesi: v })} baslik="Pazartesi fiyat listesine dahil" aciklama="Haftalık fiyat bilgilendirme formu bu müşteriye gönderilir." />
                <Onay deger={taslak.aktif} degis={(v) => setTaslak({ ...taslak, aktif: v })} baslik="Aktif" aciklama="Pasif müşteri yeni iş emirlerinde ve listelerde çıkmaz; geçmiş kayıtları korunur." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
              <button onClick={() => setFormAcik(false)} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
              <button onClick={kaydet} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!silinecek}
        onOpenChange={(o) => !o && setSilinecek(null)}
        title="Müşteri silinsin mi?"
        description={`"${silinecek?.unvan || ""}" silinecek. Bu müşteriye ait iş emri varsa silinemez; bu durumda kartı düzenleyip pasife alın.`}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        loading={siliniyor}
        loadingLabel="Siliniyor..."
        onConfirm={sil}
      />
    </AppShell>
  );
}

function Alan({ etiket, not, tam, children }: { etiket: string; not?: string; tam?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${tam ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
      {not && <span className="block text-[10px] mt-1" style={{ color: TEXT_MUTED }}>{not}</span>}
    </label>
  );
}

function Onay({ deger, degis, baslik, aciklama }: { deger: boolean; degis: (v: boolean) => void; baslik: string; aciklama: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input type="checkbox" checked={deger} onChange={(e) => degis(e.target.checked)} className="mt-0.5 accent-emerald-500" />
      <span>
        <span className="block text-sm text-white">{baslik}</span>
        <span className="block text-xs" style={{ color: TEXT_MUTED }}>{aciklama}</span>
      </span>
    </label>
  );
}
