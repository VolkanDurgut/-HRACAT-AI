"use client";
/**
 * Konteyner icerigi (11.11.2026): bir konteynere birden fazla urun / cuval girilir.
 * Hucre: icerik yoksa "Ürün seç" baglantisi; tek kalem -> urun adi; birden fazla -> "2 ürün" rozeti.
 * Pencere: her satir urun (proformadan), cuval (marka listesinden ya da serbest), kap adedi, net kg.
 * Toplamlar konteynerin kap adedi / net agirligiyla karsilastirilir (tutmazsa uyari; kayit yine yapilabilir).
 * Packing List bu dokumu kullanir (lib/packing-list-builder.ts).
 */
import React from "react";
import { AlertTriangle, Layers, Plus, Trash2, X } from "lucide-react";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { EN_FAZLA_KALEM, icerikKontrolu, kalemleriOku, type KonteynerKalemi } from "@/lib/konteyner-icerik";

type KonteynerOzet = { id: string; konteyner_no: string; marka: string | null; pieces: number | null; net_agirlik_kg: number | null; kalemler?: unknown };

const girdi = "w-full text-sm border rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const girdiStil = { borderColor: CARD_BORDER, backgroundColor: "#0F141C" } as React.CSSProperties;

export function KonteynerIcerikHucresi({ konteyner, urunler, markalar, companyId, onKaydedildi }: {
  konteyner: KonteynerOzet; urunler: string[]; markalar: string[]; companyId: string; onKaydedildi: () => void;
}) {
  const [acik, setAcik] = React.useState(false);
  const kalemler = kalemleriOku(konteyner.kalemler);
  if (urunler.length <= 1 && !kalemler.length) return null;             // tek urunlu dosyada gerek yok
  const etiket = kalemler.length > 1 ? `${kalemler.length} ürün` : kalemler.length === 1 ? kalemler[0].urun : "Ürün seç";
  return (
    <>
      <button type="button" onClick={() => setAcik(true)} data-testid="konteyner-icerik" data-kalem={kalemler.length}
        title={kalemler.length ? kalemler.map((k) => `${k.urun}${k.marka ? ` · ${k.marka}` : ""}${k.pieces ? ` · ${k.pieces} kap` : ""}`).join("\n") : "Bu konteynerdeki ürünü / çuvalları belirtin"}
        className="mt-1 inline-flex items-center gap-1 max-w-[220px] text-[11px] font-medium rounded px-1.5 py-0.5 border hover:bg-white/5"
        style={kalemler.length > 1 ? { borderColor: "rgba(56,189,248,0.4)", color: "#7DD3FC", backgroundColor: "rgba(56,189,248,0.08)" }
          : kalemler.length ? { borderColor: CARD_BORDER, color: "#CBD5E1" } : { borderColor: "rgba(245,158,11,0.4)", color: "#FCD34D", borderStyle: "dashed" }}>
        <Layers size={11} className="shrink-0" /> <span className="truncate">{etiket}</span>
      </button>
      {acik && <KonteynerIcerikPenceresi konteyner={konteyner} urunler={urunler} markalar={markalar} companyId={companyId}
        onKapat={() => setAcik(false)} onKaydedildi={() => { setAcik(false); onKaydedildi(); }} />}
    </>
  );
}

type Taslak = { urun: string; marka: string; pieces: string; net_kg: string };
const taslaga = (k: KonteynerKalemi): Taslak => ({ urun: k.urun, marka: k.marka || "", pieces: k.pieces != null ? String(k.pieces) : "", net_kg: k.net_kg != null ? String(k.net_kg) : "" });

export function KonteynerIcerikPenceresi({ konteyner, urunler, markalar, companyId, onKapat, onKaydedildi }: {
  konteyner: KonteynerOzet; urunler: string[]; markalar: string[]; companyId: string; onKapat: () => void; onKaydedildi: () => void;
}) {
  const { showToast } = useToast();
  const mevcut = kalemleriOku(konteyner.kalemler);
  const [satirlar, setSatirlar] = React.useState<Taslak[]>(mevcut.length ? mevcut.map(taslaga)
    : [{ urun: urunler.length === 1 ? urunler[0] : "", marka: konteyner.marka || "", pieces: konteyner.pieces != null ? String(konteyner.pieces) : "", net_kg: konteyner.net_agirlik_kg != null ? String(konteyner.net_agirlik_kg) : "" }]);
  const [kaydediyor, setKaydediyor] = React.useState(false);
  const [hata, setHata] = React.useState<string | null>(null);

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !kaydediyor) onKapat(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [kaydediyor, onKapat]);

  const degistir = (i: number, alan: keyof Taslak, v: string) => setSatirlar((s) => s.map((x, j) => (j === i ? { ...x, [alan]: v } : x)));
  const sayiOku = (v: string) => { const t = v.replace(/\s+/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); return t === "" ? null : Number(t); };
  const temiz: KonteynerKalemi[] = satirlar.map((s) => ({ urun: s.urun.trim(), marka: s.marka.trim() || null, pieces: sayiOku(s.pieces), net_kg: sayiOku(s.net_kg) }));
  const kontrol = icerikKontrolu(temiz.filter((k) => k.urun), konteyner);

  const kaydet = async (temizle = false) => {
    setHata(null);
    let deger: KonteynerKalemi[] | null = null;
    if (!temizle) {
      const dolu = temiz.filter((k) => k.urun);
      if (!dolu.length) { setHata("En az bir satırda ürün seçin."); return; }
      if (dolu.some((k) => (k.pieces !== null && !(Number.isInteger(k.pieces) && k.pieces >= 0)) || (k.net_kg !== null && !(k.net_kg >= 0)))) { setHata("Kap adedi tam sayı, net ağırlık sıfır ya da pozitif olmalı."); return; }
      if (dolu.length > 1 && dolu.some((k) => !k.pieces || !k.net_kg)) { setHata("Birden fazla ürün varsa her satırın kap adedi ve net ağırlığı girilmeli (Packing List satır satır yazar)."); return; }
      deger = dolu;
    }
    setKaydediyor(true);
    const { data, error } = await supabase.from("konteynerler").update({ kalemler: deger }).eq("id", konteyner.id).eq("company_id", companyId).select("id");
    setKaydediyor(false);
    const h = yazmaHatasi(error, data);
    if (h) { setHata(`Kaydedilemedi: ${h}`); return; }
    showToast(temizle ? "Konteyner içeriği kaldırıldı." : "Konteyner içeriği kaydedildi.", "success");
    onKaydedildi();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="kont-icerik-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kaydediyor) onKapat(); }} data-testid="konteyner-icerik-penceresi">
      <div className="w-full max-w-2xl rounded-xl border shadow-2xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="kont-icerik-baslik" className="text-base font-semibold text-white flex items-center gap-2"><Layers size={16} style={{ color: ACCENT }} /> Konteyner içeriği · <span className="font-mono">{konteyner.konteyner_no}</span></h2>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Konteynerdeki ürünleri ve çuvalları girin. Birden fazla ürün varsa Packing List her birini ayrı satırda yazar; diğer konteynerlerde yalnız kendi ürünü görünür.</p>
          </div>
          <button type="button" onClick={onKapat} disabled={kaydediyor} aria-label="Kapat" className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_90px_110px_32px] gap-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
            <span>Ürün</span><span>Çuval / marka</span><span className="text-right">Kap adedi</span><span className="text-right">Net (kg)</span><span />
          </div>
          {satirlar.map((s, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_90px_110px_32px] gap-2 items-center" data-testid="icerik-satir">
              <select value={s.urun} onChange={(e) => degistir(i, "urun", e.target.value)} aria-label={`${i + 1}. ürün`} className={`${girdi} col-span-2 sm:col-span-1`} style={girdiStil}>
                <option value="">- Ürün seçin -</option>
                {urunler.map((u) => <option key={u} value={u}>{u}</option>)}
                {s.urun && !urunler.includes(s.urun) && <option value={s.urun}>{s.urun}</option>}
              </select>
              <input list="kont-icerik-markalar" value={s.marka} onChange={(e) => degistir(i, "marka", e.target.value)} placeholder="Çuval markası" aria-label={`${i + 1}. çuval`} className={`${girdi} col-span-2 sm:col-span-1`} style={girdiStil} />
              <input inputMode="numeric" value={s.pieces} onChange={(e) => degistir(i, "pieces", e.target.value)} placeholder="Kap" aria-label={`${i + 1}. kap adedi`} className={`${girdi} text-right tabular-nums`} style={girdiStil} />
              <input inputMode="decimal" value={s.net_kg} onChange={(e) => degistir(i, "net_kg", e.target.value)} placeholder="Net kg" aria-label={`${i + 1}. net kg`} className={`${girdi} text-right tabular-nums`} style={girdiStil} />
              <button type="button" onClick={() => setSatirlar((x) => x.filter((_, j) => j !== i))} disabled={satirlar.length === 1} aria-label={`${i + 1}. satırı sil`}
                className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 justify-self-end" style={{ color: TEXT_MUTED }}><Trash2 size={14} /></button>
            </div>
          ))}
          <datalist id="kont-icerik-markalar">{markalar.map((m) => <option key={m} value={m} />)}</datalist>
          {satirlar.length < EN_FAZLA_KALEM && (
            <button type="button" data-testid="icerik-satir-ekle" onClick={() => setSatirlar((x) => [...x, { urun: "", marka: "", pieces: "", net_kg: "" }])}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
              <Plus size={12} /> Ürün / çuval ekle
            </button>
          )}
          <div className="rounded-lg border px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="icerik-toplam">
            <span>Toplam: <b className="text-white tabular-nums">{kontrol.pieces.toLocaleString("tr-TR")}</b> kap · <b className="text-white tabular-nums">{kontrol.netKg.toLocaleString("tr-TR")}</b> kg</span>
            <span>Konteyner: <b className="text-white tabular-nums">{konteyner.pieces != null ? konteyner.pieces.toLocaleString("tr-TR") : "-"}</b> kap · <b className="text-white tabular-nums">{konteyner.net_agirlik_kg != null ? Number(konteyner.net_agirlik_kg).toLocaleString("tr-TR") : "-"}</b> kg</span>
            {!kontrol.tamam && <span className="inline-flex items-center gap-1 text-amber-300" data-testid="icerik-uyari"><AlertTriangle size={12} /> Toplam konteynerle tutmuyor ({kontrol.piecesFark ? `${kontrol.piecesFark > 0 ? "+" : ""}${kontrol.piecesFark} kap` : ""}{kontrol.piecesFark && kontrol.netFark ? ", " : ""}{kontrol.netFark ? `${kontrol.netFark > 0 ? "+" : ""}${kontrol.netFark} kg` : ""})</span>}
          </div>
          {hata && <p className="text-xs text-red-400" role="alert">{hata}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t" style={{ borderColor: CARD_BORDER }}>
          {mevcut.length ? (
            <button type="button" onClick={() => kaydet(true)} disabled={kaydediyor} className="text-xs font-medium px-3 py-1.5 rounded-md border hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>İçeriği kaldır</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onKapat} disabled={kaydediyor} className="text-sm px-3 py-1.5 rounded-md border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>Vazgeç</button>
            <button type="button" onClick={() => kaydet()} disabled={kaydediyor} data-testid="icerik-kaydet" className="text-sm font-semibold px-4 py-1.5 rounded-md text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>{kaydediyor ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
