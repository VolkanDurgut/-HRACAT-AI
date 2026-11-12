/**
 * Rapor maili ortak kabugu (11.11.2026). Kullanici: "Raporlar cok uzun; Kontrol Merkezi'ndeki 'Otomatik Ozet' gibi bir
 * metin yazsin, ekinde sadece Excel olsun. Tek sayfaya sigdirabilirsek super olur."
 * Siparis raporu ve navlun tablosu AYNI kabugu kullanir: baslik + "Otomatik Ozet" maddeleri + (istege
 * bagli) tek sikistirilmis tablo + uygulama dugmesi + kisa dipnot. SAF: veri yok, ag yok.
 * Tema: lacivert #283474, seftali #F4A07C, yesil #10B981 (acik kurumsal).
 */
export const RAPOR_LACIVERT = "#283474";
export const RAPOR_SEFTALI = "#F4A07C";
export const RAPOR_YESIL = "#10B981";
export const RAPOR_URL = "https://ihracatasistanim.com";

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type RaporKabugu = {
  sirketAdi: string;
  baslik: string;
  /** Tarih (dd.mm.yyyy) + oturum etiketi ("Sabah raporu") */
  tarih: string;
  oturum?: string | null;
  /** Kutunun basligi (varsayilan "Otomatik Özet") */
  ozetBaslik?: string;
  /** Maddeler yerine kutunun icinde hazir HTML (orn. siparis raporunda on odemeler tablosu) */
  ozetIcerik?: string;
  /** "Otomatik Ozet" altindaki aciklama ("Siparis listesi ve yukleme planina gore") */
  ozetAlt: string;
  /** HTML maddeler (cagiran esc() ile kacirir; <b> serbest) */
  maddeler: string[];
  /** true: ozet kutusu hic cizilmez (navlun raporu, 12.11.2026) */
  ozetYok?: boolean;
  /** Ozetten sonra tek bolum (sikistirilmis tablo); yoksa bos */
  ekBolum?: string;
  dugme: { metin: string; yol: string };
  dipnot: string;
};

export function raporKabugu(k: RaporKabugu): string {
  const madde = (m: string) => `<tr><td style="width:14px;vertical-align:top;padding:5px 0 0"><div style="width:6px;height:6px;border-radius:3px;background:${RAPOR_SEFTALI}"></div></td><td style="padding:2px 0 6px;font-size:13px;line-height:1.5;color:#1E293B">${m}</td></tr>`;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(k.baslik)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:16px 0"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border-radius:6px;padding:20px 22px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${RAPOR_LACIVERT};padding-bottom:8px"><tr>
    <td style="width:46px;vertical-align:middle"><img src="${RAPOR_URL}/images/logo.png" width="38" height="38" alt="${esc(k.sirketAdi)}" style="display:block;width:38px;height:38px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:17px;font-weight:bold;color:${RAPOR_LACIVERT}">${esc(k.sirketAdi)} ${esc(k.baslik)}</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:13px;font-weight:bold;color:${RAPOR_LACIVERT}">${esc(k.tarih)}</div>${k.oturum ? `<div style="font-size:11px;color:#94A3B8">${esc(k.oturum)}</div>` : ""}</td>
  </tr></table>
  ${k.ozetYok ? "" : `<div style="margin-top:14px;border:1px solid #E2E8F0;border-left:4px solid ${RAPOR_SEFTALI};border-radius:4px;padding:10px 14px">
    <div style="font-size:13px;font-weight:bold;color:${RAPOR_LACIVERT}">${esc(k.ozetBaslik || "Otomatik Özet")}</div>
    ${k.ozetAlt ? `<div style="font-size:11px;color:#64748B;margin-bottom:6px">${esc(k.ozetAlt)}</div>` : ""}
    ${k.ozetIcerik ?? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${k.maddeler.map(madde).join("")}</table>`}
  </div>`}
  ${k.ekBolum || ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
    <td style="font-size:11px;color:#94A3B8;line-height:1.5;vertical-align:middle">${k.dipnot}</td>
    <td style="text-align:right;vertical-align:middle;white-space:nowrap;padding-left:12px"><a href="${RAPOR_URL}${k.dugme.yol}" style="display:inline-block;background:${RAPOR_YESIL};color:#fff;text-decoration:none;font-size:12px;font-weight:bold;padding:8px 14px;border-radius:5px">${esc(k.dugme.metin)}</a></td>
  </tr></table>
</td></tr></table>
</td></tr></table></body></html>`;
}

/** Sikistirilmis tablo: tek satir, 11px; basliklar lacivert. hucreler HTML (cagiran kacirir). */
export function sikiTablo(basliklar: { ad: string; sag?: boolean; genislik?: string }[], satirlar: string[][], baslik?: string): string {
  const th = basliklar.map((b) => `<th style="background:${RAPOR_LACIVERT};color:#fff;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;padding:5px 6px;text-align:${b.sag ? "right" : "left"};white-space:nowrap${b.genislik ? `;width:${b.genislik}` : ""}">${b.ad}</th>`).join("");
  const tr = satirlar.map((s, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${s.map((h, j) => `<td style="padding:3px 6px;border-bottom:1px solid #EEF2F7;font-size:11px;line-height:1.35;color:#1E293B;white-space:nowrap;${basliklar[j]?.sag ? "text-align:right;" : ""}">${h}</td>`).join("")}</tr>`).join("");
  return `${baslik ? `<div style="margin:14px 0 5px;font-size:12px;font-weight:bold;color:${RAPOR_LACIVERT}">${baslik}</div>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th}</tr>${tr}</table>`;
}

export const sayiTr = (v: number | null | undefined, ond = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : v.toLocaleString("tr-TR", { minimumFractionDigits: ond, maximumFractionDigits: ond });

/** "$3,3 mn" / "$412 bin" / "$9.800" (Kontrol Merkezi ozetiyle ayni dil) */
export function paraKisa(v: number, para = "USD"): string {
  const s = para === "USD" ? "$" : para === "EUR" ? "€" : `${para} `;
  if (Math.abs(v) >= 1_000_000) return `${s}${(v / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn`;
  if (Math.abs(v) >= 10_000) return `${s}${Math.round(v / 1000).toLocaleString("tr-TR")} bin`;
  return `${s}${Math.round(v).toLocaleString("tr-TR")}`;
}
