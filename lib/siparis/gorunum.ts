/**
 * SIPARIS LISTESI SEKMELERI (16.11.2026). Kontrol Merkezi / Pazar / Ana Panel ile ayni duzen: sabit ust (6 kart) + tek
 * sekme cubugu (?sekme=). Alt alta uc blok yerine her blok bir sekme; sevk edilenler ayri sekme (sayfa acilisinda yer kaplamaz).
 * Saf fonksiyonlar (veri / ag yok) - tests/siparis-gorunum.test.ts.
 */
import type { SiparisDurum, SiparisSatiri } from "@/lib/siparis/liste";

export type SiparisSekme = "rezervasyonlu" | "rez_bekleyen" | "onay" | "sevk" | "plan";
export const VARSAYILAN_SIPARIS_SEKMESI: SiparisSekme = "rezervasyonlu";
export const SIPARIS_SEKMELERI: SiparisSekme[] = ["rezervasyonlu", "rez_bekleyen", "onay", "sevk", "plan"];

/** Hangi durum hangi sekmede (plan sekmesi siparis satiri gostermez). */
export const SEKME_DURUMLARI: Record<Exclude<SiparisSekme, "plan">, SiparisDurum[]> = {
  rezervasyonlu: ["rezervasyonlu", "bl_eksik"],
  rez_bekleyen: ["on_odeme_alindi"],
  onay: ["onay_bekliyor"],
  sevk: ["sevk_edildi", "iptal"],
};

/** ?sekme= degeri; bilinmeyen / bos -> null (varsayilan sekme). */
export function siparisSekmesi(v: string | null | undefined): SiparisSekme | null {
  const x = (v || "").trim().toLowerCase();
  return (SIPARIS_SEKMELERI as string[]).includes(x) ? (x as SiparisSekme) : null;
}

export function sekmeyeAit(s: Pick<SiparisSatiri, "durum">, sekme: SiparisSekme): boolean {
  return sekme !== "plan" && SEKME_DURUMLARI[sekme].includes(s.durum);
}

/** Satirin sekmesi (her durum tam olarak bir sekmede). */
export function satirSekmesi(s: Pick<SiparisSatiri, "durum">): Exclude<SiparisSekme, "plan"> {
  return (Object.keys(SEKME_DURUMLARI) as Exclude<SiparisSekme, "plan">[]).find((k) => SEKME_DURUMLARI[k].includes(s.durum)) || "onay";
}

export function sekmeSayilari(liste: Pick<SiparisSatiri, "durum">[]): Record<Exclude<SiparisSekme, "plan">, number> {
  const say = { rezervasyonlu: 0, rez_bekleyen: 0, onay: 0, sevk: 0 };
  for (const s of liste) say[satirSekmesi(s)] += 1;
  return say;
}

// Turkce harf duyarsiz arama ("istanbul" = "İSTANBUL", "ı" = "i")
export const aramaNorm = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");

const ARANAN_ALANLAR = ["proforma_no", "firma", "urun", "liman", "marka", "booking_no", "dosya_no", "bl_no", "eslesik_proforma"] as const;
export function siparisAra<T extends Partial<Pick<SiparisSatiri, (typeof ARANAN_ALANLAR)[number]>>>(liste: T[], arama: string): T[] {
  const q = aramaNorm(arama.trim());
  if (!q) return liste;
  return liste.filter((s) => ARANAN_ALANLAR.some((k) => { const v = s[k]; return typeof v === "string" && aramaNorm(v).includes(q); }));
}

/** "Olasi tekrar" kartinin acacagi sekme: ilk supheli satirin sekmesi (yoksa onay). */
export function tekrarSekmesi(liste: Pick<SiparisSatiri, "durum" | "benzer" | "kaynak">[]): Exclude<SiparisSekme, "plan"> {
  const s = liste.find((x) => x.benzer && x.kaynak === "sistem");
  return s ? satirSekmesi(s) : "onay";
}

/** Ana Panel'e satir vurgusuyla gidilebilir mi: yalniz rezervasyonlu (acik) dosyalar; sevk / kapali dosya panelde olmayabilir. */
export function panelBaglantisi(s: Pick<SiparisSatiri, "durum" | "dosya_no">): string | null {
  const no = (s.dosya_no || "").trim();
  return s.durum === "rezervasyonlu" && no ? `/panel?dosya=${encodeURIComponent(no)}` : null;
}

export function pazarBaglantisi(firma: string | null | undefined): string | null {
  const f = (firma || "").trim();
  return f ? `/pazar?musteri=${encodeURIComponent(f)}` : null;
}
