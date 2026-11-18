/**
 * CUVAL MARKASI YAYILIMI (18.11.2026, kullanici istegi).
 *
 * Ek Bilgiler kartindaki "Cuval Markalari" listesi girilince / degistirilince,
 * listede TEK marka varsa dosyanin tum konteynerlerinin cuval markasi (ve
 * konteyner icerigi dokumundeki kalem markalari) otomatik o markaya cekilir.
 * Eskiden yalnizca markasi BOS konteynerlere atanıyordu; urun adindan dusulmus
 * ya da eski marka kalan konteynerler tek tek duzeltiliyordu.
 * Listede birden fazla marka varsa hicbir konteynere dokunulmaz (konteyner
 * bazinda elle secilir).
 *
 * SAF: veritabanina / React'e erismez (tsx ile test edilir).
 */
import { kalemleriOku, type KonteynerKalemi } from "@/lib/konteyner-icerik";

export type MarkaKonteyneri = { id: string; marka: string | null; kalemler?: unknown };
export type MarkaGuncellemesi = { id: string; marka: string; kalemler?: KonteynerKalemi[] };

const sade = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Textarea metni -> temiz, tekil marka listesi (satir basina bir marka). */
export function markaListesiAyikla(metin: string | null | undefined): string[] {
  const out: string[] = [];
  for (const satir of String(metin || "").split("\n")) {
    const m = sade(satir);
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Listede tek marka varsa: markasi (veya icerik kalemlerinden birinin markasi)
 * farkli olan konteynerler icin guncelleme listesi. Aksi halde bos liste.
 */
export function tekMarkaYayilimi(liste: string[], konteynerler: MarkaKonteyneri[]): MarkaGuncellemesi[] {
  const tekil = Array.from(new Set(liste.map(sade).filter(Boolean)));
  if (tekil.length !== 1) return [];
  const marka = tekil[0];
  const out: MarkaGuncellemesi[] = [];
  for (const k of konteynerler) {
    const kalemler = kalemleriOku(k.kalemler);
    const kalemFarkli = kalemler.some((x) => x.marka !== marka);
    if (sade(k.marka) === marka && !kalemFarkli) continue;
    out.push(kalemFarkli ? { id: k.id, marka, kalemler: kalemler.map((x) => ({ ...x, marka })) } : { id: k.id, marka });
  }
  return out;
}

/** Konteynerin markasi elle girilmis listede yok mu (birden fazla markali dosyada uyari). */
export function markaListedeYok(marka: string | null | undefined, manuelListe: string[]): boolean {
  const m = sade(marka);
  return manuelListe.length > 0 && !!m && !manuelListe.map(sade).includes(m);
}
