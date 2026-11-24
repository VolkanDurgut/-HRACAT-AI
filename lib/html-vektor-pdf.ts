/**
 * lib/html-vektor-pdf.ts  (24.11.2026)
 *
 * HTML evragi GERCEK (vektor) PDF'e cevirir. lib/html-to-pdf.ts belgenin FOTOGRAFINI ceker (html2canvas) -
 * kullanici: "sevkiyat evraklari draft/orijinal butonlariyla olusan evraklar kalitesiz ve yamuk". Bu motor ise:
 *   1) HTML'i gorunmez bir iframe'de TARAYICININ KENDISINE dizdirir (Ihracat Evraklari'nda acilan "cam gibi"
 *      gorunumle ayni yerlesim),
 *   2) dizilmis sayfadaki her kelimenin, cizginin, zeminin ve gorselin konumunu okur,
 *   3) bunlari pdf-lib ile PDF'e METIN/CIZIM olarak yazar (fontlar Liberation Sans/Serif = Arial/Times olculeri;
 *      yalniz kullanilan harfler gomulur -> kucuk dosya, Turkce karakterler dogru, metin secilebilir).
 * Sayfa: her gorunur ".sheet" / ".sheet-ek" bir A4 sayfadir (tasarsa bolunur). Ekrandaki ".print-hint" basilmaz.
 * Desteklenen: zemin rengi, kenarlar (duz/kesikli/noktali; tablo collapse), yuvarlak kose, gorseller
 * (object-fit contain), metin rengi/kalinlik/italik/alt cizgi/harf araligi/buyuk-kucuk harf, saydamlik,
 * 2B donusumler (DRAFT filigrani), z-index katmanlari. Golge/gradyan cizilmez (evraklarda yok).
 * Sevkiyat evraklari (html-to-pdf.ts) DEGISTIRILMEDI; bu motor yalniz Draft Seti mailinde kullanilir.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, setCharacterSqueeze, setCharacterSpacing } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_W = 595.28;
const A4_H = 841.89;
const SIGDIRMA_TOLERANSI = 1.015;

type FontTuru = "sans" | "serif";
type FontAnahtari = `${FontTuru}-${"r" | "b" | "i" | "bi"}`;
const FONT_DOSYALARI: Record<FontAnahtari, string> = {
  "sans-r": "LiberationSans-Regular.ttf", "sans-b": "LiberationSans-Bold.ttf",
  "sans-i": "LiberationSans-Italic.ttf", "sans-bi": "LiberationSans-BoldItalic.ttf",
  "serif-r": "LiberationSerif-Regular.ttf", "serif-b": "LiberationSerif-Bold.ttf",
  "serif-i": "LiberationSerif-Italic.ttf", "serif-bi": "LiberationSerif-BoldItalic.ttf",
};
/** Liberation olculeri (hhea ascent/descent, em orani) - taban cizgisi hesabinda */
const FONT_OLCU: Record<FontTuru, { asc: number; desc: number }> = {
  sans: { asc: 0.905, desc: 0.212 },
  serif: { asc: 0.891, desc: 0.216 },
};

export type VektorPdfAyar = {
  /** Font dosyasini getirir (varsayilan: /fonts/<ad>) */
  fontYukle?: (dosyaAdi: string) => Promise<ArrayBuffer>;
  /** PDF baslik bilgisi */
  baslik?: string;
};

const fontOnbellek = new Map<string, Promise<ArrayBuffer>>();
function varsayilanFontYukle(ad: string): Promise<ArrayBuffer> {
  let p = fontOnbellek.get(ad);
  if (!p) {
    p = fetch(`/fonts/${ad}`).then((r) => {
      if (!r.ok) throw new Error(`Font yüklenemedi: ${ad}`);
      return r.arrayBuffer();
    });
    p.catch(() => fontOnbellek.delete(ad));
    fontOnbellek.set(ad, p);
  }
  return p;
}

// ---------------------------------------------------------------- saf yardimcilar (testli)

export type Renk = { r: number; g: number; b: number; a: number };

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" / "rgb(1 2 3 / 50%)" -> 0..1 bilesenler; okunamazsa null */
export function renkCoz(css: string | null | undefined): Renk | null {
  if (!css) return null;
  const m = css.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return css.trim() === "transparent" ? { r: 0, g: 0, b: 0, a: 0 } : null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: Math.max(0, Math.min(1, a)) };
}

/** CSS font-family -> sans / serif (ilk aile belirler) */
export function fontTuru(aile: string): FontTuru {
  const ilk = (aile.split(",")[0] || "").replace(/["']/g, "").trim().toLowerCase();
  if (ilk === "serif" || /times|georgia|garamond|cambria|book antiqua|palatino|liberation serif|dejavu serif/.test(ilk)) return "serif";
  return "sans";
}

/** text-transform uygulamasi (tarayici cizimde uygular; DOM metni ham kalir) */
export function metinDonustur(metin: string, donusum: string): string {
  if (donusum === "uppercase") return metin.toLocaleUpperCase("en");
  if (donusum === "lowercase") return metin.toLocaleLowerCase("en");
  if (donusum === "capitalize") return metin.replace(/(^|\s)(\S)/g, (_t, s: string, h: string) => s + h.toLocaleUpperCase("en"));
  return metin;
}

/**
 * Uzun sayfanin bolunecegi y noktalari (px, kok ustune gore). Satir ortasindan bolunmez: kesim noktasini
 * kesen satir varsa kesim o satirin ustune cekilir (satir sayfa boyundan uzunsa zorla bolunur).
 */
export function sayfaKesimleri(toplamYukseklik: number, sayfaYuksekligi: number, satirlar: { ust: number; alt: number }[]): number[] {
  const kesimler: number[] = [0];
  let bas = 0;
  let koruma = 0;
  while (toplamYukseklik - bas > sayfaYuksekligi * SIGDIRMA_TOLERANSI && koruma++ < 200) {
    let kesim = bas + sayfaYuksekligi;
    for (let tekrar = 0; tekrar < 50; tekrar++) {
      const kesen = satirlar.filter((s) => s.ust < kesim - 0.5 && s.alt > kesim + 0.5 && s.ust > bas + 1);
      if (!kesen.length) break;
      kesim = Math.min(...kesen.map((s) => s.ust));
    }
    if (kesim <= bas + sayfaYuksekligi * 0.3) kesim = bas + sayfaYuksekligi; // cok kisa sayfa olusmasin
    kesimler.push(kesim);
    bas = kesim;
  }
  kesimler.push(toplamYukseklik);
  return kesimler;
}

// ---------------------------------------------------------------- toplama (DOM -> cizim listesi)

type Nokta = { x: number; y: number };
type Kutu = { x: number; y: number; w: number; h: number };
type Donusum = { a: number; b: number; c: number; d: number; e: number; f: number; ox: number; oy: number } | null;

type Ogeler =
  | { tur: "zemin"; z: number; sira: number; kutu: Kutu; renk: Renk; yaricap: number }
  | { tur: "cizgi"; z: number; sira: number; p1: Nokta; p2: Nokta; kalinlik: number; renk: Renk; desen: "solid" | "dashed" | "dotted" }
  | { tur: "cerceve"; z: number; sira: number; kutu: Kutu; kalinlik: number; renk: Renk; yaricap: number }
  | { tur: "gorsel"; z: number; sira: number; kutu: Kutu; src: string; el: HTMLImageElement; opaklik: number }
  | { tur: "metin"; z: number; sira: number; metin: string; taban: Nokta; genislik: number; boyut: number; font: FontAnahtari;
      renk: Renk; harfAraligi: number; aci: number; altCizgi: boolean; satir: { ust: number; alt: number } };

function noktaDonustur(p: Nokta, t: Donusum): Nokta {
  if (!t) return p;
  const dx = p.x - t.ox, dy = p.y - t.oy;
  return { x: t.ox + t.a * dx + t.c * dy + t.e, y: t.oy + t.b * dx + t.d * dy + t.f };
}

function topla(kok: HTMLElement, win: Window): { ogeler: Ogeler[]; satirlar: { ust: number; alt: number }[] } {
  const ogeler: Ogeler[] = [];
  const satirlar: { ust: number; alt: number }[] = [];
  let sira = 0;
  const doc = kok.ownerDocument;

  const katman = (el: Element | null): number => {
    for (let e = el; e && e !== kok.parentElement; e = e.parentElement) {
      const cs = win.getComputedStyle(e);
      if (cs.position !== "static" && cs.zIndex !== "auto") return parseInt(cs.zIndex, 10) || 0;
    }
    return 0;
  };
  const opaklik = (el: Element | null): number => {
    let o = 1;
    for (let e = el; e && e !== kok.parentElement; e = e.parentElement) o *= parseFloat(win.getComputedStyle(e).opacity || "1");
    return o;
  };

  // 2B donusumlu ogeler (filigran): donusum kaldirilarak olculur, noktalar matrisle tasinir
  const donusumBul = (el: Element): { kap: HTMLElement; t: Donusum } | null => {
    for (let e: Element | null = el; e && e !== kok; e = e.parentElement) {
      const cs = win.getComputedStyle(e);
      if (cs.transform && cs.transform !== "none") return { kap: e as HTMLElement, t: null };
    }
    return null;
  };

  const donusumluKaplar = new Map<HTMLElement, Donusum>();
  const hazirlaDonusum = (kap: HTMLElement): Donusum => {
    if (donusumluKaplar.has(kap)) return donusumluKaplar.get(kap)!;
    const cs = win.getComputedStyle(kap);
    const Matris = (win as unknown as { DOMMatrixReadOnly: typeof DOMMatrixReadOnly }).DOMMatrixReadOnly;
    const m = new Matris(cs.transform);
    const eski = kap.style.transform;
    kap.style.transform = "none";
    const r = kap.getBoundingClientRect();
    const [oxS, oyS] = cs.transformOrigin.split(" ").map((v) => parseFloat(v) || 0);
    const t: Donusum = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f, ox: r.left + oxS, oy: r.top + oyS };
    kap.style.transform = eski;
    donusumluKaplar.set(kap, t);
    return t;
  };

  const elemanIsle = (el: HTMLElement) => {
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (donusumBul(el)) return; // donusumlu kutularin zemin/kenari cizilmez (filigranda yok)
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const z = katman(el);
    const op = opaklik(el);
    const yaricap = parseFloat(cs.borderTopLeftRadius) || 0;

    const zemin = renkCoz(cs.backgroundColor);
    if (zemin && zemin.a > 0 && el !== kok.ownerDocument.body) {
      ogeler.push({ tur: "zemin", z, sira: sira++, kutu: { x: r.left, y: r.top, w: r.width, h: r.height }, renk: { ...zemin, a: zemin.a * op }, yaricap });
    }

    const kenarlar = (["Top", "Right", "Bottom", "Left"] as const).map((k) => ({
      k,
      w: parseFloat(cs.getPropertyValue(`border-${k.toLowerCase()}-width`)) || 0,
      s: cs.getPropertyValue(`border-${k.toLowerCase()}-style`),
      c: renkCoz(cs.getPropertyValue(`border-${k.toLowerCase()}-color`)),
    }));
    const gorunur = kenarlar.filter((b) => b.w > 0 && b.s !== "none" && b.s !== "hidden" && b.c && b.c.a > 0);
    if (gorunur.length) {
      const ayni = gorunur.length === 4 && gorunur.every((b) => b.w === gorunur[0].w && b.s === gorunur[0].s && b.c!.r === gorunur[0].c!.r && b.c!.g === gorunur[0].c!.g && b.c!.b === gorunur[0].c!.b);
      if (ayni && yaricap > 0 && gorunur[0].s === "solid") {
        const w = gorunur[0].w;
        ogeler.push({ tur: "cerceve", z, sira: sira++, kutu: { x: r.left + w / 2, y: r.top + w / 2, w: r.width - w, h: r.height - w }, kalinlik: w, renk: { ...gorunur[0].c!, a: gorunur[0].c!.a * op }, yaricap: Math.max(0, yaricap - w / 2) });
      } else {
        const tablo = el.closest("table");
        const collapse = (el.tagName === "TD" || el.tagName === "TH" || el.tagName === "TABLE" || el.tagName === "TR") && tablo && win.getComputedStyle(tablo).borderCollapse === "collapse";
        for (const b of gorunur) {
          const ic = collapse ? 0 : b.w / 2; // collapse: kenar, kutu sinirinin ortasindadir
          let p1: Nokta, p2: Nokta;
          if (b.k === "Top") { p1 = { x: r.left, y: r.top + ic }; p2 = { x: r.right, y: r.top + ic }; }
          else if (b.k === "Bottom") { p1 = { x: r.left, y: r.bottom - ic }; p2 = { x: r.right, y: r.bottom - ic }; }
          else if (b.k === "Left") { p1 = { x: r.left + ic, y: r.top }; p2 = { x: r.left + ic, y: r.bottom }; }
          else { p1 = { x: r.right - ic, y: r.top }; p2 = { x: r.right - ic, y: r.bottom }; }
          const desen = b.s === "dashed" ? "dashed" : b.s === "dotted" ? "dotted" : "solid";
          ogeler.push({ tur: "cizgi", z, sira: sira++, p1, p2, kalinlik: b.w, renk: { ...b.c!, a: b.c!.a * op }, desen });
        }
      }
    }

    if (el.tagName === "IMG") {
      const img = el as HTMLImageElement;
      if (img.complete && img.naturalWidth > 0) {
        const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
        const pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
        const pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
        const pb = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
        let k: Kutu = { x: r.left + pl, y: r.top + pt, w: r.width - pl - pr, h: r.height - pt - pb };
        if (cs.objectFit === "contain" || cs.objectFit === "scale-down") {
          const oran = Math.min(k.w / img.naturalWidth, k.h / img.naturalHeight, cs.objectFit === "scale-down" ? 1 : Infinity);
          const w = img.naturalWidth * oran, h = img.naturalHeight * oran;
          const [px, py] = (cs.objectPosition || "50% 50%").split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : NaN));
          k = { x: k.x + (k.w - w) * (isNaN(px) ? 0.5 : px), y: k.y + (k.h - h) * (isNaN(py) ? 0.5 : py), w, h };
        }
        if (k.w > 0 && k.h > 0) ogeler.push({ tur: "gorsel", z, sira: sira++, kutu: k, src: img.currentSrc || img.src, el: img, opaklik: op });
      }
    }
  };

  const metinIsle = (dugum: Text) => {
    const el = dugum.parentElement;
    if (!el) return;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden") return;
    const ham = dugum.data;
    if (!ham.trim()) return;
    const renk = renkCoz(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
    const op = opaklik(el);
    if (renk.a * op <= 0) return;
    const boyut = parseFloat(cs.fontSize) || 12;
    const agirlik = parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400);
    const italik = cs.fontStyle === "italic" || cs.fontStyle === "oblique";
    const tur = fontTuru(cs.fontFamily);
    const font = `${tur}-${agirlik >= 600 ? (italik ? "bi" : "b") : italik ? "i" : "r"}` as FontAnahtari;
    const harfAraligi = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
    const altCizgi = /underline/.test(cs.textDecorationLine || cs.textDecoration || "");
    const z = katman(el);
    const donusumlu = donusumBul(el);
    let t: Donusum = null;
    let kap: HTMLElement | null = null;
    let eski = "";
    if (donusumlu) {
      kap = donusumlu.kap;
      t = hazirlaDonusum(kap);
      eski = kap.style.transform;
      kap.style.transform = "none";
    }
    const aci = t ? (Math.atan2(t.b, t.a) * 180) / Math.PI : 0;
    const olcu = FONT_OLCU[tur];
    const aralik = doc.createRange();
    const kelime = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = kelime.exec(ham))) {
      aralik.setStart(dugum, m.index);
      aralik.setEnd(dugum, m.index + m[0].length);
      const rects = Array.from(aralik.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
      if (!rects.length) continue;
      const parcalar: { metin: string; r: DOMRect }[] = [];
      if (rects.length === 1) parcalar.push({ metin: m[0], r: rects[0] });
      else {
        // Kelime satir sonunda bolunmus: harf harf
        for (let i = 0; i < m[0].length; i++) {
          aralik.setStart(dugum, m.index + i);
          aralik.setEnd(dugum, m.index + i + 1);
          const q = aralik.getClientRects()[0];
          if (q && q.width > 0) parcalar.push({ metin: m[0][i], r: q });
        }
      }
      for (const { metin, r } of parcalar) {
        const taban = r.top + (r.height * olcu.asc) / (olcu.asc + olcu.desc);
        const p = noktaDonustur({ x: r.left, y: taban }, t);
        ogeler.push({
          tur: "metin", z, sira: sira++, metin: metinDonustur(metin, cs.textTransform), taban: p,
          genislik: r.width, boyut, font, renk: { ...renk, a: renk.a * op }, harfAraligi, aci, altCizgi,
          satir: { ust: r.top, alt: r.bottom },
        });
        if (!t) satirlar.push({ ust: r.top, alt: r.bottom });
      }
    }
    if (kap) kap.style.transform = eski;
  };

  const gezgin = doc.createTreeWalker(kok, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD" || tag === "TITLE") return NodeFilter.FILTER_REJECT;
        if (win.getComputedStyle(n as Element).display === "none") return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  elemanIsle(kok);
  for (let n = gezgin.nextNode(); n; n = gezgin.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) metinIsle(n as Text);
    else elemanIsle(n as HTMLElement);
  }
  return { ogeler, satirlar };
}

// ---------------------------------------------------------------- cizim

function veriUrlBaytlari(src: string): { tur: "png" | "jpg"; bayt: Uint8Array } | null {
  const m = src.match(/^data:image\/(png|jpe?g);base64,(.*)$/i);
  if (!m) return null;
  const ikili = atob(m[2]);
  const bayt = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
  return { tur: m[1].toLowerCase() === "png" ? "png" : "jpg", bayt };
}

async function gorselGom(pdf: PDFDocument, src: string, el: HTMLImageElement): Promise<PDFImage | null> {
  try {
    const veri = veriUrlBaytlari(src);
    if (veri) return veri.tur === "png" ? await pdf.embedPng(veri.bayt) : await pdf.embedJpg(veri.bayt);
  } catch { /* asagida tuvalle denenir */ }
  try {
    const azami = 2400;
    const oran = Math.min(1, azami / Math.max(el.naturalWidth, el.naturalHeight));
    const tuval = document.createElement("canvas");
    tuval.width = Math.max(1, Math.round(el.naturalWidth * oran));
    tuval.height = Math.max(1, Math.round(el.naturalHeight * oran));
    const ctx = tuval.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, tuval.width, tuval.height);
    const png = veriUrlBaytlari(tuval.toDataURL("image/png"));
    return png ? await pdf.embedPng(png.bayt) : null;
  } catch {
    return null;
  }
}

function yuvarlakYol(w: number, h: number, r: number): string {
  const q = Math.min(r, w / 2, h / 2);
  return `M ${q} 0 L ${w - q} 0 Q ${w} 0 ${w} ${q} L ${w} ${h - q} Q ${w} ${h} ${w - q} ${h} L ${q} ${h} Q 0 ${h} 0 ${h - q} L 0 ${q} Q 0 0 ${q} 0 Z`;
}

/** Bir HTML belgesini vektor PDF'e cevirir (tarayicida calisir). */
export async function htmlToVektorPdf(html: string, ayar: VektorPdfAyar = {}): Promise<Uint8Array> {
  const fontYukle = ayar.fontYukle || varsayilanFontYukle;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", left: "-12000px", top: "0", width: "900px", height: "1400px", border: "none", visibility: "hidden" });
  document.body.appendChild(iframe);
  try {
    const idoc = iframe.contentDocument;
    const iwin = iframe.contentWindow;
    if (!idoc || !iwin) throw new Error("Geçici çizim alanı oluşturulamadı.");
    // Ekrandaki "yazdirmadan once" ipucu PDF'e girmez; golge cizilmez
    const ekStil = `<style>.print-hint{display:none!important}.sheet,.sheet-ek{box-shadow:none!important}</style>`;
    const hazir = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${ekStil}</head>`) : ekStil + html;
    idoc.open();
    idoc.write(hazir);
    idoc.close();
    await new Promise((r) => setTimeout(r, 120));
    const gorseller = Array.from(idoc.images);
    await Promise.all(gorseller.map((img) => (img.complete
      ? (typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve())
      : new Promise<void>((res) => { img.addEventListener("load", () => res(), { once: true }); img.addEventListener("error", () => res(), { once: true }); }))));
    try { await (idoc as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* yok say */ }
    await new Promise((r) => setTimeout(r, 60));

    let kokler = Array.from(idoc.querySelectorAll<HTMLElement>(".sheet, .sheet-ek"))
      .filter((e) => iwin.getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0)
      .filter((e, _i, hepsi) => !hepsi.some((u) => u !== e && u.contains(e)));
    if (!kokler.length) kokler = [idoc.body];

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    if (ayar.baslik) pdf.setTitle(ayar.baslik);
    pdf.setProducer("UNEX AI");
    pdf.setCreator("UNEX AI");
    const fontlar = new Map<FontAnahtari, PDFFont>();
    const fontAl = async (k: FontAnahtari) => {
      let f = fontlar.get(k);
      if (!f) {
        f = await pdf.embedFont(await fontYukle(FONT_DOSYALARI[k]), { subset: true });
        fontlar.set(k, f);
      }
      return f;
    };
    const gorselOnbellek = new Map<string, PDFImage | null>();

    for (const kok of kokler) {
      const kr = kok.getBoundingClientRect();
      const kokYukseklik = Math.max(kr.height, kok.scrollHeight);
      const { ogeler, satirlar } = topla(kok, iwin);
      const olcek = A4_W / kr.width;
      const sayfaPx = A4_H / olcek;
      const tekSayfa = kokYukseklik <= sayfaPx * SIGDIRMA_TOLERANSI;
      const kesimler = tekSayfa ? [0, kokYukseklik] : sayfaKesimleri(kokYukseklik, sayfaPx, satirlar.map((s) => ({ ust: s.ust - kr.top, alt: s.alt - kr.top })));
      const sirali = ogeler.slice().sort((a, b) => a.z - b.z || a.sira - b.sira);

      for (let s = 0; s + 1 < kesimler.length; s++) {
        const ust = kesimler[s], alt = kesimler[s + 1];
        const sayfa: PDFPage = pdf.addPage([A4_W, A4_H]);
        // Tek sayfaya hafif tasma: orantili kucult, yatayda ortala
        const o = tekSayfa ? Math.min(olcek, A4_H / kokYukseklik) : olcek;
        const solBosluk = (A4_W - kr.width * o) / 2;
        const X = (x: number) => solBosluk + (x - kr.left) * o;
        const Y = (y: number) => A4_H - (y - kr.top - ust) * o;
        const icinde = (y1: number, y2: number) => y2 - kr.top > ust - 0.5 && y1 - kr.top < alt + 0.5;

        sayfa.pushOperators(pushGraphicsState(), rectangle(0, A4_H - (alt - ust) * o, A4_W, (alt - ust) * o), clip(), endPath());
        for (const og of sirali) {
          if (og.tur === "zemin") {
            if (!icinde(og.kutu.y, og.kutu.y + og.kutu.h)) continue;
            const renk = rgb(og.renk.r, og.renk.g, og.renk.b);
            if (og.yaricap > 0) sayfa.drawSvgPath(yuvarlakYol(og.kutu.w * o, og.kutu.h * o, og.yaricap * o), { x: X(og.kutu.x), y: Y(og.kutu.y), color: renk, opacity: og.renk.a });
            else sayfa.drawRectangle({ x: X(og.kutu.x), y: Y(og.kutu.y + og.kutu.h), width: og.kutu.w * o, height: og.kutu.h * o, color: renk, opacity: og.renk.a });
          } else if (og.tur === "cerceve") {
            if (!icinde(og.kutu.y, og.kutu.y + og.kutu.h)) continue;
            sayfa.drawSvgPath(yuvarlakYol(og.kutu.w * o, og.kutu.h * o, og.yaricap * o), {
              x: X(og.kutu.x), y: Y(og.kutu.y), borderColor: rgb(og.renk.r, og.renk.g, og.renk.b), borderWidth: og.kalinlik * o, borderOpacity: og.renk.a,
            });
          } else if (og.tur === "cizgi") {
            if (!icinde(Math.min(og.p1.y, og.p2.y), Math.max(og.p1.y, og.p2.y))) continue;
            const k = og.kalinlik * o;
            sayfa.drawLine({
              start: { x: X(og.p1.x), y: Y(og.p1.y) }, end: { x: X(og.p2.x), y: Y(og.p2.y) }, thickness: k,
              color: rgb(og.renk.r, og.renk.g, og.renk.b), opacity: og.renk.a,
              dashArray: og.desen === "dashed" ? [k * 3, k * 2] : og.desen === "dotted" ? [k, k] : undefined,
            });
          } else if (og.tur === "gorsel") {
            if (!icinde(og.kutu.y, og.kutu.y + og.kutu.h)) continue;
            if (!gorselOnbellek.has(og.src)) gorselOnbellek.set(og.src, await gorselGom(pdf, og.src, og.el));
            const g = gorselOnbellek.get(og.src);
            if (g) sayfa.drawImage(g, { x: X(og.kutu.x), y: Y(og.kutu.y + og.kutu.h), width: og.kutu.w * o, height: og.kutu.h * o, opacity: og.opaklik });
          } else {
            if (og.aci === 0 && !icinde(og.satir.ust, og.satir.alt)) continue;
            if (og.aci === 0 && (og.satir.ust - kr.top < ust - 0.5 || og.satir.ust - kr.top >= alt - 0.5) && !tekSayfa) continue;
            const font = await fontAl(og.font);
            const boyut = og.boyut * o;
            let metin = og.metin;
            // Fontta olmayan karakterler (emoji vb.) atlanir; cizim bozulmasin
            try { font.encodeText(metin); } catch { metin = Array.from(metin).filter((h) => { try { font.encodeText(h); return true; } catch { return false; } }).join(""); }
            if (!metin) continue;
            const harf = og.harfAraligi * o;
            const dogal = font.widthOfTextAtSize(metin, boyut) + harf * Array.from(metin).length;
            const hedef = og.genislik * o;
            let sikistir = 100;
            if (!harf && dogal > 0 && Math.abs(hedef / dogal - 1) > 0.004) sikistir = Math.max(85, Math.min(115, (hedef / dogal) * 100));
            const x = X(og.taban.x), y = Y(og.taban.y);
            const ops = [] as ReturnType<typeof pushGraphicsState>[];
            if (sikistir !== 100 || harf) {
              ops.push(pushGraphicsState());
              if (sikistir !== 100) ops.push(setCharacterSqueeze(sikistir));
              if (harf) ops.push(setCharacterSpacing(harf));
              sayfa.pushOperators(...ops);
            }
            sayfa.drawText(metin, { x, y, size: boyut, font, color: rgb(og.renk.r, og.renk.g, og.renk.b), opacity: og.renk.a, rotate: og.aci ? degrees(-og.aci) : undefined });
            if (ops.length) sayfa.pushOperators(popGraphicsState());
            if (og.altCizgi && !og.aci) {
              sayfa.drawLine({ start: { x, y: y - boyut * 0.12 }, end: { x: x + hedef, y: y - boyut * 0.12 }, thickness: Math.max(0.4, boyut * 0.06), color: rgb(og.renk.r, og.renk.g, og.renk.b), opacity: og.renk.a });
            }
          }
        }
        sayfa.pushOperators(popGraphicsState());
      }
    }
    return await pdf.save({ useObjectStreams: true });
  } finally {
    document.body.removeChild(iframe);
  }
}
