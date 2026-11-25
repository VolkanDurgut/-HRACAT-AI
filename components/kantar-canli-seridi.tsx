"use client";
/**
 * KANTAR PANELI · "SU AN KANTARDA" (24.11.2026). Ilk tartimi yapilmis, ikinci tartimi bekleyen araclar (kantar
 * programindan her dakika) + kantarda tartilip sistemde karsiligi olmayan araclar (son 3 gun, 5 ton ustu).
 * Veri: lib/kantar-canli.ts (kantar_canli). SALT GORUNTU: hicbir kayit degismez. Veri yoksa / yetki yoksa gizli.
 * 26.11.2026: tek satirlik serit + "Eslesmeyen N Tartim" dugmesi (liste sagdan acilan cekmecede).
 */
import React from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { beklemeYazi, kantarSaatYazi, sinyalDurumu, type KantarCanli } from "@/lib/kantar-canli";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";

export function KantarCanliSeridi({ veri, eslesmeyenAc }: { veri: KantarCanli | null; eslesmeyenAc?: () => void }) {
  if (!veri) return null;
  const sinyal = sinyalDurumu(veri.sonSinyal);
  // 26.11.2026 yeniden tasarim: TEK SATIR. Solda kantardaki araclar (sade kart), sagda yalniz "Eslesmeyen N Tartim"
  // dugmesi (liste cekmecede: components/kantar-eslesmeyen-cekmece.tsx). "Canli" rozeti yalniz sayfa basliginda.
  return (
    <div className="shrink-0 rounded-xl border px-3 py-2 flex items-center gap-2 min-w-0" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="kantar-canli">
      <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white whitespace-nowrap">
        <Scale size={14} style={{ color: "#38BDF8" }} /> Kantarda
        <span className="font-normal" style={{ color: TEXT_MUTED }}>({veri.iceride.length})</span>
      </span>
      {sinyal.kopuk && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] text-amber-400 whitespace-nowrap" title="Kantar bilgisayarındaki görev her dakika veri gönderir" data-testid="kantar-sinyal">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Kantar verisi gelmiyor{sinyal.dk !== null ? ` (${beklemeYazi(sinyal.dk)})` : ""}
        </span>
      )}
      <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        {veri.iceride.length === 0 ? (
          <span className="text-[11px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>Kantarda bekleyen araç yok</span>
        ) : veri.iceride.map((a) => {
          const uzun = (a.bekleme_dk ?? 0) >= 6 * 60;
          const hedef = a.dosya_no || a.is_emri_no || a.alis_no;
          return (
            <span key={a.kayit_no} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] whitespace-nowrap"
              style={{ borderColor: uzun ? "rgba(245,158,11,0.45)" : CARD_BORDER }} data-kantar-arac={a.plaka || ""}
              title={`${hedef ? `${hedef} · ` : "Eşleşen iş yok · "}giriş ${kantarSaatYazi(a.giris)}${a.konteyner ? ` · ${a.konteyner}` : ""}`}>
              <b className="font-mono text-white">{plakaYazi(a.plaka)}</b>
              <span className={uzun ? "text-amber-400 font-semibold" : "text-sky-300 font-semibold"}>{beklemeYazi(a.bekleme_dk)}</span>
              <span className="text-white tabular-nums">{a.tartim1_kg !== null ? kgYazi(a.tartim1_kg) : "—"}</span>
              {(a.konteyner || a.urun) && <span style={{ color: TEXT_MUTED }}>{a.konteyner || a.urun}</span>}
            </span>
          );
        })}
      </div>
      {veri.eslesmeyen.length > 0 && (
        <button type="button" onClick={eslesmeyenAc}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap hover:bg-amber-500/15 transition-colors"
          style={{ borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.08)", color: "#FCD34D" }}
          title="Kantarda tartıldı, sistemde karşılığı yok (son 3 gün, 5 ton üstü)" data-testid="kantar-eslesmeyen">
          <AlertTriangle size={13} /> Eşleşmeyen {veri.eslesmeyen.length} Tartım
        </button>
      )}
    </div>
  );
}

/** "34KRG001" -> "34 KRG 001" (yalniz gorunum) */
function plakaYazi(p: string | null): string {
  if (!p) return "—";
  const m = p.replace(/\s+/g, "").toUpperCase().match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Is emri / alis satiri: "+22.120 kg kantarda · irsaliye bekliyor (1 araç)" */
export function KantarBekleyenSatiri({ kg, arac, plakalar }: { kg: number; arac: number; plakalar: string[] }) {
  return (
    <p className="mt-1 text-[10.5px] font-semibold text-sky-300" title={`Kantarda tartıldı, irsaliyesi henüz sisteme girilmedi: ${plakalar.join(", ")}. Tonaj kalandan düşüldü; irsaliye girilince bu satır kalkar (çift sayılmaz).`} data-testid="kantar-bekleyen">
      İçinde +{kgYazi(kg)} kantar tartımı · irsaliye bekliyor ({arac} araç)
    </p>
  );
}

/** Iki parcali ilerleme cubugu: irsaliyeli kisim dolu, kantarda tartilip irsaliyesi bekleyen kisim acik ton. */
export function KantarliCubuk({ oranIrsaliye, oranToplam, renk, yukseklik = "h-1.5" }: { oranIrsaliye: number; oranToplam: number; renk: string; yukseklik?: string }) {
  const a = Math.max(0, Math.min(100, Math.round(oranIrsaliye * 100)));
  const b = Math.max(0, Math.min(100 - a, Math.round(oranToplam * 100) - a));
  return (
    <div className={`${yukseklik} rounded-full overflow-hidden flex`} style={{ backgroundColor: "#0F131A" }}>
      <div className="h-full" style={{ width: `${a}%`, backgroundColor: renk }} />
      {b > 0 && <div className="h-full" style={{ width: `${b}%`, backgroundColor: renk, opacity: 0.45 }} title="Kantarda tartıldı, irsaliye bekliyor" data-testid="kantar-cubuk" />}
    </div>
  );
}
