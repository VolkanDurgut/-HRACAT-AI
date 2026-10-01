/**
 * Draft Onay 48 saatlik musteri yanit suresi - TEK DOGRU KAYNAK (01.10.2026).
 *
 * Musteriye giden draft mailinde: "kindly waiting your approval or amendment
 * request within 48 hours ... Unless we receive any feedback within 48 hours,
 * it will be deemed approved." Sure, ekip "Gönderildi İşaretle"ye bastigi
 * andan (draft_mail_gonderildi_tarihi) baslar.
 *
 * Daha once bu hesap hem components/draft-onay-karti.tsx hem
 * app/draft-onay/page.tsx icinde ayri ayri yaziliyordu; simdi sayac, siralama,
 * "Süre Doldu" rozeti ve uygulama geneli 10 saat uyarisi hepsi buradan okur.
 *
 * draft_mail_gonderildi_tarihi GERCEK bir UTC zaman damgasidir
 * (new Date().toISOString() ile yazilir) - cut-off alanlarindaki "yerel saat
 * +00 etiketli" sorunu burada YOKTUR, new Date(...) ile okumak dogrudur.
 */
export const DRAFT_YANIT_SURESI_MS = 48 * 60 * 60 * 1000;

export type DraftSureAlanlari = {
  draft_mail_gonderildi?: boolean | null;
  draft_mail_gonderildi_tarihi?: string | null;
  draft_musteri_onayi_alindi?: boolean | null;
  draft_revize_istendi?: boolean | null;
};

/** Musteri yaniti hala bekleniyor mu (gonderildi, onay da revize de yok)? */
export function draftYanitBekleniyor(d: DraftSureAlanlari): boolean {
  return !!d.draft_mail_gonderildi && !d.draft_musteri_onayi_alindi && !d.draft_revize_istendi;
}

/**
 * 48 saatlik surenin bittigi an (epoch ms). Yanit beklenmiyorsa veya gonderim
 * tarihi yoksa / okunamiyorsa null.
 */
export function draftYanitSonuMs(d: DraftSureAlanlari): number | null {
  if (!draftYanitBekleniyor(d) || !d.draft_mail_gonderildi_tarihi) return null;
  const baslangic = new Date(d.draft_mail_gonderildi_tarihi).getTime();
  if (isNaN(baslangic)) return null;
  return baslangic + DRAFT_YANIT_SURESI_MS;
}

/** 48 saat yanitsiz doldu mu? ("Süre Doldu" rozeti ve siralama) */
export function draftSuresiDoldu(d: DraftSureAlanlari, simdi: number = Date.now()): boolean {
  const son = draftYanitSonuMs(d);
  return son !== null && simdi > son;
}

/** Epoch ms'i Turkiye saatiyle "02.10.2026 13:37" bicimine cevirir. */
export function formatIstanbulTarihSaat(ms: number): string {
  const d = new Date(ms);
  const tarih = d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });
  const saat = d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${tarih} ${saat}`;
}
