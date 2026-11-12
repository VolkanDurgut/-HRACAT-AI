/**
 * FATURA TALIMATI ONAYI - konu + mail HTML'leri (11.11.2026). Edge: fatura-onay. SAF: veri yok, ag yok.
 * Kullanici: "Butun konteynerler yuklendiginde fatura talimati onaya gonderilmeli; onay veya revize butonlari olmali.
 * Onaylanirsa su kisilere mail gitmeli. Konu: FATURA VE BEYANNAME TALIMATI HAKKINDA // ALICI // 6 * 20 DC // LIMAN.
 * Metin: Merhaba / Fatura ve beyanname icin talimat ekte olup faturanin muhasebe tarafindan isleme alinmasini rica ederim."
 * Tema: lacivert #283474, seftali #F4A07C, yesil #10B981 (acik kurumsal; rapor-kabugu.ts ile ayni dil).
 */
import { RAPOR_LACIVERT, RAPOR_SEFTALI, RAPOR_URL, RAPOR_YESIL, esc } from "./rapor-kabugu.ts";

export type OnayDosyasi = {
  id: string;
  dosya_no: string | null;
  alici_firma: string | null;
  varis_limani: string | null;
  para_birimi: string | null;
  urun_detaylari: unknown;
};
export type OnayRezervasyonu = { konteyner_adedi: number | null; booking_no: string | null; gemi_adi: string | null; gemi_kalkis_tarihi: string | null };
export type OnayKonteyneri = { tip: string | null };

/** Konu ve liman Ingilizce buyuk harf (i -> I; Turkce "İ" uretilmez: "Haifa" -> "HAIFA"). */
const buyuk = (s: string) => s.normalize("NFC").toUpperCase().replace(/\s+/g, " ").trim();

/** "Ashdod, Israel" -> "ASHDOD" */
export function limanKisa(varis: string | null | undefined): string {
  const ilk = String(varis || "").split(/[,(/]/)[0];
  return buyuk(ilk) || "-";
}

/** Konteynerler tipe gore: "6 * 20 DC" / "4 * 20 DC + 2 * 40 HC". Tip yoksa 20DC sayilir. */
export function konteynerOzeti(konteynerler: OnayKonteyneri[]): string {
  const say = new Map<string, number>();
  for (const k of konteynerler) {
    const tip = buyuk(String(k.tip || "20DC")).replace(/\s+/g, "").replace(/^(\d{2})([A-Z]+)$/, "$1 $2");
    say.set(tip, (say.get(tip) || 0) + 1);
  }
  return Array.from(say.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => `${n} * ${t}`).join(" + ") || "-";
}

export function dagitimKonusu(d: OnayDosyasi, konteynerler: OnayKonteyneri[]): string {
  return `FATURA VE BEYANNAME TALİMATI HAKKINDA // ${buyuk(d.alici_firma || "-")} // ${konteynerOzeti(konteynerler)} // ${limanKisa(d.varis_limani)}`;
}

/** Dagitim maili metni - kullanicinin verdigi metin, aynen. */
export const DAGITIM_METNI = ["Merhaba", "", "Fatura ve beyanname için talimat ekte olup faturanın muhasebe tarafından işleme alınmasını rica ederim."];

export function dagitimHtml(): string {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1E293B">
<p style="margin:0 0 14px">Merhaba</p>
<p style="margin:0">Fatura ve beyanname için talimat ekte olup faturanın muhasebe tarafından işleme alınmasını rica ederim.</p>
</body></html>`;
}

type Kalem = { ad: string; mts: number | null; tutar: number | null };
const sayiOku = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export function kalemler(urunDetaylari: unknown): Kalem[] {
  return (Array.isArray(urunDetaylari) ? urunDetaylari : []).map((u) => {
    const x = (u || {}) as Record<string, unknown>;
    const ad = String(x.urun_adi || x.description || "Ürün");
    const amb = x.ambalaj_boyutu || x.packaging_size;
    return { ad: amb ? `${ad} (${amb})` : ad, mts: sayiOku(x.miktar_mts ?? x.quantity), tutar: sayiOku(x.toplam_tutar_usd ?? x.total_amount) };
  });
}

const tr = (n: number, ond = 0) => n.toLocaleString("tr-TR", { minimumFractionDigits: ond, maximumFractionDigits: ond });
const para = (n: number, pb: string | null) => `${tr(n, 2)} ${pb || "USD"}`;
const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

function kabuk(baslik: string, ust: string, govde: string): string {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(baslik)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:16px 0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:6px;padding:20px 22px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${RAPOR_LACIVERT};padding-bottom:8px"><tr>
    <td style="width:46px;vertical-align:middle"><img src="${RAPOR_URL}/images/logo.png" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:17px;font-weight:bold;color:${RAPOR_LACIVERT}">${esc(baslik)}</div><div style="font-size:11px;color:#94A3B8">${esc(ust)}</div></td>
  </tr></table>
  ${govde}
</td></tr></table>
</td></tr></table></body></html>`;
}

const satir = (etiket: string, deger: string) =>
  `<tr><td style="padding:5px 10px 5px 0;font-size:12px;color:#64748B;white-space:nowrap;vertical-align:top;width:130px">${etiket}</td><td style="padding:5px 0;font-size:13px;color:#1E293B">${deger}</td></tr>`;

export type OnayOzeti = { dosya: OnayDosyasi; rezervasyonlar: OnayRezervasyonu[]; konteynerler: OnayKonteyneri[] };

function ozetTablosu(o: OnayOzeti): string {
  const d = o.dosya;
  const k = kalemler(d.urun_detaylari);
  const toplam = k.reduce((t, x) => t + (x.tutar || 0), 0);
  const rez = o.rezervasyonlar;
  const etd = rez.map((r) => r.gemi_kalkis_tarihi).filter(Boolean).sort()[0] || null;
  const urunler = k.map((x) => `${esc(x.ad)}${x.mts !== null ? ` · ${tr(x.mts, 3).replace(/,?0+$/, "")} MTS` : ""}`).join("<br>") || "-";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid #EEF2F7">
${satir("Dosya", esc(d.dosya_no || "-"))}
${satir("Alıcı", `<b>${esc(d.alici_firma || "-")}</b>`)}
${satir("Varış limanı", esc(d.varis_limani || "-"))}
${satir("Konteyner", `<b>${esc(konteynerOzeti(o.konteynerler))}</b> · hepsi yüklendi`)}
${satir("Booking / Gemi", esc([rez.map((r) => r.booking_no).filter(Boolean).join(", "), rez.map((r) => r.gemi_adi).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "-"))}
${etd ? satir("ETD", esc(trTarih(etd))) : ""}
${satir("Ürünler", urunler)}
${toplam > 0 ? satir("Toplam", `<b>${esc(para(toplam, d.para_birimi))}</b>`) : ""}
</table>`;
}

const dugme = (metin: string, yol: string, ana: boolean) =>
  `<a href="${RAPOR_URL}${yol}" style="display:inline-block;${ana ? `background:${RAPOR_YESIL};color:#fff;border:1px solid ${RAPOR_YESIL}` : `background:#fff;color:${RAPOR_LACIVERT};border:1px solid #CBD5E1`};text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:5px;margin-right:8px">${esc(metin)}</a>`;

/** Onay grubuna giden mail: ozet + "Incele ve Onayla" / "Revize iste". Talimatin PDF'i onay sayfasinda. */
export function onayMailiHtml(o: OnayOzeti, onayId: string, sirketAdi: string): { konu: string; html: string } {
  const d = o.dosya;
  const konu = `Fatura talimatı onayınızı bekliyor · ${d.alici_firma || "-"} · ${konteynerOzeti(o.konteynerler)} · ${limanKisa(d.varis_limani)}${d.dosya_no ? ` · ${d.dosya_no}` : ""}`;
  const yol = `/fatura-onay?id=${encodeURIComponent(onayId)}`;
  const govde = `
  <div style="margin-top:14px;border:1px solid #E2E8F0;border-left:4px solid ${RAPOR_SEFTALI};border-radius:4px;padding:10px 14px;font-size:13px;line-height:1.5;color:#1E293B">
    Bu dosyanın bütün konteynerleri yüklendi. Fatura talimatını inceleyip <b>onaylayın</b> ya da <b>revize isteyin</b>.
    Onaylandığında talimat PDF olarak muhasebe dahil dağıtım listesine gider.
  </div>
  ${ozetTablosu(o)}
  <div style="margin-top:16px">${dugme("İncele ve Onayla", yol, true)}${dugme("Revize iste", `${yol}&revize=1`, false)}</div>
  <div style="margin-top:14px;font-size:11px;color:#94A3B8;line-height:1.5">Talimatın tamamı (PDF) onay sayfasında görünür. Onay için ${esc(sirketAdi)} hesabınızla giriş yapmanız gerekir.</div>`;
  return { konu, html: kabuk("Fatura Talimatı Onayı", `${sirketAdi} · İhracat Yönetim`, govde) };
}

/** Revize istendiginde onay grubuna bilgi maili. */
export function revizeMailiHtml(o: OnayOzeti, onayId: string, sirketAdi: string, kim: string, not: string): { konu: string; html: string } {
  const d = o.dosya;
  const konu = `REVİZE İSTENDİ · Fatura talimatı · ${d.alici_firma || "-"} · ${limanKisa(d.varis_limani)}${d.dosya_no ? ` · ${d.dosya_no}` : ""}`;
  const govde = `
  <div style="margin-top:14px;border:1px solid #FDE68A;border-left:4px solid #F59E0B;border-radius:4px;padding:10px 14px;background:#FFFBEB">
    <div style="font-size:13px;font-weight:bold;color:#92400E">Revize notu · ${esc(kim)}</div>
    <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#1E293B;white-space:pre-wrap">${esc(not)}</div>
  </div>
  ${ozetTablosu(o)}
  <div style="margin-top:16px">${dugme("Dosyayı aç", `/dosya/${encodeURIComponent(d.id)}?tab=konteynerler`, true)}</div>
  <div style="margin-top:14px;font-size:11px;color:#94A3B8;line-height:1.5">Düzeltmeden sonra dosyanın Konteynerler sekmesinden "Tekrar onaya gönder" deyin. Kayıt: ${esc(onayId.slice(0, 8))}</div>`;
  return { konu, html: kabuk("Fatura Talimatı · Revize", `${sirketAdi} · İhracat Yönetim`, govde) };
}
