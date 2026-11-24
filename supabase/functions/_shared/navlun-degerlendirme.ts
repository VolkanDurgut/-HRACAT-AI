/**
 * NAVLUN DEGERLENDIRME (24.11.2026, Asama 1: tek hesap yeri). SAF: veri yok, ag yok.
 *
 * Kullanici (24.11.2026): navlun sayfasi, Excel ve 17:00 maili ayni hesabi ayri ayri yapiyordu (sayfa 120 gun, mail 60 gun,
 * gecerlilik hic yok). Bu modul her teklifin TEK degerlendirmesini uretir; edge navlun-bildirimi ("degerlendir") sonucu
 * navlun_teklif_degerlendirme tablosuna yazar, tum yuzeyler oradan okur.
 *
 *  - Konteyner basi toplam: navlun-karsilastirma.ts karsilastir (mail kalemleri + acente hafizasi + kur). Kullanici
 *    (24.11.2026): "Bizim icin 1 konteynerin maliyeti" = acentenin konteyner basi tutari (+ lokal haricse cikis lokali).
 *  - GECERLILIK (kullanici onerisi): teklifin yazdigi tarih > acentenin aliskanligi (gecmis tekliflerden: "ay sonu" ya da
 *    tipik gun sayisi) > 21 gun. Suresi dolan teklif tabloda kalir ama "en iyi" SECILMEZ (durum suresi_doldu).
 *    Yilsiz tarih ("30.11") teklif tarihinden 15 gunden fazla geride kaliyorsa ertesi yila aittir (aralikta "15.01").
 *    Gemi kalkisina gore ayrica elenmez (kullanici: "gecerli gibi dusunebilirsin").
 *  - GERCEKLESEN KONTROLU: yukleme planindaki konteyner basi navlun ile ayni acentenin ayni limana REZERVASYON TARIHINDEN
 *    once verdigi teklif karsilastirilir (kalkis tarihine gore degil: rezervasyon eski teklifle yapilmis olabilir).
 *    Ayni para biriminde kur kullanilmaz; farkli ise rezervasyon gununun kuru kullanilir ve kayda yazilir (kur degisince
 *    gecmis kontrol bozulmaz). FOB dosyada navlunu alici oder: kontrol disi.
 */
import { acenteAnahtari, type Karsilastirma } from "./navlun-karsilastirma.ts";
import { usdKarsiligi, type Kur } from "./navlun-kalem.ts";

export const VARSAYILAN_GECERLILIK_GUN = 21;
const GUN = 86400000;

const isoGun = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const gunMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** Liman anahtarinin karsilastirma bicimi: SQL siparis_liman_anahtar ile TS limanAnahtari'nin ayristigi yazimlar birlesir. */
export function limanEs(anahtar: string | null | undefined): string | null {
  if (!anahtar) return null;
  const k = anahtar.trim().toUpperCase();
  if (/^DAR\s*(?:ES\s*)?S[AE]LA+M$/.test(k)) return "DAR ES SALAAM";
  return k || null;
}

/**
 * Gecerlilik metnini (teklifte yazan) ISO tarihe cevirir. "30.11", "30/11/2026", "30.11.26". Okunamazsa ya da teklif
 * tarihine gore anlamsizsa (15 gunden fazla geri, 400 gunden fazla ileri) null.
 */
export function gecerlilikTarihi(ham: string | null | undefined, teklifTarihi: string): string | null {
  const m = (ham || "").trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!m) return null;
  const g = Number(m[1]), a = Number(m[2]);
  if (g < 1 || g > 31 || a < 1 || a > 12) return null;
  const t = gunMs(teklifTarihi);
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date(t).getUTCFullYear();
  let d = Date.UTC(y, a - 1, g);
  if (new Date(d).getUTCDate() !== g) return null;                 // 31.11 gibi
  if (!m[3] && d < t - 15 * GUN) { y += 1; d = Date.UTC(y, a - 1, g); }
  if (d < t - 15 * GUN || d > t + 400 * GUN) return null;
  return isoGun(d);
}

export type AcenteGecerlilik = { tur: "ay_sonu"; ornek: number } | { tur: "gun"; gun: number; ornek: number };

const aySonuMu = (iso: string) => { const d = new Date(gunMs(iso)); return new Date(d.getTime() + GUN).getUTCDate() === 1; };

/**
 * Acentenin gecerlilik aliskanligi (acente anahtari -> kural): yazili gecerliligi olan en az 3 teklif. Yazilan tarihlerin
 * en az %60'i ay sonuysa "ay sonu"; degilse teklif tarihinden gecerlilige gecen gunlerin medyani (3-60 gun arasi).
 */
export function acenteGecerlilikleri(teklifler: { acente: string | null; tarih: string; gecerlilik: string | null }[]): Map<string, AcenteGecerlilik> {
  const grup = new Map<string, { aySonu: number; gunler: number[] }>();
  for (const t of teklifler) {
    const a = acenteAnahtari(t.acente);
    const b = gecerlilikTarihi(t.gecerlilik, t.tarih);
    if (!a || !b) continue;
    const x = grup.get(a) ?? { aySonu: 0, gunler: [] };
    if (aySonuMu(b)) x.aySonu++;
    x.gunler.push(Math.round((gunMs(b) - gunMs(t.tarih)) / GUN));
    grup.set(a, x);
  }
  const sonuc = new Map<string, AcenteGecerlilik>();
  grup.forEach((x, a) => {
    const n = x.gunler.length;
    if (n < 3) return;
    if (x.aySonu / n >= 0.6) { sonuc.set(a, { tur: "ay_sonu", ornek: n }); return; }
    const s = [...x.gunler].sort((p, q) => p - q);
    const med = s[Math.floor(n / 2)];
    if (med >= 3 && med <= 60) sonuc.set(a, { tur: "gun", gun: med, ornek: n });
  });
  return sonuc;
}

export type GecerlilikKaynagi = "teklif" | "acente" | "varsayilan";

/** Teklifin gecerlilik bitisi ve kaynagi. */
export function gecerlilikBitisi(t: { acente: string | null; tarih: string; gecerlilik: string | null }, aliskanlik: Map<string, AcenteGecerlilik>): { bitis: string; kaynak: GecerlilikKaynagi } {
  const yazili = gecerlilikTarihi(t.gecerlilik, t.tarih);
  if (yazili) return { bitis: yazili, kaynak: "teklif" };
  const a = acenteAnahtari(t.acente);
  const k = a ? aliskanlik.get(a) : undefined;
  const bas = gunMs(t.tarih);
  if (k?.tur === "ay_sonu") {
    const d = new Date(bas);
    let son = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    // Ayin son 3 gununde verilen teklif genelde ertesi ay sonuna kadardir
    if (son - bas < 3 * GUN) son = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0);
    return { bitis: isoGun(son), kaynak: "acente" };
  }
  if (k?.tur === "gun") return { bitis: isoGun(bas + k.gun * GUN), kaynak: "acente" };
  return { bitis: isoGun(bas + VARSAYILAN_GECERLILIK_GUN * GUN), kaynak: "varsayilan" };
}

export type DegerlendirmeDurumu = "kesin" | "kontrol" | "eksik" | "suresi_doldu";

/** suresi_doldu > kontrol (mail ile hafiza celisiyor) > eksik (lokal bilinmiyor) > kesin. */
export function teklifDurumu(k: Pick<Karsilastirma, "kesin" | "celiski">, bitis: string, bugun: string): DegerlendirmeDurumu {
  if (bitis < bugun.slice(0, 10)) return "suresi_doldu";
  if (k.celiski) return "kontrol";
  return k.kesin ? "kesin" : "eksik";
}

export type EnIyiAdayi = { id: string; liman_anahtar: string | null; acente: string | null; ekipman: string | null; armator: string | null; tarih: string; toplam: number; durum: DegerlendirmeDurumu };

/**
 * Liman basina en iyi 20'lik teklif: her acente + armator icin EN SON teklif (eski teklifi yenisi gecersiz kilar), bunlar
 * arasinda yalniz "kesin" (suresi dolmamis, lokali bilinen) olanlarin en dusuk toplami. Doner: en iyi teklif id'leri.
 */
export function enIyileriSec(liste: EnIyiAdayi[]): Set<string> {
  const son = new Map<string, EnIyiAdayi>();
  for (const x of liste) {
    if (!x.liman_anahtar || !x.acente || (x.ekipman || "20DC") !== "20DC") continue;
    const k = `${x.liman_anahtar}|${acenteAnahtari(x.acente)}|${x.armator || ""}`;
    const v = son.get(k);
    if (!v || x.tarih > v.tarih) son.set(k, x);
  }
  const enIyi = new Map<string, EnIyiAdayi>();
  son.forEach((x) => {
    if (x.durum !== "kesin") return;
    const v = enIyi.get(x.liman_anahtar as string);
    if (!v || x.toplam < v.toplam || (x.toplam === v.toplam && x.tarih > v.tarih)) enIyi.set(x.liman_anahtar as string, x);
  });
  return new Set(Array.from(enIyi.values()).map((x) => x.id));
}

// ---------------------------------------------------------------------------------------------------------------------
// GERCEKLESEN KONTROLU
// ---------------------------------------------------------------------------------------------------------------------
export type GerceklesenGirdi = {
  id: string; booking_no: string | null; acente: string | null; liman_anahtar: string | null; etd: string | null;
  /** Rezervasyonun olusturuldugu gun (yoksa ETD) */
  referans: string | null;
  gercek: number; lokal: number | null; para: string | null; teslim: string | null;
};
export type TeklifAdayi = { id: string; acente: string | null; liman_anahtar: string | null; ekipman: string | null; tutar: number; para: string | null; tarih: string; tur: string };
export type GerceklesenDurumu = "tutuyor" | "eski_teklifle_tutuyor" | "tutmuyor" | "teklif_yok" | "fob" | "eksik";
export type GerceklesenSonucu = {
  durum: GerceklesenDurumu; teklif_id: string | null; teklif_tutar: number | null; teklif_para: string | null; teklif_tarih: string | null;
  fark: number | null; kur_tarihi: string | null; aciklama: string;
};

/** Esitlik: %1 ya da 5 birim (hangisi buyukse) - navlun-karsilastirma rezervasyondanOgren ile ayni */
const esit = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.abs(b) * 0.01);
const yaz = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function gerceklesenKarsilastir(g: GerceklesenGirdi, teklifler: TeklifAdayi[], kurBul: (gun: string) => Kur): GerceklesenSonucu {
  const bos = { teklif_id: null, teklif_tutar: null, teklif_para: null, teklif_tarih: null, fark: null, kur_tarihi: null };
  if ((g.teslim || "").toUpperCase().includes("FOB")) return { ...bos, durum: "fob", aciklama: "FOB: navlunu alıcı öder, kontrol dışı." };
  const ref = (g.referans || g.etd || "").slice(0, 10);
  const a = acenteAnahtari(g.acente), l = limanEs(g.liman_anahtar);
  if (!ref || !a || !l || !(g.gercek > 0)) return { ...bos, durum: "eksik", aciklama: "Acente, liman, tarih ya da navlun eksik." };
  const bit = gunMs(ref) + GUN, bas = gunMs(ref) - 150 * GUN;
  const adaylar = teklifler
    .filter((t) => (t.tur === "teklif" || t.tur === "karsi_teklif" || t.tur === "kabul") && t.tutar > 0 && (t.ekipman || "20DC") === "20DC"
      && limanEs(t.liman_anahtar) === l && acenteAnahtari(t.acente) === a)
    .filter((t) => { const x = gunMs(t.tarih); return x <= bit && x >= bas; })
    .sort((x, y) => y.tarih.localeCompare(x.tarih));
  if (!adaylar.length) return { ...bos, durum: "teklif_yok", aciklama: "Rezervasyondan önceki 150 günde bu acenteden bu limana okunmuş teklif yok." };
  const gPara = g.para || "USD";
  let kurTarihi: string | null = null;
  // Ayni para biriminde dogrudan; farkliysa rezervasyon gununun kuruyla USD'ye
  const deger = (t: TeklifAdayi): { teklif: number; gercek: number } => {
    const tPara = t.para || "USD";
    if (tPara === gPara) return { teklif: t.tutar, gercek: g.gercek };
    const k = kurBul(ref);
    kurTarihi = k.tarih;
    return { teklif: usdKarsiligi(t.tutar, tPara, k), gercek: usdKarsiligi(g.gercek, gPara, k) };
  };
  const tutar = (t: TeklifAdayi) => {
    const d = deger(t);
    if (esit(d.teklif, d.gercek)) return "esit" as const;
    if (g.lokal && g.lokal > 0 && esit(d.teklif + g.lokal, d.gercek)) return "lokal" as const;
    return null;
  };
  const son = adaylar[0];
  const sonuc = (t: TeklifAdayi, durum: GerceklesenDurumu, aciklama: string): GerceklesenSonucu => {
    const d = deger(t);
    return { durum, teklif_id: t.id, teklif_tutar: t.tutar, teklif_para: t.para || "USD", teklif_tarih: t.tarih, fark: Math.round((d.gercek - d.teklif) * 100) / 100, kur_tarihi: kurTarihi, aciklama };
  };
  const s = tutar(son);
  if (s) return sonuc(son, "tutuyor", s === "lokal" ? "Gerçekleşen = teklif + lokal." : "Gerçekleşen = rezervasyondan önceki son teklif.");
  const eski = adaylar.slice(1).find((t) => tutar(t));
  if (eski) return sonuc(eski, "eski_teklifle_tutuyor", `Rezervasyon ${eski.tarih.slice(0, 10)} tarihli teklifle yapılmış; son teklif ${yaz(son.tutar)}.`);
  return sonuc(son, "tutmuyor", `Gerçekleşen ${yaz(g.gercek)} ${gPara}, son teklif ${yaz(son.tutar)} ${son.para || "USD"}.`);
}
