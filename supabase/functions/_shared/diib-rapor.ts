// ============================================================================
// DIIB GUNLUK RAPORU - hesap + e-posta HTML'i (06.11.2026)
// ============================================================================
// Kullanici: "DIIB takibi icin ihracat ve ic piyasa raporu gibi bir rapor; gunluk guncel, her gun
// aksam 17:00. Ornek olarak o sayfadaki Excel raporu bilgileri gonderilebilir."
// SAF TypeScript: hesap DIIB Takibi sayfasiyla AYNI (diib-hesap.ts), e-posta eki sayfadaki
// "Excel'e aktar" ile AYNI dosya (diib-excel.ts). Edge function: diib-gunluk-rapor.
// Icerik: ozet kutulari, DIIB durumu (taahhut / gerceklesen [devir + sistem faturalari, 06.11.2026] / kalan / doluluk / bekleyen),
// bugun kesilen faturalar, faturasi kesilmemis yuklemeler (siraya gore, DIIB payi), guncel DIIB.
// Fiyat: yalniz DIIB tutarlari (Excel'deki gibi). Musteriye GITMEZ.
// ============================================================================

import {
  diibOzetleri, diibSatirlari, guncelDiib, siraliBekleyenler,
  type BekleyenSira, type DiibBelgesi, type DiibBolunmesi, type DiibDosyasi, type DiibKaydi, type DiibOzeti,
  type DiibSatiri, type SiraliBekleyen,
} from "./diib-hesap.ts";
import { sayiOku } from "./sayi-oku.ts";

export type DiibRaporVerisi = { belgeler: DiibBelgesi[]; kayitlar: DiibKaydi[]; dosyalar: DiibDosyasi[]; bolunmeler: DiibBolunmesi[] };

export type DiibGunlukRapor = {
  tarih: string; // YYYY-MM-DD (TR)
  ozetler: DiibOzeti[];
  satirlar: DiibSatiri[];
  bugunFatura: DiibSatiri[];
  bekleyen: SiraliBekleyen[];
  guncel: DiibBelgesi | null;
  ozet: {
    aktifDiib: number; kalanKg: number; gerceklesenKg: number; taahhutKg: number;
    bugunFatura: number; bugunKg: number; bekleyenYukleme: number; bekleyenKg: number; eslesmeyen: number;
  };
};

const yuv = (x: number) => Math.round(x * 100) / 100;

export function diibGunlukRaporHesapla(v: DiibRaporVerisi, sira: Record<string, BekleyenSira>, tarih: string): DiibGunlukRapor {
  const sonuc = diibSatirlari(v.belgeler, v.kayitlar, v.dosyalar, v.bolunmeler);
  const ozetler = diibOzetleri(v.belgeler, sonuc);
  const bekleyen = siraliBekleyenler(sonuc, ozetler, v.bolunmeler, sira);
  const guncel = guncelDiib(ozetler, bekleyen);
  // 19.11.2026 (kullanici: DIIB raporu her cumartesi 08:00): "bugun" = rapor gununu de iceren son DIIB_RAPOR_GUN gun
  const ilkGun = new Date(Date.parse(`${tarih}T00:00:00Z`) - (DIIB_RAPOR_GUN - 1) * 86_400_000).toISOString().slice(0, 10);
  const bugunFatura = sonuc.satirlar.filter((s) => { const g = (s.faturaTarihi || "").slice(0, 10); return g >= ilkGun && g <= tarih; })
    .sort((a, b) => (a.faturaNo || "").localeCompare(b.faturaNo || ""));
  const aktif = ozetler.filter((o) => o.belge.durum === "aktif");
  return {
    tarih, ozetler, satirlar: sonuc.satirlar, bugunFatura, bekleyen, guncel,
    ozet: {
      aktifDiib: aktif.length,
      kalanKg: yuv(aktif.reduce((t, o) => t + Math.max(0, o.kalanKg), 0)),
      gerceklesenKg: yuv(ozetler.reduce((t, o) => t + o.gerceklesenKg, 0)),
      taahhutKg: yuv(ozetler.reduce((t, o) => t + o.taahhutKg, 0)),
      bugunFatura: new Set(bugunFatura.map((s) => s.faturaNo || s.anahtar)).size,
      bugunKg: yuv(bugunFatura.reduce((t, s) => t + s.miktarKg, 0)),
      bekleyenYukleme: bekleyen.length,
      bekleyenKg: yuv(bekleyen.reduce((t, b) => t + b.kg, 0)),
      eslesmeyen: sonuc.eslesmeyen.length,
    },
  };
}

// ---------------------------------------------------------------------------
// HTML (acik kurumsal tema; ihracat / ic piyasa raporlariyla ayni dil)
// ---------------------------------------------------------------------------
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
export const DIIB_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
/** 19.11.2026: haftalik (cumartesi 08:00 TR); fatura bolumu son 7 gunu kapsar. */
export const DIIB_RAPOR_SAATI = "her cumartesi 08:00";
export const DIIB_RAPOR_GUN = 7;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (x: number, en = 0) => x.toLocaleString("tr-TR", { maximumFractionDigits: en });
const ton = (kg: number) => `${sayi(kg / 1000, 3)} ton`;
const para = (x: number) => `${x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
export const diibTarihTR = (g: string | null | undefined) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : "-");
const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
/** Cut-off yerel saat UTC etiketiyle saklanir: HAM okunur (formatCutoffSaat kurali). */
const cutoffYaz = (ham: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(ham || "");
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : "-";
};

export function diibGunlukRaporKonusu(r: DiibGunlukRapor, sirketAdi = "Unex Gıda"): string {
  const o = r.ozet;
  const parcalar = [`Kalan ${ton(o.kalanKg)}`, o.bugunFatura ? `son 7 gün ${o.bugunFatura} fatura · ${ton(o.bugunKg)}` : "son 7 gün fatura yok", `bekleyen ${o.bekleyenYukleme} yükleme`];
  return `${sirketAdi} DİİB Raporu — ${diibTarihTR(r.tarih)} | ${parcalar.join(" | ")}`;
}

export function diibGunlukRaporHtml(r: DiibGunlukRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString()): string {
  const o = r.ozet;
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold;white-space:nowrap">${t}</th>`;
  const td = (t: string, st = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${t}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, renk: string) =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.4">${alt}</div></td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolum = (t: string, sag = "") => `<div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${t}${sag ? `<span style="float:right;font-weight:normal;text-transform:none;letter-spacing:0;color:#64748B">${sag}</span>` : ""}</div>`;
  const bos = (cols: number, metin: string) => `<tr><td colspan="${cols}" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px;border-bottom:1px solid #E2E8F0">${metin}</td></tr>`;
  const tablo = (baslik: string, govde: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${baslik}</tr>${govde}</table>`;
  const zebra = (i: number) => (i % 2 ? "background:#F8FAFC" : "");

  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Kalan İhracat", ton(o.kalanKg), `${o.aktifDiib} aktif DİİB`, "#B45309")}${arasi}
    ${kutu("Gerçekleşen", ton(o.gerceklesenKg), `taahhüt ${ton(o.taahhutKg)}`, "#047857")}${arasi}
    ${kutu("Son 7 Günde Kesilen", `${o.bugunFatura} fatura`, ton(o.bugunKg), LACIVERT)}${arasi}
    ${kutu("Faturası Bekleyen", `${o.bekleyenYukleme} yükleme`, ton(o.bekleyenKg), "#475569")}
  </tr></table>`;

  const guncel = r.guncel
    ? `<div style="margin-top:12px;padding:9px 12px;border:1px solid #BBF7D0;background:#F0FDF4;border-radius:4px;font-size:12px;color:#14532D">Yeni dosyalarda kullanılan güncel DİİB: <b style="font-family:monospace">${esc(r.guncel.belge_no)}</b>${r.guncel.belge_tarihi ? ` (${diibTarihTR(r.guncel.belge_tarihi)})` : ""}</div>`
    : `<div style="margin-top:12px;padding:9px 12px;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:4px;font-size:12px;color:#991B1B"><b>Kalanı olan aktif DİİB yok.</b> Yeni ihracat dosyaları için DİİB Takibi'ne yeni belge eklenmeli.</div>`;

  // DIIB durumu
  const dRows = r.ozetler.map((x, i) => {
    const yuzde = Math.max(0, Math.min(100, x.yuzde));
    const renk = x.kalanKg <= 0 ? "#047857" : yuzde >= 90 ? "#B45309" : LACIVERT;
    const kalanSonra = x.kalanKg - x.bekleyenKg;
    const cubuk = `<div style="background:#E2E8F0;border-radius:3px;height:6px;width:100%;margin-top:4px"><div style="background:${renk};height:6px;border-radius:3px;width:${yuzde.toFixed(1)}%"></div></div>`;
    const durum = x.belge.durum === "tamamlandi" ? `<span style="color:#047857;font-weight:bold">Tamamlandı</span>` : `<span style="color:${renk};font-weight:bold">%${sayi(x.yuzde, 1)}</span>`;
    return `<tr style="${zebra(i)}">${td(`<b style="font-family:monospace">${esc(x.belge.belge_no)}</b><br><span style="color:#64748B;font-size:11px">${diibTarihTR(x.belge.belge_tarihi)} · sıra ${x.belge.kullanim_sirasi}</span>`, "white-space:nowrap")}${td(`${sayi(x.taahhutKg)} kg`, "text-align:right;white-space:nowrap")}${td(`${sayi(x.gerceklesenKg)} kg${x.devirKg > 0 ? `<br><span style="color:#64748B;font-size:11px">sistem öncesi ${sayi(x.devirKg)}${x.satirSayisi ? ` + ${x.satirSayisi} fatura ${sayi(Math.max(0, x.gerceklesenKg - x.devirKg))}` : ""}</span>` : `<br><span style="color:#64748B;font-size:11px">${x.satirSayisi} fatura</span>`}`, "text-align:right;white-space:nowrap")}${td(`<b>${sayi(Math.max(0, x.kalanKg))} kg</b>`, "text-align:right;white-space:nowrap")}${td(`${durum}${cubuk}`, "min-width:90px")}${td(x.bekleyenKg ? `${sayi(x.bekleyenKg)} kg<br><span style="color:${kalanSonra < 0 ? "#B91C1C" : "#64748B"};font-size:11px">sonra ${kalanSonra < 0 ? "−" : ""}${sayi(Math.abs(kalanSonra))} kg</span>` : "<span style=\"color:#94A3B8\">-</span>", "text-align:right;white-space:nowrap")}</tr>`;
  }).join("");
  const dTablo = tablo(`${th("DİİB")}${th("Taahhüt", true)}${th("Gerçekleşen", true)}${th("Kalan", true)}${th("Doluluk")}${th("Bekleyen", true)}`, dRows || bos(6, "Kayıtlı DİİB yok."));

  // Bugun kesilen faturalar
  const belgeNo = new Map(r.ozetler.map((x) => [x.belge.id, x.belge.belge_no]));
  const fRows = r.bugunFatura.map((s, i) => `<tr style="${zebra(i)}">${td(`${s.faturaNo ? `<a href="${DIIB_RAPOR_UYGULAMA_URL}/diib?fatura=${encodeURIComponent(s.faturaNo)}" style="color:${LACIVERT};font-family:monospace;font-weight:bold;text-decoration:underline">${esc(s.faturaNo)}</a>` : "<b>-</b>"}${s.bolunmeSira ? `<br><span style="color:#64748B;font-size:11px">${s.bolunmeSira}. fatura (bölünmüş)</span>` : ""}`, "white-space:nowrap")}${td(`${esc(s.cari)}${s.ulke ? `<br><span style="color:#64748B;font-size:11px">${esc(s.ulke)}</span>` : ""}`)}${td(`<span style="font-family:monospace">${esc(s.dosyaNo || "-")}</span>`, "white-space:nowrap")}${td(`<span style="font-family:monospace">${esc(belgeNo.get(s.diibId) || "-")}</span>`, "white-space:nowrap")}${td(`${sayi(s.miktarKg)} kg`, "text-align:right;white-space:nowrap")}${td(para(s.tutar), "text-align:right;white-space:nowrap")}</tr>`).join("");
  const fTablo = tablo(`${th("Fatura")}${th("Cari · Ülke")}${th("Dosya")}${th("DİİB")}${th("Miktar", true)}${th("Tutar", true)}`, fRows || bos(6, "Son 7 günde DİİB'e yazılan fatura yok."));

  // Faturasi kesilmemis yuklemeler (siraya gore)
  const payi = (b: SiraliBekleyen): string => {
    if (b.kayitli.length > 1) return b.kayitli.map((p) => `${esc(belgeNo.get(p.diib_id) || "-")} · ${sayi(sayiOku(p.miktar_kg))} kg`).join("<br>");
    if (b.oneri?.tur === "tek") return `${esc(b.oneri.diib.belge_no)}`;
    if (b.oneri?.tur === "bolunmeli") return `<span style="color:#B45309;font-weight:bold">Bölünmeli:</span><br>${b.oneri.parcalar.map((p) => `${esc(p.diib.belge_no)} · ${sayi(p.kg)} kg`).join("<br>")}`;
    return `<span style="color:#B91C1C;font-weight:bold">DİİB kalanı yetmiyor</span>`;
  };
  const bRows = r.bekleyen.map((b, i) => `<tr style="${zebra(i)}">${td(`<b style="font-family:monospace">${esc(b.dosya.dosya_no || "-")}</b>`, "white-space:nowrap")}${td(esc(b.dosya.alici_firma || "-"))}${td(`${sayi(b.kg)} kg`, "text-align:right;white-space:nowrap")}${td(`<span style="font-family:monospace;font-size:11px">${payi(b)}</span>`)}${td(`<span style="font-size:11px">Talimat ${cutoffYaz(b.sira?.talimatCutoff)}<br><span style="color:#64748B">Beyan ${cutoffYaz(b.sira?.beyanCutoff)}</span></span>`, "white-space:nowrap")}</tr>`).join("");
  const bTablo = tablo(`${th("Dosya")}${th("Alıcı")}${th("Miktar", true)}${th("DİİB payı")}${th("Cut-off")}`, bRows || bos(5, "Faturası kesilmemiş yükleme yok."));

  const eslesmeyen = o.eslesmeyen
    ? `<div style="margin-top:10px;font-size:11px;color:#B91C1C">${o.eslesmeyen} faturalı dosyanın DİİB No'su hiçbir DİİB ile eşleşmedi; DİİB Takibi'nde kontrol edin.</div>`
    : "";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DİİB Günlük Rapor</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${DIIB_RAPOR_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} DİİB Takibi</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Rapor · Dahilde İşleme İzin Belgeleri</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(diibTarihTR(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">Akşam raporu · ${esc(saat(olusturmaIso))}</div></td>
  </tr></table>
  ${kutular}
  ${guncel}

  ${bolum("DİİB Durumu", `${r.ozetler.length} belge`)}
  ${dTablo}
  ${eslesmeyen}

  ${bolum("Son 7 Günde Kesilen Faturalar", o.bugunFatura ? `${o.bugunFatura} fatura · ${ton(o.bugunKg)}` : "")}
  ${fTablo}

  ${bolum("Faturası Kesilmemiş Yüklemeler", `${o.bekleyenYukleme} yükleme · ${ton(o.bekleyenKg)}`)}
  ${bTablo}

  <div style="margin-top:24px;text-align:center">
    <a href="${DIIB_RAPOR_UYGULAMA_URL}/diib" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">DİİB Takibi'ni uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Fatura numarasına tıklayınca DİİB Takibi'nde ilgili fatura açılır (giriş gerekir).<br>Ekteki Excel, DİİB Takibi sayfasındaki "Excel'e aktar" ile aynı dosyadır (Genel Tablo + her DİİB'in ihracat listesi).<br>Gerçekleşen = sistem öncesi devir (sistem kurulmadan önce Excel'deki DİİB listesinde kesilmiş faturalar, DİİB başına bir kez girilir) + sistemde kesilen faturalar.<br>Bekleyen yüklemeler talimat cut-off sırasına göre DİİB'e dağıtılır; "sonra" kalanı bu yüklemeler faturalanınca kalacak miktardır.<br>${DIIB_RAPOR_SAATI.charAt(0).toUpperCase()}${DIIB_RAPOR_SAATI.slice(1)}'de gönderilir · müşteriye gitmez.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
