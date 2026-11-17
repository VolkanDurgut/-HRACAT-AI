// ============================================================================
// IMAP SAF YARDIMCILARI (17.11.2026) - Deno'suz; testler (node) ve imap-oku.ts kullanir.
// ============================================================================

const AYLAR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** IMAP tirnakli dize. Yalniz yazdirilabilir ASCII kabul edilir (aksi literal ister; desteklemiyoruz). */
export function tirnakla(s: string): string {
  if (!/^[\x20-\x7e]*$/.test(s)) throw new Error("Kimlik bilgisinde desteklenmeyen karakter (yalniz ASCII)");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** "2026-11-17" -> "17-Nov-2026" (IMAP SINCE bicimi). */
export function imapTarihi(gun: string): string {
  const m = gun.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Tarih YYYY-AA-GG olmali");
  return `${Number(m[3])}-${AYLAR[Number(m[2]) - 1]}-${m[1]}`;
}

/** RFC 2047 kodlu baslik ( =?utf-8?B?...?= / =?iso-8859-9?Q?...?= ) -> duz metin. */
export function baslikCoz(s: string): string {
  const birlesik = s.replace(/\?=\s+=\?/g, "?==?");
  return birlesik.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_t, cs: string, kod: string, veri: string) => {
    try {
      let baytlar: Uint8Array;
      if (kod.toUpperCase() === "B") {
        baytlar = Uint8Array.from(atob(veri), (c) => c.charCodeAt(0));
      } else {
        const q = veri.replace(/_/g, " ");
        const dizi: number[] = [];
        for (let i = 0; i < q.length; i++) {
          if (q[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(q.slice(i + 1, i + 3))) {
            dizi.push(parseInt(q.slice(i + 1, i + 3), 16));
            i += 2;
          } else dizi.push(q.charCodeAt(i));
        }
        baytlar = Uint8Array.from(dizi);
      }
      return new TextDecoder(cs.toLowerCase()).decode(baytlar);
    } catch {
      return veri;
    }
  });
}

/** Ham baslik blogu -> alanlar (katlanmis satirlar acilir). */
export function basliklariAyir(ham: string): Record<string, string> {
  const acik = ham.replace(/\r?\n[ \t]+/g, " ");
  const a: Record<string, string> = {};
  for (const satir of acik.split(/\r?\n/)) {
    const m = satir.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) a[m[1].toLowerCase()] = m[2].trim();
  }
  return a;
}

export function adresAyir(s: string): { eposta: string; ad: string } {
  const c = baslikCoz(s);
  const m = c.match(/<([^>]+)>/);
  const eposta = (m ? m[1] : c).trim().toLowerCase();
  const ad = m ? c.slice(0, m.index).replace(/["']/g, "").trim() : "";
  return { eposta: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta) ? eposta : "", ad: ad.slice(0, 200) };
}

/** FETCH yanit satirinda her literalin hangi ogeye ait oldugunu bulur (literaller sirayla NUL ile isaretli). */
export function fetchParcalari(y: { satir: string; literaller: Uint8Array[] }): { uid: number; baslik: string; govde: string } {
  const uid = Number(y.satir.match(/UID (\d+)/i)?.[1] ?? NaN);
  const parcalar = y.satir.split("\x00");
  let baslik = "";
  let govde = "";
  for (let i = 0; i < y.literaller.length && i < parcalar.length - 1; i++) {
    const once = parcalar[i];
    const metin = new TextDecoder("latin1").decode(y.literaller[i]);
    if (/BODY\[HEADER\]\s*$/i.test(once)) baslik = metin;
    else if (/BODY\[TEXT\](<\d+>)?\s*$/i.test(once)) govde = metin;
  }
  return { uid, baslik, govde };
}

/** Alan adlarindan "gonderen VEYA alici VEYA bilgi" IMAP arama kriteri (OR zinciri). */
export function alanKriteri(alanlar: string[]): string {
  const tekler = alanlar.flatMap((a) => {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(a)) throw new Error("Gecersiz alan adi");
    return [`FROM ${tirnakla(a)}`, `TO ${tirnakla(a)}`, `CC ${tirnakla(a)}`];
  });
  return tekler.reduce((acc, k) => (acc ? `OR ${acc} ${k}` : k), "");
}
