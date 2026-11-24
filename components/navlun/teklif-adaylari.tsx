"use client";

/**
 * Navlun > "Teklif olabilecek mailler" (16.11.2026, kullanıcı onayı; Imagesa dersi). Fiyatı okunamamış acente cevapları:
 * metninde tutar geçenler ve tanımadığımız bir alan adından NAVLUN TALEBİ yazışmasına gelenler. Kullanıcı tutarı girince
 * teklif kaydedilir; acentesi bilinmeyen mailde girilen ad ile alan adı acente olarak öğrenilir (sonraki mailler otomatik).
 * 17.11.2026 denetim: okunmuş ama metnindeki bir tutar kayıtlı tekliflerde olmayan mailler de gelir ("neden" satırı);
 * "Teklif olarak kaydet" eksik teklifi ekler, "Teklif değil" yalnız denetimi kapatır (okunmuş teklifler korunur).
 * 24.11.2026 (mimari onarım): liste sayfanın TEK okumasından gelir (lib/navlun/veri.ts navlunVerisiOku); bölüm kendi verisini çekmez.
 */
import React, { useState } from "react";
import { Mail } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { navlunHataCoz, type TeklifAdayi } from "@/lib/navlun/veri";

const tarihGoster = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function AdaySatiri({ m, onCozuldu }: { m: TeklifAdayi; onCozuldu: () => void }) {
  const [tutar, setTutar] = useState("");
  const [ekipman, setEkipman] = useState("20DC");
  const [armator, setArmator] = useState("");
  const [acente, setAcente] = useState(() => { const e = (m.alan || "").split(".")[0] || ""; return e ? e.charAt(0).toUpperCase() + e.slice(1) : ""; });
  const [acik, setAcik] = useState(false);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const bilinmeyen = !m.acente;
  const isle = async (islem: "duzelt" | "yoksay") => {
    setHata(null);
    const n = Number(tutar.replace(/\./g, "").replace(",", "."));
    if (islem === "duzelt" && !(n > 0 && n < 100000)) { setHata("Geçerli bir tutar girin."); return; }
    if (islem === "duzelt" && bilinmeyen && !acente.trim()) { setHata("Acente adını girin."); return; }
    setBekle(true);
    try { await navlunHataCoz(m.id, islem, islem === "duzelt" ? n : undefined, ekipman, armator.trim() || undefined, bilinmeyen ? acente.trim() : undefined); onCozuldu(); }
    catch (e) { setHata(e instanceof Error ? e.message : "İşlem yapılamadı."); }
    finally { setBekle(false); }
  };
  const girdi = "h-8 rounded-lg border bg-transparent px-2 text-sm text-white";
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: CARD_BORDER }} data-testid="teklif-adayi">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-white font-medium">{m.liman || "Liman ?"}</span>
        <span style={{ color: "#C9D1DC" }}>{m.acente || m.alan}</span>
        {bilinmeyen && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(147,197,253,0.12)", color: "#93C5FD" }}>tanınmayan gönderen</span>}
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{tarihGoster(m.tarih)}</span>
        <button type="button" onClick={() => setAcik(!acik)} className="text-xs underline" style={{ color: TEXT_MUTED }}>{acik ? "metni gizle" : "mail metni"}</button>
      </div>
      {m.neden && <p className="mt-1 text-xs" style={{ color: "#FCD34D" }} data-testid="aday-neden">{m.neden}</p>}
      {acik && <pre className="mt-2 text-xs whitespace-pre-wrap rounded-lg p-2 max-h-48 overflow-auto" style={{ backgroundColor: ROW_HEADER_BG, color: "#C9D1DC" }}>{m.metin}</pre>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {bilinmeyen && (
          <input value={acente} onChange={(e) => setAcente(e.target.value)} placeholder="Acente adı" aria-label="Acente adı" className={`${girdi} w-36`} style={{ borderColor: CARD_BORDER }} />
        )}
        <input value={tutar} onChange={(e) => setTutar(e.target.value)} inputMode="decimal" placeholder="Navlun (USD)" aria-label="Navlun tutarı" className={`${girdi} w-32`} style={{ borderColor: CARD_BORDER }} />
        <select value={ekipman} onChange={(e) => setEkipman(e.target.value)} aria-label="Ekipman" className="h-8 rounded-lg border px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
          <option value="20DC">20&apos;DC</option><option value="40DC">40&apos;DC</option><option value="40HC">40&apos;HC</option>
        </select>
        <input value={armator} onChange={(e) => setArmator(e.target.value)} placeholder="Armatör (isteğe bağlı)" aria-label="Armatör" className={`${girdi} w-44`} style={{ borderColor: CARD_BORDER }} />
        <button type="button" disabled={bekle} onClick={() => isle("duzelt")} className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>Teklif olarak kaydet</button>
        <button type="button" disabled={bekle} onClick={() => isle("yoksay")} className="h-8 px-3 rounded-lg text-sm border disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Teklif değil</button>
        {hata && <span className="text-xs" style={{ color: "#FCA5A5" }}>{hata}</span>}
      </div>
    </div>
  );
}

export function TeklifAdaylari({ liste, hata, onDegisti }: { liste: TeklifAdayi[]; hata: string | null; onDegisti: () => void }) {
  if (hata) return <p className="mb-4 text-xs" style={{ color: "#FCA5A5" }}>Teklif olabilecek mailler okunamadı: {hata}</p>;
  if (!liste.length) return null;
  return (
    <div className="rounded-xl border mb-4" style={{ backgroundColor: CARD_BG, borderColor: "rgba(147,197,253,0.35)" }} data-testid="teklif-adaylari">
      <div className="px-4 py-3 flex items-center gap-2 text-sm" style={{ color: "#93C5FD" }}>
        <Mail size={16} /> Teklif olabilecek mailler ({liste.length}) — fiyatı okunamayan ya da kayıtla uyuşmayan mailler; teklifse tutarı girin, değilse işaretleyin.
      </div>
      {liste.map((m) => <AdaySatiri key={m.id} m={m} onCozuldu={onDegisti} />)}
    </div>
  );
}
