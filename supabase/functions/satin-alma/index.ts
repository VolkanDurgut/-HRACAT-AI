import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gonderimMaili, sonucMaili, type SaListe } from "../_shared/satin-alma.ts";

// ============================================================================
// SATIN ALMA (satin-alma) - 26.10.2026
// ============================================================================
// Govde: { islem, ... }
// Girissiz departman sayfasi (/talep/[token]) - yetki = 32 haneli token:
//  - "bilgi"      : departman, acik taslak, son 10 gonderilen liste
//  - "kalem_ekle" : { token, kalem }      (taslak yoksa acilir)
//  - "kalem_sil"  : { token, kalem_id }   (sadece acik taslaktan)
//  - "kalem_miktar": { token, kalem_id, miktar, acil? } (28.10.2026: mukerrer yerine miktar artir)
//  - "urunler"    : daha once siparis verilen urunler (gonderilen formlardan; oneri listesi)
//  - "gonder"     : { token, gonderen }   -> SA-YYYY-NNNN, execution@ + bbt@'ye mail
// Girissiz Unex cek listesi sayfasi (/cek/[token]) - execution@'ye giden mailden:
//  - "cek_bilgi"     : onaylanan kalemler + alindi durumlari
//  - "cek_isaretle"  : { token, kalem_id, alindi, ad }
// Uygulama ici (oturum JWT'si, "satin_alma" yetkisi DB'de kontrol edilir):
//  - "karar"       : { liste_id, kararlar, not } -> onay varsa AKTIF cek listesi;
//                    execution@'ye "[Departman] Onayli satin alma cek listesi" maili
//  - "mail_tekrar" : { liste_id, tur: "gonderim" | "sonuc" }
//
// Veritabanina token islemlerinde SADECE service_role + sa_token_* / sa_mail_sonuc
// fonksiyonlariyla erisir; JWT islemlerinde kullanicinin KENDI oturumuyla
// (sa_karar_ver / sa_liste_mail_verisi yetkiyi kendisi kontrol eder).
// Alicilar secret ile degistirilebilir (virgulle):
//   SATIN_ALMA_ALICILARI       (varsayilan execution@ + bbt@)
//   SATIN_ALMA_SONUC_ALICILARI (varsayilan execution@)
//   SATIN_ALMA_TEST_ALICISI    (varsayilan mesensei282@gmail.com)
// TEST DEPARTMANI (27.10.2026): departmanin "test" bayragi aciksa o departmanin
// talep ve sonuc mailleri SADECE test alicisina gider, konu "[TEST] " ile baslar.
// Mail gonderilemezse liste YINE kaydedilir; durum "hata" olarak isaretlenir,
// Satin Alma sayfasindan "Maili tekrar gonder" ile yeniden denenir.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda Satın Alma <bildirim@ihracatasistanim.com>";

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
function alicilar(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a));
  return liste.length ? [...new Set(liste)] : varsayilan;
}
const GONDERIM_ALICILARI = alicilar("SATIN_ALMA_ALICILARI", ["execution@unex.com.tr", "bbt@unex.com.tr"]);
const SONUC_ALICILARI = alicilar("SATIN_ALMA_SONUC_ALICILARI", ["execution@unex.com.tr"]);
const TEST_ALICILARI = alicilar("SATIN_ALMA_TEST_ALICISI", ["mesensei282@gmail.com"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

class KullaniciHatasi extends Error {
  constructor(mesaj: string, public durum = 400) { super(mesaj); }
}

/** PostgREST RPC. yetki: "servis" ya da kullanicinin Authorization basligi. */
async function rpc<T>(ad: string, govde: Record<string, unknown>, yetki: "servis" | string = "servis"): Promise<T> {
  const basliklar = yetki === "servis"
    ? { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    : { apikey: ANON_KEY, Authorization: yetki };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const metin = await res.text();
  if (!res.ok) {
    let mesaj = metin;
    let kod = "";
    try { const j = JSON.parse(metin); mesaj = j.message || metin; kod = j.code || ""; } catch { /* duz metin */ }
    // Veritabani fonksiyonlarinin Turkce mesajlari (raise exception) aynen iletilir
    if (kod === "42501" || res.status === 401 || res.status === 403) {
      // Postgres'in Ingilizce "permission denied for function ..." mesaji kullaniciya Turkce
      const turkce = kod === "42501" && !/^permission denied/i.test(mesaj) ? mesaj : kod === "42501" ? "Bu işlem için yetkiniz yok. Uygulamaya giriş yapıp tekrar deneyin." : "Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.";
      throw new KullaniciHatasi(turkce, 403);
    }
    if (kod === "P0002") throw new KullaniciHatasi(mesaj, 404);
    if (["23514", "23505", "22023", "22P02"].includes(kod) || res.status === 400 || res.status === 409) {
      throw new KullaniciHatasi(kod === "22P02" ? "Geçersiz istek." : mesaj, 400);
    }
    throw new Error(`${ad} HTTP ${res.status}: ${mesaj.slice(0, 200)}`);
  }
  return (metin ? JSON.parse(metin) : null) as T;
}

async function resendGonder(to: string[], konu: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: GONDEREN, to, subject: konu, html }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Maili gonderir, sonucu listeye yazar. Hata FIRLATMAZ: liste zaten kaydedildi. */
async function mailGonderVeKaydet(tur: "gonderim" | "sonuc", liste: SaListe): Promise<{ mail: "gonderildi" | "hata"; alicilar: string[] }> {
  const to = liste.test === true ? TEST_ALICILARI : tur === "gonderim" ? GONDERIM_ALICILARI : SONUC_ALICILARI;
  try {
    const { konu, html } = tur === "gonderim" ? gonderimMaili(liste) : sonucMaili(liste);
    await resendGonder(to, konu, html);
    await rpc("sa_mail_sonuc", { p_liste_id: liste.id, p_tur: tur, p_basarili: true }).catch((e) => console.error("sa_mail_sonuc:", e));
    return { mail: "gonderildi", alicilar: to };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error(`satin-alma ${tur} maili:`, mesaj);
    await rpc("sa_mail_sonuc", { p_liste_id: liste.id, p_tur: tur, p_basarili: false, p_hata: mesaj }).catch(() => {});
    return { mail: "hata", alicilar: to };
  }
}

const tokenGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{32}$/.test(t);
const uuidGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
const metin = (v: unknown, uzunluk: number) => (typeof v === "string" ? v.trim().slice(0, uzunluk) : "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Sadece POST." }, 405);
  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { /* bos govde */ }
  const islem = govde.islem;
  try {
    // ---------------- Girissiz departman sayfasi ----------------
    if (islem === "bilgi" || islem === "kalem_ekle" || islem === "kalem_sil" || islem === "kalem_miktar" || islem === "urunler" || islem === "gonder") {
      if (!tokenGecerli(govde.token)) return json({ hata: "Bağlantı geçersiz." }, 404);
      const token = govde.token;
      if (islem === "bilgi") {
        const veri = await rpc<Record<string, unknown> | null>("sa_token_bilgi", { p_token: token });
        return veri ? json(veri) : json({ hata: "Bağlantı geçersiz ya da departman pasif." }, 404);
      }
      if (islem === "kalem_ekle") {
        const k = (govde.kalem && typeof govde.kalem === "object" ? govde.kalem : {}) as Record<string, unknown>;
        const kalem = {
          kategori: metin(k.kategori, 20), urun: metin(k.urun, 200), miktar: k.miktar,
          birim: metin(k.birim, 20), aciliyet: k.aciliyet === "acil" ? "acil" : "normal",
          aciklama: metin(k.aciklama, 500), talep_eden: metin(k.talep_eden, 80),
        };
        const id = await rpc<string>("sa_token_kalem_ekle", { p_token: token, p_kalem: kalem });
        return json({ basarili: true, id });
      }
      if (islem === "urunler") {
        const urunler = await rpc<unknown[] | null>("sa_token_urunler", { p_token: token });
        return urunler ? json({ urunler }) : json({ hata: "Bağlantı geçersiz ya da departman pasif." }, 404);
      }
      if (islem === "kalem_miktar") {
        if (!uuidGecerli(govde.kalem_id)) return json({ hata: "Geçersiz kalem." }, 400);
        const miktar = typeof govde.miktar === "number" && Number.isFinite(govde.miktar) ? govde.miktar : null;
        if (miktar === null) return json({ hata: "Miktar geçersiz." }, 400);
        await rpc("sa_token_kalem_miktar", { p_token: token, p_kalem_id: govde.kalem_id, p_miktar: miktar, p_acil: govde.acil === true });
        return json({ basarili: true });
      }
      if (islem === "kalem_sil") {
        if (!uuidGecerli(govde.kalem_id)) return json({ hata: "Geçersiz kalem." }, 400);
        await rpc("sa_token_kalem_sil", { p_token: token, p_kalem_id: govde.kalem_id });
        return json({ basarili: true });
      }
      // gonder
      const liste = await rpc<SaListe>("sa_token_liste_gonder", { p_token: token, p_gonderen: metin(govde.gonderen, 80) });
      const sonuc = await mailGonderVeKaydet("gonderim", liste);
      return json({ basarili: true, liste_no: liste.liste_no, mail: sonuc.mail, test: liste.test === true });
    }

    // ---------------- Girissiz cek listesi ----------------
    if (islem === "cek_bilgi" || islem === "cek_isaretle") {
      if (!tokenGecerli(govde.token)) return json({ hata: "Bağlantı geçersiz." }, 404);
      if (islem === "cek_bilgi") {
        const veri = await rpc<SaListe | null>("sa_cek_bilgi", { p_token: govde.token });
        return veri ? json(veri) : json({ hata: "Bağlantı geçersiz." }, 404);
      }
      if (!uuidGecerli(govde.kalem_id)) return json({ hata: "Geçersiz kalem." }, 400);
      const veri = await rpc<SaListe>("sa_cek_token_isaretle", {
        p_token: govde.token, p_kalem_id: govde.kalem_id, p_alindi: govde.alindi === true, p_ad: metin(govde.ad, 80) || null,
      });
      return json(veri);
    }

    // ---------------- Uygulama ici (oturum) ----------------
    if (islem === "karar" || islem === "mail_tekrar") {
      const yetki = req.headers.get("Authorization") || "";
      if (!yetki.startsWith("Bearer ") || yetki === `Bearer ${ANON_KEY}`) return json({ hata: "Oturum gerekli." }, 401);
      if (!uuidGecerli(govde.liste_id)) return json({ hata: "Geçersiz liste." }, 400);
      if (islem === "karar") {
        if (!Array.isArray(govde.kararlar)) return json({ hata: "Karar listesi geçersiz." }, 400);
        const kararlar = (govde.kararlar as Record<string, unknown>[]).map((r) => ({
          id: r?.id, karar: r?.karar, red_nedeni: metin(r?.red_nedeni, 300),
        }));
        const liste = await rpc<SaListe>("sa_karar_ver", { p_liste_id: govde.liste_id, p_kararlar: kararlar, p_not: metin(govde.not, 500) || null }, yetki);
        const sonuc = await mailGonderVeKaydet("sonuc", liste);
        return json({ basarili: true, mail: sonuc.mail, alicilar: sonuc.alicilar, test: liste.test === true });
      }
      const tur = govde.tur === "sonuc" ? "sonuc" : govde.tur === "gonderim" ? "gonderim" : null;
      if (!tur) return json({ hata: "Geçersiz mail türü." }, 400);
      const liste = await rpc<SaListe>("sa_liste_mail_verisi", { p_liste_id: govde.liste_id }, yetki);
      if (tur === "sonuc" && liste.durum !== "sonuclandi") return json({ hata: "Bu liste için henüz karar verilmedi." }, 400);
      const sonuc = await mailGonderVeKaydet(tur, liste);
      return json({ basarili: sonuc.mail === "gonderildi", mail: sonuc.mail, alicilar: sonuc.alicilar, test: liste.test === true });
    }

    return json({ hata: "Bilinmeyen işlem." }, 400);
  } catch (e) {
    if (e instanceof KullaniciHatasi) return json({ hata: e.message }, e.durum);
    console.error("satin-alma hatasi:", e);
    return json({ hata: "Sunucu hatası. Lütfen tekrar deneyin." }, 500);
  }
});
