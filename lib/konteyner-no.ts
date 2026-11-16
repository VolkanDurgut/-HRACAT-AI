/**
 * KONTEYNER NUMARASI - belgede bulma + ISO 6346 kontrol hanesi (16.11.2026). Saf modul.
 *
 * Kullanici (IHR-2026-0116, Akkon konsimento talimati): "Ilgili konteyner orada var fakat yine de yanlis gosteriyor."
 * Neden: PSRU2219194 belgede de sistemde de AYNI yazili, ama ISO 6346 kontrol hanesi tutmuyor (olmasi gereken son
 * hane 2). Belge okuyuculari kontrol hanesi tutmayan numarayi "gurultu" sayip atiyordu -> "Belgede yok" (yanlis alarm).
 * Kural (tum belge kontrollerinde ayni):
 *  - Belgedeki aday numara SISTEMDEKI bir konteynerle birebir ayniysa kontrol hanesine bakilmadan eslesir.
 *  - Sistemde olmayan aday yalniz kontrol hanesi tutuyorsa "sistemde yok" sayilir (rastgele harf+rakam dizisi elenir).
 *  - Sistemdeki numaranin kontrol hanesi tutmuyorsa AYRI bir "elle bakin" satiri: numara hem sistemde hem belgede
 *    yanlis yazilmis olabilir (konteyner kapisi / EIR / acente ile teyit). Uyusmazlik SAYILMAZ.
 */

/** ISO 6346 konteyner no kontrol hanesi; bicim uygun degilse null. */
export function kontrolHanesi(no: string): number | null {
  const s = no.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{4}\d{6,7}$/.test(s)) return null;
  const deger = (c: string) => {
    if (/\d/.test(c)) return Number(c);
    let v = 10;
    for (let k = 65; k < c.charCodeAt(0); k++) { v++; if (v % 11 === 0) v++; }
    return v;
  };
  let toplam = 0;
  for (let i = 0; i < 10; i++) toplam += deger(s[i]) * 2 ** i;
  return (toplam % 11) % 10;
}

/** ISO 6346: 4 harf + 7 hane ve son hane kontrol hanesine esit. */
export function konteynerGecerli(no: string): boolean {
  const s = no.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}\d{7}$/.test(s) && kontrolHanesi(s) === Number(s[10]);
}

export const konteynerSade = (no: string | null | undefined) => (no || "").replace(/[\s-]+/g, "").toUpperCase();

/**
 * Metindeki konteyner numaralari. 4. harf ekipman kategorisi (U/J/Z); rakamlar arasina bosluk girebilir
 * ("TSTU 1000003", "TSTU1 000003"). Sistemdeki numaralar kontrol hanesine bakilmadan kabul edilir.
 */
export function belgedekiKonteynerler(metin: string, sistemdekiler: string[] = []): string[] {
  const sistem = new Set(sistemdekiler.map(konteynerSade).filter(Boolean));
  const ust = metin.toLocaleUpperCase("en-US");
  const sonuc: string[] = [];
  for (const m of Array.from(ust.matchAll(/(?<![A-Z0-9])([A-Z]{3}[UJZ])\s?-?((?:\s?\d){7})(?![0-9])/g))) {
    const no = `${m[1]}${m[2].replace(/\s+/g, "")}`;
    if (sonuc.includes(no)) continue;
    if (sistem.has(no) || konteynerGecerli(no)) sonuc.push(no);
  }
  return sonuc;
}

export type KontrolHanesiHatasi = { no: string; beklenen: number };

/** Sistemdeki numaralardan kontrol hanesi tutmayanlar (bicimi bozuk olanlar da: beklenen -1). */
export function kontrolHanesiHatalari(sistemdekiler: string[]): KontrolHanesiHatasi[] {
  const sonuc: KontrolHanesiHatasi[] = [];
  for (const ham of sistemdekiler) {
    const no = konteynerSade(ham);
    if (!no || konteynerGecerli(no) || sonuc.some((x) => x.no === no)) continue;
    sonuc.push({ no, beklenen: kontrolHanesi(no) ?? -1 });
  }
  return sonuc;
}

/** Kullaniciya gosterilecek tek satirlik aciklama. */
export function kontrolHanesiNotu(h: KontrolHanesiHatasi[]): string {
  return h.map((x) => (x.beklenen < 0
    ? `${x.no}: biçim ISO 6346'ya uymuyor (4 harf + 7 rakam)`
    : `${x.no}: kontrol hanesi tutmuyor (son hane ${x.beklenen} olmalı)`)).join(" · ")
    + ". Numarayı konteyner kapısı / EIR / acente ile teyit edin; sistemde ve belgede aynı yanlış yazılmış olabilir.";
}
