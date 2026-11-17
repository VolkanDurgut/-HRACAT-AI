// Operasyon Ajanı — kural motoru (Faz 1, saf fonksiyonlar). Acenteye özgü bilgi (alan adı, booking deseni)
// koda yazılmaz: çağıran AjanAyar ile verir (repo herkese açık; değerler veritabanında).
// Girdi: tek mail (konu, gönderen, yeni metin). Çıktı: bağlama + olay + alanlar.
// İlke: emin değilse bağlamaz / alan yazmaz (kuyruğa düşer). Yanlış bağlama = 0 hedefi.

export type Mail = {
  id: string;
  tarih: string;
  gonderen: string;
  konu: string;
  govde: string; // ham gövde (alıntılar dahil olabilir)
  acenteKatilimi: boolean; // from/to/cc içinde pilot acentenin alan adı var mı
};

export type AjanAyar = {
  acenteAlanlari: string[]; // ör. ["ornek-acente.test"]
  bookingDeseni: string; // regex kaynağı, ör. "BK\\d{3}" (bayraksız)
};

export type Guven = "kesin" | "guclu" | "zayif" | "yok";

export type Sonuc = {
  kapsamda: boolean;
  booking: string | null; // otomatik bağlanan booking
  oneri: string | null; // insan onayına giden aday
  guven: Guven;
  gerekce: string;
  olay: string | null; // null = tanınmadı (yapay zekâ / insan kuyruğu)
  olaylar: string[]; // ana olay + aynı maildeki ikincil işler
  alanlar: Record<string, string>;
  kanit: Record<string, string>; // alan -> ham metindeki birebir dize
};

function bookingRe(a: AjanAyar): RegExp {
  return new RegExp(a.bookingDeseni, "gi");
}
function ekipmanRefRe(a: AjanAyar): RegExp {
  return new RegExp(`\\b(${a.bookingDeseni})X(\\d{6})\\b`, "gi");
}
const KONTEYNER = /\b([A-Z]{3}U)\s?(\d{7})\b/g;
const ECTN = /\bCTN[A-Z]{3}\d{10}\b/g;

/** Alıntı öncesi yeni metin: ilk "From:" / "Gönderen:" / "-----Original" başlığına kadar. */
export function yeniMetin(govde: string): string {
  const m = govde.search(/\n\s*(From|Gönderen|Kimden)\s*:|\n-{3,}\s*Original Message|\n_{5,}/i);
  return m >= 0 ? govde.slice(0, m) : govde;
}

export function iso6346Gecerli(k: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(k)) return false;
  const deger: Record<string, number> = {};
  let n = 10;
  for (const h of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (n % 11 === 0) n++;
    deger[h] = n++;
  }
  let t = 0;
  for (let i = 0; i < 10; i++) {
    const c = k[i];
    t += (/[A-Z]/.test(c) ? deger[c] : Number(c)) * 2 ** i;
  }
  return (t % 11) % 10 === Number(k[10]);
}

function tekil<T>(a: T[]): T[] {
  return Array.from(new Set(a));
}

function bookinglar(s: string, a: AjanAyar): string[] {
  return tekil((s.match(bookingRe(a)) || []).map((b) => b.toUpperCase()));
}

/** Geçerli takvim tarihi mi (gg.aa.yyyy), değilse null — "05.11.20226" gibi yazım hataları reddedilir. */
export function tarihOku(s: string): string | null {
  const m = s.match(/^\s*(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)(?:\s+(\d{1,2})[.:](\d{2}))?\s*$/);
  if (!m) return null;
  const [g, a, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2024 || y > 2035 || a < 1 || a > 12 || g < 1) return null;
  const son = new Date(Date.UTC(y, a, 0)).getUTCDate();
  if (g > son) return null;
  const t = `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  return m[4] ? `${t} ${m[4].padStart(2, "0")}:${m[5]}` : t;
}

/** "Etiket\n[boş satır]\nDeğer" yapısındaki tablodan etiketin ilk dolu değer satırı. */
function etiketDegeri(metin: string, etiket: RegExp): string | null {
  const satirlar = metin.split(/\r?\n/);
  for (let i = 0; i < satirlar.length; i++) {
    if (etiket.test(satirlar[i].trim())) {
      for (let j = i + 1; j < Math.min(i + 3, satirlar.length); j++) {
        const d = satirlar[j].trim();
        if (d) return d;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- sınıflandırma
type Kural = { olay: string; kim?: "acente" | "unex" | "sistem" | "herkes"; konu?: RegExp; metin?: RegExp; gonderen?: RegExp };

// Sıra önemlidir: özelden genele.
const KURALLAR: Kural[] = [
  { olay: "kalkis_bildirimi", kim: "acente", gonderen: /^no-?reply@/i, konu: /DEPARTURE NOTICE/i },
  { olay: "fatura_talimati_hazir", gonderen: /@ihracatasistanim\.com$/i, metin: /fatura talimat[ıi] haz[ıi]r/i },
  // finans / release
  { olay: "finans_onay_talebi", kim: "acente", metin: /tahsilat@\S*\s*onay|onay rica ederiz/i },
  { olay: "finans_onayi", kim: "acente", metin: /^\s*merhaba,?\s*i[şs]lem yap[ıi]labilir/i },
  { olay: "release_tamam", kim: "acente", metin: /release i[şs]leminiz ger[çc]ekle[şs]tirilmi[şs]tir/i },
  { olay: "release_turu_sorusu", kim: "acente", metin: /release veya orijinal kon[şs]imento bas[ıi]m/i },
  { olay: "telex_talebi", kim: "unex", metin: /telex release/i },
  // booking yaşam döngüsü
  { olay: "booking_iptal", kim: "acente", metin: /rezervasyonunuz iptal edilmi[şs]tir/i },
  { olay: "booking_iptal_talebi", kim: "unex", metin: /iptalini rica/i },
  { olay: "booking_guncelleme", kim: "acente", metin: /rezervasyonunuz .{0,30}g[üu]ncellenmi[şs]tir/i },
  { olay: "booking_onayi", kim: "acente", metin: /rezervasyonunuz al[ıi]nm[ıi]st[ıi]r/i },
  { olay: "booking_revize_talebi", kim: "unex", konu: /BOOKING CONFIRMATION/i, metin: /olarak revize edilmesini/i },
  { olay: "rezervasyon_revize", kim: "unex", konu: /REZERVASYON TALEB/i, metin: /dikkate alman[ıi]z[ıi]|bekletelim|i[çc]indir|gemisine al[ıi]nacak/i },
  { olay: "rezervasyon_talebi", kim: "unex", metin: /rezervasyon talebimizin i[şs]leme al[ıi]nmas[ıi]n[ıi]/i },
  // ekipman / liman
  { olay: "ekipman_referansi", kim: "acente", metin: /EKIPMAN_REF/ }, // metin: ayardan (siniflandir)
  { olay: "dolu_giris_cevabi", kim: "acente", metin: /dolu giri[şs] talebiniz iletilmi[şs]tir|limana tekrar bilgi verilmi[şs]tir/i },
  { olay: "liman_giris_sorunu", kim: "unex", metin: /aktif booking kayd[ıi]|sorun hala devam|limana girmek [üu]zere|liman sistemi/i },
  { olay: "dolu_giris_talebi", kim: "unex", metin: /dolu giri[şs] (kayd[ıi]|talebi)/i },
  { olay: "ek_sure_talebi", kim: "unex", metin: /ek s[üu]re rica/i },
  { olay: "ekipman_talebi", kim: "unex", metin: /ekipman al[ıi]m|ardiyesiz giri[şs] rica|ekipman alabilece|konteynerlerin? [^.]{0,40}(liman|depo)[^.]{0,10} al[ıi]nmas[ıi]/i },
  { olay: "gemi_programi", kim: "acente", metin: /(m\/v [^\n]*){2,}|yuk alimina acilm|sefer ozelinde/i },
  { olay: "ekipman_cevabi", kim: "acente", metin: /ardiyesiz giri[şs]|masraf olu[şs]mayacakt[ıi]r|^\s*merhabalar;?\s*uygundur/i },
  // evrak
  { olay: "si_gonderimi", kim: "unex", metin: /kon[şs]imento talimat[ıi] ektedir|talimat revize olmu[şs]tur/i },
  { olay: "vgm_gonderimi", kim: "unex", metin: /^\s*merhabalar?,?\s*vgm sonu[çc]lar[ıi] ektedir/i },
  { olay: "draft_onayi", kim: "unex", metin: /draft onayl[ıi]d[ıi]r|^\s*merhaba,?\s*uygundur/i },
  { olay: "beyanname_gonderimi", kim: "unex", metin: /^\s*merhabalar?,?\s*beyanname ektedir/i },
  { olay: "beyanname_talebi", kim: "unex", metin: /beyanname rica/i },
  { olay: "obl_talebi", kim: "unex", metin: /OBL g[öo]r[üu]nt[üu]s[üu]/i },
  { olay: "draft_bl_talebi", kim: "unex", metin: /draft[ıi]n?[ıi]? iletmenizi rica|draft[ıi] iletmenizi/i },
  { olay: "draft_duzeltme", kim: "unex", metin: /draft[ıi]?na .{0,40}eklenmesini|eklenmesini rica|d[üu]zelttik|yerine .{0,30}konteyner|m[üu]h[üu]r numaralar[ıi] yer almaktad[ıi]r|m[üu]h[üu]r numaralar[ıi]n[ıi]n eklenmesini/i },
  { olay: "draft_duzeltildi", kim: "acente", metin: /correction ge[çc]ilmi[şs]tir/i },
  { olay: "masraf_bildirimi", kim: "acente", metin: /masraf[ıi] olu[şs]acakt[ıi]r/i },
  { olay: "obl_geldi", kim: "acente", metin: /revize BL ektedir/i },
  { olay: "draft_bl_geldi", kim: "acente", metin: /kon[şs]imento tasla[ğg][ıi]n[ıi]|revize draft|eklenmi[şs]tir\. ekli [şs]ekilde uygunsa|^\s*merhaba,?\s*ektedir/i },
  { olay: "odeme_dekontu", metin: /[öo]deme dekontu sunulmaktad[ıi]r/i },
  // program / navlun
  { olay: "gemi_programi_talebi", kim: "unex", metin: /gemi program[ıi]/i },
  { olay: "gemi_programi", kim: "acente", metin: /ardiyesiz giri[şs]|y[üu]k al[ıi]m[ıi]na a[çc][ıi]lm/i },
  { olay: "navlun_pazarligi", gonderen: /^bbt@/i, konu: /NAVLUN TALEB/i },
  { olay: "navlun_talebi", kim: "unex", konu: /NAVLUN TALEB/i },
  // iç yazışma (muhasebe / gümrük)
  { olay: "fatura_beyanname_talimati", kim: "unex", konu: /^FATURA VE BEYANNAME TALIMATI/i, metin: /fatura ve beyanname i[çc]in talimat/i },
  { olay: "fatura_duzeltme", gonderen: /^muhasebe/i, metin: /reddi konusunda/i },
  { olay: "fatura_kesildi", gonderen: /^muhasebe/i, metin: /fatura\S*\s*(ektedir|ekte ilet)|faturay[ıi] ekte/i },
  { olay: "musteri_evraki", gonderen: /^export@/i, konu: /SHIPPING DOCUMENTS/i, metin: /shipment documents/i },
  { olay: "odeme_hatirlatma", gonderen: /^export@/i, metin: /outstanding balance|remind you/i },
  { olay: "bilgi_yaniti", kim: "unex", metin: /dikkate alabilirsiniz|iletilecektir|masrafs[ıi]z ilerlenecek|etiket de[ğg]ildir/i },
  { olay: "genel_cevap", metin: /^\s*@operasyon|^\s*(bonjour|merhaba)[^.]{0,40}(bien re[çc]u|al[ıi]nd[ıi])/i },
];

function rol(g: string, a: AjanAyar): "acente" | "unex" | "sistem" | "diger" {
  const alan = (g.split("@")[1] || "").toLowerCase();
  if (a.acenteAlanlari.some((x) => alan === x || alan.endsWith(`.${x}`))) return "acente";
  if (/@ihracatasistanim\.com$/i.test(g)) return "sistem";
  if (/@unex\.com\.tr$/i.test(g)) return "unex";
  return "diger";
}

/** Sınıflandırma için Türkçe-güvenli sadeleştirme: küçük harf, aksan ve noktasız ı yok. */
export function sade(s: string): string {
  return s.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");
}

// Ana olaya ek olarak aynı mailde geçen ikincil işler (ör. "Draft onaylıdır. VGM sonuçları ekte").
const IKINCIL: { olay: string; kim: "unex" | "acente"; metin: RegExp }[] = [
  { olay: "vgm_gonderimi", kim: "unex", metin: /vgm sonu[çc]lar[ıi]n?[ıi]? ekte/i },
  { olay: "si_gonderimi", kim: "unex", metin: /kon[şs]imento talimat[ıi] ektedir/i },
  { olay: "beyanname_gonderimi", kim: "unex", metin: /beyanname ektedir/i },
  { olay: "draft_onayi", kim: "unex", metin: /draft onayl[ıi]d[ıi]r/i },
  { olay: "dolu_giris_talebi", kim: "unex", metin: /dolu giri[şs] (kayd[ıi]|talebi)/i },
];

export function siniflandirCoklu(m: Mail, yeniHam: string, a: AjanAyar): string[] {
  const ana = siniflandir(m, yeniHam, a);
  if (!ana) return [];
  const r = rol(m.gonderen, a);
  const yeni = sade(yeniHam);
  const ek = IKINCIL.filter((k) => k.kim === r && k.olay !== ana && k.metin.test(yeni)).map((k) => k.olay);
  return [ana, ...ek];
}

export function siniflandir(m: Mail, yeniHam: string, a: AjanAyar): string | null {
  const r = rol(m.gonderen, a);
  const refRe = new RegExp(`${a.bookingDeseni}X\\d{6}`, "i");
  const yeni = sade(yeniHam);
  const konu = sade(m.konu);
  for (const k of KURALLAR) {
    if (k.kim && k.kim !== "herkes" && k.kim !== r) continue;
    if (k.gonderen && !k.gonderen.test(m.gonderen)) continue;
    if (k.konu && !k.konu.test(konu)) continue;
    if (k.olay === "ekipman_referansi") {
      if (!refRe.test(yeniHam)) continue;
    } else if (k.metin && !k.metin.test(yeni)) continue;
    return k.olay;
  }
  return null;
}

// ---------------------------------------------------------------- alan çıkarma
/** DV (dry van) ve DC (dry container) aynı ekipman: tek koda indirgenir. */
function tipNorm(boy: string, kod: string): string {
  const k = kod.toUpperCase();
  return `${boy}${k === "DV" ? "DC" : k === "HQ" ? "HC" : k}`;
}
function konuAlanlari(konu: string, ayar: AjanAyar): Record<string, string> {
  const a: Record<string, string> = {};
  const b = bookinglar(konu, ayar);
  if (b.length === 1) a.booking = b[0];
  const k = konu.match(/(?:^|\/\/)\s*(\d{1,3})\s*\*\s*(20|40)\s*'?\s*(DV|DC|HC|HQ)\b/i);
  if (k) {
    a.adet = k[1];
    a.tip = tipNorm(k[2], k[3]);
  }
  const p = konu.match(/AMBARLI\s*-\s*([A-Z ]+?)\s*\/\//i);
  if (p) a.pod = p[1].trim().toUpperCase();
  const seferler = tekil(konu.match(/\b[A-Z]{3}\d{4}[A-Z]\b/g) || []);
  if (seferler.length === 1) a.sefer = seferler[0];
  return a;
}

function govdeAlanlari(yeni: string): Record<string, string> {
  const a: Record<string, string> = {};
  // "[ \t]" (\s degil): \s satir sonunu da yutar, onceki bos satir eslesmeye girer ve "M/V" soyulamazdi.
  const gemi = etiketDegeri(yeni, /^Gemi İsmi$/i) ?? (yeni.match(/^[ \t]*(M\/V[ \t]+.+)$/m)?.[1] ?? null);
  if (gemi) a.gemi = gemi.replace(/^M\/V\s+/i, "").trim().toUpperCase();
  const sefer = etiketDegeri(yeni, /^Sefer$/i) ?? yeni.match(/^\s*([A-Z]{3}\d{4}[A-Z])\s*$/m)?.[1] ?? null;
  if (sefer && /^[A-Z]{3}\d{4}[A-Z]$/.test(sefer)) a.sefer = sefer;
  const tablo: [string, RegExp][] = [
    ["ardiyesiz", /^(Marport\s+|Safiport\s+)?Ardiyesiz Giriş$/i],
    ["si_cutoff", /^Konşimento Talimatı Cut Off$/i],
    ["beyan_cutoff", /^(Beyanname|Marport) Cut Off$/i],
    ["etd", /^(Marport|Ambarlı|Ambarli)\s+ETS$/i],
  ];
  for (const [ad, re] of tablo) {
    const d = etiketDegeri(yeni, re);
    const t = d ? tarihOku(d) : null;
    if (t) a[ad] = t;
  }
  // varış ETA: yükleme limanı ETA'sı ("Marport ETA") DEĞİL.
  const satirlar = yeni.split(/\r?\n/);
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i].trim();
    if (/^[A-ZÇĞİÖŞÜ ]+ ETA$/.test(s) && !/^(MARPORT|AMBARLI|SAFIPORT|KUMPORT|EVYAP)\b/i.test(s)) {
      const t = tarihOku(satirlar[i + 1] ?? "");
      if (t) a.eta = t;
    }
  }
  return a;
}

function serbestAlanlar(metin: string, ayar: AjanAyar): Record<string, string> {
  const a: Record<string, string> = {};
  const ref = tekil(Array.from(metin.matchAll(ekipmanRefRe(ayar))).map((m) => `${m[1].toUpperCase()}X${m[2]}`));
  if (ref.length === 1) a.ekipman_ref = ref[0];
  const kont: string[] = [];
  const muhur: string[] = [];
  for (const m of Array.from(metin.matchAll(KONTEYNER))) {
    const k = `${m[1]}${m[2]}`;
    if (!iso6346Gecerli(k)) continue;
    if (!kont.includes(k)) kont.push(k);
    const sonra = metin.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
    const mm = sonra.match(/^\s*[-–]?\s*(\d{6})\b/);
    if (mm && !muhur.includes(mm[1])) muhur.push(mm[1]);
  }
  if (kont.length) a.konteyner = kont.join(",");
  if (muhur.length) a.muhur = muhur.join(",");
  const e = tekil(metin.match(ECTN) || []);
  if (e.length === 1) a.ectn = e[0];
  return a;
}

/** Halüsinasyon kilidi: değer (ya da ham kaynağı) metinde birebir geçmeli. */
function kanitBul(ham: string, alan: string, deger: string): string | null {
  if (["ardiyesiz", "si_cutoff", "beyan_cutoff", "etd", "eta"].includes(alan)) {
    const [t, saat] = deger.split(" ");
    const [y, a, g] = t.split("-");
    const gun = `(?<!\\d)0?${Number(g)}[./]0?${Number(a)}[./]${y}(?!\\d)`;
    const saatRe = saat ? `\\s+${saat.split(":")[0]}[.:]${saat.split(":")[1]}` : "";
    const m = ham.match(new RegExp(gun + saatRe));
    return m ? m[0] : null;
  }
  if (alan === "tip") {
    const m = ham.match(new RegExp(`${deger.slice(0, 2)}\\s*'?\\s*(DV|DC|HC|HQ)`, "i"));
    return m ? m[0] : null;
  }
  for (const parca of deger.split(",")) {
    if (!ham.toUpperCase().includes(parca.toUpperCase())) return null;
  }
  return deger;
}

// ---------------------------------------------------------------- bağlama
export type Durum = { konteynerBooking: Map<string, string> };

export function yeniDurum(): Durum {
  return { konteynerBooking: new Map() };
}

export function isle(m: Mail, d: Durum, ayar: AjanAyar): Sonuc {
  const yeni = yeniMetin(m.govde);
  const konuB = bookinglar(m.konu, ayar);
  const metinB = bookinglar(yeni.replace(ekipmanRefRe(ayar), (_x, b: string) => b), ayar);
  const kapsamda = m.acenteKatilimi || konuB.length > 0 || metinB.length > 0;
  const bos: Sonuc = { kapsamda, booking: null, oneri: null, guven: "yok", gerekce: "", olay: null, olaylar: [], alanlar: {}, kanit: {} };
  if (!kapsamda) return { ...bos, gerekce: "kapsam dışı (acente yok)" };

  const olaylar = siniflandirCoklu(m, yeni, ayar);
  const olay = olaylar[0] ?? null;
  const ham = `${m.konu}\n${yeni}`;
  let alanlar: Record<string, string> = { ...serbestAlanlar(yeni, ayar) };
  if (olay === "booking_onayi" || olay === "booking_guncelleme" || olay === "kalkis_bildirimi") {
    alanlar = { ...alanlar, ...konuAlanlari(m.konu, ayar), ...govdeAlanlari(yeni) };
    // güncellemede adet/tip yeni metinden ("10*20DV olarak güncellenmiştir") konuya üstün
    const g = yeni.match(/(\d{1,3})\s*\*\s*(20|40)\s*(DV|DC|HC)\s+olarak g[üu]ncellenmi/i);
    if (g) {
      alanlar.adet = g[1];
      alanlar.tip = tipNorm(g[2], g[3]);
    }
    // konu tipi DV/DC: konudaki yazım esas (cevap anahtarı konudan)
  }
  const kanit: Record<string, string> = {};
  for (const [k, v] of Object.entries(alanlar)) {
    const kn = kanitBul(ham, k, v);
    if (kn) kanit[k] = kn;
    else delete alanlar[k];
  }

  // Güven merdiveni
  let booking: string | null = null;
  let oneri: string | null = null;
  let guven: Guven = "yok";
  let gerekce = "";
  if (konuB.length === 1 && (metinB.length === 0 || (metinB.length === 1 && metinB[0] === konuB[0]))) {
    booking = konuB[0];
    guven = "kesin";
    gerekce = "konuda tek booking";
  } else if (konuB.length === 1 && metinB.length >= 1 && !metinB.includes(konuB[0])) {
    oneri = metinB.length === 1 ? metinB[0] : null;
    guven = "zayif";
    gerekce = `çelişki: konu ${konuB[0]} / metin ${metinB.join(",")}`;
  } else if (konuB.length === 0 && metinB.length === 1) {
    booking = metinB[0];
    guven = "kesin";
    gerekce = "metinde tek booking";
  } else if (konuB.length > 1 || metinB.length > 1) {
    guven = "zayif";
    gerekce = "birden fazla booking";
  } else if (alanlar.konteyner) {
    const adaylar = tekil(alanlar.konteyner.split(",").map((k) => d.konteynerBooking.get(k)).filter(Boolean) as string[]);
    if (adaylar.length === 1) {
      booking = adaylar[0];
      guven = "guclu";
      gerekce = "konteyner no daha önce bu booking'e bağlı";
    }
  }
  if (booking && alanlar.konteyner) for (const k of alanlar.konteyner.split(",")) d.konteynerBooking.set(k, booking);
  return { kapsamda, booking, oneri, guven, gerekce, olay, olaylar, alanlar, kanit };
}
