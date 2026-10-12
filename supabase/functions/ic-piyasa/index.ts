import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { BILDIRIM_ETIKET, SITE_ADRESI, cikisAdresi, takipAdresi } from "../_shared/mesaj-sablonlari.ts";

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
// (migration 20261012200000). Musteriye e-posta GONDERMEZ (askida kurali):
// kuyruktaki e-postalar yalnizca lojistik ve yetkili (sirket ici) icindir.
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda İç Piyasa <bildirim@ihracatasistanim.com>";
const KOVA = "ic-piyasa-belgeler";

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
        html: epostaHtml("Araç bugün çıkmayacak", `Lojistik (${saat || "-"}) aracın bugün çıkmayacağını bildirdi. Müşteriye bir şey gönderilmedi.`, satirlar, cikisDugme, "Yeni çıkış saati verildiğinde ya da araç çıktığında aynı düğme kullanılır."),
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
      if (b.alici === "musteri") throw new Error("Müşteriye e-posta gönderimi kapalı.");
      const { konu, html } = epostaOlustur(b);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: GONDEREN, to: [b.hedef], ...(b.cc && b.cc.length ? { cc: b.cc } : {}), subject: konu, html }),
      });
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    return json({ hata: "Bilinmeyen işlem." }, 400);
  } catch (e) {
    if (e instanceof KullaniciHatasi) return json({ hata: e.message }, 400);
    console.error("ic-piyasa hatasi:", e);
    return json({ hata: "Sunucu hatası. Lütfen tekrar deneyin." }, 500);
  }
});
