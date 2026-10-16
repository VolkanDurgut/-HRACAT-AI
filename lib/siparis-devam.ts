/**
 * "SIPARISE DEVAM ET" - SEVKIYAT SECIMI (16.10.2026, kullanici istegi).
 *
 * Eskiden dugme, siparisin HENUZ DOSYALANMAMIS tum kalemleriyle hemen dosya
 * aciyor ve detayli ambalaji ilk dosyadan AYNEN kopyaliyordu (0095 / 0077'de
 * "20.000 / 4.000 PIECES" gibi yanlis cuval sayilari bundan cikti). Artik:
 *   1) Kullanici her kalem icin sec / FCL girer (varsayilan: eskisi gibi
 *      dosyalanmamis miktarin tamami).
 *   2) Detayli ambalaj ve marka secimden ONERILIR (ilk dosyanin metni sablon
 *      olarak kullanilir, sayi ve gerekirse marka degisir); kullanici duzeltebilir.
 *   3) Dosyalanmamis miktari asan secim uyari + onay ister.
 * Ayrica: detayli ambalajdaki kap toplami ile konteynerlerin kap toplami
 * tutmazsa uyari (kapUyumsuzlugu).
 *
 * Saf fonksiyonlar - veritabanina / React'e erismez (tsx ile test edilir).
 */
import { MTS_PER_KONTEYNER } from "@/lib/supabase/constants";
import { cuvalAdedi, type SiparisKalemDurumu } from "@/lib/siparis-takip";

const ESIK = 0.01;

/** "ALL PURPOSE WHEAT FLOUR(ASLI BRAND)" -> "ASLI"; parantezli marka yoksa null. */
export function parantezMarka(urunAdi: string): string | null {
  const m = urunAdi.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const ic = m[1].replace(/\bBRAND\b/i, "").trim();
  return ic ? ic.toLocaleUpperCase("en-US") : null;
}

/** MTS -> FCL (2 ondalik). */
export function mtsdenFcl(mts: number): number {
  return Math.round((mts / MTS_PER_KONTEYNER) * 100) / 100;
}

export type DevamSecimi = {
  kalem: SiparisKalemDurumu;
  secili: boolean;
  /** Kullanicinin girdigi FCL (ondalikli olabilir). */
  fcl: number;
};

/** Pencerenin acilis durumu: dosyalanmamis miktari olan kalemler secili, FCL = o miktar. */
export function varsayilanSecimler(kalemler: SiparisKalemDurumu[]): DevamSecimi[] {
  return kalemler.map((k) => ({ kalem: k, secili: k.acikMts > ESIK, fcl: k.acikMts > ESIK ? mtsdenFcl(k.acikMts) : 0 }));
}

/**
 * Secimin MTS karsiligi. FCL, dosyalanmamis miktarin FCL'sine esitse KESIN
 * miktar kullanilir (orn. 252,45 MTS = 10,1 FCL; 10,1 x 25 = 252,5 olurdu).
 */
export function secimMts(s: DevamSecimi): number {
  if (!s.secili || !(s.fcl > 0)) return 0;
  if (s.kalem.acikMts > ESIK && Math.abs(s.fcl - mtsdenFcl(s.kalem.acikMts)) < 0.005) return s.kalem.acikMts;
  return Math.round(s.fcl * MTS_PER_KONTEYNER * 100) / 100;
}

/** Secim dosyalanmamis miktari asiyor mu (asan MTS; asmiyorsa 0). */
export function secimAsimi(s: DevamSecimi): number {
  const fark = secimMts(s) - s.kalem.acikMts;
  return fark > ESIK ? fark : 0;
}

/** Yeni dosyanin urun_detaylari (acikKalemler ile AYNI bicim). */
export function secimdenKalemler(secimler: DevamSecimi[]) {
  return secimler
    .map((s) => ({ s, mts: secimMts(s) }))
    .filter((x) => x.mts > ESIK)
    .map(({ s, mts }) => ({
      urun_adi: s.kalem.urunAdi,
      ambalaj_boyutu: s.kalem.ambalajBoyutu,
      miktar_mts: mts.toFixed(2),
      birim_fiyat_usd: String(s.kalem.birimFiyat),
      toplam_tutar_usd: (mts * s.kalem.birimFiyat).toFixed(2),
    }));
}

/**
 * Dosyanin "marka" alani onerisi: secilen tum kalemlerin parantezli markasi
 * biliniyorsa "SAAD BRAND" / "ASLI BRAND & SAAD BRAND"; degilse (tek kalemli,
 * markasiz urun adi) ilk dosyanin markasi aynen.
 */
export function markaOner(secimler: DevamSecimi[], ornekMarka: string | null | undefined): string {
  const secili = secimler.filter((s) => secimMts(s) > ESIK);
  const markalar = secili.map((s) => parantezMarka(s.kalem.urunAdi));
  if (secili.length === 0 || markalar.some((m) => !m)) return (ornekMarka || "").trim();
  const tekil = Array.from(new Set(markalar as string[]));
  return tekil.map((m) => `${m} BRAND`).join(" & ");
}

// ---------------------------------------------------------------- detayli ambalaj
const SEGMENT_AYRAC = /\s*(?:,|\/\/|;|\n)\s*(?=\d)/;
const SAYI_BASI = /^\s*[\d.,]+\s*/;

/** Metni kap segmentlerine ayirir ("2.000 PIECES ..., 1.000 PIECES ..."). */
export function ambalajSegmentleri(metin: string | null | undefined): string[] {
  return String(metin || "")
    .split(SEGMENT_AYRAC)
    .map((s) => s.trim())
    .filter((s) => /^\d/.test(s));
}

function kelimeIceriyor(metin: string, kelime: string): boolean {
  const kacis = kelime.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${kacis}([^A-Z0-9]|$)`, "i").test(metin);
}

function kgDegistir(govde: string, kg: number | null): { govde: string; degisti: boolean } {
  if (!kg) return { govde, degisti: false };
  const m = govde.match(/(\d+(?:[.,]\d+)?)\s*KG/i);
  if (!m) return { govde, degisti: false };
  const mevcut = parseFloat(m[1].replace(",", "."));
  if (Math.abs(mevcut - kg) < 0.001) return { govde, degisti: false };
  return { govde: govde.replace(m[0], `${kg} KG`), degisti: true };
}

export type AmbalajOnerisi = {
  metin: string;
  /** Kullanicinin kontrol etmesi gereken noktalar (sablonda marka yok vb.). */
  notlar: string[];
};

/**
 * Secimden "Detayli Ambalaj" onerisi. Sablon = ilk dosyanin metni.
 * Her secili kalem icin govde (sayi haric metin):
 *   1) sablonda kalemin markasini iceren segment -> aynen (kesin)
 *   2) sablonun ilk segmenti; icinde siparisin BASKA bir markasi geciyorsa o
 *      marka bu kalemin markasiyla degistirilir; markali kalemde marka yoksa
 *      " (MARKA BRAND)" eklenir (not dusulur)
 *   3) sablon yoksa "PIECES OF 25 KG BAGS (MARKA BRAND)" (not dusulur)
 * Ayni govdeli kalemler toplanir; segmentler ", " ile birlesir.
 * Cuval adedi hesaplanamayan (ambalaj kg'i okunamayan) kalem varsa sablon
 * aynen birakilir ve not dusulur.
 */
export function detayliAmbalajOner(secimler: DevamSecimi[], sablon: string | null | undefined, tumKalemler: SiparisKalemDurumu[]): AmbalajOnerisi {
  const secili = secimler.filter((s) => secimMts(s) > ESIK);
  const notlar: string[] = [];
  if (secili.length === 0) return { metin: "", notlar };
  if (secili.some((s) => !s.kalem.ambalajKg)) {
    return { metin: String(sablon || "").trim(), notlar: ["Ambalaj ağırlığı okunamadığı için çuval adedi hesaplanamadı; metni elle düzenleyin."] };
  }
  const segmentler = ambalajSegmentleri(sablon);
  const tumMarkalar = Array.from(new Set(tumKalemler.map((k) => parantezMarka(k.urunAdi)).filter((m): m is string => !!m)));
  const parcalar: { govde: string; adet: number }[] = [];

  for (const s of secili) {
    const marka = parantezMarka(s.kalem.urunAdi);
    const kg = s.kalem.ambalajKg;
    const adet = cuvalAdedi(secimMts(s), kg) || 0;
    let govde: string;
    const eslesen = marka ? segmentler.find((seg) => kelimeIceriyor(seg, marka)) : undefined;
    if (eslesen) {
      govde = eslesen.replace(SAYI_BASI, "");
    } else if (segmentler.length > 0) {
      govde = segmentler[0].replace(SAYI_BASI, "");
      if (marka) {
        const baska = tumMarkalar.find((m) => m !== marka && kelimeIceriyor(govde, m));
        if (baska) {
          govde = govde.replace(new RegExp(baska.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), marka);
        } else {
          govde = `${govde} (${marka} BRAND)`;
        }
        notlar.push(`${marka} için çuval tanımı önceki dosyadan türetildi; çuval tipini kontrol edin.`);
      }
    } else {
      govde = `PIECES OF ${kg} KG BAGS${marka ? ` (${marka} BRAND)` : ""}`;
      notlar.push("Önceki dosyada detaylı ambalaj yok; çuval tipini (PP / KRAFT) ekleyin.");
    }
    const kgSonuc = kgDegistir(govde, kg);
    if (kgSonuc.degisti) notlar.push(`${marka || s.kalem.urunAdi} için ambalaj ağırlığı ${kg} KG olarak düzeltildi.`);
    govde = kgSonuc.govde.trim();
    const mevcut = parcalar.find((p) => p.govde.toLocaleUpperCase("en-US") === govde.toLocaleUpperCase("en-US"));
    if (mevcut) mevcut.adet += adet;
    else parcalar.push({ govde, adet });
  }

  const metin = parcalar.map((p) => `${p.adet.toLocaleString("tr-TR")} ${p.govde}`).join(", ");
  return { metin, notlar: Array.from(new Set(notlar)) };
}

// ---------------------------------------------------------------- kap kontrolu
/** Detayli ambalajdaki kap toplami ("10.000 PIECES ..., 2.000 PIECES ..." -> 12000); bulunamazsa null. */
export function detayliAmbalajKapToplami(metin: string | null | undefined): number | null {
  const eslesmeler = Array.from(String(metin || "").matchAll(/(\d[\d.,]*)\s*(?:PIECES|PCS|BAGS?|ADET)\b/gi));
  if (eslesmeler.length === 0) return null;
  let toplam = 0;
  for (const m of eslesmeler) {
    const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
    if (!Number.isFinite(n)) return null;
    toplam += n;
  }
  return toplam;
}

export type KapUyumsuzlugu = { metinToplami: number; konteynerToplami: number };

/**
 * Detayli ambalajdaki kap toplami konteynerlerin "Kap Adeti" toplamiyla tutmuyor mu?
 * Yanlis alarm vermemek icin SADECE: tum konteynerler eklenmis (rezervasyon
 * adedi kadar) ve hepsinin kap adedi girilmisse kontrol edilir.
 */
export function kapUyumsuzlugu(
  detayliAmbalaj: string | null | undefined,
  konteynerler: { pieces?: number | null }[],
  rezervasyonKonteynerAdedi: number
): KapUyumsuzlugu | null {
  const metinToplami = detayliAmbalajKapToplami(detayliAmbalaj);
  if (metinToplami === null || konteynerler.length === 0) return null;
  if (rezervasyonKonteynerAdedi > 0 && konteynerler.length < rezervasyonKonteynerAdedi) return null;
  if (konteynerler.some((k) => !k.pieces || k.pieces <= 0)) return null;
  const konteynerToplami = konteynerler.reduce((t, k) => t + (k.pieces || 0), 0);
  return metinToplami === konteynerToplami ? null : { metinToplami, konteynerToplami };
}
