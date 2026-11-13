// NAVLUN BILDIRIMI - alintidan teklif kurtarma (13.11.2026). SAF: veri yok, ag yok.
//
// Sorun (13.11.2026, kullanici: "Bu navlun teklifi cekilmemis; bir daha yasanmasin"): acentenin teklif maili arsive hic
// ulasmamissa (arsiv kapsami oncesi, CC'siz gonderim, iletim hatasi) sistem o teklifi goremiyordu. Ayni teklif cogu zaman
// sonraki yazismalarda ALINTI olarak durur ("From: ... Sent: ... Subject: ..."). Okuyucu alintiyi bilerek keser (eski
// teklif iki kez sayilmasin diye); bu dosya alintidaki her mesaji kendi gonderen + tarihiyle ayri mesaj olarak cikarir.
// Edge (navlun-bildirimi) bunlari "alinti:<ozet>" kimligiyle, dogrudan gelmis asli YOKSA kaydeder.
//
// Desteklenen basliklar:
//   Outlook EN : From: Ad <e-posta> / Sent: Friday, October 9, 2026 10:23 AM / To / Cc / Subject
//   Outlook TR : Kimden: / Gönderildi: 3 Kasım 2026 Salı 15:30 / Kime / Bilgi / Konu
//                Gönderen: / Gönderilmiş: 12.11.2026 13:26 / Alıcı / Konu
//   Gmail      : "9 Kas 2026 Pzt, 18:19 tarihinde Ad <e-posta> şunu yazdı:" / "On ..., Ad <e-posta> wrote:" (> alinti)
// Tarih saat dilimi: Istanbul (+03:00) kabul edilir (yazismalarin tamami Turkiye ofislerinden).
// Not: Bu dosya gercek musteri/acente verisi icermez.

export type AlintiMesaji = { gonderen: string; tarih: string; konu: string | null; govde: string };

const AYLAR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  oca: 1, şub: 2, sub: 2, nis: 4, haz: 6, tem: 7, ağu: 8, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12,
};
const ayNo = (s: string): number | null => {
  const k = s.toLocaleLowerCase("tr-TR").slice(0, 3);
  return AYLAR[k] ?? (k === "mar" ? 3 : k === "may" ? 5 : null);
};
const iki = (n: number) => String(n).padStart(2, "0");

/** Baslik tarihini ISO'ya cevirir (Istanbul saati). Okunamazsa null. */
export function alintiTarihi(ham: string): string | null {
  const s = ham.replace(/\s+/g, " ").trim();
  const yap = (y: number, a: number | null, g: number, sa = 0, dk = 0, ogle?: string): string | null => {
    if (!a || a < 1 || a > 12 || g < 1 || g > 31 || y < 2000 || y > 2100) return null;
    let h = sa;
    if (ogle) { const pm = /p/i.test(ogle); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    if (h > 23 || dk > 59) return null;
    return `${y}-${iki(a)}-${iki(g)}T${iki(h)}:${iki(dk)}:00+03:00`;
  };
  // "October 9, 2026 10:23 AM" / "Nov 9, 2026 at 6:19 PM"
  let m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]\.?M\.?)?)?/i);
  if (m && ayNo(m[1])) return yap(+m[3], ayNo(m[1]), +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6]);
  // "9 October 2026 10:23" / "3 Kasım 2026, Salı 15:30" / "9 Kas 2026 Pzt, 18:19"
  m = s.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3,9})\.?\s+(\d{4})(?:[^\d]{0,16}?(\d{1,2}):(\d{2}))?/);
  if (m && ayNo(m[2])) return yap(+m[3], ayNo(m[2]), +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  // "12.11.2026 13:26" / "12/11/2026 13:26" (gun.ay.yil)
  m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[^\d]{0,4}(\d{1,2}):(\d{2}))?/);
  if (m) return yap(+m[3], +m[2], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return null;
}

const EPOSTA = /<?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*>?/;
const adAnahtari = (s: string) => s.replace(/["'*]/g, "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");

/** Metindeki "Ad <e-posta>" ciftlerinden ad -> e-posta (Outlook ic alintida yalniz ad yazar). */
function adlarVeEpostalar(metin: string): Map<string, string> {
  const harita = new Map<string, string>();
  const re = /(?:^|[:;,]\s*|\n)\s*'?"?([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü .'-]{1,60}?)'?"?\s*<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g;
  for (const x of metin.matchAll(re)) {
    const ad = adAnahtari(x[1]);
    if (ad.length >= 3 && !harita.has(ad)) harita.set(ad, x[2].toLowerCase());
  }
  return harita;
}

type Baslik = { satir: number; bitis: number; gonderenHam: string; tarihHam: string | null; konu: string | null };

const KIMDEN = /^\s*\**\s*(?:From|Kimden|Gönderen)\s*:\**\s*(.+)$/i;
const TARIH = /^\s*\**\s*(?:Sent|Date|Gönderildi|Gönderilme|Gönderilmiş|Tarih)\s*:\**\s*(.+)$/i;
const KONU = /^\s*\**\s*(?:Subject|Konu)\s*:\**\s*(.*)$/i;
const DIGER = /^\s*\**\s*(?:To|Cc|Bcc|Kime|Bilgi|Alıcı|Alici|CC)\s*:\**/i;
const GMAIL_TR = /^(.*?\d{4}.*?)\s+tarihinde\s+(.+?)\s*<([^>]+)>\s*(?:şunu|şunları)\s*yazdı:?\s*$/i;
const GMAIL_TR2 = /^(.+?)\s*<([^>]+)>\s*(?:şunu|şunları)\s*yazdı\s*\(([^)]+)\):?\s*$/i;
const GMAIL_TR3 = /^(.+?)\s*<([^>]+)>,?\s+(.*?\d{4}.*?)\s+tarihinde\s+(?:şunu|şunları)\s*yazdı:?\s*$/i;
const GMAIL_EN = /^On\s+(.+?\d{4}(?:,?\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:[AP]M)?)?)\s*,?\s+(.+?)\s*<([^>]+)>\s*wrote:\s*$/i;

/**
 * Alintidaki mesajlari ayir. En ustteki (yeni yazilan) kisim alinmaz: yalniz bir baslik satirindan SONRA gelen bloklar.
 * Gonderen e-postasi cozulemeyen blok atlanir (kime ait oldugu bilinmeyen teklif kaydedilmez).
 */
export function alintiMesajlari(tamGovde: string, sinir = 15): AlintiMesaji[] {
  if (!tamGovde) return [];
  // "> " seviyeleri duzlestirilir; satira bolunmus Gmail basligi ("... şunu\nyazdı:") birlestirilir
  const metin = tamGovde.replace(/\r/g, "")
    .split("\n").map((s) => s.replace(/^(?:\s*>)+\s?/, "")).join("\n")
    .replace(/\n\s*(yazdı:|wrote:)/g, " $1");
  const satirlar = metin.split("\n");
  const adlar = adlarVeEpostalar(metin);
  const basliklar: Baslik[] = [];
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i];
    const k = s.match(KIMDEN);
    if (k) {
      let tarihHam: string | null = null, konu: string | null = null, j = i + 1;
      for (; j < satirlar.length && j <= i + 8; j++) {
        const x = satirlar[j];
        if (!x.trim()) { if (tarihHam || konu) break; continue; }
        const t = x.match(TARIH), kk = x.match(KONU);
        if (t) tarihHam = t[1];
        else if (kk) konu = kk[1].trim() || null;
        else if (!DIGER.test(x) && !/^\s+\S/.test(x)) break;   // devam eden alici satirlari girintili olabilir
      }
      if (tarihHam) basliklar.push({ satir: i, bitis: j, gonderenHam: k[1], tarihHam, konu });
      continue;
    }
    const g = s.match(GMAIL_TR) || s.match(GMAIL_EN);
    if (g) { basliklar.push({ satir: i, bitis: i + 1, gonderenHam: `${g[2]} <${g[3]}>`, tarihHam: g[1], konu: null }); continue; }
    const g3 = s.match(GMAIL_TR3);
    if (g3) { basliklar.push({ satir: i, bitis: i + 1, gonderenHam: `${g3[1]} <${g3[2]}>`, tarihHam: g3[3], konu: null }); continue; }
    const g2 = s.match(GMAIL_TR2);
    if (g2) basliklar.push({ satir: i, bitis: i + 1, gonderenHam: `${g2[1]} <${g2[2]}>`, tarihHam: g2[3], konu: null });
  }
  const sonuc: AlintiMesaji[] = [];
  for (let b = 0; b < basliklar.length && sonuc.length < sinir; b++) {
    const h = basliklar[b];
    const tarih = h.tarihHam ? alintiTarihi(h.tarihHam) : null;
    if (!tarih) continue;
    const ep = h.gonderenHam.match(EPOSTA);
    const gonderen = ep ? ep[1].toLowerCase() : adlar.get(adAnahtari(h.gonderenHam)) ?? null;
    if (!gonderen) continue;
    const son = b + 1 < basliklar.length ? basliklar[b + 1].satir : satirlar.length;
    const govde = satirlar.slice(h.bitis, son).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!govde) continue;
    sonuc.push({ gonderen, tarih, konu: h.konu, govde });
  }
  return sonuc;
}

/** Ayni alinti farkli yazismalarda tekrar gecse de ayni kimlik (kayit idempotent). FNV-1a 64 bit (iki 32 bit). */
export function alintiKimligi(a: Pick<AlintiMesaji, "gonderen" | "tarih" | "govde">): string {
  const metin = `${a.gonderen}|${a.tarih.slice(0, 16)}|${govdeImzasi(a.govde)}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < metin.length; i++) {
    const c = metin.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `alinti:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Govdenin ilk anlamli harf/rakamlari: asli (dogrudan gelmis) mesajla alintisini eslestirmek icin. */
export function govdeImzasi(govde: string): string {
  return govde.toLocaleLowerCase("tr-TR").replace(/\[cid:[^\]]*\]/g, "").replace(/[^a-z0-9çğıöşü]/g, "").slice(0, 60);
}
