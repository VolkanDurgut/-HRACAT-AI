import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// HAT TAKIP (hat-takip) - 27.11.2026 · ASAMA 0: BAGLANTI DENEMESI (salt okuma)
// ============================================================================
// Kullanici: Hapag-Lloyd API portali (api-portal.hlag.com) - "bizim sistemimize nasil entegre saglayabiliriz".
// Uygulama UNEX-AI (Client Credentials), abonelikler: Track and Trace v2 (Tryout: 100/gun, 1/dk),
// Commercial Schedule v3 (Tryout: 50/saat, 1/sn).
// Bu surum YALNIZ deneme yapar: Hapag'a GET atar, ozet dondurur. Veritabanina YAZMAZ, mail GONDERMEZ.
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
