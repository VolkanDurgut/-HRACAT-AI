/**
 * Ic piyasa SIPARIS KAPANIS RAPORU e-postasi (30.10.2026, 2. surum).
 * Kullanici: "Gelen mail gorunumu cok kotu. Ihracat gunluk rapordaki gibi bir sistem yapmaliyiz."
 * Gorunum gunluk raporla AYNI dil (gunluk-rapor-gonder/index.ts mailHtml): logo + baslik serit,
 * uc ozet kutusu (ust kenarlik renkli), lacivert tablo basliklari, turuncu cizgili bolum basliklari,
 * yesil "uygulamada ac" dugmesi. Tablo tabanli + satir ici stil (Outlook/Gmail uyumu).
 * Hesap (hedef / gerceklesen / fark) TEK yerde: mesaj-sablonlari.ts kapanisOzeti.
 * SAF: ag / veritabani yok (edge function veriyi getirir, burada yalniz HTML uretilir).
 * Fiyat YOK (ekip raporu; fiyat ayri yetki). Musteriye GITMEZ.
 */
import type { KapanisOzeti } from "./mesaj-sablonlari.ts";

export type KapanisAraci = {
  plaka: string;
  dorse_plaka: string | null;
  net_kg: number;
  irsaliye_no: string | null;
  /** Kantar kaydi (ISO) */
  olusturma: string;
  /** Sistem oncesi (gecmis) kayit */
  gecmis: boolean;
};

export type KapanisEk = {
  /** Musteri tam unvani (ozet.musteri zaten unvan; kisa ad varsa basta gosterilir) */
  kisaAd?: string | null;
  teslim?: string | null;
  teslimAdresi?: string | null;
  musteriSiparisNo?: string | null;
  araclar: KapanisAraci[];
};

const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
export const KAPANIS_UYGULAMA_URL = "https://ihracatasistanim.com";

/** Sonuc rengi: tam yesil, eksik amber (kalan var), fazla lacivert (asim panelde de izleniyor). */
export const KAPANIS_SONUC_RENGI = { tam: "#047857", eksik: "#B45309", fazla: LACIVERT } as const;
const SONUC_ETIKETI = { tam: "Hedefle uyumlu", eksik: "Eksik kapandı", fazla: "Hedef aşıldı" } as const;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (n: number, en = 0) => n.toLocaleString("tr-TR", { maximumFractionDigits: en });
const ton = (kg: number) => `${sayi(kg / 1000, 3)} ton`;

function trTarih(iso: string, saatli = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", ...(saatli ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

/** "YYYY-MM-DD" (TR gunu) */
function trGun(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}

/** Siparis tarihinden kapanisa takvim gunu (ikisi de varsa). */
export function kapanisSuresiGun(siparisTarihiTR: string, kapanisIso: string): number | null {
  const m = siparisTarihiTR.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const k = trGun(kapanisIso);
  if (!m || !k) return null;
  const bas = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const [y, a, g] = k.split("-").map(Number);
  const gun = Math.round((Date.UTC(y, a - 1, g) - bas) / 86400000);
  return gun >= 0 ? gun : null;
}

/** Konu: "İç Piyasa Kapanış Raporu — IE-2026-0002 · ALİZE … | 29,32 / 25 ton · Fazla 4,32 ton (%17,3)" */
export function kapanisRaporKonusu(o: KapanisOzeti, kisaAd?: string | null): string {
  const musteri = (kisaAd || "").trim() || o.musteri;
  const miktar = o.hedefTur === "kg"
    ? `${sayi(o.gerceklesenKg / 1000, 3)} / ${sayi(o.hedef / 1000, 3)} ton`
    : `${o.aracSayisi} / ${o.hedef} araç`;
  return `İç Piyasa Kapanış Raporu — ${o.isEmriNo} · ${musteri} | ${miktar} · ${o.fark.metin}`;
}

export function kapanisRaporHtml(o: KapanisOzeti, ek: KapanisEk, kapanisIso: string, sirketAdi = "Unex Gıda"): string {
  const renk = KAPANIS_SONUC_RENGI[o.fark.sonuc];
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold">${t}</th>`;
  const td = (t: string, st = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;${st}">${t}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, r: string) =>
    `<td style="width:32%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${r};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:22px;font-weight:bold;color:${r};line-height:1.2">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.45">${alt}</div></td>`;
  const kutuArasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolumBaslik = (t: string) => `<div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${t}</div>`;

  // Ozet kutulari
  const hedefDeger = o.hedefTur === "kg" ? sayi(o.hedef / 1000, 3) : String(o.hedef);
  const hedefAlt = o.hedefTur === "kg" ? `ton · ${sayi(o.hedef)} kg` : "araç (araç hedefli sipariş)";
  const gercekDeger = o.hedefTur === "kg" ? sayi(o.gerceklesenKg / 1000, 3) : String(o.aracSayisi);
  const gercekAlt = o.hedefTur === "kg" ? `ton · ${o.aracSayisi} araç · ${sayi(o.gerceklesenKg)} kg` : `araç · ${sayi(o.gerceklesenKg)} kg`;
  const oranYuzde = o.hedefTur === "kg" && o.hedef > 0 ? `%${sayi((o.gerceklesenKg / o.hedef) * 100, 1)} gerçekleşme` : "";
  const sonucDeger = o.fark.sonuc === "tam" ? "Tam" : (o.fark.sonuc === "eksik" ? "−" : "+") + (o.hedefTur === "kg" ? sayi(Math.abs(o.fark.fark) / 1000, 3) : String(Math.abs(o.fark.fark)));
  const sonucAlt = [
    SONUC_ETIKETI[o.fark.sonuc] + (o.fark.sonuc === "tam" ? "" : o.hedefTur === "kg" ? ` · ${o.fark.metin.replace(/^(Eksik|Fazla)\s+/, "")}` : ""),
    oranYuzde,
  ].filter(Boolean).join("<br>");

  // Siparis bilgileri (etiket / deger, iki sutun)
  const sure = o.siparisTarihi ? kapanisSuresiGun(o.siparisTarihi, kapanisIso) : null;
  const musteriMetni = ek.kisaAd && ek.kisaAd.trim() && ek.kisaAd.trim() !== o.musteri ? `<b>${esc(ek.kisaAd)}</b><br><span style="color:#64748B;font-size:11px">${esc(o.musteri)}</span>` : `<b>${esc(o.musteri)}</b>`;
  const teslimMetni = [ek.teslim, ek.teslimAdresi].map((x) => (x || "").trim()).filter(Boolean).join(" · ");
  const bilgi: [string, string][] = [
    ["Sipariş", `<b>${esc(o.isEmriNo)}</b>${ek.musteriSiparisNo ? ` <span style="color:#64748B;font-size:11px">(müşteri no: ${esc(ek.musteriSiparisNo)})</span>` : ""}`],
    ["Müşteri", musteriMetni],
    ["Ürün", esc(o.urun)],
    ...(teslimMetni ? [["Teslim", esc(teslimMetni)] as [string, string]] : []),
    ...(o.siparisTarihi ? [["Sipariş tarihi", esc(o.siparisTarihi)] as [string, string]] : []),
    ["Kapanış", `${esc(trTarih(kapanisIso))}${o.kapatan ? ` · <span style="color:#64748B">${esc(o.kapatan)}</span>` : ""}${sure !== null ? ` <span style="color:#64748B;font-size:11px">(${sure === 0 ? "aynı gün" : `${sure} gün`})</span>` : ""}`],
  ];
  const bilgiSatirlari = bilgi
    .map(([k, v], i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(esc(k), "width:150px;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.3px;font-weight:bold;vertical-align:top")}${td(v)}</tr>`)
    .join("");

  // Arac bazinda sevkiyat (kantar sirasiyla)
  const araclar = [...ek.araclar].sort((a, b) => a.olusturma.localeCompare(b.olusturma));
  const toplamKg = araclar.reduce((t, a) => t + Number(a.net_kg || 0), 0);
  const aracSatirlari = araclar.length
    ? araclar
        .map((a, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(String(i + 1), "color:#94A3B8;width:24px")}${td(esc(trTarih(a.olusturma, !a.gecmis)), "color:#64748B;white-space:nowrap")}${td(`<b>${esc(a.plaka || "-")}</b>${a.dorse_plaka ? `<br><span style="color:#64748B;font-size:11px">Dorse ${esc(a.dorse_plaka)}</span>` : ""}`, "white-space:nowrap")}${td(`<span style="font-family:monospace;font-size:11px">${esc(a.irsaliye_no || "-")}</span>${a.gecmis ? ` <span style="color:#94A3B8;font-size:10px">sistem öncesi</span>` : ""}`)}${td(sayi(Number(a.net_kg || 0)), "text-align:right;font-weight:bold;white-space:nowrap")}</tr>`)
        .join("") +
      `<tr><td colspan="4" style="padding:8px;font-size:11px;font-weight:bold;color:#475569;border-top:2px solid #CBD5E1">TOPLAM — ${araclar.length} araç</td><td style="padding:8px;font-size:11px;font-weight:bold;text-align:right;border-top:2px solid #CBD5E1;white-space:nowrap">${sayi(toplamKg)} kg</td></tr>`
    : `<tr><td colspan="5" style="padding:10px;color:#94A3B8;font-style:italic;font-size:12px">Araç listesi alınamadı; toplamlar yukarıdaki özettedir.</td></tr>`;

  // Fark aciklamasi (yalniz tam degilse; sakin bilgi kutusu)
  const farkKutusu = o.fark.sonuc === "tam"
    ? ""
    : `<div style="margin-top:12px;padding:9px 12px;background:${o.fark.sonuc === "eksik" ? "#FFFBEB" : "#EEF2FF"};border-left:4px solid ${renk};font-size:12px;color:#1E293B;line-height:1.5">${o.fark.sonuc === "eksik"
        ? `<b>Kalan ${o.hedefTur === "kg" ? ton(o.fark.kalan) : `${o.fark.kalan} araç`}</b> sevk edilmeden kapatıldı. Kalan miktar müşteriyle mutabık kalındıysa işlem gerekmez; değilse iş emri yeniden açılabilir.`
        : `Hedefin <b>${o.hedefTur === "kg" ? ton(Math.abs(o.fark.fark)) : `${Math.abs(o.fark.fark)} araç`}</b> üzerinde sevk edildi. Faturalamanın gerçekleşen miktar üzerinden yapıldığını kontrol edin.`}</div>`;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sipariş Kapanış Raporu</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${KAPANIS_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} İç Piyasa</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Sipariş Kapanış Raporu</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(o.isEmriNo)}</div><div style="font-size:11px;color:#94A3B8">${esc(trTarih(kapanisIso))}</div></td>
  </tr></table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Sipariş Hedefi", hedefDeger, hedefAlt, LACIVERT)}${kutuArasi}
    ${kutu("Gerçekleşen", gercekDeger, gercekAlt, "#047857")}${kutuArasi}
    ${kutu("Sonuç", sonucDeger, sonucAlt, renk)}
  </tr></table>
  ${farkKutusu}

  ${bolumBaslik("Sipariş Bilgileri")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #E2E8F0">
    ${bilgiSatirlari}
  </table>

  ${bolumBaslik("Araç Bazında Sevkiyat")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${th("#")}${th("Tarih")}${th("Plaka")}${th("İrsaliye No")}${th("Net (kg)", true)}</tr>
    ${aracSatirlari}
  </table>

  <div style="margin-top:24px;text-align:center">
    <a href="${KAPANIS_UYGULAMA_URL}/ic-piyasa/is-emirleri" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">İş emirlerini uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Bu rapor İç Piyasa › İş Emirleri'nde sipariş “Tamamlandı” yapıldığında otomatik gönderilir. Müşteriye gitmez.<br>Alıcılar: İç Piyasa › Bildirimler › Ayarlar.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
