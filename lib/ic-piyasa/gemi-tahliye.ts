/**
 * Ic Piyasa > Gemi Tahliye (25.11.2026) - SAF hesap ve ayristirma (tarayici / test ortak).
 * Kullanicinin gemi raporu sablonu: TARIH / PLAKA / LIMAN / TESLIM / FARK / GITTIGI YER / GEMI ISMI;
 * altta GELEN KG / INEN KG / SIPARIS MIKTARI / %, gelen ve kalan arac sayisi, arac ortalamasi, fire,
 * gidilen yer bazinda toplam. Veri: ic_gemi_tahliyeleri / ic_gemi_alicilari / ic_gemi_araclari
 * (migration 20261125160000).
 *
 * Sablondaki iki formul burada BILEREK duzeltildi:
 *  - "Kalan Arac Sayisi" sablonda =GELEN/ORTALAMA (yani gelen arac sayisinin kendisi). Burada
 *    (siparis - gelen) / arac ortalamasi, yukari yuvarlanmis TAHMIN.
 *  - "Fire" sablonda tum araclarin liman toplamina gore; gemiden satis araclarinin teslim tartimi olmadigi
 *    icin satis tonaji fire gibi gorunuyordu. Burada YALNIZ UNEX'e gelen araclar: (liman - teslim) / liman.
 */
import { plakaBicimle, plakaGecerli, trSayiOku } from "./irsaliye-oku";

export const UNEX_YER = "UNEX";

/** beklemede (25.11.2026): gemi henuz gelmedi; kantarda gorunmez, arac girilemez */
export type GemiDurum = "acik" | "beklemede" | "tamamlandi";

export type GemiTahliye = {
  id: string;
  company_id: string;
  gemi_adi: string;
  satici: string | null;
  tahliye_limani: string | null;
  urun: string;
  kalite: string | null;
  bl_kg: number;
  baslangic: string | null;
  durum: GemiDurum;
  kapanis_zamani: string | null;
  notlar: string | null;
  olusturan_email: string | null;
  olusturma: string;
};

export type GemiAlici = {
  id: string;
  gemi_id: string;
  firma: string;
  miktar_kg: number;
  notlar: string | null;
  olusturma: string;
};

export type GemiArac = {
  id: string;
  gemi_id: string;
  alici_id: string | null;
  tarih: string;
  plaka: string;
  liman_kg: number;
  /** UNEX araci: NULL = yolda (kantar tartimi bekleniyor); satis araci: hep NULL */
  teslim_kg: number | null;
  kaynak: "kantar" | "ofis";
  kantar_tartim_id?: string | null;
  teslim_kaynak?: "kantar" | "elle" | null;
  teslim_zamani?: string | null;
  esleme_kapali?: boolean;
  uyarilar: string[];
  notlar: string | null;
  girilen_email: string | null;
  olusturma: string;
};

/** Kantar Paneli ozeti (kantar_gemi_tahliyeleri) */
export type KantarGemi = {
  id: string;
  gemi_adi: string;
  urun: string;
  tahliye_limani: string | null;
  bl_kg: number;
  gelen_kg: number;
  gelen_arac: number;
  unex_liman_kg: number;
  unex_teslim_kg: number;
  unex_arac: number;
  bugun_arac: number;
  yolda_arac: number;
  yolda_kg: number;
  alicilar: { id: string; firma: string; miktar_kg: number; gelen_kg: number; arac: number }[];
};

export type KantarGemiArac = {
  id: string; gemi_id: string; gemi_adi: string; alici_id: string | null; firma: string | null; tarih: string;
  plaka: string; liman_kg: number; teslim_kg: number | null; kaynak: string; uyari_var: boolean;
  girilen_email: string | null; olusturma: string;
  teslim_kaynak: "kantar" | "elle" | null; kantar_kayit_no: number | null; teslim_zamani: string | null;
};

/** kantar_gemi_fissiz_tartimlar: firma alaninda gemi adi gecen, hicbir araca bagli olmayan BAYKON tartimi */
export type KantarFissizTartim = { id: string; kayit_no: number; plaka: string | null; dorse: string | null; firma: string | null; cikis: string; net_kg: number };

/** UNEX araci tartim bekliyor mu */
export const yoldaMi = (a: Pick<GemiArac, "alici_id" | "teslim_kg">) => !a.alici_id && (a.teslim_kg === null || a.teslim_kg === undefined);

export type YerOzeti = {
  /** null = UNEX depo */
  aliciId: string | null;
  ad: string;
  /** Satis tonaji (UNEX icin null) */
  hedefKg: number | null;
  arac: number;
  limanKg: number;
  /** Yalniz UNEX (teslimi gelen araclar) */
  teslimKg: number | null;
  /** Yalniz UNEX: kantar tartimi bekleyen arac */
  yoldaArac?: number;
  /** Satista: hedef - liman (negatif = asim) */
  kalanKg: number | null;
};

export type GemiRaporu = {
  siparisKg: number;
  gelenKg: number;
  gelenArac: number;
  /** % = gelen / siparis * 100 */
  yuzde: number;
  kalanKg: number;
  aracOrtalamasi: number;
  /** Tahmini: ceil(kalan / ortalama); arac yoksa null */
  kalanAracTahmini: number | null;
  /** UNEX'e giden tum araclarin liman toplami (yolda dahil) */
  unexLimanKg: number;
  unexTeslimKg: number;
  /** Teslimi gelen UNEX araclarinin liman toplami (fark / fire bunun uzerinden) */
  unexTeslimliLimanKg: number;
  /** teslim - liman (yalniz teslimi gelen UNEX araclari) */
  unexFarkKg: number;
  /** (liman - teslim) / liman * 100 (yalniz teslimi gelen UNEX araclari); yoksa null */
  firePct: number | null;
  /** Kantar tartimi bekleyen UNEX araclari */
  yoldaArac: number;
  yoldaKg: number;
  yerler: YerOzeti[];
  /** Gun bazinda (en yeni ustte) */
  gunler: { tarih: string; arac: number; limanKg: number; teslimKg: number }[];
};

const sayi = (x: unknown) => (x === null || x === undefined || x === "" ? 0 : Number(x));
const yuvarla2 = (n: number) => Math.round(n * 100) / 100;

/** Raporu araclardan hesaplar. Alicilar listedeki sirayla; UNEX hep ilk. */
export function gemiRaporu(gemi: Pick<GemiTahliye, "bl_kg">, alicilar: GemiAlici[], araclar: GemiArac[]): GemiRaporu {
  const siparisKg = sayi(gemi.bl_kg);
  const gelenKg = yuvarla2(araclar.reduce((t, a) => t + sayi(a.liman_kg), 0));
  const gelenArac = araclar.length;
  const unex = araclar.filter((a) => !a.alici_id);
  const unexLimanKg = yuvarla2(unex.reduce((t, a) => t + sayi(a.liman_kg), 0));
  const teslimli = unex.filter((a) => !yoldaMi(a));
  const yolda = unex.filter((a) => yoldaMi(a));
  const unexTeslimKg = yuvarla2(teslimli.reduce((t, a) => t + sayi(a.teslim_kg), 0));
  const unexTeslimliLimanKg = yuvarla2(teslimli.reduce((t, a) => t + sayi(a.liman_kg), 0));
  const aracOrtalamasi = gelenArac ? gelenKg / gelenArac : 0;
  const kalanKg = yuvarla2(siparisKg - gelenKg);

  const yerler: YerOzeti[] = [{
    aliciId: null, ad: UNEX_YER, hedefKg: null, arac: unex.length, limanKg: unexLimanKg, teslimKg: unexTeslimKg, kalanKg: null, yoldaArac: yolda.length,
  }];
  for (const l of alicilar) {
    const ar = araclar.filter((a) => a.alici_id === l.id);
    const lim = yuvarla2(ar.reduce((t, a) => t + sayi(a.liman_kg), 0));
    yerler.push({ aliciId: l.id, ad: l.firma, hedefKg: sayi(l.miktar_kg), arac: ar.length, limanKg: lim, teslimKg: null, kalanKg: yuvarla2(sayi(l.miktar_kg) - lim) });
  }

  const gunMap = new Map<string, { tarih: string; arac: number; limanKg: number; teslimKg: number }>();
  for (const a of araclar) {
    const g = gunMap.get(a.tarih) || { tarih: a.tarih, arac: 0, limanKg: 0, teslimKg: 0 };
    g.arac += 1; g.limanKg = yuvarla2(g.limanKg + sayi(a.liman_kg)); g.teslimKg = yuvarla2(g.teslimKg + sayi(a.teslim_kg));
    gunMap.set(a.tarih, g);
  }

  return {
    siparisKg, gelenKg, gelenArac,
    yuzde: siparisKg > 0 ? (gelenKg * 100) / siparisKg : 0,
    kalanKg,
    aracOrtalamasi,
    kalanAracTahmini: gelenArac ? Math.max(0, Math.ceil(kalanKg / aracOrtalamasi)) : null,
    unexLimanKg, unexTeslimKg, unexTeslimliLimanKg,
    unexFarkKg: yuvarla2(unexTeslimKg - unexTeslimliLimanKg),
    firePct: unexTeslimliLimanKg > 0 ? ((unexTeslimliLimanKg - unexTeslimKg) * 100) / unexTeslimliLimanKg : null,
    yoldaArac: yolda.length,
    yoldaKg: yuvarla2(yolda.reduce((t, a) => t + sayi(a.liman_kg), 0)),
    yerler,
    gunler: Array.from(gunMap.values()).sort((a, b) => (a.tarih < b.tarih ? 1 : -1)),
  };
}

/** Raporun arac satiri sirasi: tarih, sonra giris sirasi (sablondaki gibi kronolojik). */
export function araclariSirala(araclar: GemiArac[]): GemiArac[] {
  return [...araclar].sort((a, b) => (a.tarih === b.tarih ? (a.olusturma < b.olusturma ? -1 : 1) : a.tarih < b.tarih ? -1 : 1));
}

export function yerAdi(a: Pick<GemiArac, "alici_id">, alicilar: Pick<GemiAlici, "id" | "firma">[]): string {
  if (!a.alici_id) return UNEX_YER;
  return alicilar.find((l) => l.id === a.alici_id)?.firma || "?";
}

// ---------------------------------------------------------------------------
// Liman listesi yapistirma (ofis): Excel'den / WhatsApp'tan satir satir
// "19.11.2026  34KRG749  29260" | "34 KRG 333 26.400" | "34KRG333;26400"
// Tarih yoksa varsayilan gun. Kg: satirin SON sayisi (TR binlik nokta / virgul).
// ---------------------------------------------------------------------------
export type ListeSatiri = { satir: number; tarih: string; plaka: string; liman_kg: number };
export type ListeHatasi = { satir: number; metin: string; hata: string };

const TARIH_RE = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;

export function limanListesiAyristir(metin: string, varsayilanGun: string): { satirlar: ListeSatiri[]; hatalar: ListeHatasi[] } {
  const satirlar: ListeSatiri[] = [];
  const hatalar: ListeHatasi[] = [];
  metin.split(/\r?\n/).forEach((ham, i) => {
    const satirNo = i + 1;
    let s = ham.replace(/ /g, " ").trim();
    if (!s) return;
    // Baslik satiri (TARIH / PLAKA / LIMAN) atlanir
    if (/^(tarih|plaka|liman)/i.test(s.replace(/[İı]/g, "i"))) return;
    let tarih = varsayilanGun;
    const t = s.match(TARIH_RE);
    if (t) {
      const g = Number(t[1]); const a = Number(t[2]); let y = Number(t[3]);
      if (y < 100) y += 2000;
      const d = new Date(Date.UTC(y, a - 1, g));
      if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) {
        hatalar.push({ satir: satirNo, metin: ham, hata: "Tarih geçersiz." });
        return;
      }
      tarih = `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
      s = s.replace(t[0], " ");
    }
    // 1) TR plakasi + hemen ardindaki sayi ("34 KRG 333 26400", "34KRG749<TAB>29.260<TAB>UNEX ...")
    // 2) Ayrac (TAB ; |) ile bolunmus: ilk parca plaka, ikinci parca kg (yabanci plaka)
    let plakaMetin = "";
    let kgMetin = "";
    const tr = s.toUpperCase().match(/^[\s;|]*(\d{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,5})(?=[\s;|])[\s;|]+([\d.,]+)/);
    if (tr) { plakaMetin = tr[1]; kgMetin = tr[2]; }
    else {
      const parcalar = s.split(/[\t;|]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      plakaMetin = parcalar[0] || "";
      kgMetin = parcalar[1] || "";
    }
    const kg = trSayiOku(kgMetin);
    const plaka = plakaBicimle(plakaMetin);
    if (kg === null || kg <= 0) { hatalar.push({ satir: satirNo, metin: ham, hata: "Kg okunamadı (satırın son değeri kg olmalı)." }); return; }
    if (kg > 60000) { hatalar.push({ satir: satirNo, metin: ham, hata: "Kg 60.000'den büyük olamaz (ton yazıldıysa kg'a çevirin)." }); return; }
    if (kg < 1000) { hatalar.push({ satir: satirNo, metin: ham, hata: "Kg 1.000'den küçük; ton mu yazıldı? Kg girin." }); return; }
    if (!plakaGecerli(plaka)) { hatalar.push({ satir: satirNo, metin: ham, hata: "Plaka okunamadı." }); return; }
    satirlar.push({ satir: satirNo, tarih, plaka, liman_kg: kg });
  });
  return { satirlar, hatalar };
}

/** Supabase / RPC hatasini kullaniciya uygun metne cevirir. */
export function gemiHataMesaji(e: unknown): string {
  const m = (e as { message?: string; code?: string })?.message || String(e);
  const kod = (e as { code?: string })?.code || "";
  if (kod === "23505" || /uq_ic_gemi_acik_ad/.test(m)) return "Bu adla açık bir gemi tahliyesi zaten var.";
  if (/uq_ic_gemi_alici_firma/.test(m)) return "Bu firma bu gemide zaten ekli.";
  if (kod === "23503" || /foreign key/i.test(m)) return "Araç kaydı olduğu için silinemez. Önce araçları silin.";
  if (kod === "42501" || /row-level security|permission denied/i.test(m)) return "Bu işlem için yetkiniz yok.";
  return m;
}

export const yuzdeYazi = (n: number | null, hane = 2) =>
  n === null || !Number.isFinite(n) ? "-" : `%${n.toLocaleString("tr-TR", { minimumFractionDigits: hane, maximumFractionDigits: hane })}`;
