import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adresAyir, alandanGelenBasliklar, alanKriteri, baslikCoz, imapOturumu, imapTarihi } from "../_shared/imap-oku.ts";
import { mimeBasliklari, mimeMetni } from "../_shared/mime-oku.ts";
import { isle, yeniDurum, yeniMetin, type AjanAyar, type Mail } from "../_shared/operasyon-ajan.ts";

// ============================================================================
// OPERASYON IMAP (operasyon-imap) - 17.11.2026, Operasyon Ajani Faz 1
// ============================================================================
// Sorun: execution@ -> arsiv Gmail iletmesi bazi acentelerin maillerini teslim edemiyor (28.10.2026'dan beri pilot
// acentenin hicbir maili arsive ulasmadi). Bu fonksiyon sirket kutusunu DOGRUDAN ve SALT OKUNUR okur (_shared/imap-oku.ts: EXAMINE + BODY.PEEK;
// hicbir mail okundu olmaz, silinmez, tasinmaz, gonderilmez).
//
// {"islem": "tara"} (pg_cron "operasyon-imap-tara", 5 dk; migration 20261117170000):
//   operasyon_acenteler'deki aktif acentelerin alan adlari gonderen / alici / bilgi olan Gelen Kutusu maillerini
//   UID sirasiyla okur (operasyon_imap_durum.son_uid'den devam; ilk calismada "baslangic" gununden), metni cikarir
//   (_shared/mime-oku.ts), kural motoruyla (_shared/operasyon-ajan.ts) isler ve operasyon_mailleri'ne yazar
//   (Message-ID ile tekrarsiz). Faz 1 = GOZLEM: is tablolarina yazilmaz, mail gonderilmez.
//   17.11.2026: konusu "NAVLUN" / "REZERVASYON TALEBI" olan ACENTE mailleri ayrica navlun-bildirimi'ne gider (Navlun sayfasi).
// {"islem": "navlun_yeniden_isle", "sayfa": n}: Navlun kayitlarini saklanan metinden yeniden okutur (navlun-bildirimi'ne aktarir).
// {"islem": "navlun_gecmis", "gun": "YYYY-AA-GG"}: kayitli acente navlun maillerini o gunden beri bir kez Navlun sayfasina aktarir.
// {"islem": "deneme", "alan": "...", "gun": "YYYY-AA-GG"}: yalniz baslik listesi, veritabanina yazmaz.
//
// Yetki: "x-cron-anahtar" basligi = Vault operasyon_imap_anahtari (migration 20261117160000), RPC ile dogrulanir.
// Kimlik bilgileri yalniz edge secret'larinda: EXEC_IMAP_KULLANICI, EXEC_IMAP_SIFRE (istege bagli EXEC_IMAP_SUNUCU,
// varsayilan sirket posta sunucusu). Hicbiri loglanmaz / yanita yazilmaz.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KULLANICI = (Deno.env.get("EXEC_IMAP_KULLANICI") || "").trim();
const SIFRE = Deno.env.get("EXEC_IMAP_SIFRE") || "";
const SUNUCU = (Deno.env.get("EXEC_IMAP_SUNUCU") || "mail.unex.com.tr").trim();
const KENDI = /@(unex\.com\.tr|ihracatasistanim\.com)$/i;
const MOTOR_SURUMU = "kural-v2-2026-11-17";
const CALISMA_BASINA = 30; // bir taramada en fazla bu kadar yeni mail
const PAKET = 10; // tek FETCH'te mail
const GOVDE_SINIRI = 150000; // bayt; ekler bunun otesinde kalir
const SURE_MS = 40000;
const NAVLUN_ANAHTAR = (Deno.env.get("PAZAR_GELEN_ANAHTAR") || "").trim();
const NAVLUN_KONU = /navlun|rezervasyon\s*taleb/i;

const servis = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const json = (veri: unknown, status = 200) =>
  new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });

async function anahtarGecerli(anahtar: string): Promise<boolean> {
  if (!anahtar) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/operasyon_imap_anahtari_dogrula`, {
      method: "POST",
      headers: { ...servis, "Content-Type": "application/json" },
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

async function rest<T>(yol: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, {
    ...init,
    headers: { ...servis, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`REST ${yol.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return (t ? JSON.parse(t) : null) as T;
}

type Acente = { id: string; company_id: string; alan_adi: string; booking_deseni: string };
type DurumSatiri = { company_id: string; uidvalidity: number | null; son_uid: number; baslangic: string };

function adresler(deger: string | undefined): string[] {
  if (!deger) return [];
  return [...baslikCoz(deger).matchAll(/[^\s<>,;"']+@[^\s<>,;"']+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase());
}

type NavlunAday = { mesaj_id: string; gonderen: string; konu: string; tam: string; tarih: string };

/**
 * 17.11.2026 (kullanici onayi): arsive ulasmayan acente navlun yazismalari Navlun sayfasina da gider (navlun-bildirimi
 * "kaydet", Apps Script ile ayni bicim). Ayni Message-ID tekrar kaydedilmez. Ayni gonderenden +-4 saat icinde
 * alintidan kurtarilmis kayit zaten varsa gonderilmez (ayni teklif iki kez sayilmasin).
 */
async function navlunaGonder(adaylar: NavlunAday[]): Promise<{ gonderilen: number; atlanan: number; hata?: string }> {
  if (!adaylar.length) return { gonderilen: 0, atlanan: 0 };
  if (!NAVLUN_ANAHTAR) return { gonderilen: 0, atlanan: adaylar.length, hata: "PAZAR_GELEN_ANAHTAR yok" };
  const gonder: Record<string, unknown>[] = [];
  let atlanan = 0;
  for (const a of adaylar) {
    const t = Date.parse(a.tarih);
    if (!Number.isFinite(t)) { atlanan++; continue; }
    const bas = new Date(t - 4 * 3600e3).toISOString(), bit = new Date(t + 4 * 3600e3).toISOString();
    const alinti = await rest<{ mesaj_id: string }[]>(
      `navlun_mesajlari?select=mesaj_id&gonderen=eq.${encodeURIComponent(a.gonderen)}&mesaj_id=like.alinti:*` +
        `&tarih=gte.${encodeURIComponent(bas)}&tarih=lte.${encodeURIComponent(bit)}&limit=1`,
    );
    if (alinti.length) { atlanan++; continue; }
    gonder.push({ mesaj_id: a.mesaj_id, gonderen: a.gonderen, konu: a.konu, tarih: a.tarih, govde: yeniMetin(a.tam).slice(0, 8000), alinti: a.tam.slice(0, 30000) });
  }
  for (let i = 0; i < gonder.length; i += 20) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/navlun-bildirimi`, {
      method: "POST",
      headers: { ...servis, "Content-Type": "application/json", "x-pazar-anahtar": NAVLUN_ANAHTAR },
      body: JSON.stringify({ islem: "kaydet", mesajlar: gonder.slice(i, i + 20) }),
    });
    if (!res.ok) return { gonderilen: i, atlanan, hata: `navlun-bildirimi ${res.status}: ${(await res.text()).slice(0, 150)}` };
    await res.body?.cancel();
  }
  return { gonderilen: gonder.length, atlanan };
}

/** Gecmis: operasyon_mailleri'ndeki acente navlun yazismalarini (verilen gunden beri) Navlun sayfasina aktarir. */
async function navlunGecmis(gun: string): Promise<Record<string, unknown>> {
  const satirlar = await rest<{ mesaj_id: string; gonderen: string; konu: string; tam_metin: string; tarih: string }[]>(
    `operasyon_mailleri?select=mesaj_id,gonderen,konu,tam_metin,tarih&yon=eq.gelen&tarih=gte.${gun}T00:00:00Z&order=tarih.asc&limit=500`,
  );
  const adaylar = satirlar.filter((r) => NAVLUN_KONU.test(r.konu || "") && r.tam_metin && r.gonderen)
    .map((r) => ({ mesaj_id: r.mesaj_id, gonderen: r.gonderen, konu: r.konu, tam: r.tam_metin, tarih: r.tarih }));
  return { ok: true, aday: adaylar.length, ...(await navlunaGonder(adaylar)) };
}

async function tara(): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const acenteler = await rest<Acente[]>("operasyon_acenteler?aktif=eq.true&select=id,company_id,alan_adi,booking_deseni");
  if (!acenteler.length) return { ok: true, not: "aktif acente yok" };
  const companyId = acenteler[0].company_id;
  const tekSirket = acenteler.filter((a) => a.company_id === companyId);
  const durumlar = await rest<DurumSatiri[]>(`operasyon_imap_durum?company_id=eq.${companyId}&select=*`);
  const durum = durumlar[0];
  if (!durum) return { ok: false, hata: "operasyon_imap_durum satiri yok (baslangic gunu girilmeli)" };

  // Konteyner -> booking hafizasi (guclu eslesme) son 120 gunun kesin baglantilarindan
  const hafiza = yeniDurum();
  const gecmis = await rest<{ booking: string; alanlar: Record<string, string> }[]>(
    `operasyon_mailleri?company_id=eq.${companyId}&booking=not.is.null&alanlar->>konteyner=not.is.null` +
      `&tarih=gte.${new Date(Date.now() - 120 * 864e5).toISOString()}&select=booking,alanlar&order=tarih.asc&limit=2000`,
  );
  for (const g of gecmis) for (const k of String(g.alanlar.konteyner || "").split(",")) if (k) hafiza.konteynerBooking.set(k, g.booking);

  const oturum = await imapOturumu({ sunucu: SUNUCU, kullanici: KULLANICI, sifre: SIFRE, sureMs: SURE_MS + 10000 });
  let yazilan = 0;
  const navlunAdaylari: NavlunAday[] = [];
  let enBuyukUid = durum.son_uid;
  let uidler: number[] = [];
  let uidvalidity = 0;
  try {
    uidvalidity = await oturum.kutuAc();
    const sifirla = !durum.uidvalidity || durum.uidvalidity !== uidvalidity;
    const kriter = alanKriteri(tekSirket.map((a) => a.alan_adi));
    const bas = sifirla ? `SINCE ${imapTarihi(durum.baslangic)} ${kriter}` : `UID ${durum.son_uid + 1}:* ${kriter}`;
    if (sifirla) enBuyukUid = 0;
    uidler = (await oturum.uidAra(bas)).filter((u) => u > enBuyukUid).slice(0, CALISMA_BASINA);

    for (let i = 0; i < uidler.length && Date.now() - t0 < SURE_MS; i += PAKET) {
      const hamlar = await oturum.getir(uidler.slice(i, i + PAKET), GOVDE_SINIRI);
      const satirlar: Record<string, unknown>[] = [];
      for (const h of hamlar) {
        const b = mimeBasliklari(h.baslik);
        const kim = adresAyir(b["from"] ?? "");
        const alicilar = [...new Set([...adresler(b["to"]), ...adresler(b["cc"])])];
        const katilan = [kim.eposta, ...alicilar];
        const acente = tekSirket.find((a) => katilan.some((e) => e.endsWith(`@${a.alan_adi}`) || e.endsWith(`.${a.alan_adi}`)));
        const ayar: AjanAyar = {
          acenteAlanlari: tekSirket.map((a) => a.alan_adi),
          bookingDeseni: (acente ?? tekSirket[0]).booking_deseni,
        };
        const tam = mimeMetni(h.baslik, h.govde);
        const t = b["date"] ? new Date(b["date"]) : null;
        const tarih = t && !isNaN(t.getTime()) ? t.toISOString() : null;
        const konu = baslikCoz(b["subject"] ?? "").slice(0, 300);
        const mesajId = (b["message-id"] || `imap:${uidvalidity}:${h.uid}`).slice(0, 300);
        const m: Mail = { id: mesajId, tarih: tarih ?? "", gonderen: kim.eposta, konu, govde: tam, acenteKatilimi: !!acente };
        const r = isle(m, hafiza, ayar);
        const yon = acente && kim.eposta.endsWith(acente.alan_adi)
          ? "gelen"
          : KENDI.test(kim.eposta)
          ? (acente ? "giden" : "ic")
          : "diger";
        satirlar.push({
          company_id: companyId,
          acente_id: acente?.id ?? null,
          mesaj_id: mesajId,
          imap_uid: h.uid,
          tarih,
          yon,
          gonderen: kim.eposta || null,
          gonderen_ad: kim.ad || null,
          alicilar,
          konu,
          govde: yeniMetin(tam).slice(0, 8000),
          tam_metin: tam.slice(0, 30000),
          kapsamda: r.kapsamda,
          booking: r.booking,
          oneri: r.oneri,
          guven: r.guven,
          gerekce: r.gerekce || null,
          olay: r.olay,
          olaylar: r.olaylar,
          alanlar: r.alanlar,
          kanit: r.kanit,
          motor_surumu: MOTOR_SURUMU,
        });
        if (yon === "gelen" && NAVLUN_KONU.test(konu) && tarih && kim.eposta) {
          navlunAdaylari.push({ mesaj_id: mesajId, gonderen: kim.eposta, konu, tam, tarih });
        }
        if (h.uid > enBuyukUid) enBuyukUid = h.uid;
      }
      if (satirlar.length) {
        await rest("operasyon_mailleri?on_conflict=company_id,mesaj_id", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(satirlar),
        });
        yazilan += satirlar.length;
      }
    }
  } finally {
    await oturum.kapat();
  }
  await rest(`operasyon_imap_durum?company_id=eq.${companyId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      uidvalidity,
      son_uid: enBuyukUid,
      son_calisma: new Date().toISOString(),
      son_islenen: yazilan,
      son_hata: null,
      guncelleme: new Date().toISOString(),
    }),
  });
  let navlun: Record<string, unknown> = {};
  try {
    navlun = await navlunaGonder(navlunAdaylari);
  } catch (e) {
    navlun = { hata: e instanceof Error ? e.message.slice(0, 150) : String(e) };
  }
  return { ok: true, sure_ms: Date.now() - t0, bulunan: uidler.length, yazilan, son_uid: enBuyukUid, navlun };
}

async function hataYaz(mesaj: string): Promise<void> {
  try {
    const acenteler = await rest<{ company_id: string }[]>("operasyon_acenteler?aktif=eq.true&select=company_id&limit=1");
    if (!acenteler.length) return;
    await rest(`operasyon_imap_durum?company_id=eq.${acenteler[0].company_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ son_hata: mesaj.slice(0, 300), son_calisma: new Date().toISOString(), guncelleme: new Date().toISOString() }),
    });
  } catch {
    /* yok say */
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ hata: "Yalniz POST." }, 405);
  if (!(await anahtarGecerli(req.headers.get("x-cron-anahtar") || ""))) return json({ hata: "Yetkisiz." }, 401);
  if (!KULLANICI || !SIFRE) return json({ hata: "EXEC_IMAP_KULLANICI / EXEC_IMAP_SIFRE tanimli degil." }, 503);

  let govde: { islem?: string; alan?: string; gun?: string; sayfa?: unknown };
  try {
    govde = await req.json();
  } catch {
    return json({ hata: "Gecersiz JSON." }, 400);
  }

  if (govde.islem === "tara") {
    try {
      return json(await tara());
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      console.error("operasyon-imap tara:", mesaj);
      await hataYaz(mesaj);
      return json({ ok: false, hata: mesaj.slice(0, 200) }, 502);
    }
  }

  // 17.11.2026: Navlun okuyucusu gelistikten sonra saklanan metinden yeniden okuma (navlun-bildirimi anahtarini SQL'e
  // acmadan; yetki yine x-cron-anahtar). {"islem": "navlun_yeniden_isle", "sayfa": n} -> navlun-bildirimi'nin yaniti.
  if (govde.islem === "navlun_yeniden_isle") {
    if (!NAVLUN_ANAHTAR) return json({ hata: "PAZAR_GELEN_ANAHTAR yok." }, 503);
    const sayfa = Math.max(0, Math.min(1000, Math.floor(Number(govde.sayfa) || 0)));
    const res = await fetch(`${SUPABASE_URL}/functions/v1/navlun-bildirimi`, {
      method: "POST",
      headers: { ...servis, "Content-Type": "application/json", "x-pazar-anahtar": NAVLUN_ANAHTAR },
      body: JSON.stringify({ islem: "yeniden_isle", sayfa }),
    });
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  }
  if (govde.islem === "navlun_gecmis") {
    const g = String(govde.gun || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return json({ hata: "gun YYYY-AA-GG olmali." }, 400);
    try {
      return json(await navlunGecmis(g));
    } catch (e) {
      return json({ ok: false, hata: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, 502);
    }
  }
  if (govde.islem !== "deneme") return json({ hata: "Bilinmeyen islem ('tara', 'navlun_gecmis' ya da 'deneme')." }, 400);
  const alan = String(govde.alan || "").trim().toLowerCase();
  const gun = String(govde.gun || "").trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(alan)) return json({ hata: "Gecersiz alan." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) return json({ hata: "gun YYYY-AA-GG olmali." }, 400);

  const t0 = Date.now();
  try {
    const mailler = await alandanGelenBasliklar({ sunucu: SUNUCU, kullanici: KULLANICI, sifre: SIFRE }, alan, gun, 100);
    return json({
      ok: true,
      sure_ms: Date.now() - t0,
      sayi: mailler.length,
      mailler: mailler.map((m) => ({ tarih: m.tarih, gonderen: m.gonderen, konu: m.konu, mesaj_id: m.mesajId })),
    });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("operasyon-imap:", mesaj);
    return json({ ok: false, sure_ms: Date.now() - t0, hata: mesaj.slice(0, 200) }, 502);
  }
});
