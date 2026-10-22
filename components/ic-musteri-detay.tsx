"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { X, Loader2, Pencil, Trash2, MessageCircle, CalendarClock, FileText, Truck, ClipboardList, AlertCircle, Phone, Mail, MapPin, User, Building2, StickyNote } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  IC_BELGE_BUCKET, DURUM_ETIKET, type IcMusteri, type IsEmriDurum, type HedefTur, type CikisDurumu,
  cikisEtiketi, hedefTamam, ilerlemeOrani, ilerlemeYazi, kgYazi, telefonYazi, tonYazi, tarihSaatYazi,
} from "@/lib/ic-piyasa/is-emri";
import { gunAyYil } from "@/lib/ic-piyasa/siparis-formu";

/**
 * Musteri detay paneli (22.10.2026): kart bilgileri, ozet, is emirleri ve son
 * araclar tek yerde; Duzenle / Sil panel icinden. Yalniz OKUR (yazma yok).
 */

type Sevk = {
  id: string;
  plaka: string;
  net_kg: number;
  irsaliye_no: string | null;
  irsaliye_dosya_yolu: string;
  olusturma: string;
  cikis_durumu: CikisDurumu;
  cikis_planlanan: string | null;
  cikis_zamani: string | null;
};

type Emir = {
  id: string;
  is_emri_no: string;
  urun: string;
  hedef_tur: HedefTur;
  hedef_kg: number | null;
  hedef_arac: number | null;
  durum: IsEmriDurum;
  siparis_tarihi: string | null;
  olusturma: string;
  siparis_formu_yolu: string | null;
  ic_sevkler: Sevk[] | null;
};

const DURUM_SINIF: Record<IsEmriDurum, string> = {
  acik: "bg-amber-500/15 text-amber-400",
  tamamlandi: "bg-emerald-500/15 text-emerald-400",
  iptal: "bg-slate-500/15 text-slate-300",
};

const SON_ARAC = 10;

export function IcMusteriDetay({
  musteri, companyId, kapat, duzenle, sil,
}: {
  musteri: IcMusteri;
  companyId: string;
  kapat: () => void;
  duzenle: () => void;
  sil: () => void;
}) {
  const { showToast } = useToast();
  const [emirler, setEmirler] = useState<Emir[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const getir = useCallback(async () => {
    setHata(null);
    const { data, error } = await supabase
      .from("ic_is_emirleri")
      .select("id, is_emri_no, urun, hedef_tur, hedef_kg, hedef_arac, durum, siparis_tarihi, olusturma, siparis_formu_yolu, ic_sevkler(id, plaka, net_kg, irsaliye_no, irsaliye_dosya_yolu, olusturma, cikis_durumu, cikis_planlanan, cikis_zamani)")
      .eq("company_id", companyId)
      .eq("musteri_id", musteri.id)
      .order("olusturma", { ascending: false })
      .limit(200);
    if (error) { setHata(error.message); return; }
    setEmirler((data || []) as unknown as Emir[]);
  }, [companyId, musteri.id]);

  useEffect(() => { setEmirler(null); getir(); }, [getir]);

  // Esc ile kapat
  useEffect(() => {
    // Ustte duzenleme / onay penceresi aciksa Esc onu kapatir, paneli degil
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelectorAll('[aria-modal="true"], [role="alertdialog"]').length > 1) return;
      kapat();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [kapat]);

  const belgeAc = async (yol: string, ad: string) => {
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(yol, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`${ad} açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  const tumSevkler = (emirler || []).flatMap((e) => (e.ic_sevkler || []).map((s) => ({ ...s, is_emri_no: e.is_emri_no, urun: e.urun })))
    .sort((a, b) => b.olusturma.localeCompare(a.olusturma));
  const toplamKg = tumSevkler.reduce((t, s) => t + Number(s.net_kg || 0), 0);
  const acikSayi = (emirler || []).filter((e) => e.durum === "acik").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="musteri-detay-baslik">
      <div className="absolute inset-0 bg-black/60" onClick={kapat} aria-hidden="true" />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l shadow-2xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        {/* Baslik */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Müşteri Detayı</p>
            <h2 id="musteri-detay-baslik" className="text-base font-semibold text-white mt-0.5 break-words">{musteri.unvan}</h2>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {!musteri.aktif && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-500/15 text-slate-300">Pasif</span>}
              {musteri.whatsapp_izin
                ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400"><MessageCircle size={10} /> WhatsApp izni var</span>
                : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-500/15 text-slate-300"><MessageCircle size={10} /> WhatsApp izni yok</span>}
              {musteri.haftalik_fiyat_listesi && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-400"><CalendarClock size={10} /> Pazartesi listesi</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={duzenle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              <Pencil size={13} /> Düzenle
            </button>
            <button onClick={sil} title="Sil" className="p-2 rounded-lg border hover:bg-red-500/10 text-red-400" style={{ borderColor: CARD_BORDER }}><Trash2 size={14} /></button>
            <button onClick={kapat} className="p-2 rounded-lg hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Kart bilgileri */}
          <section className="rounded-xl border" style={{ borderColor: CARD_BORDER }}>
            <dl className="grid grid-cols-1 sm:grid-cols-2">
              <Bilgi ikon={<Building2 size={13} />} etiket="Vergi" deger={[musteri.vergi_no, musteri.vergi_dairesi].filter(Boolean).join(" · ") || "-"} />
              <Bilgi ikon={<User size={13} />} etiket="Yetkili" deger={musteri.yetkili_ad || "-"} />
              <Bilgi ikon={<Phone size={13} />} etiket="Telefon" deger={telefonYazi(musteri.telefon)} />
              <Bilgi ikon={<Mail size={13} />} etiket="E-posta" deger={musteri.eposta || "-"} />
              <Bilgi ikon={<MapPin size={13} />} etiket="Adres" deger={musteri.adres || "-"} tam />
              {musteri.notlar && <Bilgi ikon={<StickyNote size={13} />} etiket="Not" deger={musteri.notlar} tam />}
              <Bilgi etiket="Kayıt" deger={tarihSaatYazi(musteri.olusturma)} tam />
            </dl>
          </section>

          {hata ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
              <span className="flex items-center gap-2"><AlertCircle size={16} /> İş emirleri okunamadı: {hata}</span>
              <button onClick={getir} className="underline">Yeniden dene</button>
            </div>
          ) : emirler === null ? (
            <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} /></div>
          ) : (
            <>
              {/* Ozet */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Ozet etiket="İş emri" deger={String(emirler.length)} />
                <Ozet etiket="Açık" deger={String(acikSayi)} vurgu={acikSayi > 0} />
                <Ozet etiket="Sevk edilen" deger={tonYazi(toplamKg)} />
                <Ozet etiket="Araç" deger={String(tumSevkler.length)} />
              </section>

              {/* Is emirleri */}
              <section>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}><ClipboardList size={13} /> İş Emirleri</h3>
                {emirler.length === 0 ? (
                  <p className="rounded-lg border px-4 py-6 text-center text-sm" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Bu müşteriye ait iş emri yok.</p>
                ) : (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                    {emirler.map((e, i) => {
                      const sv = e.ic_sevkler || [];
                      const kg = sv.reduce((t, s) => t + Number(s.net_kg || 0), 0);
                      const oran = Math.min(1, ilerlemeOrani(e, kg, sv.length));
                      const tamam = hedefTamam(e, kg, sv.length);
                      return (
                        <div key={e.id} className={`px-4 py-3 ${i ? "border-t" : ""}`} style={{ borderColor: CARD_BORDER }}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">{e.is_emri_no} <span className="font-normal" style={{ color: TEXT_MUTED }}>· {e.urun}</span></p>
                              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                                Sipariş {e.siparis_tarihi ? gunAyYil(e.siparis_tarihi) : tarihSaatYazi(e.olusturma).slice(0, 10)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {e.siparis_formu_yolu && (
                                <button onClick={() => belgeAc(e.siparis_formu_yolu!, "Sipariş formu")} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}>
                                  <FileText size={12} /> Sipariş formu
                                </button>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DURUM_SINIF[e.durum]}`}>{DURUM_ETIKET[e.durum]}</span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: ROW_HEADER_BG }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.round(oran * 100)}%`, backgroundColor: tamam ? "#10B981" : ACCENT }} />
                            </div>
                            <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{ilerlemeYazi(e, kg, sv.length)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Son araclar */}
              {tumSevkler.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}>
                    <Truck size={13} /> Son Araçlar {tumSevkler.length > SON_ARAC && <span className="normal-case font-normal">(son {SON_ARAC})</span>}
                  </h3>
                  <div className="rounded-xl border overflow-x-auto" style={{ borderColor: CARD_BORDER }}>
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                          {["Tarih", "Plaka", "İş emri", "Net", "Çıkış", ""].map((b, i) => (
                            <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tumSevkler.slice(0, SON_ARAC).map((s) => {
                          const c = cikisEtiketi(s);
                          return (
                            <tr key={s.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                              <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: TEXT_MUTED }}>{tarihSaatYazi(s.olusturma)}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-medium text-white">{s.plaka}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: TEXT_MUTED }}>{s.is_emri_no}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-white">{kgYazi(s.net_kg)}</td>
                              <td className="px-3 py-2 whitespace-nowrap"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.sinif}`}>{c.metin}</span></td>
                              <td className="px-3 py-2 whitespace-nowrap text-right">
                                <button onClick={() => belgeAc(s.irsaliye_dosya_yolu, "İrsaliye")} title={s.irsaliye_no || "İrsaliye"} className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: ACCENT }}>
                                  <FileText size={12} /> İrsaliye
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Bilgi({ ikon, etiket, deger, tam }: { ikon?: React.ReactNode; etiket: string; deger: string; tam?: boolean }) {
  return (
    <div className={`px-4 py-2.5 border-b last:border-b-0 ${tam ? "sm:col-span-2" : ""}`} style={{ borderColor: CARD_BORDER }}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{ikon}{etiket}</dt>
      <dd className="text-sm text-white mt-0.5 break-words whitespace-pre-line">{deger}</dd>
    </div>
  );
}

function Ozet({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className={`text-lg font-bold mt-0.5 ${vurgu ? "text-amber-400" : "text-white"}`}>{deger}</p>
    </div>
  );
}
