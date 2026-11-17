// ============================================================================
// KUCUK MIME OKUYUCU (17.11.2026, Operasyon Ajani)
// ============================================================================
// IMAP'ten gelen ham baslik + (kirpilmis olabilen) govde baytlarindan okunabilir duz metin cikarir.
// multipart/* agaci gezilir; ilk text/plain tercih edilir, yoksa text/html etiketsiz metne cevrilir.
// Ekler (pdf, gorsel) atlanir. base64 / quoted-printable ve charset (utf-8, windows-1254, iso-8859-9 ...)
// cozulur. Govde kirpilmissa yarim kalan base64 blogu atilir; eldeki kisim dondurulur.
// ============================================================================

const latin = new TextDecoder("latin1");

export function baytlardanLatin(b: Uint8Array): string {
  return latin.decode(b);
}

function latindenBayt(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

/** "a: b\r\n c" -> { a: "b c" } (anahtarlar kucuk harf). */
export function mimeBasliklari(ham: string): Record<string, string> {
  const acik = ham.replace(/\r?\n[ \t]+/g, " ");
  const a: Record<string, string> = {};
  for (const satir of acik.split(/\r?\n/)) {
    const m = satir.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (m && !(m[1].toLowerCase() in a)) a[m[1].toLowerCase()] = m[2].trim();
  }
  return a;
}

function parametre(deger: string, ad: string): string | null {
  const m = deger.match(new RegExp(`(?:^|;)\\s*${ad}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i"));
  return m ? (m[1] ?? m[2]) : null;
}

function base64Coz(s: string): Uint8Array {
  const temiz = s.replace(/[^A-Za-z0-9+/=]/g, "");
  const tam = temiz.slice(0, temiz.length - (temiz.length % 4));
  try {
    return latindenBayt(atob(tam));
  } catch {
    return new Uint8Array(0);
  }
}

function qpCoz(s: string): Uint8Array {
  const yumusak = s.replace(/=\r?\n/g, "");
  const dizi: number[] = [];
  for (let i = 0; i < yumusak.length; i++) {
    if (yumusak[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(yumusak.slice(i + 1, i + 3))) {
      dizi.push(parseInt(yumusak.slice(i + 1, i + 3), 16));
      i += 2;
    } else dizi.push(yumusak.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(dizi);
}

function karakterCoz(b: Uint8Array, charset: string | null): string {
  const cs = (charset || "utf-8").toLowerCase();
  try {
    return new TextDecoder(cs).decode(b);
  } catch {
    return new TextDecoder("utf-8").decode(b);
  }
}

const VARLIK: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** HTML -> duz metin (satir yapisi korunur). */
export function htmldenMetin(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => VARLIK[n.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Parca = { tur: "plain" | "html"; metin: string };

function parcaGez(baslik: Record<string, string>, govde: string, derinlik: number, cikti: Parca[]): void {
  if (derinlik > 6) return;
  const ct = baslik["content-type"] || "text/plain";
  const tur = ct.split(";")[0].trim().toLowerCase();
  const disp = (baslik["content-disposition"] || "").toLowerCase();
  if (tur.startsWith("multipart/")) {
    const sinir = parametre(ct, "boundary");
    if (!sinir) return;
    const parcalar = govde.split(`--${sinir}`).slice(1);
    for (const p of parcalar) {
      if (p.startsWith("--")) break;
      const ayirac = p.search(/\r?\n\r?\n/);
      if (ayirac < 0) continue;
      const pBaslik = mimeBasliklari(p.slice(0, ayirac).replace(/^\r?\n/, ""));
      const pGovde = p.slice(ayirac).replace(/^\r?\n\r?\n/, "");
      parcaGez(pBaslik, pGovde, derinlik + 1, cikti);
    }
    return;
  }
  if (disp.startsWith("attachment")) return;
  if (tur !== "text/plain" && tur !== "text/html") return;
  const kod = (baslik["content-transfer-encoding"] || "").toLowerCase();
  const baytlar = kod === "base64" ? base64Coz(govde) : kod === "quoted-printable" ? qpCoz(govde) : latindenBayt(govde);
  const metin = karakterCoz(baytlar, parametre(ct, "charset"));
  cikti.push({ tur: tur === "text/plain" ? "plain" : "html", metin });
}

/** Ham baslik + govde (latin1 dize olarak bayt bayt) -> duz metin. */
export function mimeMetni(hamBaslik: string, hamGovde: string): string {
  const parcalar: Parca[] = [];
  parcaGez(mimeBasliklari(hamBaslik), hamGovde, 0, parcalar);
  const duz = parcalar.find((p) => p.tur === "plain");
  if (duz) return duz.metin.replace(/\r\n/g, "\n").trim();
  const html = parcalar.find((p) => p.tur === "html");
  return html ? htmldenMetin(html.metin) : "";
}
