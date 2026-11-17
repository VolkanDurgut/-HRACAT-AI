/**
 * Kontrol Merkezi > Sevkiyat Haritasi: "su an sevkiyati olan" liman (16.11.2026). Saf modul.
 * Kullanici: "Sevkiyat haritasi en dogru hali ile guncellenmeli ve su an sevkiyati olan limanlar yesil olarak belirtilmeli."
 *
 * Dosya durumu ("Kapali" evrak tamam demektir; gemi hala denizde olabilir) TEK BASINA yetmez; rezervasyon tarihlerine bakilir:
 *  - YOLDA: gemi kalkti (ETD <= bugun) ve varmadi (ETA >= bugun; ETA girilmemisse kalkistan bu yana en fazla
 *    ETA_YOKSA_GUN gun gecti).
 *  - YUKLEMEDE: ETD ileri tarihli ya da dosya acik ve henuz ETD yok.
 *  - TAMAMLANDI: digerleri (ETA gecti ya da dosya kapali ve kalkis cok eski).
 * Liman yesil = en az bir dosyasi YOLDA ya da YUKLEMEDE.
 */
export type AktifRezervasyon = { gemi_kalkis_tarihi: string | null; eta: string | null; konteyner_adedi: number | null };
export type AktifDosya = { kapali: boolean; rezervasyonlar: AktifRezervasyon[]; konteyner: number };
export type SevkiyatDurumu = "yolda" | "yuklemede" | "tamamlandi";
export type LimanAktifligi = {
  yoldaKonteyner: number; yoldaDosya: number; yuklemedeKonteyner: number; yuklemedeDosya: number;
  /** En yakin varis (yoldakiler) ve en yakin kalkis (yuklemedekiler), YYYY-MM-DD. */
  enYakinEta: string | null; enYakinEtd: string | null;
};

export const ETA_YOKSA_GUN = 45;
const gun = (t: string | null | undefined) => (t ? t.slice(0, 10) : null);
const gunEkle = (t: string, n: number) => {
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** etaYoksaGun (17.11.2026): ETA girilmemisse varis tahmini icin kalkistan sonraki gun (limanin gercek transit ortalamasi). */
export function sevkiyatDurumu(d: AktifDosya, bugun: string, etaYoksaGun: number = ETA_YOKSA_GUN): SevkiyatDurumu {
  const sinir = gunEkle(bugun, -etaYoksaGun);
  const rez = d.rezervasyonlar;
  const yolda = rez.some((r) => {
    const etd = gun(r.gemi_kalkis_tarihi), eta = gun(r.eta);
    if (!etd || etd > bugun) return false;
    return eta ? eta >= bugun : etd >= sinir;
  });
  if (yolda) return "yolda";
  if (rez.some((r) => { const etd = gun(r.gemi_kalkis_tarihi); return !!etd && etd > bugun; })) return "yuklemede";
  if (!d.kapali && !rez.some((r) => gun(r.gemi_kalkis_tarihi))) return "yuklemede";
  return "tamamlandi";
}

/** Liman anahtari basina aktiflik; tamamlanmis limanlar haritada yer almaz (null). */
export function limanAktiflikleri<T extends AktifDosya>(dosyalar: T[], limanAnahtari: (d: T) => string | null, bugun: string,
  etaYoksaGun: (liman: string) => number = () => ETA_YOKSA_GUN): Map<string, LimanAktifligi> {
  const m = new Map<string, LimanAktifligi>();
  for (const d of dosyalar) {
    const liman = limanAnahtari(d);
    if (!liman) continue;
    const durum = sevkiyatDurumu(d, bugun, etaYoksaGun(liman));
    if (durum === "tamamlandi") continue;
    const a = m.get(liman) || { yoldaKonteyner: 0, yoldaDosya: 0, yuklemedeKonteyner: 0, yuklemedeDosya: 0, enYakinEta: null, enYakinEtd: null };
    if (durum === "yolda") {
      a.yoldaKonteyner += d.konteyner; a.yoldaDosya += 1;
      for (const r of d.rezervasyonlar) { const eta = gun(r.eta); if (eta && eta >= bugun && (!a.enYakinEta || eta < a.enYakinEta)) a.enYakinEta = eta; }
    } else {
      a.yuklemedeKonteyner += d.konteyner; a.yuklemedeDosya += 1;
      for (const r of d.rezervasyonlar) { const etd = gun(r.gemi_kalkis_tarihi); if (etd && etd > bugun && (!a.enYakinEtd || etd < a.enYakinEtd)) a.enYakinEtd = etd; }
    }
    m.set(liman, a);
  }
  return m;
}

/**
 * Limanin ETA'siz sevkiyatlari icin varis tahmini (17.11.2026): ayni limana giden rezervasyonlarin gercek ETD -> ETA
 * ortalamasi + TRANSIT_PAYI gun (gecikme payi); hic olcum yoksa ETA_YOKSA_GUN. 1..120 gun disi olcumler sayilmaz.
 */
export const TRANSIT_PAYI = 7;
export function limanTransitGunleri<T extends { rezervasyonlar: AktifRezervasyon[] }>(dosyalar: T[], limanAnahtari: (d: T) => string | null): Map<string, number> {
  const t = new Map<string, { top: number; n: number }>();
  for (const d of dosyalar) {
    const liman = limanAnahtari(d);
    if (!liman) continue;
    for (const r of d.rezervasyonlar) {
      const etd = gun(r.gemi_kalkis_tarihi), eta = gun(r.eta);
      if (!etd || !eta) continue;
      const g = Math.round((Date.parse(`${eta}T12:00:00Z`) - Date.parse(`${etd}T12:00:00Z`)) / 86_400_000);
      if (!(g >= 1 && g <= 120)) continue;
      const o = t.get(liman) || { top: 0, n: 0 };
      o.top += g; o.n += 1;
      t.set(liman, o);
    }
  }
  return new Map(Array.from(t.entries()).map(([l, o]) => [l, Math.round(o.top / o.n) + TRANSIT_PAYI]));
}

/**
 * YUKLEME PLANI satirlari haritada (17.11.2026, kullanici: "Butun limanlar gozukmeli"): sistemde ihracat dosyasi
 * acilmamis booking'ler de sevkiyattir. Dosyaya bagli satir (dosya_id / rezervasyon_id / ayni booking no) ATLANIR
 * (dosya zaten sayiliyor; cift sayim yok). Plan satiri dosya gibi degerlendirilir: ETD = kalkis, ETA bilinmez; durum
 * YALNIZ tarihten (ileri ETD yuklemede, kalkmis ve varmamis yolda). ETD'siz plan satiri aktif SAYILMAZ (kapali: true) -
 * eski, tarihi girilmemis satir limani surekli yesil gostermesin; konteyneri donem toplamina yine girer.
 */
export type PlanHaritaSatiri = {
  id: string; booking_no: string | null; varis_limani: string | null; etd: string | null; konteyner: number | null;
  dosya_id: string | null; rezervasyon_id: string | null;
  /** yukleme limani (AMBARLI / ASYAPORT ...) */
  liman?: string | null;
};
export type PlanAktifDosyasi = AktifDosya & { id: string; varis_limani: string | null; etd: string | null; yukleme: string | null };
const bookingAnahtari = (b: string | null | undefined) => String(b || "").replace(/\s+/g, "").toUpperCase();
export function planSevkiyatlari(
  plan: PlanHaritaSatiri[],
  dosyalar: { id: string; rezervasyonlar: { id?: string | null; booking_no?: string | null }[] }[],
): PlanAktifDosyasi[] {
  const dosyaIdleri = new Set(dosyalar.map((d) => d.id));
  const rezIdleri = new Set(dosyalar.flatMap((d) => d.rezervasyonlar.map((r) => r.id).filter((x): x is string => !!x)));
  const bookingler = new Set(dosyalar.flatMap((d) => d.rezervasyonlar.map((r) => bookingAnahtari(r.booking_no)).filter(Boolean)));
  return plan
    .filter((p) => !(p.dosya_id && dosyaIdleri.has(p.dosya_id)) && !(p.rezervasyon_id && rezIdleri.has(p.rezervasyon_id))
      && !(bookingAnahtari(p.booking_no) && bookingler.has(bookingAnahtari(p.booking_no))))
    .map((p) => {
      const k = Math.max(0, Number(p.konteyner) || 0);
      return {
        id: p.id, varis_limani: p.varis_limani, etd: gun(p.etd), yukleme: p.liman ?? null, konteyner: k, kapali: true,
        rezervasyonlar: gun(p.etd) ? [{ gemi_kalkis_tarihi: gun(p.etd), eta: null, konteyner_adedi: k }] : [],
      };
    });
}
