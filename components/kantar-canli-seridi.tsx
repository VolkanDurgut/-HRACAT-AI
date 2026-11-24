"use client";
/**
 * KANTAR PANELI · "SU AN KANTARDA" (24.11.2026). Ilk tartimi yapilmis, ikinci tartimi bekleyen araclar (kantar
 * programindan her dakika) + kantarda tartilip sistemde karsiligi olmayan araclar (son 3 gun, 5 ton ustu).
 * Veri: lib/kantar-canli.ts (kantar_canli). SALT GORUNTU: hicbir kayit degismez. Veri yoksa / yetki yoksa gizli.
 */
import React from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { beklemeYazi, kantarSaatYazi, sinyalDurumu, type KantarCanli } from "@/lib/kantar-canli";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";

export function KantarCanliSeridi({ veri }: { veri: KantarCanli | null }) {
  if (!veri) return null;
  const sinyal = sinyalDurumu(veri.sonSinyal);
  return (
    <div className="shrink-0 rounded-xl border px-3 py-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="kantar-canli">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white whitespace-nowrap">
          <Scale size={14} style={{ color: "#38BDF8" }} /> Şu an kantarda
          <span className="font-normal" style={{ color: TEXT_MUTED }}>({veri.iceride.length})</span>
        </span>
        <span className={`inline-flex items-center gap-1 text-[10.5px] whitespace-nowrap ${sinyal.kopuk ? "text-amber-400" : ""}`} style={sinyal.kopuk ? undefined : { color: TEXT_MUTED }}
          title="Kantar programından gelen son veri (kantar bilgisayarındaki görev her dakika gönderir)" data-testid="kantar-sinyal">
          <span className={`w-1.5 h-1.5 rounded-full ${sinyal.kopuk ? "bg-amber-500" : "bg-emerald-500"}`} />
          {sinyal.kopuk ? `Kantar verisi gelmiyor${sinyal.dk !== null ? ` (${beklemeYazi(sinyal.dk)})` : ""}` : `Kantar canlı · ${sinyal.dk === 0 ? "az önce" : `${sinyal.dk} dk önce`}`}
        </span>
        <span className="ml-auto text-[10px]" style={{ color: TEXT_MUTED }}>Bilgi amaçlı · DBA ve irsaliye kayıtları değişmez</span>
      </div>

      {veri.iceride.length === 0 ? (
        <p className="mt-1 text-[11px]" style={{ color: TEXT_MUTED }}>Kantarda ikinci tartımı bekleyen araç yok.</p>
      ) : (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "thin" }}>
          {veri.iceride.map((a) => {
            const hedef = a.dosya_no || a.is_emri_no || a.alis_no;
            const uzun = (a.bekleme_dk ?? 0) >= 6 * 60;
            return (
              <div key={a.kayit_no} className="shrink-0 rounded-lg border px-2.5 py-1.5 min-w-[170px]" style={{ borderColor: uzun ? "rgba(245,158,11,0.45)" : CARD_BORDER }} data-kantar-arac={a.plaka || ""}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold font-mono text-white">{a.plaka || "—"}</span>
                  <span className={`text-[10.5px] font-semibold ${uzun ? "text-amber-400" : "text-sky-300"}`} title={`Giriş (1. tartım): ${kantarSaatYazi(a.giris)}`}>{beklemeYazi(a.bekleme_dk)}</span>
                </div>
                <p className="text-[10.5px] truncate max-w-[220px]" style={{ color: hedef ? "#CBD5E1" : TEXT_MUTED }}>
                  {hedef ? <span className="font-mono font-semibold">{hedef}</span> : "Eşleşen iş yok"}
                  {a.konteyner ? <span className="font-mono"> · {a.konteyner}</span> : a.urun ? ` · ${a.urun}` : ""}
                </p>
                <p className="text-[10px]" style={{ color: TEXT_MUTED }}>1. tartım {a.tartim1_kg !== null ? kgYazi(a.tartim1_kg) : "—"} · {kantarSaatYazi(a.giris)}</p>
              </div>
            );
          })}
        </div>
      )}

      {veri.eslesmeyen.length > 0 && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[10.5px] text-amber-300" data-testid="kantar-eslesmeyen">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            <b>Kantarda tartıldı, sistemde kaydı yok ({veri.eslesmeyen.length}):</b>{" "}
            {veri.eslesmeyen.slice(0, 6).map((e, i) => (
              <span key={e.kayit_no}>{i > 0 ? " · " : ""}<span className="font-mono">{e.plaka || "—"}</span> {e.firma || "firma yok"} {e.urun ? `(${e.urun})` : ""} {kgYazi(e.net_kg)} · {kantarSaatYazi(e.cikis)}</span>
            ))}
            {veri.eslesmeyen.length > 6 ? ` · +${veri.eslesmeyen.length - 6}` : ""}
          </span>
        </div>
      )}
    </div>
  );
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
