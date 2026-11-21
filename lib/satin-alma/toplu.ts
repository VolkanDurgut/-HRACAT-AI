import type { SaKalem, SaListe } from "@/supabase/functions/_shared/satin-alma";

/**
 * On onay + haftalik toplu liste yardimcilari (21.11.2026). SAF: Node'da test edilir.
 * Kullanici: "Departmanlar her siparis verdiginde sadece bana gelsin. Ben onay verince Burak
 * Beye onaya gonderilsin ... cumartesi gunune kadar birikecek ... toplu alisveris listesi."
 */

type ListeBenzeri = Pick<SaListe, "id" | "durum" | "departman" | "liste_no" | "gonderim_zamani" | "test" | "kalemler"> & { toplu_id?: string | null };

/** Onay bekleyenler: toplu listeyle sunulanlar toplu bazinda, acil sunulanlar tek tek. */
export function bekleyenleriAyir<T extends ListeBenzeri>(bekleyenler: T[]): { toplular: { id: string; listeler: T[] }[]; tekler: T[] } {
  const m = new Map<string, T[]>();
  const tekler: T[] = [];
  for (const l of bekleyenler) {
    if (l.toplu_id) {
      if (!m.has(l.toplu_id)) m.set(l.toplu_id, []);
      m.get(l.toplu_id)!.push(l);
    } else tekler.push(l);
  }
  const sirala = (a: T, b: T) => (a.gonderim_zamani || "").localeCompare(b.gonderim_zamani || "") || a.id.localeCompare(b.id);
  return {
    toplular: Array.from(m.entries()).map(([id, listeler]) => ({ id, listeler: [...listeler].sort(sirala) })),
    tekler,
  };
}

/** Toplu karar ekrani icin TEK sanal liste: tum formlarin kalemleri + kalem -> form eslemesi. */
export function topluSanalListe<T extends ListeBenzeri>(topluId: string, topluNo: string, listeler: T[]): { liste: T; kalemFormu: Map<string, T> } {
  const kalemFormu = new Map<string, T>();
  const kalemler: SaKalem[] = [];
  for (const l of listeler) for (const k of l.kalemler) { kalemFormu.set(k.id, l); kalemler.push(k); }
  const departmanlar = new Set(listeler.map((l) => l.departman)).size;
  const ilk = listeler[0];
  return {
    liste: { ...ilk, id: topluId, liste_no: topluNo, departman: `Haftalık toplu liste · ${departmanlar} departman`, kalemler },
    kalemFormu,
  };
}

/** On onay ekraninda varsayilan secim: gercek formlarin hepsi; yalniz test formu varsa test formlari.
 * (Test ve gercek form ayni toplu listeye giremez; veritabani da reddeder.) */
export function varsayilanDahil<T extends Pick<SaListe, "test">>(listeler: T[]): (l: T) => boolean {
  const gercekVar = listeler.some((l) => !l.test);
  return (l) => (gercekVar ? !l.test : true);
}

/** Turkiye saatine gore bugun cumartesi mi (satin alma gunu). */
export function satinAlmaGunuMu(simdi: Date = new Date()): boolean {
  const gun = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", weekday: "short" }).format(simdi);
  return gun === "Sat";
}
