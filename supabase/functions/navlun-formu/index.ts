import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// NAVLUN FORMU - KULLANIM DISI (10.11.2026). Elle giris formu kaldirildi (migration 20261110140000);
// navlun bilgisi maillerden otomatik toplanacak. Fonksiyon panelden silinene kadar her cagriya 410 doner.
Deno.serve(() =>
  new Response(JSON.stringify({ hata: "Bu form kullanım dışı." }), {
    status: 410,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
);
