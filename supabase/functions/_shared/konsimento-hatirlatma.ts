// ============================================================================
// KONSIMENTO TALIMATI HATIRLATMASI - mail sablonu (27.10.2026)
// ============================================================================
// SAF TypeScript (Deno/Next bagimliligi yok): edge function "konsimento-hatirlatma"
// maili uretir; uygulama (konsimento-talimati-section) alici sabitlerini okur.
// Icerik, kullanicinin verdigi iki konsimento talimati ornegindeki (AKKON
// AKKIST26050686, HAPAG/CRISA 37983286) alanlarla eslesir; personel talimati
// doldururken excel'e bakmadan bu maili kullanir. FIYAT BILGISI YOK.
// ============================================================================

import { ambalajTurkce, navlunAliciyaAitMi } from "./ihracat-ortak.ts";
import { KH_SITE } from "./konsimento-hatirlatma-sabitler.ts";
export * from "./konsimento-hatirlatma-sabitler.ts";

/** Talimattaki YUKLEYICI (shipper) blogu - kullanicinin ornek formlarindan, sabit. */
export const KH_SHIPPER = [
  "UNEX GIDA SAN. VE TIC. LTD. STI.",
  "İstiklal Mah. Cemal Ünlü Saraç Cad. No:20",
  "Süleymanpaşa / TEKİRDAĞ",
  "Vergi No: 8920645297 · Vergi Dairesi: Süleymanpaşa",
  "Tel: +90 533 592 16 89 · info@unex.com.tr · www.unex.com.tr",
].join("\n");
/** Unex yalnizca bugday unu ihrac eder (sigorta talimatindaki sabit "BUĞDAY UNU" ile ayni karar). */
export const KH_MAL_TR = "BUĞDAY UNU";
export const KH_MAL_EN = "WHEAT FLOUR";
export const KH_GTIP = "11010015";

export type KhRezervasyon = {
  booking_no: string | null; acente_ismi: string | null; gemi_adi: string | null; sefer_no: string | null;
  yuklenme_limani: string | null; talimat_cutoff: string | null; gemi_kalkis_tarihi: string | null; konteyner_adedi: number | null;
};
export type KhKonteyner = {
  konteyner_no: string; tip: string | null; muhur_no: string | null; pieces: number | null;
  net_agirlik_kg: number | string | null; brut_agirlik_kg: number | string | null;
};
export type KhVeri = {
  dosya_id: string; dosya_no: string | null; proforma_no: string | null; lot_no: string | null; marka: string | null;
  alici_firma: string | null; alici_adresi: string | null; consignee: string | null; notify: string[] | null;
  detayli_ambalaj: string | null; ambalaj: string | null; teslim_sekli: string | null;
  varis_limani: string | null; yuklenme_limani: string | null; beyanname_no: string | null; sirket: string | null;
  rezervasyonlar: KhRezervasyon[]; konteynerler: KhKonteyner[];
};

const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (n: number, ondalik = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const benzersiz = (d: (string | null | undefined)[]) => [...new Set(d.map((x) => (x || "").trim()).filter(Boolean))];

function trTarihSaat(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** "20DC" -> "20 DC" */
const konteynerTipi = (t: string | null) => (t || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^(\d+)([A-Z].*)$/, "$1 $2");

/** Mail ve uygulama ayni hesabi kullanir. */
export function khOzet(v: KhVeri) {
  const k = v.konteynerler || [];
  const toplamKap = k.reduce((s, x) => s + num(x.pieces), 0);
  const toplamNet = k.reduce((s, x) => s + num(x.net_agirlik_kg), 0);
  const toplamBrut = k.reduce((s, x) => s + num(x.brut_agirlik_kg), 0);
  const rezAdedi = (v.rezervasyonlar || []).reduce((s, r) => s + num(r.konteyner_adedi), 0);
  const consignee = (v.consignee || "").trim() || [v.alici_firma, v.alici_adresi].filter((x) => (x || "").trim()).join("\n");
  const notify = benzersiz(v.notify || []);
  const navlun = navlunAliciyaAitMi(v.teslim_sekli) ? "COLLECT" : "PREPAID";
  const ambalajEn = (v.detayli_ambalaj || "").trim().toUpperCase()
    || [toplamKap ? `${sayi(toplamKap)} PIECES OF` : null, (v.ambalaj || "").trim().toUpperCase()].filter(Boolean).join(" ");
  const ambalajTr = (v.detayli_ambalaj || "").trim()
    ? ambalajTurkce(v.detayli_ambalaj)
    : [toplamKap ? `${sayi(toplamKap)} ADET` : null, ambalajTurkce(v.ambalaj)].filter(Boolean).join(" ");
  return { toplamKap, toplamNet, toplamBrut, rezAdedi, consignee, consigneeKaynak: (v.consignee || "").trim() ? "dosya" : "proforma", notify, navlun, ambalajEn, ambalajTr };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const LACIVERT = "#1B2352";
const SEFTALI = "#F4A07C";
const SOLUK = "#6B7290";
const CIZGI = "#E3E1DA";

const bolumBasligi = (b: string) => `<p style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${SEFTALI};padding-left:8px;">${kacis(b)}</p>`;

function alanTablosu(satirlar: [string, string, string?][]): string {
  const dolu = satirlar.filter(([, v]) => v && v.trim());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${CIZGI};">${dolu
    .map(([k, v, not]) => `<tr><td style="width:36%;padding:8px 10px;border-bottom:1px solid ${CIZGI};background:#F7F6F2;color:${SOLUK};font-size:12px;font-weight:700;vertical-align:top;">${kacis(k)}</td><td style="padding:8px 10px;border-bottom:1px solid ${CIZGI};color:#1E293B;font-size:13px;vertical-align:top;white-space:pre-line;">${kacis(v)}${not ? `<div style="margin-top:3px;color:#B45309;font-size:11px;white-space:normal;">${kacis(not)}</div>` : ""}</td></tr>`)
    .join("")}</table>`;
}

const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:7px 8px;text-align:${sag ? "right" : "left"};white-space:nowrap;">${t}</th>`;
const td = (t: string, ek = "") => `<td style="padding:7px 8px;border-bottom:1px solid ${CIZGI};font-size:13px;color:#1E293B;${ek}">${t}</td>`;

export function khMail(v: KhVeri, secenek: { test: boolean; gercekAlici: string; gercekCc: string[]; tetik: "otomatik" | "elle"; isteyen?: string | null }): { konu: string; html: string } {
  const o = khOzet(v);
  const rez = v.rezervasyonlar || [];
  const kont = v.konteynerler || [];
  const bookingler = benzersiz(rez.map((r) => r.booking_no));
  const gemiSefer = benzersiz(rez.map((r) => [r.gemi_adi, r.sefer_no].filter(Boolean).join(" ")));
  const acenteler = benzersiz(rez.map((r) => r.acente_ismi));
  const yukleme = benzersiz(rez.map((r) => r.yuklenme_limani)).join(" / ") || (v.yuklenme_limani || "");
  const cutoffler = rez.map((r) => r.talimat_cutoff).filter(Boolean) as string[];
  const enYakinCutoff = cutoffler.sort()[0] || null;
  const cutoffGecti = enYakinCutoff ? new Date(enYakinCutoff).getTime() < Date.now() : false;

  const konu = `${secenek.test ? "[TEST] " : ""}Konşimento talimatı gönderilebilir · ${v.dosya_no || "-"} · ${v.alici_firma || "-"} · ${kont.length} konteyner`;

  const testSeridi = secenek.test
    ? `<tr><td style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:10px 28px;border-bottom:1px solid #FCD34D;">TEST · Bu e-posta yalnızca test adresine gönderildi. Canlıda alıcı: ${kacis(secenek.gercekAlici)} · CC: ${kacis(secenek.gercekCc.join(", "))}</td></tr>`
    : "";

  const giris = `<p style="margin:0 0 14px;color:${LACIVERT};font-size:15px;line-height:1.55;"><b>${kacis(v.dosya_no)}</b> dosyasının tüm konteynerleri sisteme girildi (<b>${kont.length}/${o.rezAdedi}</b>). Konşimento talimatının acenteye iletilmesine engel bir durum kalmamıştır. Talimat için gereken bilgiler aşağıdadır.</p>`
    + (enYakinCutoff
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;"><tr><td style="padding:9px 14px;border:1px solid ${cutoffGecti ? "#FCA5A5" : "#FCD34D"};background:${cutoffGecti ? "#FEF2F2" : "#FFFBEB"};border-radius:4px;font-size:13px;color:${cutoffGecti ? "#B91C1C" : "#92400E"};"><b>Talimat son tarihi (cut-off):</b> ${kacis(trTarihSaat(enYakinCutoff))}${cutoffGecti ? " · <b>SÜRE GEÇTİ</b>" : ""}</td></tr></table>`
      : "");

  const rezervasyon = alanTablosu([
    ["Booking (konşimento) no", bookingler.join(" / ")],
    ["Acente", acenteler.join(" / ")],
    ["Gemi / sefer", gemiSefer.join(" / ")],
    ["Yükleme limanı", yukleme],
    ["Tahliye limanı", v.varis_limani || ""],
    ["Navlun", `${o.navlun}${v.teslim_sekli ? ` (teslim şekli: ${v.teslim_sekli})` : ""}`],
  ]);

  const taraflar = alanTablosu([
    ["Yükleyici (shipper)", KH_SHIPPER],
    ["Alıcı (consignee)", o.consignee || "—", !o.consignee ? "Dosyada alıcı bilgisi yok; proformayı kontrol edin." : o.consigneeKaynak === "proforma" ? "Dosyada ayrı consignee yok; proformadaki alıcı yazıldı, teyit edin." : undefined],
    ["İhbar (notify)", o.notify.length ? o.notify.join("\n\n") : "Alıcı ile aynı", o.notify.length ? undefined : "Dosyada ayrı notify yok; teyit edin."],
  ]);

  const mal = alanTablosu([
    ["Mal tanımı (Türkçe)", [KH_MAL_TR, o.ambalajTr, o.toplamNet || o.toplamBrut ? `NET: ${sayi(o.toplamNet)} KG  BRÜT: ${sayi(o.toplamBrut)} KG` : ""].filter(Boolean).join("\n")],
    ["Description of goods", [KH_MAL_EN, o.ambalajEn, o.toplamNet || o.toplamBrut ? `NET WEIGHT: ${sayi(o.toplamNet)} KGS  GROSS WEIGHT: ${sayi(o.toplamBrut)} KGS` : ""].filter(Boolean).join("\n")],
    ["HS code / GTİP", KH_GTIP],
    ["Kap adedi ve cinsi", [o.ambalajEn, o.toplamKap ? `TOTAL ${sayi(o.toplamKap)} PIECES` : ""].filter(Boolean).join("\n")],
    ["Brüt ağırlık", o.toplamBrut ? `${sayi(o.toplamBrut)} KGS` : ""],
    ["Marka", v.marka || ""],
  ]);

  const konteynerTablosu = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr>${th("#")}${th("Konteyner no")}${th("Tip")}${th("Mühür no")}${th("Kap", true)}${th("Net (kg)", true)}${th("Brüt (kg)", true)}</tr>
${kont.map((k, i) => `<tr>${td(String(i + 1), `color:${SOLUK};`)}${td(`<b style="font-family:Consolas,Menlo,monospace;">${kacis(k.konteyner_no)}</b>`)}${td(kacis(konteynerTipi(k.tip)), "white-space:nowrap;")}${td(kacis(k.muhur_no || "-"), "font-family:Consolas,Menlo,monospace;")}${td(k.pieces ? sayi(num(k.pieces)) : "-", "text-align:right;")}${td(num(k.net_agirlik_kg) ? sayi(num(k.net_agirlik_kg)) : "-", "text-align:right;")}${td(num(k.brut_agirlik_kg) ? sayi(num(k.brut_agirlik_kg)) : "-", "text-align:right;")}</tr>`).join("")}
<tr>${td("", "border-bottom:0;")}${td("<b>TOPLAM</b>", "border-bottom:0;")}${td(`<b>${kont.length} konteyner</b>`, "border-bottom:0;white-space:nowrap;")}${td("", "border-bottom:0;")}${td(`<b>${sayi(o.toplamKap)}</b>`, "text-align:right;border-bottom:0;")}${td(`<b>${sayi(o.toplamNet)}</b>`, "text-align:right;border-bottom:0;")}${td(`<b>${sayi(o.toplamBrut)}</b>`, "text-align:right;border-bottom:0;")}</tr></table>`;

  const diger = alanTablosu([
    ["Dosya no", v.dosya_no || ""],
    ["Proforma no", v.proforma_no || ""],
    ["Lot no", v.lot_no || ""],
    ["Beyanname no", v.beyanname_no || "Henüz girilmedi"],
  ]);

  const eksikNot = `<p style="margin:14px 0 0;padding:9px 12px;background:#F7F6F2;border-radius:4px;color:${SOLUK};font-size:12px;line-height:1.5;"><b style="color:${LACIVERT};">Talimatta ayrıca kontrol edilecek:</b> konşimento adedi (orijinal / kopya), özel ibareler, gümrük müşaviri bilgileri ve acentenin formuna özel alanlar.</p>`;

  const adres = `${KH_SITE}/dosya/${v.dosya_id}?tab=evraklar`;
  const dugme = `<p style="margin:20px 0 6px;"><a href="${kacis(adres)}" style="display:inline-block;background:#283474;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:4px;">Dosyayı uygulamada aç</a></p>
<p style="margin:0 0 6px;color:#8B91A8;font-size:12px;">Düğme çalışmazsa: ${kacis(adres)}</p>`;

  const altNot = `<p style="margin:14px 0 0;color:#8B91A8;font-size:12px;line-height:1.5;">Bu e-posta İhracat AI tarafından ${secenek.tetik === "elle" ? `${kacis(secenek.isteyen || "bir kullanıcı")} isteğiyle` : "son konteyner girildiğinde otomatik olarak"} gönderildi. Konşimento talimatı yüklendiğinde dosyada uyum kontrolü otomatik yapılır.</p>`;

  const govde = `${giris}
${bolumBasligi("Rezervasyon")}${rezervasyon}
${bolumBasligi("Taraflar")}${taraflar}
${bolumBasligi("Mal bilgileri")}${mal}
${bolumBasligi(`Konteynerler (${kont.length})`)}${konteynerTablosu}
${bolumBasligi("Dosya")}${diger}
${eksikNot}
${dugme}
${altNot}`;

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;">
<tr><td style="background:${LACIVERT};padding:18px 28px;border-bottom:4px solid ${SEFTALI};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:16px;vertical-align:middle;"><img src="${KH_SITE}/images/logo.png" width="64" height="64" alt="Unex Gıda" style="display:block;border:0;"></td>
<td style="vertical-align:middle;border-left:1px solid rgba(255,255,255,0.18);padding-left:16px;"><p style="margin:0;color:${SEFTALI};font-size:12px;letter-spacing:3px;font-weight:700;">UNEX GIDA · İHRACAT OPERASYON</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:21px;font-weight:700;">Konşimento talimatı gönderilebilir</p></td>
</tr></table></td></tr>
${testSeridi}
<tr><td style="padding:24px 28px;">${govde}</td></tr>
</table></td></tr></table></body></html>`;
  return { konu, html };
}
