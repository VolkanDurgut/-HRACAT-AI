/**
 * ANA PANEL - IS EMIRLERI (22.11.2026). Saf hesap (veri / ag yok); test: tests/panel-is-emirleri.test.ts.
 *
 * Kullanici: "Onaylananlar yani on odemesi alinmis proformalar ana panelde gozukmeli. Rezervasyonu da belliyse
 * rezervasyonlu olarak gorulebilmeli. Mevcut is emrine hemen ulasabilmis olacagiz; proforma aramak zorunda kalmayacagim."
 *
 * Kaynak: panel_is_emirleri() (migration 20261122090000) - dosyasi HENUZ ACILMAMIS is emirleri:
 *  - rezervasyonlu: Yukleme Plani'nda booking'i var, sistemde dosyasi / rezervasyonu yok (talimat cut-off'una gore sirali)
 *  - on_odeme:      on odemesi alinmis, rezervasyon bekliyor (en eski on odeme ustte)
 * Aksiyon kurali Yukleme Plani paneliyle ayni (lib/siparis/plan-bekleyen.ts bekleyenAksiyonu): rezervasyonsuz acik dosya
 * -> Rezervasyon ekle; siparis takibi -> Sevkiyat ac; sistem proformasi -> Dosya ac (?otomatik=1); yoksa Proforma yukle.
 */
import { bekleyenAksiyonu, type BekleyenAksiyon, type BekleyenDurum } from "@/lib/siparis/plan-bekleyen";
import { bookingAdresEki } from "@/lib/siparis-devam";

export type IsEmriTuru = "rezervasyonlu" | "on_odeme";

export type IsEmri = {
  tur: IsEmriTuru;
  anahtar: string;
  musteri: string | null;
  proforma_no: string | null;
  booking_no: string | null;
  konteyner: number | null;
  cinsi: string | null;
  varis_limani: string | null;
  cuval_markasi: string | null;
  ambalaj: string | null;
  acente: string | null;
  liman: string | null;
  ekipman: string | null;
  bos_ekipman_tarihi: string | null;
  ardiyesiz_giris: string | null;
  talimat_cutoff: string | null;
  beyan_cutoff: string | null;
  etd: string | null;
  gemi: string | null;
  sefer: string | null;
  on_odeme_tarihi: string | null;
};

export type IsEmriSatiri = IsEmri & { aksiyon: BekleyenAksiyon };

const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const sayi = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function isEmriNormalle(r: Record<string, unknown>): IsEmri | null {
  const tur = r.tur === "rezervasyonlu" || r.tur === "on_odeme" ? r.tur : null;
  const anahtar = metin(r.anahtar);
  if (!tur || !anahtar) return null;
  return {
    tur, anahtar, musteri: metin(r.musteri), proforma_no: metin(r.proforma_no), booking_no: metin(r.booking_no), konteyner: sayi(r.konteyner),
    cinsi: metin(r.cinsi), varis_limani: metin(r.varis_limani), cuval_markasi: metin(r.cuval_markasi), ambalaj: metin(r.ambalaj),
    acente: metin(r.acente), liman: metin(r.liman), ekipman: metin(r.ekipman), bos_ekipman_tarihi: metin(r.bos_ekipman_tarihi),
    ardiyesiz_giris: metin(r.ardiyesiz_giris), talimat_cutoff: metin(r.talimat_cutoff), beyan_cutoff: metin(r.beyan_cutoff),
    etd: metin(r.etd), gemi: metin(r.gemi), sefer: metin(r.sefer), on_odeme_tarihi: metin(r.on_odeme_tarihi),
  };
}

/**
 * 22.11.2026 BOOKING'E GORE SIPARIS TAKIBI: rezervasyonlu is emrinin "Dosya ac" / "Sevkiyat ac" adresine booking no ve
 * konteyner sayisi eklenir (?booking=&fcl=); Proforma Yukle / Sevkiyat Secimi karari bundan onerir (lib/siparis-devam.ts
 * bookingKarari). On odeme satirinda booking yok -> adres aynen.
 */
export function bookingliAksiyon(s: IsEmri, a: BekleyenAksiyon): BekleyenAksiyon {
  if (s.tur !== "rezervasyonlu" || (a.tur !== "dosya_ac" && a.tur !== "sevkiyat")) return a;
  const ek = bookingAdresEki(s.booking_no, s.konteyner);
  return ek ? { ...a, href: a.href + ek } : a;
}

/** RPC cevabi -> aksiyonlu satirlar; rezervasyonlu: talimat cut-off (yoksa ETD) en yakin ustte; on odeme: en eski ustte. */
export function isEmirleriHazirla(veri: { satirlar?: unknown; aksiyonlar?: unknown } | null | undefined): { rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[] } {
  const aks = new Map<string, BekleyenDurum>();
  for (const a of (Array.isArray(veri?.aksiyonlar) ? veri!.aksiyonlar : []) as BekleyenDurum[]) {
    if (a && a.proforma_no) aks.set(a.proforma_no, { proforma_no: a.proforma_no, proforma_id: a.proforma_id || null, dosya: a.dosya || null, ana_siparis: a.ana_siparis || null });
  }
  const satirlar = ((Array.isArray(veri?.satirlar) ? veri!.satirlar : []) as Record<string, unknown>[])
    .map(isEmriNormalle).filter((x): x is IsEmri => x !== null)
    .map((s) => ({ ...s, aksiyon: bookingliAksiyon(s, bekleyenAksiyonu(s.proforma_no ? aks.get(s.proforma_no) : undefined, s.proforma_no)) }));
  const zaman = (s: IsEmri) => s.talimat_cutoff || (s.etd ? `${s.etd}T23:59:59Z` : "9999");
  return {
    rezervasyonlu: satirlar.filter((s) => s.tur === "rezervasyonlu").sort((a, b) => zaman(a).localeCompare(zaman(b)) || (a.musteri || "").localeCompare(b.musteri || "", "tr")),
    onOdeme: satirlar.filter((s) => s.tur === "on_odeme").sort((a, b) => (a.on_odeme_tarihi || "9999").localeCompare(b.on_odeme_tarihi || "9999") || (a.musteri || "").localeCompare(b.musteri || "", "tr")),
  };
}

/** Takvim gunu farki (Istanbul): bugun 0, yarin 1, gecen -1. */
export function gunKaldi(iso: string | null, simdi: number = Date.now()): number | null {
  if (!iso) return null;
  const gun = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
  const hedef = iso.length <= 10 ? iso : gun(Date.parse(iso));
  const fark = (Date.parse(`${hedef}T00:00:00Z`) - Date.parse(`${gun(simdi)}T00:00:00Z`)) / 86400000;
  return Number.isFinite(fark) ? Math.round(fark) : null;
}

/** Aciliyet: gecti / 2 gun icinde / normal (talimat cut-off; yoksa ETD). */
export function isEmriAciliyeti(s: Pick<IsEmri, "talimat_cutoff" | "etd">, simdi: number = Date.now()): "gecti" | "yakin" | "normal" {
  const g = gunKaldi(s.talimat_cutoff || s.etd, simdi);
  if (g === null) return "normal";
  if (g < 0) return "gecti";
  return g <= 2 ? "yakin" : "normal";
}
