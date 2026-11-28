"use client";
/**
 * HAT TAKIP Asama 4 (28.11.2026): musteriye gidecek "Sailing Schedule" gorseli. Kullanici: "kolay bir sekilde png olarak
 * kopyalanabilip musteriye gorsel olarak iletilebilmeli ... ekran goruntusu almis gibi".
 * Beyaz zemin, Unex logosu, Ingilizce; tarihler limanin yerel saatiyle. PNG'ye cevirme: SeferKartiDugmeleri (html2canvas).
 * Sabit genislik (760 px) -> her ekranda ayni gorsel. Musteri / fiyat bilgisi ICERMEZ.
 */
import React, { forwardRef } from "react";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import type { Sefer } from "@/supabase/functions/_shared/hat-sefer";
import { aktarmaYazisi, kisaZaman, tarihYaz } from "@/lib/hat-takip/sefer-gorunum";

export type SeferKartiAyar = { cutoff: boolean; hat: boolean };

const R = { koyu: "#0F172A", metin: "#1E293B", soluk: "#64748B", cizgi: "#E2E8F0", zemin: "#F8FAFC", vurgu: "#047857", vurguZemin: "#ECFDF5" };

export const SeferKarti = forwardRef<HTMLDivElement, {
  seferler: Sefer[];
  polAdi: string;
  podAdi: string;
  pol: string;
  pod: string;
  sorguZamani: string;
  ayar: SeferKartiAyar;
}>(function SeferKarti({ seferler, polAdi, podAdi, pol, pod, sorguZamani, ayar }, ref) {
  const kisaPol = polAdi.split(",")[0];
  const kisaPod = podAdi.split(",")[0];
  const sorgu = new Date(sorguZamani);
  const sorguYazi = Number.isNaN(sorgu.getTime()) ? "" : `${tarihYaz(new Date(sorgu.getTime() + 3 * 3600_000).toISOString().slice(0, 10), "en")}`;
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: R.soluk, padding: "9px 10px", borderBottom: `2px solid ${R.cizgi}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 12.5, color: R.metin, padding: "10px 10px", borderBottom: `1px solid ${R.cizgi}`, verticalAlign: "top" };

  return (
    <div ref={ref} data-testid="sefer-karti"
      style={{ width: 760, backgroundColor: "#FFFFFF", color: R.metin, fontFamily: "Inter, 'Segoe UI', Arial, sans-serif", padding: "26px 28px 20px", boxSizing: "border-box", borderRadius: 10 }}>
      {/* Baslik */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: R.vurgu }}>SAILING SCHEDULE</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: R.koyu, marginTop: 4 }}>
            {kisaPol} <span style={{ color: R.soluk, fontWeight: 400 }}>→</span> {kisaPod}
          </div>
          <div style={{ fontSize: 12, color: R.soluk, marginTop: 3 }}>
            {polAdi} ({pol}) to {podAdi} ({pod}){ayar.hat ? " · Carrier: Hapag-Lloyd" : ""}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${UNEX_LOGO_BASE64}`} alt="UNEX" width={64} height={64} style={{ width: 64, height: 64, objectFit: "contain" }} />
      </div>

      {/* Tablo */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
        <thead>
          <tr style={{ backgroundColor: R.zemin }}>
            <th style={th}>Vessel / Voyage</th>
            <th style={th}>Departure (ETD)</th>
            <th style={th}>Arrival (ETA)</th>
            <th style={{ ...th, textAlign: "center" }}>Transit</th>
            <th style={th}>Routing</th>
            {ayar.cutoff && <th style={th}>Doc. Cut-off</th>}
          </tr>
        </thead>
        <tbody>
          {seferler.map((s) => (
            <tr key={s.anahtar}>
              <td style={td}>
                <div style={{ fontWeight: 700, color: R.koyu }}>{s.gemi || "TBA"}</div>
                <div style={{ fontSize: 11, color: R.soluk, marginTop: 2 }}>{[s.sefer, s.servis_kodu].filter(Boolean).join(" · ") || "—"}</div>
              </td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 600 }}>{tarihYaz(s.kalkis, "en", true)}</div>
                <div style={{ fontSize: 11, color: R.soluk, marginTop: 2 }}>{kisaPol}</div>
              </td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 600 }}>{tarihYaz(s.varis, "en", true)}</div>
                <div style={{ fontSize: 11, color: R.soluk, marginTop: 2 }}>{kisaPod}</div>
              </td>
              <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-block", backgroundColor: R.vurguZemin, color: R.vurgu, fontWeight: 700, fontSize: 12, borderRadius: 999, padding: "3px 9px" }}>
                  {s.transit_gun ?? "—"} days
                </span>
              </td>
              <td style={td}>
                {aktarmaYazisi(s, "en")}
                {s.bacaklar.filter((b) => b.tur === "VESSEL").length > 1 && (
                  <div style={{ fontSize: 10.5, color: R.soluk, marginTop: 2 }}>
                    {s.bacaklar.filter((b) => b.tur === "VESSEL").slice(1).map((b) => b.gemi || "TBA").join(" → ")}
                  </div>
                )}
              </td>
              {ayar.cutoff && <td style={{ ...td, whiteSpace: "nowrap" }}>{kisaZaman(s.cutoff.dokuman)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Alt bilgi */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 14, fontSize: 10.5, color: R.soluk, lineHeight: 1.5 }}>
        <div>
          Dates and times are local to each port. Schedule as published by the carrier{sorguYazi ? ` on ${sorguYazi}` : ""};<br />
          dates are estimates and subject to change without notice.
        </div>
        <div style={{ textAlign: "right", fontWeight: 600, color: R.metin, whiteSpace: "nowrap" }}>Unex Trading Gıda San. ve Tic. Ltd. Şti.</div>
      </div>
    </div>
  );
});
