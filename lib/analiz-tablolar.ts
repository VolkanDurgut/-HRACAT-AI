/**
 * Kontrol Merkezi sadeleştirme (16.11.2026, kullanıcı: "Varış Limanları, Birim Fiyat ve Transit Süresi tek tabloda;
 * acenteler kart yerine filtrelenebilir tablo"). Saf yardımcılar: HESAP KURALLARI DEĞİŞMEDİ (app/analiz/page.tsx'teki
 * liman toplamları ve lib/analiz-acente-navlun.ts aynen); burada yalnız birleştirme, sıralama ve filtre var.
 */
import { BELIRSIZ_LIMAN, type LimanNavlunu } from "@/lib/analiz-acente-navlun";

// ---------------------------------------------------------------------------------------------------------------
// Liman Performans Tablosu
export type LimanToplami = { tutar: number; konteyner: number; adet: number; mts: number; yazimlar: Set<string>; teslim: Set<string> };
export type TransitToplami = { toplam: number; adet: number; enAz: number; enCok: number };

export type LimanPerformansi = {
  liman: string;
  dosya: number;
  konteyner: number;
  /** Toplam konteynerdeki pay (0-1) */
  pay: number;
  hacim: number;
  mts: number;
  /** Hacim / MTS; miktar ya da tutar yoksa null */
  birimFiyat: number | null;
  teslim: string[];
  transit: { ortalama: number; enAz: number; enCok: number; adet: number } | null;
  /** Birleştirilen farklı yazımlar (ipucu) */
  yazimlar: string[];
};

export function limanPerformansi(limanlar: Record<string, LimanToplami>, transit: Record<string, TransitToplami>): LimanPerformansi[] {
  const toplamKont = Object.values(limanlar).reduce((t, v) => t + v.konteyner, 0);
  return Object.entries(limanlar).map(([liman, v]) => {
    const tr = transit[liman];
    return {
      liman, dosya: v.adet, konteyner: v.konteyner, pay: toplamKont > 0 ? v.konteyner / toplamKont : 0,
      hacim: v.tutar, mts: v.mts, birimFiyat: v.mts > 0 && v.tutar > 0 ? v.tutar / v.mts : null,
      teslim: Array.from(v.teslim).sort(),
      transit: tr && tr.adet > 0 ? { ortalama: Math.round(tr.toplam / tr.adet), enAz: tr.enAz, enCok: tr.enCok, adet: tr.adet } : null,
      yazimlar: Array.from(v.yazimlar),
    };
  });
}

export type LimanSiraAlani = "liman" | "dosya" | "konteyner" | "hacim" | "birimFiyat" | "transit";

/** Sıralama: sayısal alanlarda boş değer (null) yöne bakmadan EN ALTTA; eşitlikte konteyner, sonra ad. */
export function limanSirala(satirlar: LimanPerformansi[], alan: LimanSiraAlani, artan: boolean): LimanPerformansi[] {
  const deger = (s: LimanPerformansi): number | null =>
    alan === "dosya" ? s.dosya : alan === "konteyner" ? s.konteyner : alan === "hacim" ? s.hacim
      : alan === "birimFiyat" ? s.birimFiyat : alan === "transit" ? s.transit?.ortalama ?? null : null;
  return [...satirlar].sort((a, b) => {
    if (alan === "liman") return (artan ? 1 : -1) * a.liman.localeCompare(b.liman, "tr");
    const x = deger(a), y = deger(b);
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    const fark = x === null || y === null ? 0 : (artan ? x - y : y - x);
    return fark || b.konteyner - a.konteyner || a.liman.localeCompare(b.liman, "tr");
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Acente navlun tablosu
export type AcenteOzeti = { ad: string; konteyner: number; pay: number; rezervasyon: number; limanlar: LimanNavlunu[] };

/** "dar" -> "DAR ES SALAAM" gibi parça arama; Türkçe büyük/küçük harf duyarsız. */
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFC");

/**
 * Filtre: acente (boş = hepsi) + liman araması. Liman araması acentenin yalnız eşleşen liman satırlarını bırakır;
 * hiç satırı kalmayan acente listeden düşer. Acentenin başlık toplamları (konteyner / pay) DEĞİŞMEZ (tüm limanları).
 */
export function acenteFiltrele(acenteler: AcenteOzeti[], acente: string, limanAra: string): AcenteOzeti[] {
  const ara = kucuk(limanAra.trim());
  return acenteler
    .filter((a) => !acente || a.ad === acente)
    .map((a) => (ara ? { ...a, limanlar: a.limanlar.filter((l) => kucuk(l.liman).includes(ara)) } : a))
    .filter((a) => !ara || a.limanlar.length > 0);
}

/** Satırın "not" sütunu: navlunsuz dosyalar / alıcı öder / belirsiz liman. */
export function navlunNotu(l: LimanNavlunu): string {
  if (l.son === null) return l.aliciOder ? "Navlun alıcıya ait (FOB)" : "Navlun girilmemiş";
  const n: string[] = [];
  if (l.navlunsuz > 0) n.push(`${l.navlunsuz} dosyada navlun yok`);
  if (l.liman === BELIRSIZ_LIMAN) n.push("liman belirsiz");
  return n.join(" · ");
}
