import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { musteriOzetHesapla, musteriOzetHtml, musteriOzetKonusu, musteriOzetSayfalari, type MoVeri } from "../_shared/musteri-ozet.ts";
import { oturumPenceresi } from "../_shared/rapor-oturum.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { xlsxParcalari } from "../_shared/xlsx-yaz.ts";

// ============================================================================
// MUSTERI OZET RAPORU MAILI (musteri-ozet-rapor) - 11.11.2026
// ============================================================================
// pg_cron 'musteri-ozet-rapor' 05:00 UTC = 08:00 TR, her gun. Veri: musteri_ozet_veri(p_company) RPC (yalniz
// service_role; salt okunur). Hesap + HTML: _shared/musteri-ozet.ts. Departmanlara gunluk talimat + her aktif
// musterinin durumu + potansiyel musteriler. Musteriye sistemden mail GITMEZ (mailto ile departman gonderir).
// ALICILAR: Ayarlar > Rapor Alicilari (rapor_alicilari, rapor = 'musteri_ozet'); satir yoksa secret'lar
//   (MUSTERI_OZET_CANLI = "evet" + MUSTERI_OZET_ALICI). Canli DEGILSE mail SADECE test adresine
//   (MUSTERI_OZET_TEST_ALICISI, varsayilan mesensei282@gmail.com) "[TEST]" konuyla gider.
// MAIL (11.11.2026 revize): "Otomatik Ozet" + en acil 8 is; ek Excel (Isler, Musteriler, Sevkiyatlar, Potansiyel).
// CAGRI YETKISI (siparis-rapor ile ayni ilke):
//  - Anon (pg_cron): yalniz 07:55-09:00 TR penceresinde; sirket + gun icin bir kez (canli). Yanitta veri yok.
//    Anon {"test": true}: YALNIZ test modunda (alici sabit test adresi), 24 saatte en fazla 5.
//  - Yetkili kullanici (admin / super admin), yalniz KENDI sirketi: {"deneme": true} -> mail GITMEZ, konu + ozet +
//    HTML doner; {"test": true} -> "[TEST]" mail YALNIZ test adresine.
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
const CANLI = (Deno.env.get("MUSTERI_OZET_CANLI") || "").trim().toLowerCase() === "evet";
const ALICILAR = adresler("MUSTERI_OZET_ALICI", []);
const TEST_ALICISI = adresler("MUSTERI_OZET_TEST_ALICISI", ["mesensei282@gmail.com"]);

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

async function sirketVerisi(companyId: string): Promise<MoVeri> {
  const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/rpc/musteri_ozet_veri`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_company: companyId }),
  }));
  if (!res.ok) throw new Error(`musteri_ozet_veri okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as MoVeri;
}

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean };
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const yetkili = yetkiliSirket !== null;
    const zamanli = govde.deneme !== true && govde.test !== true;
    if (yetkili && zamanli) return json({ ok: false, hata: "Elle yalnızca test gönderimi yapılabilir." }, 400);
    if (!yetkili) {
      const baslik = req.headers.get("Authorization") || "";
      if (jwtRolu(baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null) === "authenticated") return json({ ok: false, hata: "Test maili yalnızca yöneticiler gönderebilir." }, 403);
      if (govde.deneme) return json({ ok: false, hata: "Deneme yalnızca yetkili kullanıcılar içindir." }, 403);
      if (zamanli && oturumPenceresi(Date.now()) !== "sabah") return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
    }
    const deneme = yetkili && govde.deneme === true;
    const tarih = trBugun();

    // UNEX Satis (Pazar) kaydi olan sirketler (yetkili kullanicida yalniz kendi sirketi)
    const kaynak = await hepsiniCek<{ company_id: string }>(`pazar_firmalar?select=company_id&durum=eq.musteri&order=company_id`);
    const idler = Array.from(new Set(kaynak.map((b) => b.company_id))).filter((id) => !yetkili || id === yetkiliSirket);
    if (yetkili && !idler.length) return json({ ok: false, hata: "Şirketinizde müşteri kaydı yok." }, 404);
    const sirketler = idler.length ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(idler)}&order=id`) : [];

    const sonuclar: Record<string, unknown>[] = [];
    for (const companyId of idler) {
      const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, "musteri_ozet", { canli: CANLI, alicilar: ALICILAR });
      if (!yetkili && govde.test === true && ayar.canli) { sonuclar.push({ atlandi: "Canlı raporda test yalnızca yöneticiler içindir." }); continue; }
      // Canli degilse zamanlanmis rapor da test adresine "[TEST]" gider
      const test = !deneme && (govde.test === true || !ayar.canli);
      const alicilar = test ? TEST_ALICISI : ayar.alicilar;
      const sirketAdi = (sirketler.find((s) => s.id === companyId)?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
      const rapor = musteriOzetHesapla(await sirketVerisi(companyId), sirketAdi);
      const ozet = rapor.ozet;
      const konu = `${test ? "[TEST] " : ""}${musteriOzetKonusu(rapor, sirketAdi)}`;
      const html = musteriOzetHtml(rapor, sirketAdi, "Sabah raporu");
      if (deneme) { sonuclar.push({ tarih, konu, alicilar: ayar.canli ? ayar.alicilar : TEST_ALICISI, canli: ayar.canli, ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok (Ayarlar > Rapor Alıcıları)." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      if (!zamanli) {
        const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
        const t = await hepsiniCek<{ id: string }>(`musteri_ozet_gonderimleri?select=id&company_id=eq.${companyId}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}&order=id`);
        if (t.length >= 5) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 5 test maili gönderilebilir." }); continue; }
      } else if (!test) {
        const var_ = await hepsiniCek<{ id: string }>(`musteri_ozet_gonderimleri?select=id&company_id=eq.${companyId}&rapor_tarihi=eq.${tarih}&elle=is.false&test=is.false&order=id`);
        if (var_.length) { sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      }
      const k = await fetch(`${SUPABASE_URL}/rest/v1/musteri_ozet_gonderimleri`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, rapor_tarihi: tarih, durum: "gonderiliyor", test, elle: !zamanli }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bugünün raporu zaten gönderilmiş." }); continue; }
      if (!k.ok) throw new Error(`musteri_ozet_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      const kayitId = ((await k.json()) as { id: string }[])[0]?.id;

      const zip = new JSZip();
      for (const f of xlsxParcalari(musteriOzetSayfalari(rapor))) zip.file(f.yol, f.icerik);
      const ek = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${sirketAdi} Müşteri Özeti <bildirim@ihracatasistanim.com>`, to: alicilar, subject: konu, html,
          attachments: [{ filename: `Musteri_Ozeti_${tarih}.xlsx`, content: ek }],
        }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (kayitId) await fetch(`${SUPABASE_URL}/rest/v1/musteri_ozet_gonderimleri?id=eq.${kayitId}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      if (kayitId) {
        await fetch(`${SUPABASE_URL}/rest/v1/musteri_ozet_gonderimleri?id=eq.${kayitId}`, {
          method: "PATCH",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ durum: "gonderildi", alicilar: alicilar.join(","), ozet, gonderim_zamani: new Date().toISOString() }),
        });
      }
      sonuclar.push({ gonderildi: true, test, tarih, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, tarih, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, tarih, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("musteri-ozet-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
