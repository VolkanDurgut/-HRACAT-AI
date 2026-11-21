/**
 * SIPARIS LISTESI - KALAN ODEME (21.11.2026). Saf hesap (veri / ag yok); sayfa ve Excel indir ayni kurali kullanir.
 * Test: tests/siparis-kalan-odeme.test.ts.
 *
 * Kullanici: "Siparis listesinde kalan odemeler belirtilmeli. Ayni sekilde siparis listesi excelinde de."
 *
 * Kural (satir bazinda; on odeme PROFORMA bazinda tutulur ve her satira ayni tutar olarak gelir):
 *  - Proforma toplami = ayni proformanin (revize eki "R" yok sayilir) iptal disi satirlarinin tutar toplami.
 *  - Satirin on odeme payi = on odeme x satir tutari / proforma toplami (ayni para biriminde; farkliysa hesaplanmaz).
 *  - Kalan = satir tutari - on odeme payi.
 *  - Bakiye alindi -> kalan 0: Excel "Bakiye" sutunu DOGRU ya da sistem dosyasinin konsimento durumu "odeme alindi"
 *    (Telex / Seawaybill / Vesaik; tum rezervasyonlarinda).
 *  - Onay bekleyen: henuz odeme yok, kalan = tutar ("tamami").
 *  - On odemesi alindi ama tutari girilmemis: Excel'e yazilmis kalan tutar varsa o, yoksa "bilinmiyor".
 */
import type { SiparisSatiri } from "./siparis-liste.ts";

export type BakiyeBilgisi = {
  /** siparis_defteri satiri ("excel:<id>") -> Excel "Bakiye" sutunu */
  defter: Map<string, { odendi: boolean | null; tutar: number | null }>;
  /** dosya no -> sistemde odeme alindi mi (konsimento) */
  dosyaOdendi: Map<string, boolean>;
};

export type KalanDurumu = "odendi" | "bekliyor" | "tamami" | "bilinmiyor";
export type KalanOdeme = {
  /** Satira dusen on odeme (bilinmiyorsa null) */
  onOdemePayi: number | null;
  /** Kalan tutar (satirin para biriminde; bilinmiyorsa null) */
  kalan: number | null;
  para: string;
  durum: KalanDurumu;
  /** Kisa aciklama (ipucu / Excel) */
  not: string | null;
};

const yuvarla = (n: number) => Math.round(n * 100) / 100;
export const proformaGrubu = (no: string | null | undefined) => (no || "").replace(/\s/g, "").toUpperCase().replace(/(\d)R\d?$/, "$1");

type Satir = Pick<SiparisSatiri, "anahtar" | "proforma_no" | "durum" | "tutar" | "para_birimi" | "on_odeme" | "on_odeme_tutar" | "on_odeme_para" | "dosya_no">;

export function kalanOdemeleri(liste: Satir[], bakiye: BakiyeBilgisi = { defter: new Map(), dosyaOdendi: new Map() }): Map<string, KalanOdeme> {
  const toplam = new Map<string, number>();
  const onOdeme = new Map<string, { tutar: number; para: string | null }>();
  for (const s of liste) {
    if (s.durum === "iptal") continue;
    const g = proformaGrubu(s.proforma_no);
    if (!g) continue;
    toplam.set(g, (toplam.get(g) || 0) + (s.tutar || 0));
    if (s.on_odeme && s.on_odeme_tutar !== null && s.on_odeme_tutar > 0 && !onOdeme.has(g)) onOdeme.set(g, { tutar: s.on_odeme_tutar, para: s.on_odeme_para });
  }
  const sonuc = new Map<string, KalanOdeme>();
  for (const s of liste) {
    if (s.durum === "iptal") continue;
    const para = s.para_birimi || "USD";
    const defter = bakiye.defter.get(s.anahtar);
    const ekle = (k: Omit<KalanOdeme, "para">) => sonuc.set(s.anahtar, { ...k, para });
    if (s.tutar === null) { ekle({ onOdemePayi: null, kalan: null, durum: "bilinmiyor", not: "Satır tutarı yok" }); continue; }
    const odendi = defter?.odendi === true || (!!s.dosya_no && bakiye.dosyaOdendi.get(s.dosya_no) === true);
    if (odendi) { ekle({ onOdemePayi: null, kalan: 0, durum: "odendi", not: defter?.odendi === true ? "Bakiye alındı (Excel)" : "Bakiye alındı (konşimento)" }); continue; }
    if (s.durum === "onay_bekliyor") { ekle({ onOdemePayi: 0, kalan: yuvarla(s.tutar), durum: "tamami", not: "Ön ödeme / onay bekleniyor" }); continue; }
    const g = proformaGrubu(s.proforma_no);
    const oo = onOdeme.get(g);
    const t = toplam.get(g) || 0;
    if (s.on_odeme && oo && (!oo.para || oo.para === para) && t > 0) {
      const pay = yuvarla(Math.min(oo.tutar, (oo.tutar * s.tutar) / t));
      ekle({ onOdemePayi: pay, kalan: yuvarla(Math.max(0, s.tutar - pay)), durum: "bekliyor", not: null });
      continue;
    }
    if (defter?.tutar !== null && defter?.tutar !== undefined) {
      ekle({ onOdemePayi: yuvarla(Math.max(0, s.tutar - defter.tutar)), kalan: yuvarla(defter.tutar), durum: "bekliyor", not: "Excel bakiyesi" });
      continue;
    }
    if (s.on_odeme && oo && oo.para && oo.para !== para) {
      ekle({ onOdemePayi: null, kalan: null, durum: "bilinmiyor", not: `Ön ödeme ${oo.para}, sipariş ${para}` });
      continue;
    }
    if (s.on_odeme) { ekle({ onOdemePayi: null, kalan: null, durum: "bilinmiyor", not: "Ön ödeme tutarı girilmemiş" }); continue; }
    ekle({ onOdemePayi: 0, kalan: yuvarla(s.tutar), durum: "bekliyor", not: null });
  }
  return sonuc;
}

/** Para birimine gore kalan toplami (bilinmeyenler sayilmaz; adet ayrica). */
export function kalanToplami(satirlar: Pick<SiparisSatiri, "anahtar">[], kalanlar: Map<string, KalanOdeme>): { toplam: Record<string, number>; bilinmeyen: number } {
  const toplam: Record<string, number> = {};
  let bilinmeyen = 0;
  for (const s of satirlar) {
    const k = kalanlar.get(s.anahtar);
    if (!k) continue;
    if (k.kalan === null) { bilinmeyen++; continue; }
    if (k.kalan > 0) toplam[k.para] = yuvarla((toplam[k.para] || 0) + k.kalan);
  }
  return { toplam, bilinmeyen };
}
