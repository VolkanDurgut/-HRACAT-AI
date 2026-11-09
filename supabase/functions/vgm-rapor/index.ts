import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsPDF } from "npm:jspdf@4.2.1";
import { autoTable } from "npm:jspdf-autotable@5.0.8";
import { ROBOTO_VGM_BASE64 } from "../_shared/roboto-vgm-base64.ts";
import { vgmPdfCiz, vgmPdfDosyaAdi, type VgmPdfVerisi } from "../_shared/vgm-pdf.ts";

// ============================================================================
// VGM RAPORU MAILI (vgm-rapor) - 10.11.2026
// ============================================================================
// Kullanici: "VGM raporunda toplam butun konteynerlerin VGM'i hazir oldugunda operation mailine VGM raporu
// gonderilsin. Mailde VGM indir butonu olsun. Tiklayinca hemen indirebilsin." Metin: "Kolay gelsin Volkan Bey,
// VGM Raporu ektedir. Lutfen ilgili acenteye gonderimini saglayalim."
// - Kosul: ACIK dosya; rezervasyon konteyner adedi > 0; girilen konteyner >= rezervasyon adedi; HER konteynerde VGM.
// - Dosya basina BIR KEZ (vgm_rapor_gonderimleri kismi benzersiz index). PDF: uygulamadaki "VGM Indir" ile AYNI cizim
//   (_shared/vgm-pdf.ts). Mailde PDF eki + "VGM Indir" dugmesi (depodaki PDF'in 30 gunluk imzali adresi; giris gerekmez).
// Govde:
//  - {} (pg_cron 'vgm-rapor', anon anahtar): yalniz CANLI modda tarar ve gonderir; veri dondurmez.
//  - {"test": true, "dosya_id": "..."}: "[TEST]" mail YALNIZ test adresine; dosyayi gonderilmis SAYMAZ; 24 saatte en fazla 5.
//  - {"onceden_isaretle": true}: (service_role) canliya gecerken su an tamam olan acik dosyalari 'onceden' isaretler.
// Alicilar (secret, virgulle): VGM_RAPOR_ALICI (varsayilan execution@), VGM_RAPOR_CC (varsayilan bbt@, export@,
//   export2@, operation@). VGM_RAPOR_CANLI = "evet" degilse otomatik gonderim YOK (yalniz test cagrisi).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GONDEREN = "Unex Gıda İhracat <bildirim@ihracatasistanim.com>";
const SITE = "https://ihracatasistanim.com";
const KOVA = "konsimento-talimatlari";
const IMZA_SURESI_SN = 30 * 24 * 3600;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

const EPOSTA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function adresler(ad: string, varsayilan: string[]): string[] {
  const liste = (Deno.env.get(ad) || "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => EPOSTA.test(a));
  return liste.length ? Array.from(new Set(liste)).slice(0, 8) : varsayilan;
}
const CANLI = (Deno.env.get("VGM_RAPOR_CANLI") || "").trim().toLowerCase() === "evet";
const ALICI = adresler("VGM_RAPOR_ALICI", ["execution@unex.com.tr"]);
const CC = adresler("VGM_RAPOR_CC", ["bbt@unex.com.tr", "export@unex.com.tr", "export2@unex.com.tr", "operation@unex.com.tr"]).filter((a) => !ALICI.includes(a));
const TEST_ALICISI = adresler("VGM_RAPOR_TEST_ALICISI", ["mesensei282@gmail.com"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
async function yaz(tablo: string, yontem: "POST" | "PATCH", govde: unknown, filtre = ""): Promise<{ ok: boolean; durum: number; metin: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablo}${filtre}`, {
    method: yontem, headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(govde),
  });
  return { ok: res.ok, durum: res.status, metin: await res.text() };
}
const inListe = (idler: string[]) => `(${idler.map((i) => `"${i}"`).join(",")})`;

type Dosya = { id: string; company_id: string; dosya_no: string | null; alici_firma: string | null; varis_limani: string | null; yuklenme_limani: string | null };
type Rez = { dosya_id: string; booking_no: string | null; gemi_adi: string | null; yuklenme_limani: string | null; acente_ismi: string | null; konteyner_adedi: number | null; olusturma_tarihi: string | null };
type Kont = { dosya_id: string; konteyner_no: string | null; vgm_kg: number | string | null; tare_kg: number | string | null; olusturma_tarihi: string | null };
type Hazir = { dosya: Dosya; rez: Rez[]; kont: Kont[] };

const sayi = (x: number | string | null) => (x === null || x === "" ? null : Number(x));

/** Acik dosyalardan VGM'i tamam olanlar (istenirse tek dosya). */
async function hazirDosyalar(tekDosya?: string): Promise<Hazir[]> {
  const filtre = tekDosya ? `id=eq.${tekDosya}` : `durum=eq.${encodeURIComponent("Açık")}`;
  const dosyalar = await oku<Dosya>(`ihracat_dosyalari?select=id,company_id,dosya_no,alici_firma,varis_limani,yuklenme_limani&${filtre}&limit=500`);
  if (!dosyalar.length) return [];
  const idler = dosyalar.map((d) => d.id);
  const [rezler, kontlar] = await Promise.all([
    oku<Rez>(`rezervasyonlar?select=dosya_id,booking_no,gemi_adi,yuklenme_limani,acente_ismi,konteyner_adedi,olusturma_tarihi&dosya_id=in.${inListe(idler)}&order=olusturma_tarihi.asc&limit=5000`),
    oku<Kont>(`konteynerler?select=dosya_id,konteyner_no,vgm_kg,tare_kg,olusturma_tarihi&dosya_id=in.${inListe(idler)}&order=olusturma_tarihi.asc&limit=20000`),
  ]);
  const sonuc: Hazir[] = [];
  for (const d of dosyalar) {
    const rez = rezler.filter((r) => r.dosya_id === d.id);
    const kont = kontlar.filter((k) => k.dosya_id === d.id);
    const adet = rez.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
    const tamam = adet > 0 && kont.length >= adet && kont.every((k) => (sayi(k.vgm_kg) || 0) > 0);
    if (tamam) sonuc.push({ dosya: d, rez, kont });
  }
  return sonuc;
}

const trZaman = (ms = Date.now()) => {
  const t = new Date(ms + 3 * 3600_000).toISOString();
  return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)} ${t.slice(11, 16)}`;
};

function pdfOlustur(h: Hazir): Uint8Array {
  const rez = h.rez[0];
  const veri: VgmPdfVerisi = {
    dosyaNo: h.dosya.dosya_no,
    bookingNo: rez?.booking_no || null,
    gemi: rez?.gemi_adi || null,
    yuklemeLimani: rez?.yuklenme_limani || h.dosya.yuklenme_limani || null,
    varisLimani: h.dosya.varis_limani || null,
    konteynerler: h.kont.map((k) => ({ no: k.konteyner_no, vgm: sayi(k.vgm_kg), tare: sayi(k.tare_kg) })),
    olusturma: trZaman(),
  };
  const doc = new jsPDF({ orientation: "landscape" });
  vgmPdfCiz(doc, autoTable, ROBOTO_VGM_BASE64, veri);
  return new Uint8Array(doc.output("arraybuffer"));
}

async function depolaVeImzala(h: Hazir, pdf: Uint8Array, test: boolean): Promise<{ yol: string; adres: string }> {
  const yol = `vgm-rapor/${h.dosya.id}/${Date.now()}${test ? "_test" : ""}.pdf`;
  const yukle = await fetch(`${SUPABASE_URL}/storage/v1/object/${KOVA}/${yol}`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/pdf", "x-upsert": "false" }, body: pdf.slice().buffer as ArrayBuffer,
  });
  if (!yukle.ok) throw new Error(`PDF depoya yazılamadı (HTTP ${yukle.status}): ${(await yukle.text()).slice(0, 200)}`);
  const imza = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${KOVA}/${yol}`, {
    method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: IMZA_SURESI_SN }),
  });
  if (!imza.ok) throw new Error(`İndirme bağlantısı oluşturulamadı (HTTP ${imza.status}).`);
  const { signedURL } = await imza.json() as { signedURL: string };
  const adres = `${SUPABASE_URL}/storage/v1${signedURL}&download=${encodeURIComponent(vgmPdfDosyaAdi(h.dosya.dosya_no))}`;
  return { yol, adres };
}

const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#1B2352";
const SEFTALI = "#F4A07C";

function mailOlustur(h: Hazir, indirAdresi: string, test: boolean): { konu: string; html: string } {
  const gemiler = Array.from(new Set(h.rez.map((r) => (r.gemi_adi || "").trim()).filter(Boolean))).join(", ");
  const acente = Array.from(new Set(h.rez.map((r) => (r.acente_ismi || "").trim()).filter(Boolean))).join(", ");
  const toplamVgm = h.kont.reduce((s, k) => s + (sayi(k.vgm_kg) || 0), 0);
  const konu = `${test ? "[TEST] " : ""}VGM Raporu · ${h.dosya.dosya_no || "-"} · ${h.dosya.alici_firma || "-"}`;
  const satir = (etiket: string, deger: string) =>
    `<tr><td style="padding:7px 0;color:#6B7280;font-size:13px;width:150px;vertical-align:top;">${kacis(etiket)}</td><td style="padding:7px 0;color:${LACIVERT};font-size:14px;font-weight:700;">${kacis(deger || "-")}</td></tr>`;
  const testSeridi = test
    ? `<tr><td style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:10px 28px;border-bottom:1px solid #FCD34D;">TEST · Bu e-posta yalnızca test adresine gönderildi. Canlıda alıcı: ${kacis(ALICI.join(", "))} · CC: ${kacis(CC.join(", "))}</td></tr>`
    : "";
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;">
<tr><td style="background:${LACIVERT};padding:18px 28px;border-bottom:4px solid ${SEFTALI};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:16px;vertical-align:middle;"><img src="${SITE}/images/logo.png" width="56" height="56" alt="Unex Gıda" style="display:block;border:0;"></td>
<td style="vertical-align:middle;border-left:1px solid rgba(255,255,255,0.18);padding-left:16px;"><p style="margin:0;color:${SEFTALI};font-size:12px;letter-spacing:3px;font-weight:700;">UNEX GIDA · İHRACAT OPERASYON</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:21px;font-weight:700;">VGM Raporu hazır</p></td>
</tr></table></td></tr>
${testSeridi}
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 6px;color:${LACIVERT};font-size:15px;line-height:1.55;">Kolay gelsin Volkan Bey,</p>
<p style="margin:0 0 18px;color:${LACIVERT};font-size:15px;line-height:1.55;">VGM Raporu ektedir. Lütfen ilgili acenteye gönderimini sağlayalım.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;margin:0 0 20px;">
${satir("Dosya", h.dosya.dosya_no || "-")}
${satir("Alıcı", h.dosya.alici_firma || "-")}
${satir("Gemi", gemiler || "-")}
${satir("Acente", acente || "-")}
${satir("Konteyner", `${h.kont.length} adet · toplam VGM ${toplamVgm.toLocaleString("tr-TR")} kg`)}
</table>
<p style="margin:0 0 6px;"><a href="${kacis(indirAdresi)}" style="display:inline-block;background:#283474;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:4px;">VGM İndir</a>
<a href="${kacis(`${SITE}/dosya/${h.dosya.id}?tab=konteynerler`)}" style="display:inline-block;margin-left:8px;color:#283474;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border:1px solid #283474;border-radius:4px;">Dosyayı aç</a></p>
<p style="margin:10px 0 0;color:#8B91A8;font-size:12px;line-height:1.5;">PDF bu e-postanın ekinde de var. İndirme bağlantısı 30 gün geçerlidir; giriş gerektirmez. Bu rapor tüm konteynerlerin VGM'i girildiğinde İhracat AI tarafından otomatik gönderildi.</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { konu, html };
}

function base64(bayt: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bayt.length; i += 0x8000) s += String.fromCharCode(...bayt.subarray(i, i + 0x8000));
  return btoa(s);
}

async function mailGonder(to: string[], cc: string[], konu: string, html: string, pdf: Uint8Array, ad: string): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY tanımlı değil.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: GONDEREN, to, ...(cc.length ? { cc } : {}), subject: konu, html, attachments: [{ filename: ad, content: base64(pdf) }] }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id?: string }).id || null;
}

/** Tek dosya: PDF -> depo -> mail. Canlida once kayit (benzersiz index cift maili engeller), sonra mail. */
async function isle(h: Hazir, test: boolean): Promise<{ dosya_no: string | null; durum: string; hata?: string }> {
  let kayitId: string | null = null;
  if (!test) {
    const k = await yaz("vgm_rapor_gonderimleri", "POST", { company_id: h.dosya.company_id, dosya_id: h.dosya.id, durum: "gonderildi", alicilar: [...ALICI, ...CC], konteyner_sayisi: h.kont.length });
    if (!k.ok) return { dosya_no: h.dosya.dosya_no, durum: "atlandi", hata: k.durum === 409 ? "zaten gönderildi" : k.metin.slice(0, 120) };
    kayitId = (JSON.parse(k.metin) as { id: string }[])[0]?.id || null;
  }
  try {
    const pdf = pdfOlustur(h);
    const { yol, adres } = await depolaVeImzala(h, pdf, test);
    const { konu, html } = mailOlustur(h, adres, test);
    const mesajId = await mailGonder(test ? TEST_ALICISI : ALICI, test ? [] : CC, konu, html, pdf, vgmPdfDosyaAdi(h.dosya.dosya_no));
    if (kayitId) await yaz("vgm_rapor_gonderimleri", "PATCH", { pdf_yolu: yol, mesaj_id: mesajId }, `?id=eq.${kayitId}`);
    else await yaz("vgm_rapor_gonderimleri", "POST", { company_id: h.dosya.company_id, dosya_id: h.dosya.id, durum: "test", alicilar: TEST_ALICISI, konteyner_sayisi: h.kont.length, pdf_yolu: yol, mesaj_id: mesajId });
    return { dosya_no: h.dosya.dosya_no, durum: test ? "test" : "gonderildi" };
  } catch (e) {
    const hata = e instanceof Error ? e.message : String(e);
    // Basarisiz canli gonderim 'hata'ya cekilir: benzersiz index serbest kalir, sonraki turda yeniden denenir
    if (kayitId) await yaz("vgm_rapor_gonderimleri", "PATCH", { durum: "hata", hata: hata.slice(0, 500) }, `?id=eq.${kayitId}`);
    return { dosya_no: h.dosya.dosya_no, durum: "hata", hata };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Yalnız POST." }, 405);
  const rol = jwtRolu((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  if (rol !== "anon" && rol !== "service_role") return json({ error: "Yetkisiz." }, 401);
  let govde: { test?: unknown; dosya_id?: unknown; onceden_isaretle?: unknown } = {};
  try { govde = await req.json(); } catch { govde = {}; }

  try {
    if (govde.test === true) {
      const id = typeof govde.dosya_id === "string" ? govde.dosya_id : "";
      if (!UUID_RE.test(id)) return json({ error: "dosya_id gerekli." }, 400);
      const gun = new Date(Date.now() - 24 * 3600_000).toISOString();
      const sayilan = await oku<{ id: string }>(`vgm_rapor_gonderimleri?select=id&durum=eq.test&olusturma=gte.${gun}`);
      if (sayilan.length >= 5) return json({ error: "Test sınırı (24 saatte 5) doldu." }, 429);
      const h = (await hazirDosyalar(id))[0];
      if (!h) return json({ error: "Dosyanın VGM'i tamam değil." }, 409);
      const s = await isle(h, true);
      return json({ test: true, durum: s.durum, ...(s.hata ? { hata: s.hata } : {}) });
    }

    if (govde.onceden_isaretle === true) {
      if (rol !== "service_role") return json({ error: "Yetkisiz." }, 401);
      const hazir = await hazirDosyalar();
      const onceki = hazir.length ? await oku<{ dosya_id: string }>(`vgm_rapor_gonderimleri?select=dosya_id&durum=in.(gonderildi,onceden)&dosya_id=in.${inListe(hazir.map((h) => h.dosya.id))}`) : [];
      const yeni = hazir.filter((h) => !onceki.some((o) => o.dosya_id === h.dosya.id));
      for (const h of yeni) await yaz("vgm_rapor_gonderimleri", "POST", { company_id: h.dosya.company_id, dosya_id: h.dosya.id, durum: "onceden", konteyner_sayisi: h.kont.length });
      return json({ isaretlenen: yeni.map((h) => h.dosya.dosya_no) });
    }

    // Zamanlanmis tarama: yalniz canli modda
    if (!CANLI) return json({ ok: true, canli: false });
    const hazir = await hazirDosyalar();
    if (!hazir.length) return json({ ok: true });
    const onceki = await oku<{ dosya_id: string; durum: string; olusturma: string }>(`vgm_rapor_gonderimleri?select=dosya_id,durum,olusturma&dosya_id=in.${inListe(hazir.map((h) => h.dosya.id))}`);
    const bekleyen = hazir.filter((h) => {
      const k = onceki.filter((o) => o.dosya_id === h.dosya.id);
      if (k.some((o) => o.durum === "gonderildi" || o.durum === "onceden")) return false;
      return k.filter((o) => o.durum === "hata").length < 3; // en fazla 3 deneme
    }).slice(0, 10);
    let gonderilen = 0;
    for (const h of bekleyen) if ((await isle(h, false)).durum === "gonderildi") gonderilen++;
    // anon cagrisina veri dondurulmez
    return json({ ok: true, gonderilen });
  } catch (e) {
    console.error("vgm-rapor", e);
    return json({ error: "İşlem tamamlanamadı." }, 500);
  }
});
