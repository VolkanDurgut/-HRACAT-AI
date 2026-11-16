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

// ---------------------------------------------------------------------------
// MARKA UYUMU (16.11.2026)
// ---------------------------------------------------------------------------
// Kullanici (IHR-2026-0113): "Cuval / marka bilgisi LAILA; fakat packing ve invoice gibi belgelerde
// 'PREMIUM QUALITY WHEAT FLOUR (BLACKSTALLION BRAND)' ve '... PP BAGS (BLACKSTALLION BRAND' yaziyor."
// Neden: urun aciklamasi proformadan gelir ve markayi parantez icinde tasir; sevkiyatta marka degisince
// (konteynerlere / dosyaya LAILA girildi) aciklamadaki eski marka belgelere aynen basiliyordu.
// Kural (veriyi DEGISTIRMEZ, yalniz belgede gosterim): dosyanin GERCEK markasi tek ise (konteyner markalari,
// yoksa dosya.marka) ve metinde TEK bir "(X BRAND)" parantezi varsa ve X bu marka degilse -> "(GERCEK BRAND)".
// Birden fazla gercek marka (SAAD + ASLI) ya da metinde birden fazla marka parantezi varsa eslesme belirsizdir:
// metne dokunulmaz (her konteyner kendi markasina uyan satiri zaten secer: packing-list-builder).

const TR_ASCII: Record<string, string> = { "İ": "I", "I": "I", "ı": "I", "Ş": "S", "ş": "S", "Ğ": "G", "ğ": "G", "Ü": "U", "ü": "U", "Ö": "O", "ö": "O", "Ç": "C", "ç": "C" };
/** Karsilastirma anahtari: "Ble d'Or" = "BLE DOR", "DİVA" = "DIVA", "LAILA BRAND" = "LAILA". */
export const markaAnahtari = (m: string | null | undefined) =>
  String(m ?? "").replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => TR_ASCII[c] || c).toUpperCase().replace(/\bBRAND\b/g, "").replace(/[^A-Z0-9]/g, "");

/** Gosterim: "laila brand" -> "LAILA"; cuval notu atilir: "UNEX (KRAFT)" -> "UNEX". */
const markaGosterim = (m: string) => m.replace(/\([^()]*\)/g, " ").replace(/\bBRAND\b/gi, "").replace(/\s+/g, " ").trim().toLocaleUpperCase("en-US");
/** Ayni marka mi: anahtarlardan biri digerini iceriyorsa ("SAAD" / "SAAD BRAND", "UNEX" / "UNEX (KRAFT)"). */
const ayniMarka = (a: string, b: string) => { const x = markaAnahtari(markaGosterim(a)), y = markaAnahtari(markaGosterim(b)); return !!x && !!y && (x.includes(y) || y.includes(x)); };

/**
 * Dosyanin gercek markalari: konteynerlere girilen markalar (tekil); hic yoksa dosya.marka
 * ("ALMAS & UNEX BRAND" -> ["ALMAS", "UNEX"]).
 */
export function gercekMarkalar(dosyaMarka: string | null | undefined, konteynerMarkalari: (string | null | undefined)[]): string[] {
  const kaynak = konteynerMarkalari.map((m) => String(m ?? "").trim()).filter(Boolean);
  const adaylar = kaynak.length ? kaynak : String(dosyaMarka ?? "").split(/\s*(?:&|,|\/|\+|\bVE\b|\bAND\b)\s*/i);
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const m of adaylar) {
    const k = markaAnahtari(markaGosterim(m));
    if (!k || gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push(markaGosterim(m));
  }
  return sonuc;
}

const MARKA_PARANTEZI = /\(\s*([^()]*?)\s+BRAND\s*\)/gi;

/** Metindeki tek "(X BRAND)" parantezini dosyanin tek gercek markasina uyarlar (yukaridaki kural). */
export function markayaUyarla(metin: string | null | undefined, markalar: string[]): string | null {
  if (metin == null) return null;
  const s = String(metin);
  if (markalar.length !== 1) return s;
  const bulunan = Array.from(s.matchAll(MARKA_PARANTEZI));
  const farkli = new Set(bulunan.map((m) => markaAnahtari(m[1])));
  if (farkli.size !== 1) return s;
  const gercek = markaGosterim(markalar[0]);
  if (!gercek || ayniMarka(bulunan[0][1], gercek)) return s;
  return s.replace(MARKA_PARANTEZI, `(${gercek} BRAND)`);
}
