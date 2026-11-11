import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "../_shared/siparis-liste.ts";
import { planSayfasi, siparisSayfasi } from "../_shared/siparis-xlsx.ts";
import { xlsxParcalari } from "../_shared/xlsx-yaz.ts";
import { siparisRaporHesapla, siparisRaporHtml, siparisRaporKonusu } from "../_shared/siparis-rapor.ts";
import { oturumPenceresi, oturumSaatten } from "../_shared/rapor-oturum.ts";

// ============================================================================
// SIPARIS RAPORU MAILI (siparis-rapor) - 11.11.2026
// ============================================================================
// pg_cron 'siparis-rapor-sabah' 05:00 UTC = 08:00 TR ve 'siparis-rapor-aksam' 14:00 UTC = 17:00 TR, her gun (11.11.2026). Hesap + HTML: _shared/siparis-rapor.ts (Siparisler sayfasiyla
// ayni veri: siparis_listesi_veri + yukleme_plani_veri, service_role, yalniz okuma). Ek: sayfadaki "Excel indir" ile AYNI
// dosya (_shared/siparis-xlsx.ts). Musteriye GITMEZ.
// ALICILAR (secret): SIPARIS_RAPOR_CANLI = "evet" DEGILSE mail SADECE test adresine
//   (SIPARIS_RAPOR_TEST_ALICISI, varsayilan mesensei282@gmail.com) "[TEST]" konuyla gider.
//   Canlida: SIPARIS_RAPOR_ALICI (virgulle, en fazla 6).
// CAGRI YETKISI (diib-gunluk-rapor ile ayni ilke):
//  - Anon (pg_cron): yalniz 07:55-09:00 / 16:55-18:00 TR penceresinde; sirket + gun + oturum icin bir kez
//    (siparis_rapor_gonderimleri kismi benzersiz index). Yanitta veri yok. Anon {"test": true}: YALNIZ test modunda (alici sabit test
//    adresi), 24 saatte en fazla 3; zamanlanmis raporu engellemez.
//  - Yetkili kullanici (admin / super admin), yalniz KENDI sirketi: {"deneme": true} -> mail GITMEZ,
//    konu + ozet + HTML doner; {"test": true} -> "[TEST]" mail (gunde en fazla 3), zamanlanmisi engellemez.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SAYFA = 1000;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const SUPER_ADMIN_EPOSTALARI = ["execution@unex.com.tr", "bbt@unex.com.tr"];
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function adresler(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a));
  return liste.length ? Array.from(new Set(liste)).slice(0, 6) : varsayilan;
}
const CANLI = (Deno.env.get("SIPARIS_RAPOR_CANLI") || "").trim().toLowerCase() === "evet";
const ALICILAR = adresler("SIPARIS_RAPOR_ALICI", []);
const TEST_ALICISI = adresler("SIPARIS_RAPOR_TEST_ALICISI", ["mesensei282@gmail.com"]);

const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

async function tekrarla(istek: () => Promise<Response>): Promise<Response> {
  for (let sira = 0; ; sira++) {
    try {
      const res = await istek();
      if (res.status < 500 || sira >= 2) return res;
      await res.body?.cancel();
    } catch (e) {
      if (sira >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (sira + 1)));
  }
}
async function hepsiniCek<T>(yol: string): Promise<T[]> {
  const satirlar: T[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const ayrac = yol.includes("?") ? "&" : "?";
    const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/${yol}${ayrac}limit=${SAYFA}&offset=${bas}`, { headers: basliklar }));
    if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const sayfa = (await res.json()) as T[];
    satirlar.push(...sayfa);
    if (sayfa.length < SAYFA) break;
  }
  return satirlar;
}
const inListe = (idler: string[]) => `(${idler.map((i) => `"${i}"`).join(",")})`;

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
  const roller = await hepsiniCek<{ company_id: string | null; rol: string | null }>(`kullanici_rolleri?select=company_id,rol&user_id=eq.${k.id}`);
  const kayit = roller.find((r) => !!r.company_id);
  if (!kayit?.company_id) return null;
  const superAdmin = SUPER_ADMIN_EPOSTALARI.includes((k.email || "").toLowerCase());
  return superAdmin || kayit.rol === "admin" ? kayit.company_id : null;
}

/** Siparisler sayfasindaki veri (lib/siparis/veri.ts ile ayni RPC'ler). */
async function rpcHepsi(ad: string, companyId: string): Promise<Record<string, unknown>[]> {
  const satirlar: Record<string, unknown>[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}?limit=${SAYFA}&offset=${bas}`, {
      method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_company: companyId }),
    }));
    if (!res.ok) throw new Error(`${ad} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const sayfa = (await res.json()) as Record<string, unknown>[];
    satirlar.push(...sayfa);
    if (sayfa.length < SAYFA) break;
  }
  return satirlar;
}
async function sirketVerisi(companyId: string): Promise<{ siparisler: SiparisSatiri[]; plan: PlanSatiri[] }> {
  const [s, p] = await Promise.all([rpcHepsi("siparis_listesi_veri", companyId), rpcHepsi("yukleme_plani_veri", companyId)]);
  return { siparisler: s.map(siparisNormalize), plan: p.map(planNormalize) };
}

async function excelBase64(siparisler: SiparisSatiri[], plan: PlanSatiri[], tarih: string): Promise<string> {
  const zip = new JSZip();
  for (const f of xlsxParcalari([siparisSayfasi(siparisler), planSayfasi(plan, "Yükleme Planı", tarih)])) zip.file(f.yol, f.icerik);
  return await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean };
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const yetkili = yetkiliSirket !== null;
    if (!yetkili) {
      if (govde.deneme) return json({ ok: false, hata: "Deneme yalnızca yetkili kullanıcılar içindir." }, 403);
      if (govde.test === true && CANLI) return json({ ok: false, hata: "Test yalnızca yetkili kullanıcılar içindir." }, 403);
      if (govde.test !== true && !oturumPenceresi(Date.now())) return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
    }
    const deneme = yetkili && govde.deneme === true;
    // Canli degilse her gonderim test adresine "[TEST]" gider (zamanlanmis gonderim dahil)
    const test = !deneme && (govde.test === true || !CANLI);
    const tarih = trBugun();
    const oturum = oturumPenceresi(Date.now()) ?? oturumSaatten(Date.now());

    // Siparis defteri olan sirketler (yetkili kullanicida yalniz kendi sirketi)
    const defter = await hepsiniCek<{ company_id: string }>(`siparis_defteri?select=company_id&order=company_id`);
    const idler = Array.from(new Set(defter.map((b) => b.company_id))).filter((id) => !yetkili || id === yetkiliSirket);
    const sirketler = idler.length ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(idler)}&order=id`) : [];

    const sonuclar: Record<string, unknown>[] = [];
    for (const companyId of idler) {
      const sirketAdi = (sirketler.find((s) => s.id === companyId)?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
      const { siparisler, plan } = await sirketVerisi(companyId);
      const rapor = siparisRaporHesapla(siparisler, plan, tarih);
      const ozet = { ...rapor.ozet };
      const konu = `${test ? "[TEST] " : ""}${siparisRaporKonusu(rapor, sirketAdi)}`;
      const html = siparisRaporHtml(rapor, sirketAdi, new Date().toISOString());
      const alicilar = test ? TEST_ALICISI : ALICILAR;
      if (deneme) { sonuclar.push({ tarih, konu, alicilar: CANLI ? ALICILAR : TEST_ALICISI, canli: CANLI, ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok (SIPARIS_RAPOR_ALICI)." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      if (govde.test === true) {
        const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
        const t = await hepsiniCek<{ id: string }>(`siparis_rapor_gonderimleri?select=id&company_id=eq.${companyId}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}&order=id`);
        if (t.length >= 3) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 3 deneme raporu gönderilebilir." }); continue; }
      }
      // Tekrar korumasi: zamanlanmis gonderim (elle degil) sirket + gun + oturum icin tek kayit
      const elle = yetkili || govde.test === true;
      if (!elle) {
        const var_ = await hepsiniCek<{ id: string }>(`siparis_rapor_gonderimleri?select=id&company_id=eq.${companyId}&rapor_tarihi=eq.${tarih}&oturum=eq.${oturum}&elle=is.false&order=id`);
        if (var_.length) { sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      }
      const k = await fetch(`${SUPABASE_URL}/rest/v1/siparis_rapor_gonderimleri`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, rapor_tarihi: tarih, oturum, durum: "gonderiliyor", test, elle }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      if (!k.ok) throw new Error(`siparis_rapor_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      const kayitId = ((await k.json()) as { id: string }[])[0]?.id;

      const ek = await excelBase64(siparisler, plan, tarih);
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${sirketAdi} Sipariş Raporu <bildirim@ihracatasistanim.com>`, to: alicilar, subject: konu, html,
          attachments: [{ filename: `Siparis_Listesi_${tarih}.xlsx`, content: ek }],
        }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (kayitId) await fetch(`${SUPABASE_URL}/rest/v1/siparis_rapor_gonderimleri?id=eq.${kayitId}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      if (kayitId) {
        await fetch(`${SUPABASE_URL}/rest/v1/siparis_rapor_gonderimleri?id=eq.${kayitId}`, {
          method: "PATCH",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ durum: "gonderildi", alicilar: alicilar.join(","), ozet, gonderim_zamani: new Date().toISOString() }),
        });
      }
      sonuclar.push({ gonderildi: true, test, tarih, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, test, tarih, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, test, canli: CANLI, tarih, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("siparis-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
