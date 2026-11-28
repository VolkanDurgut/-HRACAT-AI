/**
 * HAT TAKIP - Asama 2 (28.11.2026): ETD/ETA ekrani ve Ana Panel icin hat ETA uyarisi. SAF fonksiyonlar, YALNIZ GORUNTU:
 * sistemdeki ETA'yi degistirmez. Seviye kurali tek yerde: lib/hat-takip/gorunum.ts etaKarsilastir
 * (0 gun ayni / 1-2 gun uyari / 3+ gun kritik). Test: tests/hat-takip-eta-uyari.test.ts.
 */
import { etaKarsilastir, farkYazi, onceYazi, SINIF_ETIKETI, trGun, trZaman, type FarkSeviyesi } from "@/lib/hat-takip/gorunum";
import { istanbulGunu } from "@/supabase/functions/_shared/hat-takip";

/** Bir booking'in hat ozeti (lib/hat-takip/veri.ts hatEtaOzetleriOku). sistem_eta: rezervasyonun kayitli ETA'si. */
export type HatEtaOzeti = {
  rezervasyon_id: string;
  booking_no: string;
  durum: string;
  son_sorgu: string | null;
  hat_eta: string | null;
  hat_eta_sinif: string | null;
  gemi: string | null;
  sefer: string | null;
  /** 28.11.2026: true -> hattin ETA'si sisteme otomatik yazilir (hat_eta_esitle), Excel ETA'si uygulanmaz */
  eta_otomatik?: boolean;
  sistem_eta: string | null;
  dosya_id: string | null;
  dosya_no: string | null;
  alici_firma: string | null;
};

/** Son basarili sorgudan bu yana bu kadar saat gectiyse bilgi "guncel degil" sayilir (zamanlayici 15 dk'da bir calisir). */
export const GUNCEL_SAAT = 24;

export type EtaUyarisi = {
  seviye: FarkSeviyesi;
  /** hat - sistem (gun); sistemde ETA yoksa null */
  fark: number | null;
  /** hattin ETA gunu, Istanbul (YYYY-MM-DD) */
  hatGun: string;
  guncel: boolean;
  /** rozet yazisi: "Hat ✓" / "Hat 05.12 · +4 gün" / "Hat 05.12" */
  metin: string;
  /** uzerine gelince: kaynak, sinif, sistem tarihi, son sorgu */
  ipucu: string;
};

/**
 * Sistem ETA'si ile hattin ETA'sini karsilastirir. Hat bilgisi yoksa / sorgu basarisizsa null (rozet gosterilmez;
 * ayrinti Hat Takip sayfasinda). sistemEta: ekranda o an gorunen deger (elle duzeltilince rozet hemen guncellenir).
 */
export function etaUyarisi(sistemEta: string | null, ozet: HatEtaOzeti | null | undefined, simdi: number = Date.now()): EtaUyarisi | null {
  if (!ozet || ozet.durum !== "tamam" || !ozet.hat_eta) return null;
  const hatGun = istanbulGunu(ozet.hat_eta);
  if (!hatGun) return null;
  const { fark, seviye } = etaKarsilastir(sistemEta, ozet.hat_eta);
  const t = ozet.son_sorgu ? Date.parse(ozet.son_sorgu) : NaN;
  const guncel = !Number.isNaN(t) && simdi - t <= GUNCEL_SAAT * 3600_000;
  const kisa = `${hatGun.slice(8, 10)}.${hatGun.slice(5, 7)}`;
  const metin = seviye === "ayni" ? "Hat ✓" : seviye === "yok" ? `Hat ${kisa}` : `Hat ${kisa} · ${farkYazi(fark)}`;
  const sinif = ozet.hat_eta_sinif ? SINIF_ETIKETI[ozet.hat_eta_sinif] ?? ozet.hat_eta_sinif : "—";
  const ipucu = [
    `Hapag-Lloyd ETA: ${trZaman(ozet.hat_eta)} (${sinif})`,
    sistemEta ? `Sistem ETA: ${trGun(sistemEta.slice(0, 10))}` : "Sistemde ETA girilmemiş",
    seviye === "ayni" ? "Tarihler aynı" : fark !== null ? `Fark: ${farkYazi(fark)}` : null,
    `Son sorgu: ${onceYazi(ozet.son_sorgu, simdi)}${guncel ? "" : " (güncel değil)"}`,
    hatEtaOtomatik(ozet) ? "ETA Hapag-Lloyd'dan otomatik güncellenir; Excel bu ETA'yı değiştirmez." : "Bu bilgi sistemdeki ETA'yı değiştirmez.",
  ].filter(Boolean).join("\n");
  return { seviye, fark, hatGun, guncel, metin, ipucu };
}

/**
 * 28.11.2026: Bu sevkiyatin ETA'si hattan otomatik mi geliyor? (sunucu kurali ile ayni: aktif + eta_otomatik + tamam + hat ETA'si var;
 * odeme_excel_yukleme_kaydet / hat_eta_esitle). Liste yalniz aktif takipleri icerir.
 */
export function hatEtaOtomatik(ozet: HatEtaOzeti | null | undefined): boolean {
  return !!ozet && ozet.eta_otomatik !== false && ozet.durum === "tamam" && !!ozet.hat_eta;
}

/** Uyarilacaklar: farki olan (uyari / kritik) booking'ler; once kritik, sonra farki buyuk olan, sonra dosya no. */
export function etaFarkiOlanlar(ozetler: HatEtaOzeti[], simdi: number = Date.now()): { ozet: HatEtaOzeti; uyari: EtaUyarisi }[] {
  const derece = (s: FarkSeviyesi) => (s === "kritik" ? 0 : 1);
  return ozetler
    .map((ozet) => ({ ozet, uyari: etaUyarisi(ozet.sistem_eta, ozet, simdi) }))
    .filter((x): x is { ozet: HatEtaOzeti; uyari: EtaUyarisi } => !!x.uyari && (x.uyari.seviye === "uyari" || x.uyari.seviye === "kritik"))
    .sort((a, b) => derece(a.uyari.seviye) - derece(b.uyari.seviye)
      || Math.abs(b.uyari.fark ?? 0) - Math.abs(a.uyari.fark ?? 0)
      || (a.ozet.dosya_no ?? "").localeCompare(b.ozet.dosya_no ?? ""));
}

/** Uyari seviyesine gore renkler (ETD/ETA ekranindaki mevcut rozet tonlariyla ayni). */
export const SEVIYE_RENGI: Record<FarkSeviyesi, { renk: string; zemin: string; kenar: string }> = {
  ayni: { renk: "#6EE7B7", zemin: "rgba(16,185,129,0.10)", kenar: "rgba(16,185,129,0.25)" },
  uyari: { renk: "#FCD34D", zemin: "rgba(245,158,11,0.10)", kenar: "rgba(245,158,11,0.30)" },
  kritik: { renk: "#FCA5A5", zemin: "rgba(239,68,68,0.12)", kenar: "rgba(239,68,68,0.35)" },
  yok: { renk: "#C9D1DC", zemin: "rgba(255,255,255,0.05)", kenar: "rgba(255,255,255,0.12)" },
};
