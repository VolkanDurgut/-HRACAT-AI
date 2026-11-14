/**
 * FATURA TALIMATI MAILI - konu + mail HTML'i. Edge: fatura-onay. SAF: veri yok, ag yok.
 * 11.11.2026: onay akisi ("Incele ve Onayla" -> onaylaninca PDF ekli dagitim maili).
 * 14.11.2026 (kullanici): "Fatura talimatindan sonra Onayla gonder kismini kaldirmaliyiz. Sadece fatura talimati
 *   gonderilsin. Mail metni: Harun Bey merhaba, Fatura talimati ektedir gibi; musteri, konteyner adedi ve varis limani
 *   dosya bilgileriyle. PDF indir butonu eklenecek." Alicilar: export@, execution@, bbt@, operation@, export2@
 *   (Ayarlar > Rapor Alicilari > "Fatura Talimati"; rapor anahtari 'fatura_onay' degismedi).
 *   PDF tarayicida uretilir (lib/fatura-talimati-pdf-builder); mail eki yerine "PDF indir" dugmesi talimat sayfasini
 *   (/fatura-onay?id=..&indir=1) acar, sayfa ayni PDF'i olusturup indirir.
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
export type OnayOzeti = { dosya: OnayDosyasi; rezervasyonlar: OnayRezervasyonu[]; konteynerler: OnayKonteyneri[] };

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

/** Mail konusu (11.11.2026 kullanicinin verdigi kalip): FATURA VE BEYANNAME TALIMATI HAKKINDA // ALICI // 6 * 20 DC // LIMAN */
export function dagitimKonusu(d: OnayDosyasi, konteynerler: OnayKonteyneri[]): string {
  return `FATURA VE BEYANNAME TALİMATI HAKKINDA // ${buyuk(d.alici_firma || "-")} // ${konteynerOzeti(konteynerler)} // ${limanKisa(d.varis_limani)}`;
}

/** Talimat sayfasinin baglantisi; indir=1 sayfa acilinca PDF'i kendiliginden indirir. */
export const talimatYolu = (kayitId: string) => `/fatura-onay?id=${encodeURIComponent(kayitId)}&indir=1`;

const satir = (etiket: string, deger: string) =>
  `<tr><td style="padding:6px 12px 6px 0;font-size:12px;color:#64748B;white-space:nowrap;vertical-align:top;width:120px;border-bottom:1px solid #EEF2F7">${etiket}</td><td style="padding:6px 0;font-size:13px;color:#1E293B;border-bottom:1px solid #EEF2F7">${deger}</td></tr>`;

/**
 * Fatura talimati maili (14.11.2026): "Harun Bey merhaba," + kisa metin + musteri / konteyner adedi / varis limani /
 * dosya no + "Fatura Talimatini Indir (PDF)" dugmesi. Onay / revize YOK.
 */
export function talimatMailiHtml(o: OnayOzeti, kayitId: string, sirketAdi: string): { konu: string; html: string } {
  const d = o.dosya;
  const konu = dagitimKonusu(d, o.konteynerler);
  const yol = talimatYolu(kayitId);
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:16px 0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:6px;padding:20px 22px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${RAPOR_LACIVERT};padding-bottom:8px"><tr>
    <td style="width:46px;vertical-align:middle"><img src="${RAPOR_URL}/images/logo.png" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:17px;font-weight:bold;color:${RAPOR_LACIVERT}">Fatura Talimatı</div><div style="font-size:11px;color:#94A3B8">${esc(sirketAdi)} · İhracat Yönetim</div></td>
  </tr></table>
  <p style="margin:18px 0 6px;font-size:14px;line-height:1.6;color:#1E293B">Harun Bey merhaba,</p>
  <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#1E293B">Fatura talimatı hazırdır. Aşağıdaki düğmeden PDF olarak indirebilirsiniz.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-left:4px solid ${RAPOR_SEFTALI};border-radius:4px;padding:4px 14px">
    ${satir("Müşteri", `<b>${esc(d.alici_firma || "-")}</b>`)}
    ${satir("Konteyner", `<b>${esc(konteynerOzeti(o.konteynerler))}</b>`)}
    ${satir("Varış limanı", esc(d.varis_limani || "-"))}
    ${d.dosya_no ? satir("Dosya", esc(d.dosya_no)) : ""}
  </table>
  <div style="margin-top:18px">
    <a href="${RAPOR_URL}${yol}" style="display:inline-block;background:${RAPOR_YESIL};color:#fff;border:1px solid ${RAPOR_YESIL};text-decoration:none;font-size:14px;font-weight:bold;padding:11px 22px;border-radius:5px">Fatura Talimatını İndir (PDF)</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;line-height:1.5">İndirmek için ${esc(sirketAdi)} İhracat AI hesabınızla giriş yapmanız gerekir. Bu e-posta, dosyanın bütün konteynerleri girildiğinde otomatik gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
  return { konu, html };
}
