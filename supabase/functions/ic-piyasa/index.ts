import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  BILDIRIM_ETIKET, SITE_ADRESI, cikisAdresi, takipAdresi,
  MUSTERI_EPOSTA_SABLONLARI, musteriEpostaHtml, musteriEpostaKonusu, musteriEpostaMetni, sablonBul,
} from "../_shared/mesaj-sablonlari.ts";

// ============================================================================
// IC PIYASA (ic-piyasa) - 12.10.2026
// ============================================================================
// Tek function, dort islem (govde: { islem, ... }):
//  - "takip"        : musteri takip sayfasi verisi (girissiz; tahmin edilemez
//                     32 haneli token). Irsaliye PDF'leri icin 15 dk'lik
//                     imzali baglanti uretir.
//  - "cikis_bilgi"  : lojistik cikis sayfasi (token) icin arac bilgisi.
//  - "cikis_uygula" : lojistigin karari (cikti / planla / bugun_degil).
//  - "isle"         : pg_cron her 2 dakikada cagirir. Zamanlanmis kontroller
//                     (hatirlatma, cevap yok) + sirket ici e-posta kuyrugu.
//
// Veritabanina SADECE service_role ile, SADECE su fonksiyonlarla erisir:
// ic_takip_bilgi, ic_cikis_token_bilgi, ic_cikis_token_isle,
// ic_bildirim_zamanla, ic_bildirim_eposta_al, ic_bildirim_eposta_sonuc
// (migration 20261012200000).
// 23.10.2026: MUSTERI E-POSTASI (migration 20261023120000). WhatsApp'i olmayan
// musteriye ayni metin e-postayla; "yola cikti"da irsaliye PDF'i EKLI. Kuyruk
// (ic_bildirim_eposta_al) musteri e-postasini SADECE ayarlardan otomatik
// gonderim acildiktan SONRA olusmussa verir. Gonderen = ayardaki dogrulanmis
// unex.com.tr adresi, yanit = lojistik. "musteri_deneme": oturumdaki
// kullanicinin KENDI adresine ornek e-posta (musteriye gitmez).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda İç Piyasa <bildirim@ihracatasistanim.com>";
const KOVA = "ic-piyasa-belgeler";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const servis = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

function json(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

class KullaniciHatasi extends Error {}

async function rpc<T>(ad: string, govde: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, { method: "POST", headers: servis, body: JSON.stringify(govde) });
  const metin = await res.text();
  if (!res.ok) {
    let mesaj = metin;
    try { mesaj = JSON.parse(metin).message || metin; } catch { /* duz metin */ }
    // Veritabani fonksiyonlarinin Turkce kullanici mesajlari (raise exception) aynen iletilir
    if (res.status === 400 || res.status === 404 || res.status === 409) throw new KullaniciHatasi(mesaj);
    throw new Error(`${ad} HTTP ${res.status}: ${mesaj.slice(0, 200)}`);
  }
  return (metin ? JSON.parse(metin) : null) as T;
}

const tokenGecerli = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{32}$/.test(t);

async function imzaliPdf(yol: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${KOVA}/${yol.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: servis,
    body: JSON.stringify({ expiresIn: 900 }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  return d?.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
}

/** Depodan PDF'i indirip base64 dondurur (e-posta eki). Yoksa / buyukse null. */
async function pdfBase64(yol: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${KOVA}/${yol.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!res.ok) return null;
  const bayt = new Uint8Array(await res.arrayBuffer());
  if (bayt.length === 0 || bayt.length > 10 * 1024 * 1024) return null;
  let ikili = "";
  for (let i = 0; i < bayt.length; i += 0x8000) ikili += String.fromCharCode(...bayt.subarray(i, i + 0x8000));
  return btoa(ikili);
}

type MusteriBilgi = { gonderen: string | null; yanit: string | null; iletisim_ad: string | null; iletisim_telefon: string | null; irsaliye_yolu: string | null; irsaliye_no: string | null };

/** Musteri e-postasinin Resend govdesi (konu, html, text, ek). Eksik bilgide hata firlatir (yarim e-posta gitmez). */
async function musteriEpostasi(sablonAdi: string, degerler: string[], bilgi: MusteriBilgi, deneme = false): Promise<{ from: string; reply_to?: string; subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] }> {
  if (!(MUSTERI_EPOSTA_SABLONLARI as readonly string[]).includes(sablonAdi)) throw new Error(`Müşteri e-postası şablonu değil: ${sablonAdi}`);
  const sablon = sablonBul(sablonAdi);
  if (!sablon) throw new Error(`Şablon bulunamadı: ${sablonAdi}`);
  if (!bilgi.gonderen) throw new Error("Müşteri e-postası gönderen adresi tanımlı değil (Bildirimler › Ayarlar).");
  // Telefon WhatsApp metniyle ayni bicimde (lib/ic-piyasa/is-emri.ts telefonYazi): 905532689101 -> 0553 268 91 01
  const tm = (bilgi.iletisim_telefon || "").match(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/);
  const iletisim = { ad: bilgi.iletisim_ad, telefon: tm ? `0${tm[1]} ${tm[2]} ${tm[3]} ${tm[4]}` : bilgi.iletisim_telefon };
  let ekler: { filename: string; content: string }[] | undefined;
  let ekNotu: string | null = null;
  if (sablonAdi === "arac_yola_cikti") {
    if (!bilgi.irsaliye_yolu) {
      if (!deneme) throw new Error("İrsaliye dosyası bulunamadı; e-posta eksik gitmesin diye gönderilmedi.");
    } else {
      const icerik = await pdfBase64(bilgi.irsaliye_yolu);
      if (!icerik) throw new Error("İrsaliye PDF'i depodan okunamadı.");
      const ad = (bilgi.irsaliye_no || "irsaliye").replace(/[^A-Za-z0-9_-]/g, "") || "irsaliye";
      ekler = [{ filename: `${ad}.pdf`, content: icerik }];
      ekNotu = `Ek: ${ad}.pdf (irsaliye)`;
    }
  }
  const konu = musteriEpostaKonusu(sablon, degerler);
  return {
    from: `Unex Gıda <${bilgi.gonderen}>`,
    ...(bilgi.yanit ? { reply_to: bilgi.yanit } : {}),
    subject: deneme ? `[DENEME] ${konu}` : konu,
    html: musteriEpostaHtml(sablon, degerler, iletisim, ekNotu),
    text: musteriEpostaMetni(sablon, degerler, iletisim),
    ...(ekler ? { attachments: ekler } : {}),
  };
}

async function resendGonder(govde: Record<string, unknown>): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Sirket ici e-postalar (lojistik / yetkili)
// ---------------------------------------------------------------------------
type Bildirim = { id: string; sablon: string; alici: string; hedef: string; alici_ad: string | null; degerler: string[]; dugme_eki: string | null; cc?: string[] | null };

const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function epostaHtml(baslik: string, giris: string, satirlar: [string, string][], dugme: { metin: string; adres: string } | null, not: string): string {
  const tablo = satirlar
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6B7290;font-size:14px;white-space:nowrap;">${kacis(k)}</td><td style="padding:6px 0;color:#1B2352;font-size:15px;font-weight:600;">${kacis(v)}</td></tr>`)
    .join("");
  const btn = dugme
    ? `<p style="margin:28px 0 8px;"><a href="${kacis(dugme.adres)}" style="display:inline-block;background:#283474;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:10px;">${kacis(dugme.metin)}</a></p>
       <p style="margin:0;color:#8B91A8;font-size:12px;">Düğme çalışmazsa: ${kacis(dugme.adres)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#1B2352;padding:22px 28px;border-bottom:4px solid #F4A07C;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><img src="${SITE_ADRESI}/images/logo.png" width="44" height="44" alt="Unex" style="display:block;background:#ffffff;border-radius:10px;padding:4px;"></td>
<td style="vertical-align:middle;"><p style="margin:0;color:#F4A07C;font-size:12px;letter-spacing:3px;font-weight:700;">UNEX GIDA · İÇ PİYASA</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${kacis(baslik)}</p></td>
</tr></table></td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 16px;color:#1B2352;font-size:15px;line-height:1.5;">${kacis(giris)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${tablo}</table>
${btn}
<p style="margin:24px 0 0;color:#8B91A8;font-size:12px;line-height:1.5;">${kacis(not)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function epostaOlustur(b: Bildirim): { konu: string; html: string } {
  const [plaka, siparis, urun, net, saat] = b.degerler.map((d) => String(d ?? "-"));
  const satirlar: [string, string][] = [["Plaka", plaka], ["Sipariş", siparis], ["Ürün", urun], ["Net miktar", net]];
  const cikisDugme = b.dugme_eki ? { metin: "Çıkışı bildir", adres: cikisAdresi(b.dugme_eki) } : null;
  const otomatik = "Bu e-posta İhracat AI › İç Piyasa tarafından otomatik gönderildi. Müşteriye bu aşamada bir şey gitmez; müşteri mesajı ancak çıkış onaylanınca hazırlanır.";
  switch (b.sablon) {
    case "cikis_onayi_talebi":
      return {
        konu: `Çıkış onayı: ${plaka} · ${siparis}`,
        html: epostaHtml("Araç yüklendi, çıkış onayı bekleniyor", "Kantar irsaliyeyi onayladı. Aracın çıkış durumunu aşağıdaki düğmeden bildirin: şimdi çıkıyor, saat seç ya da bugün çıkmayacak.", satirlar, cikisDugme, otomatik),
      };
    case "cikis_hatirlatma":
      return {
        konu: `Hatırlatma: ${plaka} çıktı mı?${saat && saat !== "-" ? ` (planlanan ${saat})` : ""}`,
        html: epostaHtml(saat && saat !== "-" ? `Planlanan saat geldi: ${saat}` : "Çıkış bildirimi bekleniyor",
          saat && saat !== "-" ? "Araç için verdiğiniz çıkış saati geldi. Araç yola çıktıysa onaylayın; çıkmadıysa yeni saat seçin." : "Araç yükleneli bir saat oldu ve çıkış durumu henüz bildirilmedi.",
          saat && saat !== "-" ? [...satirlar, ["Planlanan", saat]] : satirlar, cikisDugme, otomatik),
      };
    case "cikis_cevap_yok":
      return {
        konu: `Cevap yok: ${plaka} · ${siparis}`,
        html: epostaHtml("Lojistikten çıkış cevabı gelmedi",
          saat && saat !== "-" ? `Planlanan çıkış saati (${saat}) üzerinden 30 dakika geçti, lojistikten teyit gelmedi.` : "Araç yükleneli iki saat oldu, lojistikten çıkış bildirimi gelmedi.",
          satirlar, cikisDugme, "Lojistikle görüşüp durumu bu düğmeden siz de işleyebilirsiniz (İç Piyasa › İş Emirleri'nden de yapılabilir)."),
      };
    case "cikis_bugun_degil":
      return {
        konu: `Bugün çıkmayacak: ${plaka} · ${siparis}`,
        // degerler[4] = isleyen: "Süleyman (bağlantı)" / yetkili e-postası / bos
        html: epostaHtml(
          "Araç bugün çıkmayacak",
          "Araç için “bugün çıkmayacak” bildirildi. Müşteriye bir şey gönderilmedi.",
          saat && saat !== "-" ? [...satirlar, ["Bildiren", saat.replace(/\s*\(bağlantı\)\s*$/, "").trim()]] : satirlar,
          cikisDugme,
          "Yeni çıkış saati verildiğinde ya da araç çıktığında aynı düğme kullanılır."
        ),
      };
    default:
      throw new Error(`Bilinmeyen e-posta şablonu: ${b.sablon} (${BILDIRIM_ETIKET[b.sablon] || "?"})`);
  }
}

async function kuyruguIsle(): Promise<{ zamanlanan: number; gonderilen: number; hatali: number }> {
  const zamanlanan = await rpc<number>("ic_bildirim_zamanla", {});
  const isler = await rpc<Bildirim[]>("ic_bildirim_eposta_al", { p_limit: 20 });
  let gonderilen = 0;
  let hatali = 0;
  for (const b of isler || []) {
    try {
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
      const cc = b.cc && b.cc.length ? { cc: b.cc.filter((x) => x && x.toLowerCase() !== b.hedef.toLowerCase()) } : {};
      if (b.alici === "musteri") {
        // Kuyruk bunu yalnizca otomatik gonderim aciksa verir (ic_bildirim_eposta_al)
        const bilgi = await rpc<MusteriBilgi | null>("ic_musteri_eposta_bilgi", { p_id: b.id });
        if (!bilgi) throw new Error("Müşteri e-postası bilgisi okunamadı.");
        const e = await musteriEpostasi(b.sablon, (b.degerler || []).map((d) => String(d ?? "")), bilgi);
        await resendGonder({ ...e, to: [b.hedef], ...cc });
      } else {
        const { konu, html } = epostaOlustur(b);
        await resendGonder({ from: GONDEREN, to: [b.hedef], ...cc, subject: konu, html });
      }
      await rpc("ic_bildirim_eposta_sonuc", { p_id: b.id, p_basarili: true });
      gonderilen++;
    } catch (e) {
      hatali++;
      await rpc("ic_bildirim_eposta_sonuc", { p_id: b.id, p_basarili: false, p_hata: e instanceof Error ? e.message : String(e) }).catch(() => {});
    }
  }
  return { zamanlanan, gonderilen, hatali };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ hata: "Sadece POST." }, 405);
  let govde: Record<string, unknown> = {};
  try { govde = await req.json(); } catch { /* bos govde */ }
  const islem = govde.islem;
  try {
    if (islem === "takip") {
      if (!tokenGecerli(govde.token)) return json({ hata: "Bağlantı geçersiz." }, 404);
      const veri = await rpc<Record<string, unknown> | null>("ic_takip_bilgi", { p_token: govde.token });
      if (!veri) return json({ hata: "Sipariş bulunamadı." }, 404);
      const sevkler = Array.isArray(veri.sevkler) ? (veri.sevkler as Record<string, unknown>[]) : [];
      const pdfler = await Promise.all(sevkler.map((s) => (typeof s.dosya === "string" ? imzaliPdf(s.dosya) : Promise.resolve(null))));
      veri.sevkler = sevkler.map(({ dosya: _dosya, ...s }, i) => ({ ...s, pdf: pdfler[i] }));
      veri.takip_adresi = takipAdresi(govde.token as string);
      return json(veri);
    }
    if (islem === "cikis_bilgi") {
      if (!tokenGecerli(govde.token)) return json({ hata: "Bağlantı geçersiz." }, 404);
      const veri = await rpc<Record<string, unknown> | null>("ic_cikis_token_bilgi", { p_token: govde.token });
      return veri ? json(veri) : json({ hata: "Bağlantı geçersiz veya araç kaydı silinmiş." }, 404);
    }
    if (islem === "cikis_uygula") {
      if (!tokenGecerli(govde.token)) return json({ hata: "Bağlantı geçersiz." }, 404);
      const karar = govde.karar;
      if (karar !== "cikti" && karar !== "planla" && karar !== "bugun_degil") return json({ hata: "Geçersiz işlem." }, 400);
      let saat: string | null = null;
      if (karar === "planla") {
        const t = typeof govde.saat === "string" ? Date.parse(govde.saat) : NaN;
        if (Number.isNaN(t)) return json({ hata: "Saat seçin." }, 400);
        saat = new Date(t).toISOString();
      }
      const ad = typeof govde.ad === "string" ? govde.ad.trim().slice(0, 60) : "";
      const sonuc = await rpc("ic_cikis_token_isle", { p_token: govde.token, p_islem: karar, p_saat: saat, p_isleyen: ad ? `${ad} (bağlantı)` : null });
      return json(sonuc);
    }
    if (islem === "isle") {
      return json({ basarili: true, ...(await kuyruguIsle()) });
    }
    if (islem === "musteri_deneme") {
      // Oturumdaki kullanicinin KENDI adresine ornek "Araciniz yola cikti" e-postasi
      const yetki = req.headers.get("Authorization") || "";
      const kullanici = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: yetki } });
      if (!kullanici.ok) return json({ hata: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin." }, 401);
      const eposta = String((await kullanici.json())?.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) return json({ hata: "Hesabınızda e-posta adresi yok." }, 400);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ic_musteri_eposta_deneme`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: yetki, "Content-Type": "application/json" }, body: "{}" });
      const metin = await res.text();
      if (!res.ok) {
        let m = metin; try { m = JSON.parse(metin).message || metin; } catch { /* duz */ }
        return json({ hata: m.slice(0, 300) }, res.status === 401 || res.status === 403 ? 403 : 400);
      }
      const bilgi = JSON.parse(metin) as MusteriBilgi;
      const degerler = ["ÖRNEK MÜŞTERİ A.Ş.", "IE-2026-0000", "59 ABC 123 (Dorse: 59 ABC 124)", "Kepek (Dökme)", "26.220 kg", bilgi.irsaliye_no || "IRS2026000000000", "26.220 / 100.000 kg (1. araç)"];
      const e = await musteriEpostasi("arac_yola_cikti", degerler, bilgi, true);
      await resendGonder({ ...e, to: [eposta] });
      return json({ basarili: true, alici: eposta, gonderen: bilgi.gonderen, ek: !!e.attachments });
    }
    return json({ hata: "Bilinmeyen işlem." }, 400);
  } catch (e) {
    if (e instanceof KullaniciHatasi) return json({ hata: e.message }, 400);
    console.error("ic-piyasa hatasi:", e);
    return json({ hata: "Sunucu hatası. Lütfen tekrar deneyin." }, 500);
  }
});
