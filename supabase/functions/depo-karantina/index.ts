import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// DEPO KARANTINASI - TAMAMLANDI, DEVRE DISI (09.10.2026)
// ============================================================================
// 05.10.2026: kayda bagli olmayan 68 dosya (36,7 MB) "_karantina/2026-10-05/"
// altina tasindi. 09.10.2026: 4 gun sorunsuz gectikten sonra kullanici
// onayiyla KALICI SILINDI (silme_kontrol 68/68 silinebilir, kalici_sil 68/68
// silindi; sonrasinda 266 kayit referansinin 0'i kirik).
// Islem tekrar edilmeyecegi icin fonksiyon hicbir sey yapmaz. Calisan surumu
// git gecmisinde: "depo-karantina: silme_kontrol ve kalici_sil" commit'i.
// ============================================================================

Deno.serve(() =>
  new Response(JSON.stringify({ durum: "devre_disi", aciklama: "Karantina 09.10.2026'da kalici silindi; bu fonksiyon artik islem yapmaz." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
