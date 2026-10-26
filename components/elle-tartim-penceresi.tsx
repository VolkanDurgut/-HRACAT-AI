"use client";
import React from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import {
  bosElleTartimFormu, elleTartimHatalari, kgOku, vgmHesapla, TARTIM_YERLERI,
  type ElleTartimFormu, type TartimYeri,
} from "@/lib/elle-tartim";

type Props = {
  konteynerNo: string;
  muhurNo: string | null;
  onKapat: () => void;
  /** Hata metni ya da null (basarili). */
  onKaydet: (form: ElleTartimFormu) => Promise<string | null>;
};

/**
 * DBA belgesi yuklenemeyen konteyner icin tartim bilgilerini elle girme penceresi
 * (26.10.2026). Kayit "ELLE GIRILEN TARTIM KAYDI" PDF'i olarak DBA yerine baglanir.
 */
export function ElleTartimPenceresi({ konteynerNo, muhurNo, onKapat, onKaydet }: Props) {
  const [form, setForm] = React.useState<ElleTartimFormu>(bosElleTartimFormu);
  const [denendi, setDenendi] = React.useState(false);
  const [kaydediliyor, setKaydediliyor] = React.useState(false);
  const [sunucuHatasi, setSunucuHatasi] = React.useState<string | null>(null);

  const hatalar = elleTartimHatalari(form);
  const gorunenHata = (alan: keyof ElleTartimFormu) => (denendi ? hatalar[alan] : undefined);
  const vgm = vgmHesapla(form);
  const vgmOtomatik = !form.vgmKg.trim();
  const net = kgOku(form.netKg);
  const dara = kgOku(form.daraKg);

  const degistir = <K extends keyof ElleTartimFormu>(alan: K, deger: ElleTartimFormu[K]) => setForm((f) => ({ ...f, [alan]: deger }));

  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !kaydediliyor) onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [kaydediliyor, onKapat]);

  const kaydet = async () => {
    setDenendi(true);
    setSunucuHatasi(null);
    if (Object.keys(hatalar).length > 0) return;
    setKaydediliyor(true);
    const hata = await onKaydet(form);
    setKaydediliyor(false);
    if (hata) setSunucuHatasi(hata);
  };

  const girdi = "w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
  const etiket = "block text-xs font-medium mb-1";
  const Hata = ({ alan }: { alan: keyof ElleTartimFormu }) => gorunenHata(alan) ? <p className="text-xs text-red-400 mt-0.5">{gorunenHata(alan)}</p> : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="elle-tartim-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kaydediliyor) onKapat(); }}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <p id="elle-tartim-baslik" className="text-sm font-semibold text-white">Tartım bilgilerini elle gir</p>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              <span className="font-mono text-white">{konteynerNo}</span>{muhurNo ? <> · mühür <span className="font-mono">{muhurNo}</span></> : null}
            </p>
          </div>
          <button onClick={onKapat} disabled={kaydediliyor} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-amber-300 bg-amber-500/10" style={{ borderColor: "rgba(251,191,36,0.3)" }}>
            <AlertTriangle size={14} className="shrink-0 mt-px" />
            <span>Sadece DBA belgesi yüklenemiyorsa kullanın. Kayıt &quot;Elle girilen tartım kaydı — resmî DBA değildir&quot; belgesiyle DBA yerine bağlanır; konteyner yüklendi sayılır ve her yerde <b>Elle</b> olarak işaretlenir.</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-plaka">Araç plakası *</label>
              <input id="et-plaka" value={form.plaka} onChange={(e) => degistir("plaka", e.target.value.toUpperCase())} placeholder="59ABC123"
                className={`${girdi} uppercase font-mono`} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              <Hata alan="plaka" />
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-yer">Tartım yeri</label>
              <select id="et-yer" value={form.tartimYeri} onChange={(e) => degistir("tartimYeri", e.target.value as TartimYeri)}
                className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                {(Object.keys(TARTIM_YERLERI) as TartimYeri[]).map((k) => <option key={k} value={k}>{TARTIM_YERLERI[k]}</option>)}
              </select>
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-dara">Konteyner darası (kg) *</label>
              <input id="et-dara" inputMode="numeric" value={form.daraKg} onChange={(e) => degistir("daraKg", e.target.value)} placeholder="2250"
                className={`${girdi} text-right`} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              <Hata alan="daraKg" />
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-net">Net yük (kg) *</label>
              <input id="et-net" inputMode="numeric" value={form.netKg} onChange={(e) => degistir("netKg", e.target.value)} placeholder="25120"
                className={`${girdi} text-right`} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              <Hata alan="netKg" />
            </div>
            <div className="sm:col-span-2">
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-vgm">VGM — doğrulanmış brüt ağırlık (kg)</label>
              <input id="et-vgm" inputMode="numeric" value={form.vgmKg} onChange={(e) => degistir("vgmKg", e.target.value)}
                placeholder={net !== null && dara !== null ? `${(net + dara).toLocaleString("tr-TR")} (net + dara)` : "Boş bırakılırsa net + dara"}
                className={`${girdi} text-right`} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              <Hata alan="vgmKg" />
              <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>
                {vgm !== null
                  ? <>Kaydedilecek VGM: <b className="text-white">{vgm.toLocaleString("tr-TR")} kg</b>{vgmOtomatik ? " (net + dara)" : ""}. Liman tartımında farklı bir değer çıktıysa onu yazın.</>
                  : "Boş bırakılırsa net + dara olarak hesaplanır."}
              </p>
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-giris">Giriş tarihi - saati</label>
              <input id="et-giris" type="datetime-local" value={form.girisZamani} onChange={(e) => degistir("girisZamani", e.target.value)}
                className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
              <Hata alan="girisZamani" />
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-cikis">Çıkış (tartım) tarihi - saati *</label>
              <input id="et-cikis" type="datetime-local" value={form.cikisZamani} onChange={(e) => degistir("cikisZamani", e.target.value)}
                className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }} />
              <Hata alan="cikisZamani" />
              <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>Raporlarda konteynerin yüklendiği gün olarak bu kullanılır.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-belge">Liman belge no (varsa)</label>
              <input id="et-belge" value={form.limanBelgeNo} onChange={(e) => degistir("limanBelgeNo", e.target.value)}
                className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div className="sm:col-span-2">
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="et-aciklama">Açıklama</label>
              <textarea id="et-aciklama" rows={2} value={form.aciklama} onChange={(e) => degistir("aciklama", e.target.value)}
                className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
          </div>

          {sunucuHatasi && <p className="text-xs text-red-400" role="alert">{sunucuHatasi}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <button onClick={onKapat} disabled={kaydediliyor} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            Vazgeç
          </button>
          <button onClick={kaydet} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor && <Loader2 size={14} className="animate-spin" />}
            {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
