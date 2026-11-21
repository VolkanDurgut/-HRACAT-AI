import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gonderimMaili, haftalikHatirlatmaMaili, sonucMaili, topluOnayMaili, type HaftalikHatirlatma, type SaListe, type SaToplu } from "../_shared/satin-alma.ts";
import { etiketliKonu, type MailEtiketi, UNEX_AI_GONDEREN } from "../_shared/unex-ai.ts";

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
//  - "gonder"     : { token, gonderen }   -> SA-YYYY-NNNN, durum "on_onay"; mail YALNIZ execution@
//                   (21.11.2026: once Volkan Bey'in on onayi; Burak Bey'e acil ya da cumartesi toplu liste)
//  - "kalemler_ekle": { token, kalemler[], talep_eden } (31.10.2026: Excel / gecen liste /
//                   katalog secimi; formda olan urun atlanir, gecersiz satir hepsini geri alir)
// Zamanlanmis (pg_cron, anon anahtar):
//  - "haftalik_hatirlatma": bugun haftalik liste gunu olan ve bu hafta form gondermemis
//                   departmanlarin hatirlatma adreslerine e-posta (gunde bir kez; DB isaretler)
// Girissiz Unex cek listesi sayfasi (/cek/[token]) - execution@'ye giden mailden:
//  - "cek_bilgi"     : onaylanan kalemler + alindi durumlari
//  - "cek_isaretle"  : { token, kalem_id, alindi, ad }
// Uygulama ici (oturum JWT'si, "satin_alma" yetkisi DB'de kontrol edilir):
//  - "karar"       : { liste_id, kararlar[{id, karar, red_nedeni, onay_miktar?, onay_notu?}], not } -> onay varsa AKTIF cek listesi;
//                    execution@'ye "[Departman] Onayli satin alma cek listesi" maili
//  - "mail_tekrar" : { liste_id, tur: "gonderim" | "sonuc" }
// 21.11.2026 on onay + haftalik toplu liste (oturum, "satin_alma" yetkisi):
//  - "onaya_sun"   : { liste_id }  ACIL: on onaydaki tek form hemen Burak Bey'e (bbt@ maili)
//  - "toplu_sun"   : { liste_ids[] } on onaydaki formlar TSA-YYYY-NNNN toplu listesiyle Burak Bey'e (TEK mail)
//  - "toplu_karar" : { toplu_id, kararlar[], not } tek ekranda karar; her form icin sonuc maili (execution@, eskisi gibi)
//  - "toplu_mail_tekrar": { toplu_id }
//
// Veritabanina token islemlerinde SADECE service_role + sa_token_* / sa_mail_sonuc
// fonksiyonlariyla erisir; JWT islemlerinde kullanicinin KENDI oturumuyla
// (sa_karar_ver / sa_liste_mail_verisi yetkiyi kendisi kontrol eder).
// Alicilar secret ile degistirilebilir (virgulle):
//   SATIN_ALMA_ON_ONAY_ALICILARI (varsayilan execution@)  departman formu geldi (on onay)
//   SATIN_ALMA_ONAY_ALICILARI    (varsayilan bbt@)        acil form / toplu liste Burak Bey'in onayinda
//   (21.11.2026: eski SATIN_ALMA_ALICILARI artik KULLANILMIYOR)
//   SATIN_ALMA_SONUC_ALICILARI (varsayilan execution@)
//   SATIN_ALMA_TEST_ALICISI    (secret; 13.11.2026 kod varsayilani kaldirildi: tanimli degilse test maili GITMEZ)
// TEST DEPARTMANI (27.10.2026): departmanin "test" bayragi aciksa o departmanin
// talep ve sonuc mailleri SADECE test alicisina gider, konu "[TEST] " ile baslar.
// Mail gonderilemezse liste YINE kaydedilir; durum "hata" olarak isaretlenir,
// Satin Alma sayfasindan "Maili tekrar gonder" ile yeniden denenir.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = UNEX_AI_GONDEREN;

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
function alicilar(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a));
  return liste.length ? [...new Set(liste)] : varsayilan;
}
const ON_ONAY_ALICILARI = alicilar("SATIN_ALMA_ON_ONAY_ALICILARI", ["execution@unex.com.tr"]);
const ONAY_ALICILARI = alicilar("SATIN_ALMA_ONAY_ALICILARI", ["bbt@unex.com.tr"]);
const SONUC_ALICILARI = alicilar("SATIN_ALMA_SONUC_ALICILARI", ["execution@unex.com.tr"]);
const TEST_ALICILARI = alicilar("SATIN_ALMA_TEST_ALICISI", []);

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

async function resendGonder(to: string[], konu: string, html: string, etiket: MailEtiketi): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: GONDEREN, to, subject: etiketliKonu(etiket, konu), html }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

type Asama = "on_onay" | "acil" | "onay";
/** Formun bulundugu asama (gonderim maili metni + alicisi buna gore). */
const asamasi = (l: SaListe): Asama => (l.durum === "on_onay" ? "on_onay" : l.onaya_sunma_zamani ? "acil" : "onay");

/** Maili gonderir, sonucu listeye yazar. Hata FIRLATMAZ: liste zaten kaydedildi. */
async function mailGonderVeKaydet(tur: "gonderim" | "sonuc", liste: SaListe): Promise<{ mail: "gonderildi" | "hata"; alicilar: string[] }> {
  const asama = asamasi(liste);
  const to = liste.test === true ? TEST_ALICILARI : tur === "sonuc" ? SONUC_ALICILARI : asama === "on_onay" ? ON_ONAY_ALICILARI : ONAY_ALICILARI;
  try {
    const { konu, html } = tur === "gonderim" ? gonderimMaili(liste, asama) : sonucMaili(liste);
    await resendGonder(to, konu, html, tur === "sonuc" ? "Rapor" : asama === "acil" ? "Önemli" : "Hatırlatma");
    await rpc("sa_mail_sonuc", { p_liste_id: liste.id, p_tur: tur, p_basarili: true }).catch((e) => console.error("sa_mail_sonuc:", e));
    return { mail: "gonderildi", alicilar: to };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error(`satin-alma ${tur} maili:`, mesaj);
    await rpc("sa_mail_sonuc", { p_liste_id: liste.id, p_tur: tur, p_basarili: false, p_hata: mesaj }).catch(() => {});
    return { mail: "hata", alicilar: to };
  }
}

/** Toplu liste maili (Burak Bey). Hata FIRLATMAZ: toplu liste zaten kaydedildi. */
async function topluMailGonder(t: SaToplu): Promise<{ mail: "gonderildi" | "hata"; alicilar: string[] }> {
  const to = t.test === true ? TEST_ALICILARI : ONAY_ALICILARI;
  try {
    const { konu, html } = topluOnayMaili(t);
    await resendGonder(to, konu, html, "Hatırlatma");
    await rpc("sa_toplu_mail_sonuc", { p_toplu_id: t.id, p_basarili: true }).catch((e) => console.error("sa_toplu_mail_sonuc:", e));
    return { mail: "gonderildi", alicilar: to };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("satin-alma toplu maili:", mesaj);
    await rpc("sa_toplu_mail_sonuc", { p_toplu_id: t.id, p_basarili: false, p_hata: mesaj }).catch(() => {});
    return { mail: "hata", alicilar: to };
  }
}

/** Istemciden gelen kalem kararlari (karar / toplu_karar ortak) */
const kararlariAl = (ham: unknown) => (ham as Record<string, unknown>[]).map((r) => ({
  id: r?.id, karar: r?.karar, red_nedeni: metin(r?.red_nedeni, 300),
  // 14.11.2026 "Degistirerek onayla": onaylanan miktar (null = talep edilen) + onay notu
  onay_miktar: typeof r?.onay_miktar === "number" && Number.isFinite(r.onay_miktar) ? r.onay_miktar : null,
  onay_notu: metin(r?.onay_notu, 300),
}));

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
    if (islem === "bilgi" || islem === "kalem_ekle" || islem === "kalemler_ekle" || islem === "kalem_sil" || islem === "kalem_miktar" || islem === "urunler" || islem === "gonder") {
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
          aciklama: metin(k.aciklama, 500), talep_eden: metin(k.talep_eden, 80), tedarikci: metin(k.tedarikci, 80),
        };
        const id = await rpc<string>("sa_token_kalem_ekle", { p_token: token, p_kalem: kalem });
        return json({ basarili: true, id });
      }
      if (islem === "kalemler_ekle") {
        if (!Array.isArray(govde.kalemler) || govde.kalemler.length === 0) return json({ hata: "Eklenecek kalem yok." }, 400);
        if (govde.kalemler.length > 100) return json({ hata: "Tek seferde en fazla 100 kalem eklenebilir." }, 400);
        const kalemler = (govde.kalemler as unknown[]).map((x) => {
          const k = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          return {
            kategori: metin(k.kategori, 20), urun: metin(k.urun, 200), miktar: k.miktar,
            birim: metin(k.birim, 20), aciliyet: k.aciliyet === "acil" ? "acil" : "normal",
            aciklama: metin(k.aciklama, 500), tedarikci: metin(k.tedarikci, 80),
          };
        });
        const sonuc = await rpc<{ eklenen: number; atlanan: { sira: number; urun: string; neden: string }[] }>(
          "sa_token_kalemler_ekle", { p_token: token, p_kalemler: kalemler, p_talep_eden: metin(govde.talep_eden, 80) });
        return json({ basarili: true, ...sonuc });
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
      const liste = await rpc<SaListe>("sa_token_liste_on_onaya_gonder", { p_token: token, p_gonderen: metin(govde.gonderen, 80) });
      const sonuc = await mailGonderVeKaydet("gonderim", liste);
      return json({ basarili: true, liste_no: liste.liste_no, mail: sonuc.mail, test: liste.test === true });
    }

    // ---------------- Zamanlanmis: haftalik liste hatirlatmasi ----------------
    if (islem === "haftalik_hatirlatma") {
      const liste = await rpc<(HaftalikHatirlatma & { id: string; alicilar: string[] })[]>("sa_haftalik_hatirlatma_al", {});
      let gonderilen = 0;
      let hatali = 0;
      for (const h of liste || []) {
        const to = h.test === true ? TEST_ALICILARI : (h.alicilar || []).filter((a) => EPOSTA.test(a));
        let basarili = false;
        try {
          if (!to.length) throw new Error("Alıcı yok.");
          const { konu, html } = haftalikHatirlatmaMaili(h);
          await resendGonder(to, konu, html, "Hatırlatma");
          basarili = true;
          gonderilen++;
        } catch (e) {
          hatali++;
          console.error("haftalik hatirlatma:", h.departman, e instanceof Error ? e.message : e);
        }
        await rpc("sa_haftalik_hatirlatma_sonuc", { p_id: h.id, p_basarili: basarili }).catch(() => {});
      }
      return json({ basarili: true, departman: (liste || []).length, gonderilen, hatali });
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
    if (islem === "karar" || islem === "mail_tekrar" || islem === "onaya_sun" || islem === "toplu_sun" || islem === "toplu_karar" || islem === "toplu_mail_tekrar") {
      const yetki = req.headers.get("Authorization") || "";
      if (!yetki.startsWith("Bearer ") || yetki === `Bearer ${ANON_KEY}`) return json({ hata: "Oturum gerekli." }, 401);

      // 21.11.2026 haftalik toplu liste
      if (islem === "toplu_sun") {
        const idler = Array.isArray(govde.liste_ids) ? [...new Set(govde.liste_ids as unknown[])] : [];
        if (!idler.length || idler.length > 100 || !idler.every(uuidGecerli)) return json({ hata: "Toplu listeye eklenecek formları seçin." }, 400);
        const toplu = await rpc<SaToplu>("sa_toplu_olustur", { p_liste_ids: idler }, yetki);
        const sonuc = await topluMailGonder(toplu);
        return json({ basarili: true, toplu_id: toplu.id, toplu_no: toplu.toplu_no, form: toplu.listeler.length, mail: sonuc.mail, alicilar: sonuc.alicilar, test: toplu.test === true });
      }
      if (islem === "toplu_karar" || islem === "toplu_mail_tekrar") {
        if (!uuidGecerli(govde.toplu_id)) return json({ hata: "Geçersiz toplu liste." }, 400);
        if (islem === "toplu_mail_tekrar") {
          const toplu = await rpc<SaToplu>("sa_toplu_mail_verisi", { p_toplu_id: govde.toplu_id }, yetki);
          if (!toplu.listeler.some((l) => l.durum === "bekliyor")) return json({ hata: "Bu toplu liste için karar verildi." }, 400);
          const sonuc = await topluMailGonder(toplu);
          return json({ basarili: sonuc.mail === "gonderildi", mail: sonuc.mail, alicilar: sonuc.alicilar, test: toplu.test === true });
        }
        if (!Array.isArray(govde.kararlar)) return json({ hata: "Karar listesi geçersiz." }, 400);
        const listeler = await rpc<SaListe[]>("sa_toplu_karar_ver", { p_toplu_id: govde.toplu_id, p_kararlar: kararlariAl(govde.kararlar), p_not: metin(govde.not, 500) || null }, yetki);
        let hatali = 0;
        let alicilar: string[] = [];
        for (const l of listeler || []) {
          const sonuc = await mailGonderVeKaydet("sonuc", l);
          if (sonuc.mail === "hata") hatali++;
          alicilar = sonuc.alicilar;
        }
        return json({ basarili: true, form: (listeler || []).length, mail: hatali ? "hata" : "gonderildi", mail_hatali: hatali, alicilar, test: (listeler || []).some((l) => l.test === true) });
      }

      if (!uuidGecerli(govde.liste_id)) return json({ hata: "Geçersiz liste." }, 400);
      if (islem === "onaya_sun") {
        const liste = await rpc<SaListe>("sa_onaya_sun", { p_liste_id: govde.liste_id }, yetki);
        const sonuc = await mailGonderVeKaydet("gonderim", liste);
        return json({ basarili: true, liste_no: liste.liste_no, mail: sonuc.mail, alicilar: sonuc.alicilar, test: liste.test === true });
      }
      if (islem === "karar") {
        if (!Array.isArray(govde.kararlar)) return json({ hata: "Karar listesi geçersiz." }, 400);
        const liste = await rpc<SaListe>("sa_karar_ver", { p_liste_id: govde.liste_id, p_kararlar: kararlariAl(govde.kararlar), p_not: metin(govde.not, 500) || null }, yetki);
        const sonuc = await mailGonderVeKaydet("sonuc", liste);
        return json({ basarili: true, mail: sonuc.mail, alicilar: sonuc.alicilar, test: liste.test === true });
      }
      const tur = govde.tur === "sonuc" ? "sonuc" : govde.tur === "gonderim" ? "gonderim" : null;
      if (!tur) return json({ hata: "Geçersiz mail türü." }, 400);
      const liste = await rpc<SaListe>("sa_liste_mail_verisi", { p_liste_id: govde.liste_id }, yetki);
      if (tur === "sonuc" && liste.durum !== "sonuclandi") return json({ hata: "Bu liste için henüz karar verilmedi." }, 400);
      if (tur === "gonderim" && liste.durum === "bekliyor" && liste.toplu_id) return json({ hata: "Bu form toplu listeyle sunuldu; toplu listenin mailini tekrar gönderin." }, 400);
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
