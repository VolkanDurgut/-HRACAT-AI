import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { AcenteTablosu } from "../_shared/navlun-oku.ts";
import { bizdenMi, tarifeSatirlari, tutarAdaylari, yeniKisim } from "../_shared/navlun-oku.ts";
import { acenteOgren, adayKaydi, mesajIsle, type NavlunGirdi } from "../_shared/navlun-isle.ts";
import { alintiKimligi, alintiMesajlari, genelTarifeMi, govdeImzasi } from "../_shared/navlun-alinti.ts";
import { htmlTemizle, yzDenetle, yzGerekli } from "../_shared/navlun-yz.ts";
import { navlunYzOku, type YzDosya } from "../_shared/navlun-yz-cagri.ts";
import { kalemleriOku, KALEM_ADI, type NavlunKalem } from "../_shared/navlun-kalem.ts";
import { baglamKur, enIyiSec, karsilastir, type AcenteHafizasi, type Karsilastirma, type LimanKurali } from "../_shared/navlun-karsilastirma.ts";
import { guncelKur } from "../_shared/doviz-kur.ts";
import { limanAnahtari } from "../_shared/liman-anahtari.ts";
import { acenteGecerlilikleri, enIyileriSec, gecerlilikBitisi, gerceklesenKarsilastir, limanEs, teklifDurumu, type TeklifAdayi } from "../_shared/navlun-degerlendirme.ts";
import type { Kur } from "../_shared/navlun-kalem.ts";

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
//   13.11.2026 sagalama sonrasi korumalar (alintiKontrol): yalniz FIYATLI teklif; ayni acente + liman + tutar +-4 saat icinde
//   baska kayitta varsa ATLANIR (asli farkli baslik / imza ile gelmis olsa bile); konudaki liman metinde gecmiyor ve 3+ fiyat
//   varsa (genel tarife) ATLANIR. Yeniden islemede kurala uymayan alinti kaydi "bilgi"ye cekilir (olaylari silinir, notu yazar).
// 13.11.2026 FREE TIME / TRANSIT TAMAMLAMA: fiyatsiz acente cevabi ("14 gun free time mevcut, tt 44 gun") ayni acentenin
//   ayni limana son 7 gundeki teklifinin BOS free time / transit alanini doldurur (dolu alana dokunmaz).
// 24.11.2026 KARMA OKUMA + KALEMLER (kullanici onayi):
//   - Her mailin teklif kalemleri (muhur, lokal tablosu, VGM, ENS ...) kuralla okunur ve navlun_mesajlari.kalemler'e yazilir
//     (_shared/navlun-kalem.ts). Konteyner basi toplami KOD hesaplar (navlun-karsilastirma.ts); bugun ekrana bagli degil.
//   - Yapay zeka (Gemini, sabit JSON semasi) YALNIZ kurallarin okuyamadigi mailde ve YALNIZ secret NAVLUN_YZ = "acik" ise
//     calisir (_shared/navlun-yz.ts: ne zaman + denetim). Denetimden gecmeyen oneri kaydedilmez: mail "okunamadi"
//     (kontrol bekliyor) listesine duser, oneri notta gorunur. Mesajda istege bagli govde_html (tablo yapisi korunur) ve
//     ekler [{ad, mime, veri(base64)}] (PDF / gorsel / Excel) gelebilir; ekler saklanmaz, yalniz okunur.
//   - Salt okunur islemler (yazma yok): "kalem_raporu" (eski / yeni konteyner basi toplam fark listesi) ve "yz_dene"
//     (gecmis mailleri yapay zekayla okuyup denetim sonucunu elle girilenle karsilastirir). Anahtar: x-pazar-anahtar ya da
//     x-rapor-anahtar (vault 'navlun_rapor_anahtari'; RPC navlun_rapor_anahtari_dogru ile, yalniz service_role).
// 24.11.2026 ASAMA 1 TEK HESAP YERI: "degerlendir" her teklifin konteyner basi toplamini, gecerliligini, durumunu ve liman
//   basina en iyiyi navlun_teklif_degerlendirme'ye; yukleme planindaki gerceklesen navlunun teklifle karsilastirmasini
//   navlun_gerceklesen_kontrol'e yazar (_shared/navlun-degerlendirme.ts). Her kaydet / yeniden_isle sonunda ve 15 dakikada
//   bir (cron, rapor anahtari) calisir. Gunun TCMB kuru doviz_kurlari'na yazilir. Is kayitlarina YAZMAZ.
// Acente alan adlari repoda degil, navlun_acenteler tablosunda. Tabloda olmayan bir alan adi "NAVLUN TALEBI"
//   konulu mailde acikca teklif verirse otomatik eklenir (yanit: ogrenilen).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANAHTAR = (Deno.env.get("PAZAR_GELEN_ANAHTAR") || "").trim();
const YZ_ACIK = (Deno.env.get("NAVLUN_YZ") || "").trim().toLowerCase() === "acik";
/** Bir kaydet isteginde en fazla kac mail yapay zekayla okunur (sure siniri) */
const YZ_ISTEK_SINIRI = 2;
/** Yapay zeka icin istek basina sure butcesi (ms); asilirsa kalan aday kurallarin sonucuyla kalir */
const YZ_SURE_BUTCESI = 70_000;
/** Rapor anahtariyla (vault) cagrilabilen sunucu islemleri: salt okunur raporlar + yalniz TURETILMIS tablolari yazan "degerlendir" */
const RAPOR_ISLEMLERI = new Set(["kalem_raporu", "yz_dene", "degerlendir"]);
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pazar-anahtar",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

function anahtarDogru(gelen: string, beklenen: string = ANAHTAR): boolean {
  if (beklenen.length < 24 || gelen.length !== beklenen.length) return false;
  let fark = 0;
  for (let i = 0; i < gelen.length; i++) fark |= gelen.charCodeAt(i) ^ beklenen.charCodeAt(i);
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
const FIYATLI = new Set(["teklif", "karsi_teklif"]);

/**
 * Alintidan cikan kayit kaydedilmeli mi? Uygunsa null, degilse nedeni.
 * sadeceDogrudan: yeniden islemede yalniz dogrudan gelmis (alinti olmayan) kayitlarla karsilastirilir.
 */
async function alintiKontrol(sirket: string, k: Kayit, govde: string, sadeceDogrudan: boolean): Promise<string | null> {
  const fiyatli = k.olaylar.filter((o) => FIYATLI.has(o.tur) && o.tutar !== null);
  if (!fiyatli.length) return "fiyat yok";
  if (genelTarifeMi(govde, k.liman, tutarAdaylari(govde))) return "genel tarife (konudaki liman metinde geçmiyor)";
  // 17.11.2026: cok limanli tarife ("LIMAN (ULKE) USD 1940" satirlari) alintidan alinmaz; eski tarife guncelini ezmesin
  if (tarifeSatirlari(govde)) return "genel tarife (çok limanlı tablo)";
  if (!k.acente) return null;
  const t = Date.parse(k.tarih);
  const bas = new Date(t - 4 * SAAT).toISOString(), bit = new Date(t + 4 * SAAT).toISOString();
  const var_ = await oku<{ liman_anahtar: string | null; tutar: number | string | null }>(
    `navlun_teklifleri?select=liman_anahtar,tutar&company_id=eq.${sirket}&acente=eq.${encodeURIComponent(k.acente)}` +
    `&tur=in.(teklif,karsi_teklif)&tarih=gte.${encodeURIComponent(bas)}&tarih=lte.${encodeURIComponent(bit)}` +
    `&mesaj_id=neq.${encodeURIComponent(k.mesaj_id)}${sadeceDogrudan ? "&mesaj_id=not.like.alinti:*" : ""}&limit=200`);
  const ayni = (o: Kayit["olaylar"][number]) => var_.some((x) => x.liman_anahtar === o.liman_anahtar && Number(x.tutar) === Number(o.tutar));
  return fiyatli.every(ayni) ? "aynı teklif zaten kayıtlı" : null;
}

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
    if (await alintiKontrol(sirket, k, g.govde, false)) continue;
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

/** Fiyatsiz acente cevabindaki free time / transit / armator: ayni acente + liman, son 7 gundeki teklifin BOS alanlarina (acik free time guncellemesi: son 30 gun, dolu alan da). */
async function bilgiTamamla(sirket: string, kayitlar: Kayit[]): Promise<number> {
  let n = 0;
  for (const k of kayitlar) {
    if (k.durum !== "bilgi" || !k.acente || !k.liman_anahtar || k.mesaj_id.startsWith("alinti:")) continue;
    const ft = k.ek_bilgi.free_time_gun, tt = k.ek_bilgi.transit_gun, arm = k.ek_bilgi.armator;
    // [alan, deger, dolu alani da ezer mi]. 17.11.2026: "ft 21 gun olarak devam edilecektir" gibi acik guncelleme dolu free time'i
    // da degistirir (son 30 gunun teklifleri); kisa cevaptaki armator ("<Armator> 40 gun") yalniz bossa yazilir.
    const alanlar: [string, unknown, boolean][] = [];
    if (ft !== null && ft > 0 && ft <= 60) alanlar.push(["free_time_gun", ft, k.ek_bilgi.ft_guncel]);
    if (tt && /^\d{1,3}(-\d{1,3})?$/.test(tt)) alanlar.push(["transit_gun", tt, false]);
    if (arm) alanlar.push(["armator", arm, false]);
    const t = Date.parse(k.tarih);
    if (!alanlar.length || !Number.isFinite(t)) continue;
    const bit = new Date(t).toISOString();
    for (const [alan, deger, ezer] of alanlar) {
      const bas = new Date(t - (ezer ? 30 : 7) * 24 * SAAT).toISOString();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/navlun_teklifleri?company_id=eq.${sirket}&acente=eq.${encodeURIComponent(k.acente)}&liman_anahtar=eq.${encodeURIComponent(k.liman_anahtar)}` +
        `&tur=in.(teklif,karsi_teklif)&tarih=gte.${encodeURIComponent(bas)}&tarih=lte.${encodeURIComponent(bit)}${ezer ? `&or=(${alan}.is.null,${alan}.neq.${deger})` : `&${alan}=is.null`}`,
        { method: "PATCH", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ [alan]: deger }) });
      if (res.ok) n += ((await res.json()) as unknown[]).length; else console.error("navlun bilgi tamamlanamadi", res.status, (await res.text()).slice(0, 200));
    }
  }
  return n;
}


// ============================================================================
// 24.11.2026 YAPAY ZEKA (karma okuma) + KALEM RAPORU
// ============================================================================
const DOSYA_SINIRI = 8_000_000;   // base64 karakter (~6 MB) / dosya
const TOPLAM_DOSYA_SINIRI = 16_000_000;

/** Istekteki ekler: en fazla 4, boyut sinirli, yalniz PDF / gorsel / Excel. */
function dosyalariAl(v: unknown): YzDosya[] {
  if (!Array.isArray(v)) return [];
  const out: YzDosya[] = [];
  let toplam = 0;
  for (const x of v.slice(0, 4)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const ad = kirp(r.ad, 120), mime = kirp(r.mime, 120).toLowerCase(), veri = typeof r.veri === "string" ? r.veri : "";
    if (!veri || veri.length > DOSYA_SINIRI || toplam + veri.length > TOPLAM_DOSYA_SINIRI || !/^[A-Za-z0-9+/=\s]+$/.test(veri.slice(0, 2000))) continue;
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/.test(mime) && !/spreadsheetml|ms-excel/.test(mime) && !/\.xlsx?$|\.xlsm$/i.test(ad)) continue;
    toplam += veri.length;
    out.push({ ad, mime, veri: veri.replace(/\s+/g, "") });
  }
  return out;
}

type Referans = (liman: string | null, ekipman: string) => number | null;

/** Son 120 gunun teklif medyani (liman + ekipman, USD): dosyadan okunan teklif icin olagandisi kontrolu. */
async function referansKur(sirket: string): Promise<Referans> {
  const bas = new Date(Date.now() - 120 * 24 * SAAT).toISOString();
  const satir = await oku<{ liman_anahtar: string | null; ekipman: string | null; tutar: number | string | null; para_birimi: string | null }>(
    `navlun_teklifleri?select=liman_anahtar,ekipman,tutar,para_birimi&company_id=eq.${sirket}&tur=in.(teklif,karsi_teklif)&tarih=gte.${encodeURIComponent(bas)}&limit=5000`);
  const grup = new Map<string, number[]>();
  for (const r of satir) {
    if (!r.liman_anahtar || r.tutar == null || (r.para_birimi && r.para_birimi !== "USD")) continue;
    const k = `${r.liman_anahtar}|${(r.ekipman || "20DC").startsWith("40") ? "40" : "20"}`;
    if (!grup.has(k)) grup.set(k, []);
    grup.get(k)!.push(Number(r.tutar));
  }
  const medyan = new Map<string, number>();
  for (const [k, xs] of grup) { if (xs.length < 2) continue; xs.sort((a, b) => a - b); medyan.set(k, xs[Math.floor(xs.length / 2)]); }
  return (liman, ekipman) => (liman ? medyan.get(`${liman}|${ekipman.startsWith("40") ? "40" : "20"}`) ?? null : null);
}

const tutarYaz = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/** Yapay zeka metni: tablo yapisi korunmus HTML (varsa) ya da mailin yeni kismi + ek metni. */
function yzMetni(g: NavlunGirdi, html: string): string {
  const govde = html ? htmlTemizle(html) : "";
  const ana = govde && govde.length > 40 ? govde : yeniKisim(g.govde);
  return (ana + (g.ek_metin.trim() ? `\n\nEK METNI (yazi tanima):\n${g.ek_metin}` : "")).slice(0, 20000);
}

/** Kurallarin okuyamadigi maili yapay zekayla okur; denetimden gecerse teklif olur, gecmezse "okunamadi" (kontrol bekliyor). */
async function yzUygula(k: Kayit, g: NavlunGirdi, html: string, dosyalar: YzDosya[], neden: string, referans: Referans | null): Promise<Kayit> {
  const metin = yzMetni(g, html);
  const notEkle = (s: string) => (s + (k.ozet ? `\n${k.ozet}` : "")).slice(0, 2000);
  const s = await navlunYzOku(g.konu, metin, dosyalar);
  if (!s.ok) return { ...k, durum: k.durum === "okundu" ? "okundu" : "okunamadi", ozet: notEkle(`Yapay zekâ okuyamadı (${s.hata}); kontrol bekliyor. Neden: ${neden}.`) };
  const dosyadan = s.dosyalar.some((ad) => dosyalar.find((d) => d.ad === ad && /pdf|image/.test(d.mime)));
  const d = yzDenetle(s.cikti, { metin, konuLimanAnahtar: k.liman_anahtar, referans: referans ?? undefined, dosyadan });
  if (!d.teklifler.length && !d.sorunlar.length) {
    return { ...k, ozet: k.durum === "okunamadi" ? notEkle("Yapay zekâ da fiyat bulamadı; kontrol bekliyor.") : k.ozet };
  }
  const oneriler = d.teklifler.map((t) => `${t.liman ?? "?"} ${t.ekipman} ${tutarYaz(t.tutar)} ${t.para}${t.lokal_dahil === true ? " lokal dahil" : t.lokal_dahil === false ? " + lokal" : ""}`).join("; ");
  if (!d.gecti) {
    return { ...k, durum: "okunamadi", ozet: notEkle(`Yapay zekâ önerisi denetimden geçmedi, kontrol bekliyor. Öneri: ${oneriler || "yok"}. Sorun: ${d.sorunlar.join(" ")}`) };
  }
  const kaynak: Kayit["kaynak"] = dosyadan ? (dosyalar.some((x) => x.mime === "application/pdf") ? "pdf" : "gorsel") : k.kaynak;
  const olaylar = [
    ...k.olaylar.filter((o) => o.tur !== "ek_teklif" && !FIYATLI.has(o.tur)),
    ...d.teklifler.map((t) => ({
      tur: "teklif" as const, liman: t.liman ?? k.liman, liman_anahtar: t.liman_anahtar ?? k.liman_anahtar, tutar: t.tutar, ekipman: t.ekipman,
      armator: t.armator, free_time_gun: t.free_time_gun, transit_gun: t.transit_gun, gecerlilik: t.gecerlilik, lokal_dahil: t.lokal_dahil, pol: null,
      ...(t.para === "EUR" ? { para_birimi: "EUR" as const } : {}),
    })),
  ];
  return {
    ...k, durum: "okundu", kaynak, olaylar,
    kalemler: k.kalemler.length ? k.kalemler : d.kalemler,
    ozet: notEkle(`Yapay zekâ ile okundu, denetimden geçti (${neden}): ${oneriler}.${d.notlar.length ? " Not: " + d.notlar.join(" ") : ""}`),
  };
}

type MesajSatiri = { id: string; mesaj_id: string; konu: string | null; gonderen: string | null; govde: string | null; ek_metin: string | null; ek_kaynak: string | null; durum: string; tarih: string };

/** Karsilastirma baglami (navlun-veri.ts ile ayni tablolar). */
async function baglamOku(sirket: string) {
  const [hafiza, kurallar, kanit, tum] = await Promise.all([
    oku<AcenteHafizasi & { lokal_20: number | string | null; lokal_40: number | string | null; ek_kont: number | string }>(
      `navlun_acente_hafizasi?select=acente_anahtar,acente_ad,lokal,lokal_20,lokal_40,ek_kont,guven,kanit&company_id=eq.${sirket}&order=acente_anahtar`),
    oku<LimanKurali>(`navlun_liman_kurallari?select=liman_anahtar,temel,aciklama&company_id=eq.${sirket}&order=liman_anahtar`),
    oku<{ acente: string | null; varis_limani: string | null; etd: string | null; navlun_kont: number | string | null; lokal_kont: number | string | null; navlun_para: string | null }>(
      `sevkiyat_plani?select=acente,varis_limani,etd,navlun_kont,lokal_kont,navlun_para&company_id=eq.${sirket}&navlun_kont=not.is.null&order=id`),
    oku<{ acente: string | null; tutar: number | string; para_birimi: string | null; ekipman: string | null; lokal_dahil: boolean | null; liman_anahtar: string | null; tarih: string }>(
      `navlun_teklifleri?select=acente,tutar,para_birimi,ekipman,lokal_dahil,liman_anahtar,tarih&company_id=eq.${sirket}&tur=in.(teklif,karsi_teklif)&tutar=not.is.null&order=tarih,id&limit=10000`),
  ]);
  const sayi = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return baglamKur(
    hafiza.map((h) => ({ ...h, lokal_20: sayi(h.lokal_20), lokal_40: sayi(h.lokal_40), ek_kont: Number(h.ek_kont || 0) })),
    kurallar,
    tum.map((t) => ({ ...t, tutar: Number(t.tutar) })),
    kanit.map((x) => ({ acente: x.acente, liman_anahtar: limanAnahtari(x.varis_limani), etd: x.etd, navlun: sayi(x.navlun_kont), lokal: sayi(x.lokal_kont), para: x.navlun_para })),
  );
}

const kalemYaz = (k: NavlunKalem) => `${KALEM_ADI[k.kod]} ${tutarYaz(k.tutar)} ${k.para}${k.ekipman ? `/${k.ekipman}'` : ""}${k.birim === "bl" ? " (BL başı)" : k.birim === "islem" ? " (işlem başı)" : ""}${k.kosullu ? " (koşullu)" : ""}`;

/**
 * SALT OKUNUR fark listesi: son N gunun teklifleri icin bugunku konteyner basi toplam (eski) ile maildeki kalemler + kur ile
 * hesaplanan (yeni) toplam; degisenler, kontrol gerektirenler ve limanlarda "en iyi" teklifin degistigi yerler.
 */
async function kalemRaporu(sirket: string, gunHam: number) {
  const gun = Math.max(1, Math.min(120, Math.floor(gunHam)));
  const bas = new Date(Date.now() - gun * 24 * SAAT).toISOString();
  const [kur, baglam, mesajlar, teklifler] = await Promise.all([
    guncelKur(),
    baglamOku(sirket),
    oku<MesajSatiri>(`navlun_mesajlari?select=id,mesaj_id,konu,gonderen,govde,ek_metin,ek_kaynak,durum,tarih&company_id=eq.${sirket}&tarih=gte.${encodeURIComponent(bas)}&order=tarih&limit=2000`),
    oku<{ mesaj_id: string; acente: string | null; liman_anahtar: string | null; ekipman: string | null; tutar: number | string; para_birimi: string | null; lokal_dahil: boolean | null; tarih: string; kaynak: string }>(
      `navlun_teklifleri?select=mesaj_id,acente,liman_anahtar,ekipman,tutar,para_birimi,lokal_dahil,tarih,kaynak&company_id=eq.${sirket}&tur=in.(teklif,karsi_teklif)&tutar=not.is.null&tarih=gte.${encodeURIComponent(bas)}&order=tarih&limit=5000`),
  ]);
  const kalemMap = new Map<string, NavlunKalem[]>();
  for (const m of mesajlar) kalemMap.set(m.mesaj_id, bizdenMi((m.gonderen || "").toLowerCase()) ? [] : kalemleriOku(yeniKisim(m.govde || "") + (m.ek_metin ? "\n" + m.ek_metin : "")));
  type Satir = { tarih: string; acente: string | null; liman: string | null; ekipman: string; tutar: number; para: string; eski: Karsilastirma; yeni: Karsilastirma };
  const satirlar: Satir[] = teklifler.map((t) => {
    const temel = { acente: t.acente, tutar: Number(t.tutar), ekipman: t.ekipman || "20DC", lokal_dahil: t.lokal_dahil, liman_anahtar: t.liman_anahtar };
    return {
      tarih: t.tarih.slice(0, 10), acente: t.acente, liman: t.liman_anahtar, ekipman: temel.ekipman, tutar: temel.tutar, para: t.para_birimi || "USD",
      eski: karsilastir(temel, baglam),
      yeni: karsilastir({ ...temel, kalemler: kalemMap.get(t.mesaj_id) ?? [], para_birimi: t.para_birimi }, baglam, kur),
    };
  });
  const ozet = (k: Karsilastirma) => ({ toplam: k.toplam, kesin: k.kesin, metin: k.metin });
  const degisen = satirlar.filter((s) => Math.abs(s.eski.toplam - s.yeni.toplam) > 0.5 || s.eski.kesin !== s.yeni.kesin).map((s) => ({
    tarih: s.tarih, acente: s.acente, liman: s.liman, ekipman: s.ekipman, tutar: s.tutar, para: s.para,
    eski: ozet(s.eski), yeni: { ...ozet(s.yeni), celiski: s.yeni.celiski ?? null },
    kalemler: s.yeni.kalem ? [...s.yeni.kalem.lokalKalemler, ...s.yeni.kalem.ekKalemler].map(kalemYaz) : [],
    toplama_girmeyen: s.yeni.kalem ? s.yeni.kalem.digerleri.slice(0, 6).map(kalemYaz) : [],
  }));
  // Liman bazinda en iyi (her acentenin o limana en son 20'lik teklifi)
  const limanlar = new Map<string, Map<string, Satir>>();
  for (const s of satirlar) {
    if (!s.liman || s.ekipman !== "20DC") continue;
    const m = limanlar.get(s.liman) ?? new Map<string, Satir>();
    const a = s.acente || "?";
    const v = m.get(a);
    if (!v || v.tarih <= s.tarih) m.set(a, s);
    limanlar.set(s.liman, m);
  }
  const siralama: unknown[] = [];
  for (const [liman, m] of limanlar) {
    const liste = [...m.values()];
    if (liste.length < 2) continue;
    const e = enIyiSec(liste, (x) => x.eski).enIyi, y = enIyiSec(liste, (x) => x.yeni).enIyi;
    if ((e?.acente ?? null) !== (y?.acente ?? null) || (e && y && Math.abs(e.eski.toplam - y.yeni.toplam) > 0.5)) {
      siralama.push({ liman, eski_en_iyi: e ? `${e.acente} ${tutarYaz(e.eski.toplam)}` : null, yeni_en_iyi: y ? `${y.acente} ${tutarYaz(y.yeni.toplam)}` : null, teklif_sayisi: liste.length });
    }
  }
  return {
    gun, kur, teklif: satirlar.length, degisen_sayi: degisen.length,
    kalemli_mesaj: [...kalemMap.values()].filter((x) => x.length).length, mesaj: mesajlar.length,
    kontrol_gereken: degisen.filter((d) => d.eski.kesin && !d.yeni.kesin).length,
    degisen, siralama,
  };
}

/** SALT OKUNUR: gecmis mailleri yapay zekayla okur, denetler ve elle girilen teklifle yan yana dondurur (hicbir sey yazmaz). */
async function yzDene(sirket: string, acenteler: AcenteTablosu, idler: string[], adet: number, atla: number) {
  const secim = idler.length
    ? `&id=in.(${idler.join(",")})`
    : `&durum=in.(duzeltildi,okunamadi)&govde=not.is.null&order=tarih.desc&limit=${adet}&offset=${atla}`;
  const mesajlar = await oku<MesajSatiri>(`navlun_mesajlari?select=id,mesaj_id,konu,gonderen,govde,ek_metin,ek_kaynak,durum,tarih&company_id=eq.${sirket}${secim}`);
  const referans = await referansKur(sirket).catch(() => null);
  const sonuc: unknown[] = [];
  for (const m of mesajlar.slice(0, 6)) {
    const g: NavlunGirdi = { mesaj_id: m.mesaj_id, gonderen: (m.gonderen || "").toLowerCase(), konu: m.konu || "", govde: m.govde || "", tarih: m.tarih, ek_metin: m.ek_metin || "", ek_kaynak: m.ek_kaynak || "" };
    const k = mesajIsle(g, acenteler);
    const metin = yzMetni(g, "");
    const elle = await oku<{ liman_anahtar: string | null; ekipman: string | null; tutar: number | string | null; lokal_dahil: boolean | null; kaynak: string }>(
      `navlun_teklifleri?select=liman_anahtar,ekipman,tutar,lokal_dahil,kaynak&company_id=eq.${sirket}&mesaj_id=eq.${encodeURIComponent(m.mesaj_id)}&tur=in.(teklif,karsi_teklif)`);
    const t0 = Date.now();
    const s = await navlunYzOku(g.konu, metin, []);
    const d = s.ok ? yzDenetle(s.cikti, { metin, konuLimanAnahtar: k?.liman_anahtar ?? null, referans: referans ?? undefined }) : null;
    sonuc.push({
      id: m.id, durum: m.durum, tarih: m.tarih.slice(0, 10), konu: g.konu.slice(0, 80), ek_kaynak: m.ek_kaynak, sure_ms: Date.now() - t0,
      kayitli: elle.map((e) => `${e.liman_anahtar ?? "?"} ${e.ekipman ?? "?"} ${e.tutar ?? "?"}${e.lokal_dahil === true ? " dahil" : e.lokal_dahil === false ? " haric" : ""} [${e.kaynak}]`),
      yz: s.ok ? d!.teklifler.map((t) => `${t.liman_anahtar ?? "?"} ${t.ekipman} ${t.tutar} ${t.para}${t.lokal_dahil === true ? " dahil" : t.lokal_dahil === false ? " haric" : ""}`) : null,
      gecti: d?.gecti ?? false, sorunlar: d?.sorunlar ?? [], notlar: d?.notlar ?? [], hata: s.ok ? null : s.hata,
      kalemler: d ? d.kalemler.map(kalemYaz) : [], kural_kalemler: kalemleriOku(metin).map(kalemYaz),
    });
  }
  return { adet: sonuc.length, sonuc };
}


// ============================================================================
// 24.11.2026 ASAMA 1: DEGERLENDIRME (tek hesap yeri)
// ============================================================================
const bugunIst = () => new Date(Date.now() + 3 * SAAT).toISOString().slice(0, 10);
const DEGERLENDIRME_GUN = 150;

/** Upsert (on_conflict) - parcali */
async function yaz(tablo: string, cakisma: string, satirlar: unknown[]): Promise<void> {
  for (let i = 0; i < satirlar.length; i += 200) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablo}?on_conflict=${cakisma}`, {
      method: "POST",
      headers: { ...basliklar, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(satirlar.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`${tablo} yazılamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Bu calismada yenilenmeyen (penceresi disina cikan / silinen) satirlar */
async function eskileriSil(tablo: string, sirket: string, bas: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablo}?company_id=eq.${sirket}&hesap_zamani=lt.${encodeURIComponent(bas)}`, { method: "DELETE", headers: basliklar });
  if (!res.ok) console.error("navlun degerlendirme eski silinemedi", tablo, res.status);
}

/** Gunun kuru (TCMB) doviz_kurlari'na; gecmis gunler icin tablodaki en yakin onceki kur */
async function kurlariHazirla(): Promise<{ bugun: Kur; kurBul: (gun: string) => Kur }> {
  const bugun = await guncelKur();
  if (bugun.tarih.startsWith("TCMB")) {
    await yaz("doviz_kurlari", "tarih", [{ tarih: bugunIst(), eur_usd: bugun.EUR, try_usd: bugun.TRY, kaynak: bugun.tarih }]).catch((e) => console.error("doviz kuru yazilamadi", e));
  }
  const kayit = await oku<{ tarih: string; eur_usd: number | string; try_usd: number | string; kaynak: string }>("doviz_kurlari?select=tarih,eur_usd,try_usd,kaynak&order=tarih");
  const kurlar = kayit.map((k) => ({ gun: k.tarih, kur: { EUR: Number(k.eur_usd), TRY: Number(k.try_usd), tarih: k.kaynak } as Kur }));
  const kurBul = (gun: string): Kur => {
    let sec: Kur | null = null;
    for (const k of kurlar) { if (k.gun <= gun) sec = k.kur; else break; }
    return sec ?? kurlar[0]?.kur ?? bugun;
  };
  return { bugun, kurBul };
}

async function degerlendir(sirket: string) {
  const bas = new Date().toISOString();
  const bugun = bugunIst();
  const sinir = new Date(Date.now() - DEGERLENDIRME_GUN * 24 * SAAT).toISOString();
  const [{ bugun: kur, kurBul }, baglam, teklifler, mesajlar, sevkiyat] = await Promise.all([
    kurlariHazirla(),
    baglamOku(sirket),
    oku<{ id: string; mesaj_id: string; acente: string | null; liman_anahtar: string | null; ekipman: string | null; tutar: number | string; para_birimi: string | null; lokal_dahil: boolean | null; armator: string | null; gecerlilik: string | null; tarih: string; tur: string }>(
      `navlun_teklifleri?select=id,mesaj_id,acente,liman_anahtar,ekipman,tutar,para_birimi,lokal_dahil,armator,gecerlilik,tarih,tur&company_id=eq.${sirket}&tur=in.(teklif,karsi_teklif)&tutar=not.is.null&order=tarih,id&limit=10000`),
    oku<{ mesaj_id: string; gonderen: string | null; govde: string | null; ek_metin: string | null }>(
      `navlun_mesajlari?select=mesaj_id,gonderen,govde,ek_metin&company_id=eq.${sirket}&tarih=gte.${encodeURIComponent(sinir)}&limit=3000`),
    oku<{ id: string; booking_no: string | null; acente: string | null; varis_limani: string | null; etd: string | null; navlun_kont: number | string; lokal_kont: number | string | null; navlun_para: string | null; rezervasyon_id: string | null; dosya_id: string | null }>(
      `sevkiyat_plani?select=id,booking_no,acente,varis_limani,etd,navlun_kont,lokal_kont,navlun_para,rezervasyon_id,dosya_id&company_id=eq.${sirket}&navlun_kont=not.is.null&limit=5000`),
  ]);
  // Teklif degerlendirmesi (son 150 gun)
  const kalemMap = new Map<string, NavlunKalem[]>();
  for (const m of mesajlar) kalemMap.set(m.mesaj_id, bizdenMi((m.gonderen || "").toLowerCase()) ? [] : kalemleriOku(yeniKisim(m.govde || "") + (m.ek_metin ? "\n" + m.ek_metin : "")));
  const aliskanlik = acenteGecerlilikleri(teklifler);
  const pencere = teklifler.filter((t) => t.tarih >= sinir);
  const satirlar = pencere.map((t) => {
    const tutar = Number(t.tutar);
    const k = karsilastir({ acente: t.acente, tutar, ekipman: t.ekipman || "20DC", lokal_dahil: t.lokal_dahil, liman_anahtar: t.liman_anahtar,
      kalemler: kalemMap.get(t.mesaj_id) ?? [], para_birimi: t.para_birimi }, baglam, kur);
    const g = gecerlilikBitisi(t, aliskanlik);
    const durum = teklifDurumu(k, g.bitis, bugun);
    const kalem = k.kalem ? {
      lokal: k.kalem.lokalKalemler.map(kalemYaz), ek: k.kalem.ekKalemler.map(kalemYaz), diger: k.kalem.digerleri.slice(0, 12).map(kalemYaz), bolum: k.kalem.bolum,
    } : null;
    return {
      teklif_id: t.id, company_id: sirket, liman_anahtar: t.liman_anahtar, acente: t.acente, ekipman: t.ekipman, tutar, para: t.para_birimi || "USD",
      toplam_usd: k.toplam, lokal: k.lokal, ek: k.ek, lokal_durum: k.lokalDurum, metin: k.metin.slice(0, 300), dayanak: k.dayanak.slice(0, 1000),
      celiski: k.celiski ?? null, yaklasik: !!k.yaklasik, kalem, gecerlilik_bitis: g.bitis, gecerlilik_kaynagi: g.kaynak, durum, en_iyi: false,
      kur_tarihi: k.yaklasik ? kur.tarih : null, hesap_zamani: bas, _armator: t.armator, _tarih: t.tarih,
    };
  });
  const enIyi = enIyileriSec(satirlar.map((x) => ({ id: x.teklif_id, liman_anahtar: x.liman_anahtar, acente: x.acente, ekipman: x.ekipman, armator: x._armator, tarih: x._tarih, toplam: x.toplam_usd, durum: x.durum })));
  const teklifSatirlari = satirlar.map(({ _armator, _tarih, ...x }) => ({ ...x, en_iyi: enIyi.has(x.teklif_id) }));
  await yaz("navlun_teklif_degerlendirme", "teklif_id", teklifSatirlari);
  await eskileriSil("navlun_teklif_degerlendirme", sirket, bas);

  // Gerceklesen kontrolu: rezervasyon tarihi + teslim sekli
  const rezIdler = Array.from(new Set(sevkiyat.map((s) => s.rezervasyon_id).filter((x): x is string => !!x)));
  const dosyaIdler = Array.from(new Set(sevkiyat.map((s) => s.dosya_id).filter((x): x is string => !!x)));
  const parcali = async <T,>(idler: string[], yol: (liste: string) => string): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < idler.length; i += 100) out.push(...(await oku<T>(yol(idler.slice(i, i + 100).join(",")))));
    return out;
  };
  const [rezler, dosyalar] = await Promise.all([
    parcali<{ id: string; olusturma_tarihi: string | null }>(rezIdler, (l) => `rezervasyonlar?select=id,olusturma_tarihi&id=in.(${l})`),
    parcali<{ id: string; teslim_sekli: string | null }>(dosyaIdler, (l) => `ihracat_dosyalari?select=id,teslim_sekli&id=in.(${l})`),
  ]);
  const rezTarih = new Map(rezler.map((r) => [r.id, r.olusturma_tarihi]));
  const teslim = new Map(dosyalar.map((d) => [d.id, d.teslim_sekli]));
  const adaylar: TeklifAdayi[] = teklifler.map((t) => ({ id: t.id, acente: t.acente, liman_anahtar: t.liman_anahtar, ekipman: t.ekipman, tutar: Number(t.tutar), para: t.para_birimi, tarih: t.tarih, tur: t.tur }));
  const gercekSatirlari = sevkiyat.map((s) => {
    const rez = s.rezervasyon_id ? rezTarih.get(s.rezervasyon_id) : null;
    // Rezervasyon kaydi kalkistan sonra girilmis olabilir (sonradan girilen dosya): o zaman kalkis tarihi
    const referans = rez && s.etd && rez.slice(0, 10) <= s.etd ? rez.slice(0, 10) : s.etd;
    const liman = limanEs(limanAnahtari(s.varis_limani));
    const r = gerceklesenKarsilastir({
      id: s.id, booking_no: s.booking_no, acente: s.acente, liman_anahtar: liman, etd: s.etd, referans,
      gercek: Number(s.navlun_kont), lokal: s.lokal_kont == null ? null : Number(s.lokal_kont), para: s.navlun_para, teslim: s.dosya_id ? teslim.get(s.dosya_id) ?? null : null,
    }, adaylar, kurBul);
    return {
      sevkiyat_id: s.id, company_id: sirket, booking_no: s.booking_no, acente: s.acente, liman_anahtar: liman, etd: s.etd, referans_tarih: referans,
      gercek: Number(s.navlun_kont), para: s.navlun_para || "USD", ...r, hesap_zamani: bas,
    };
  });
  await yaz("navlun_gerceklesen_kontrol", "sevkiyat_id", gercekSatirlari);
  await eskileriSil("navlun_gerceklesen_kontrol", sirket, bas);

  const say = <T,>(xs: T[], f: (x: T) => string) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
  return {
    kur, teklif: teklifSatirlari.length, en_iyi: enIyi.size,
    teklif_durum: say(teklifSatirlari, (x) => x.durum), gecerlilik_kaynagi: say(teklifSatirlari, (x) => x.gecerlilik_kaynagi),
    gerceklesen: gercekSatirlari.length, gerceklesen_durum: say(gercekSatirlari, (x) => x.durum),
    tutmayan: gercekSatirlari.filter((x) => x.durum === "tutmuyor").map((x) => ({ booking: x.booking_no, liman: x.liman_anahtar, acente: x.acente, etd: x.etd, gercek: x.gercek, teklif: x.teklif_tutar, aciklama: x.aciklama })),
  };
}

/** Kayit sonrasi degerlendirme: hatasi asil kaydi asla bozmaz */
async function degerlendirSessiz(sirket: string): Promise<void> {
  try { await degerlendir(sirket); } catch (e) { console.error("navlun degerlendirme", e instanceof Error ? e.message : e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Yalnız POST." }, 405);
  try {
    const pazarYetkili = anahtarDogru(req.headers.get("x-pazar-anahtar") || "");
    const raporBaslik = (req.headers.get("x-rapor-anahtar") || "").trim();
    const raporYetkili = !pazarYetkili && raporBaslik.length >= 32 && raporBaslik.length <= 128
      && (await rpc<boolean>("navlun_rapor_anahtari_dogru", { p_anahtar: raporBaslik })).veri === true;
    if (!ANAHTAR && !raporYetkili) return json({ hata: "Navlun bildirimi kapalı (PAZAR_GELEN_ANAHTAR yok)." }, 503);
    if (!pazarYetkili && !raporYetkili) return json({ hata: "Yetkisiz." }, 401);
    const govde = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Rapor anahtari yalniz RAPOR_ISLEMLERI icin gecerli (salt okunur raporlar + turetilmis tablolari yazan degerlendir)
    if (!pazarYetkili && !RAPOR_ISLEMLERI.has(String(govde.islem))) return json({ hata: "Yetkisiz." }, 401);

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

    if (govde.islem === "kalem_raporu") return json(await kalemRaporu(sirket, Number(govde.gun) || 60));
    if (govde.islem === "degerlendir") return json(await degerlendir(sirket));
    if (govde.islem === "yz_dene") {
      const idler = Array.isArray(govde.idler) ? govde.idler.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 6) : [];
      return json(await yzDene(sirket, acenteler, idler, Math.max(1, Math.min(6, Math.floor(Number(govde.adet) || 4))), Math.max(0, Math.floor(Number(govde.atla) || 0))));
    }

    // 16.11.2026 "Yeniden oku": uygulamadan istenen tarih (betik her calismada sorar, sayfa sayfa ilerletir)
    if (govde.islem === "yeniden_oku_al") {
      const r = await rpc<Record<string, unknown>>("navlun_yeniden_oku_al", { p_company: sirket });
      return r.ok ? json(r.veri || {}) : json({ hata: r.hata || "Okunamadı." }, 500);
    }
    if (govde.islem === "yeniden_oku_ilerle") {
      const sayi = (v: unknown) => Math.max(0, Math.min(100000, Math.floor(Number(v) || 0)));
      const id = typeof govde.id === "string" && /^[0-9a-f-]{36}$/i.test(govde.id) ? govde.id : null;
      if (!id) return json({ hata: "Geçersiz istek." }, 400);
      const r = await rpc<Record<string, unknown>>("navlun_yeniden_oku_ilerle", {
        p_company: sirket, p_id: id, p_islenen: sayi(govde.islenen), p_gonderilen: sayi(govde.gonderilen), p_yeni: sayi(govde.yeni), p_bitti: govde.bitti === true,
      });
      return r.ok ? json(r.veri || {}) : json({ hata: r.hata || "Kaydedilemedi." }, 500);
    }

    // 11.11.2026: saklanan ham metinden yeniden okuma (okuyucu gelistikce betigi yeniden calistirmadan). Sayfa basina 50.
    if (govde.islem === "yeniden_isle") {
      const sayfa = Math.max(0, Math.floor(Number(govde.sayfa) || 0));
      const kayitli = await oku<{ mesaj_id: string; gonderen: string | null; konu: string | null; govde: string | null; tarih: string; ek_metin: string | null; ek_kaynak: string | null; ozet: string | null }>(
        `navlun_mesajlari?select=mesaj_id,gonderen,konu,govde,tarih,ek_metin,ek_kaynak,ozet&company_id=eq.${sirket}&govde=not.is.null&order=tarih,id&limit=50&offset=${sayfa * 50}`);
      const yeniden = [];
      for (const r of kayitli) {
        const k = mesajIsle({
          mesaj_id: r.mesaj_id, gonderen: (r.gonderen || "").toLowerCase(), konu: r.konu || "", govde: r.govde || "",
          tarih: r.tarih, ek_metin: r.ek_metin || "", ek_kaynak: r.ek_kaynak || "",
        }, acenteler);
        if (k && r.mesaj_id.startsWith("alinti:")) {
          // Alinti kaydi ayni kurallardan gecer; uymayan "bilgi"ye cekilir (olaylari silinir, kayit ve metin kalir)
          const neden = k.durum === "okundu" ? await alintiKontrol(sirket, k, r.govde || "", true) : "fiyat yok";
          if (neden) { yeniden.push({ ...k, durum: "bilgi" as const, olaylar: [], ozet: `Alıntı kayda alınmadı: ${neden}.` }); continue; }
          // "Alintidan kurtarildi" notu yeniden okumada silinmez
          if (r.ozet && r.ozet.startsWith("Alıntıdan kurtarıldı")) k.ozet = r.ozet;
        }
        if (k) yeniden.push(k);
      }
      if (!yeniden.length) return json({ islenen: 0, sayfa, devam: kayitli.length === 50 });
      const s = await rpc<Record<string, number>>("navlun_kaydet", { p_company: sirket, p_mesajlar: yeniden });
      if (!s.ok) return json({ hata: s.hata || "Kaydedilemedi." }, 500);
      const tamamlanan = await bilgiTamamla(sirket, yeniden).catch((e) => { console.error("navlun bilgi tamamlama", e); return 0; });
      await degerlendirSessiz(sirket);
      return json({ ...(s.veri || {}), islenen: yeniden.length, tamamlanan, sayfa, devam: kayitli.length === 50 });
    }

    if (govde.islem !== "kaydet") return json({ hata: "Bilinmeyen işlem." }, 400);
    const liste = Array.isArray(govde.mesajlar) ? govde.mesajlar.slice(0, 100) : [];
    const kayitlar: Kayit[] = [];
    const ogrenilen: string[] = [];
    const girdiler: { g: NavlunGirdi; alinti: string }[] = [];
    const yzAdaylari: { i: number; g: NavlunGirdi; html: string; dosyalar: YzDosya[]; neden: string }[] = [];
    let atlanan = 0;
    let aday = 0;
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
        // 16.11.2026: ogrenilemeyen cevap atilmaz; "teklif olabilir" listesi icin olaysiz saklanir (pasif alan adi haric)
        if (!k) { const a = adayKaydi(g, acenteler); if (a && !pasif.has((g.gonderen.split("@")[1] || "").toLowerCase())) { k = a; aday++; } }
      }
      girdiler.push({ g, alinti: kirp(r.alinti, 30000) });
      if (!k) { atlanan++; continue; }
      kayitlar.push(k);
      // 24.11.2026: kurallar okuyamadiysa yapay zeka adayi (yalniz NAVLUN_YZ acikken calisir)
      const dosyalar = dosyalariAl(r.ekler);
      const neden = yzGerekli({ durum: k.durum, acente: k.acente, fiyatli: k.olaylar.some((o) => FIYATLI.has(o.tur) && o.tutar !== null) },
        { govde: g.govde, ek_metin: g.ek_metin, dosyaSayisi: dosyalar.length, bizden: bizdenMi(g.gonderen) });
      if (neden) yzAdaylari.push({ i: kayitlar.length - 1, g, html: kirp(r.govde_html, 400000), dosyalar, neden });
    }
    let yzDenenen = 0, yzGecen = 0;
    if (YZ_ACIK && yzAdaylari.length) {
      const referans = await referansKur(sirket).catch(() => null);
      const yzBas = Date.now();
      for (const a of yzAdaylari.slice(0, YZ_ISTEK_SINIRI)) {
        if (Date.now() - yzBas > YZ_SURE_BUTCESI) break;
        try { kayitlar[a.i] = await yzUygula(kayitlar[a.i], a.g, a.html, a.dosyalar, a.neden, referans); yzDenenen++; if (kayitlar[a.i].durum === "okundu") yzGecen++; }
        catch (e) { console.error("navlun yz", a.g.mesaj_id, e instanceof Error ? e.message : e); }
      }
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
    if (!hepsi.length) return json({ yeni: 0, guncellenen: 0, atlanan, olay: 0, ogrenilen, kurtarilan: 0, yz: { acik: YZ_ACIK, aday: 0, denenen: 0, gecen: 0 } });
    const s = await rpc<Record<string, number>>("navlun_kaydet", { p_company: sirket, p_mesajlar: hepsi });
    if (!s.ok) return json({ hata: s.hata || "Kaydedilemedi." }, 500);
    const tamamlanan = await bilgiTamamla(sirket, kayitlar).catch((e) => { console.error("navlun bilgi tamamlama", e); return 0; });
    await degerlendirSessiz(sirket);
    const v = s.veri || {};
    return json({ ...v, atlanan: (v.atlanan || 0) + atlanan, okunamadi: kayitlar.filter((k) => k.durum === "okunamadi").length, ogrenilen, kurtarilan: kurtarilan.length, tamamlanan, aday,
      yz: { acik: YZ_ACIK, aday: yzAdaylari.length, denenen: yzDenenen, gecen: yzGecen } });
  } catch (e) {
    console.error("navlun-bildirimi", e);
    return json({ hata: "Beklenmeyen hata." }, 500);
  }
});
