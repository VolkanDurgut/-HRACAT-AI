/**
 * PAZAR sayfa düzeni (16.11.2026, kullanıcı: "Kontrol Merkezi'ndeki standart mimari: sabit üst özet + URL tabanlı sekme +
 * saf yardımcılar"). HESAPLAR DEĞİŞMEDİ (lib/pazar/panel.ts, lib/pazar/musteri.ts); burada yalnız sekme adı, liste filtresi
 * ve ülke tablosu sıralaması var. Saf modül (test: tests/pazar-gorunum.test.ts).
 */
import { trKucuk } from "@/lib/tr-arama";
import type { PazarFirma, PazarKisi } from "@/lib/pazar/veri";
import type { UlkeSatiri } from "@/lib/pazar/panel";

export type PazarSekme = "operasyon" | "musteriler" | "potansiyel" | "ulkeler";
export const VARSAYILAN_SEKME: PazarSekme = "operasyon";

/** Adresteki ?sekme= değeri; eski "takip" bağlantısı Günlük Operasyon'a gider. Bilinmeyen -> null. */
export function pazarSekmesi(v: string | null | undefined): PazarSekme | null {
  if (v === "takip") return "operasyon";
  return v === "operasyon" || v === "musteriler" || v === "potansiyel" || v === "ulkeler" ? v : null;
}

/** Türkçe duyarsız arama anahtarı (sayfadaki eski kuralla aynı: küçük harf + "ı" -> "i"). Ortak kural: lib/tr-arama.ts */
export const aramaAnahtari = trKucuk;

export type PotansiyelFiltre = {
  /** "" = hepsi, "-" = ülkesi bilinmeyen */
  ulke: string;
  /** "" = hepsi, "fuar" = fuar listeleri, diğer = rehber listesi etiketi */
  kaynak: string;
  arama: string;
  /** Süreç hunisinde seçili aşamanın firma id'leri (null = aşama filtresi yok) */
  asama: Set<string> | null;
};

/**
 * Potansiyel listesi filtresi (eski sayfa içi kuralın AYNISI + aşama). Arama: firma adı, yetkili adı, e-posta ya da
 * (en az 4 rakam) telefon. Sıra: ada göre.
 */
export function potansiyelFiltrele(firmalar: PazarFirma[], f: PotansiyelFiltre, kisiHarita: Map<string, PazarKisi[]>): PazarFirma[] {
  const q = aramaAnahtari(f.arama.trim());
  const qRakam = q.replace(/\D/g, "");
  return firmalar
    .filter((x) => !f.asama || f.asama.has(x.id))
    .filter((x) => !f.ulke || (f.ulke === "-" ? !x.ulke : x.ulke === f.ulke))
    .filter((x) => !f.kaynak || (f.kaynak === "fuar" ? x.kaynak === "fuar" : x.kaynak === "liste" && x.kaynak_etiket === f.kaynak))
    .filter((x) => {
      if (!q) return true;
      if (aramaAnahtari(x.ad).includes(q)) return true;
      return (kisiHarita.get(x.id) || []).some((k) => aramaAnahtari(k.ad || "").includes(q) || (k.eposta || "").includes(q) || (qRakam.length >= 4 && k.telefonlar.some((t) => t.includes(qRakam))));
    })
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

export type UlkeSiraAlani = "ulke" | "musteri" | "potansiyel" | "epostali" | "ulasilan" | "cevap" | "sonTemas";

/**
 * Pazar Analizi ülke tablosu: arama (görünen ülke adında) + sıralama. "Ülkesi bilinmeyen" (—) her sıralamada en altta;
 * sayısal eşitlikte eski varsayılan sıra (müşteri, ulaşılan, potansiyel, ad).
 */
export function ulkeTablosu(ulkeler: UlkeSatiri[], ara: string, alan: UlkeSiraAlani | null, artan: boolean, gosterim: (u: string) => string): UlkeSatiri[] {
  const q = aramaAnahtari(ara.trim());
  const liste = ulkeler.filter((u) => !q || (u.ulke !== "—" && (aramaAnahtari(gosterim(u.ulke)).includes(q) || aramaAnahtari(u.ulke).includes(q))));
  if (!alan) return liste;
  const varsayilan = (a: UlkeSatiri, b: UlkeSatiri) => b.musteri - a.musteri || b.ulasilan - a.ulasilan || b.potansiyel - a.potansiyel || a.ulke.localeCompare(b.ulke, "tr");
  return [...liste].sort((a, b) => {
    const bilinmeyen = (a.ulke === "—" ? 1 : 0) - (b.ulke === "—" ? 1 : 0);
    if (bilinmeyen) return bilinmeyen;
    const yon = artan ? 1 : -1;
    if (alan === "ulke") return yon * gosterim(a.ulke).localeCompare(gosterim(b.ulke), "tr");
    if (alan === "sonTemas") {
      if (!a.sonTemas && b.sonTemas) return 1;
      if (a.sonTemas && !b.sonTemas) return -1;
      return (a.sonTemas && b.sonTemas ? yon * a.sonTemas.localeCompare(b.sonTemas) : 0) || varsayilan(a, b);
    }
    return yon * (a[alan] - b[alan]) || varsayilan(a, b);
  });
}

/** Müşteri hacmi metni: "$185.250" ya da birden çok para biriminde "$120.000 + €8.500". */
export function hacimMetni(hacim: { para: string; tutar: number }[]): string {
  if (!hacim.length) return "—";
  return hacim.map((h) => {
    try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: h.para, maximumFractionDigits: 0 }).format(h.tutar); }
    catch { return `${h.tutar.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${h.para}`; }
  }).join(" + ");
}
