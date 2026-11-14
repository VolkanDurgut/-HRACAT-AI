import {
  kalemAnahtari, miktarBirim, onayliMiktar, urunNorm, type SaKalem,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * Satin alma karar ekrani: "gecen haftaya gore" (14.11.2026)
 * ----------------------------------------------------------------------------
 * Kullanici: "Burak Bey bir suru kalemi tek tek onaylayacak ... her cumartesi zahmetli."
 * Haftalik listelerde kalemlerin cogu her hafta ayni (SA-0005 ile SA-0009 arasinda 25 ortak
 * kalem). Bu modul her kalemi AYNI departmanin onceki sonuclanan listeleriyle karsilastirir;
 * karar ekrani yalniz DEGISENLERI one cikarir (Yeni / Miktar artti / Gecen sefer reddedildi).
 * Saf fonksiyon: Node testinde calisir (tests/satin-alma-karsilastir.test.ts).
 */

export type HaftaRozeti = {
  tur: "yeni" | "artti" | "azaldi" | "birim" | "red" | "ayni" | "her_hafta";
  metin: string;
  /** Onaylayanin dikkat etmesi gereken degisiklik mi ("Yalniz degisenleri goster") */
  degisti: boolean;
};

type OncekiListe = { kalemler: SaKalem[] };

/** Onceki listede ayni kalem: once urun + tedarikci, yoksa yalniz urun adi. */
function eslesen(k: SaKalem, l: OncekiListe): SaKalem | undefined {
  const anahtar = kalemAnahtari(k.urun, k.tedarikci);
  const ad = urunNorm(k.urun);
  return l.kalemler.find((x) => kalemAnahtari(x.urun, x.tedarikci) === anahtar)
    ?? l.kalemler.find((x) => urunNorm(x.urun) === ad);
}

/**
 * onceki: ayni departmanin SONUCLANAN listeleri, en yenisi basta (en fazla 3 kullanilir).
 * Onceki liste yoksa null (ilk liste: karsilastirma yok, rozet gosterilmez).
 */
export function haftaKarsilastir(k: SaKalem, onceki: OncekiListe[]): HaftaRozeti | null {
  if (!onceki.length || !urunNorm(k.urun)) return null;
  const m = eslesen(k, onceki[0]);
  if (!m) return { tur: "yeni", metin: "Yeni", degisti: true };
  if (m.karar === "reddedildi") {
    return { tur: "red", metin: `Geçen sefer reddedildi${m.red_nedeni ? `: ${m.red_nedeni}` : ""}`, degisti: true };
  }
  const oncekiMiktar = Number(m.karar === "onaylandi" ? onayliMiktar(m) : m.miktar);
  const simdi = Number(k.miktar);
  const once = miktarBirim({ miktar: oncekiMiktar, birim: m.birim });
  if (m.birim !== k.birim) return { tur: "birim", metin: `Birim değişti · önceki ${once}`, degisti: true };
  if (simdi > oncekiMiktar) return { tur: "artti", metin: `Miktar arttı · önceki ${once}`, degisti: true };
  if (simdi < oncekiMiktar) return { tur: "azaldi", metin: `Miktar azaldı · önceki ${once}`, degisti: false };
  const ucHafta = onceki.slice(0, 3);
  if (ucHafta.length >= 3 && ucHafta.every((l) => eslesen(k, l))) return { tur: "her_hafta", metin: "Her hafta", degisti: false };
  return { tur: "ayni", metin: "Geçen sefer de vardı", degisti: false };
}

/** Bekleyen liste icin karsilastirmaya girecek onceki listeler (ayni departman, sonuclanan, daha once gonderilmis). */
export function oncekiListeler<T extends { id: string; departman_id: string; durum: string; gonderim_zamani: string | null; test?: boolean; kalemler: SaKalem[] }>(
  liste: T, tum: T[], adet = 3,
): T[] {
  const zaman = liste.gonderim_zamani || "";
  return tum
    .filter((o) => o.id !== liste.id && o.departman_id === liste.departman_id && o.durum === "sonuclandi"
      && (o.gonderim_zamani || "") < zaman && o.test === liste.test)
    .sort((a, b) => (b.gonderim_zamani || "").localeCompare(a.gonderim_zamani || ""))
    .slice(0, adet);
}
