/**
 * Sipariş formundan is emri: okunan bilgi -> musteri karti / is emri on dolumu
 * (21.10.2026). SAF fonksiyonlar (testlenir); okuma `siparis-formu-oku.ts`,
 * veri migration 20261021100000.
 */
import type { IcMusteri } from "./is-emri";
import { telefonNormallestir } from "./is-emri";
import type { SiparisAlici, SiparisFormuOkuma } from "./siparis-formu-oku";
import { katla } from "./siparis-formu-oku";

/** Yuklenen form + (okunabildiyse) okunan bilgi */
export type SiparisEki = { dosya: File; okuma: SiparisFormuOkuma | null };

export type UrunOzelligi = { ad: string; deger: string };
export const AZAMI_OZELLIK = 20;
/** Depo (bucket) siniri ile ayni: 10 MB */
export const AZAMI_FORM_BAYT = 10 * 1024 * 1024;

export const NAKLIYE_ETIKET: Record<"alici" | "satici", string> = { alici: "Alıcıya", satici: "Satıcıya" };

/** Nakliye -> is emrindeki teslim secenegi (TESLIM_SECENEKLERI ile ayni yazim) */
export function nakliyedenTeslim(n: "alici" | "satici" | null): string | null {
  return n === "alici" ? "Fabrika Teslim" : n === "satici" ? "Adrese Teslim" : null;
}

/** <sirket>/siparis/<uuid>.pdf (migration kisitiyla ayni bicim) */
export function siparisFormuYolu(companyId: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${companyId}/siparis/${id}.pdf`;
}

/** "2026-10-14" -> "14.10.2026" */
export function gunAyYil(iso: string | null | undefined): string {
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "-";
}

/** Musteri karti eslesmesi: once vergi no, yoksa unvan (Turkce harf / noktalama farki yok sayilir) */
export function musteriEsle(musteriler: IcMusteri[], a: SiparisAlici): IcMusteri | null {
  if (a.vergiNo) {
    const v = musteriler.find((m) => (m.vergi_no || "") === a.vergiNo);
    if (v) return v;
  }
  if (a.unvan) {
    const k = katla(a.unvan);
    const u = musteriler.filter((m) => katla(m.unvan) === k);
    if (u.length === 1) return u[0];
  }
  return null;
}

export type KartFarki = { alan: "unvan" | "vergi_dairesi" | "vergi_no" | "adres" | "yetkili_ad" | "telefon" | "eposta"; etiket: string; kart: string | null; form: string };

/** Formda DOLU olup kartta farkli olan alanlar (bos form alani karti silmez) */
export function musteriKartiFarklari(kart: IcMusteri, a: SiparisAlici): KartFarki[] {
  const farklar: KartFarki[] = [];
  const ekle = (alan: KartFarki["alan"], etiket: string, kartDeger: string | null, formDeger: string | null, karsilastir = (x: string) => katla(x)) => {
    if (!formDeger) return;
    if (kartDeger && karsilastir(kartDeger) === karsilastir(formDeger)) return;
    farklar.push({ alan, etiket, kart: kartDeger, form: formDeger });
  };
  ekle("unvan", "Ünvan", kart.unvan, a.unvan);
  ekle("vergi_dairesi", "Vergi dairesi", kart.vergi_dairesi, a.vergiDairesi);
  ekle("vergi_no", "Vergi no", kart.vergi_no, a.vergiNo, (x) => x.replace(/\D/g, ""));
  ekle("adres", "Adres", kart.adres, a.adres);
  ekle("yetkili_ad", "Yetkili", kart.yetkili_ad, a.yetkili);
  const tel = a.telefon ? telefonNormallestir(a.telefon) : null;
  if (tel) ekle("telefon", "Telefon", kart.telefon, tel, (x) => x.replace(/\D/g, ""));
  ekle("eposta", "E-posta", kart.eposta, a.eposta, (x) => x.trim().toLowerCase());
  return farklar;
}

/** Is emri formuna yazilacak alanlar (kullanici duzenleyebilir) */
export type IsEmriOnDolum = {
  urun: string | null;
  hedef_kg: number | null;
  birim_fiyat: number | null;
  kdv_dahil: boolean | null;
  vade_gun: number | null;
  nakliye: "alici" | "satici" | null;
  teslim: string | null;
  teslim_suresi_gun: number | null;
  teslim_adresi: string | null;
  siparis_tarihi: string | null;
  urun_ozellikleri: UrunOzelligi[];
};

export function isEmriOnDolum(o: SiparisFormuOkuma): IsEmriOnDolum {
  return {
    urun: o.urun,
    hedef_kg: o.miktar?.kg ?? null,
    birim_fiyat: o.fiyat?.tlKg ?? null,
    kdv_dahil: o.fiyat?.kdvDahil ?? null,
    vade_gun: o.vadeGun,
    nakliye: o.nakliye,
    teslim: nakliyedenTeslim(o.nakliye),
    teslim_suresi_gun: o.teslimSuresiGun,
    // Sevk adresi yazilmissa o; yoksa bos (musteri secilince kart adresi gelir)
    teslim_adresi: o.sevkAdresi,
    siparis_tarihi: o.formTarihi,
    urun_ozellikleri: o.ozellikler.slice(0, AZAMI_OZELLIK).map((x) => ({ ad: x.ad.slice(0, 40), deger: x.deger.slice(0, 60) })),
  };
}

/** Ozellik listesini kayda hazirlar; hata varsa metin doner */
export function ozellikleriHazirla(liste: UrunOzelligi[]): { deger: UrunOzelligi[] | null; hata: string | null } {
  const temiz = liste.map((x) => ({ ad: x.ad.trim().replace(/\s+/g, " "), deger: x.deger.trim().replace(/\s+/g, " ") })).filter((x) => x.ad || x.deger);
  if (temiz.length > AZAMI_OZELLIK) return { deger: null, hata: `En fazla ${AZAMI_OZELLIK} ürün özelliği girilebilir.` };
  for (const x of temiz) {
    if (!x.ad) return { deger: null, hata: `"${x.deger}" değerinin özellik adı boş.` };
    if (!x.deger) return { deger: null, hata: `"${x.ad}" özelliğinin değeri boş.` };
    if (x.ad.length > 40 || x.deger.length > 60) return { deger: null, hata: `"${x.ad}" çok uzun (ad en fazla 40, değer 60 karakter).` };
  }
  return { deger: temiz.length ? temiz : null, hata: null };
}

/** jsonb -> liste (bozuk / eski veride bos liste) */
export function ozellikleriOku(v: unknown): UrunOzelligi[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { ad: unknown; deger: unknown } => !!x && typeof x === "object")
    .map((x) => ({ ad: String(x.ad ?? ""), deger: String(x.deger ?? "") }))
    .filter((x) => x.ad || x.deger);
}
