/**
 * Supabase yazma (insert/update/delete) sonucunu kontrol eder.
 *
 * Neden gerekli (01.10.2026): supabase-js hata FIRLATMAZ, { data, error }
 * dondurur. Pek cok yerde sonuc hic kontrol edilmeden "basarili" toast'i
 * gosteriliyordu - kayit basarisiz olsa bile kullanici kaydedildi saniyordu.
 * Ayrica RLS (satir guvenligi) bir guncellemeyi/silmeyi engellediginde
 * Supabase HATA DONDURMEZ, sadece 0 satir etkilenir; bu da "basarili"
 * gorunuyordu.
 *
 * Kullanim: yazma sorgusunun sonuna `.select("id")` eklenir, sonra:
 *
 *   const { data, error } = await supabase.from("x").update(p).eq(...).select("id");
 *   const hata = yazmaHatasi(error, data);
 *   if (hata) { showToast(`Kaydedilemedi: ${hata}`, "error"); return; }
 *
 * Hata yoksa null, varsa kullaniciya gosterilecek Turkce mesaj dondurur.
 */
export function yazmaHatasi(
  error: { message: string } | null | undefined,
  data: unknown[] | null | undefined
): string | null {
  if (error) return error.message;
  if (!data || data.length === 0) {
    return "Kayıt bulunamadı veya bu işlem için yetkiniz yok.";
  }
  return null;
}
