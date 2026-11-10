"use client";

import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { xlsxSayfalariOku } from "@/lib/xlsx-oku";
import { fuarFirmalariniBirlestir, fuarOzeti, fuarSayfalariniOku, type FuarFirma, type FuarOkuma } from "@/lib/pazar/fuar";
import { fuarListesiAktar, pazarAnahtarlari, ulkeGosterim, type AktarmaSonucu, type PazarFirma } from "@/lib/pazar/veri";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR - "Fuar listesi yükle" (10.11.2026). Excel TARAYICIDA okunur (sunucuya dosya gitmez);
 * firma adlari sunucudaki anahtarla (pazar_anahtarlar) birlestirilir ve ONIZLEME gosterilir.
 * Kayit yalniz "Aktar" ile, tek islemde (pazar_fuar_aktar). Ayni dosyayi tekrar yuklemek guvenli.
 */

type Asama = "bos" | "okunuyor" | "onizleme" | "aktariliyor" | "bitti";
type Onizleme = {
  dosyaAdi: string;
  okuma: FuarOkuma;
  firmalar: FuarFirma[];
  yeni: FuarFirma[];
  mevcut: FuarFirma[];
  musteri: { f: FuarFirma; alici: string | null }[];
};

function Kutu({ etiket, deger, renk, testId }: { etiket: string; deger: number | string; renk?: string; testId?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 min-w-0" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <p className="text-[11px] leading-tight truncate" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: renk || "#FFFFFF" }} data-deger>{deger}</p>
    </div>
  );
}

function Acilir({ baslik, adet, children, testId }: { baslik: string; adet: number; children: React.ReactNode; testId?: string }) {
  const [acik, setAcik] = useState(false);
  if (adet === 0) return null;
  return (
    <div className="rounded-lg border" style={{ borderColor: CARD_BORDER }} data-testid={testId}>
      <button type="button" onClick={() => setAcik(!acik)} aria-expanded={acik}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.03] rounded-lg">
        <span>{baslik} <span className="tabular-nums" style={{ color: TEXT_MUTED }}>({adet})</span></span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${acik ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />
      </button>
      {acik && <div className="px-3 pb-3 max-h-64 overflow-y-auto text-xs space-y-1" style={{ color: "#C9D1DC" }}>{children}</div>}
    </div>
  );
}

export function FuarYukle({ mevcutFirmalar, onKapat, onAktarildi }: {
  mevcutFirmalar: PazarFirma[];
  onKapat: () => void;
  onAktarildi: () => void;
}) {
  const { showToast } = useToast();
  const girdi = useRef<HTMLInputElement>(null);
  const [asama, setAsama] = useState<Asama>("bos");
  const [hata, setHata] = useState<string | null>(null);
  const [onizleme, setOnizleme] = useState<Onizleme | null>(null);
  const [sonuc, setSonuc] = useState<AktarmaSonucu | null>(null);

  const mevcut = useMemo(() => new Map(mevcutFirmalar.map((f) => [f.anahtar, f])), [mevcutFirmalar]);

  async function dosyaSecildi(dosya: File | undefined) {
    if (!dosya) return;
    setHata(null);
    setSonuc(null);
    setAsama("okunuyor");
    try {
      const sayfalar = await xlsxSayfalariOku(dosya);
      const okuma = fuarSayfalariniOku(sayfalar);
      const anahtarlar = await pazarAnahtarlari(okuma.satirlar.map((s) => s.firma));
      const firmalar = fuarFirmalariniBirlestir(okuma.satirlar, anahtarlar).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
      const yeni: FuarFirma[] = [];
      const var_: FuarFirma[] = [];
      const musteri: Onizleme["musteri"] = [];
      for (const f of firmalar) {
        const m = mevcut.get(f.anahtar);
        if (!m) yeni.push(f);
        else {
          var_.push(f);
          if (m.durum === "musteri") musteri.push({ f, alici: m.alici_adi || m.ad });
        }
      }
      setOnizleme({ dosyaAdi: dosya.name, okuma, firmalar, yeni, mevcut: var_, musteri });
      setAsama("onizleme");
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Dosya okunamadı.");
      setAsama("bos");
    } finally {
      if (girdi.current) girdi.current.value = "";
    }
  }

  async function aktar() {
    if (!onizleme) return;
    setAsama("aktariliyor");
    setHata(null);
    try {
      const s = await fuarListesiAktar(onizleme.dosyaAdi, onizleme.firmalar);
      setSonuc(s);
      setAsama("bitti");
      showToast(`${s.firma} firma aktarıldı (${s.yeni_firma} yeni).`);
      onAktarildi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Aktarma tamamlanamadı.");
      setAsama("onizleme");
    }
  }

  const ozet = onizleme ? fuarOzeti(onizleme.okuma.satirlar.length, onizleme.firmalar) : null;
  const bozuk = onizleme ? onizleme.firmalar.flatMap((f) => f.kisiler.filter((k) => k.eposta && !k.eposta_gecerli).map((k) => ({ f, e: k.eposta! }))) : [];
  const ulkesiz = onizleme ? onizleme.firmalar.filter((f) => !f.ulke) : [];
  const telefondan = onizleme ? onizleme.firmalar.filter((f) => f.ulke_kaynagi === "telefon" || f.ulke_kaynagi === "eposta") : [];

  return (
    <section className="rounded-xl border mb-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="fuar-yukle">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet size={18} style={{ color: ACCENT }} className="shrink-0" />
          <h2 className="text-sm font-semibold text-white truncate">Fuar listesi yükle</h2>
        </div>
        <button type="button" onClick={onKapat} aria-label="Kapat" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: TEXT_MUTED }}>
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <input ref={girdi} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          data-testid="fuar-dosya" onChange={(e) => dosyaSecildi(e.target.files?.[0])} />

        {(asama === "bos" || asama === "okunuyor") && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center" style={{ borderColor: "#2A3240" }}>
            <p className="text-sm text-white">Fuar müşteri listesini (Excel) seçin</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
              Her sayfa bir fuar dönemi (ör. &quot;GULFOOD 2023 KASIM&quot;, &quot;2022&quot;). Sütunlar: Müşteri adı, Yetkili, Telefon, Mail, Ülke.
              Dosya bilgisayarınızda okunur; önizlemeden sonra siz onaylayınca kaydedilir.
            </p>
            <button type="button" onClick={() => girdi.current?.click()} disabled={asama === "okunuyor"} data-testid="fuar-sec"
              className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}>
              {asama === "okunuyor" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {asama === "okunuyor" ? "Okunuyor…" : "Excel seç"}
            </button>
          </div>
        )}

        {hata && (
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }} data-testid="fuar-hata">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
          </div>
        )}

        {onizleme && ozet && (asama === "onizleme" || asama === "aktariliyor") && (
          <div className="space-y-4" data-testid="fuar-onizleme">
            <p className="text-sm text-white">
              <span className="font-medium">{onizleme.dosyaAdi}</span>
              <span style={{ color: TEXT_MUTED }}> · {onizleme.okuma.sayfalar.length} sayfa · {ozet.satir} satır</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kutu etiket="Firma (birleştirilmiş)" deger={ozet.firma} testId="oz-firma" />
              <Kutu etiket="Yeni potansiyel" deger={onizleme.yeni.length} renk={ACCENT} testId="oz-yeni" />
              <Kutu etiket="Mevcut kayda eklenecek" deger={onizleme.mevcut.length} testId="oz-mevcut" />
              <Kutu etiket="Müşterimizle eşleşen" deger={onizleme.musteri.length} renk="#60A5FA" testId="oz-musteri" />
              <Kutu etiket="Birden çok fuarda" deger={ozet.birlesen} testId="oz-birlesen" />
              <Kutu etiket="Yetkili kişi" deger={ozet.kisi} testId="oz-kisi" />
              <Kutu etiket="Ülke: Excel / telefon-e-posta" deger={`${ozet.ulkeExcel} / ${ozet.ulkeTelefon}`} testId="oz-ulke" />
              <Kutu etiket="Bozuk e-posta" deger={ozet.bozukEposta} renk={ozet.bozukEposta ? "#FBBF24" : undefined} testId="oz-bozuk" />
            </div>

            <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
              <table className="w-full text-xs" data-testid="fuar-sayfalar">
                <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                  <tr><th className="text-left font-medium px-3 py-2">Excel sayfası</th><th className="text-left font-medium px-3 py-2">Fuar / dönem</th><th className="text-right font-medium px-3 py-2">Satır</th></tr>
                </thead>
                <tbody>
                  {onizleme.okuma.sayfalar.map((s) => (
                    <tr key={s.ad} className="border-t" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-3 py-1.5 text-white">{s.ad}</td>
                      <td className="px-3 py-1.5" style={{ color: "#C9D1DC" }}>{s.etiket}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{s.satir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Acilir baslik="Müşterimizle eşleşenler (potansiyel değil, müşteri kartına eklenir)" adet={onizleme.musteri.length} testId="ac-musteri">
                {onizleme.musteri.map(({ f, alici }) => (
                  <p key={f.anahtar} data-musteri-eslesme><span className="text-white">{f.ad}</span> <span style={{ color: TEXT_MUTED }}>→ {alici}</span></p>
                ))}
              </Acilir>
              <Acilir baslik="Bozuk e-postalar (kaydedilir, “düzeltilmeli” işaretlenir)" adet={bozuk.length} testId="ac-bozuk">
                {bozuk.map(({ f, e }, i) => <p key={`${f.anahtar}-${i}`}><span className="text-white">{f.ad}</span> <span style={{ color: "#FBBF24" }}>{e}</span></p>)}
              </Acilir>
              <Acilir baslik="Ülkesi telefon kodundan / e-postadan bulunanlar" adet={telefondan.length} testId="ac-telefon">
                {telefondan.map((f) => <p key={f.anahtar} className="flex items-center gap-1.5"><UlkeBayrak ulke={f.ulke} /> <span className="text-white">{f.ad}</span> <span style={{ color: TEXT_MUTED }}>{ulkeGosterim(f.ulke)}</span></p>)}
              </Acilir>
              <Acilir baslik="Ülkesi bulunamayanlar (sonra elle girilebilir)" adet={ulkesiz.length} testId="ac-ulkesiz">
                {ulkesiz.map((f) => <p key={f.anahtar}><span className="text-white">{f.ad}</span>{f.ulke_ham ? <span style={{ color: TEXT_MUTED }}> · Excel: {f.ulke_ham}</span> : null}</p>)}
              </Acilir>
              <Acilir baslik="Uyarılar" adet={onizleme.okuma.uyarilar.length} testId="ac-uyari">
                {onizleme.okuma.uyarilar.map((u, i) => <p key={i}>{u}</p>)}
              </Acilir>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setOnizleme(null); setAsama("bos"); }} disabled={asama === "aktariliyor"}
                className="h-9 px-4 rounded-lg text-sm border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
                Başka dosya
              </button>
              <button type="button" onClick={aktar} disabled={asama === "aktariliyor" || onizleme.firmalar.length === 0} data-testid="fuar-aktar"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {asama === "aktariliyor" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {asama === "aktariliyor" ? "Aktarılıyor…" : `Aktar (${onizleme.firmalar.length} firma)`}
              </button>
            </div>
          </div>
        )}

        {asama === "bitti" && sonuc && (
          <div className="rounded-lg border px-4 py-3 space-y-1 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)" }} data-testid="fuar-sonuc">
            <p className="flex items-center gap-2 text-white font-medium"><CheckCircle2 size={16} style={{ color: ACCENT }} /> Aktarma tamamlandı</p>
            <p style={{ color: "#C9D1DC" }}>
              {sonuc.firma} firma işlendi: <b className="text-white" data-sonuc-yeni>{sonuc.yeni_firma}</b> yeni, {sonuc.guncellenen_firma} mevcut kayda eklendi
              ({sonuc.musteri_eslesen} müşterimiz). {sonuc.yeni_kisi} yeni yetkili, {sonuc.yeni_katilim} fuar kaydı.
            </p>
            <div className="pt-2 flex gap-2">
              <button type="button" onClick={() => { setOnizleme(null); setSonuc(null); setAsama("bos"); }} className="h-8 px-3 rounded-lg text-xs border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>Başka dosya yükle</button>
              <button type="button" onClick={onKapat} className="h-8 px-3 rounded-lg text-xs text-white" style={{ backgroundColor: ACCENT }}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
