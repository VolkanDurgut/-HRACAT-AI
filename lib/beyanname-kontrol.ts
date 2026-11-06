/**
 * GUMRUK BEYANNAMESI KONTROLU - YAPAY ZEKASIZ (06.11.2026). Saf modul (React / Supabase / unpdf yok;
 * tsx ile test edilir). Kullanici: "Beyannameler genelde hep ayni. Beyanname okutulsun ve en azindan
 * ucretsiz bir sekilde sistemdeki bilgiler ile kontrol saglanabilsin."
 *
 * Beyanname (Tek Tip Gumruk Beyannamesi, EX) PDF'leri metin katmanli; metin pdf.js (unpdf) ile cikar ama
 * kutularin SIRASI karisiktir (ornek: "LIMAN706 1 CIFGemi ORNEK GEMI"). Bu yuzden alanlar konuma gore
 * degil, bicimi belli ifadelerle aranir ve SISTEMDEKI degerin belgede gecip gecmedigine bakilir:
 *  - beyanname no (8 hane + EX + 8/9 hane), toplam fatura bedeli + doviz ("USD 103,000.00"),
 *  - fatura no'lari (UNX + yil + sira; sira SAYI olarak karsilastirilir: beyannamede fazladan 0 yazilmis
 *    "ABC20260000000012" ayni fatura sayilir), fatura tarihi,
 *  - konteyner no'lari (ISO 6346 kontrol hanesi tutanlar; "TSTU 1000003" gibi bolunmus yazim da),
 *  - DIIB no'lari (yil + sira; D1/D2 farki ayrica not), gemi adi, teslim sekli (Incoterm) + teslim yeri,
 *    gidecegi ulke, alici (unvan ya da bas harfleri: "O.D.T.L"),
 *  - net kg: tek kalemde kalemin neti; cok kalemde DEVAM LISTESI'ndeki "TOPLAM ... KGM".
 * Cok kalemli beyannamede (bolunmus DIIB) 2. ve sonraki kalemler ayri "Devam Listesi" PDF'indedir;
 * yuklenirse metni birlestirilir (DIIB no'lari ve toplam net oradan da okunur).
 * Kontrol SONUCU kayit degistirmez; yalniz gosterilir (ihracat_dosyalari.beyanname_kontrol_sonucu).
 */
import { gidecegiUlke } from "@/lib/ulke-bul";
import { limanAnahtari, sadelestir } from "@/lib/liman-anahtari";
import { diibAnahtari } from "@/lib/diib/hesap";

export type BeyannameOkunan = {
  beyannameNo: string | null;
  doviz: string | null;
  toplamBedel: number | null;
  faturalar: { ham: string; yil: string; sira: number }[];
  faturaTarihi: string | null; // YYYY-MM-DD
  konteynerler: string[];
  diibler: { anahtar: string; ham: string }[];
  gemi: string | null;
  incoterm: string | null;
  bulunduguYer: string | null;    // "esyanin bulundugu yer" (G + 4 hane antrepo/terminal kodu + ad), ham
  kalemNet: number | null;        // 1. kalemin net kg'i (ana sayfa)
  kalemKonteyner: number | null;  // 1. kalemdeki "N KONTEYNER"
  devamToplamNet: number | null;  // devam listesindeki TOPLAM ... KGM
  devamVar: boolean;
  metin: string;                  // sadelestirilmis tum metin (gecis kontrolleri icin)
};

/** "103,000.00" / "170.900,00" / "79,100." / "250000" -> sayi. Son ayirici ondaliktir (2 hane ise). */
export function belgeSayisi(ham: string | null | undefined): number | null {
  let s = String(ham || "").trim().replace(/\s+/g, "");
  if (!s) return null;
  s = s.replace(/[.,]$/, "");
  const sonNokta = s.lastIndexOf("."), sonVirgul = s.lastIndexOf(",");
  const son = Math.max(sonNokta, sonVirgul);
  if (son >= 0 && s.length - son - 1 <= 2 && !(sonNokta >= 0 && sonVirgul >= 0 && s.length - son - 1 === 3)) {
    const tam = s.slice(0, son).replace(/[.,]/g, "");
    const kesir = s.slice(son + 1);
    const n = Number(`${tam}.${kesir || "0"}`);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** ISO 6346 konteyner no kontrol hanesi (4 harf + 6 hane + kontrol hanesi). */
export function konteynerGecerli(no: string): boolean {
  const s = no.toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(s)) return false;
  const deger = (c: string) => {
    if (/\d/.test(c)) return Number(c);
    let v = 10;
    for (let k = 65; k <= c.charCodeAt(0); k++) {
      if (k === c.charCodeAt(0)) return v;
      v++;
      if (v % 11 === 0) v++;
    }
    return v;
  };
  let toplam = 0;
  for (let i = 0; i < 10; i++) toplam += deger(s[i]) * 2 ** i;
  return (toplam % 11) % 10 === Number(s[10]);
}

const INCOTERM = /(?:^|[^A-Z])(CIF|CFR|FOB|CPT|CIP|DAP|DDP|DPU|EXW|FCA|FAS|CNF)(?=GEMI|[^A-Z]|$)/;

/** Beyanname (+ varsa devam listesi) metinlerinden okunan alanlar. */
export function beyannameMetniOku(metinler: string[]): BeyannameOkunan {
  const hamTum = metinler.filter(Boolean).join("\n");
  const ust = hamTum.toLocaleUpperCase("tr-TR");
  const metin = sadelestir(hamTum).replace(/\s+/g, " ");
  const devamMetni = metinler.filter((m) => /DEVAM\s+L[İI]STES[İI]/i.test(m)).join("\n");
  const anaMetin = metinler.filter((m) => !/DEVAM\s+L[İI]STES[İI]/i.test(m)).join("\n");

  const nolar = new Set<string>();
  for (const m of Array.from(ust.matchAll(/(?<![0-9])(\d{8})\s?EX\s?(\d{8,9})(?![0-9])/g))) nolar.add(`${m[1]}EX${m[2]}`);

  const bedel = /\b(USD|EUR|GBP|TRY)\s*([\d.,]{4,})/.exec(anaMetin.toUpperCase() || ust);

  const faturalar: BeyannameOkunan["faturalar"] = [];
  for (const m of Array.from(ust.matchAll(/\b([A-Z]{3})\s?(20\d{2})(\d{6,12})\b/g))) {
    if (!faturalar.some((f) => f.ham === m[0].replace(/\s/g, ""))) faturalar.push({ ham: m[0].replace(/\s/g, ""), yil: m[2], sira: Number(m[3]) });
  }
  const ftTarih = /FATURA\s*:[^]*?(\d{2})[./](\d{2})[./](\d{4})/.exec(ust);

  const konteynerler = new Set<string>();
  // 4. harf ekipman kategorisi (U/J/Z); rakamlar arasina bosluk girebilir ("TSTU1 000003", "TSTU 1000019").
  // Yanlis eslesmeyi ISO 6346 kontrol hanesi eler.
  for (const m of Array.from(ust.matchAll(/\b([A-Z]{3}[UJZ])((?:\s?\d){7})(?![0-9])/g))) {
    const no = `${m[1]}${m[2].replace(/\s+/g, "")}`;
    if (konteynerGecerli(no)) konteynerler.add(no);
  }

  const diibler: BeyannameOkunan["diibler"] = [];
  for (const m of Array.from(ust.matchAll(/(20\d{2})\s*[/\- ]?\s*D\s*\d\s*[/\- ]?\s*(\d{4,6})\b/g))) {
    const a = diibAnahtari(m[0]);
    if (a && !diibler.some((d) => d.anahtar === a)) diibler.push({ anahtar: a, ham: m[0].replace(/\s+/g, "") });
  }

  // "Gemi ORNEK GEMI 49.95" / "Gemi MV ORNEK YILDIZ / 26 / 469"
  const gemi = /GEMI\s+([A-Z][A-Z0-9 .\-]*?[A-Z])(?=\s*(?:\/|\d|GEMI|$))/.exec(metin);
  const inco = INCOTERM.exec(metin);
  // Esyanin bulundugu yer: "G0060 MARPORT" (onceki kutuya bitisik "ODEMEG0060" olabilir; sonraki kutu da bitisik: "G0060 ORNEKPORTAMBARLI GUMRUK..." olabilir)
  const yer = /G\d{4}\s?([A-Z]{3,})/.exec(sadelestir(anaMetin));
  const kalemNet = /(\d+)\s*KONTEYNER\s+([\d.,]+)\s*KGM/.exec(sadelestir(anaMetin));
  const devamNet = /KGM\s*([\d.]+,\d{2})\s*GENEL\s+TOPLAM/.exec(sadelestir(devamMetni)) || /TOPLAM\s*:[^]*?([\d.]+,\d{2})\s*KGM/.exec(sadelestir(devamMetni));

  return {
    beyannameNo: nolar.size === 1 ? Array.from(nolar)[0] : null,
    doviz: bedel ? bedel[1] : null,
    toplamBedel: bedel ? belgeSayisi(bedel[2]) : null,
    faturalar,
    faturaTarihi: ftTarih ? `${ftTarih[3]}-${ftTarih[2]}-${ftTarih[1]}` : null,
    konteynerler: Array.from(konteynerler),
    diibler,
    gemi: gemi ? gemi[1].trim() : null,
    incoterm: inco ? inco[1] : null,
    bulunduguYer: yer ? yer[1] : null,
    kalemNet: kalemNet ? belgeSayisi(kalemNet[2]) : null,
    kalemKonteyner: kalemNet ? Number(kalemNet[1]) : null,
    devamToplamNet: devamNet ? belgeSayisi(devamNet[1]) : null,
    devamVar: !!devamMetni,
    metin,
  };
}

/** Turkiye liman / terminal adlari (esyanin bulundugu yer karsilastirmasi). Uzun ad once. */
const TERMINALLER = [
  "HAYDARPASA", "ISKENDERUN", "ASYAPORT", "BANDIRMA", "TEKIRDAG", "DERINCE", "MARPORT", "KUMPORT", "NEMPORT",
  "BORUSAN", "AMBARLI", "TRABZON", "MARDAS", "MARTAS", "AKPORT", "GEMLIK", "ALIAGA", "MERSIN", "SAMSUN", "EVYAP", "IZMIR",
];
/** Sistemdeki yukleme limani metninden terminal adi ("Marport / Ambarli" -> MARPORT; taninmazsa ilk kelime). */
function terminalAdi(ham: string): string {
  const s = ` ${sadelestir(ham).replace(/[^A-Z0-9]+/g, " ").trim()} `;
  const terminaller = TERMINALLER.filter((t) => s.includes(` ${t} `));
  // "AMBARLI" hem ilce hem gumruk adi: daha belirgin bir terminal yazildiysa o alinir
  return terminaller.find((t) => t !== "AMBARLI") || terminaller[0] || s.trim().split(" ")[0] || "";
}

export type BeyannameBeklenen = {
  faturaNolari: string[];          // dosyanin faturasi + bolunmus parcalarin faturalari
  faturaTarihi: string | null;     // YYYY-MM-DD
  toplamTutar: number | null;
  paraBirimi: string | null;
  teslimSekli: string | null;
  varisLimani: string | null;
  /** Yukleme limani / terminali: rezervasyon(lar)dan, yoksa dosyadan. */
  yuklemeYerleri?: string[];
  aliciFirma: string | null;
  gemiler: string[];
  konteynerler: string[];
  netKg: number | null;            // konteyner netlerinin toplami (hepsi doluysa)
  diibler: { anahtar: string; belgeNo: string }[];
};

export type KontrolDurumu = "uyumlu" | "uyusmuyor" | "okunamadi" | "bilgi";
export type BeyannameKontrolu = { alan: string; durum: KontrolDurumu; sistem: string; belge: string; not?: string };
export type BeyannameKontrolSonucu = {
  kaynak: "metin";
  uyumlu: boolean;
  beyanname_no: string | null;
  kontroller: BeyannameKontrolu[];
  ozet: string;
  devam_var: boolean;
  /** Devam listesi sonradan eklenince ana sayfa yeniden okunmasin diye ana sayfa metni (yalniz okunan alanlar icin) */
  ana_metin?: string;
  tarih: string;
};

const sayiYaz = (n: number | null, en = 2) => (n === null ? "-" : n.toLocaleString("tr-TR", { maximumFractionDigits: en }));
const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "-");
const faturaParcala = (no: string) => {
  const m = /^([A-Z]{3})(20\d{2})(\d{6,12})$/.exec(no.replace(/\s+/g, "").toUpperCase());
  return m ? { onEk: m[1], yil: m[2], sira: Number(m[3]), ham: m[0] } : null;
};
/** Unvanin bas harfleri deseni: "ORNEK DIS TICARET LTD" -> O.D.T.L */
function basHarfDeseni(unvan: string): RegExp | null {
  const k = sadelestir(unvan).split(/[^A-Z0-9]+/).filter(Boolean);
  if (k.length < 2) return null;
  return new RegExp(`(?:^|[^A-Z])${k.map((x) => x[0]).join("\\.?\\s?")}(?=[^A-Z]|$)`);
}

/** Okunan beyanname <-> sistem. Uyusmayan bir zorunlu alan varsa uyumlu=false. */
export function beyannameKarsilastir(o: BeyannameOkunan, b: BeyannameBeklenen, simdi = new Date().toISOString()): BeyannameKontrolSonucu {
  const k: BeyannameKontrolu[] = [];
  const ekle = (alan: string, durum: KontrolDurumu, sistem: string, belge: string, not?: string) => k.push({ alan, durum, sistem, belge, ...(not ? { not } : {}) });

  // Fatura no'lari
  const sistemF = b.faturaNolari.map(faturaParcala).filter((x): x is NonNullable<ReturnType<typeof faturaParcala>> => !!x);
  if (!sistemF.length) ekle("Fatura no", "bilgi", "-", o.faturalar.map((f) => f.ham).join(", ") || "-", "Sistemde fatura no yok.");
  else if (!o.faturalar.length) ekle("Fatura no", "okunamadi", sistemF.map((f) => f.ham).join(", "), "-");
  else {
    const eksik = sistemF.filter((s) => !o.faturalar.some((f) => f.yil === s.yil && f.sira === s.sira));
    ekle("Fatura no", eksik.length ? "uyusmuyor" : "uyumlu", sistemF.map((f) => f.ham).join(", "), o.faturalar.map((f) => f.ham).join(", "),
      // Musavir sira numarasini 10 hane yaziyor (ABC20260000000012); sira SAYI olarak ayni ise ayni fatura
      eksik.length ? `Beyannamede yok: ${eksik.map((f) => f.ham).join(", ")}` : undefined);
  }
  if (b.faturaTarihi) ekle("Fatura tarihi", !o.faturaTarihi ? "okunamadi" : o.faturaTarihi === b.faturaTarihi ? "uyumlu" : "uyusmuyor", trTarih(b.faturaTarihi), trTarih(o.faturaTarihi));

  // Toplam fatura bedeli
  if (b.toplamTutar !== null) {
    const ayni = o.toplamBedel !== null && Math.abs(o.toplamBedel - b.toplamTutar) <= 1 && (!o.doviz || !b.paraBirimi || o.doviz === b.paraBirimi.toUpperCase());
    ekle("Toplam fatura bedeli", o.toplamBedel === null ? "okunamadi" : ayni ? "uyumlu" : "uyusmuyor",
      `${sayiYaz(b.toplamTutar)} ${b.paraBirimi || ""}`.trim(), o.toplamBedel === null ? "-" : `${sayiYaz(o.toplamBedel)} ${o.doviz || ""}`.trim());
  }

  // Konteynerler
  if (b.konteynerler.length) {
    const sis = new Set(b.konteynerler.map((x) => x.replace(/\s+/g, "").toUpperCase()));
    const bel = new Set(o.konteynerler);
    const eksik = Array.from(sis).filter((x) => !bel.has(x));
    const fazla = Array.from(bel).filter((x) => !sis.has(x));
    const not = [eksik.length ? `Beyannamede yok: ${eksik.join(", ")}` : "", fazla.length ? `Sistemde yok: ${fazla.join(", ")}` : ""].filter(Boolean).join(" · ");
    ekle("Konteynerler", !bel.size ? "okunamadi" : eksik.length || fazla.length ? "uyusmuyor" : "uyumlu", `${sis.size} konteyner`, `${bel.size} konteyner`, not || undefined);
  }

  // Net kg
  if (b.netKg !== null) {
    const tekKalem = o.kalemKonteyner !== null && o.kalemKonteyner >= o.konteynerler.length && !o.devamVar && o.diibler.length <= 1;
    const belgeNet = o.devamToplamNet ?? (tekKalem ? o.kalemNet : null);
    if (belgeNet === null) {
      ekle("Net ağırlık (toplam)", "okunamadi", `${sayiYaz(b.netKg)} kg`, o.kalemNet !== null ? `1. kalem ${sayiYaz(o.kalemNet)} kg` : "-",
        o.kalemNet !== null ? "Beyanname birden çok kalemli; toplam net Devam Listesi'nde. Devam listesini ekleyin." : undefined);
    } else ekle("Net ağırlık (toplam)", Math.abs(belgeNet - b.netKg) <= 1 ? "uyumlu" : "uyusmuyor", `${sayiYaz(b.netKg)} kg`, `${sayiYaz(belgeNet)} kg`);
  }

  // DIIB
  if (b.diibler.length) {
    const eksik = b.diibler.filter((d) => !o.diibler.some((x) => x.anahtar === d.anahtar));
    const dFarki = b.diibler.filter((d) => {
      const x = o.diibler.find((y) => y.anahtar === d.anahtar);
      const dHane = (s: string) => /D\s*(\d)/i.exec(s)?.[1];
      return x && dHane(x.ham) && dHane(d.belgeNo) && dHane(x.ham) !== dHane(d.belgeNo);
    });
    const devamGerekli = eksik.length > 0 && !o.devamVar && o.diibler.length > 0;
    ekle("DİİB", !o.diibler.length ? "okunamadi" : eksik.length ? (devamGerekli ? "okunamadi" : "uyusmuyor") : "uyumlu",
      b.diibler.map((d) => d.belgeNo).join(", "), o.diibler.map((d) => d.ham).join(", ") || "-",
      eksik.length
        ? (devamGerekli ? `${eksik.map((d) => d.belgeNo).join(", ")} ana sayfada yok; 2. kalem Devam Listesi'nde olmalı. Devam listesini ekleyin.` : `Beyannamede yok: ${eksik.map((d) => d.belgeNo).join(", ")}`)
        : dFarki.length ? `Belge numarası aynı, D harfinden sonraki hane farklı (sistem ${dFarki.map((d) => d.belgeNo).join(", ")}). DİİB belgesindeki numarayı teyit edin.` : undefined);
  }

  // Gemi
  if (b.gemiler.length) {
    const gemiAdi = (g: string) => sadelestir(g).replace(/^(M\/?V|M\/?S|MT)\s+/, "").replace(/\s+/g, " ").trim();
    const s = gemiAdi(o.gemi || "");
    const ayni = !!s && b.gemiler.some((g) => gemiAdi(g) === s);
    ekle("Gemi", !o.gemi ? "okunamadi" : ayni ? "uyumlu" : "uyusmuyor", b.gemiler.join(", "), o.gemi || "-");
  }

  // Teslim sekli + yeri
  if (b.teslimSekli) {
    const t = sadelestir(b.teslimSekli).replace(/[^A-Z]/g, "").slice(0, 3);
    ekle("Teslim şekli", !o.incoterm ? "okunamadi" : o.incoterm === t || (t === "CFR" && o.incoterm === "CNF") ? "uyumlu" : "uyusmuyor", b.teslimSekli, o.incoterm || "-");
  }
  // Yukleme yeri (06.11.2026): beyannamedeki "esyanin bulundugu yer" ile rezervasyonun yukleme limani.
  // Kutular bitisik yazilabildigi icin (".. MARPORTAMBARLI GUMRUK") BASLANGIC eslesmesine bakilir.
  if (b.yuklemeYerleri && b.yuklemeYerleri.length) {
    const sistem = b.yuklemeYerleri.map(terminalAdi).filter(Boolean);
    const belgeYer = o.bulunduguYer;
    const belgeTerminal = belgeYer ? TERMINALLER.find((t) => belgeYer.startsWith(t)) || null : null;
    const tutuyor = !!belgeYer && sistem.some((t) => belgeYer.startsWith(t));
    ekle("Yükleme yeri", tutuyor ? "uyumlu" : !belgeYer ? "bilgi" : belgeTerminal ? "uyusmuyor" : "bilgi",
      b.yuklemeYerleri.join(", "), tutuyor ? sistem.find((t) => belgeYer!.startsWith(t))! : belgeTerminal || belgeYer || "-",
      tutuyor ? undefined : !belgeYer ? "Eşyanın bulunduğu yer beyannamede okunamadı; elle bakın."
        : belgeTerminal ? "Beyannamedeki eşyanın bulunduğu yer, rezervasyondaki yükleme limanından farklı." : "Yer adı tanınmadı; elle bakın.");
  }
  if (b.varisLimani) {
    const anahtar = limanAnahtari(b.varisLimani);
    const ilk = anahtar ? anahtar.split(" ")[0] : "";
    ekle("Varış / teslim yeri", ilk && ` ${o.metin} `.includes(` ${ilk} `) ? "uyumlu" : "bilgi", b.varisLimani, ilk && ` ${o.metin} `.includes(` ${ilk} `) ? ilk : "-",
      ilk && ` ${o.metin} `.includes(` ${ilk} `) ? undefined : "Liman adı beyannamede bulunamadı; elle bakın.");
    const ulke = gidecegiUlke(b.varisLimani);
    if (ulke) {
      const u = sadelestir(ulke);
      ekle("Gideceği ülke", ` ${o.metin} `.includes(` ${u} `) ? "uyumlu" : "uyusmuyor", ulke, ` ${o.metin} `.includes(` ${u} `) ? ulke : "-");
    }
  }

  // Alici: unvan ya da bas harfleri (musavirler kisaltabiliyor) - yalniz bilgi
  if (b.aliciFirma) {
    const ilkKelime = sadelestir(b.aliciFirma).split(/[^A-Z0-9]+/).filter((x) => x.length >= 3)[0] || "";
    const desen = basHarfDeseni(b.aliciFirma);
    const var_ = (ilkKelime && ` ${o.metin} `.includes(` ${ilkKelime} `)) || (desen ? desen.test(o.metin) : false);
    ekle("Alıcı", var_ ? "uyumlu" : "bilgi", b.aliciFirma, var_ ? (desen && desen.test(o.metin) && !(` ${o.metin} `.includes(` ${ilkKelime} `)) ? "baş harfleriyle yazılmış" : "var") : "-",
      var_ ? undefined : "Alıcı adı beyannamede bulunamadı; kısaltılmış olabilir, elle bakın.");
  }

  const uyusmayan = k.filter((x) => x.durum === "uyusmuyor");
  const okunamayan = k.filter((x) => x.durum === "okunamadi");
  const notlu = k.filter((x) => x.durum === "uyumlu" && x.not);
  const ozet = uyusmayan.length
    ? `${uyusmayan.length} alan sistemle uyuşmuyor: ${uyusmayan.map((x) => x.alan).join(", ")}.`
    : `${k.filter((x) => x.durum === "uyumlu").length} alan sistemle uyumlu${okunamayan.length ? `; ${okunamayan.length} alan okunamadı (${okunamayan.map((x) => x.alan).join(", ")})` : ""}${notlu.length ? `; ${notlu.length} not var` : ""}.`;
  return { kaynak: "metin", uyumlu: uyusmayan.length === 0, beyanname_no: o.beyannameNo, kontroller: k, ozet, devam_var: o.devamVar, tarih: simdi };
}
