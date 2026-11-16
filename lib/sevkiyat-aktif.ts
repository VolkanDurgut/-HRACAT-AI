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

export function sevkiyatDurumu(d: AktifDosya, bugun: string): SevkiyatDurumu {
  const sinir = gunEkle(bugun, -ETA_YOKSA_GUN);
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
export function limanAktiflikleri<T extends AktifDosya>(dosyalar: T[], limanAnahtari: (d: T) => string | null, bugun: string): Map<string, LimanAktifligi> {
  const m = new Map<string, LimanAktifligi>();
  for (const d of dosyalar) {
    const liman = limanAnahtari(d);
    if (!liman) continue;
    const durum = sevkiyatDurumu(d, bugun);
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
