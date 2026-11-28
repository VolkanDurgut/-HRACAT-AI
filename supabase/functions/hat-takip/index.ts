import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { hatOzeti, olayNormalle, type HatOlayi } from "../_shared/hat-takip.ts";
import { hapagHataMetni, seferleriNormalle, type Sefer } from "../_shared/hat-sefer.ts";

// ============================================================================
// HAT TAKIP (hat-takip) - 27.11.2026 · ASAMA 0 (deneme) + ASAMA 1 (yenile: deneme modu, ayri tablolar)
// ============================================================================
// Kullanici: Hapag-Lloyd API portali (api-portal.hlag.com) - "bizim sistemimize nasil entegre saglayabiliriz".
// Uygulama UNEX-AI (Client Credentials), abonelikler: Track and Trace v2 (Tryout: 100/gun, 1/dk),
// Commercial Schedule v3 (Tryout: 50/saat, 1/sn).
// {"islem":"deneme"} : Hapag'a GET atar, ozet dondurur. Veritabanina YAZMAZ.
// {"islem":"yenile"} : (pg_cron 'hat-takip-yenile', 15 dk) hat_takip_sira() ile en eski sorgulanan Hapag booking'ini alir,
//   T&T olaylarini ceker, hat_takip_kaydet() ile YALNIZ hat_takip_kayitlari / hat_olaylari / hat_takip_cagrilari'na yazar.
//   Mevcut tablolara (rezervasyonlar, dosyalar) yazmaz. Mail GONDERMEZ (kullanici 27.11.2026: mail once yalniz test adresi).
//   Kota: Tryout T&T 100 / gun, 1 / dk -> varsayilan cagri basina 1 booking, gunluk 95 (secret HAT_TAKIP_ADET,
//   HAT_TAKIP_GUNLUK_KOTA ile artirilir; Basic plan 10 / dk). Kapatma: secret HAT_TAKIP_KAPALI = "evet".
// Anahtarlar: Supabase secret HAPAG_CLIENT_ID / HAPAG_CLIENT_SECRET (repoya / loga yazilmaz).
// Govde: {"islem":"deneme","booking":"96615245","pol":"TRGEM","pod":"KEMBA"}.
// Yetki: "x-cron-anahtar" basligi = Vault hat_takip_anahtari (migration 20261127140000), RPC ile dogrulanir
// (anon anahtarla cagrilip Hapag kotasi tuketilemesin).
// {"islem":"sefer_ara","pol":"TRIST","pod":"GHTEM","hafta":4,"yenile":false} (28.11.2026, Asama 4): Hat Takip > Sefer Ara.
//   Yetki: oturum acmis kullanici + "etd_eta" sayfa yetkisi (kullanicinin kendi JWT'siyle ic_sayfa_yetkisi) ya da cron anahtari.
//   Onbellek hat_sefer_aramalari (migration 20261128100000): ayni rota + gun 6 saat icinde Hapag'a tekrar sorulmaz
//   ("yenile" en erken 15 dk sonra). Kota: Commercial Schedules Tryout 50 / saat (45'te durur), 1 / sn (429'da 1 kez
//   tekrar). Ayristirma TEK YER _shared/hat-sefer.ts. Yalniz hat_sefer_aramalari + hat_takip_cagrilari'na yazar.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HAPAG_ID = (Deno.env.get("HAPAG_CLIENT_ID") || "").trim();
const HAPAG_SECRET = (Deno.env.get("HAPAG_CLIENT_SECRET") || "").trim();
const HAPAG = "https://api.hlag.com/hlag/external";
const KAPALI = (Deno.env.get("HAT_TAKIP_KAPALI") || "").trim().toLowerCase() === "evet";
const ADET = Math.min(10, Math.max(1, Number(Deno.env.get("HAT_TAKIP_ADET") || "1") || 1));
const GUNLUK_KOTA = Math.min(5000, Math.max(1, Number(Deno.env.get("HAT_TAKIP_GUNLUK_KOTA") || "95") || 95));
const servis = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const CS_SAATLIK = 45; // Tryout 50 / saat - 5 pay
const ONBELLEK_SAAT = 6;
const YENILE_EN_ERKEN_DK = 15;

async function rpc<T>(ad: string, govde: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, { method: "POST", headers: servis, body: JSON.stringify(govde) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${ad}: ${r.status} ${t.slice(0, 300)}`);
  return (t ? JSON.parse(t) : null) as T;
}

const bekle = (ms: number) => new Promise((c) => setTimeout(c, ms));

/** Asama 1: siradaki booking(ler)i yenile. Yalniz hat_* tablolarina yazar. */
async function yenile(): Promise<Record<string, unknown>> {
  if (KAPALI) return { kapali: true };
  const sira = await rpc<{ takip_id: string; booking_no: string; kota_kalan: number }[]>("hat_takip_sira", { p_adet: ADET, p_gunluk_kota: GUNLUK_KOTA });
  const sonuc: Record<string, unknown>[] = [];
  for (let i = 0; i < sira.length; i++) {
    if (i > 0) await bekle(6500); // Basic plan 10 / dk
    const { takip_id, booking_no } = sira[i];
    let durum = 0, sure = 0, hata: string | null = null;
    let olaylar: HatOlayi[] = [];
    try {
      const r = await hapagGet(`/v2/events/?carrierBookingReference=${encodeURIComponent(booking_no)}`);
      durum = r.durum; sure = r.sure_ms;
      if (Array.isArray(r.govde)) olaylar = (r.govde as Record<string, unknown>[]).map(olayNormalle).filter((o): o is HatOlayi => !!o);
      else hata = `Hapag ${r.durum}: ${typeof r.govde === "string" ? r.govde : JSON.stringify(r.govde)}`.slice(0, 500);
    } catch (e) {
      hata = `Baglanti: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    }
    const ozet = hatOzeti(olaylar);
    const kayitli = await rpc<number>("hat_takip_kaydet", {
      p_takip: takip_id, p_durum_kodu: durum, p_sure_ms: sure,
      p_olaylar: hata ? [] : olaylar.map((o) => ({ ...o })), p_ozet: ozet, p_hata: hata,
    });
    sonuc.push({ booking_no, durum, olay: olaylar.length, kayitli, eta: ozet.eta, eta_sinif: ozet.eta_sinif, pod: ozet.pod, hata });
  }
  return { islenen: sonuc.length, kota_kalan: sira[0]?.kota_kalan ?? 0, sonuc };
}

const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });

async function anahtarGecerli(anahtar: string): Promise<boolean> {
  if (!anahtar) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hat_takip_anahtari_dogrula`, {
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

const KOD = /^[A-Z]{2}[A-Z0-9]{3}$/;
const BOOKING = /^[A-Z0-9-]{4,20}$/;

async function hapagGet(yol: string): Promise<{ durum: number; govde: unknown; sure_ms: number }> {
  const t0 = Date.now();
  const r = await fetch(`${HAPAG}${yol}`, {
    headers: { Accept: "application/json", "X-IBM-Client-Id": HAPAG_ID, "X-IBM-Client-Secret": HAPAG_SECRET },
  });
  const metin = await r.text();
  let govde: unknown = metin.slice(0, 600);
  try { govde = JSON.parse(metin); } catch { /* metin kalir */ }
  return { durum: r.status, govde, sure_ms: Date.now() - t0 };
}

type Olay = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? null : String(v));

function olayOzeti(o: Olay) {
  const tc = (o.transportCall ?? {}) as Record<string, unknown>;
  const ves = (tc.vessel ?? {}) as Record<string, unknown>;
  const yer = (o.eventLocation ?? tc.location ?? {}) as Record<string, unknown>;
  return {
    tur: s(o.eventType),
    kod: s(o.transportEventTypeCode ?? o.equipmentEventTypeCode ?? o.shipmentEventTypeCode),
    sinif: s(o.eventClassifierCode),
    zaman: s(o.eventDateTime),
    konteyner: s(o.equipmentReference),
    yer: s(yer.UNLocationCode ?? tc.UNLocationCode ?? yer.locationName),
    gemi: s(ves.vesselName),
    sefer: s(tc.exportVoyageNumber),
  };
}

// ---------------------------------------------------------------------------
// Asama 4: Sefer Ara
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonC = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json", ...CORS } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Kullanicinin KENDI yetkisiyle: ic_sayfa_yetkisi('etd_eta') + auth_company_id() (RLS ile ayni kural). */
async function kullaniciYetkisi(req: Request): Promise<{ id: string; sirket: string } | null> {
  const baslik = req.headers.get("Authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null;
  if (!token || jwtRolu(token) !== "authenticated" || !ANON_KEY) return null;
  const kb = { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const kRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: kb });
    if (!kRes.ok) { await kRes.body?.cancel(); return null; }
    const k = (await kRes.json()) as { id?: string };
    if (!k.id || !UUID.test(k.id)) return null;
    const [y, c] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/ic_sayfa_yetkisi`, { method: "POST", headers: kb, body: JSON.stringify({ p_anahtar: "etd_eta" }) }),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/auth_company_id`, { method: "POST", headers: kb, body: "{}" }),
    ]);
    if (!y.ok || !c.ok) { await y.body?.cancel(); await c.body?.cancel(); return null; }
    const yetki = await y.json();
    const sirket = await c.json();
    return yetki === true && typeof sirket === "string" && UUID.test(sirket) ? { id: k.id, sirket } : null;
  } catch {
    return null;
  }
}

async function rest<T>(yol: string, secenek: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { ...secenek, headers: { ...servis, ...(secenek.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${yol.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  return (t ? JSON.parse(t) : null) as T;
}

/** Istanbul takvim gunu (YYYY-MM-DD), gun eklenmis. */
const istGun = (ekGun = 0) => new Date(Date.now() + 3 * 3600_000 + ekGun * 864e5).toISOString().slice(0, 10);

type OnbellekSatiri = { sorgu_zamani: string; rotalar: Sefer[]; bit_gun: string; durum_kodu: number | null };

async function seferAra(g: Record<string, unknown>, sirket: string, kullanici: string | null): Promise<Record<string, unknown>> {
  const pol = String(g.pol || "").trim().toUpperCase();
  const pod = String(g.pod || "").trim().toUpperCase();
  if (!KOD.test(pol) || !KOD.test(pod)) return { hata: "Liman kodu 5 karakter olmalı (örnek: TRIST, GHTEM)." };
  if (pol === pod) return { hata: "Çıkış ve varış limanı aynı olamaz." };
  const hafta = Math.min(8, Math.max(1, Math.round(Number(g.hafta) || 4)));
  const bas = istGun(0);
  const bit = istGun(hafta * 7);
  const yenileIstegi = g.yenile === true;

  // 1) Onbellek: ayni rota + gun, son 6 saat, basarili ve en az istenen aralik kadar
  const esik = new Date(Date.now() - ONBELLEK_SAAT * 3600_000).toISOString();
  const onceki = await rest<OnbellekSatiri[]>(
    `hat_sefer_aramalari?select=sorgu_zamani,rotalar,bit_gun,durum_kodu&company_id=eq.${sirket}&pol=eq.${pol}&pod=eq.${pod}` +
    `&bas_gun=eq.${bas}&durum_kodu=eq.200&bit_gun=gte.${bit}&sorgu_zamani=gte.${encodeURIComponent(esik)}&order=sorgu_zamani.desc&limit=1`);
  const ob = onceki[0];
  const obYasDk = ob ? (Date.now() - Date.parse(ob.sorgu_zamani)) / 60_000 : Infinity;
  const sinirla = (r: Sefer[]) => r.filter((x) => !x.kalkis || x.kalkis.slice(0, 10) <= bit);
  if (ob && (!yenileIstegi || obYasDk < YENILE_EN_ERKEN_DK)) {
    return { pol, pod, bas_gun: bas, bit_gun: bit, hafta, rotalar: sinirla(ob.rotalar || []), sorgu_zamani: ob.sorgu_zamani, onbellek: true,
      not: yenileIstegi ? `Son sorgu ${Math.floor(obYasDk)} dk önce; yenileme en erken ${YENILE_EN_ERKEN_DK} dk sonra.` : null };
  }
  if (KAPALI) return { hata: "Hat bağlantısı kapalı (HAT_TAKIP_KAPALI)." };
  if (!HAPAG_ID || !HAPAG_SECRET) return { hata: "Hapag-Lloyd anahtarları tanımlı değil." };

  // 2) Kota: son 1 saatte CS_SAATLIK; son cagridan 1,1 sn gecmemisse bekle
  const saatOnce = new Date(Date.now() - 3600_000).toISOString();
  const cagrilar = await rest<{ zaman: string }[]>(`hat_takip_cagrilari?select=zaman&api=eq.cs&zaman=gte.${encodeURIComponent(saatOnce)}&order=zaman.desc&limit=100`);
  if (cagrilar.length >= CS_SAATLIK) {
    return { hata: "Hapag-Lloyd saatlik sefer sorgusu sınırına ulaşıldı. Biraz sonra tekrar deneyin.", kota_kalan: 0 };
  }
  const sonCagri = cagrilar[0] ? Date.parse(cagrilar[0].zaman) : 0;
  if (Date.now() - sonCagri < 1100) await bekle(1100 - (Date.now() - sonCagri));

  // 3) Hapag (429'da 1 kez tekrar)
  const yol = `/v1/point-to-point-routes?placeOfReceipt=${pol}&placeOfDelivery=${pod}&departureStartDate=${bas}&departureEndDate=${bit}`;
  let r = await hapagGet(yol);
  await rest("hat_takip_cagrilari", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ api: "cs", durum_kodu: r.durum, sure_ms: r.sure_ms }) });
  if (r.durum === 429) {
    await bekle(1500);
    r = await hapagGet(yol);
    await rest("hat_takip_cagrilari", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ api: "cs", durum_kodu: r.durum, sure_ms: r.sure_ms }) });
  }
  const basarili = r.durum === 200 && Array.isArray(r.govde);
  const rotalar = basarili ? seferleriNormalle(r.govde) : [];
  const hata = basarili ? null : hapagHataMetni(r.durum, r.govde);
  const kayit = await rest<{ sorgu_zamani: string }[]>("hat_sefer_aramalari?select=sorgu_zamani", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ company_id: sirket, pol, pod, bas_gun: bas, bit_gun: bit, durum_kodu: r.durum, sure_ms: r.sure_ms,
      rota_sayisi: rotalar.length, rotalar, hata, sorgulayan: kullanici }),
  });
  return { pol, pod, bas_gun: bas, bit_gun: bit, hafta, rotalar, sorgu_zamani: kayit[0]?.sorgu_zamani ?? new Date().toISOString(),
    onbellek: false, hata, kota_kalan: Math.max(0, CS_SAATLIK - cagrilar.length - 1) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json({ hata: "Yalniz POST." }, 405);

  let g: Record<string, unknown> = {};
  try { g = await req.json(); } catch { /* bos */ }

  // Asama 4: Sefer Ara - tarayicidan (kullanici JWT + etd_eta) ya da cron anahtariyla (deneme; govdede sirket)
  if (g.islem === "sefer_ara") {
    const cron = await anahtarGecerli(req.headers.get("x-cron-anahtar") || "");
    const kullanici = cron ? null : await kullaniciYetkisi(req);
    const sirket = cron ? (UUID.test(String(g.sirket || "")) ? String(g.sirket) : null) : kullanici?.sirket ?? null;
    if (!sirket) return jsonC({ hata: "Bu işlem için ETD/ETA yetkisi gerekir." }, 401);
    try {
      return jsonC(await seferAra(g, sirket, kullanici?.id ?? null));
    } catch (e) {
      return jsonC({ hata: `Sefer programı alınamadı: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) }, 500);
    }
  }

  if (!(await anahtarGecerli(req.headers.get("x-cron-anahtar") || ""))) return json({ hata: "Yetkisiz." }, 401);
  if (g.islem === "yenile") {
    if (!HAPAG_ID || !HAPAG_SECRET) return json({ hata: "HAPAG_CLIENT_ID / HAPAG_CLIENT_SECRET tanimli degil." }, 200);
    try {
      return json(await yenile());
    } catch (e) {
      return json({ hata: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  if (g.islem !== "deneme") return json({ hata: "Bilinmeyen islem." }, 400);
  if (!HAPAG_ID || !HAPAG_SECRET) {
    return json({ hata: "HAPAG_CLIENT_ID / HAPAG_CLIENT_SECRET secret'lari tanimli degil.", id_var: !!HAPAG_ID, secret_var: !!HAPAG_SECRET }, 200);
  }

  const sonuc: Record<string, unknown> = { id_sonu: HAPAG_ID.slice(-4), secret_uzunluk: HAPAG_SECRET.length };

  const booking = String(g.booking || "").trim().toUpperCase();
  if (BOOKING.test(booking)) {
    const r = await hapagGet(`/v2/events/?carrierBookingReference=${encodeURIComponent(booking)}`);
    const liste = Array.isArray(r.govde) ? (r.govde as Olay[]) : null;
    const sayac: Record<string, number> = {};
    for (const o of liste ?? []) {
      const oz = olayOzeti(o);
      const k = `${oz.tur}/${oz.kod}/${oz.sinif}`;
      sayac[k] = (sayac[k] || 0) + 1;
    }
    const ozetler = (liste ?? []).map(olayOzeti);
    sonuc.takip = {
      booking, durum: r.durum, sure_ms: r.sure_ms, olay_sayisi: liste?.length ?? null,
      turler: sayac,
      konteynerler: Array.from(new Set(ozetler.map((o) => o.konteyner).filter(Boolean))),
      ornek: ozetler.filter((o) => o.tur === "TRANSPORT").slice(0, 8).concat(ozetler.filter((o) => o.tur !== "TRANSPORT").slice(0, 4)),
      hata: liste ? null : r.govde,
    };
  }

  const pol = String(g.pol || "").trim().toUpperCase();
  const pod = String(g.pod || "").trim().toUpperCase();
  if (KOD.test(pol) && KOD.test(pod)) {
    const bas = new Date().toISOString().slice(0, 10);
    const bit = new Date(Date.now() + 35 * 864e5).toISOString().slice(0, 10);
    const r = await hapagGet(`/v1/point-to-point-routes?placeOfReceipt=${pol}&placeOfDelivery=${pod}&departureStartDate=${bas}&departureEndDate=${bit}`);
    const liste = Array.isArray(r.govde) ? (r.govde as Record<string, unknown>[]) : null;
    sonuc.program = {
      pol, pod, durum: r.durum, sure_ms: r.sure_ms, rota_sayisi: liste?.length ?? null,
      // 28.11.2026: ortak ayristirici (gemi adi "vessel.name"; aktarma = gemi bacaklari arasi limanlar)
      ornek: seferleriNormalle(liste ?? []).slice(0, 5).map((x) => ({
        kalkis: x.kalkis, varis: x.varis, transit_gun: x.transit_gun, aktarma: x.aktarmalar.length,
        gemi: x.gemi, sefer: x.sefer, servis: x.servis_kodu, cutoff: x.cutoff,
      })),
      // 28.11.2026 Asama 4 hazirligi: ilk rotanin ham hali (bicim dogrulamasi; musteri verisi icermez)
      ham_ilk: g.ham === true ? JSON.stringify(liste?.[0] ?? null).slice(0, 6000) : undefined,
      hata: liste ? null : r.govde,
    };
  }
  return json(sonuc);
});
