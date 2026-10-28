/**
 * lib/urun-tanimi.ts
 *
 * "Ayni urunden iki satir oldugunda tek urun olarak gecsin" (28.10.2026, Quality
 * Certificate). Proformada ayni urun farkli fiyat / miktar satirlariyla gelebilir
 * (IHR-2026-0102: "LA FARINE BOULANGERIE EXTRA" x2, 0103: "SOFT WHEAT FLOUR" x3).
 * dosya.urun_tanimi yeni dosyada urun satirlarinin ", " ile birlesimi olarak
 * olusur (app/yeni-dosya: description || urun_adi) -> ayni ad tekrar eder.
 *
 * Kural (veriyi DEGISTIRMEZ, yalniz belgede gosterim):
 *  1) urun_tanimi hala OTOMATIK birlesimle ayniysa: satir adlari tekillestirilir
 *     (buyuk/kucuk harf, bosluk, ' / ’ farki yok sayilir; ilk yazim ve sira korunur).
 *  2) Kullanici urun_tanimi'ni ELLE degistirdiyse metne dokunulmaz; tek istisna:
 *     metin tamamen ayni parcalarin tekrari ise ("X, X") tek parcaya iner.
 *     (Elle yazilmis metni virgulden bolup parca silmek anlami bozabilir:
 *     "FLOUR, TYPE 550, FLOUR, TYPE 650".)
 */

type UrunSatiri = { description?: unknown; urun_adi?: unknown };

const anahtar = (s: string) => s.replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim().toUpperCase();

/** Parantez disindaki virgullerden boler ("A (x, y), B" -> ["A (x, y)", "B"]). */
function ustDuzeyParcala(metin: string): string[] {
  const parcalar: string[] = [];
  let derinlik = 0;
  let bas = 0;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (c === "(") derinlik++;
    else if (c === ")") derinlik = Math.max(0, derinlik - 1);
    else if (c === "," && derinlik === 0) {
      parcalar.push(metin.slice(bas, i).trim());
      bas = i + 1;
    }
  }
  parcalar.push(metin.slice(bas).trim());
  return parcalar.filter(Boolean);
}

function tekillestir(adlar: string[]): string[] {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const ad of adlar) {
    const k = anahtar(ad);
    if (!k || gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push(ad.trim());
  }
  return sonuc;
}

/** Belgede gosterilecek urun tanimi (ayni urun tek sefer). Bos ise null. */
export function urunTanimiTekil(urunTanimi: string | null | undefined, hamVeri: unknown): string | null {
  const metin = (urunTanimi ?? "").trim();
  if (!metin) return null;
  const detay = (hamVeri as { urun_detaylari?: unknown } | null | undefined)?.urun_detaylari;
  if (Array.isArray(detay) && detay.length > 1) {
    // yeni-dosya ile AYNI birlesim (description || urun_adi, ", ")
    const ham = (detay as UrunSatiri[]).map((u) => String((u?.description || u?.urun_adi) ?? ""));
    const otomatik = ham.join(", ");
    if (ham.every((a) => a.trim()) && (otomatik === urunTanimi || otomatik.trim() === metin)) return tekillestir(ham).join(", ");
  }
  const parcalar = ustDuzeyParcala(metin);
  if (parcalar.length > 1 && tekillestir(parcalar).length === 1) return parcalar[0];
  return metin;
}
