/**
 * ÖN ÖDEME DAĞITIMI (16.11.2026). Hesabın kendisi veritabanında (on_odeme_dagitim, migration
 * 20261116170000_on_odeme_dagitimi.sql); burada istemcinin ihtiyaç duyduğu saf yardımcılar var.
 *
 * Kural (yalnız sipariş takibi yapılan proformalar):
 *   dosyaya düşen ön ödeme = dosyanın fatura tutarı (yüklenen mal) x proformadaki ön ödeme yüzdesi,
 *   en fazla havuzda kalan kadar; kalan bir sonraki sevkiyata (siparişe devam et) devreder.
 */

/** Ödeme şartından ön ödeme yüzdesi: "%30 ADVANCE", "30% ADVANCE", "% 20 ADVANCE PAYMENT" -> 30 / 30 / 20.
 *  SQL on_odeme_orani_oku ile AYNI kural. Yüzde ön ödemeye ait değilse ("%100 PAYMENT AGAINST COPY") null. */
export function onOdemeOrani(odemeSekli: string | null | undefined): number | null {
  const s = String(odemeSekli || "").toLocaleUpperCase("en-US");
  const tur = "(?:ADVANCE|PRE-?PAYMENT|DEPOSIT|PREPAID|DOWN\\s*PAYMENT)";
  const m = s.match(new RegExp(`%\\s*(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*${tur}`)) || s.match(new RegExp(`(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*%\\s*${tur}`));
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return v > 0 && v <= 100 ? v : null;
}

/** Yeni sevkiyat dosyası için başlangıç avansı: tutar x yüzde (havuz girilmişse veritabanı bunu düzeltir). */
export function beklenenAvans(toplamTutar: number | null | undefined, odemeSekli: string | null | undefined): number | null {
  const oran = onOdemeOrani(odemeSekli);
  if (oran === null || toplamTutar == null || !(toplamTutar > 0)) return null;
  return Math.round(toplamTutar * oran) / 100;
}

export type DagitimDurumu = "tamam" | "havuz_yok" | "takip_degil" | "oran_yok" | "kur_yok" | "para_karisik";

export type DagitimDosyasi = {
  id: string;
  dosya_no: string | null;
  durum: string | null;
  tutar: number | null;
  mevcut: number | null;
  pay: number | null;
  kilit: "elle" | "fatura_talimati" | "kapali" | null;
  dagitimli: boolean;
};

export type OnOdemeDagitimi = {
  durum: DagitimDurumu;
  anahtar: string | null;
  para: string | null;
  havuz: number | null;
  havuz_tutar: number | null;
  havuz_para: string | null;
  karsilik: number | null;
  oran: number | null;
  oran_kaynak: "elle" | "odeme_sekli" | null;
  dagitilan: number | null;
  kalan: number | null;
  dosyalar: DagitimDosyasi[];
};

export const DAGITIM_DURUM_METNI: Record<DagitimDurumu, string> = {
  tamam: "Ön ödeme sevkiyatlara dağıtıldı.",
  havuz_yok: "Ön ödeme tutarı girilmedi; dağıtım yapılmadı.",
  takip_degil: "Tek seferlik dosya (sipariş takibi yok): ön ödeme dağıtılmaz, dosyadaki avans aynen kalır.",
  oran_yok: "Ön ödeme yüzdesi bilinmiyor (ödeme şartında \"%30 ADVANCE\" gibi bir ifade yok); yüzdeyi girin.",
  kur_yok: "Ön ödeme sipariş dövizinden farklı geldi; sipariş dövizindeki karşılığını girin.",
  para_karisik: "Siparişin dosyaları farklı dövizlerde; dağıtım yapılmadı, avansları elle kontrol edin.",
};

export const KILIT_METNI: Record<NonNullable<DagitimDosyasi["kilit"]>, string> = {
  elle: "elle girildi",
  fatura_talimati: "fatura talimatı gönderildi",
  kapali: "dosya kapalı",
};

const sayi = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);

/** RPC cevabını güvenli tipe çevirir. */
export function dagitimOku(ham: unknown): OnOdemeDagitimi | null {
  if (!ham || typeof ham !== "object") return null;
  const h = ham as Record<string, unknown>;
  const durum = String(h.durum || "") as DagitimDurumu;
  if (!(durum in DAGITIM_DURUM_METNI)) return null;
  const dosyalar = Array.isArray(h.dosyalar) ? (h.dosyalar as Record<string, unknown>[]) : [];
  return {
    durum,
    anahtar: (h.anahtar as string) ?? null,
    para: (h.para as string) ?? null,
    havuz: sayi(h.havuz),
    havuz_tutar: sayi(h.havuz_tutar),
    havuz_para: (h.havuz_para as string) ?? null,
    karsilik: sayi(h.karsilik),
    oran: sayi(h.oran),
    oran_kaynak: (h.oran_kaynak as OnOdemeDagitimi["oran_kaynak"]) ?? null,
    dagitilan: sayi(h.dagitilan),
    kalan: sayi(h.kalan),
    dosyalar: dosyalar.map((d) => ({
      id: String(d.id),
      dosya_no: (d.dosya_no as string) ?? null,
      durum: (d.durum as string) ?? null,
      tutar: sayi(d.tutar),
      mevcut: sayi(d.mevcut),
      pay: sayi(d.pay),
      kilit: (d.kilit as DagitimDosyasi["kilit"]) ?? null,
      dagitimli: d.dagitimli === true,
    })),
  };
}
