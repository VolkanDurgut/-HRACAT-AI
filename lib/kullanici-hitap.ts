/**
 * Kullaniciya hitap ("Burak Bey") - Sorun Bildir tesekkur ekrani (25.10.2026).
 *
 * Supabase'te kullanici adlari KAYITLI DEGIL (hesaplar panelden e-postayla acildi,
 * user_metadata bos). Bu yuzden hitap e-posta adresine gore buradan verilir.
 * Listede olmayan kullaniciya isimsiz, ayni kibarlikta tesekkur edilir (tahmin yok:
 * yanlis isim / yanlis "Bey-Hanim" hic yazilmaz).
 *
 * Yeni kullanici eklenince buraya bir satir eklenir: "eposta": "Ad Bey" / "Ad Hanım".
 */
const HITAPLAR: Record<string, string> = {
  "bbt@unex.com.tr": "Burak Bey",
  // 27.10.2026: giris e-postalari degisti (ihracat@ -> export@, volkandurgut.tr@gmail.com -> execution@)
  "execution@unex.com.tr": "Volkan Bey",
  "export@unex.com.tr": "Harun Bey",
  "lojistik@unex.com.tr": "Süleyman Bey",
};

/** "Burak Bey" | null. Ileride user_metadata.hitap girilirse o da kullanilir. */
export function kullaniciHitabi(email: string | null | undefined, meta?: Record<string, unknown> | null): string | null {
  // e-posta: Turkce kucuk harf (toLocaleLowerCase "tr") KULLANILMAZ, "I" -> "ı" olur
  const anahtar = (email || "").trim().toLowerCase();
  if (anahtar && HITAPLAR[anahtar]) return HITAPLAR[anahtar];
  const metaHitap = meta?.hitap;
  if (typeof metaHitap === "string") {
    const temiz = metaHitap.trim().replace(/\s+/g, " ");
    if (temiz.length >= 2 && temiz.length <= 40) return temiz;
  }
  return null;
}
