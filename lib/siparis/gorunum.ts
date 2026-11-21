/**
 * SIPARIS LISTESI SEKMELERI (16.11.2026). Kontrol Merkezi / Pazar / Ana Panel ile ayni duzen: sabit ust (6 kart) + tek
 * sekme cubugu (?sekme=). Saf fonksiyonlar (veri / ag yok) - tests/siparis-gorunum.test.ts.
 *
 * 21.11.2026 (kullanici): "Rezervasyonlu sekmesi zaten guncel yukleme plani anlamina geliyor; kaldiralim, sayfa
 * acildiginda yukleme plani karsilasin. Sevk edilen kismini da kaldiralim; ihracatlar sayfasinda geriye donuk her seyi
 * kontrol edebiliyoruz." Sekmeler: Yukleme Plani (varsayilan) | Rezervasyon bekleyen | Onay bekleyen | Siparis Formlari.
 *  - Rezervasyonlu / BL eksik satirlar Yukleme Plani'nda booking satiri olarak gorunur (satirSekmesi -> "plan").
 *  - Sevk edilen / iptal satirlar listede sekme olarak gosterilmez (satirSekmesi -> null; Ihracatlar sayfasi).
 *  - Eski adresler (?sekme=rezervasyonlu / ?sekme=sevk) bilinmeyen deger sayilir -> varsayilan (Yukleme Plani).
 *  Veri ve Excel indirme degismedi (indirilen Excel tum satirlari icerir).
 */
import type { SiparisDurum, SiparisSatiri } from "@/lib/siparis/liste";
import { trBuyuk } from "@/lib/tr-arama";

export type SiparisSekme = "plan" | "rez_bekleyen" | "onay" | "formlar";
/** Siparis satiri gosteren sekmeler (plan ve 18.11.2026 Siparis Formlari satir gostermez). */
export type ListeSekmesi = Exclude<SiparisSekme, "plan" | "formlar">;
export const VARSAYILAN_SIPARIS_SEKMESI: SiparisSekme = "plan";
export const SIPARIS_SEKMELERI: SiparisSekme[] = ["plan", "rez_bekleyen", "onay", "formlar"];

/** Hangi durum hangi liste sekmesinde. */
export const SEKME_DURUMLARI: Record<ListeSekmesi, SiparisDurum[]> = {
  rez_bekleyen: ["on_odeme_alindi"],
  onay: ["onay_bekliyor"],
};
/** Yukleme Plani'nda booking olarak gorunen durumlar. */
export const PLAN_DURUMLARI: SiparisDurum[] = ["rezervasyonlu", "bl_eksik"];

/** ?sekme= degeri; bilinmeyen / bos -> null (varsayilan sekme). */
export function siparisSekmesi(v: string | null | undefined): SiparisSekme | null {
  const x = (v || "").trim().toLowerCase();
  return (SIPARIS_SEKMELERI as string[]).includes(x) ? (x as SiparisSekme) : null;
}

export function sekmeyeAit(s: Pick<SiparisSatiri, "durum">, sekme: SiparisSekme): boolean {
  return sekme !== "plan" && sekme !== "formlar" && SEKME_DURUMLARI[sekme].includes(s.durum);
}

/** Satirin goruldugu sekme: liste sekmesi, rezervasyonlu / BL eksik -> "plan", sevk / iptal -> null (Ihracatlar). */
export function satirSekmesi(s: Pick<SiparisSatiri, "durum">): SiparisSekme | null {
  const liste = (Object.keys(SEKME_DURUMLARI) as ListeSekmesi[]).find((k) => SEKME_DURUMLARI[k].includes(s.durum));
  if (liste) return liste;
  return PLAN_DURUMLARI.includes(s.durum) ? "plan" : null;
}

export function sekmeSayilari(liste: Pick<SiparisSatiri, "durum">[]): Record<ListeSekmesi, number> {
  const say = { rez_bekleyen: 0, onay: 0 };
  for (const s of liste) {
    const k = satirSekmesi(s);
    if (k === "rez_bekleyen" || k === "onay") say[k] += 1;
  }
  return say;
}

/**
 * Bir siparis satirini Yukleme Plani'nda bulmak icin arama metni: booking (Excel'de rezervasyonlu satirin BL sutunu
 * booking'dir) yoksa firma adinin ilk iki kelimesi (plan musteri adi kisaltilmis olabilir: "SAMREX GLOBAL").
 */
export function planAramaMetni(s: { booking_no?: string | null; bl_no?: string | null; firma?: string | null }): string {
  const bk = (s.booking_no || s.bl_no || "").split(/\s*[,/;]\s*/)[0]?.trim();
  if (bk) return bk;
  return (s.firma || "").replace(/[^\p{L}\p{N}&\s-]/gu, " ").trim().split(/\s+/).slice(0, 2).join(" ");
}

// Turkce harf duyarsiz arama ("istanbul" = "İSTANBUL", "ı" = "i") - ortak kural: lib/tr-arama.ts
export const aramaNorm = trBuyuk;

const ARANAN_ALANLAR = ["proforma_no", "firma", "urun", "liman", "marka", "booking_no", "dosya_no", "bl_no", "eslesik_proforma"] as const;
export function siparisAra<T extends Partial<Pick<SiparisSatiri, (typeof ARANAN_ALANLAR)[number]>>>(liste: T[], arama: string): T[] {
  const q = aramaNorm(arama.trim());
  if (!q) return liste;
  return liste.filter((s) => ARANAN_ALANLAR.some((k) => { const v = s[k]; return typeof v === "string" && aramaNorm(v).includes(q); }));
}

/** "Olasi tekrar" kartinin acacagi sekme: ilk supheli satirin sekmesi (sevk / iptal sayilmaz; yoksa onay). */
export function tekrarSekmesi(liste: Pick<SiparisSatiri, "durum" | "benzer" | "kaynak">[]): SiparisSekme {
  for (const x of liste) {
    if (!x.benzer || x.kaynak !== "sistem") continue;
    const k = satirSekmesi(x);
    if (k) return k;
  }
  return "onay";
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
