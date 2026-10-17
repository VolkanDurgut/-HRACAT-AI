/**
 * GECMISTEN AKTARMA (17.10.2026): mevcut ihracat dosyalarindan musteri karti
 * ve urun kutuphanesi ADAYLARI cikarir. Hicbir sey KAYDETMEZ - aday listesi
 * ekranda gosterilir, kullanici sectiklerini onaylar.
 *
 * Kural: ayni alici (unvan, buyuk/kucuk harf ve bosluk farki yok sayilir)
 * icin EN SON dosyanin bilgileri alinir. Alici kodu proforma numarasindan
 * (UNEX + KOD + tarih) okunur; okunamazsa unvandan onerilir.
 *
 * Saf modul (tsx ile test edilir).
 */
import { bankaAnahtariTahmin, type BankaAnahtari } from "@/lib/bankalar";
import { aliciKoduOner, limanAdi, teslimIfadesiOner, urunVeMarkaAyir, yazimDuzelt } from "@/lib/proforma/sabitler";

export type GecmisDosya = {
  alici_firma: string | null;
  alici_adresi?: string | null;
  ham_veri?: unknown;
  varis_limani?: string | null;
  teslim_sekli?: string | null;
  banka?: string | null;
  odeme_sekli?: string | null;
  sevkiyat_evraklari?: unknown;
  proforma_no?: string | null;
  para_birimi?: string | null;
  urun_detaylari?: unknown;
  olusturma_tarihi?: string | null;
};

export type MusteriAdayi = {
  kod: string;
  unvan: string;
  adres: string | null;
  ilgili_kisi: string | null;
  eposta: string | null;
  teslim_sekli: string | null;
  varis_limani: string | null;
  teslim_ifadesi: string | null;
  banka: BankaAnahtari | null;
  para_birimi: "USD" | "EUR";
  odeme_sekli: string | null;
  sevkiyat_metni: string | null;
  evraklar: string[] | null;
  /** Bilgi: kac dosyadan, son proforma */
  dosyaSayisi: number;
  sonProforma: string | null;
  /** Kod proforma numarasindan mi okundu (false = unvandan onerildi) */
  kodKaynagi: "proforma" | "oneri";
};

export type UrunAdayi = { ad: string; varsayilan_ambalaj_kg: number; kullanim: number };

export const unvanAnahtari = (s: string | null | undefined) =>
  String(s || "").toLocaleUpperCase("en-US").replace(/\s+/g, " ").trim();

const bosIse = (s: unknown): string | null => {
  const t = String(s ?? "").trim();
  return t ? t : null;
};

/** "UNEXCCS160926" / "UNEXBIS170626-1 / UNEXBIS120526" / "UNEXCCS13082026" -> "CCS" */
export function proformadanKod(proformaNo: string | null | undefined): string | null {
  const m = String(proformaNo || "").trim().toUpperCase().match(/^UNEX([A-Z]{2,6}?)\d/);
  return m ? m[1] : null;
}

function ilgiliKisiBlogu(tel: string | null, eposta: string | null): string | null {
  const satirlar: string[] = [];
  if (tel) satirlar.push(`TEL : ${tel}`);
  if (eposta) satirlar.push(`EMAIL : ${eposta}`);
  return satirlar.length ? satirlar.join("\n") : null;
}

/**
 * Dosyadaki evrak listesi -> karttaki liste. Numara oneki ("1. ", "10-") atilir.
 * Liste TURKCE cevrilmis gorunuyorsa (yapay zeka okumasinda bazi dosyalarda
 * "Ticari Fatura (Commercial Invoice)" gibi kaydedilmis) proformaya yazilmamasi
 * icin null doner -> varsayilan Ingilizce liste kullanilir.
 */
function evrakListesi(deger: unknown): string[] | null {
  if (!Array.isArray(deger)) return null;
  const liste = deger
    .map((e) => yazimDuzelt(String(e ?? "").replace(/^\s*\d+\s*[.\-)]\s*/, "").replace(/\s+/g, " ")))
    .filter((e) => e.length > 0 && e.length <= 1000);
  if (liste.some((e) => /[şğıŞĞİçöüÇÖÜ]|\bFatura\b|\bListesi\b|\bSertifikas/i.test(e))) return null;
  return liste.length ? liste.slice(0, 30) : null;
}

export function musteriAdaylari(dosyalar: GecmisDosya[], mevcutKodlar: Iterable<string> = []): MusteriAdayi[] {
  const gruplar = new Map<string, GecmisDosya[]>();
  for (const d of dosyalar) {
    const k = unvanAnahtari(d.alici_firma);
    if (!k) continue;
    gruplar.set(k, [...(gruplar.get(k) || []), d]);
  }
  const kullanilan = new Set(Array.from(mevcutKodlar, (k) => k.toUpperCase()));
  const adaylar: MusteriAdayi[] = [];
  // En cok dosyasi olan once (kod cakismasinda eski/kalabalik musteri kodu korunur)
  const sirali = Array.from(gruplar.values()).sort((a, b) => b.length - a.length || unvanAnahtari(a[0].alici_firma).localeCompare(unvanAnahtari(b[0].alici_firma)));
  for (const grup of sirali) {
    const son = [...grup].sort((a, b) => String(b.olusturma_tarihi || "").localeCompare(String(a.olusturma_tarihi || "")))[0];
    const ham = (son.ham_veri && typeof son.ham_veri === "object" ? son.ham_veri : {}) as Record<string, unknown>;
    // Kod: en son dosyadan geriye, proforma numarasindan okunabilen ilk kod
    const okunan = [...grup].sort((a, b) => String(b.olusturma_tarihi || "").localeCompare(String(a.olusturma_tarihi || "")))
      .map((d) => proformadanKod(d.proforma_no)).find((k): k is string => !!k) || null;
    let kod = okunan && !kullanilan.has(okunan) ? okunan : aliciKoduOner(String(son.alici_firma || ""), kullanilan);
    const kodKaynagi: MusteriAdayi["kodKaynagi"] = okunan && kod === okunan ? "proforma" : "oneri";
    kod = kod.toUpperCase();
    kullanilan.add(kod);
    const tel = bosIse(ham.alici_tel);
    const eposta = bosIse(ham.alici_email);
    const teslim = bosIse(son.teslim_sekli)?.toUpperCase() || null;
    const liman = son.varis_limani ? limanAdi(son.varis_limani) : null;
    adaylar.push({
      kod,
      unvan: String(son.alici_firma || "").replace(/\s+/g, " ").trim(),
      adres: bosIse(son.alici_adresi),
      ilgili_kisi: ilgiliKisiBlogu(tel, eposta),
      eposta,
      teslim_sekli: teslim,
      varis_limani: liman,
      teslim_ifadesi: teslim || liman ? teslimIfadesiOner(teslim, liman) : null,
      banka: bankaAnahtariTahmin(son.banka),
      para_birimi: son.para_birimi === "EUR" ? "EUR" : "USD",
      odeme_sekli: bosIse(yazimDuzelt(son.odeme_sekli)),
      sevkiyat_metni: bosIse(ham.sevkiyat_suresi),
      evraklar: evrakListesi(son.sevkiyat_evraklari),
      dosyaSayisi: grup.length,
      sonProforma: bosIse(son.proforma_no),
      kodKaynagi,
    });
  }
  return adaylar;
}

/** Gecmis urun kalemlerinden urun adlari (marka ayiklanmis), en cok kullanilan once. */
export function urunAdaylari(dosyalar: GecmisDosya[]): UrunAdayi[] {
  const sayac = new Map<string, { ad: string; kglar: Map<number, number>; kullanim: number }>();
  for (const d of dosyalar) {
    const kalemler = Array.isArray(d.urun_detaylari) ? (d.urun_detaylari as Record<string, unknown>[]) : [];
    for (const k of kalemler) {
      const ham = String(k.urun_adi || k.description || "").replace(/\s+/g, " ").trim();
      if (!ham) continue;
      let { urun } = urunVeMarkaAyir(ham);
      if (!urun) continue;
      // Kesin yazim hatasi: kapanmamis parantez ("... Wet Gluten:25% Min") tamamlanir
      const acik = (urun.match(/\(/g) || []).length - (urun.match(/\)/g) || []).length;
      if (acik > 0) urun = urun + ")".repeat(acik);
      const anahtar = urun.toLocaleUpperCase("en-US");
      // Ad ilk goruldugu yazimiyla korunur (teknik ozellik parantezindeki "Max." gibi ifadeler bozulmasin)
      const kayit = sayac.get(anahtar) || { ad: urun, kglar: new Map<number, number>(), kullanim: 0 };
      kayit.kullanim += 1;
      const kg = parseFloat(String(k.ambalaj_boyutu || k.packaging_size || "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] || "");
      if (Number.isFinite(kg) && kg > 0 && kg <= 1000) kayit.kglar.set(kg, (kayit.kglar.get(kg) || 0) + 1);
      sayac.set(anahtar, kayit);
    }
  }
  return Array.from(sayac.values())
    .map((k) => ({
      ad: k.ad,
      varsayilan_ambalaj_kg: Array.from(k.kglar.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 25,
      kullanim: k.kullanim,
    }))
    .sort((a, b) => b.kullanim - a.kullanim || a.ad.localeCompare(b.ad));
}
