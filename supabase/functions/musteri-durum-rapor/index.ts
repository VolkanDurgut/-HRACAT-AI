import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "../_shared/siparis-liste.ts";
import { musteriDurumHtml, musteriDurumKonusu, musteriDurumlari } from "../_shared/musteri-durum.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";

// ============================================================================
// MUSTERI DURUM RAPORU (musteri-durum-rapor) - 12.11.2026
// ============================================================================
// Siparisi olan her musteriye Ingilizce siparis durumu (_shared/musteri-durum.ts). Kullanici: "Ilk once sensei test olarak
// ilerleyecegiz." Bu surumde YALNIZ yetkili kullanici (admin / super admin, kendi sirketi) cagirabilir:
//   {"deneme": true, "musteri"?: "..."} -> mail GITMEZ; musteri listesi + secilen (yoksa ilk) musterinin konu + HTML'i
//   {"test": true, "musteri"?: "..."}   -> "[TEST]" mail YALNIZ test adresine (MUSTERI_DURUM_TEST_ALICISI, varsayilan
//                                          mesensei282@gmail.com); her cagri tek musteri, tek mail.
// Zamanlanmis / canli gonderim YOK: musterilerin e-posta adresleri sistemde tanimlanip kullanici onayladiktan sonra acilir.
// CC (canlida) Ayarlar > Rapor Alicilari (rapor = 'musteri_durum'); yanit adresi = CC listesi (ihracat ekibi).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SAYFA = 1000;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const SUPER_ADMIN_EPOSTALARI = ["execution@unex.com.tr", "bbt@unex.com.tr"];
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_ALICISI = (() => {
  const l = (Deno.env.get("MUSTERI_DURUM_TEST_ALICISI") || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a));
  return l.length ? l.slice(0, 3) : ["mesensei282@gmail.com"];
})();

const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
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
  const rRes = await fetch(`${SUPABASE_URL}/rest/v1/kullanici_rolleri?select=company_id,rol&user_id=eq.${k.id}`, { headers: basliklar });
  if (!rRes.ok) { await rRes.body?.cancel(); return null; }
  const kayit = ((await rRes.json()) as { company_id: string | null; rol: string | null }[]).find((r) => !!r.company_id);
  if (!kayit?.company_id) return null;
  const superAdmin = SUPER_ADMIN_EPOSTALARI.includes((k.email || "").toLowerCase());
  return superAdmin || kayit.rol === "admin" ? kayit.company_id : null;
}

async function rpcHepsi(ad: string, companyId: string): Promise<Record<string, unknown>[]> {
  const satirlar: Record<string, unknown>[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}?limit=${SAYFA}&offset=${bas}`, {
      method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_company: companyId }),
    });
    if (!res.ok) throw new Error(`${ad} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const sayfa = (await res.json()) as Record<string, unknown>[];
    satirlar.push(...sayfa);
    if (sayfa.length < SAYFA) break;
  }
  return satirlar;
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean; musteri?: string };
    const sirket = await yetkiliKullaniciSirketi(req);
    if (!sirket) return json({ ok: false, hata: "Müşteri durum raporu şimdilik yalnız yöneticiler tarafından önizlenebilir / test edilebilir." }, 403);
    if (govde.deneme !== true && govde.test !== true) return json({ ok: false, hata: "Canlı gönderim henüz açılmadı (önce test)." }, 400);

    const tarih = trBugun();
    const [s, p] = await Promise.all([rpcHepsi("siparis_listesi_veri", sirket), rpcHepsi("yukleme_plani_veri", sirket)]);
    const siparisler: SiparisSatiri[] = s.map(siparisNormalize);
    const plan: PlanSatiri[] = p.map(planNormalize);
    const durumlar = musteriDurumlari(siparisler, plan, tarih);
    if (!durumlar.length) return json({ ok: true, tarih, sonuclar: [{ atlandi: "Onaylı siparişi olan müşteri yok." }] });
    const istenen = typeof govde.musteri === "string" ? govde.musteri.trim().slice(0, 120) : "";
    const m = durumlar.find((x) => x.musteri === istenen) || durumlar[0];
    const cRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=company_name&id=eq.${sirket}`, { headers: basliklar });
    const sirketAdi = cRes.ok ? (((await cRes.json()) as { company_name: string | null }[])[0]?.company_name || "").replace(/[<>"]/g, "").trim() || "UNEX Gıda" : "UNEX Gıda";
    const konu = musteriDurumKonusu(m, tarih, sirketAdi);
    const musteriler = durumlar.map((x) => x.musteri);

    if (govde.deneme === true) {
      return json({ ok: true, deneme: true, tarih, sonuclar: [{ konu, html: musteriDurumHtml(m, tarih, sirketAdi), musteriler, musteri: m.musteri }] });
    }
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
    const ayar = await raporAyari(SUPABASE_URL, basliklar, sirket, "musteri_durum", { canli: false, alicilar: [] });
    const mRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${sirketAdi} Export <bildirim@ihracatasistanim.com>`, to: TEST_ALICISI, subject: `[TEST] ${konu}`,
        html: musteriDurumHtml(m, tarih, sirketAdi, { alici: TEST_ALICISI.join(", ") }),
        ...(ayar.cc.length ? { reply_to: ayar.cc } : {}),
      }),
    });
    if (!mRes.ok) throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${(await mRes.text()).slice(0, 300)}`);
    return json({ ok: true, test: true, tarih, sonuclar: [{ gonderildi: true, konu, musteri: m.musteri, alici: TEST_ALICISI }] });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("musteri-durum-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
