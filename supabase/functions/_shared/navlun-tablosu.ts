/**
 * NAVLUN TABLOSU (11.11.2026) - operasyonun elle tuttugu "NAVLUN TABLOSU" Excel'iyle AYNI duzen, sistemdeki veriden.
 * SAF: veri yok, ag yok. Web (Navlun Bildirimi > Excel indir) ve edge (navlun-tablosu, test maili) AYNI dosyayi uretir.
 *
 * Sablon (operasyonun dosyasi): satirlar = liman (B: PORT), C: HEDEF; her acente / armator icin bir blok
 * (2. satirda birlestirilmis ad), blokta ay sutunlari (fiyat alinan aylar) + TRANSIT + FREE TIME.
 *
 * Kaynaklar (yalniz sistemde olan bilgi; tahmin YOK):
 *  - navlun_teklifleri: acentelerin mail teklifleri (teklif / karsi teklif / "hedefiniz uygundur"), hedefimiz, free time.
 *  - yukleme plani: gerceklesen navlun (rezervasyonu yapilmis yuklemenin konteyner basi navlunu, ETD ayi) - YESIL KALIN.
 * TRANSIT: maillerden henuz okunmuyor -> sutun sablondaki gibi var, bos.
 * Hucre = o ay icin o blogun 20'DC fiyati (ayni ayda birden fazlaysa EN SON). 20'DC yoksa 40'HC metin olarak yazilir.
 */
import { limanAnahtari } from "./liman-anahtari.ts";
import { XS, sutunHarfi, type XlsxHucre, type XlsxSayfa } from "./xlsx-yaz.ts";

export type NavlunOlayi = {
  tur: string;
  liman: string | null;
  liman_anahtar: string | null;
  acente: string | null;
  armator: string | null;
  tutar: number | null;
  para_birimi: string | null;
  ekipman: string | null;
  free_time_gun: number | null;
  tarih: string;
};

/** Yukleme planindan gerceklesen navlun (PlanSatiri'nin ilgili alanlari) */
export type GerceklesenNavlun = {
  varis_limani: string | null;
  acente: string | null;
  navlun: number | null;
  navlun_para: string | null;
  etd: string | null;
};

export type NavlunHucresi = { tutar: number; para: string; ekipman: string; tarih: string; kaynak: "teklif" | "gerceklesen" };

export type NavlunBlogu = {
  ad: string;
  /** "YYYY-MM", eski -> yeni */
  aylar: string[];
  /** liman anahtari -> ay -> hucre */
  hucreler: Map<string, Map<string, NavlunHucresi>>;
  /** liman anahtari -> son free time (gun) */
  freeTime: Map<string, number>;
  limanSayisi: number;
};

export type NavlunLimani = { anahtar: string; ad: string; hedef: { tutar: number; para: string; tarih: string } | null };

export type NavlunTablosu = { tarih: string; limanlar: NavlunLimani[]; bloklar: NavlunBlogu[]; gerceklesenVar: boolean };

const AYLAR = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

/** Ayni sirketin farkli yazimlari (plan Excel'i ve mail okuyucusu farkli yaziyor). Yalniz gosterim / gruplama. */
const AD_ESLER: [RegExp, string][] = [
  [/^(KUEHNE|K\s*\+\s*N\b)/, "KUEHNE+NAGEL"],
  [/^CMA/, "CMA-CGM"],
  [/^HAPAG/, "HAPAG"],
  [/^MAA?ERSK/, "MAERSK"],
  [/^Z[İI]M\b/, "ZIM"],
  [/^AKKON/, "AKKON"],
  [/^ONE(\s+LINE)?$/, "ONE"],
  [/^EVERGREEN/, "EVERGREEN"],
];
/** Ayni limanin plan / mail yazimlari (limanAnahtari'na ek; yalniz bu tablo icin) */
const LIMAN_ESLER: Record<string, string> = { MALDIVES: "MALE", "DAR ES SELAM": "DAR ES SALAAM" };

const buyuk = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
export function sirketAdi(s: string): string {
  const u = buyuk(s);
  for (const [re, ad] of AD_ESLER) if (re.test(u)) return ad;
  return u;
}
/** "DRAFT" + "Maersk" -> "DRAFT - MAERSK"; acente = armator -> tek ad */
export function blokAdi(acente: string, armator: string | null): string {
  const a = sirketAdi(acente);
  const b = armator && armator.trim() ? sirketAdi(armator) : null;
  return !b || b === a ? a : `${a} - ${b}`;
}
/** Plan Excel'indeki "DRAFT/CMA" -> acente DRAFT, armator CMA */
export function planBlokAdi(acente: string): string {
  const [a, ...b] = acente.split("/");
  return blokAdi(a, b.join("/") || null);
}
function limanKey(liman: string | null, anahtar?: string | null): string | null {
  const k = anahtar || limanAnahtari(liman);
  return k ? LIMAN_ESLER[k] || k : null;
}
/** Istanbul saatiyle "YYYY-MM" */
const ayAnahtari = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 7) : new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 7));

export function ayEtiketi(ay: string, yilli: boolean): string {
  const ad = AYLAR[Number(ay.slice(5, 7)) - 1] || ay;
  return yilli ? `${ad} ${ay.slice(2, 4)}` : ad;
}

export function navlunTablosuHesapla(olaylar: NavlunOlayi[], gerceklesen: GerceklesenNavlun[], tarih: string): NavlunTablosu {
  const limanAd = new Map<string, { ad: string; tarih: string }>();
  const adYaz = (k: string, ad: string, t: string) => { const e = limanAd.get(k); if (!e || t >= e.tarih) limanAd.set(k, { ad: buyuk(ad), tarih: t }); };
  const hedef = new Map<string, NavlunLimani["hedef"]>();
  const bloklar = new Map<string, NavlunBlogu>();
  const blok = (ad: string) => {
    let b = bloklar.get(ad);
    if (!b) { b = { ad, aylar: [], hucreler: new Map(), freeTime: new Map(), limanSayisi: 0 }; bloklar.set(ad, b); }
    return b;
  };
  const yaz = (b: NavlunBlogu, k: string, h: NavlunHucresi) => {
    const ay = ayAnahtari(h.tarih);
    let m = b.hucreler.get(k);
    if (!m) { m = new Map(); b.hucreler.set(k, m); }
    const e = m.get(ay);
    const yirmi = (x: NavlunHucresi) => x.ekipman === "20DC";
    // 20'DC her zaman 40'HC'den once; ayni sinifta en son tarih
    if (!e || (yirmi(h) && !yirmi(e)) || (yirmi(h) === yirmi(e) && h.tarih >= e.tarih)) m.set(ay, h);
  };

  const sirali = [...olaylar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  for (const o of sirali) {
    const k = limanKey(o.liman, o.liman_anahtar);
    if (!k) continue;
    if (o.liman) adYaz(k, o.liman, o.tarih);
    if (o.tur === "hedef" && o.tutar) { hedef.set(k, { tutar: o.tutar, para: o.para_birimi || "USD", tarih: o.tarih }); continue; }
    if (!o.acente) continue;
    let tutar = o.tutar, para = o.para_birimi || "USD";
    if (o.tur === "hedef_kabul") { const h = hedef.get(k); if (!h) continue; tutar = h.tutar; para = h.para; }
    else if (o.tur !== "teklif" && o.tur !== "karsi_teklif") continue;
    if (!tutar || tutar <= 0) continue;
    const b = blok(blokAdi(o.acente, o.armator));
    yaz(b, k, { tutar, para, ekipman: (o.ekipman || "20DC").toUpperCase(), tarih: o.tarih, kaynak: "teklif" });
    if (o.free_time_gun != null) b.freeTime.set(k, o.free_time_gun);
  }
  let gerceklesenVar = false;
  for (const g of gerceklesen) {
    const k = limanKey(g.varis_limani);
    if (!k || !g.etd) continue;
    if (g.varis_limani) adYaz(k, g.varis_limani, "0000");   // mail yazimi varsa o kalir
    if (!g.acente || !g.navlun || g.navlun <= 0) continue;
    gerceklesenVar = true;
    yaz(blok(planBlokAdi(g.acente)), k, { tutar: g.navlun, para: g.navlun_para || "USD", ekipman: "20DC", tarih: g.etd.slice(0, 10), kaynak: "gerceklesen" });
  }

  const liste = Array.from(bloklar.values()).filter((b) => b.hucreler.size);
  for (const b of liste) {
    const aylar = new Set<string>();
    b.hucreler.forEach((m) => m.forEach((_, ay) => aylar.add(ay)));
    b.aylar = Array.from(aylar).sort();
    b.limanSayisi = b.hucreler.size;
  }
  liste.sort((a, b) => b.limanSayisi - a.limanSayisi || a.ad.localeCompare(b.ad, "tr"));
  const limanlar: NavlunLimani[] = Array.from(limanAd.entries())
    .map(([anahtar, v]) => ({ anahtar, ad: v.ad, hedef: hedef.get(anahtar) ?? null }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return { tarih, limanlar, bloklar: liste, gerceklesenVar };
}

const tarihTr = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Sablondaki duzen: A bos, B PORT, C HEDEF, D'den itibaren bloklar; 2. satir blok adi, 3. satir ay / TRANSIT / FREE TIME. */
export function navlunTablosuSayfasi(t: NavlunTablosu, ad = "NAVLUN TABLOSU"): XlsxSayfa {
  const tumAylar = new Set<string>();
  for (const b of t.bloklar) for (const ay of b.aylar) tumAylar.add(ay);
  const yilli = new Set(Array.from(tumAylar).map((a) => a.slice(0, 4))).size > 1;

  const s1: (XlsxHucre | null)[] = [null, { v: `UNEX NAVLUN TABLOSU · ${tarihTr(t.tarih)}`, s: XS.sayfaBasligi }];
  const s2: (XlsxHucre | null)[] = [null, { v: "", s: XS.navBaslik }, { v: "HEDEF", s: XS.navBaslik }];
  const s3: (XlsxHucre | null)[] = [null, { v: "PORT", s: XS.navBaslik }, { v: "", s: XS.navBaslik }];
  const birlestir = ["C2:C3"];
  const genislik = [2, 27, 11];
  let sutun = 3;
  t.bloklar.forEach((b, i) => {
    const A = i % 2 === 0;
    const bas = sutun;
    const n = b.aylar.length + 2;
    for (let j = 0; j < n; j++) {
      s2.push({ v: j === 0 ? b.ad : "", s: A ? XS.navBlokA : XS.navBlokB });
      const etiket = j < b.aylar.length ? ayEtiketi(b.aylar[j], yilli) : j === b.aylar.length ? "TRANSIT" : "FREE TIME";
      s3.push({ v: etiket, s: A ? XS.navAyA : XS.navAyB });
      genislik.push(j < b.aylar.length ? 11 : 10);
    }
    sutun += n;
    if (n > 1) birlestir.push(`${sutunHarfi(bas)}2:${sutunHarfi(sutun - 1)}2`);
  });

  const satirlar: (XlsxHucre | null)[][] = [s1, s2, s3];
  for (const l of t.limanlar) {
    const r: (XlsxHucre | null)[] = [null, { v: l.ad, s: XS.metin },
      l.hedef ? (l.hedef.para === "USD" ? { v: l.hedef.tutar, s: XS.navHedef } : { v: `${l.hedef.tutar} ${l.hedef.para}`, s: XS.navBaslik }) : { v: "", s: XS.metin }];
    t.bloklar.forEach((b, i) => {
      const A = i % 2 === 0;
      const m = b.hucreler.get(l.anahtar);
      for (const ay of b.aylar) {
        const h = m?.get(ay);
        if (!h) { r.push({ v: "", s: A ? XS.navOrtaA : XS.navOrtaB }); continue; }
        if (h.para === "USD" && h.ekipman === "20DC") {
          r.push({ v: h.tutar, s: h.kaynak === "gerceklesen" ? (A ? XS.navGercekA : XS.navGercekB) : (A ? XS.navTutarA : XS.navTutarB) });
        } else {
          const para = h.para === "USD" ? "$" : h.para === "EUR" ? "€" : h.para;
          r.push({ v: `${h.ekipman === "20DC" ? "" : `${h.ekipman} `}${h.tutar} ${para}`, s: A ? XS.navOrtaA : XS.navOrtaB });
        }
      }
      r.push({ v: "", s: A ? XS.navOrtaA : XS.navOrtaB });                                   // TRANSIT: henuz okunmuyor
      const ft = b.freeTime.get(l.anahtar);
      r.push({ v: ft ?? "", s: A ? XS.navOrtaA : XS.navOrtaB });
    });
    satirlar.push(r);
  }
  if (!t.limanlar.length) satirlar.push([null, { v: "Sistemde navlun bilgisi yok.", s: XS.not }]);
  satirlar.push([]);
  const not = (v: string) => satirlar.push([null, { v, s: XS.not }]);
  not("Kaynak: acentelerin navlun talebi yazışmalarındaki teklifler (Navlun Bildirimi) — hücre: o ay alınan SON 20'DC fiyatı (USD).");
  if (t.gerceklesenVar) not("Yeşil kalın: gerçekleşen navlun (yükleme planı, rezervasyonu yapılmış yükleme, konteyner başı; ETD ayı).");
  not("HEDEF: limana verdiğimiz son hedef fiyat · FREE TIME: acentenin son teklifindeki gün · TRANSIT: maillerden henüz okunmuyor.");
  not(`Oluşturma: ${tarihTr(t.tarih)} · İhracat AI`);
  return { ad, sutunGenislik: genislik, satirlar, birlestir, dondur: "D4" };
}

/** Mail ozeti icin: limanda guncel (son 60 gun) en iyi 20'DC teklif */
export type GuncelEnIyi = { liman: string; blok: string; tutar: number; tarih: string; freeTime: number | null; hedef: number | null; teklifSayisi: number };
export function guncelEnIyiler(t: NavlunTablosu, gun = 60): GuncelEnIyi[] {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  const out: GuncelEnIyi[] = [];
  for (const l of t.limanlar) {
    let en: GuncelEnIyi | null = null;
    let sayi = 0;
    for (const b of t.bloklar) {
      const m = b.hucreler.get(l.anahtar);
      if (!m) continue;
      const son = Array.from(m.values()).filter((h) => h.kaynak === "teklif" && h.ekipman === "20DC" && h.para === "USD" && h.tarih.slice(0, 10) >= sinir)
        .sort((a, c) => c.tarih.localeCompare(a.tarih))[0];
      if (!son) continue;
      sayi++;
      if (!en || son.tutar < en.tutar) en = { liman: l.ad, blok: b.ad, tutar: son.tutar, tarih: son.tarih, freeTime: b.freeTime.get(l.anahtar) ?? null, hedef: l.hedef?.tutar ?? null, teklifSayisi: 0 };
    }
    if (en) out.push({ ...en, teklifSayisi: sayi });
  }
  return out.sort((a, b) => a.liman.localeCompare(b.liman, "tr"));
}

const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} $`;
export const NAVLUN_TABLOSU_URL = "https://ihracatasistanim.com";

export function navlunTablosuKonusu(t: NavlunTablosu, sirketAdi = "Unex Gıda"): string {
  return `${sirketAdi} Navlun Tablosu · ${tarihTr(t.tarih)} · ${t.limanlar.length} liman · ${t.bloklar.length} acente/hat`;
}

export function navlunTablosuHtml(t: NavlunTablosu, sirketAdi = "Unex Gıda"): string {
  const en = guncelEnIyiler(t);
  const doluHucre = t.bloklar.reduce((s, b) => s + Array.from(b.hucreler.values()).reduce((x, m) => x + m.size, 0), 0);
  const th = (x: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};white-space:nowrap">${x}</th>`;
  const td = (x: string, st = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${x}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, renk: string) =>
    `<td style="width:32%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569">${alt}</div></td>`;
  const arasi = `<td style="width:2%">&nbsp;</td>`;
  const satirlar = en.map((x, i) => {
    const fark = x.hedef ? x.tutar - x.hedef : null;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(x.liman)}</b>`)}${td(`<b style="color:#047857">${usd(x.tutar)}</b>`, "text-align:right;white-space:nowrap")}${td(esc(x.blok))}${td(x.freeTime != null ? `${x.freeTime} gün` : "-", "white-space:nowrap")}${td(x.hedef ? `${usd(x.hedef)}${fark !== null ? `<br><span style="font-size:11px;color:${fark <= 0 ? "#047857" : "#B45309"}">${fark <= 0 ? "hedefin altında" : `hedefin ${usd(fark)} üstünde`}</span>` : ""}` : "-", "text-align:right;white-space:nowrap")}${td(`${x.teklifSayisi}`, "text-align:right")}${td(tarihTr(new Date(Date.parse(x.tarih) + 3 * 3600000).toISOString().slice(0, 10)), "white-space:nowrap")}</tr>`;
  }).join("");
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Navlun Tablosu</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${NAVLUN_TABLOSU_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} Navlun Tablosu</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Liman · Acente / Hat · Aylık 20'DC navlun</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(tarihTr(t.tarih))}</div></td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Liman", `${t.limanlar.length}`, `${en.length} limanda son 60 günde teklif var`, LACIVERT)}${arasi}
    ${kutu("Acente / Hat", `${t.bloklar.length}`, "tablodaki blok sayısı", "#047857")}${arasi}
    ${kutu("Fiyat Hücresi", `${doluHucre}`, "liman × acente × ay", "#B45309")}
  </tr></table>
  <div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">Güncel en iyi 20'DC teklifler (son 60 gün)</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Liman")}${th("En iyi", true)}${th("Acente / Hat")}${th("Free time")}${th("Hedefimiz", true)}${th("Teklif", true)}${th("Tarih")}</tr>
  ${satirlar || `<tr><td colspan="7" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px">Son 60 günde teklif yok.</td></tr>`}</table>
  <div style="margin-top:24px;text-align:center">
    <a href="${NAVLUN_TABLOSU_URL}/navlun" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">Navlun Bildirimi'ni aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Ekteki Excel, operasyonun navlun tablosuyla aynı düzendedir (satır: liman · blok: acente / hat · sütun: ay, TRANSIT, FREE TIME) ve Navlun Bildirimi sayfasındaki "Excel indir" ile aynı dosyadır.<br>Hücre: o ay alınan son 20'DC teklifi; yeşil kalın = gerçekleşen navlun (yükleme planı). TRANSIT maillerden henüz okunmuyor.<br>Müşteriye gitmez.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
