import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { xlsxParcalari } from "../_shared/xlsx-yaz.ts";
import { siparissizHtml, siparissizKonusu, siparissizOzet, siparissizSayfasi, siparissizVeriHazirla } from "../_shared/siparissiz-rapor.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { etiketliKonu, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";

// ============================================================================
// SIPARISSIZ MUSTERI RAPORU (siparissiz-musteri-rapor) - 23.11.2026
// ============================================================================
// Kullanici: "Mevcut pazar icin siparisi olmayan musterilerimizin ihracattaki export arkadasimiza mail olarak iletilmesi
// gerekiyor." Haftalik ozet, alici Ayarlar > Rapor Alicilari ('siparissiz'; kurulum: export@ + CC bbt@ / execution@, CANLI KAPALI).
// Veri: pazar_siparissiz_ozet (service_role, yalniz okuma). Hesap + HTML + Excel: _shared/siparissiz-rapor.ts.
// Canli DEGILSE her gonderim yalniz test adresine (SIPARISSIZ_RAPOR_TEST_ALICISI, yoksa SIPARIS_RAPOR_TEST_ALICISI) "[TEST]".
// CAGRI:
//  - Anon (pg_cron 'siparissiz-musteri-rapor', pazartesi 06:00 UTC): yalniz PAZARTESI 08:55-10:00 TR; sirket + hafta icin bir kez.
//    Anon {"test": true}: yalniz rapor canli DEGILKEN (alici zaten test adresi), 24 saatte en fazla 3.
//  - Yetkili kullanici (admin / super admin), yalniz KENDI sirketi: {"deneme": true} -> mail GITMEZ, konu + ozet + HTML;
//    {"test": true} -> "[TEST]" mail YALNIZ test adresine (24 saatte en fazla 3).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const SUPER_ADMIN_EPOSTALARI = ["execution@unex.com.tr", "bbt@unex.com.tr"];
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function adresler(ad: string): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a));
  return Array.from(new Set(liste)).slice(0, 6);
}
const TEST_ALICISI = adresler("SIPARISSIZ_RAPOR_TEST_ALICISI").length ? adresler("SIPARISSIZ_RAPOR_TEST_ALICISI") : adresler("SIPARIS_RAPOR_TEST_ALICISI");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

const trSimdi = () => new Date(Date.now() + 3 * 3600_000);
const trBugun = () => trSimdi().toISOString().slice(0, 10);
/** Haftanin pazartesisi (TR) */
function haftaBasi(): string {
  const t = trSimdi();
  const fark = (t.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - fark)).toISOString().slice(0, 10);
}
/** Zamanlanmis gonderim penceresi: pazartesi 08:55-10:00 TR */
function pencere(): boolean {
  const t = trSimdi();
  const dk = t.getUTCHours() * 60 + t.getUTCMinutes();
  return t.getUTCDay() === 1 && dk >= 9 * 60 - 5 && dk < 10 * 60;
}

async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
}

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
async function yetkiliKullaniciSirketi(req: Request): Promise<string | null> {
  const baslik = req.headers.get("Authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null;
  if (jwtRolu(token) !== "authenticated") return null;
  const kRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!kRes.ok) { await kRes.body?.cancel(); return null; }
  const k = (await kRes.json()) as { id?: string; email?: string };
  if (!k.id || !UUID_RE.test(k.id)) return null;
  const roller = await oku<{ company_id: string | null; rol: string | null }>(`kullanici_rolleri?select=company_id,rol&user_id=eq.${k.id}`);
  const kayit = roller.find((r) => !!r.company_id);
  if (!kayit?.company_id) return null;
  const superAdmin = SUPER_ADMIN_EPOSTALARI.includes((k.email || "").toLowerCase());
  return superAdmin || kayit.rol === "admin" ? kayit.company_id : null;
}

async function excelBase64(sayfa: ReturnType<typeof siparissizSayfasi>): Promise<string> {
  const zip = new JSZip();
  for (const f of xlsxParcalari([sayfa])) zip.file(f.yol, f.icerik);
  return await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean };
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const yetkili = yetkiliSirket !== null;
    if (yetkili && govde.deneme !== true && govde.test !== true) return json({ ok: false, hata: "Elle yalnızca önizleme ya da test gönderimi yapılabilir." }, 400);
    if (!yetkili) {
      if (govde.deneme) return json({ ok: false, hata: "Önizleme yalnızca yetkili kullanıcılar içindir." }, 403);
      if (govde.test !== true && !pencere()) return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
    }
    const deneme = yetkili && govde.deneme === true;
    const tarih = trBugun();
    const hafta = haftaBasi();

    // Rapor ayari olan sirketler (yetkili kullanicida yalniz kendi sirketi)
    const ayarlar = await oku<{ company_id: string }>(`rapor_alicilari?select=company_id&rapor=eq.siparissiz&order=company_id`);
    const idler = Array.from(new Set(ayarlar.map((a) => a.company_id))).filter((id) => !yetkili || id === yetkiliSirket);
    if (yetkili && !idler.length) return json({ ok: true, deneme, tarih, sonuclar: [{ atlandi: "Siparişsiz müşteri raporu bu şirkette kurulu değil." }] });

    const sonuclar: Record<string, unknown>[] = [];
    for (const companyId of idler) {
      const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, "siparissiz", { canli: false, alicilar: [] });
      if (!yetkili && govde.test === true && ayar.canli) { sonuclar.push({ atlandi: "Canlı raporda test yalnızca yöneticiler içindir." }); continue; }
      const test = !deneme && (govde.test === true || !ayar.canli);
      const sirket = await oku<{ company_name: string | null }>(`companies?select=company_name&id=eq.${companyId}`);
      const sirketAdi = (sirket[0]?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";

      const vRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pazar_siparissiz_ozet`, {
        method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_company: companyId, p_bugun: tarih }),
      });
      if (!vRes.ok) throw new Error(`pazar_siparissiz_ozet okunamadı (HTTP ${vRes.status}): ${(await vRes.text()).slice(0, 200)}`);
      const veri = siparissizVeriHazirla(await vRes.json());
      const ozet = siparissizOzet(veri);
      const konu = etiketliKonu("Rapor", `${test ? "[TEST] " : ""}${siparissizKonusu(veri)}`, { sirketAdi });
      const html = siparissizHtml(veri, sirketAdi);
      const alicilar = test ? TEST_ALICISI : ayar.alicilar;
      const cc = test ? [] : ayar.cc;
      if (deneme) { sonuclar.push({ tarih, konu, alicilar: ayar.canli ? ayar.alicilar : TEST_ALICISI, cc: ayar.canli ? ayar.cc : [], canli: ayar.canli, ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: test ? "Test adresi tanımlı değil (SIPARIS_RAPOR_TEST_ALICISI)." : "Geçerli alıcı yok (Ayarlar > Rapor Alıcıları)." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      const elle = yetkili || govde.test === true;
      if (elle) {
        const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
        const t = await oku<{ id: string }>(`siparissiz_rapor_gonderimleri?select=id&company_id=eq.${companyId}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}`);
        if (t.length >= 3) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 3 test maili gönderilebilir." }); continue; }
      }
      // Tekrar korumasi: zamanlanmis gonderim sirket + hafta icin tek kayit (kismi benzersiz index)
      const k = await fetch(`${SUPABASE_URL}/rest/v1/siparissiz_rapor_gonderimleri`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, hafta, durum: "gonderiliyor", test, elle }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bu haftanın raporu zaten gönderilmiş." }); continue; }
      if (!k.ok) throw new Error(`siparissiz_rapor_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      const kayitId = ((await k.json()) as { id: string }[])[0]?.id;

      const ek = await excelBase64(siparissizSayfasi(veri));
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: UNEX_AI_GONDEREN, to: alicilar, ...(cc.length ? { cc } : {}), subject: konu, html,
          attachments: [{ filename: `Siparissiz_Musteriler_${tarih}.xlsx`, content: ek }],
        }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (kayitId) await fetch(`${SUPABASE_URL}/rest/v1/siparissiz_rapor_gonderimleri?id=eq.${kayitId}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      if (kayitId) {
        await fetch(`${SUPABASE_URL}/rest/v1/siparissiz_rapor_gonderimleri?id=eq.${kayitId}`, {
          method: "PATCH",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ durum: "gonderildi", alicilar: [...alicilar, ...cc].join(","), ozet, gonderim_zamani: new Date().toISOString() }),
        });
      }
      sonuclar.push({ gonderildi: true, test, tarih, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, tarih, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, tarih, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparissiz-musteri-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
