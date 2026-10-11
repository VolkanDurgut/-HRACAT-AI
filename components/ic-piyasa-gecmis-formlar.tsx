"use client";

import React, { useEffect, useState } from "react";
import { FileDown, Image as ImageIcon, Share2, Loader2, FileText } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ROW_HEADER_BG } from "@/lib/theme";
import { IcFiyatFormu, formDosyaAdi, formGecerliMi, gunYazi, onayZamaniYazi } from "@/lib/ic-piyasa/fiyat-formu";

/**
 * Ic Piyasa - olusturulan (onaylanmis) fiyat formlari listesi (11.10.2026).
 * PDF ve telefon gorseli HER ZAMAN formun dondurulmus kaydindan uretilir;
 * fiyat tablosu sonradan degisse de eski form ayni cikar.
 * "Paylas" butonu cihaz dosya paylasimini destekliyorsa (telefon) gorunur:
 * PDF + gorsel paylasim menusunden dogrudan WhatsApp'a eklenebilir.
 */
export function IcPiyasaGecmisFormlar({ formlar }: { formlar: IcFiyatFormu[] }) {
  const { showToast } = useToast();
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [paylasilabilir, setPaylasilabilir] = useState(false);

  useEffect(() => {
    try {
      const deneme = new File(["x"], "x.pdf", { type: "application/pdf" });
      setPaylasilabilir(typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [deneme] }));
    } catch {
      setPaylasilabilir(false);
    }
  }, []);

  const calistir = async (anahtar: string, is: () => Promise<void>) => {
    setMesgul(anahtar);
    try {
      await is();
    } catch (e: any) {
      if (e?.name !== "AbortError") showToast(`İşlem tamamlanamadı: ${e?.message || e}`, "error");
    } finally {
      setMesgul(null);
    }
  };

  const pdfIndir = (f: IcFiyatFormu) =>
    calistir(`${f.id}-pdf`, async () => {
      const { indirFiyatFormuPdf } = await import("@/lib/ic-piyasa/fiyat-formu-pdf-builder");
      indirFiyatFormuPdf(f);
    });

  const gorselIndir = (f: IcFiyatFormu) =>
    calistir(`${f.id}-png`, async () => {
      const { indirFiyatFormuGorsel } = await import("@/lib/ic-piyasa/fiyat-formu-gorsel");
      await indirFiyatFormuGorsel(f);
    });

  const paylas = (f: IcFiyatFormu) =>
    calistir(`${f.id}-pay`, async () => {
      const [{ fiyatFormuPdfOlustur }, { fiyatFormuGorselOlustur }] = await Promise.all([
        import("@/lib/ic-piyasa/fiyat-formu-pdf-builder"),
        import("@/lib/ic-piyasa/fiyat-formu-gorsel"),
      ]);
      const ad = formDosyaAdi(f.form_no);
      const pdf = new File([fiyatFormuPdfOlustur(f).output("blob")], `${ad}.pdf`, { type: "application/pdf" });
      const png = new File([await fiyatFormuGorselOlustur(f)], `${ad}_telefon.png`, { type: "image/png" });
      await navigator.share({
        files: [png, pdf],
        title: `Unex Gıda ${f.form_no}`,
        text: `Unex Gıda yan mamul fiyat bilgilendirme formu (${f.form_no}). ${gunYazi(f.gecerlilik_bitis)} tarihine kadar geçerlidir.`,
      });
    });

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <h2 className="text-sm font-semibold text-white">Oluşturulan Formlar</h2>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Son 50 form. PDF ve telefon görseli formun onaylandığı andaki fiyatlarla üretilir.</p>
        <div className="mt-2 grid gap-1 text-xs md:grid-cols-2" style={{ color: TEXT_MUTED }}>
          <p><span className="text-white font-medium">Telefondan göndermek:</span> Paylaş → WhatsApp → kişiyi seçin. PDF ve görsel mesaja eklenmiş gelir.</p>
          <p><span className="text-white font-medium">Bilgisayardan göndermek:</span> PDF veya Görsel&apos;e basıp indirin, WhatsApp&apos;ta sohbete sürükleyip bırakın.</p>
        </div>
      </div>
      {formlar.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FileText size={28} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
          <p className="text-sm" style={{ color: TEXT_MUTED }}>Henüz form oluşturulmadı.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                {["Form No", "Onay", "Geçerlilik", "Alıcı", "Ürün", ""].map((b, i) => (
                  <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formlar.map((f) => {
                const gecerli = formGecerliMi(f.gecerlilik_bitis);
                return (
                  <tr key={f.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-2.5 font-semibold text-white whitespace-nowrap">{f.form_no}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                      {onayZamaniYazi(f.onay_zamani)}
                      {f.olusturan_email && <span className="block text-[10px]">{f.olusturan_email}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-white">{gunYazi(f.gecerlilik_bitis)}</span>{" "}
                      <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${gecerli ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                        {gecerli ? "Geçerli" : "Süresi doldu"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-white max-w-[260px] truncate" title={f.alici || "Genel"}>{f.alici || <span style={{ color: TEXT_MUTED }}>Genel</span>}</td>
                    <td className="px-3 py-2.5" style={{ color: TEXT_MUTED }}>{f.kalemler.length}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-nowrap items-center justify-start gap-1.5">
                        <button onClick={() => pdfIndir(f)} disabled={!!mesgul} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}>
                          {mesgul === `${f.id}-pdf` ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
                        </button>
                        <button onClick={() => gorselIndir(f)} disabled={!!mesgul} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }} title="WhatsApp için telefon görseli (1080×1350)">
                          {mesgul === `${f.id}-png` ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} Görsel
                        </button>
                        {paylasilabilir && (
                          <button onClick={() => paylas(f)} disabled={!!mesgul} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }} title="Telefonun paylaşım menüsü (WhatsApp)">
                            {mesgul === `${f.id}-pay` ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} Paylaş
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
