/**
 * FATURA TALIMATI MAILI - konu + mail HTML'i. Edge: fatura-onay. SAF: veri yok, ag yok.
 * 11.11.2026: onay akisi ("Incele ve Onayla" -> onaylaninca PDF ekli dagitim maili).
 * 14.11.2026 (kullanici): "Fatura talimatindan sonra Onayla gonder kismini kaldirmaliyiz. Sadece fatura talimati
 *   gonderilsin. Mail metni: Harun Bey merhaba, Fatura talimati ektedir gibi; musteri, konteyner adedi ve varis limani
 *   dosya bilgileriyle. PDF indir butonu eklenecek." Alicilar: export@, execution@, bbt@, operation@, export2@
 *   (Ayarlar > Rapor Alicilari > "Fatura Talimati"; rapor anahtari 'fatura_onay' degismedi).
 *   PDF tarayicida uretilir (lib/fatura-talimati-pdf-builder); mail eki yerine "PDF indir" dugmesi talimat sayfasini
 *   (/fatura-onay?id=..&indir=1) acar, sayfa ayni PDF'i olusturup indirir.
 * Tema: 17.11.2026'dan beri ortak operasyon mail kalibi (operasyon-mail.ts; konsimento talimati ile ayni).
 * 19.11.2026 BIRLESIK FATURA: ozet bir grubu temsil ediyorsa (grupDosyalari) konteynerler gruptaki butun dosyalarindir;
 *   konuya "BİRLEŞİK FATURA (N DOSYA)" eklenir, mailde dosya listesi yazar. PDF sayfasi grubun tek talimatini uretir.
 */
import { RAPOR_URL, esc } from "./rapor-kabugu.ts";
import { operasyonMailHtml } from "./operasyon-mail.ts";

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
export type OnayOzeti = { dosya: OnayDosyasi; rezervasyonlar: OnayRezervasyonu[]; konteynerler: OnayKonteyneri[]; grupDosyalari?: string[] };

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
export function dagitimKonusu(d: OnayDosyasi, konteynerler: OnayKonteyneri[], grupDosyaSayisi = 0): string {
  return `FATURA VE BEYANNAME TALİMATI HAKKINDA // ${buyuk(d.alici_firma || "-")} // ${konteynerOzeti(konteynerler)} // ${limanKisa(d.varis_limani)}${grupDosyaSayisi >= 2 ? ` // BİRLEŞİK FATURA (${grupDosyaSayisi} DOSYA)` : ""}`;
}

/** Talimat sayfasinin baglantisi; indir=1 sayfa acilinca PDF'i kendiliginden indirir. */
export const talimatYolu = (kayitId: string) => `/fatura-onay?id=${encodeURIComponent(kayitId)}&indir=1`;

/**
 * Fatura talimati maili (14.11.2026): "Harun Bey merhaba," + kisa metin + musteri / konteyner adedi / varis limani /
 * dosya no + "Fatura Talimatini Indir (PDF)" dugmesi. Onay / revize YOK.
 * 17.11.2026: ortak operasyon mail kalibi (operasyon-mail.ts; konsimento talimati ve VGM raporu ile ayni tarz).
 */
export function talimatMailiHtml(o: OnayOzeti, kayitId: string, sirketAdi: string): { konu: string; html: string } {
  const d = o.dosya;
  const grup = (o.grupDosyalari || []).length >= 2 ? o.grupDosyalari! : null;
  const konu = dagitimKonusu(d, o.konteynerler, grup?.length || 0);
  const bilgiler: [string, string][] = [
    ["Müşteri", `<b>${esc(d.alici_firma || "-")}</b>`],
    ["Konteyner", `<b>${esc(konteynerOzeti(o.konteynerler))}</b>`],
    ["Varış limanı", esc(d.varis_limani || "-")],
  ];
  if (grup) bilgiler.push(["Birleşik fatura", `<b>${grup.length} dosya tek fatura</b>: ${esc(grup.join(", "))}`]);
  else if (d.dosya_no) bilgiler.push(["Dosya", esc(d.dosya_no)]);
  const html = operasyonMailHtml({
    site: RAPOR_URL,
    ustEtiket: `${(sirketAdi || "Unex Gıda").toLocaleUpperCase("tr-TR")} · İHRACAT OPERASYON`,
    baslik: grup ? "Birleşik fatura talimatı hazır" : "Fatura talimatı hazır",
    hitap: "Harun Bey merhaba,",
    girisHtml: grup
      ? "Aynı müşteri ve aynı gemideki dosyalar için <b>tek fatura</b> talimatı hazırdır. Aşağıdaki düğmeden PDF olarak indirebilirsiniz."
      : "Fatura talimatı hazırdır. Aşağıdaki düğmeden PDF olarak indirebilirsiniz.",
    bilgiler,
    dugmeler: [
      { metin: "Fatura Talimatını İndir (PDF)", href: `${RAPOR_URL}${talimatYolu(kayitId)}`, birincil: true },
      { metin: "Dosyayı aç", href: `${RAPOR_URL}/dosya/${d.id}?tab=evraklar` },
    ],
    altNotHtml: `İndirmek için ${esc(sirketAdi)} İhracat AI hesabınızla giriş yapmanız gerekir. Bu e-posta, dosyanın bütün konteynerleri girildiğinde otomatik gönderilir.`,
  });
  return { konu, html };
}
