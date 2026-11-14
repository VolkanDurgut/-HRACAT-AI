import { XS, sayfaAdi, type XlsxHucre, type XlsxSayfa } from "@/supabase/functions/_shared/xlsx-yaz";
import {
  BIRIMLER, KATEGORILER, onayliMiktar, tedarikciGruplari, type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * "Haftalik sablonu indir" (14.11.2026)
 * ----------------------------------------------------------------------------
 * Kullanici: "Bu kabarik oluyor, bunu kendi sablonumuza uyarlatamaz miyiz?"
 * Departmanin son gonderdigi liste, sistemin OKUDUGU duzende Excel'e yazilir:
 *   A1  "<tarih> Alışveriş Listesi"                  (genel baslik: tedarikci sayilmaz)
 *   2   Miktar | Birim | Ürün | Kategori | Tedarikçi | Açıklama
 *   bant "CEM MARKET · 43 kalem" (B sutunu), altinda kalemler; tedarikcisizler "Diğer" bandinda
 * Departman miktarlari duzeltip "Excel'den yükle" ile geri yukler (lib/satin-alma/excel.ts ayni
 * dosyayi kayipsiz okur; tests/satin-alma-excel.test.ts gidis-donus testi).
 * Reddedilen kalemler YAZILMAZ; degistirilerek onaylanan kalemde onaylanan miktar yazilir.
 */
export function haftalikSablonSayfasi(liste: Pick<SaListe, "departman" | "kalemler">, tarih: string): XlsxSayfa {
  const kalemler = liste.kalemler.filter((k) => k.karar !== "reddedildi");
  const satirlar: (XlsxHucre | null)[][] = [
    [{ v: `${tarih} Alışveriş Listesi`, s: XS.sayfaBasligi }],
    ["Miktar", "Birim", "Ürün", "Kategori", "Tedarikçi", "Açıklama"].map((v) => ({ v, s: XS.tabloBaslik })),
  ];
  for (const g of tedarikciGruplari(kalemler)) {
    // "Diğer" genel baslik sayilir (tedarikci yazilmaz); diger bantlar tedarikci adidir
    satirlar.push([null, { v: `${g.tedarikci ?? "Diğer"}  ·  ${g.kalemler.length} kalem`, s: XS.toplamMetin }]);
    for (const k of g.kalemler) satirlar.push(kalemSatiri(k));
  }
  return {
    ad: sayfaAdi(liste.departman || "Alışveriş Listesi"),
    sutunGenislik: [9, 9, 38, 20, 20, 36],
    satirlar,
    birlestir: ["A1:F1"],
    dondur: "A3",
  };
}

function kalemSatiri(k: SaKalem): (XlsxHucre | null)[] {
  const m = Number(k.karar === "onaylandi" ? onayliMiktar(k) : k.miktar);
  return [
    { v: m, s: Number.isInteger(m) ? XS.tamSayi : XS.ondalik },
    { v: BIRIMLER[k.birim] ?? k.birim, s: XS.metin },
    { v: k.urun, s: XS.metin },
    { v: KATEGORILER[k.kategori] ?? k.kategori, s: XS.metin },
    { v: k.tedarikci || "", s: XS.metin },
    { v: k.aciklama || "", s: XS.metin },
  ];
}

/** Sayfayi okuyucunun izgarasina cevirir (test + onizleme icin). */
export const sayfaIzgarasi = (s: XlsxSayfa): unknown[][] => s.satirlar.map((r) => r.map((h) => (h ? h.v ?? null : null)));
