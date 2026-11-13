import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { AcenteTablosu } from "../_shared/navlun-oku.ts";
import { bizdenMi } from "../_shared/navlun-oku.ts";
import { acenteOgren, mesajIsle, type NavlunGirdi } from "../_shared/navlun-isle.ts";
import { alintiKimligi, alintiMesajlari, govdeImzasi } from "../_shared/navlun-alinti.ts";

// ============================================================================
// NAVLUN BILDIRIMI (navlun-bildirimi) - 10.11.2026
// ============================================================================
// Arsiv Gmail'deki Apps Script (docs/apps-script/navlun.gs) konusu "NAVLUN" (12.11.2026: ya da "REZERVASYON TALEBI") olan mailleri gonderir:
//   {"islem": "kaydet", "mesajlar": [{mesaj_id, gonderen, konu, govde, tarih, ek_metin?, ek_kaynak?, alinti?}]}
//   + baslik x-pazar-anahtar = secret PAZAR_GELEN_ANAHTAR (Pazar gelen cevap ile ayni betik projesi).
//   {"islem": "durum"} + anahtar: son kayit / hata kuyrugu sayilari (salt okunur saglik kontrolu).
//   {"islem": "yeniden_isle", "sayfa": n} + anahtar (11.11.2026): saklanan ham metinden (navlun_mesajlari.govde / ek_metin)
//   50'ser mesaj yeniden okunur; okuyucu gelistikce betigi yeniden calistirmak gerekmez.
// Okuma tamamen kural tabanli (_shared/navlun-oku.ts), yapay zeka yok. Yazma navlun_kaydet RPC (idempotent).
// Durum: fiyat / hedef / kabul cikti -> okundu; fiyat ekte ama okunamadi ya da belirsiz -> okunamadi
//   (sayfadaki hata kuyrugu = tek mudahale alani); fiyatsiz acente yazismasi -> bilgi.
// 13.11.2026 ALINTIDAN KURTARMA: betik ayrica "alinti" (mailin tam metni) gonderir. Alintidaki acente teklifleri
//   (_shared/navlun-alinti.ts) kendi gonderen + tarihiyle "alinti:<ozet>" kimligiyle kaydedilir; ayni gonderenden +-4 saat
//   icinde ayni metinle dogrudan gelmis asli varsa ATLANIR (cift sayim yok). Arsive hic ulasmamis teklif boylece kaybolmaz.
// 13.11.2026 FREE TIME / TRANSIT TAMAMLAMA: fiyatsiz acente cevabi ("14 gun free time mevcut, tt 44 gun") ayni acentenin
//   ayni limana son 7 gundeki teklifinin BOS free time / transit alanini doldurur (dolu alana dokunmaz).
// Acente alan adlari repoda degil, navlun_acenteler tablosunda. Tabloda olmayan bir alan adi "NAVLUN TALEBI"
//   konulu mailde acikca teklif verirse otomatik eklenir (yanit: ogrenilen).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANAHTAR = (Deno.env.get("PAZAR_GELEN_ANAHTAR") || "").trim();
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pazar-anahtar",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

function anahtarDogru(gelen: string): boolean {
  if (ANAHTAR.length < 24 || gelen.length !== ANAHTAR.length) return false;
  let fark = 0;
  for (let i = 0; i < gelen.length; i++) fark |= gelen.charCodeAt(i) ^ ANAHTAR.charCodeAt(i);
  return fark === 0;
}

const kirp = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status})`);
  return (await res.json()) as T[];
}

async function rpc<T>(ad: string, govde: unknown): Promise<{ ok: boolean; veri: T | null; hata: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify(govde),
  });
  const metin = await res.text();
  if (!res.ok) {
    let hata = metin.slice(0, 200);
    try { hata = (JSON.parse(metin) as { message?: string }).message || hata; } catch { /* metin */ }
    return { ok: false, veri: null, hata };
  }
  return { ok: true, veri: (metin ? JSON.parse(metin) : null) as T, hata: "" };
}

/** Yeni acente alan adi (varsa dokunmaz). */
async function acenteEkle(sirket: string, alan: string, ad: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/navlun_acenteler?on_conflict=company_id,alan_adi`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([{ company_id: sirket, alan_adi: alan, ad }]),
  });
  if (!res.ok) console.error("navlun acente eklenemedi", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

type Kayit = NonNullable<ReturnType<typeof mesajIsle>>;
const SAAT = 3600_000;

/** Alintidaki acente teklifleri (dogrudan gelmis asli olmayanlar). */
async function alintidanKurtar(sirket: string, ust: NavlunGirdi, alinti: string, acenteler: AcenteTablosu, toplu: NavlunGirdi[], gorulen: Set<string>): Promise<Kayit[]> {
  const sonuc: Kayit[] = [];
  const ustZaman = Date.parse(ust.tarih);
  for (const a of alintiMesajlari(alinti)) {
    if (bizdenMi(a.gonderen)) continue;                       // yalniz acente teklifleri (bizim hedef / kabul dogrudan okunur)
    const t = Date.parse(a.tarih);
    if (!Number.isFinite(t) || t >= ustZaman) continue;
    const konu = a.konu && /navlun|rezervasyon\s*taleb/i.test(a.konu) ? a.konu : ust.konu;
    const g: NavlunGirdi = { mesaj_id: alintiKimligi(a), gonderen: a.gonderen, konu, govde: a.govde.slice(0, 8000), tarih: new Date(t).toISOString(), ek_metin: "", ek_kaynak: "" };
    if (gorulen.has(g.mesaj_id)) continue;
    const k = mesajIsle(g, acenteler);
    if (!k || k.durum !== "okundu") continue;                 // fiyatsiz / anlamsiz alinti kaydedilmez
    const imza = govdeImzasi(a.govde);
    // Ayni toplu gonderimde asli da varsa
    if (toplu.some((x) => x.gonderen === g.gonderen && Math.abs(Date.parse(x.tarih) - t) <= 4 * SAAT && govdeImzasi(x.govde) === imza)) continue;
    // Daha once dogrudan kaydedilmis asli
    const bas = new Date(t - 4 * SAAT).toISOString(), bit = new Date(t + 4 * SAAT).toISOString();
    const var_ = await oku<{ mesaj_id: string; govde: string | null }>(
      `navlun_mesajlari?select=mesaj_id,govde&company_id=eq.${sirket}&gonderen=eq.${encodeURIComponent(g.gonderen)}&tarih=gte.${encodeURIComponent(bas)}&tarih=lte.${encodeURIComponent(bit)}&mesaj_id=not.like.alinti:*&limit=50`);
    if (var_.some((x) => govdeImzasi(x.govde || "") === imza)) continue;
    gorulen.add(g.mesaj_id);
    sonuc.push({ ...k, ozet: `Alıntıdan kurtarıldı: ${ust.tarih.slice(0, 10)} tarihli "${ust.konu.slice(0, 120)}" yazışmasının içinde (asıl mail arşive ulaşmamış).` });
  }
  return sonuc;
}

/** Fiyatsiz acente cevabindaki free time / transit: ayni acente + liman, son 7 gundeki teklifin BOS alanlarina. */
async function bilgiTamamla(sirket: string, kayitlar: Kayit[]): Promise<number> {
  let n = 0;
  for (const k of kayitlar) {
    if (k.durum !== "bilgi" || !k.acente || !k.liman_anahtar) continue;
    const ft = k.ek_bilgi.free_time_gun, tt = k.ek_bilgi.transit_gun;
    const alanlar: [string, unknown][] = [];
    if (ft !== null && ft > 0 && ft <= 60) alanlar.push(["free_time_gun", ft]);
    if (tt && /^\d{1,3}(-\d{1,3})?$/.test(tt)) alanlar.push(["transit_gun", tt]);
    const t = Date.parse(k.tarih);
    if (!alanlar.length || !Number.isFinite(t)) continue;
    const bas = new Date(t - 7 * 24 * SAAT).toISOString(), bit = new Date(t).toISOString();
    for (const [alan, deger] of alanlar) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/navlun_teklifleri?company_id=eq.${sirket}&acente=eq.${encodeURIComponent(k.acente)}&liman_anahtar=eq.${encodeURIComponent(k.liman_anahtar)}` +
        `&tur=in.(teklif,karsi_teklif)&tarih=gte.${encodeURIComponent(bas)}&tarih=lte.${encodeURIComponent(bit)}&${alan}=is.null`,
        { method: "PATCH", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ [alan]: deger }) });
      if (res.ok) n += ((await res.json()) as unknown[]).length; else console.error("navlun bilgi tamamlanamadi", res.status, (await res.text()).slice(0, 200));
    }
  }
  return n;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Yalnız POST." }, 405);
  try {
    if (!ANAHTAR) return json({ hata: "Navlun bildirimi kapalı (PAZAR_GELEN_ANAHTAR yok)." }, 503);
    if (!anahtarDogru(req.headers.get("x-pazar-anahtar") || "")) return json({ hata: "Yetkisiz." }, 401);
    const govde = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const tum = await oku<{ company_id: string; alan_adi: string; ad: string; aktif: boolean }>("navlun_acenteler?select=company_id,alan_adi,ad,aktif");
    const satirlar = tum.filter((s) => s.aktif);
    const pasif = new Set(tum.filter((s) => !s.aktif).map((s) => s.alan_adi.toLowerCase()));   // elle kapatilan alan adi yeniden ogrenilmez
    const sirketler = Array.from(new Set(satirlar.map((s) => s.company_id)));
    if (sirketler.length !== 1) return json({ hata: "Acente tablosu tek şirkete ait olmalı." }, 500);
    const sirket = sirketler[0];

    if (govde.islem === "durum") {
      const say = async (k: string) => (await oku<{ id: string }>(`navlun_mesajlari?select=id&company_id=eq.${sirket}&durum=eq.${k}&limit=1000`)).length;
      const son = await oku<{ tarih: string }>(`navlun_mesajlari?select=tarih&company_id=eq.${sirket}&order=tarih.desc&limit=1`);
      return json({ acente: satirlar.length, okundu: await say("okundu"), okunamadi: await say("okunamadi"), bilgi: await say("bilgi"), son_mesaj: son[0]?.tarih ?? null });
    }

    const acenteler: AcenteTablosu = Object.fromEntries(satirlar.map((s) => [s.alan_adi.toLowerCase(), s.ad]));

    // 11.11.2026: saklanan ham metinden yeniden okuma (okuyucu gelistikce betigi yeniden calistirmadan). Sayfa basina 50.
    if (govde.islem === "yeniden_isle") {
      const sayfa = Math.max(0, Math.floor(Number(govde.sayfa) || 0));
      const kayitli = await oku<{ mesaj_id: string; gonderen: string | null; konu: string | null; govde: string | null; tarih: string; ek_metin: string | null; ek_kaynak: string | null }>(
        `navlun_mesajlari?select=mesaj_id,gonderen,konu,govde,tarih,ek_metin,ek_kaynak&company_id=eq.${sirket}&govde=not.is.null&order=tarih,id&limit=50&offset=${sayfa * 50}`);
      const yeniden = [];
      for (const r of kayitli) {
        const k = mesajIsle({
          mesaj_id: r.mesaj_id, gonderen: (r.gonderen || "").toLowerCase(), konu: r.konu || "", govde: r.govde || "",
          tarih: r.tarih, ek_metin: r.ek_metin || "", ek_kaynak: r.ek_kaynak || "",
        }, acenteler);
        if (k) yeniden.push(k);
      }
      if (!yeniden.length) return json({ islenen: 0, sayfa, devam: kayitli.length === 50 });
      const s = await rpc<Record<string, number>>("navlun_kaydet", { p_company: sirket, p_mesajlar: yeniden });
      if (!s.ok) return json({ hata: s.hata || "Kaydedilemedi." }, 500);
      const tamamlanan = await bilgiTamamla(sirket, yeniden).catch((e) => { console.error("navlun bilgi tamamlama", e); return 0; });
      return json({ ...(s.veri || {}), islenen: yeniden.length, tamamlanan, sayfa, devam: kayitli.length === 50 });
    }

    if (govde.islem !== "kaydet") return json({ hata: "Bilinmeyen işlem." }, 400);
    const liste = Array.isArray(govde.mesajlar) ? govde.mesajlar.slice(0, 100) : [];
    const kayitlar: Kayit[] = [];
    const ogrenilen: string[] = [];
    const girdiler: { g: NavlunGirdi; alinti: string }[] = [];
    let atlanan = 0;
    for (const m of liste) {
      if (!m || typeof m !== "object") { atlanan++; continue; }
      const r = m as Record<string, unknown>;
      const g: NavlunGirdi = {
        mesaj_id: kirp(r.mesaj_id, 300).trim(), gonderen: kirp(r.gonderen, 200).trim().toLowerCase(), konu: kirp(r.konu, 300),
        govde: kirp(r.govde, 8000), tarih: kirp(r.tarih, 40), ek_metin: kirp(r.ek_metin, 12000), ek_kaynak: kirp(r.ek_kaynak, 10),
      };
      // 12.11.2026: "<LIMAN> // 8*20 DC // REZERVASYON TALEBI" (operasyonun "Navlun rakami X olmak uzere" booking istegi = satin alinan navlun)
      if (!g.mesaj_id || !g.gonderen || !/navlun|rezervasyon\s*taleb/i.test(g.konu) || Number.isNaN(Date.parse(g.tarih))) { atlanan++; continue; }
      let k = mesajIsle(g, acenteler);
      if (!k) {
        // Tabloda olmayan alan adi navlun teklifi veriyorsa acente olarak ogrenilir (elle tablo bakimi gerekmez)
        const o = acenteOgren(g, acenteler);
        if (o && !pasif.has(o.alan) && (await acenteEkle(sirket, o.alan, o.ad))) { acenteler[o.alan] = o.ad; ogrenilen.push(o.ad); k = o.kayit; }
      }
      girdiler.push({ g, alinti: kirp(r.alinti, 30000) });
      if (!k) { atlanan++; continue; }
      kayitlar.push(k);
    }
    // Alintidan kurtarma (dogrudan gelen mesajlar toplandiktan sonra: ayni toplu gonderimdeki asli ile eslesme)
    const gorulen = new Set<string>();
    const kurtarilan: Kayit[] = [];
    for (const { g, alinti } of girdiler) {
      if (!alinti) continue;
      // Kurtarma hatasi asil kaydi asla durdurmaz (betik imleci ilerlemezse tum akis tikanir)
      try { kurtarilan.push(...(await alintidanKurtar(sirket, g, alinti, acenteler, girdiler.map((x) => x.g), gorulen))); }
      catch (e) { console.error("navlun alinti kurtarilamadi", g.mesaj_id, e instanceof Error ? e.message : e); }
    }
    const hepsi = [...kayitlar, ...kurtarilan];
    if (!hepsi.length) return json({ yeni: 0, guncellenen: 0, atlanan, olay: 0, ogrenilen, kurtarilan: 0 });
    const s = await rpc<Record<string, number>>("navlun_kaydet", { p_company: sirket, p_mesajlar: hepsi });
    if (!s.ok) return json({ hata: s.hata || "Kaydedilemedi." }, 500);
    const tamamlanan = await bilgiTamamla(sirket, kayitlar).catch((e) => { console.error("navlun bilgi tamamlama", e); return 0; });
    const v = s.veri || {};
    return json({ ...v, atlanan: (v.atlanan || 0) + atlanan, okunamadi: kayitlar.filter((k) => k.durum === "okunamadi").length, ogrenilen, kurtarilan: kurtarilan.length, tamamlanan });
  } catch (e) {
    console.error("navlun-bildirimi", e);
    return json({ hata: "Beklenmeyen hata." }, 500);
  }
});
