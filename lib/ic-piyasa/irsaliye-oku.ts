/**
 * e-Irsaliye PDF okuyucu (12.10.2026).
 *
 * Logo'nun urettigi e-Irsaliye PDF'lerinde gercek metin vardir ("Microsoft
 * Print To PDF" ciktisi bile). Metin tarayicida pdf.js (unpdf paketi) ile
 * cikarilir ve asagidaki saf fonksiyonla ayristirilir: ucretsiz, yapay zeka
 * yok, sunucuya gitmez. Okunamayan alanlar bos doner; kantarci plaka ve net
 * kg'i elle yazar.
 *
 * KVKK: sofor TC kimlik numarasi (TCKN) BILEREK okunmaz / saklanmaz.
 * Orneklerle test edildi: IRS2026000002477, IRS2026000002468 (09.10.2026).
 */

export type IrsaliyeKalemi = {
  malKodu: string | null;
  ad: string;
  miktar: number;
  birim: string;
  /** Birim agirlik (kg/ton) ise kg karsiligi, degilse null (ör. Adet). */
  kg: number | null;
};

export type IrsaliyeOkuma = {
  irsaliyeNo: string | null;
  /** ISO 8601 (+03:00) */
  tarih: string | null;
  ettn: string | null;
  plaka: string | null;
  dorsePlaka: string | null;
  soforAd: string | null;
  aliciVkn: string | null;
  aliciUnvan: string | null;
  kalemler: IrsaliyeKalemi[];
  /** Tum kalemler agirlik birimindeyse toplam kg; degilse null. */
  netKg: number | null;
  /** Kalem adlari (birlesik), ör. "BUĞDAY" */
  urun: string | null;
};

// ---------------------------------------------------------------------------
// Plaka
// ---------------------------------------------------------------------------
const TR_ASCII: Record<string, string> = { ı: "I", i: "I", İ: "I", ç: "C", Ç: "C", ğ: "G", Ğ: "G", ö: "O", Ö: "O", ş: "S", Ş: "S", ü: "U", Ü: "U" };

/**
 * Plaka yazimi: BUYUK HARF, Turkce harfler Latin karsiligina (plakada Turkce
 * harf olmaz), TR plakasi "59 AGD 284" bicimine getirilir. Yabanci plaka
 * buyuk harf + tek bosluk olarak birakilir.
 */
export function plakaBicimle(girdi: string | null | undefined): string {
  const s = (girdi || "")
    .replace(/[ıiİçÇğĞöÖşŞüÜ]/g, (h) => TR_ASCII[h] || h)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bitisik = s.replace(/ /g, "");
  const tr = bitisik.match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
  if (tr) return `${tr[1]} ${tr[2]} ${tr[3]}`;
  return s;
}

/** Yazarken: aninda BUYUK HARF + Turkce harf -> Latin (bosluklar korunur). */
export function plakaYazarken(girdi: string): string {
  return girdi.replace(/[ıiİçÇğĞöÖşŞüÜ]/g, (h) => TR_ASCII[h] || h).toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 16);
}

/** Sunucu kurali ile ayni: 4-14 karakter, A-Z 0-9 bosluk. */
export function plakaGecerli(plaka: string): boolean {
  return /^[A-Z0-9 ]{4,14}$/.test(plaka) && /\d/.test(plaka) && /[A-Z]/.test(plaka);
}

// ---------------------------------------------------------------------------
// Sayi
// ---------------------------------------------------------------------------
/** "25.500" -> 25500, "25.500,50" -> 25500.5, "25500" -> 25500, "25,5" -> 25.5 */
export function trSayiOku(metin: string): number | null {
  const s = metin.trim();
  let t: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(s)) t = s.replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(s)) t = s; // 25500.50
  else return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function agirlikKg(miktar: number, birim: string): number | null {
  const b = birim.toLocaleUpperCase("tr-TR");
  if (b === "KG" || b === "KGM") return miktar;
  if (b === "TON" || b === "TN" || b === "TNE" || b === "T") return Math.round(miktar * 1000 * 100) / 100;
  return null;
}

// ---------------------------------------------------------------------------
// Ayristirma (saf fonksiyon - testlenebilir)
// ---------------------------------------------------------------------------
const I = "[İI]"; // "İrsaliye" / "Irsaliye"

export function irsaliyeMetniniAyristir(hamMetin: string): IrsaliyeOkuma {
  const m = hamMetin.replace(/\s+/g, " ").trim();
  const bul = (re: RegExp) => m.match(re)?.[1]?.trim() || null;

  const irsaliyeNo = bul(new RegExp(`${I}rsaliye No\\s*:\\s*([A-Z0-9]{3,20})`));

  let tarih: string | null = null;
  const t = m.match(new RegExp(`${I}rsaliye Tarihi\\s*:\\s*(\\d{2})[-./](\\d{2})[-./](\\d{4})`)) || m.match(/Sevk Tarihi\s*:\s*(\d{2})[-./](\d{2})[-./](\d{4})/);
  if (t) {
    const z = m.match(new RegExp(`${I}rsaliye Zaman[ıi]\\s*:\\s*(\\d{2}):(\\d{2})(?::(\\d{2}))?`)) || m.match(/Sevk Zaman[ıi]\s*:\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
    const ss = z ? `${z[1]}:${z[2]}:${z[3] || "00"}` : "12:00:00";
    tarih = `${t[3]}-${t[2]}-${t[1]}T${ss}+03:00`;
    if (Number.isNaN(Date.parse(tarih))) tarih = null;
  }

  const ettn = bul(/ETTN\s*:\s*([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/)?.toUpperCase() || null;

  const plakaAl = (etiket: string) => {
    const r = m.match(new RegExp(`${etiket}\\s*:\\s*(\\d{2}\\s?[A-Z]{1,3}\\s?\\d{2,5}(?![A-Z0-9])|[A-Z0-9]{4,12}(?![A-Z0-9]))`, "i"));
    return r ? plakaBicimle(r[1]) : null;
  };
  const plaka = plakaAl("Araç plaka numarası") || plakaAl("Arac plaka numarasi") || plakaAl("Plaka");
  const dorsePlaka = plakaAl("Dorse plaka numarası") || plakaAl("Dorse plaka numarasi");

  // Sofor: sadece ad soyad. TCKN alinmaz.
  let soforAd = bul(/Şoför\s*:\s*([^,]{2,60}?)\s*(?:,|TCKN|$)/) || bul(/Sofor\s*:\s*([^,]{2,60}?)\s*(?:,|TCKN|$)/i);
  if (soforAd && /\d{6,}/.test(soforAd)) soforAd = null;

  // Alici blogu: "SAYIN" ile teslimat adresi / ozellestirme arasi
  const aliciBlok = m.match(/SAYIN\s+([\s\S]*?)(?:TESL[İI]MAT ADRES[İI]|Özelleştirme No|ETTN|$)/)?.[1] || "";
  const aliciVkn = aliciBlok.match(/(?:VKN|TCKN|Vergi No)\s*:\s*(\d{10,11})/)?.[1] || null;
  const aliciUnvan =
    aliciBlok.match(/^(.+?(?:LTD\.?\s?ŞT[İI]\.?|A\.\s?Ş\.?|ŞT[İI]\.?|Ş[İI]RKET[İI]|T[İI]C\.?\s?A\.?Ş\.?))(?=\s|$)/)?.[1]?.trim() ||
    aliciBlok.split(/\s(?:[A-ZÇĞİÖŞÜ]+\s)?(?:CAD|SOK|MAH|NO)[.:\s]/)[0]?.trim().slice(0, 120) ||
    null;

  // Kalemler: baslik satirindan sonra, "Toplam" / "İlgili Dokümanlar" oncesi
  const kalemler: IrsaliyeKalemi[] = [];
  const bolgeBas = m.search(/Künye Numarası|Künye No|Tutar\s+\d/);
  let bolge = bolgeBas >= 0 ? m.slice(bolgeBas).replace(/^(Künye Numarası|Künye No|Tutar)\s*/, "") : "";
  const bolgeSon = bolge.search(/Toplam Tutar|Toplam Miktar|İlgili Dokümanlar|Açıklamalar|Taşıyıcı Bilgileri/);
  if (bolgeSon >= 0) bolge = bolge.slice(0, bolgeSon);
  // Satir basi: sira no + mal kodu (6+ hane rakam ya da harf-rakam kodu)
  const satirlar = bolge.split(/(?=(?:^|\s)\d{1,3}\s+[A-Z0-9][A-Z0-9.\-_/]{3,}\s)/).map((x) => x.trim()).filter(Boolean);
  const miktarRe = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s+(KGM|KG|Kg|kg|TON|Ton|ton|TNE|TN|ADET|Adet|adet|AD|Çuval|ÇUVAL)\b/g;
  for (const satir of satirlar) {
    const bas = satir.match(/^(\d{1,3})\s+([A-Z0-9][A-Z0-9.\-_/]{3,})\s+(.*)$/);
    if (!bas) continue;
    const govde = bas[3];
    const eslesmeler = Array.from(govde.matchAll(miktarRe));
    if (!eslesmeler.length) continue;
    const son = eslesmeler[eslesmeler.length - 1];
    const miktar = trSayiOku(son[1]);
    if (miktar === null) continue;
    const ad = govde.slice(0, son.index).trim();
    if (!ad) continue;
    kalemler.push({ malKodu: bas[2], ad, miktar, birim: son[2], kg: agirlikKg(miktar, son[2]) });
  }
  const netKg = kalemler.length && kalemler.every((k) => k.kg !== null) ? Math.round(kalemler.reduce((t, k) => t + (k.kg as number), 0) * 100) / 100 : null;
  const urun = kalemler.length ? kalemler.map((k) => k.ad).join(", ") : null;

  return { irsaliyeNo, tarih, ettn, plaka, dorsePlaka, soforAd, aliciVkn, aliciUnvan: aliciUnvan || null, kalemler, netKg, urun };
}

// ---------------------------------------------------------------------------
// Urun karsilastirma (irsaliyedeki urun is emrindekiyle uyusuyor mu?)
// ---------------------------------------------------------------------------
export function asciiKatla(s: string): string {
  return s.replace(/[ıiİçÇğĞöÖşŞüÜ]/g, (h) => TR_ASCII[h] || h).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Is emri urununun ilk anlamli kelimesi irsaliyedeki urunde geciyor mu? */
export function urunUyusuyor(isEmriUrun: string, irsaliyeUrun: string | null): boolean | null {
  if (!irsaliyeUrun) return null;
  const a = asciiKatla(isEmriUrun).split(" ").filter((w) => w.length >= 3);
  const b = asciiKatla(irsaliyeUrun);
  if (!a.length) return null;
  return a.some((w) => b.includes(w));
}

// ---------------------------------------------------------------------------
// PDF -> metin (tarayicida; pdf.js ayri parca olarak SADECE gerekince yuklenir)
// ---------------------------------------------------------------------------
export async function irsaliyePdfMetni(dosya: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await dosya.arrayBuffer()));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join(" ") : text;
  } finally {
    try { await pdf.destroy(); } catch { /* yoksay */ }
  }
}

export async function irsaliyePdfOku(dosya: File): Promise<IrsaliyeOkuma> {
  return irsaliyeMetniniAyristir(await irsaliyePdfMetni(dosya));
}
