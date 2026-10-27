// ============================================================================
// SATIN ALMA - ortak sabitler + mail sablonlari (26.10.2026)
// ============================================================================
// SAF TypeScript (Deno/Next bagimliligi yok): hem edge function "satin-alma"
// hem uygulama (app/satin-alma, app/talep/[token]) ayni etiketleri kullanir.
// Veritabanindaki CHECK listeleriyle (migration 20261026100000) BIREBIR ayni.
// ============================================================================

export const SA_SITE = "https://ihracatasistanim.com";
export const talepAdresi = (token: string) => `${SA_SITE}/talep/${token}`;
export const yonetimAdresi = (listeId: string) => `${SA_SITE}/satin-alma?liste=${listeId}`;
/** Onaylanan kalemlerin girissiz "Unex cek listesi" sayfasi (execution@ isaretler). */
export const cekAdresi = (token: string) => `${SA_SITE}/cek/${token}`;

export const KATEGORILER = {
  kirtasiye: "Kırtasiye",
  temizlik: "Temizlik",
  mutfak: "Mutfak",
  elektronik: "Bilgisayar / Elektronik",
  is_guvenligi: "İş Güvenliği",
  diger: "Diğer",
} as const;
export type Kategori = keyof typeof KATEGORILER;

export const BIRIMLER = {
  adet: "Adet",
  paket: "Paket",
  koli: "Koli",
  kutu: "Kutu",
  top: "Top",
  kg: "Kg",
  litre: "Litre",
  metre: "Metre",
  takim: "Takım",
  diger: "Diğer",
} as const;
export type Birim = keyof typeof BIRIMLER;

export type SaKalem = {
  id: string;
  kategori: Kategori;
  urun: string;
  miktar: number | string;
  birim: Birim;
  aciliyet: "normal" | "acil";
  aciklama: string | null;
  talep_eden: string;
  karar: "bekliyor" | "onaylandi" | "reddedildi";
  red_nedeni: string | null;
  olusturma: string;
  /** Cek listesi: onaylanan kalem alindi mi */
  alindi?: boolean;
  alinma_zamani?: string | null;
  alan_ad?: string | null;
};

export type SaListe = {
  id: string;
  liste_no: string | null;
  durum: "taslak" | "bekliyor" | "sonuclandi";
  departman: string;
  departman_id?: string;
  sirket: string | null;
  /** Test departmani: mailler SADECE test adresine gider, konu "[TEST] " ile baslar. */
  test?: boolean;
  gonderen_ad: string | null;
  gonderim_zamani: string | null;
  karar_veren_email: string | null;
  karar_zamani: string | null;
  karar_notu: string | null;
  gonderim_maili: "gonderildi" | "hata" | null;
  sonuc_maili: "gonderildi" | "hata" | null;
  /** Onaylanan kalem varsa karar aninda 'aktif'; hepsi alininca 'tamamlandi'. */
  cek_durumu?: "aktif" | "tamamlandi" | null;
  cek_tamamlanma?: string | null;
  /** SADECE karar / mail verisinde gelir (departman sayfasina ASLA). */
  cek_token?: string | null;
  kalemler: SaKalem[];
};

/** 5 -> "5", 2.5 -> "2,5" */
export function miktarYaz(m: number | string): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return String(m);
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export const miktarBirim = (k: Pick<SaKalem, "miktar" | "birim">) => `${miktarYaz(k.miktar)} ${BIRIMLER[k.birim] ?? k.birim}`;

/** "26.10.2026 14:05" (Turkiye saati) */
export function saTarih(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function listeOzeti(l: Pick<SaListe, "kalemler">) {
  const k = l.kalemler || [];
  return {
    toplam: k.length,
    acil: k.filter((x) => x.aciliyet === "acil").length,
    onay: k.filter((x) => x.karar === "onaylandi").length,
    red: k.filter((x) => x.karar === "reddedildi").length,
    alinan: k.filter((x) => x.karar === "onaylandi" && x.alindi).length,
  };
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------
const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LACIVERT = "#1B2352";
const SEFTALI = "#F4A07C";

function cerceve(ust: string, baslik: string, govde: string, test = false): string {
  const testSeridi = test
    ? `<tr><td style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:10px 28px;border-bottom:1px solid #FCD34D;">TEST · Bu e-posta test departmanından gönderildi. Gerçek alıcılara (execution@ / bbt@) gönderilmedi.</td></tr>`
    : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:${LACIVERT};padding:22px 28px;border-bottom:4px solid ${SEFTALI};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><img src="${SA_SITE}/images/logo.png" width="44" height="44" alt="Unex" style="display:block;background:#ffffff;border-radius:10px;padding:4px;"></td>
<td style="vertical-align:middle;"><p style="margin:0;color:${SEFTALI};font-size:12px;letter-spacing:3px;font-weight:700;">${kacis(ust)}</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:21px;font-weight:700;">${kacis(baslik)}</p></td>
</tr></table></td></tr>
${testSeridi}
<tr><td style="padding:24px 28px;">${govde}</td></tr>
</table></td></tr></table></body></html>`;
}

function bilgiTablosu(satirlar: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${satirlar
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6B7290;font-size:13px;white-space:nowrap;vertical-align:top;">${kacis(k)}</td><td style="padding:4px 0;color:${LACIVERT};font-size:14px;font-weight:600;">${kacis(v)}</td></tr>`)
    .join("")}</table>`;
}

const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:8px;text-align:${sag ? "right" : "left"};">${t}</th>`;
const td = (icerik: string, ek = "") => `<td style="padding:8px;border-bottom:1px solid #E3E1DA;font-size:13px;color:#1E293B;vertical-align:top;${ek}">${icerik}</td>`;
const rozet = (metin: string, zemin: string, renk: string) => `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${zemin};color:${renk};font-size:11px;font-weight:700;white-space:nowrap;">${kacis(metin)}</span>`;

function kalemSatiri(k: SaKalem, ilkHucre: string, sonuc: boolean): string {
  const urun = `<div style="color:#6B7290;font-size:11px;margin-bottom:1px;">${kacis(KATEGORILER[k.kategori] ?? k.kategori)}</div><b>${kacis(k.urun)}</b>${k.aciklama ? `<div style="color:#6B7290;font-size:12px;margin-top:2px;">${kacis(k.aciklama)}</div>` : ""}${sonuc && k.karar === "reddedildi" && k.red_nedeni ? `<div style="color:#B91C1C;font-size:12px;margin-top:2px;">Red nedeni: ${kacis(k.red_nedeni)}</div>` : ""}`;
  const acil = k.aciliyet === "acil" ? rozet("ACİL", "#FEE2E2", "#B91C1C") : `<span style="color:#6B7290;font-size:12px;">Normal</span>`;
  return `<tr>${ilkHucre}${td(urun)}${td(kacis(miktarBirim(k)), "text-align:right;white-space:nowrap;font-weight:700;")}${td(acil)}${td(kacis(k.talep_eden), "white-space:nowrap;")}</tr>`;
}

function kalemTablosu(kalemler: SaKalem[], sonuc = false): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;">
<tr>${th("#")}${th("Ürün")}${th("Miktar", true)}${th("Aciliyet")}${th("Talep eden")}</tr>
${kalemler.map((k, i) => kalemSatiri(k, td(String(i + 1), "color:#6B7290;"), sonuc)).join("")}</table>`;
}

const dugme = (metin: string, adres: string) => `<p style="margin:8px 0 6px;"><a href="${kacis(adres)}" style="display:inline-block;background:#283474;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;">${kacis(metin)}</a></p>
<p style="margin:0 0 18px;color:#8B91A8;font-size:12px;">Düğme çalışmazsa: ${kacis(adres)}</p>`;

const altNot = (metin: string) => `<p style="margin:8px 0 0;color:#8B91A8;font-size:12px;line-height:1.5;">${kacis(metin)}</p>`;

const testKonu = (l: SaListe, konu: string) => (l.test ? `[TEST] ${konu}` : konu);

/** Departman listeyi gonderdi -> execution@ + bbt@ */
export function gonderimMaili(l: SaListe): { konu: string; html: string } {
  const o = listeOzeti(l);
  const konu = `Satın alma talebi: ${l.departman} · ${l.liste_no} (${o.toplam} kalem${o.acil ? `, ${o.acil} acil` : ""})`;
  const govde = `<p style="margin:0 0 16px;color:${LACIVERT};font-size:15px;line-height:1.5;"><b>${kacis(l.departman)}</b> departmanı satın alma talep formunu gönderdi. Kalemleri tek tek onaylayabilir ya da reddedebilirsiniz.</p>
${bilgiTablosu([["Talep no", l.liste_no || "-"], ["Departman", l.departman], ["Gönderen", l.gonderen_ad || "-"], ["Gönderim", saTarih(l.gonderim_zamani)], ["Kalem", `${o.toplam}${o.acil ? ` (${o.acil} acil)` : ""}`]])}
${kalemTablosu(l.kalemler)}
${dugme("Talebi incele ve karar ver", yonetimAdresi(l.id))}
${altNot("Bu e-posta İhracat AI › Satın Alma tarafından otomatik gönderildi. Karar verildiğinde onaylı satın alma fişi execution@ adresine iletilir.")}`;
  return { konu: testKonu(l, konu), html: cerceve("UNEX GIDA · SATIN ALMA", "Satın alma talep formu", govde, l.test) };
}

/** Burak Bey karar verdi -> execution@: departman etiketli ONAYLI SATIN ALMA FISI
 * (veritabaninda "cek listesi"). execution@ fis baglantisini ilgili departmana iletir. */
export function sonucMaili(l: SaListe): { konu: string; html: string } {
  const o = listeOzeti(l);
  const onaylar = l.kalemler.filter((k) => k.karar === "onaylandi");
  const redler = l.kalemler.filter((k) => k.karar === "reddedildi");
  const konu = o.onay
    ? `[${l.departman}] Onaylı satın alma fişi · ${l.liste_no} (${o.onay} kalem${o.red ? `, ${o.red} reddedildi` : ""})`
    : `[${l.departman}] Satın alma talebi reddedildi · ${l.liste_no}`;
  const bolum = (baslik: string, renk: string) => `<p style="margin:6px 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${renk};border-left:4px solid ${SEFTALI};padding-left:8px;">${kacis(baslik)}</p>`;
  const kutu = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #283474;border-radius:3px;"></span>`;
  const cekTablosu = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;">
<tr>${th("✓")}${th("Ürün")}${th("Miktar", true)}${th("Aciliyet")}${th("Talep eden")}</tr>
${onaylar.map((k) => kalemSatiri(k, td(kutu, "width:22px;"), true)).join("")}</table>`;
  const govde = `<p style="margin:0 0 16px;color:${LACIVERT};font-size:15px;line-height:1.5;">${o.onay
    ? `<b>${kacis(l.departman)}</b> departmanının talebinde <b>${o.onay} kalem onaylandı</b>. Onaylı satın alma fişi <b>aktiftir</b>; alınan kalemleri fiş sayfasından işaretleyin. Fiş bağlantısını ya da yazdırılmış fişi ilgili departmana iletebilirsiniz.`
    : `<b>${kacis(l.departman)}</b> departmanının talebindeki kalemlerin hiçbiri onaylanmadı.`}</p>
${bilgiTablosu([["Departman", l.departman], ["Fiş / talep no", l.liste_no || "-"], ["Gönderen", l.gonderen_ad || "-"], ["Onaylayan", l.karar_veren_email || "-"], ["Onay", saTarih(l.karar_zamani)], ...(o.onay ? [["Fiş durumu", `Aktif · ${o.onay} kalem`] as [string, string]] : []), ...(l.karar_notu ? [["Not", l.karar_notu] as [string, string]] : [])])}
${onaylar.length ? `${bolum(`Onaylanan kalemler (${onaylar.length})`, "#047857")}${cekTablosu}` : ""}
${redler.length ? `${bolum(`Reddedilen kalemler (${redler.length})`, "#B91C1C")}${kalemTablosu(redler, true)}` : ""}
${o.onay && l.cek_token ? dugme("Satın alma fişini aç", cekAdresi(l.cek_token)) : dugme("Listeyi uygulamada aç", yonetimAdresi(l.id))}
${altNot(o.onay
  ? "Bu e-posta İhracat AI › Satın Alma tarafından otomatik gönderildi. Fiş bağlantısını açan herkes kalemleri “alındı” olarak işaretleyebilir; tüm kalemler alınınca fiş tamamlanır. Departman sonucu kendi talep bağlantısında da görür."
  : "Bu e-posta İhracat AI › Satın Alma tarafından otomatik gönderildi. Departman sonucu kendi talep bağlantısında görür.")}`;
  return { konu: testKonu(l, konu), html: cerceve("UNEX GIDA · SATIN ALMA", o.onay ? "Onaylı satın alma fişi" : "Talep reddedildi", govde, l.test) };
}
