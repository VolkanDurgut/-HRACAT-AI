/**
 * 23.11.2026 RAPOR ONIZLE / TEST MAILI KOPRUSU (Ayarlar > Rapor Alicilari).
 * Sorun: sayfa edge fonksiyonunu TARAYICIDAN cagiriyordu; siparis-rapor / navlun-tablosu / musteri-durum-rapor CORS on
 * kontrolunu (OPTIONS) tanimiyor -> "OPTIONS 403" (zamanlanmis saat disi), tarayici asil istegi hic gondermiyordu
 * (kullanici: "Test mail gonderirken hata veriyor"). Cozum: istek ayni kokenden bu sunucu yoluna gelir, buradan edge'e
 * SUNUCUDAN iletilir (CORS yok). Canli edge fonksiyonlarina dokunulmaz.
 * Guvenlik: yalniz izinli edge'ler; kullanicinin KENDI oturum token'i iletilir (yetki kontrolu edge'de: admin / super admin,
 * kendi sirketi); govde yalniz {deneme | test | musteri}; mail her zaman edge'in sabit test adresine gider.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const IZINLI = new Set(["siparis-rapor", "navlun-tablosu", "musteri-durum-rapor", "siparissiz-musteri-rapor"]);

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, hata: "Sunucu ayarı eksik (Supabase adresi)." }, { status: 500 });
  const yetki = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/.test(yetki)) return NextResponse.json({ ok: false, hata: "Oturum bulunamadı. Lütfen yeniden giriş yapın." }, { status: 401 });

  const istek = (await req.json().catch(() => null)) as { edge?: unknown; govde?: unknown } | null;
  const edge = typeof istek?.edge === "string" ? istek.edge : "";
  if (!IZINLI.has(edge)) return NextResponse.json({ ok: false, hata: "Bu rapor buradan çağrılamaz." }, { status: 400 });
  const g = (istek?.govde && typeof istek.govde === "object" ? istek.govde : {}) as Record<string, unknown>;
  const govde: Record<string, unknown> = {};
  if (g.deneme === true) govde.deneme = true;
  else if (g.test === true) govde.test = true;
  else return NextResponse.json({ ok: false, hata: "Yalnız önizleme ya da test maili istenebilir." }, { status: 400 });
  if (typeof g.musteri === "string" && g.musteri.length <= 200) govde.musteri = g.musteri;

  try {
    const res = await fetch(`${url}/functions/v1/${edge}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: yetki },
      body: JSON.stringify(govde),
      cache: "no-store",
    });
    const metin = await res.text();
    let veri: unknown;
    try { veri = JSON.parse(metin); } catch { veri = { ok: false, hata: `Rapor servisi beklenmeyen yanıt verdi (HTTP ${res.status}).` }; }
    return NextResponse.json(veri, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false, hata: `Rapor servisine ulaşılamadı: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
