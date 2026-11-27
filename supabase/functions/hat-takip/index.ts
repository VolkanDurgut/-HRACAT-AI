import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { hatOzeti, olayNormalle, type HatOlayi } from "../_shared/hat-takip.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ hata: "Yalniz POST." }, 405);
  if (!(await anahtarGecerli(req.headers.get("x-cron-anahtar") || ""))) return json({ hata: "Yetkisiz." }, 401);

  let g: Record<string, unknown> = {};
  try { g = await req.json(); } catch { /* bos */ }
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
      ornek: (liste ?? []).slice(0, 5).map((p) => {
        const kalkis = (p.placeOfReceipt ?? {}) as Record<string, unknown>;
        const varis = (p.placeOfDelivery ?? {}) as Record<string, unknown>;
        const bacaklar = Array.isArray(p.legs) ? (p.legs as Record<string, unknown>[]) : [];
        const ilk = (bacaklar[0]?.transport ?? {}) as Record<string, unknown>;
        return {
          kalkis: s(kalkis.dateTime), varis: s(varis.dateTime), transit_gun: p.transitTime ?? null,
          aktarma: Math.max(0, bacaklar.filter((b) => s((b as Record<string, unknown>).modeOfTransport) === "VESSEL").length - 1),
          ilk_gemi: s((ilk.vessel as Record<string, unknown> | undefined)?.vesselName ?? ilk.vesselName),
          cutoff: Array.isArray(p.cutOffTimes) ? (p.cutOffTimes as Record<string, unknown>[]).map((c) => `${s(c.cutOffDateTimeCode)} ${s(c.cutOffDateTime)}`) : null,
        };
      }),
      hata: liste ? null : r.govde,
    };
  }
  return json(sonuc);
});
