/**
 * CALISMA ORTAMI (22.11.2026). Kullanici: "Mevcut durum kayitli kalsin, farkli bir test alaninda devam edelim; test
 * ortaminda deneyip duruma gore canliya alalim."
 *
 * Test alani = Netlify dal / PR onizlemesi (next.config.js: CONTEXT deploy-preview | branch-deploy -> "test").
 * Onizleme CANLI veritabanina baglidir (ayri veritabani yok); bu yuzden test ortaminda:
 *  - her sayfanin ustunde "Test ortami" seridi gorunur (components/test-ortami-seridi.tsx),
 *  - yeni dosya / sevkiyat dosyasi acma PROVA modundadir: olusacak kayit gosterilir, veritabanina YAZILMAZ.
 * Canli (production) derlemede bu dosya hicbir davranisi degistirmez.
 */
export type Ortam = "test" | "canli";

/** Saf: ham degerden ortam (yalniz tam "test" test sayilir; bos / bilinmeyen -> canli). */
export function ortamCoz(ham: string | null | undefined): Ortam {
  return (ham || "").trim() === "test" ? "test" : "canli";
}

/** Derlemede gomulen ortam (Next.js NEXT_PUBLIC_ORTAM'i derleme aninda yerine yazar). */
export function ortam(): Ortam {
  return ortamCoz(process.env.NEXT_PUBLIC_ORTAM);
}

export function testOrtami(): boolean {
  return ortam() === "test";
}
