// ============================================================================
// ORTAK OPERASYON MAIL KALIBI (17.11.2026) - SAF (Deno/Next bagimliligi yok)
// ============================================================================
// Kullanici: "VGM raporu - hazirlanan konsimento talimati mail mesajlari belirli bir kalipta olmali ve ayni tarzda
// olmali. Ornek olarak konsimento talimatindaki kalip kullanilabilir."
// Kalip (konsimento-hatirlatma.ts 05.11.2026 tasarimi AYNEN): lacivert bant + seftali alt cizgi, logo, ust etiket
// "UNEX GIDA · IHRACAT OPERASYON", baslik; (test seridi); hitap; giris metni; bilgi tablosu (seftali sol kenar);
// uyari kutulari; dugmeler (birincil lacivert dolu, ikincil cerceveli); dugme notu; alt not.
// Kullananlar: konsimento-hatirlatma (khMail), fatura-onay (talimatMailiHtml), vgm-rapor (mailOlustur).
// Test: tests/operasyon-mail.test.ts.
// ============================================================================

export const OP_LACIVERT = "#1B2352"; // bant
export const OP_DUGME = "#283474"; // tema lacivert (dugme, metin)
export const OP_SEFTALI = "#F4A07C";

export const opKacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type OpUyari = { ton: "amber" | "kirmizi"; html: string };
export type OpDugme = { metin: string; href: string; birincil?: boolean };

export type OperasyonMail = {
  /** Logo adresinin koku (or. https://ihracatasistanim.com) */
  site: string;
  /** Banttaki baslik: "Konşimento talimatı hazır" */
  baslik: string;
  /** Bant ust etiketi (varsayilan "UNEX GIDA · İHRACAT OPERASYON") */
  ustEtiket?: string;
  /** Test seridi DUZ metni (kacis burada yapilir); null/bos -> serit yok */
  testMetni?: string | null;
  /** "Harun Bey merhaba," (duz metin) */
  hitap?: string | null;
  /** Giris paragrafi HTML (cagiran kacislar) */
  girisHtml?: string | null;
  /** Bilgi tablosu: [etiket (duz), deger HTML (cagiran kacislar)] */
  bilgiler?: [string, string][];
  uyarilar?: OpUyari[];
  dugmeler?: OpDugme[];
  /** Dugmelerin altindaki kucuk not (HTML) */
  dugmeNotuHtml?: string | null;
  /** En alttaki gri not (HTML) */
  altNotHtml?: string | null;
};

const UYARI_STIL: Record<OpUyari["ton"], { kenar: string; zemin: string; renk: string }> = {
  amber: { kenar: "#FCD34D", zemin: "#FFFBEB", renk: "#92400E" },
  kirmizi: { kenar: "#FCA5A5", zemin: "#FEF2F2", renk: "#B91C1C" },
};

export function opUyariHtml(u: OpUyari): string {
  const s = UYARI_STIL[u.ton];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td style="padding:9px 14px;border:1px solid ${s.kenar};background:${s.zemin};border-radius:4px;font-size:13px;color:${s.renk};">${u.html}</td></tr></table>`;
}

function dugmeHtml(d: OpDugme, ilk: boolean): string {
  return d.birincil
    ? `<a href="${opKacis(d.href)}" style="display:inline-block;${ilk ? "" : "margin-left:8px;"}background:${OP_DUGME};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:4px;">${opKacis(d.metin)}</a>`
    : `<a href="${opKacis(d.href)}" style="display:inline-block;${ilk ? "" : "margin-left:8px;"}color:${OP_DUGME};text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border:1px solid ${OP_DUGME};border-radius:4px;">${opKacis(d.metin)}</a>`;
}

export function operasyonMailHtml(m: OperasyonMail): string {
  const ust = m.ustEtiket || "UNEX GIDA · İHRACAT OPERASYON";
  const test = m.testMetni
    ? `<tr><td style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:10px 28px;border-bottom:1px solid #FCD34D;">${opKacis(m.testMetni)}</td></tr>`
    : "";
  const hitap = m.hitap ? `<p style="margin:0 0 10px;color:${OP_LACIVERT};font-size:15px;line-height:1.55;">${opKacis(m.hitap)}</p>` : "";
  const giris = m.girisHtml ? `<p style="margin:0 0 14px;color:${OP_LACIVERT};font-size:15px;line-height:1.55;">${m.girisHtml}</p>` : "";
  const bilgi = m.bilgiler && m.bilgiler.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #E2E8F0;border-left:4px solid ${OP_SEFTALI};border-radius:4px;">${m.bilgiler.map(([e, d], i) =>
      `<tr><td style="padding:8px 12px;font-size:12px;color:#64748B;white-space:nowrap;vertical-align:top;width:140px;${i ? "border-top:1px solid #EEF2F7;" : ""}">${opKacis(e)}</td><td style="padding:8px 12px 8px 0;font-size:14px;color:#1E293B;${i ? "border-top:1px solid #EEF2F7;" : ""}">${d}</td></tr>`).join("")}</table>`
    : "";
  const uyari = (m.uyarilar || []).map(opUyariHtml).join("");
  const dugmeler = m.dugmeler && m.dugmeler.length ? `<p style="margin:20px 0 6px;">${m.dugmeler.map((d, i) => dugmeHtml(d, i === 0)).join("\n")}</p>` : "";
  const dugmeNotu = m.dugmeNotuHtml ? `<p style="margin:0 0 6px;color:#8B91A8;font-size:12px;">${m.dugmeNotuHtml}</p>` : "";
  const altNot = m.altNotHtml ? `<p style="margin:14px 0 0;color:#8B91A8;font-size:12px;line-height:1.5;">${m.altNotHtml}</p>` : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;">
<tr><td style="background:${OP_LACIVERT};padding:18px 28px;border-bottom:4px solid ${OP_SEFTALI};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:16px;vertical-align:middle;"><img src="${opKacis(m.site)}/images/logo.png" width="64" height="64" alt="Unex Gıda" style="display:block;border:0;"></td>
<td style="vertical-align:middle;border-left:1px solid rgba(255,255,255,0.18);padding-left:16px;"><p style="margin:0;color:${OP_SEFTALI};font-size:12px;letter-spacing:3px;font-weight:700;">${opKacis(ust)}</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:21px;font-weight:700;">${opKacis(m.baslik)}</p></td>
</tr></table></td></tr>
${test}
<tr><td style="padding:24px 28px;">${hitap}${giris}
${bilgi}${uyari}${dugmeler}
${dugmeNotu}${altNot}</td></tr>
</table></td></tr></table></body></html>`;
}
