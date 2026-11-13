import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// YEDEK INDIR (yedek-indir) - 13.11.2026
// ============================================================================
// Ayarlar > Yedekler sayfasindaki "Indir" dugmesi. Gece yedeginin zip'i artik mail eki degil, OZEL depoda
// ("veri-yedekleri", politika yok) durur (kurumsal posta sunucusu .zip ekini karantinaya aliyordu).
//   {"id": "<yedek_kayitlari.id>"} + kullanicinin oturum tokeni
//   1) public.yedek_indirme_izni(id) KULLANICININ tokeniyle cagrilir: yalniz super admin gecer
//      (public.yetki_super_admin_sirketi - tek liste), dosya yolunu doner ve indirmeyi yedek_indirmeleri'ne yazar.
//   2) Yol icin 120 saniyelik imzali indirme linki service_role ile uretilir ve doner. Link depoya kalici erisim vermez.
// Yanit: {"ok": true, "url": "...", "dosya": "<ad>.zip"} | {"ok": false, "hata": "..."}
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const KOVA = "veri-yedekleri";
const LINK_SURESI_SN = 120;

const cors = {
  "Access-Control-Allow-Origin": "https://ihracatasistanim.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (veri: unknown, status = 200) =>
  new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Depodaki yol yalniz edge'in kendi urettigi bicimde olabilir ("2026/ihracat-ai-yedek-13-11-2026.zip", "test/...zip")
const YOL = /^(?:\d{4}|test)\/[A-Za-z0-9._-]+\.zip$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, hata: "Yalnız POST." }, 405);
  try {
    const token = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+$/.test(token)) return json({ ok: false, hata: "Oturum bulunamadı. Lütfen yeniden giriş yapın." }, 401);
    const govde = (await req.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof govde.id === "string" ? govde.id.trim() : "";
    if (!UUID.test(id)) return json({ ok: false, hata: "Geçersiz yedek." }, 400);

    // 1) Yetki + kayit (kullanicinin kendi tokeniyle; super admin degilse veritabani reddeder)
    const izin = await fetch(`${SUPABASE_URL}/rest/v1/rpc/yedek_indirme_izni`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id }),
    });
    const izinMetni = await izin.text();
    if (!izin.ok) {
      let hata = "Bu işlem için yetkiniz yok.";
      try { hata = (JSON.parse(izinMetni) as { message?: string }).message || hata; } catch { /* metin */ }
      return json({ ok: false, hata }, izin.status === 401 ? 401 : 403);
    }
    const yol = JSON.parse(izinMetni) as string;
    if (typeof yol !== "string" || !YOL.test(yol)) return json({ ok: false, hata: "Yedek dosyasının yolu geçersiz." }, 500);

    // 2) Kisa sureli imzali link (service_role)
    const imza = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${KOVA}/${yol}`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: LINK_SURESI_SN }),
    });
    if (!imza.ok) {
      console.error("yedek-indir imza", imza.status, (await imza.text()).slice(0, 200));
      return json({ ok: false, hata: "İndirme linki oluşturulamadı. Lütfen tekrar deneyin." }, 502);
    }
    const { signedURL } = (await imza.json()) as { signedURL?: string };
    if (!signedURL) return json({ ok: false, hata: "İndirme linki oluşturulamadı." }, 502);
    const dosya = yol.split("/").pop()!;
    const url = `${SUPABASE_URL}/storage/v1${signedURL}${signedURL.includes("?") ? "&" : "?"}download=${encodeURIComponent(dosya)}`;
    return json({ ok: true, url, dosya });
  } catch (e) {
    console.error("yedek-indir", e instanceof Error ? e.message : e);
    return json({ ok: false, hata: "Beklenmeyen hata." }, 500);
  }
});
