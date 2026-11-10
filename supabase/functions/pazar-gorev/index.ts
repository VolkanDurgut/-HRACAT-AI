import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// PAZAR GUNLUK GOREV (pazar-gorev) - 10.11.2026 (Dalga 3.3 + 3.4)
// ============================================================================
// Kullanici: "Bugunku musteriniz" maili kisiye ozel (export@ / export2@, CC bbt@ + execution@), "Basla" -> girissiz gorev
// sayfasi (/gorev/[token]). Once hatirlatma zamani gelenler, sonra SIPARISSIZ kendi musterilerimiz, sonra fuar
// potansiyelleri. Surec + sira kurallari: migration 20261110060000_pazar_gorev.sql (pazar_gorev_olustur / _isle).
// Govde:
//  - {} (pg_cron 'pazar-gorev', anon): yalniz PAZAR_GOREV_CANLI = "evet" iken, hafta ici, TR 09:00-11:59;
//    ekipteki her kisi icin gorevleri olusturur ve kisi basina gunde BIR mail gonderir. Veri dondurmez.
//  - {"test": true}: bugunun gorevlerini olusturur (gercek gorevler), kisi basina "[TEST]" maili YALNIZ test
//    adresine; gonderilmis SAYMAZ; 24 saatte en fazla 8 test maili.
//  - {"islem": "bilgi", "token"} / {"islem": "isle", "token", "is": ..., ...}: gorev sayfasi (anon, 32 haneli token).
// KISIYE OZEL (10.11.2026, migration 20261110070000): ekip tablosu pazar_ekip (kod, e-posta, hitap; isimler repoda
// degil, veritabaninda). Her kisiye AYRI gorev listesi + AYRI mail ("Gunaydin <hitap>"); alici o kisinin adresi,
// CC: PAZAR_GOREV_CC (varsayilan bbt@, execution@). Ekip bossa eski davranis: tek liste export@'a.
// Test: PAZAR_GOREV_TEST_ALICISI (varsayilan mesensei282@); her kisi icin ayri [TEST] maili.
// GELEN CEVAP (3.5, migration 20261110080000): {"islem": "gelen", "mesajlar": [...]} + baslik x-pazar-anahtar =
// secret PAZAR_GELEN_ANAHTAR (arsiv Gmail'deki Apps Script: docs/apps-script/pazar-gelen.gs). Secret yoksa kapali.
// Eslestirme / siniflama / surec etkisi veritabaninda: pazar_gelen_kaydet.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda İhracat AI <bildirim@ihracatasistanim.com>";
const SITE = "https://ihracatasistanim.com";
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const GOREV_ADET = 6;

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;
function adresler(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a));
  return liste.length ? Array.from(new Set(liste)).slice(0, 8) : varsayilan;
}
const CANLI = (Deno.env.get("PAZAR_GOREV_CANLI") || "").trim().toLowerCase() === "evet";
const CC = adresler("PAZAR_GOREV_CC", ["bbt@unex.com.tr", "execution@unex.com.tr"]);
type Kisi = { kod: string | null; eposta: string; hitap: string | null };
const VARSAYILAN_KISI: Kisi = { kod: null, eposta: "export@unex.com.tr", hitap: null };
const TEST_ALICISI = adresler("PAZAR_GOREV_TEST_ALICISI", ["mesensei282@gmail.com"]);
const GELEN_ANAHTAR = (Deno.env.get("PAZAR_GELEN_ANAHTAR") || "").trim();

/** Sabit sureli karsilastirma (anahtar tahmini zamanlamadan sizmasin). */
function anahtarDogru(gelen: string): boolean {
  if (GELEN_ANAHTAR.length < 24 || gelen.length !== GELEN_ANAHTAR.length) return false;
  let fark = 0;
  for (let i = 0; i < gelen.length; i++) fark |= gelen.charCodeAt(i) ^ GELEN_ANAHTAR.charCodeAt(i);
  return fark === 0;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pazar-anahtar",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (veri: unknown, status = 200) => new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

async function oku<T>(yol: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: basliklar });
  if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
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
async function kaydet(govde: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pazar_gorev_gonderimleri`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(govde),
  });
  if (!res.ok) console.error("pazar_gorev_gonderimleri yazilamadi", res.status, (await res.text()).slice(0, 200));
}

const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const trSaat = () => new Date(Date.now() + 3 * 3600_000).getUTCHours();
const trGunNo = () => new Date(Date.now() + 3 * 3600_000).getUTCDay(); // 0 pazar
const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const gunFarki = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.parse(trBugun()) - Date.parse(iso.slice(0, 10))) / 86400000)) : null);

type OzetGorev = {
  sira: number; neden: "hatirlatma1" | "hatirlatma2" | "siparissiz" | "potansiyel"; token: string; durum: string;
  ad: string; ulke: string | null; firma_durum: string; crm_asama: string; son_siparis: string | null;
  yetkili: string | null; son_temas: string | null; fuar: string | null;
};

const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const YESIL = "#10B981";
const ulkeYaz = (u: string | null) => (u ? u.toLocaleLowerCase("tr-TR").split(/(\s+|-)/).map((p) => (p ? p.charAt(0).toLocaleUpperCase("tr-TR") + p.slice(1) : p)).join("") : "");

const NEDEN: Record<OzetGorev["neden"], { etiket: string; renk: string }> = {
  hatirlatma1: { etiket: "Hatırlatma zamanı (1)", renk: "#B45309" },
  hatirlatma2: { etiket: "Son hatırlatma (2)", renk: "#B91C1C" },
  siparissiz: { etiket: "Siparişsiz müşterimiz", renk: "#047857" },
  potansiyel: { etiket: "Potansiyel müşteri", renk: "#1D4ED8" },
};

function nedenAlt(g: OzetGorev): string {
  if (g.neden === "siparissiz") {
    const gun = gunFarki(g.son_siparis);
    return g.son_siparis ? `Son sipariş ${trTarih(g.son_siparis)} · ${gun} gün önce` : "Sipariş kaydı yok";
  }
  if (g.neden === "potansiyel") return g.fuar ? `Fuar: ${g.fuar}` : "Fuar listesinden";
  return g.son_temas ? `Son temas ${trTarih(g.son_temas)} · cevap gelmedi` : "Cevap gelmedi";
}

function mailOlustur(gorevler: OzetGorev[], kisi: Kisi, cc: string[], test: boolean): { konu: string; html: string } {
  const ana = gorevler.find((g) => g.durum === "bekliyor") || gorevler[0];
  const tarih = trTarih(trBugun());
  const konu = `${test ? "[TEST] " : ""}Bugünkü müşteriniz · ${ana.ad} · ${tarih}`;
  const n = NEDEN[ana.neden];
  const digerleri = gorevler.filter((g) => g !== ana);
  const satir = (g: OzetGorev, i: number) => {
    const m = NEDEN[g.neden];
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}"><td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;font-weight:bold">${kacis(g.ad)}</td><td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:${m.renk};white-space:nowrap">${kacis(m.etiket)}</td><td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B">${kacis(ulkeYaz(g.ulke))}</td></tr>`;
  };
  const bolumBaslik = (t: string) => `<div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${kacis(t)}</div>`;
  const testSeridi = test
    ? `<div style="margin:14px 0 0;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Bu e-posta yalnızca test adresine gönderildi. Canlıda alıcı: <b>${kacis(kisi.eposta)}</b>${kisi.hitap ? ` (${kacis(kisi.hitap)})` : ""} · CC: ${kacis(cc.join(", "))}</div>`
    : "";
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${SITE}/images/logo.png" width="48" height="48" alt="Unex Gıda" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">Unex Gıda İhracat AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">UNEX Satış · Bugünkü müşteriniz</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${kacis(tarih)}</div></td>
  </tr></table>
  ${testSeridi}
  <p style="margin:18px 0 14px;color:#1E293B;font-size:14px;line-height:1.55">Günaydın${kisi.hitap ? ` ${kacis(kisi.hitap)}` : ""}, kolay gelsin. Bugün ilk görüşeceğiniz müşteri hazır:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-top:3px solid ${n.renk};border-radius:4px"><tr><td style="padding:14px 16px">
    <div style="font-size:10px;font-weight:bold;color:${n.renk};text-transform:uppercase;letter-spacing:.5px">${kacis(n.etiket)}</div>
    <div style="font-size:20px;font-weight:bold;color:${LACIVERT};line-height:1.3;margin-top:4px">${kacis(ana.ad)}</div>
    <div style="font-size:12px;color:#475569;margin-top:4px">${kacis([ulkeYaz(ana.ulke), ana.yetkili].filter(Boolean).join(" · "))}</div>
    <div style="font-size:12px;color:#475569;margin-top:2px">${kacis(nedenAlt(ana))}</div>
  </td></tr></table>
  <div style="margin-top:20px;text-align:center">
    <a href="${kacis(`${SITE}/gorev/${ana.token}`)}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 34px;border-radius:6px">Başla</a>
  </div>
  ${digerleri.length ? `${bolumBaslik(`Bugün sırada ${digerleri.length} müşteri daha`)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${digerleri.map(satir).join("")}</table>
  <div style="margin-top:6px;font-size:11px;color:#94A3B8">İlk müşteriyi bitirince sayfadaki "Yeni müşteriyle devam et" ile sıradakine geçebilirsiniz.</div>` : ""}
  <div style="margin-top:18px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Mailler Outlook'tan sizin adresinizden (${kacis(kisi.eposta)}) gider; bbt@ ve execution@ bilgiye eklenir. Bağlantı 3 gün geçerlidir; giriş gerektirmez.<br>İhracat AI tarafından hafta içi her sabah otomatik gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
  return { konu, html };
}

async function mailGonder(to: string[], cc: string[], konu: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: GONDEREN, to, ...(cc.length ? { cc } : {}), subject: konu, html }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id?: string }).id || null;
}

async function ekip(sirket: string): Promise<Kisi[]> {
  const satirlar = await oku<Kisi>(`pazar_ekip?select=kod,eposta,hitap&company_id=eq.${sirket}&aktif=is.true&order=sira.asc`);
  const gecerli = satirlar.filter((k) => k.kod && EPOSTA.test((k.eposta || "").trim().toLowerCase()));
  return gecerli.length ? gecerli.map((k) => ({ ...k, eposta: k.eposta.trim().toLowerCase() })) : [VARSAYILAN_KISI];
}

async function sirketler(): Promise<string[]> {
  const satirlar = await oku<{ company_id: string }>("pazar_firmalar?select=company_id&limit=1000");
  return Array.from(new Set(satirlar.map((s) => s.company_id)));
}

/** Bir kisinin bugunku gorevlerini olusturur ve ona maili gonderir. */
async function gunluk(sirket: string, kisi: Kisi, test: boolean): Promise<{ kisi: string | null; durum: string; gorev: number; hata?: string }> {
  const tarih = trBugun();
  const o = await rpc<number>("pazar_gorev_olustur", { p_company: sirket, p_tarih: tarih, p_adet: GOREV_ADET, p_atanan: kisi.kod });
  if (!o.ok) throw new Error(o.hata);
  const ozet = await rpc<OzetGorev[]>("pazar_gorev_ozeti", { p_company: sirket, p_tarih: tarih, p_atanan: kisi.kod });
  const gorevler = (ozet.veri || []).filter((g) => g.durum === "bekliyor");
  if (!gorevler.length) {
    if (!test) await kaydet({ company_id: sirket, tarih, atanan: kisi.kod, durum: "bos", gorev_sayisi: 0 });
    return { kisi: kisi.kod, durum: "bos", gorev: 0 };
  }
  const ccGercek = CC.filter((a) => a !== kisi.eposta);
  const { konu, html } = mailOlustur(gorevler, kisi, ccGercek, test);
  const to = test ? TEST_ALICISI : [kisi.eposta];
  const cc = test ? [] : ccGercek;
  try {
    const id = await mailGonder(to, cc, konu, html);
    await kaydet({ company_id: sirket, tarih, atanan: kisi.kod, durum: test ? "test" : "gonderildi", alicilar: [...to, ...cc], gorev_sayisi: gorevler.length, mesaj_id: id });
    return { kisi: kisi.kod, durum: test ? "test" : "gonderildi", gorev: gorevler.length };
  } catch (e) {
    const hata = e instanceof Error ? e.message : String(e);
    await kaydet({ company_id: sirket, tarih, atanan: kisi.kod, durum: "hata", alicilar: [...to, ...cc], gorev_sayisi: gorevler.length, hata });
    return { kisi: kisi.kod, durum: "hata", gorev: gorevler.length, hata };
  }
}

const ISLEMLER = new Set(["gonderildi", "cevap", "teklif", "siparis", "ilgilenmiyor", "atla"]);
const kirp = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Yalnız POST." }, 405);
  const rol = jwtRolu((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  if (rol !== "anon" && rol !== "service_role" && rol !== "authenticated") return json({ error: "Yetkisiz." }, 401);
  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { govde = {}; }

  try {
    // ---- Gorev sayfasi (girissiz, token) ----
    if (govde.islem === "bilgi" || govde.islem === "isle") {
      const token = typeof govde.token === "string" ? govde.token : "";
      if (!TOKEN_RE.test(token)) return json({ hata: "Geçersiz bağlantı." }, 400);
      if (govde.islem === "bilgi") {
        const b = await rpc<unknown>("pazar_gorev_bilgi", { p_token: token });
        if (!b.ok) return json({ hata: "Görev okunamadı." }, 500);
        if (!b.veri) return json({ hata: "Bu bağlantı geçersiz ya da süresi doldu." }, 404);
        return json(b.veri);
      }
      const is = typeof govde.is === "string" ? govde.is : "";
      if (!ISLEMLER.has(is)) return json({ hata: "Geçersiz işlem." }, 400);
      const s = await rpc<unknown>("pazar_gorev_isle", {
        p_token: token, p_islem: is, p_kanal: kirp(govde.kanal, 20), p_sablon: kirp(govde.sablon, 40),
        p_alici: kirp(govde.alici, 300), p_konu: kirp(govde.konu, 300), p_govde: kirp(govde.govde, 6000), p_isleyen: kirp(govde.isleyen, 80),
      });
      if (!s.ok) return json({ hata: s.hata || "İşlem kaydedilemedi." }, 400);
      return json(s.veri);
    }

    // ---- Gelen cevaplar (arsiv Gmail -> Apps Script), gizli anahtarla ----
    if (govde.islem === "gelen") {
      if (!GELEN_ANAHTAR) return json({ hata: "Gelen cevap tespiti kapalı (PAZAR_GELEN_ANAHTAR yok)." }, 503);
      if (!anahtarDogru(req.headers.get("x-pazar-anahtar") || "")) return json({ hata: "Yetkisiz." }, 401);
      const liste = Array.isArray(govde.mesajlar) ? govde.mesajlar.slice(0, 100) : [];
      const mesajlar = liste.filter((m): m is Record<string, unknown> => !!m && typeof m === "object").map((m) => ({
        mesaj_id: kirp(m.mesaj_id, 300), gonderen: kirp(m.gonderen, 200), gonderen_ad: kirp(m.gonderen_ad, 200),
        konu: kirp(m.konu, 300), ozet: kirp(m.ozet, 2000), tarih: kirp(m.tarih, 40),
      }));
      if (!mesajlar.length) return json({ kaydedilen: 0, cevap: 0, eslesmeyen: 0, atlanan: 0 });
      const k = await rpc<unknown>("pazar_gelen_kaydet", { p_mesajlar: mesajlar });
      if (!k.ok) return json({ hata: k.hata || "Kaydedilemedi." }, 500);
      return json(k.veri);
    }

    // ---- Test: bugunun gorevleri + [TEST] mail yalniz test adresine ----
    if (govde.test === true) {
      const gun = new Date(Date.now() - 24 * 3600_000).toISOString();
      const sayilan = await oku<{ id: string }>(`pazar_gorev_gonderimleri?select=id&durum=eq.test&olusturma=gte.${gun}`);
      if (sayilan.length >= 8) return json({ error: "Test sınırı (24 saatte 8 mail) doldu." }, 429);
      const sonuc = [];
      for (const s of await sirketler()) for (const k of await ekip(s)) sonuc.push(await gunluk(s, k, true));
      return json({ test: true, sonuc: sonuc.map((x) => ({ kisi: x.kisi, durum: x.durum, gorev: x.gorev, ...(x.hata ? { hata: x.hata } : {}) })) });
    }

    // ---- Zamanlanmis: yalniz canli, hafta ici, TR 09:00-11:59, gunde bir mail ----
    if (!CANLI) return json({ ok: true, canli: false });
    const gunNo = trGunNo();
    if (gunNo === 0 || gunNo === 6) return json({ ok: true, haftasonu: true });
    const saat = trSaat();
    if (saat < 9 || saat > 11) return json({ ok: true, saat_disi: true });
    const tarih = trBugun();
    let gonderilen = 0;
    for (const s of await sirketler()) {
      for (const k of await ekip(s)) {
        const kim = k.kod ? `atanan=eq.${encodeURIComponent(k.kod)}` : "atanan=is.null";
        const onceki = await oku<{ id: string }>(`pazar_gorev_gonderimleri?select=id&company_id=eq.${s}&tarih=eq.${tarih}&${kim}&durum=in.(gonderildi,bos)`);
        if (onceki.length) continue;
        const hatalar = await oku<{ id: string }>(`pazar_gorev_gonderimleri?select=id&company_id=eq.${s}&tarih=eq.${tarih}&${kim}&durum=eq.hata`);
        if (hatalar.length >= 3) continue;
        if ((await gunluk(s, k, false)).durum === "gonderildi") gonderilen++;
      }
    }
    return json({ ok: true, gonderilen });
  } catch (e) {
    console.error("pazar-gorev", e);
    return json({ error: "İşlem tamamlanamadı." }, 500);
  }
});
