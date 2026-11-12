/**
 * MUSTERI DURUM RAPORU (12.11.2026) - SAF: veri yok, ag yok. Edge: musteri-durum-rapor.
 * Kullanici: "Siparisi olan musteriler icin musteri guncel durum raporlari olusturulacak. Ilk once sensei test olarak ilerleyecegiz."
 * Musteriye INGILIZCE gider: kendi siparislerinin durumu (proforma, miktar, konteyner, varis limani, durum, gemi / ETD, B/L).
 * Fiyat, navlun, dosya no, ic notlar YOKTUR. Kaynak: siparis_listesi_veri + yukleme_plani_veri (Siparisler sayfasiyla ayni veri).
 * Musteri = onayli siparisi (on odeme alindi / rezervasyonlu / BL eksik) olan firma. Onay bekleyen proformalari ve son 30 gunde
 * sevk edilenler de ayni raporda gorunur.
 */
import type { PlanSatiri, SiparisDurum, SiparisSatiri } from "./siparis-liste.ts";

export const MD_LACIVERT = "#283474";
export const MD_SEFTALI = "#F4A07C";
export const MD_YESIL = "#10B981";
const URL = "https://ihracatasistanim.com";

const AYLAR_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const tarihEn = (iso: string | null | undefined) => {
  const m = iso ? iso.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]} ${AYLAR_EN[Number(m[2]) - 1]} ${m[1]}` : "";
};
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (v: number | null, ond = 0) => (v === null || !Number.isFinite(v) ? "-" : v.toLocaleString("en-US", { minimumFractionDigits: ond, maximumFractionDigits: ond }));
const gunEkle = (iso: string, gun: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + gun * 86400000).toISOString().slice(0, 10);

/** Musteri anahtari: buyuk harf, tek bosluk (ayni firmanin satirlari birlesir). */
export const musteriAnahtari = (firma: string | null) => (firma || "").replace(/\s+/g, " ").trim().toLocaleUpperCase("en-US");

export type MdSatir = {
  proforma: string | null; tarih: string | null; urun: string | null; mt: number | null; konteyner: number | null; liman: string | null;
  durum: SiparisDurum; durumMetni: string; renk: string; gemi: string | null; etd: string | null; bl: string | null;
};
export type MusteriDurum = { musteri: string; satirlar: MdSatir[]; ozet: { acik: number; konteyner: number; yolda: number } };

const ONAYLI: SiparisDurum[] = ["on_odeme_alindi", "rezervasyonlu", "bl_eksik"];
const SIRA: Record<SiparisDurum, number> = { bl_eksik: 1, rezervasyonlu: 2, on_odeme_alindi: 3, onay_bekliyor: 4, sevk_edildi: 5, iptal: 9 };

function durumMetni(s: SiparisSatiri, gemi: string | null): { metin: string; renk: string } {
  switch (s.durum) {
    case "onay_bekliyor": return { metin: "Awaiting your confirmation and advance payment", renk: "#B45309" };
    case "on_odeme_alindi": return { metin: "Advance payment received · booking in progress", renk: MD_LACIVERT };
    case "rezervasyonlu": return { metin: `Booked${gemi ? ` on ${gemi}` : ""}${s.etd ? ` · ETD ${tarihEn(s.etd)}` : ""}`, renk: MD_LACIVERT };
    case "bl_eksik": return { metin: `Shipped${s.etd ? ` ${tarihEn(s.etd)}` : ""} · B/L in preparation`, renk: "#047857" };
    case "sevk_edildi": return { metin: `Shipped${s.etd ? ` ${tarihEn(s.etd)}` : ""}`, renk: "#047857" };
    default: return { metin: "Cancelled", renk: "#64748B" };
  }
}

export function musteriDurumlari(siparisler: SiparisSatiri[], plan: PlanSatiri[], tarih: string): MusteriDurum[] {
  const gemiler = new Map<string, string>();
  for (const p of plan) if (p.booking_no && p.gemi) gemiler.set(p.booking_no.trim().toUpperCase(), [p.gemi, p.sefer].filter(Boolean).join(" "));
  const sinir = gunEkle(tarih, -30);
  const gruplar = new Map<string, SiparisSatiri[]>();
  for (const s of siparisler) {
    const k = musteriAnahtari(s.firma);
    if (!k) continue;
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k)!.push(s);
  }
  const out: MusteriDurum[] = [];
  gruplar.forEach((liste, musteri) => {
    if (!liste.some((s) => ONAYLI.includes(s.durum))) return;
    const gorunen = liste.filter((s) => s.durum !== "iptal" && (s.durum !== "sevk_edildi" || (!!s.etd && s.etd.slice(0, 10) >= sinir)));
    const satirlar = gorunen.map((s) => {
      const gemi = s.booking_no ? gemiler.get(s.booking_no.trim().toUpperCase()) ?? null : null;
      const d = durumMetni(s, gemi);
      return {
        proforma: s.proforma_no, tarih: s.proforma_tarihi, urun: s.urun, mt: s.miktar_mt, konteyner: s.konteyner, liman: s.liman,
        durum: s.durum, durumMetni: d.metin, renk: d.renk, gemi, etd: s.etd, bl: s.bl_no,
      };
    }).sort((a, b) => SIRA[a.durum] - SIRA[b.durum] || (a.etd || a.tarih || "").localeCompare(b.etd || b.tarih || ""));
    const acik = satirlar.filter((x) => x.durum !== "sevk_edildi");
    out.push({
      musteri, satirlar,
      ozet: { acik: acik.length, konteyner: acik.reduce((t, x) => t + (x.konteyner || 0), 0), yolda: satirlar.filter((x) => x.durum === "bl_eksik" || x.durum === "sevk_edildi").length },
    });
  });
  return out.sort((a, b) => a.musteri.localeCompare(b.musteri, "en"));
}

export function musteriDurumKonusu(m: MusteriDurum, tarih: string, sirketAdi = "UNEX Gıda"): string {
  return `Order Status Update · ${m.musteri} · ${tarihEn(tarih)} · ${sirketAdi}`;
}

export function musteriDurumHtml(m: MusteriDurum, tarih: string, sirketAdi = "UNEX Gıda", test: { alici: string } | null = null): string {
  const th = (ad: string, sag = false) => `<th style="background:${MD_LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px 8px;text-align:${sag ? "right" : "left"};white-space:nowrap">${ad}</th>`;
  const td = (h: string, sag = false) => `<td style="padding:7px 8px;border-bottom:1px solid #EEF2F7;font-size:12.5px;line-height:1.4;color:#1E293B;vertical-align:top;${sag ? "text-align:right;white-space:nowrap;" : ""}">${h}</td>`;
  const satirlar = m.satirlar.map((x, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${[
    td(`<b>${esc(x.proforma || "-")}</b>${x.tarih ? `<div style="font-size:11px;color:#94A3B8">${tarihEn(x.tarih)}</div>` : ""}`),
    td(`${esc(x.urun || "-")}${x.liman ? `<div style="font-size:11px;color:#64748B">to ${esc(x.liman)}</div>` : ""}`),
    td(`${sayi(x.mt)} MT<div style="font-size:11px;color:#64748B">${x.konteyner ? `${x.konteyner} container${x.konteyner > 1 ? "s" : ""}` : ""}</div>`, true),
    td(`<span style="color:${x.renk};font-weight:bold">${esc(x.durumMetni)}</span>${x.bl ? `<div style="font-size:11px;color:#64748B">B/L ${esc(x.bl)}</div>` : ""}`),
  ].join("")}</tr>`).join("");
  const kutu = (etiket: string, deger: string, renk: string) =>
    `<td width="33%" style="padding:4px"><div style="border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#64748B">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${MD_LACIVERT}">${deger}</div></div></td>`;
  const testSeridi = test ? `<div style="margin:0 0 12px;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Bu e-posta yalnızca test adresine gönderildi (${esc(test.alici)}). Canlıda müşterinin kendisine gider.</div>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Order Status Update</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:16px 0"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:6px;padding:22px 24px"><tr><td>
  ${testSeridi}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${MD_LACIVERT};padding-bottom:8px"><tr>
    <td style="width:46px;vertical-align:middle"><img src="${URL}/images/logo.png" width="38" height="38" alt="${esc(sirketAdi)}" style="display:block;width:38px;height:38px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:17px;font-weight:bold;color:${MD_LACIVERT}">Order Status Update</div><div style="font-size:12px;color:#64748B">${esc(sirketAdi)} · Wheat Flour Export</div></td>
    <td style="text-align:right;vertical-align:middle;font-size:13px;font-weight:bold;color:${MD_LACIVERT}">${tarihEn(tarih)}</td>
  </tr></table>
  <p style="margin:16px 0 4px;font-size:14px;color:#1E293B">Dear <b>${esc(m.musteri)}</b> team,</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#334155">Please find below the current status of your orders with ${esc(sirketAdi)}.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px 10px"><tr>
    ${kutu("Open orders", String(m.ozet.acik), MD_LACIVERT)}${kutu("Containers", String(m.ozet.konteyner), MD_SEFTALI)}${kutu("Shipped / on the way", String(m.ozet.yolda), MD_YESIL)}
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Proforma")}${th("Product / Destination")}${th("Quantity", true)}${th("Status")}</tr>${satirlar}</table>
  <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#334155">For any question about your orders, simply reply to this e-mail. Our export team will be glad to assist you.</p>
  <p style="margin:12px 0 0;font-size:13px;color:#334155">Kind regards,<br><b>Export Department</b><br>${esc(sirketAdi)}</p>
  <p style="margin:18px 0 0;font-size:10.5px;color:#94A3B8;line-height:1.5">ETD dates are as advised by the shipping line and may change. This is an automatic status summary; the proforma invoice and shipping documents remain the binding references.</p>
</td></tr></table>
</td></tr></table></body></html>`;
}
