import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { asistanVerisiNormalize, gorevleriKur, ozetKonusu, ozetMailiHtml, YONETICI_EPOSTASI } from "../_shared/yonetici-asistan.ts";
import { etiketliKonu, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";

// ============================================================================
// YONETICI ASISTANI SABAH OZETI (asistan-ozet) - 21.11.2026 (Faz 2)
// ============================================================================
// Kullanici: "Hafta ici her sabah yalniz bana bir ozet mail: Bugun istemeniz gerekenler, her satirda panele giden baglanti."
// Alici SABIT: yonetici (YONETICI_EPOSTASI = execution@unex.com.tr; panel ve RPC ile ayni). Baska kimseye gitmez.
// Govde:
//  - {} (pg_cron 'asistan-ozet', anon): yalniz ASISTAN_OZET_CANLI = "evet" iken, hafta ici, TR 08:00-10:59; gunde BIR
//    (asistan_ozet_gonderimleri). Acik gorev yoksa mail gitmez ("bos" kaydi). Veri dondurmez.
//  - {"deneme": true} (yonetici oturumu): mail GONDERMEZ; konu + HTML doner (paneldeki onizleme).
//  - {"test": true} (yonetici oturumu): "[TEST]" maili YALNIZ ASISTAN_OZET_TEST_ALICISI (secret) adresine; gunde en fazla 5.
// Veri: yonetici_asistani_sirketi() + yonetici_asistan_veri() (service_role). Hicbir kaydi degistirmez (yalniz gonderim kaydi).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://ihracatasistanim.com";
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const CANLI = (Deno.env.get("ASISTAN_OZET_CANLI") || "").trim().toLowerCase() === "evet";
const TEST_ALICISI = (Deno.env.get("ASISTAN_OZET_TEST_ALICISI") || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a)).slice(0, 3);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

function jwtRolu(token: string | null): string | null {
  const parca = token?.split(".")[1];
  if (!parca) return null;
  try {
    const b64 = parca.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parca.length / 4) * 4, "=");
    const r = (JSON.parse(atob(b64)) as { role?: unknown }).role;
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}

/** Oturum gercekten yoneticinin mi (token sunucuda dogrulanir). */
async function yoneticiOturumu(token: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) { await res.body?.cancel(); return false; }
  const u = (await res.json()) as { email?: string };
  return (u.email || "").trim().toLowerCase() === YONETICI_EPOSTASI;
}

async function rpc<T>(ad: string, govde: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, { method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  if (!res.ok) throw new Error(`${ad} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}
async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status})`);
  return (await res.json()) as T[];
}
async function kaydet(govde: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/asistan_ozet_gonderimleri`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(govde),
  });
  if (!res.ok) { console.error("asistan_ozet_gonderimleri", res.status, (await res.text()).slice(0, 200)); return false; }
  return true;
}
async function mailGonder(to: string[], konu: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: UNEX_AI_GONDEREN, to, subject: konu, html }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id?: string }).id || null;
}

const trSimdi = () => new Date(Date.now() + 3 * 3600_000);

async function ozetHazirla(test: boolean) {
  const sirket = await rpc<string | null>("yonetici_asistani_sirketi", {});
  if (!sirket) throw new Error("Yöneticinin şirketi bulunamadı.");
  const veri = asistanVerisiNormalize(await rpc<unknown>("yonetici_asistan_veri", { p_company: sirket }));
  const gorevler = gorevleriKur(veri);
  const acik = gorevler.filter((g) => g.durum === "acik").length;
  const konu = etiketliKonu("Hatırlatma", `${test ? "[TEST] " : ""}${ozetKonusu(gorevler, veri.tarih)}`);
  const html = ozetMailiHtml(gorevler, veri, SITE, { test, gercekAlici: YONETICI_EPOSTASI });
  return { sirket, veri, gorevler, acik, konu, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Yalnız POST." }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const rol = jwtRolu(token);
  if (rol !== "anon" && rol !== "service_role" && rol !== "authenticated") return json({ error: "Yetkisiz." }, 401);
  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { govde = {}; }

  try {
    // ---- Panel: onizleme / test (yalniz yonetici oturumu) ----
    if (govde.deneme === true || govde.test === true) {
      if (rol !== "authenticated" || !(await yoneticiOturumu(token))) return json({ hata: "Bu işlem yalnız yönetici içindir." }, 403);
      const test = govde.test === true;
      const o = await ozetHazirla(test);
      if (!test) return json({ deneme: true, konu: o.konu, html: o.html, acik: o.acik, alici: [YONETICI_EPOSTASI] });
      if (!TEST_ALICISI.length) return json({ gonderildi: false, hata: "Test adresi tanımlı değil (ASISTAN_OZET_TEST_ALICISI)." });
      const gun = new Date(Date.now() - 24 * 3600_000).toISOString();
      const sayilan = await oku<{ id: string }>(`asistan_ozet_gonderimleri?select=id&durum=eq.test&olusturma=gte.${gun}`);
      if (sayilan.length >= 5) return json({ gonderildi: false, hata: "Test sınırı (24 saatte 5 mail) doldu." }, 429);
      const tarih = o.veri.tarih;
      try {
        const id = await mailGonder(TEST_ALICISI, o.konu, o.html);
        await kaydet({ company_id: o.sirket, tarih, durum: "test", alicilar: TEST_ALICISI.join(","), gorev_sayisi: o.acik, mesaj_id: id });
        return json({ gonderildi: true, alici: TEST_ALICISI, konu: o.konu });
      } catch (e) {
        const hata = e instanceof Error ? e.message : String(e);
        await kaydet({ company_id: o.sirket, tarih, durum: "hata", alicilar: TEST_ALICISI.join(","), gorev_sayisi: o.acik, hata });
        return json({ gonderildi: false, hata }, 500);
      }
    }

    // ---- Zamanlanmis: yalniz canli, hafta ici, TR 08:00-10:59, gunde bir ----
    if (!CANLI) return json({ ok: true, canli: false });
    const simdi = trSimdi();
    const gunNo = simdi.getUTCDay();
    if (gunNo === 0 || gunNo === 6) return json({ ok: true, haftasonu: true });
    const saat = simdi.getUTCHours();
    if (saat < 8 || saat > 10) return json({ ok: true, saat_disi: true });
    const o = await ozetHazirla(false);
    const tarih = o.veri.tarih;
    const onceki = await oku<{ id: string }>(`asistan_ozet_gonderimleri?select=id&company_id=eq.${o.sirket}&tarih=eq.${tarih}&durum=in.(gonderildi,bos)`);
    if (onceki.length) return json({ ok: true, zaten: true });
    const hatalar = await oku<{ id: string }>(`asistan_ozet_gonderimleri?select=id&company_id=eq.${o.sirket}&tarih=eq.${tarih}&durum=eq.hata`);
    if (hatalar.length >= 3) return json({ ok: true, hata_siniri: true });
    if (o.acik === 0) {
      await kaydet({ company_id: o.sirket, tarih, durum: "bos", gorev_sayisi: 0 });
      return json({ ok: true, gonderilen: 0, bos: true });
    }
    // Once kayit (gunde bir: benzersiz index) - ayni anda iki cagri iki mail gondermesin
    if (!(await kaydet({ company_id: o.sirket, tarih, durum: "gonderildi", alicilar: YONETICI_EPOSTASI, gorev_sayisi: o.acik }))) {
      return json({ ok: true, zaten: true });
    }
    try {
      const id = await mailGonder([YONETICI_EPOSTASI], o.konu, o.html);
      await fetch(`${SUPABASE_URL}/rest/v1/asistan_ozet_gonderimleri?company_id=eq.${o.sirket}&tarih=eq.${tarih}&durum=eq.gonderildi`, {
        method: "PATCH", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ mesaj_id: id }),
      });
      return json({ ok: true, gonderilen: 1 });
    } catch (e) {
      const hata = e instanceof Error ? e.message : String(e);
      // Gonderilemedi: "gonderildi" kaydi "hata"ya cevrilir (sonraki tetikte yeniden denenir; en fazla 3)
      await fetch(`${SUPABASE_URL}/rest/v1/asistan_ozet_gonderimleri?company_id=eq.${o.sirket}&tarih=eq.${tarih}&durum=eq.gonderildi`, {
        method: "PATCH", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ durum: "hata", hata: hata.slice(0, 500) }),
      });
      return json({ ok: false, hata }, 500);
    }
  } catch (e) {
    console.error("asistan-ozet", e);
    return json({ error: "İşlem tamamlanamadı." }, 500);
  }
});
