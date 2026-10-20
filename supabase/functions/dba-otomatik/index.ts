import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getDocumentProxy } from "npm:unpdf@1.1.0";
import { dbaAlanlariniOku, dosyaAdindanBelgeNo, type DbaVerisi, type MetinParcasi } from "../_shared/dba-metin.ts";

// ============================================================================
// DBA OTOMATIK YUKLEME (dba-otomatik) - 20.10.2026
// ============================================================================
// Kantar bilgisayarindaki gorev (C:\UnexDBA\dba-ajan.ps1) Solas'in urettigi
// DBA PDF'ini buraya gonderir. Bu fonksiyon:
//   1) cihaz anahtarini dogrular (kisisel sifre degil; kantar_cihazlari, SHA-256 ozeti),
//   2) PDF'i METIN olarak okur ve siki dogrular (_shared/dba-metin.ts; yapay zeka YOK),
//   3) karari veritabanina birakir (dba_otomatik_degerlendir / dba_otomatik_uygula -
//      kurallar TEK YERDE, migration 20261020100000),
//   4) CANLI cihazda ve tam eslesmede PDF'i depoya yukler, konteyneri kilit altinda
//      gunceller; kosul bozulursa yukledigi PDF'i geri siler.
// DENEME MODUNDA (kantar_cihazlari.canli = false) depoya da konteynere de YAZMAZ.
//
// verify_jwt = false: cagiran bir kullanici degil, cihaz. Yetki x-cihaz-anahtari ile.
//
// Istek (POST):
//   x-cihaz-anahtari: unexdba_<64 hex>
//   x-islem: "belge" | "sinyal" | "dogrulama"
//   belge     : govde = PDF, x-dosya-adi = base64(UTF-8 dosya adi), x-ajan-surumu
//   sinyal    : govde yok (gorev her calistiginda "buradayim")
//   dogrulama : SALT OKUNUR - kayitli DBA PDF'lerini okuyup sistemdeki degerlerle
//               karsilastirir (okuyucunun gercek belgelerle sinanmasi); ?bas=0&adet=10
// Yanit: { ok, karar, mod, mesaj, tekrar_dk } - tekrar_dk: gorevin ayni belgeyi kac
// dakika sonra yeniden gondermesi gerektigi (null = bir daha gonderme).
// ============================================================================

const SURUM = "1.0.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KOVA = "konsimento-talimatlari";
const AZAMI_BOYUT = 5 * 1024 * 1024; // DBA'lar ~600 KB
const IMZALI_URL_SURESI = 60 * 60 * 24 * 365 * 10; // lib/supabase/storage.ts ile ayni (~10 yil)

const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

type Cihaz = { id: string; company_id: string; ad: string; kantar_no: string; kantar_vergi_no: string; canli: boolean };

function yanit(veri: unknown, durum = 200): Response {
  return new Response(JSON.stringify(veri), { status: durum, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

async function sha256Hex(metin: string): Promise<string> {
  const ozet = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return Array.from(new Uint8Array(ozet)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpc<T>(ad: string, govde: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const metin = await res.text();
  if (!res.ok) throw new Error(`${ad} hatası (HTTP ${res.status}): ${metin.slice(0, 300)}`);
  return (metin ? JSON.parse(metin) : null) as T;
}

async function cihazBul(anahtar: string | null): Promise<Cihaz | null> {
  if (!anahtar || !/^unexdba_[0-9a-f]{64}$/.test(anahtar)) return null;
  const ozet = await sha256Hex(anahtar);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kantar_cihazlari?anahtar_ozeti=eq.${ozet}&aktif=is.true&select=id,company_id,ad,kantar_no,kantar_vergi_no,canli&limit=1`,
    { headers: basliklar }
  );
  if (!res.ok) throw new Error(`Cihaz okunamadı (HTTP ${res.status})`);
  const satirlar = (await res.json()) as Cihaz[];
  return satirlar[0] || null;
}

/** PDF -> 1. sayfanin metin parcalari (x/y ile). Tek sayfali olmali. */
async function metinParcalari(pdf: Uint8Array): Promise<MetinParcasi[]> {
  // KOPYA verilir: pdf.js aldigi ArrayBuffer'i "detach" eder (aktarir); asil veri
  // sonra depoya yuklenecegi icin bozulmamali (yerel testte yakalandi, 20.10.2026).
  const belge = await getDocumentProxy(pdf.slice());
  try {
    if (belge.numPages !== 1) throw new Error(`Belge ${belge.numPages} sayfa; DBA tek sayfadır.`);
    const sayfa = await belge.getPage(1);
    const icerik = await sayfa.getTextContent();
    return (icerik.items as { str?: string; transform?: number[] }[])
      .filter((i) => typeof i.str === "string" && Array.isArray(i.transform))
      .map((i) => ({ metin: i.str as string, x: i.transform![4], y: i.transform![5] }));
  } finally {
    await belge.destroy().catch(() => {});
  }
}

async function oku(pdf: Uint8Array, belgeNo: string, cihaz: Cihaz): Promise<{ veri: DbaVerisi | null; hata: string | null }> {
  try {
    const s = dbaAlanlariniOku(await metinParcalari(pdf), { belgeNo, kantarNo: cihaz.kantar_no, kantarVergiNo: cihaz.kantar_vergi_no });
    return s.tamam ? { veri: s.veri, hata: null } : { veri: null, hata: s.hata };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { veri: null, hata: (m.startsWith("Belge ") ? m : `PDF açılamadı: ${m}`).slice(0, 300) };
  }
}

function dosyaAdiCoz(b64: string | null): string | null {
  if (!b64) return null;
  try {
    const ad = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))).trim();
    return ad && ad.length <= 255 && !/[\\/\u0000-\u001f]/.test(ad) ? ad : null;
  } catch {
    return null;
  }
}

async function depoyaYukle(yol: string, pdf: Uint8Array): Promise<string> {
  const yolUrl = yol.split("/").map(encodeURIComponent).join("/");
  const yukle = await fetch(`${SUPABASE_URL}/storage/v1/object/${KOVA}/${yolUrl}`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: pdf,
  });
  if (!yukle.ok) throw new Error(`PDF depoya yüklenemedi (HTTP ${yukle.status}): ${(await yukle.text()).slice(0, 200)}`);
  const imza = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${KOVA}/${yolUrl}`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: IMZALI_URL_SURESI }),
  });
  const imzaVeri = (await imza.json().catch(() => ({}))) as { signedURL?: string };
  if (!imza.ok || !imzaVeri.signedURL) {
    await depodanSil(yol);
    throw new Error(`PDF adresi oluşturulamadı (HTTP ${imza.status})`);
  }
  // supabase-js createSignedUrl ile ayni bicim: <url>/storage/v1/object/sign/...?token=...
  return `${SUPABASE_URL}/storage/v1${imzaVeri.signedURL}`;
}

async function depodanSil(yol: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${KOVA}`, {
      method: "DELETE",
      headers: { ...basliklar, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [yol] }),
    });
  } catch (e) {
    console.error("dba-otomatik: depodan silinemedi", yol, e);
  }
}

// ---------------------------------------------------------------- belge
async function belgeIsle(req: Request, cihaz: Cihaz): Promise<Response> {
  const dosyaAdi = dosyaAdiCoz(req.headers.get("x-dosya-adi"));
  if (!dosyaAdi) return yanit({ ok: false, hata: "Dosya adı eksik veya geçersiz." }, 400);
  const belgeNo = dosyaAdindanBelgeNo(dosyaAdi);
  if (!belgeNo) return yanit({ ok: false, hata: "Dosya adı Solas biçiminde değil (<12 hane>_...pdf)." }, 400);

  const pdf = new Uint8Array(await req.arrayBuffer());
  if (pdf.length === 0 || pdf.length > AZAMI_BOYUT) return yanit({ ok: false, hata: "Dosya boş veya çok büyük." }, 400);
  const pdfMi = pdf.length > 5 && String.fromCharCode(...pdf.slice(0, 5)) === "%PDF-";

  const { veri, hata } = pdfMi ? await oku(pdf, belgeNo, cihaz) : { veri: null, hata: "Dosya PDF değil." };

  const karar = await rpc<Record<string, unknown>>("dba_otomatik_degerlendir", {
    p_cihaz_id: cihaz.id,
    p_belge_no: belgeNo,
    p_dosya_adi: dosyaAdi,
    p_okunan: veri,
    p_okuma_hatasi: hata,
  });

  if (karar.karar !== "eslesti" || karar.mod !== "canli") {
    return yanit({ ok: true, karar: karar.karar, mod: karar.mod, mesaj: karar.mesaj, tekrar_dk: karar.tekrar_dk ?? null });
  }

  // CANLI + tam eslesme: once PDF depoya (elle yuklemeyle ayni yol), sonra kilitli yazim
  const yol = `dba/${karar.dosya_id}/${karar.konteyner_no}_${Date.now()}.pdf`;
  const url = await depoyaYukle(yol, pdf);
  let sonuc: Record<string, unknown>;
  try {
    sonuc = await rpc<Record<string, unknown>>("dba_otomatik_uygula", {
      p_cihaz_id: cihaz.id,
      p_konteyner_id: karar.konteyner_id,
      p_belge_no: belgeNo,
      p_dosya_adi: dosyaAdi,
      p_dosya_url: url,
      p_okunan: veri,
    });
  } catch (e) {
    await depodanSil(yol); // kayda baglanamadi: sahipsiz PDF kalmasin
    throw e;
  }
  if (sonuc.uygulandi !== true) await depodanSil(yol);
  return yanit({ ok: true, karar: sonuc.karar, mod: "canli", mesaj: sonuc.mesaj, tekrar_dk: sonuc.tekrar_dk ?? null });
}

// ---------------------------------------------------------------- dogrulama (salt okunur)
type KayitliDba = {
  dba_belge_no: string | null;
  konteyner_no: string;
  plaka: string | null;
  tare_kg: number | null;
  vgm_kg: number | null;
  dba_dosya_url: string;
  dba_kontrol_sonucu: Record<string, unknown> | null;
};

async function dogrula(req: Request, cihaz: Cihaz): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const bas = Math.max(0, Number(q.get("bas")) || 0);
  const adet = Math.min(10, Math.max(1, Number(q.get("adet")) || 10));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/konteynerler?company_id=eq.${cihaz.company_id}&dba_dosya_url=not.is.null` +
      `&select=dba_belge_no,konteyner_no,plaka,tare_kg,vgm_kg,dba_dosya_url,dba_kontrol_sonucu&order=dba_yukleme_tarihi.asc,id.asc&offset=${bas}&limit=${adet}`,
    { headers: { ...basliklar, Prefer: "count=exact" } }
  );
  if (!res.ok) throw new Error(`Konteynerler okunamadı (HTTP ${res.status})`);
  const toplam = Number((res.headers.get("content-range") || "").split("/")[1]) || null;
  const kayitlar = (await res.json()) as KayitliDba[];
  const sonuclar: unknown[] = [];
  for (const k of kayitlar) {
    const m = k.dba_dosya_url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
    if (!m || !k.dba_belge_no) {
      sonuclar.push({ belge: k.dba_belge_no, konteyner: k.konteyner_no, sonuc: "atlandi", neden: "belge no / adres yok" });
      continue;
    }
    const indir = await fetch(`${SUPABASE_URL}/storage/v1/object/${m[1]}/${m[2]}`, { headers: basliklar });
    if (!indir.ok) {
      sonuclar.push({ belge: k.dba_belge_no, konteyner: k.konteyner_no, sonuc: "indirilemedi", neden: `HTTP ${indir.status}` });
      continue;
    }
    const { veri, hata } = await oku(new Uint8Array(await indir.arrayBuffer()), k.dba_belge_no, cihaz);
    if (!veri) {
      sonuclar.push({ belge: k.dba_belge_no, konteyner: k.konteyner_no, sonuc: "okunamadi", neden: hata });
      continue;
    }
    const ai = k.dba_kontrol_sonucu || {};
    const farklar: Record<string, [unknown, unknown]> = {};
    const karsilastir = (alan: string, sistem: unknown, pdf: unknown) => {
      if (String(sistem ?? "").replace(/\s/g, "").toUpperCase() !== String(pdf ?? "").replace(/\s/g, "").toUpperCase()) farklar[alan] = [sistem, pdf];
    };
    karsilastir("konteyner_no", k.konteyner_no, veri.konteyner_no);
    karsilastir("plaka", k.plaka, veri.arac_plaka);
    karsilastir("tare_kg", k.tare_kg, veri.konteyner_dara_kg);
    karsilastir("vgm_kg", k.vgm_kg, veri.dogrulanmis_brut_agirlik_kg);
    karsilastir("tartim", ai.tartim_tarih_saat, veri.tartim_tarih_saat);
    karsilastir("payload", ai.konteyner_payload_kg, veri.konteyner_payload_kg);
    karsilastir("arac_bos", ai.arac_bos_agirlik_kg, veri.arac_bos_agirlik_kg);
    karsilastir("yukleten", ai.yukleten_unvan, veri.yukleten_unvan);
    sonuclar.push({ belge: k.dba_belge_no, konteyner: k.konteyner_no, sonuc: Object.keys(farklar).length ? "farkli" : "ayni", farklar });
  }
  return yanit({ ok: true, surum: SURUM, toplam, bas, adet: kayitlar.length, sonuclar });
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return yanit({ ok: false, hata: "Sadece POST." }, 405);
    const cihaz = await cihazBul(req.headers.get("x-cihaz-anahtari"));
    if (!cihaz) {
      await req.body?.cancel();
      return yanit({ ok: false, hata: "Cihaz anahtarı geçersiz veya iptal edilmiş." }, 401);
    }
    const islem = req.headers.get("x-islem");
    const ajanSurumu = (req.headers.get("x-ajan-surumu") || "").slice(0, 20);

    if (islem === "sinyal") {
      await rpc("dba_otomatik_sinyal", { p_cihaz_id: cihaz.id, p_surum: ajanSurumu || "?" });
      return yanit({ ok: true, surum: SURUM, cihaz: cihaz.ad, mod: cihaz.canli ? "canli" : "deneme" });
    }
    if (islem === "belge") {
      await rpc("dba_otomatik_sinyal", { p_cihaz_id: cihaz.id, p_surum: ajanSurumu || "?" });
      return await belgeIsle(req, cihaz);
    }
    if (islem === "dogrulama") return await dogrula(req, cihaz);
    return yanit({ ok: false, hata: "Bilinmeyen işlem." }, 400);
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("dba-otomatik hata:", mesaj);
    // 5xx: gorev ayni belgeyi kisa sure sonra yeniden dener
    return yanit({ ok: false, hata: mesaj.slice(0, 300) }, 500);
  }
});
