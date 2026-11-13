import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { yuklenenHesapla, type BekleyenSira, type DiibBelgesi, type DiibBolunmesi, type DiibDosyasi, type DiibKaydi } from "../_shared/diib-hesap.ts";
import { diibExcelDosyalari } from "../_shared/diib-excel.ts";
import { diibGunlukRaporHesapla, diibGunlukRaporHtml, diibGunlukRaporKonusu } from "../_shared/diib-rapor.ts";

// ============================================================================
// DIIB GUNLUK RAPORU MAILI (diib-gunluk-rapor) - 06.11.2026
// ============================================================================
// pg_cron 'diib-gunluk-rapor' 14:00 UTC = 17:00 TR. Hesap + HTML: _shared/diib-rapor.ts (DIIB Takibi
// sayfasiyla ayni hesap); ek: sayfadaki "Excel'e aktar" ile ayni XLSX (_shared/diib-excel.ts).
// Veri: diib_belgeleri, diib_ihracatlari, ihracat_dosyalari, diib_dosya_bolunmeleri, konteynerler,
// rezervasyonlar (service_role, yalniz okuma). Musteriye GITMEZ.
// ALICILAR (secret): DIIB_RAPOR_CANLI = "evet" DEGILSE mail SADECE test adresine
//   (DIIB_RAPOR_TEST_ALICISI (secret; 13.11.2026 kod varsayilani kaldirildi: tanimli degilse test maili GITMEZ)) "[TEST]" konuyla gider.
//   Canlida: DIIB_RAPOR_ALICI (virgulle, en fazla 6).
// CAGRI YETKISI (ic-gunluk-rapor ile ayni ilke):
//  - Anon (pg_cron): yalniz 16:55-18:00 TR penceresinde; sirket + gun icin bir kez (diib_rapor_gonderimleri
//    kismi benzersiz index). Yanitta veri yok. Anon {"test": true}: YALNIZ test modunda (alici sabit test
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
const DOSYA_KOLONLARI = "id,dosya_no,durum,fatura_no,fatura_tarihi,beyanname_no,beyanname_dosya_url,alici_firma,alici_adresi,urun_detaylari,toplam_tutar,para_birimi,diib_no";

function adresler(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a));
  return liste.length ? Array.from(new Set(liste)).slice(0, 6) : varsayilan;
}
const CANLI = (Deno.env.get("DIIB_RAPOR_CANLI") || "").trim().toLowerCase() === "evet";
const ALICILAR = adresler("DIIB_RAPOR_ALICI", []);
const TEST_ALICISI = adresler("DIIB_RAPOR_TEST_ALICISI", []);

const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const trDakika = (ms: number) => { const tr = new Date(ms + 3 * 3600_000); return tr.getUTCHours() * 60 + tr.getUTCMinutes(); };
const penceredeMi = (ms: number) => { const dk = trDakika(ms); return dk >= 17 * 60 - 5 && dk < 18 * 60; };

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

/** DIIB Takibi sayfasindaki veri (lib/diib/veri.ts diibVerisiGetir + bekleyenSiraGetir ile ayni). */
async function sirketRaporu(companyId: string, tarih: string) {
  const c = `company_id=eq.${companyId}`;
  const [belgeler, kayitlar, dosyalarHam, bolunmeler, konteynerler, rezler] = await Promise.all([
    hepsiniCek<DiibBelgesi>(`diib_belgeleri?select=*&${c}&order=kullanim_sirasi,id`),
    hepsiniCek<DiibKaydi>(`diib_ihracatlari?select=*&${c}&order=id`),
    hepsiniCek<DiibDosyasi>(`ihracat_dosyalari?select=${DOSYA_KOLONLARI}&${c}&order=id`),
    hepsiniCek<DiibBolunmesi>(`diib_dosya_bolunmeleri?select=*&${c}&order=id`),
    hepsiniCek<{ dosya_id: string | null; net_agirlik_kg: number | string | null }>(`konteynerler?select=id,dosya_id,net_agirlik_kg&${c}&order=id`),
    hepsiniCek<{ dosya_id: string | null; konteyner_adedi: number | null; talimat_cutoff: string | null; beyanname_cutoff: string | null; gemi_kalkis_tarihi: string | null }>(`rezervasyonlar?select=id,dosya_id,konteyner_adedi,talimat_cutoff,beyanname_cutoff,gemi_kalkis_tarihi&${c}&order=id`),
  ]);
  const planlanan: Record<string, number> = {};
  for (const x of rezler) if (x.dosya_id && Number(x.konteyner_adedi) > 0) planlanan[x.dosya_id] = (planlanan[x.dosya_id] || 0) + Number(x.konteyner_adedi);
  const yk = yuklenenHesapla(konteynerler, planlanan);
  const dosyalar = dosyalarHam.map((d) => ({ ...d, yuklenenKg: yk[d.id] ?? null }));
  const bekleyenIdler = new Set(dosyalar.filter((d) => !d.fatura_no && d.durum !== "Kapalı" && d.durum !== "Kapali").map((d) => d.id));
  const enErken = (a: string | null | undefined, b: string | null) => (!a ? b : !b ? a : a < b ? a : b) ?? null;
  const sira: Record<string, BekleyenSira> = {};
  for (const x of rezler) {
    if (!x.dosya_id || !bekleyenIdler.has(x.dosya_id)) continue;
    const e = sira[x.dosya_id];
    sira[x.dosya_id] = { talimatCutoff: enErken(e?.talimatCutoff, x.talimat_cutoff), beyanCutoff: enErken(e?.beyanCutoff, x.beyanname_cutoff), etd: enErken(e?.etd, x.gemi_kalkis_tarihi) };
  }
  return diibGunlukRaporHesapla({ belgeler, kayitlar, dosyalar, bolunmeler }, sira, tarih);
}

async function excelBase64(r: Awaited<ReturnType<typeof sirketRaporu>>): Promise<string> {
  const zip = new JSZip();
  for (const f of diibExcelDosyalari(r.ozetler, r.satirlar)) zip.file(f.yol, f.icerik);
  return await zip.generateAsync({ type: "base64" });
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
      // Anon test: yalniz TEST modunda (alici sabit test adresi), gunde en fazla 3 - kurulum dogrulamasi icin
      if (govde.test === true && CANLI) return json({ ok: false, hata: "Test yalnızca yetkili kullanıcılar içindir." }, 403);
      if (govde.test !== true && !penceredeMi(Date.now())) return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
    }
    const deneme = yetkili && govde.deneme === true;
    // Canli degilse her gonderim test adresine "[TEST]" gider (zamanlanmis gonderim dahil)
    const test = !deneme && (govde.test === true || !CANLI);
    const tarih = trBugun();

    // DIIB'i olan sirketler (yetkili kullanicida yalniz kendi sirketi)
    const belgeSirketleri = await hepsiniCek<{ company_id: string }>(`diib_belgeleri?select=company_id&order=company_id`);
    const idler = Array.from(new Set(belgeSirketleri.map((b) => b.company_id))).filter((id) => !yetkili || id === yetkiliSirket);
    const sirketler = idler.length ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(idler)}&order=id`) : [];

    const sonuclar: Record<string, unknown>[] = [];
    for (const companyId of idler) {
      const sirketAdi = (sirketler.find((s) => s.id === companyId)?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
      const rapor = await sirketRaporu(companyId, tarih);
      const konu = `${test ? "[TEST] " : ""}${diibGunlukRaporKonusu(rapor, sirketAdi)}`;
      const html = diibGunlukRaporHtml(rapor, sirketAdi, new Date().toISOString());
      const alicilar = test ? TEST_ALICISI : ALICILAR;
      if (deneme) { sonuclar.push({ tarih, konu, alicilar: CANLI ? ALICILAR : TEST_ALICISI, canli: CANLI, ozet: rapor.ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok (DIIB_RAPOR_ALICI)." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      if (govde.test === true) {
        const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
        const t = await hepsiniCek<{ id: string }>(`diib_rapor_gonderimleri?select=id&company_id=eq.${companyId}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}&order=id`);
        if (t.length >= 3) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 3 deneme raporu gönderilebilir." }); continue; }
      }
      // Tekrar korumasi: zamanlanmis gonderim (elle degil) sirket + gun icin tek kayit
      const elle = yetkili || govde.test === true;
      if (!elle) {
        const var_ = await hepsiniCek<{ id: string }>(`diib_rapor_gonderimleri?select=id&company_id=eq.${companyId}&rapor_tarihi=eq.${tarih}&elle=is.false&order=id`);
        if (var_.length) { sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      }
      const k = await fetch(`${SUPABASE_URL}/rest/v1/diib_rapor_gonderimleri`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, rapor_tarihi: tarih, durum: "gonderiliyor", test, elle }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      if (!k.ok) throw new Error(`diib_rapor_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      const kayitId = ((await k.json()) as { id: string }[])[0]?.id;

      const ek = await excelBase64(rapor);
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${sirketAdi} DİİB Takibi <bildirim@ihracatasistanim.com>`, to: alicilar, subject: konu, html,
          attachments: [{ filename: `DIIB_Takibi_${tarih}.xlsx`, content: ek }],
        }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (kayitId) await fetch(`${SUPABASE_URL}/rest/v1/diib_rapor_gonderimleri?id=eq.${kayitId}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      if (kayitId) {
        await fetch(`${SUPABASE_URL}/rest/v1/diib_rapor_gonderimleri?id=eq.${kayitId}`, {
          method: "PATCH",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ durum: "gonderildi", alicilar: alicilar.join(","), ozet: rapor.ozet, gonderim_zamani: new Date().toISOString() }),
        });
      }
      sonuclar.push({ gonderildi: true, test, tarih, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? rapor.ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, test, tarih, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, test, canli: CANLI, tarih, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("diib-gunluk-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
