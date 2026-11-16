import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { xlsxParcalari } from "../_shared/xlsx-yaz.ts";
import { oturumAdi, oturumPenceresi, oturumSaatten } from "../_shared/rapor-oturum.ts";
import { raporAyari } from "../_shared/rapor-alici.ts";
import { baglamKur, type AcenteHafizasi, type LimanKurali } from "../_shared/navlun-karsilastirma.ts";
import { limanAnahtari } from "../_shared/liman-anahtari.ts";
import { esleriYukle, type AdEsi, navlunSatinAlma, navlunTablosuDosyaAdi, navlunTablosuHesapla, navlunTablosuHtml, navlunTablosuKonusu, navlunTablosuSayfasi, satinAlmaBasligi, satinAlmaSayfasi, type NavlunOlayi, type PlanNavlunSatiri } from "../_shared/navlun-tablosu.ts";

// ============================================================================
// NAVLUN TABLOSU MAILI (navlun-tablosu) - 11.11.2026
// ============================================================================
// Operasyonun elle tuttugu navlun tablosuyla AYNI duzende Excel (_shared/navlun-tablosu.ts; Navlun Bildirimi sayfasindaki
// "Excel indir" ile ayni dosya) + kisa HTML ozet. Veri: navlun_teklifleri + yukleme_plani_veri (service_role, yalniz okuma).
// ZAMANLAMA (11.11.2026): pg_cron 'navlun-tablosu-sabah' 05:00 UTC = 08:00 TR ve 'navlun-tablosu-aksam' 14:00 UTC
//   = 17:00 TR, her gun. Anon {} yalniz 07:55-09:00 / 16:55-18:00 penceresinde; sirket + gun + oturum icin bir kez.
//   12.11.2026 canliya gecis (kullanici: "Rapor gonderimi her gun 17.00"): 'navlun-tablosu-sabah' pasif (cron.alter_job active=false).
//   Rapor "son rapordan beri gelen teklifler"i ayrica listeler (her raporda en son alinan rakamlar).
// ALICI: Ayarlar > Rapor Alicilari (rapor_alicilari, rapor = 'navlun'); satir yoksa secret'lar (NAVLUN_TABLOSU_CANLI =
//   "evet" + NAVLUN_TABLOSU_ALICI). Canli degilse YALNIZ test adresine "[TEST]" (NAVLUN_TABLOSU_TEST_ALICISI,
//   secret; kodda varsayilan yok - 13.11.2026). Musteriye GITMEZ.
// MAIL (12.11.2026): "Satin Alinan Navlunlar" (yukleme planindaki booking'li yuklemeler, musteri + odenecek navlun; kaynak dosya /
//   plan / anlasma maili) + "Rezervasyon Bekleyen Musteriler" + "Navlun Evreni" dugmesi (/navlun).
//   Ek: "UNEX NAVLUN SATIN ALMA LISTESI · <tarih>.xlsx" (operasyonun navlun tablosu sayfadaki "Excel indir"de).
// CAGRI YETKISI:
//  - Yetkili kullanici (admin / super admin), yalniz KENDI sirketi: {"deneme": true} -> mail GITMEZ, konu + HTML doner;
//    {"test": true} -> "[TEST]" mail YALNIZ test adresine.
//  - Anon {"test": true}: yalniz canli degilken (kurulum dogrulamasi).
//  - Test mailleri sirket basina 24 saatte en fazla 5 (navlun_tablosu_gonderimleri).
// TOPLU NAVLUN TABLOSU EKI (13.11.2026 aksam, kullanici: "Haftalik navlun maili kaldirilsin. Navlun satin alma ile beraber
//   sadece exceli gitsin." + "Her gun"): her gunku navlun maili IKI Excel ekiyle gider: (1) UNEX NAVLUN SATIN ALMA LISTESI,
//   (2) Navlun_Tablosu_GG.AA.YYYY.xlsx = Navlun Bildirimi > "Excel indir" ile ayni dosya (navlunTablosuSayfasi).
//   Ayri cumartesi maili KALDIRILDI: {"haftalik": true} 410 doner; pg_cron 'navlun-tablosu-haftalik' pasif (active=false).
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
const CANLI = (Deno.env.get("NAVLUN_TABLOSU_CANLI") || "").trim().toLowerCase() === "evet";
const ALICILAR = adresler("NAVLUN_TABLOSU_ALICI", []);
const TEST_ALICISI = adresler("NAVLUN_TABLOSU_TEST_ALICISI", []);

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

/** Navlun Bildirimi sayfasindaki "Excel indir" ile ayni veri (lib/navlun/tablo.ts). */
async function sirketTablosu(companyId: string, tarih: string) {
  const [olaylarHam, planHam] = await Promise.all([
    hepsiniCek<Record<string, unknown>>(`navlun_teklifleri?select=tur,liman,liman_anahtar,acente,armator,tutar,para_birimi,ekipman,free_time_gun,transit_gun,tarih,mesaj_id,lokal_dahil&company_id=eq.${companyId}&order=tarih,id`),
    rpcHepsi("yukleme_plani_veri", companyId),
  ]);
  // 12.11.2026 booking eslestirmesi: olaylara kaynak mailin konusu eklenir (yazisma + konteyner adedi + konudaki booking no)
  const konular = new Map((await hepsiniCek<{ mesaj_id: string; konu: string | null }>(`navlun_mesajlari?select=mesaj_id,konu&company_id=eq.${companyId}&order=id`)).map((m) => [m.mesaj_id, m.konu]));
  const olaylar = olaylarHam.map((o) => ({ ...o, tutar: o.tutar == null ? null : Number(o.tutar), konu: konular.get(String(o.mesaj_id)) ?? null })) as unknown as NavlunOlayi[];
  const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const plan: PlanNavlunSatiri[] = planHam.map((p) => ({
    varis_limani: metin(p.varis_limani), acente: metin(p.acente), navlun: p.navlun == null || p.navlun === "" ? null : Number(p.navlun) || null,
    navlun_para: metin(p.navlun_para), etd: metin(p.etd), kaynak: metin(p.kaynak), booking_no: metin(p.booking_no), musteri: metin(p.musteri),
    konteyner: p.konteyner == null || p.konteyner === "" ? null : Number(p.konteyner) || null, dosya_no: metin(p.dosya_no),
    hafta: p.hafta == null ? null : Number(p.hafta) || null, yil: p.yil == null ? null : Number(p.yil) || null,
  }));
  // 16.11.2026 liman / firma es sozlugu; okunamazsa sabit eslerle devam (rapor durmaz)
  try { esleriYukle(await hepsiniCek<AdEsi>(`ad_esleri?select=tur,kaynak,hedef&company_id=eq.${companyId}&order=id`)); }
  catch (e) { esleriYukle([]); console.error("navlun-tablosu: es sozlugu okunamadi:", e instanceof Error ? e.message : e); }
  const tablo = navlunTablosuHesapla(olaylar, plan.filter((p) => p.kaynak !== "siparis"), tarih);
  tablo.baglam = await karsilastirmaBaglami(companyId, olaylar);
  return { tablo, satinAlma: navlunSatinAlma(tablo, plan, olaylar, Array.from(konular.values())) };
}

/**
 * 13.11.2026 karsilastirma baglami (Navlun Evreni ile AYNI): acente hafizasi + liman kurallari + rezervasyon kanitlari
 * (sevkiyat_plani konteyner basi navlun + lokal). Okunamazsa null: yalniz mail metni, lokali belirsiz teklif en iyi secilmez.
 */
async function karsilastirmaBaglami(companyId: string, olaylar: NavlunOlayi[]) {
  try {
    const [hafiza, kurallar, kanit] = await Promise.all([
      hepsiniCek<AcenteHafizasi & { lokal_20: number | string | null; lokal_40: number | string | null; ek_kont: number | string }>(
        `navlun_acente_hafizasi?select=acente_anahtar,acente_ad,lokal,lokal_20,lokal_40,ek_kont,guven,kanit&company_id=eq.${companyId}&order=acente_anahtar`),
      hepsiniCek<LimanKurali>(`navlun_liman_kurallari?select=liman_anahtar,temel,aciklama&company_id=eq.${companyId}&order=liman_anahtar`),
      hepsiniCek<{ acente: string | null; varis_limani: string | null; etd: string | null; navlun_kont: number | string | null; lokal_kont: number | string | null; navlun_para: string | null }>(
        `sevkiyat_plani?select=acente,varis_limani,etd,navlun_kont,lokal_kont,navlun_para&company_id=eq.${companyId}&navlun_kont=not.is.null&order=id`),
    ]);
    const sayiMi = (v: unknown) => (v == null || v === "" ? null : Number(v));
    return baglamKur(
      hafiza.map((h) => ({ ...h, lokal_20: sayiMi(h.lokal_20), lokal_40: sayiMi(h.lokal_40), ek_kont: Number(h.ek_kont || 0) })),
      kurallar,
      olaylar.filter((o) => (o.tur === "teklif" || o.tur === "karsi_teklif") && o.tutar).map((o) => ({
        acente: o.acente, tutar: o.tutar as number, para_birimi: o.para_birimi, ekipman: o.ekipman, lokal_dahil: o.lokal_dahil ?? null, liman_anahtar: o.liman_anahtar, tarih: o.tarih,
      })),
      kanit.map((k) => ({ acente: k.acente, liman_anahtar: limanAnahtari(k.varis_limani), etd: k.etd, navlun: sayiMi(k.navlun_kont), lokal: sayiMi(k.lokal_kont), para: k.navlun_para })),
    );
  } catch (e) {
    console.error("navlun-tablosu: karsilastirma baglami okunamadi:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function xlsxBase64(sayfa: Parameters<typeof xlsxParcalari>[0][number]): Promise<string> {
  const zip = new JSZip();
  for (const f of xlsxParcalari([sayfa])) zip.file(f.yol, f.icerik);
  return await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
/**
 * Mailin ekleri (13.11.2026): (1) "UNEX NAVLUN SATIN ALMA LISTESI · <tarih>" (12.11.2026), (2) toplu navlun tablosu =
 * Navlun Bildirimi > "Excel indir" (lib/navlun/tablo.ts) ile ayni sayfa, "Navlun_Tablosu_GG.AA.YYYY.xlsx".
 */
async function ekler(v: Awaited<ReturnType<typeof sirketTablosu>>, tarih: string): Promise<{ filename: string; content: string }[]> {
  return [
    { filename: `${satinAlmaBasligi(tarih)}.xlsx`, content: await xlsxBase64(satinAlmaSayfasi(v.satinAlma, v.tablo.tarih)) },
    { filename: navlunTablosuDosyaAdi(tarih), content: await xlsxBase64(navlunTablosuSayfasi(v.tablo)) },
  ];
}

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean; haftalik?: boolean };
    // 13.11.2026: ayri haftalik mail kaldirildi (toplu tablo her gunku mailin ikinci eki)
    if (govde.haftalik === true) return json({ ok: false, hata: "Haftalık navlun maili kaldırıldı; toplu navlun tablosu her günkü navlun mailinde ektedir." }, 410);
    const rapor = "navlun";
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const yetkili = yetkiliSirket !== null;
    const zamanli = govde.deneme !== true && govde.test !== true;
    if (yetkili && zamanli) return json({ ok: false, hata: "Elle yalnızca test gönderimi yapılabilir." }, 400);
    if (!yetkili) {
      // Oturumlu ama yonetici olmayan kullanici: anon test yoluna DUSMEZ
      const baslik = req.headers.get("Authorization") || "";
      if (jwtRolu(baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : null) === "authenticated") return json({ ok: false, hata: "Test maili yalnızca yöneticiler gönderebilir." }, 403);
      if (govde.deneme) return json({ ok: false, hata: "Deneme yalnızca yetkili kullanıcılar içindir." }, 403);
      if (zamanli && !oturumPenceresi(Date.now())) return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
    }
    const deneme = yetkili && govde.deneme === true;
    const tarih = trBugun();
    const oturum = oturumPenceresi(Date.now()) ?? oturumSaatten(Date.now());

    const kaynak = await hepsiniCek<{ company_id: string }>(`navlun_teklifleri?select=company_id&order=company_id`);
    const idler = Array.from(new Set(kaynak.map((b) => b.company_id))).filter((id) => !yetkili || id === yetkiliSirket);
    if (yetkili && !idler.length) return json({ ok: false, hata: "Şirketinizde navlun bilgisi yok." }, 404);
    const sirketler = idler.length ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(idler)}&order=id`) : [];

    const sonuclar: Record<string, unknown>[] = [];
    for (const companyId of idler) {
      const ayar = await raporAyari(SUPABASE_URL, basliklar, companyId, rapor, { canli: CANLI, alicilar: ALICILAR });
      if (!yetkili && govde.test === true && ayar.canli) { sonuclar.push({ atlandi: "Canlı raporda test yalnızca yöneticiler içindir." }); continue; }
      // Canli degilse zamanlanmis rapor da test adresine "[TEST]" gider
      const test = !deneme && (govde.test === true || !ayar.canli);
      const alicilar = test ? TEST_ALICISI : ayar.alicilar;
      const cc = test ? [] : ayar.cc;   // 12.11.2026: Ayarlar > Rapor Alicilari CC
      const sirketAdi = (sirketler.find((s) => s.id === companyId)?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
      const veri = await sirketTablosu(companyId, tarih);
      const tablo = veri.tablo;
      const ozet = { liman: tablo.limanlar.length, blok: tablo.bloklar.length, gerceklesen: tablo.gerceklesenVar, booking: veri.satinAlma.satirlar.length, navlunsuz: veri.satinAlma.belirsiz };
      const konu = `${test ? "[TEST] " : ""}${navlunTablosuKonusu(tablo, sirketAdi, veri.satinAlma)}`;
      // Bir onceki gonderilmis rapor: bu andan sonra gelen teklifler "YENI" (yoksa son 48 saat). Eski haftalik kayitlar haric.
      const onceki = await hepsiniCek<{ gonderim_zamani: string | null }>(`navlun_tablosu_gonderimleri?select=gonderim_zamani&company_id=eq.${companyId}&durum=eq.gonderildi&test=eq.${test}&oturum=neq.haftalik&order=gonderim_zamani.desc.nullslast&limit=1`);
      const html = navlunTablosuHtml(tablo, sirketAdi, { oncekiIso: onceki[0]?.gonderim_zamani ?? null, oturumEtiketi: oturumAdi(oturum as "sabah" | "aksam"), satinAlma: veri.satinAlma });
      if (deneme) { sonuclar.push({ tarih, konu, alicilar: ayar.canli ? ayar.alicilar : TEST_ALICISI, canli: ayar.canli, ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok (Ayarlar > Rapor Alıcıları)." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      if (!zamanli) {
        const esik = new Date(Date.now() - 24 * 3600_000).toISOString();
        const t = await hepsiniCek<{ id: string }>(`navlun_tablosu_gonderimleri?select=id&company_id=eq.${companyId}&elle=is.true&olusturma=gte.${encodeURIComponent(esik)}&order=id`);
        if (t.length >= 5) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 5 test maili gönderilebilir." }); continue; }
      } else {
        const var_ = await hepsiniCek<{ id: string }>(`navlun_tablosu_gonderimleri?select=id&company_id=eq.${companyId}&rapor_tarihi=eq.${tarih}&oturum=eq.${oturum}&elle=is.false&test=is.false&order=id`);
        if (var_.length) { sonuclar.push({ atlandi: "Bu oturumun raporu zaten gönderilmiş." }); continue; }
      }
      const k = await fetch(`${SUPABASE_URL}/rest/v1/navlun_tablosu_gonderimleri`, {
        method: "POST",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, rapor_tarihi: tarih, oturum, durum: "gonderiliyor", test, elle: !zamanli }),
      });
      if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bu oturumun raporu zaten gönderilmiş." }); continue; }
      if (!k.ok) throw new Error(`navlun_tablosu_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
      const kayitId = ((await k.json()) as { id: string }[])[0]?.id;

      const ekListesi = await ekler(veri, tarih);
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${sirketAdi} Navlun Tablosu <bildirim@ihracatasistanim.com>`, to: alicilar, ...(cc.length ? { cc } : {}), subject: konu, html,
          attachments: ekListesi,
        }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (kayitId) await fetch(`${SUPABASE_URL}/rest/v1/navlun_tablosu_gonderimleri?id=eq.${kayitId}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      if (kayitId) {
        await fetch(`${SUPABASE_URL}/rest/v1/navlun_tablosu_gonderimleri?id=eq.${kayitId}`, {
          method: "PATCH",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ durum: "gonderildi", alicilar: [...alicilar, ...cc.map((x) => `cc:${x}`)].join(","), ozet, gonderim_zamani: new Date().toISOString() }),
        });
      }
      sonuclar.push({ gonderildi: true, tarih, oturum, test, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, tarih, oturum, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, tarih, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("navlun-tablosu hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
