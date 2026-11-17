import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { alandanGelenBasliklar } from "../_shared/imap-oku.ts";

// ============================================================================
// OPERASYON IMAP (operasyon-imap) - 17.11.2026, Operasyon Ajani Faz 1
// ============================================================================
// Sorun: execution@ -> arsiv Gmail iletmesi bazi acentelerin maillerini teslim edemiyor (28.10.2026'dan beri pilot
// acentenin hicbir maili arsive ulasmadi). Bu fonksiyon sirket kutusunu DOGRUDAN ve SALT OKUNUR okur (_shared/imap-oku.ts: EXAMINE + BODY.PEEK;
// hicbir mail okundu olmaz, silinmez, tasinmaz, gonderilmez).
//
// SU AN YALNIZ BAGLANTI DENEMESI (kullanici onayi 17.11.2026): veritabanina HICBIR SEY yazmaz.
//   {"islem": "deneme", "alan": "<acente alan adi>", "gun": "YYYY-AA-GG"}
//   -> o gunden beri o alan adindan gelen maillerin baslik listesi (tarih, gonderen, konu, Message-ID).
//   Acente alan adi repoda tutulmaz (repo herkese acik); cagiran verir.
//
// Yetki: "x-cron-anahtar" basligi = Vault operasyon_imap_anahtari (migration 20261117160000), RPC ile dogrulanir.
// Kimlik bilgileri yalniz edge secret'larinda: EXEC_IMAP_KULLANICI, EXEC_IMAP_SIFRE (istege bagli EXEC_IMAP_SUNUCU,
// varsayilan sirket posta sunucusu). Hicbiri loglanmaz / yanita yazilmaz.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KULLANICI = (Deno.env.get("EXEC_IMAP_KULLANICI") || "").trim();
const SIFRE = Deno.env.get("EXEC_IMAP_SIFRE") || "";
const SUNUCU = (Deno.env.get("EXEC_IMAP_SUNUCU") || "mail.unex.com.tr").trim();

const json = (veri: unknown, status = 200) =>
  new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });

async function anahtarGecerli(anahtar: string): Promise<boolean> {
  if (!anahtar) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/operasyon_imap_anahtari_dogrula`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_anahtar: anahtar }),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return false;
    }
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ hata: "Yalniz POST." }, 405);
  if (!(await anahtarGecerli(req.headers.get("x-cron-anahtar") || ""))) return json({ hata: "Yetkisiz." }, 401);
  if (!KULLANICI || !SIFRE) return json({ hata: "EXEC_IMAP_KULLANICI / EXEC_IMAP_SIFRE tanimli degil." }, 503);

  let govde: { islem?: string; alan?: string; gun?: string };
  try {
    govde = await req.json();
  } catch {
    return json({ hata: "Gecersiz JSON." }, 400);
  }
  if (govde.islem !== "deneme") return json({ hata: "Bilinmeyen islem (yalniz 'deneme')." }, 400);
  const alan = String(govde.alan || "").trim().toLowerCase();
  const gun = String(govde.gun || "").trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(alan)) return json({ hata: "Gecersiz alan." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) return json({ hata: "gun YYYY-AA-GG olmali." }, 400);

  const t0 = Date.now();
  try {
    const mailler = await alandanGelenBasliklar({ sunucu: SUNUCU, kullanici: KULLANICI, sifre: SIFRE }, alan, gun, 100);
    return json({
      ok: true,
      sure_ms: Date.now() - t0,
      sayi: mailler.length,
      mailler: mailler.map((m) => ({ tarih: m.tarih, gonderen: m.gonderen, konu: m.konu, mesaj_id: m.mesajId })),
    });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("operasyon-imap:", mesaj);
    return json({ ok: false, sure_ms: Date.now() - t0, hata: mesaj.slice(0, 200) }, 502);
  }
});
