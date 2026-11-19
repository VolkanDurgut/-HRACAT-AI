import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  IC_RAPOR_OTURUMLARI, IC_RAPOR_SAATI, icGunlukRaporHesapla, icGunlukRaporHtml, icGunlukRaporKonusu, trBugun,
  type IcRaporOturumu, type RaporAlis, type RaporIsEmri, type RaporSevk, type RaporTeslim,
} from "../_shared/ic-gunluk-rapor.ts";

// ============================================================================
// GUNLUK IC PIYASA RAPORU MAILI (ic-gunluk-rapor) - 04.11.2026
// ============================================================================
// pg_cron (asagida 04.11 aksam notu: gunde 3 oturum) -> raporu (yuklenen / gelen araclar,
// acik satis + alis siparisleri, bugun kapanan siparisler). Hesap + HTML: _shared/ic-gunluk-rapor.ts.
// Alicilar: ic_piyasa_ayarlari.gunluk_rapor_eposta (Bildirimler > Ayarlar; virgulle <= 5). Bos = gonderilmez.
// Musteriye GITMEZ. Fiyat YOK.
//
// CAGRI YETKISI (gunluk-rapor-gonder ile ayni ilke):
//  - Anon anahtar (pg_cron): SADECE oturum penceresinde (09:00 / 12:00 / 17:00 TR, -5 / +60 dk; 19.11.2026'ya kadar :15); sirket basina
//    oturumda bir kez (ic_gunluk_rapor_gonderimleri benzersiz). Deneme / tarih secimi YOK (test: asagida).
//    Yanitta sirket adi / ozet yok.
//  - Yetkili kullanici (gecerli oturum + admin rolu / super admin), yalniz KENDI sirketi:
//      {"deneme": true}  -> mail GITMEZ; konu + ozet + HTML doner (onizleme)
//      {"test": true}    -> alicilara "[TEST]" konulu mail gider; test kaydi yazilir (zamanlanmis
//                           raporu ENGELLEMEZ); sirket basina son 24 saatte en fazla 3 test.
//  - Anon {"test": true}: yalniz ayarli alicilara, ayni 3/24 saat siniriyla (SQL'den elle test icin; adres secilemez).
//    13.11.2026 guvenlik: anon test / test_adresine "x-test-anahtar" basligi ISTER (Vault rapor_test_anahtari,
//    migration 20261113210000; dogrulama rapor_test_anahtari_dogrula). Basliksiz anon yalniz zamanlanmis rapor.
//      {"tarih": "YYYY-MM-DD"} (deneme / test ile) gecmis gun.
// 04.11.2026 aksam - GUNDE 3 OTURUM (kullanici: "bundan sonraki gunlerde sabah ogle aksam"; ihracat
// raporuyla ayni duzen, 15 dk sonra): pg_cron ic-gunluk-rapor-sabah / -ogle / -aksam (06:15 / 09:15 /
// 14:15 UTC = 09:15 / 12:15 / 17:15 TR; 19.11.2026: 06:00 / 09:00 / 14:00 UTC = 09:00 / 12:00 / 17:00 TR). SABAH = DUNUN raporu, OGLE / AKSAM = bugunun. Anon pencere: her
// 19.11.2026 aksam (kullanici): sabah ve ogle isleri KAPALI; yalniz aksam 17:00 gider (oturum kodu degismedi).
// oturumun saatinden 5 dk once - 60 dk sonra; tekrar korumasi (sirket, gun, oturum).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SAYFA = 1000;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

const SUPER_ADMIN_EPOSTALARI = ["execution@unex.com.tr", "bbt@unex.com.tr"];
// EPOSTA_RE TEST_ALICISI'ndan ONCE tanimli olmali (modul yuklenirken kullaniliyor; 13.11.2026 sirasi ters yazilinca fonksiyon acilmadi)
const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
// 13.11.2026 TEST ADRESINE ({"test_adresine": true}): "[TEST]" rapor YALNIZ bu adrese (sirket alicilarina DEGIL); yeni gorunumu
// (tedarikci / musteri ozeti + Irsaliye Evreni) onaydan once gostermek icin. Anon da cagirabilir (adres sabit, 3 / 24 saat).
const TEST_ALICISI = (Deno.env.get("IC_RAPOR_TEST_ALICISI") || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => EPOSTA_RE.test(x)).slice(0, 2);
// Yeni (sade) gorunum zamanlanmis raporda: 13.11.2026 19:01 kullanici onayi ("Ic piyasa raporu onaylidir") -> ACIK.
// 14.11.2026 kullanici: "Eski sisteme geri donelim" -> sade gorunum KAPALI; eski gorunum, gunun araclari siparis basina tek satir.
const GRUPLU_CANLI = false;
// 19.11.2026 kullanici: "Acik satis ve acik alis siparisleri kisminda toplami gozukmeli (kalanlar toplanacak). Sensei adresine test
// gonder, onay verdikten sonra canliya alacagiz." -> TOPLAM satiri yalniz test adresi raporunda; onaydan sonra true.
const TOPLAM_CANLI = true; // 19.11.2026 11:24 kullanici onayi: "Test mail onayliyor. Canliya alalim."

const trDakika = (simdiMs: number) => { const tr = new Date(simdiMs + 3 * 60 * 60 * 1000); return tr.getUTCHours() * 60 + tr.getUTCMinutes(); };
/** Zamanlanmis oturum penceresindeysek oturum, degilse null (saatten 5 dk once - 60 dk sonra). */
function penceredekiOturum(simdiMs: number): IcRaporOturumu | null {
  const dk = trDakika(simdiMs);
  return IC_RAPOR_OTURUMLARI.find((o) => { const b = IC_RAPOR_SAATI[o][0] * 60 + IC_RAPOR_SAATI[o][1]; return dk >= b - 5 && dk < b + 60; }) ?? null;
}
/** Saate gore en yakin oturum (deneme / test icin): 11'den once sabah, 15'ten once ogle, sonra aksam. */
const saateGoreOturum = (simdiMs: number): IcRaporOturumu => { const dk = trDakika(simdiMs); return dk < 11 * 60 ? "sabah" : dk < 15 * 60 ? "ogle" : "aksam"; };
function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type EmirHam = Omit<RaporIsEmri, "musteri" | "musteri_kisa"> & { ic_musteriler: { unvan: string; kisa_ad: string | null } | null };
type AlisHam = Omit<RaporAlis, "tedarikci" | "tedarikci_kisa"> & { ic_tedarikciler: { unvan: string; kisa_ad: string | null } | null };
// 13.11.2026: musteri_id / tedarikci_id -> rapordaki musteri / tedarikci bazinda ozet ve Irsaliye Evreni baglantisi
const EMIR_KOLON = "id,is_emri_no,durum,urun,ambalaj,teslim,hedef_tur,hedef_kg,hedef_arac,devir_kg,kapanis_zamani,olusturma,musteri_id,ic_musteriler(unvan,kisa_ad)";
const ALIS_KOLON = "id,alis_no,durum,urun,depo,miktar_kg,kapanis_zamani,tedarikci_id,ic_tedarikciler(unvan,kisa_ad)";

async function sirketRaporu(companyId: string, tarih: string) {
  // Acik + bugun kapanan satis siparisleri (kapanis gunu TR; genis aralik, hesap gunu suzer)
  const emirHam = await hepsiniCek<EmirHam>(
    `ic_is_emirleri?select=${EMIR_KOLON}&company_id=eq.${companyId}&or=(durum.eq.acik,kapanis_zamani.gte.${tarih}T00:00:00%2B03:00)&order=id`
  );
  const emirler: RaporIsEmri[] = emirHam.map(({ ic_musteriler, ...e }) => ({ ...e, musteri: ic_musteriler?.unvan || "-", musteri_kisa: ic_musteriler?.kisa_ad || null }));
  const sevkKolon = "id,is_emri_id,plaka,dorse_plaka,net_kg,irsaliye_no,irsaliye_tarihi,olusturma,cikis_durumu,cikis_zamani,gecmis,irsaliye_dosya_yolu";
  // Bu siparislerin tum araclari + bugun yuklenen tum araclar (baska siparisteki dahil)
  const gunBas = `${tarih}T00:00:00%2B03:00`;
  const [emirSevk, gunSevk] = await Promise.all([
    emirler.length ? hepsiniCek<RaporSevk>(`ic_sevkler?select=${sevkKolon}&company_id=eq.${companyId}&is_emri_id=in.${inListe(emirler.map((e) => e.id))}&order=id`) : Promise.resolve([]),
    hepsiniCek<RaporSevk>(`ic_sevkler?select=${sevkKolon}&company_id=eq.${companyId}&or=(irsaliye_tarihi.gte.${gunBas},olusturma.gte.${gunBas})&order=id`),
  ]);
  const sevkMap = new Map<string, RaporSevk>();
  [...emirSevk, ...gunSevk].forEach((s) => sevkMap.set(s.id, s));
  // Bugun yuklenen ama listede olmayan siparisler (orn. bugun kapanmamis eski siparis) - adlari icin
  const eksikEmir = Array.from(new Set(gunSevk.map((s) => s.is_emri_id).filter((id) => !emirler.some((e) => e.id === id))));
  if (eksikEmir.length) {
    const ek = await hepsiniCek<EmirHam>(`ic_is_emirleri?select=${EMIR_KOLON}&company_id=eq.${companyId}&id=in.${inListe(eksikEmir)}&order=id`);
    // durum "bilgi" olarak isaretlenir: acik / kapanan listelerine girmesin, yalniz ad icin
    ek.forEach(({ ic_musteriler, ...e }) => emirler.push({ ...e, durum: `_${e.durum}`, musteri: ic_musteriler?.unvan || "-", musteri_kisa: ic_musteriler?.kisa_ad || null }));
  }

  // Alis: acik siparisler + bugun teslim alinanlar (tablo yoksa / okunamazsa alis bolumu bos)
  let alislar: RaporAlis[] = [];
  let teslimler: RaporTeslim[] = [];
  try {
    const alisHam = await hepsiniCek<AlisHam>(`ic_alis_siparisleri?select=${ALIS_KOLON}&company_id=eq.${companyId}&durum=eq.acik&order=id`);
    alislar = alisHam.map(({ ic_tedarikciler, ...a }) => ({ ...a, tedarikci: ic_tedarikciler?.unvan || "-", tedarikci_kisa: ic_tedarikciler?.kisa_ad || null }));
    const tKolon = "id,alis_id,plaka,dorse_plaka,net_kg,teslim_zamani,irsaliye_no,irsaliye_tarihi,olusturma,sevk_id,gecmis,irsaliye_dosya_yolu";
    const [acikTeslim, gunTeslim] = await Promise.all([
      alislar.length ? hepsiniCek<RaporTeslim>(`ic_alis_teslimler?select=${tKolon}&company_id=eq.${companyId}&alis_id=in.${inListe(alislar.map((a) => a.id))}&order=id`) : Promise.resolve([]),
      hepsiniCek<RaporTeslim>(`ic_alis_teslimler?select=${tKolon}&company_id=eq.${companyId}&or=(teslim_zamani.gte.${gunBas},olusturma.gte.${gunBas})&order=id`),
    ]);
    const tMap = new Map<string, RaporTeslim>();
    [...acikTeslim, ...gunTeslim].forEach((t) => tMap.set(t.id, t));
    teslimler = Array.from(tMap.values());
    const eksikAlis = Array.from(new Set(gunTeslim.map((t) => t.alis_id).filter((id) => !alislar.some((a) => a.id === id))));
    if (eksikAlis.length) {
      const ek = await hepsiniCek<AlisHam>(`ic_alis_siparisleri?select=${ALIS_KOLON}&company_id=eq.${companyId}&id=in.${inListe(eksikAlis)}&order=id`);
      ek.forEach(({ ic_tedarikciler, ...a }) => alislar.push({ ...a, durum: `_${a.durum}`, tedarikci: ic_tedarikciler?.unvan || "-", tedarikci_kisa: ic_tedarikciler?.kisa_ad || null }));
    }
  } catch (e) {
    console.error("ic-gunluk-rapor: alis okunamadi:", e instanceof Error ? e.message : e);
  }
  return icGunlukRaporHesapla(tarih, emirler, Array.from(sevkMap.values()), alislar, teslimler);
}

/** x-test-anahtar dogrulamasi (13.11.2026). Dogrulanamazsa (fonksiyon yok / ag) false: test reddedilir. Anahtar loglanmaz. */
async function testAnahtariGecerli(req: Request): Promise<boolean> {
  const anahtar = (req.headers.get("x-test-anahtar") || "").trim();
  if (!anahtar) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rapor_test_anahtari_dogrula`, {
      method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ p_anahtar: anahtar }),
    });
    if (!res.ok) { console.error("rapor_test_anahtari_dogrula:", res.status); await res.body?.cancel(); return false; }
    return (await res.json()) === true;
  } catch (e) {
    console.error("rapor_test_anahtari_dogrula:", e instanceof Error ? e.message : e);
    return false;
  }
}

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; test?: boolean; test_adresine?: boolean; tarih?: string; oturum?: string };
    const testAdresine = govde.test_adresine === true && govde.deneme !== true;
    const yetkiliSirket = await yetkiliKullaniciSirketi(req);
    const yetkili = yetkiliSirket !== null;
    const simdi = Date.now();
    let oturum: IcRaporOturumu;
    if (!yetkili) {
      if (govde.deneme || ((govde.tarih || govde.oturum) && !testAdresine)) return json({ ok: false, hata: "Deneme yalnızca yetkili kullanıcılar içindir." }, 403);
      // 13.11.2026: anon test modlari Vault anahtari ister (basliksiz anon yalniz zamanlanmis rapor)
      if ((govde.test === true || testAdresine) && !(await testAnahtariGecerli(req))) return json({ ok: false, hata: "Test yalnızca yetkili çağrılar içindir." }, 403);
      const p = penceredekiOturum(simdi);
      if (govde.test !== true && !testAdresine && !p) return json({ ok: false, hata: "Şu an zamanlanmış rapor saati değil." }, 403);
      oturum = testAdresine && IC_RAPOR_OTURUMLARI.includes(govde.oturum as IcRaporOturumu) ? (govde.oturum as IcRaporOturumu) : (p ?? saateGoreOturum(simdi));
    } else {
      oturum = IC_RAPOR_OTURUMLARI.includes(govde.oturum as IcRaporOturumu) ? (govde.oturum as IcRaporOturumu) : (penceredekiOturum(simdi) ?? saateGoreOturum(simdi));
    }
    const deneme = yetkili && govde.deneme === true;
    const test = !deneme && (govde.test === true || testAdresine);
    const gruplu = GRUPLU_CANLI; // test maili de canli gorunumle ayni
    // Sabah raporu DUNU anlatir
    const tarih = (yetkili || testAdresine) && govde.tarih && /^\d{4}-\d{2}-\d{2}$/.test(govde.tarih) ? govde.tarih : oturum === "sabah" ? gunEkle(trBugun(), -1) : trBugun();

    // Sirketler: alici tanimli olanlar (yetkili kullanicida yalniz kendi sirketi)
    const ayarlar = await hepsiniCek<{ company_id: string; gunluk_rapor_eposta: string | null }>(`ic_piyasa_ayarlari?select=company_id,gunluk_rapor_eposta&order=company_id`);
    const hedefler = ayarlar.filter((a) => (!yetkili || a.company_id === yetkiliSirket) && (deneme || (a.gunluk_rapor_eposta || "").trim()));
    const sirketler = hedefler.length ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(hedefler.map((h) => h.company_id))}&order=id`) : [];

    const sonuclar: Record<string, unknown>[] = [];
    for (const h of hedefler) {
      const sirketAdi = (sirketler.find((s) => s.id === h.company_id)?.company_name || "").replace(/[<>"]/g, "").trim() || "Unex Gıda";
      const alicilar = testAdresine ? TEST_ALICISI : Array.from(new Set((h.gunluk_rapor_eposta || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => EPOSTA_RE.test(x)))).slice(0, 5);
      const rapor = await sirketRaporu(h.company_id, tarih);
      const konu = `${test ? "[TEST] " : ""}${icGunlukRaporKonusu(rapor, sirketAdi, oturum)}`;
      const html = icGunlukRaporHtml(rapor, sirketAdi, new Date().toISOString(), oturum, { gruplu: gruplu || (deneme && govde.test_adresine === true), toplamlar: TOPLAM_CANLI || testAdresine || (deneme && govde.test_adresine === true) });
      if (deneme) { sonuclar.push({ tarih, oturum, konu, alicilar, ozet: rapor.ozet, html }); continue; }
      if (!alicilar.length) { sonuclar.push({ atlandi: "Geçerli alıcı yok." }); continue; }
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");

      // Test siniri: sirket basina son 24 saatte en fazla 3
      if (test) {
        const esik = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const t = await hepsiniCek<{ id: string }>(`ic_gunluk_rapor_gonderimleri?select=id&company_id=eq.${h.company_id}&test=is.true&olusturma=gte.${encodeURIComponent(esik)}&order=id`);
        if (t.length >= 3) { sonuclar.push({ atlandi: "Son 24 saatte en fazla 3 test raporu gönderilebilir." }); continue; }
      }
      // Tekrar korumasi (test haric): sirket + gun + oturum icin tek kayit
      if (!test) {
        // Kismi benzersiz index (where not test) on_conflict ile hedeflenemez: once var mi bak, sonra ekle;
        // yaris durumunda index ikinci eklemeyi 409 ile reddeder -> atlanir.
        const var_ = await hepsiniCek<{ id: string }>(`ic_gunluk_rapor_gonderimleri?select=id&company_id=eq.${h.company_id}&rapor_tarihi=eq.${tarih}&oturum=eq.${oturum}&test=is.false&order=id`);
        if (var_.length) { sonuclar.push({ atlandi: "Bu oturumun raporu zaten gönderilmiş." }); continue; }
        const k = await fetch(`${SUPABASE_URL}/rest/v1/ic_gunluk_rapor_gonderimleri`, {
          method: "POST",
          headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ company_id: h.company_id, rapor_tarihi: tarih, oturum, durum: "gonderiliyor", test: false }),
        });
        if (k.status === 409) { await k.body?.cancel(); sonuclar.push({ atlandi: "Bu oturumun raporu zaten gönderilmiş." }); continue; }
        if (!k.ok) throw new Error(`ic_gunluk_rapor_gonderimleri yazılamadı (HTTP ${k.status}): ${(await k.text()).slice(0, 200)}`);
        await k.body?.cancel();
      }
      const filtre = `company_id=eq.${h.company_id}&rapor_tarihi=eq.${tarih}&oturum=eq.${oturum}&test=is.false`;
      const mRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${sirketAdi} İç Piyasa <bildirim@ihracatasistanim.com>`, to: alicilar, subject: konu, html }),
      });
      if (!mRes.ok) {
        const hata = (await mRes.text()).slice(0, 300);
        if (!test) await fetch(`${SUPABASE_URL}/rest/v1/ic_gunluk_rapor_gonderimleri?${filtre}`, { method: "DELETE", headers: basliklar });
        throw new Error(`Mail gönderilemedi (HTTP ${mRes.status}): ${hata}`);
      }
      const kayit = { durum: "gonderildi", alicilar: alicilar.join(","), ozet: rapor.ozet, gonderim_zamani: new Date().toISOString() };
      await fetch(`${SUPABASE_URL}/rest/v1/ic_gunluk_rapor_gonderimleri${test ? "" : `?${filtre}`}`, {
        method: test ? "POST" : "PATCH",
        headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(test ? { ...kayit, company_id: h.company_id, rapor_tarihi: tarih, oturum, test: true } : kayit),
      });
      sonuclar.push({ gonderildi: true, test, tarih, oturum, konu: yetkili ? konu : undefined, alici: yetkili ? alicilar : undefined, ozet: yetkili ? rapor.ozet : undefined });
    }
    if (!yetkili) return json({ ok: true, test, tarih, oturum, gonderilen: sonuclar.filter((x) => x.gonderildi).length, atlanan: sonuclar.filter((x) => x.atlandi).length });
    return json({ ok: true, deneme, test, tarih, oturum, sonuclar });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("ic-gunluk-rapor hata:", mesaj);
    return json({ ok: false, hata: mesaj }, 500);
  }
});
