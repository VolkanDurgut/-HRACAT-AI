/**
 * Siparis (ana_siparisler) takibi - MARKA / KALEM BAZLI (07.10.2026).
 *
 * Eskiden takip sadece TOPLAM tonaj uzerindendi: UNEXCCS270826 (5 FCL ASLI +
 * 10 FCL SAAD) IHR-2026-0088'deki 10 FCL ASLI tamamen bu siparise sayildigi
 * icin "bitti" gorunup listeden dusuyordu - oysa 5 FCL SAAD hic gitmemisti.
 * Artik her siparis kalemi (urun adi, genelde markayi icerir: "... (SAAD
 * BRAND)") ayri ayri izlenir; bir kalemdeki fazla, digerinin eksigini
 * KAPATMAZ.
 *
 * Bir dosya kalemi hangi siparise sayilir?
 *   - kalem.siparis_id === "yok"  -> hicbir siparise sayilmaz
 *   - kalem.siparis_id dolu       -> o siparise (bir dosya iki proformadan
 *                                    olusabilir: 0092 = 5 SAAD 270826 + 5 SAAD 160926)
 *   - bos                         -> dosyanin ana_siparis_id'si (eski davranis)
 * Dosya kalemi siparis kalemiyle URUN ADIYLA eslestirilir (bosluk/buyuk-kucuk
 * harf farki yok sayilir); sipariste tek kalem varsa ad farki onemsizdir.
 *
 * "Sevk edildi" kurali ESKISIYLE AYNI: kapali dosya = tamami, acik dosya =
 * DBA'si yuklenmis konteyner orani.
 *
 * Saf fonksiyonlar - veritabanina erismez (test edilebilir).
 */
import { kalemMiktari, sayiOku } from "@/lib/sayi-oku";
import { MTS_PER_KONTEYNER } from "@/lib/supabase/constants";

export const SIPARISE_SAYILMAZ = "yok";

type HamKalem = Record<string, unknown> & { siparis_id?: string | null; miktar_mts?: unknown; quantity?: unknown };

export type TakipSiparisi = {
  id: string;
  proforma_no?: string | null;
  urun_tanimi?: string | null;
  toplam_mts: number | null;
  urun_detaylari_master: unknown;
};

export type TakipDosyasi = {
  id: string;
  ana_siparis_id: string | null;
  durum: string | null;
  urun_detaylari: unknown;
};

export type TakipKonteyneri = { dosya_id: string; dba_dosya_url: string | null };

export type SiparisKalemDurumu = {
  urunAdi: string;
  marka: string;
  ambalajKg: number | null;
  birimFiyat: number;
  ambalajBoyutu: string;
  siparisMts: number;
  /** Dosyalara dagitilmis (acik + kapali) toplam - "Siparise Devam Et" bunu duser. */
  dosyalananMts: number;
  /** Fiilen sevk edilen (kapali dosya / DBA'li konteyner orani). */
  sevkMts: number;
  /** Siparisten FAZLA dosyalanan miktar (baska proformaya ait olabilir). */
  fazlaMts: number;
  /** Henuz sevk edilmemis (siparis - sevk, alt sinir 0). */
  kalanMts: number;
  /** Henuz hicbir dosyada olmayan (siparis - dosyalanan, alt sinir 0). */
  acikMts: number;
};

export type SiparisIlerlemesi = {
  kalemler: SiparisKalemDurumu[];
  /** Hicbir siparis kalemiyle eslesmeyen dosya kalemleri (uyari). */
  eslesmeyenler: { urunAdi: string; mts: number }[];
  toplamSiparisMts: number;
  toplamSevkMts: number;
  toplamKalanMts: number;
  dosyaSayisi: number;
  /** En az bir kalemde sevk edilmemis miktar var mi. */
  devamEdiyor: boolean;
};

const ESIK = 0.01;

export function adNormal(ad: unknown): string {
  return String(ad ?? "").toLocaleUpperCase("en-US").replace(/\s+/g, " ").replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ")").trim();
}

function kalemAdi(u: HamKalem): string {
  return String(u.urun_adi || u.description || "").trim();
}

function kalemAmbalaj(u: HamKalem): string {
  return String(u.ambalaj_boyutu || u.packaging_size || "").trim();
}

function kalemFiyat(u: HamKalem): number {
  return sayiOku(u.birim_fiyat_usd ?? u.unit_price ?? 0);
}

/** "PREMIUM QUALITY WHEAT FLOUR (SAAD BRAND)" -> "SAAD"; parantez yoksa urun adi. */
export function markaAyikla(urunAdi: string): string {
  const parantez = urunAdi.match(/\(([^)]+)\)\s*$/);
  if (parantez) {
    const ic = parantez[1].replace(/\bBRAND\b/i, "").trim();
    if (ic) return ic.toLocaleUpperCase("en-US");
  }
  return urunAdi.trim() || "—";
}

/** "25 KG" -> 25; okunamazsa null. */
export function ambalajKg(ambalaj: string): number | null {
  const m = ambalaj.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*KG/i);
  const n = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** MTS -> cuval adedi (ambalaj kg biliniyorsa). */
export function cuvalAdedi(mts: number, kg: number | null): number | null {
  if (!kg) return null;
  return Math.round((mts * 1000) / kg);
}

/** MTS -> 20' konteyner (25 MTS/FCL, sistemdeki standart). */
export function fclAdedi(mts: number): number {
  return Math.round((mts / MTS_PER_KONTEYNER) * 100) / 100;
}

/** Bir dosya kaleminin sayildigi siparis id'si (yoksa null). */
export function kalemSiparisi(kalem: HamKalem, dosyaSiparisId: string | null): string | null {
  const etiket = kalem.siparis_id;
  if (etiket === SIPARISE_SAYILMAZ) return null;
  if (etiket) return etiket;
  return dosyaSiparisId;
}

function sevkOrani(dosya: TakipDosyasi, konteynerler: TakipKonteyneri[]): number {
  const kapali = dosya.durum === "Kapalı" || dosya.durum === "Kapali";
  if (kapali) return 1;
  const kendi = konteynerler.filter((k) => k.dosya_id === dosya.id);
  if (kendi.length === 0) return 0;
  return kendi.filter((k) => !!k.dba_dosya_url).length / kendi.length;
}

/** Siparisin kalemleri; tek kalemli sipariste "Toplam Taahhut" (toplam_mts) esas alinir. */
function siparisKalemleri(siparis: TakipSiparisi): { ad: string; ambalaj: string; fiyat: number; mts: number }[] {
  const master = ((siparis.urun_detaylari_master as HamKalem[]) || []).filter((u) => kalemAdi(u) || kalemMiktari(u));
  const toplam = siparis.toplam_mts || 0;
  if (master.length === 0) {
    return toplam > 0 ? [{ ad: String(siparis.urun_tanimi || "Ürün"), ambalaj: "", fiyat: 0, mts: toplam }] : [];
  }
  if (master.length === 1) {
    const u = master[0];
    return [{ ad: kalemAdi(u) || String(siparis.urun_tanimi || "Ürün"), ambalaj: kalemAmbalaj(u), fiyat: kalemFiyat(u), mts: toplam > 0 ? toplam : kalemMiktari(u) }];
  }
  return master.map((u) => ({ ad: kalemAdi(u), ambalaj: kalemAmbalaj(u), fiyat: kalemFiyat(u), mts: kalemMiktari(u) }));
}

export function siparisIlerlemesiHesapla(
  siparis: TakipSiparisi,
  dosyalar: TakipDosyasi[],
  konteynerler: TakipKonteyneri[]
): SiparisIlerlemesi {
  const satirlar = siparisKalemleri(siparis);
  const dosyalanan = satirlar.map(() => 0);
  const sevk = satirlar.map(() => 0);
  const eslesmeyen = new Map<string, number>();
  const katkiVerenDosyalar = new Set<string>();

  for (const d of dosyalar) {
    const oran = sevkOrani(d, konteynerler);
    const kalemler = (d.urun_detaylari as HamKalem[]) || [];
    if (kalemler.length === 0 && d.ana_siparis_id === siparis.id) katkiVerenDosyalar.add(d.id);
    for (const k of kalemler) {
      if (kalemSiparisi(k, d.ana_siparis_id) !== siparis.id) continue;
      const mts = kalemMiktari(k);
      katkiVerenDosyalar.add(d.id);
      if (mts <= 0) continue;
      let i = satirlar.findIndex((s) => adNormal(s.ad) === adNormal(kalemAdi(k)));
      if (i < 0 && satirlar.length === 1) i = 0;
      if (i < 0) {
        const ad = kalemAdi(k) || "(adsız kalem)";
        eslesmeyen.set(ad, (eslesmeyen.get(ad) || 0) + mts);
        continue;
      }
      dosyalanan[i] += mts;
      sevk[i] += mts * oran;
    }
  }

  const kalemler: SiparisKalemDurumu[] = satirlar.map((s, i) => {
    const kg = ambalajKg(s.ambalaj);
    return {
      urunAdi: s.ad,
      marka: markaAyikla(s.ad),
      ambalajKg: kg,
      birimFiyat: s.fiyat,
      ambalajBoyutu: s.ambalaj,
      siparisMts: s.mts,
      dosyalananMts: dosyalanan[i],
      sevkMts: Math.min(sevk[i], s.mts),
      fazlaMts: Math.max(0, dosyalanan[i] - s.mts),
      kalanMts: Math.max(0, s.mts - sevk[i]),
      acikMts: Math.max(0, s.mts - dosyalanan[i]),
    };
  });

  const toplamSiparisMts = kalemler.reduce((t, k) => t + k.siparisMts, 0);
  const toplamSevkMts = kalemler.reduce((t, k) => t + k.sevkMts, 0);
  const toplamKalanMts = kalemler.reduce((t, k) => t + k.kalanMts, 0);
  return {
    kalemler,
    eslesmeyenler: Array.from(eslesmeyen, ([urunAdi, mts]) => ({ urunAdi, mts })),
    toplamSiparisMts,
    toplamSevkMts,
    toplamKalanMts,
    dosyaSayisi: katkiVerenDosyalar.size,
    devamEdiyor: kalemler.some((k) => k.kalanMts > ESIK),
  };
}

/** "Siparise Devam Et" icin yeni dosyanin kalemleri: henuz hicbir dosyada olmayan miktarlar. */
export function acikKalemler(ilerleme: SiparisIlerlemesi) {
  return ilerleme.kalemler
    .filter((k) => k.acikMts > ESIK)
    .map((k) => ({
      urun_adi: k.urunAdi,
      ambalaj_boyutu: k.ambalajBoyutu,
      miktar_mts: k.acikMts.toFixed(2),
      birim_fiyat_usd: String(k.birimFiyat),
      toplam_tutar_usd: (k.acikMts * k.birimFiyat).toFixed(2),
    }));
}

/**
 * Rezervasyon kaydedilince dosya kalemleri siparise gore ORANSAL yeniden
 * yazilabilir mi? Sadece kalemler hala "otomatik" haldeyse: bos, ya da
 * siparisin TUM kalemleri ayni fiyatla ve ayni oranda (orn. 10 FCL'lik parti
 * = her kalemin 1/3'u). Kullanici kalem silmis/eklemis, markaya ozel parti
 * yapmis (0083: sadece SAAD) veya kalemi bir siparise etiketlemisse DOKUNULMAZ
 * (eskiden her rezervasyon kaydinda bu duzeltmeler sessizce siliniyordu).
 */
export function oransalYenidenYazilabilirMi(dosyaKalemleri: unknown, master: unknown): boolean {
  const kalemler = (dosyaKalemleri as HamKalem[]) || [];
  const ana = (master as HamKalem[]) || [];
  if (kalemler.length === 0) return true;
  if (ana.length === 0 || kalemler.length !== ana.length) return false;
  if (kalemler.some((k) => !!k.siparis_id)) return false;
  const oranlar: number[] = [];
  const kullanilan = new Set<number>();
  for (const k of kalemler) {
    const i = ana.findIndex((m, idx) => !kullanilan.has(idx) && adNormal(kalemAdi(m)) === adNormal(kalemAdi(k)));
    if (i < 0) return false;
    kullanilan.add(i);
    if (Math.abs(kalemFiyat(ana[i]) - kalemFiyat(k)) > 0.001) return false;
    const masterMts = kalemMiktari(ana[i]);
    if (masterMts <= 0) return false;
    oranlar.push(kalemMiktari(k) / masterMts);
  }
  const enAz = Math.min(...oranlar);
  const enCok = Math.max(...oranlar);
  return enCok - enAz <= Math.max(0.005, enCok * 0.005);
}
