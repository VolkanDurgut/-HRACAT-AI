// ============================================================================
// KONSIMENTO TALIMATI HATIRLATMASI - mail sablonu (27.10.2026)
// ============================================================================
// SAF TypeScript (Deno/Next bagimliligi yok): edge function "konsimento-hatirlatma"
// maili uretir; uygulama (konsimento-talimati-section) alici sabitlerini okur.
// 27.10-04.11.2026 arasi mail talimat alanlarini da iceriyordu (khOzet hesabi duruyor; uygulama
// ve ileride gerekirse kullanilir). FIYAT BILGISI YOK.
// 05.11.2026: mail SADECE hatirlatma (dosya no + alici + konteyner sayisi + cut-off + uygulama dugmesi);
// talimat alanlari (rezervasyon, taraflar, mal, konteyner) maile YAZILMAZ - kullanici karari.
// 06.11.2026: talimat sistem verisinden OLUSTURULUR (uygulama, lib/konsimento/talimat-pdf.ts); mailde
// "Talimati Gor" -> /belge/konsimento?d=<dosya> (oturum gerekir; acente sablonuna gore PDF + indir).
// MSC (talimat MSC web sitesinden girilir): talimat olusturulmaz, mail SADECE hatirlatma.
// ============================================================================

import { ambalajTurkce, navlunAliciyaAitMi } from "./ihracat-ortak.ts";
import { KH_SITE } from "./konsimento-hatirlatma-sabitler.ts";
import { konsimentoSablonuBul, KONSIMENTO_SABLON_ADI } from "./konsimento-sablon.ts";
import { operasyonMailHtml, type OpUyari } from "./operasyon-mail.ts";
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
const benzersiz = (d: (string | null | undefined)[]) => Array.from(new Set(d.map((x) => (x || "").trim()).filter(Boolean)));

/**
 * Cut-off (talimat_cutoff) YEREL saattir ama UTC etiketiyle saklanir (lib/cutoff-utils.ts
 * formatCutoffSaat ile ayni kural). Saat dilimi cevrilmeden HAM okunur: "...T10:00:00Z" -> "05.11.2026 10:00".
 * 05.11.2026 duzeltme: onceki toLocaleString(Europe/Istanbul) +3 saat gosteriyordu (10:00 -> 13:00).
 */
function cutoffYazi(ham: string | null | undefined): string {
  const m = (ham || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : "";
}
/** Ham yerel cut-off'un gercek ani: UTC etiketli deger - 3 saat (Turkiye UTC+3, yaz saati yok). */
function cutoffAni(ham: string): number {
  const t = new Date(ham).getTime();
  return Number.isNaN(t) ? NaN : t - 3 * 3600_000;
}

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
export function khMail(v: KhVeri, secenek: { test: boolean; gercekAlici: string; gercekCc: string[]; tetik: "otomatik" | "elle"; isteyen?: string | null }): { konu: string; html: string } {
  // 05.11.2026 SADELESTIRME. Kullanici: "Konteynerlerin hepsi alindiginda konsimento talimati SADECE
  // HATIRLATMA gecmeli. Dosya bilgisi vermemeli." Rezervasyon / taraflar / mal / konteyner tablosu /
  // dosya-proforma-lot-beyanname bloklari KALDIRILDI. Kalan: hangi dosya (no + alici), konteyner
  // sayisi, talimat cut-off ve "Dosyayi uygulamada ac". Bilgiler uygulamada (Evraklar sekmesi).
  const o = khOzet(v);
  const rez = v.rezervasyonlar || [];
  const kont = v.konteynerler || [];
  const cutoffler = rez.map((r) => r.talimat_cutoff).filter(Boolean) as string[];
  const enYakinCutoff = cutoffler.sort()[0] || null;
  const cutoffGecti = enYakinCutoff ? cutoffAni(enYakinCutoff) < Date.now() : false;

  const sablon = konsimentoSablonuBul(rez[0]?.acente_ismi).sablon;
  const msc = sablon === "msc_web";
  const tarafEksik = !(v.consignee || "").trim() || !(v.notify || []).some((n) => (n || "").trim());
  const konu = msc
    ? `${secenek.test ? "[TEST] " : ""}Hatırlatma: konşimento talimatı (MSC web) · ${v.dosya_no || "-"} · ${v.alici_firma || "-"}`
    : `${secenek.test ? "[TEST] " : ""}Konşimento talimatı hazır · ${v.dosya_no || "-"} · ${v.alici_firma || "-"}`;

  // 17.11.2026: ortak operasyon mail kalibi (operasyon-mail.ts; fatura talimati ve VGM raporu ayni kalip)
  const girisHtml = `<b>${kacis(v.dosya_no)}</b>${v.alici_firma ? ` · ${kacis(v.alici_firma)}` : ""} dosyasının tüm konteynerleri sisteme girildi (<b>${kont.length}/${o.rezAdedi}</b>). ${msc
    ? "Acente <b>MSC</b>: konşimento talimatını <b>MSC web sitesinden</b> giriniz."
    : `Konşimento talimatı sistem bilgileriyle oluşturuldu (<b>${kacis(KONSIMENTO_SABLON_ADI[sablon])}</b>). Kontrol edip acenteye iletebilirsiniz.`}`;
  const uyarilar: OpUyari[] = [];
  if (!msc && tarafEksik) uyarilar.push({ ton: "amber", html: "<b>Consignee / notify eksik.</b> Talimatı göndermeden önce dosyanın Konşimento Talimatı kartından tamamlayın." });
  if (enYakinCutoff) uyarilar.push({ ton: cutoffGecti ? "kirmizi" : "amber", html: `<b>Talimat son tarihi (cut-off):</b> ${kacis(cutoffYazi(enYakinCutoff))}${cutoffGecti ? " · <b>SÜRE GEÇTİ</b>" : ""}` });

  const adres = `${KH_SITE}/dosya/${v.dosya_id}?tab=evraklar`;
  const talimatAdres = `${KH_SITE}/belge/konsimento?d=${v.dosya_id}`;
  const html = operasyonMailHtml({
    site: KH_SITE,
    baslik: msc ? "Hatırlatma · Konşimento talimatı" : "Konşimento talimatı hazır",
    testMetni: secenek.test ? `TEST · Bu e-posta yalnızca test adresine gönderildi. Canlıda alıcı: ${secenek.gercekAlici} · CC: ${secenek.gercekCc.join(", ")}` : null,
    girisHtml,
    uyarilar,
    dugmeler: msc
      ? [{ metin: "Dosyayı uygulamada aç", href: adres, birincil: true }]
      : [{ metin: "Talimatı Gör", href: talimatAdres, birincil: true }, { metin: "Dosyayı aç", href: adres }],
    dugmeNotuHtml: msc ? null : "Talimat, açıldığı anda sistemdeki güncel bilgilerle oluşturulur; sayfadan indirilebilir.",
    altNotHtml: `Bu hatırlatma UNEX-AI tarafından ${secenek.tetik === "elle" ? `${kacis(secenek.isteyen || "bir kullanıcı")} isteğiyle` : "son konteyner girildiğinde otomatik olarak"} gönderildi. Konşimento talimatı yüklendiğinde dosyada uyum kontrolü otomatik yapılır.`,
  });
  return { konu, html };
}
