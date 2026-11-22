/**
 * PAZAR - MUSTERI SIPARIS RITMI (23.11.2026). SAF modul; test: tests/pazar-siparis-ritmi.test.ts.
 *
 * Kullanici: "Musterilerin acik sevkiyatlari varsa yani henuz yolda yukleri varsa veya iceride kalan siparisi varsa aktif
 * siparis. Digerlerinin tarihlerini guncel yukleme planindan bulabilirsin. Ilk once kendi musterilerimizin siparis
 * tarihlerini yani rezervasyon tarihlerinden yola cikarak ne zaman mal istediklerine dair bir denklem edinmek. Daha
 * sonrasinda aktif siparisi olmayan musterileri tespit edelim."
 *
 * Kaynak: pazar_musteri_sevkiyatlari() (Yukleme Plani + plana girmemis rezervasyonlar; ETD, konteyner, ETA, kapali).
 * DENKLEM:
 *  - Dalga: ETD'leri DALGA_GUN gun icinde olan booking'ler tek "mal istegi" (bir siparis birkac gemiyle gider).
 *  - Aralik = ardisik dalgalarin ilk ETD'leri arasindaki gun; ritim = ORTANCA aralik (tek uc deger kaydirmaz).
 *  - Tedarik = siparis (proforma tarihi) -> ETD ortanca gunu (musterinin kendi; yoksa genel, canli 31 gun).
 *  - Beklenen sonraki ETD = son dalga + ritim; BEKLENEN SIPARIS = beklenen ETD - tedarik.
 *  - Durum (yalniz aktif SIPARISI OLMAYAN musteri icin anlamli):
 *      fark = bugun - beklenen siparis; tolerans = max(TOLERANS_ALT, ritim / 2)
 *      gecikti      fark > tolerans            (beklenen siparis gelmedi: once bunlar aranmali)
 *      zamani_geldi 0 <= fark <= tolerans
 *      yaklasiyor   -YAKLASMA_GUN <= fark < 0
 *      erken        fark < -YAKLASMA_GUN
 *      veri_az      dalga sayisi < EN_AZ_DALGA (ritim hesaplanmaz; yalniz son sevkiyat)
 *  - Yolda / yuklemede: lib/sevkiyat-aktif sevkiyatDurumu (Kontrol Merkezi sevkiyat haritasiyla AYNI kural: ETA varsa ETA,
 *    yoksa limanin olculen transit suresi, o da yoksa ETA_YOKSA_GUN). Yolda ya da ileri tarihli booking'i olan musteri AKTIF.
 */
import { ETA_YOKSA_GUN, limanTransitGunleri, sevkiyatDurumu } from "@/lib/sevkiyat-aktif";

export const DALGA_GUN = 7;
export const EN_AZ_DALGA = 3;
export const TOLERANS_ALT = 14;
export const YAKLASMA_GUN = 14;
export const VARSAYILAN_TEDARIK = 31;

export type RitimSevkiyati = {
  firma_id: string; etd: string; konteyner: number; booking: string | null; varis: string | null;
  kaynak: "plan" | "dosya"; eta: string | null; kapali: boolean | null;
};
export type SevkiyatVerisi = {
  sevkiyatlar: RitimSevkiyati[];
  tedarik: { firma_id: string; gun: number; n: number }[];
  tedarik_genel: number | null;
  eslesmeyen: { ad: string; sevkiyat: number; konteyner: number; son_etd: string | null }[];
};

export type Dalga = { bas: string; son: string; konteyner: number; booking: number };
export type RitimDurumu = "gecikti" | "zamani_geldi" | "yaklasiyor" | "erken" | "veri_az";
export type MusteriRitmi = {
  dalgalar: Dalga[];
  ritimGun: number | null;
  aralikMin: number | null;
  aralikMax: number | null;
  ortKonteyner: number | null;
  sonEtd: string | null;
  tedarikGun: number;
  tedarikKaynak: "musteri" | "genel";
  beklenenEtd: string | null;
  beklenenSiparis: string | null;
  durum: RitimDurumu;
  /** bugun - beklenen siparis (gun); veri_az'da null */
  fark: number | null;
  yolda: { etd: string; eta: string | null; varisTahmini: string | null; konteyner: number; varis: string | null }[];
  yuklemede: { etd: string; konteyner: number; booking: string | null }[];
};

export const RITIM_ETIKETI: Record<RitimDurumu, string> = {
  gecikti: "Sipariş gecikti",
  zamani_geldi: "Sipariş zamanı geldi",
  yaklasiyor: "Sipariş yaklaşıyor",
  erken: "Henüz erken",
  veri_az: "Veri az",
};

const GUN_MS = 86_400_000;
const gunKismi = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const ms = (t: string) => Date.parse(`${t}T12:00:00Z`);
const gunFarki = (a: string, b: string) => Math.round((ms(a) - ms(b)) / GUN_MS);
const gunEkle = (t: string, n: number) => new Date(ms(t) + n * GUN_MS).toISOString().slice(0, 10);
function ortanca(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sevkiyatVerisiHazirla(ham: unknown): SevkiyatVerisi {
  const v = (ham || {}) as Partial<Record<keyof SevkiyatVerisi, unknown>>;
  const sevkiyatlar = (Array.isArray(v.sevkiyatlar) ? v.sevkiyatlar : []).map((x) => {
    const r = (x || {}) as Record<string, unknown>;
    const etd = gunKismi(r.etd as string);
    const firma = typeof r.firma_id === "string" ? r.firma_id : null;
    if (!etd || !firma) return null;
    return {
      firma_id: firma, etd, konteyner: Math.max(0, Number(r.konteyner) || 0), booking: (r.booking as string) || null,
      varis: (r.varis as string) || null, kaynak: r.kaynak === "dosya" ? "dosya" : "plan", eta: gunKismi(r.eta as string),
      kapali: typeof r.kapali === "boolean" ? r.kapali : null,
    } as RitimSevkiyati;
  }).filter((x): x is RitimSevkiyati => x !== null);
  const tedarik = (Array.isArray(v.tedarik) ? v.tedarik : []).map((x) => x as { firma_id: string; gun: number; n: number })
    .filter((x) => x && typeof x.firma_id === "string" && Number.isFinite(Number(x.gun))).map((x) => ({ firma_id: x.firma_id, gun: Number(x.gun), n: Number(x.n) || 0 }));
  const genel = Number(v.tedarik_genel);
  const eslesmeyen = (Array.isArray(v.eslesmeyen) ? v.eslesmeyen : []).map((x) => x as Record<string, unknown>)
    .map((x) => ({ ad: String(x.ad || "—"), sevkiyat: Number(x.sevkiyat) || 0, konteyner: Number(x.konteyner) || 0, son_etd: gunKismi(x.son_etd as string) }));
  return { sevkiyatlar, tedarik, tedarik_genel: Number.isFinite(genel) && genel > 0 ? genel : null, eslesmeyen };
}

/** ETD'leri DALGA_GUN icinde olan sevkiyatlar tek dalga (ETD sirasiyla; zincirleme: her yeni ETD bir oncekine bakar). */
export function dalgalar(sevk: { etd: string; konteyner: number }[]): Dalga[] {
  const s = [...sevk].sort((a, b) => a.etd.localeCompare(b.etd));
  const out: Dalga[] = [];
  for (const x of s) {
    const son = out[out.length - 1];
    if (son && gunFarki(x.etd, son.son) <= DALGA_GUN) { son.son = x.etd; son.konteyner += x.konteyner; son.booking += 1; }
    else out.push({ bas: x.etd, son: x.etd, konteyner: x.konteyner, booking: 1 });
  }
  return out;
}

/** Liman anahtari (transit olcumu icin): buyuk harf, bosluksuz. */
const limanAnahtari = (v: string | null) => (v || "").toLocaleUpperCase("en-US").replace(/[^A-Z]/g, "") || null;

/** Tum musterilerin sevkiyatlarindan liman basina olculen transit (ETD -> ETA + pay); sevkiyat haritasiyla ayni hesap. */
export function transitHaritasi(sevk: RitimSevkiyati[]): Map<string, number> {
  const dosyalar = sevk.filter((s) => s.eta).map((s) => ({ varis: s.varis, rezervasyonlar: [{ gemi_kalkis_tarihi: s.etd, eta: s.eta, konteyner_adedi: s.konteyner }] }));
  return limanTransitGunleri(dosyalar, (d) => limanAnahtari(d.varis));
}

export function musteriRitmi(
  firmaId: string, veri: SevkiyatVerisi, bugun: string, transit: Map<string, number> = new Map(),
): MusteriRitmi {
  const sevk = veri.sevkiyatlar.filter((s) => s.firma_id === firmaId);
  // Ritim GECMIS mal isteklerinden (bugun dahil); ileri tarihli booking zaten aktif siparis
  const gecmis = sevk.filter((s) => s.etd <= bugun);
  const dl = dalgalar(gecmis);
  const araliklar = dl.slice(1).map((d, i) => gunFarki(d.bas, dl[i].bas));
  const yeterli = dl.length >= EN_AZ_DALGA;
  const ritimGun = yeterli ? Math.round(ortanca(araliklar) as number) : null;
  const t = veri.tedarik.find((x) => x.firma_id === firmaId);
  const tedarikGun = Math.round(t ? t.gun : veri.tedarik_genel ?? VARSAYILAN_TEDARIK);
  const sonEtd = dl.length ? dl[dl.length - 1].bas : null;
  const beklenenEtd = ritimGun !== null && sonEtd ? gunEkle(sonEtd, ritimGun) : null;
  const beklenenSiparis = beklenenEtd ? gunEkle(beklenenEtd, -tedarikGun) : null;
  let durum: RitimDurumu = "veri_az";
  let fark: number | null = null;
  if (beklenenSiparis && ritimGun !== null) {
    fark = gunFarki(bugun, beklenenSiparis);
    const tolerans = Math.max(TOLERANS_ALT, Math.round(ritimGun / 2));
    durum = fark > tolerans ? "gecikti" : fark >= 0 ? "zamani_geldi" : fark >= -YAKLASMA_GUN ? "yaklasiyor" : "erken";
  }
  const yolda: MusteriRitmi["yolda"] = [];
  const yuklemede: MusteriRitmi["yuklemede"] = [];
  for (const s of sevk) {
    const etaYoksa = transit.get(limanAnahtari(s.varis) || "") ?? ETA_YOKSA_GUN;
    const d = sevkiyatDurumu({ kapali: true, konteyner: s.konteyner, rezervasyonlar: [{ gemi_kalkis_tarihi: s.etd, eta: s.eta, konteyner_adedi: s.konteyner }] }, bugun, etaYoksa);
    if (d === "yolda") yolda.push({ etd: s.etd, eta: s.eta, varisTahmini: s.eta || gunEkle(s.etd, etaYoksa), konteyner: s.konteyner, varis: s.varis });
    else if (d === "yuklemede") yuklemede.push({ etd: s.etd, konteyner: s.konteyner, booking: s.booking });
  }
  return {
    dalgalar: dl, ritimGun,
    aralikMin: yeterli ? Math.min(...araliklar) : null, aralikMax: yeterli ? Math.max(...araliklar) : null,
    ortKonteyner: dl.length ? Math.round((dl.reduce((a, d) => a + d.konteyner, 0) / dl.length) * 10) / 10 : null,
    sonEtd, tedarikGun, tedarikKaynak: t ? "musteri" : "genel", beklenenEtd, beklenenSiparis, durum, fark, yolda, yuklemede,
  };
}

/** Siparissiz listede oncelik: gecikti (en cok geciken once) > zamani geldi > yaklasiyor > erken > veri az. */
const SIRA: Record<RitimDurumu, number> = { gecikti: 0, zamani_geldi: 1, yaklasiyor: 2, erken: 3, veri_az: 4 };
export function ritimSiralamasi(a: MusteriRitmi | undefined, b: MusteriRitmi | undefined): number {
  const da = a ? SIRA[a.durum] : 5, db = b ? SIRA[b.durum] : 5;
  if (da !== db) return da - db;
  return (b?.fark ?? -9999) - (a?.fark ?? -9999);
}
