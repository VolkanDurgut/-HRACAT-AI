/**
 * SIPARIS BILDIRIM FORMU - EXPORT GIRISLERI (23.11.2026). SAF: veri / ag yok; edge (siparis-formu-spek sabah maili,
 * siparis-formu export_bekleyen) ve web (uygulama ici uyari) AYNI listeyi kullanir.
 *
 * Kullanici: "Urun speklerini lojistik bilemez; bunlari export onaylayacak." + "Harun Bey spek ve urun gorseli eklediginde
 * siparis bildirim formu otomatik olarak gitsin. Her gun Harun Bey'e spek ve girilmesi gereken urun gorselleri mail olarak
 * gider; ekraninda bildirim olarak da gorunur."
 * Liste: rezervasyonu alinmis, formu gitmemis, ilk konteyneri tartilmamis, gemisi kalkmamis ve urun speki / cuval gorseli /
 * uretim-SKT girisi EKSIK yuklemeler (lojistikListesi suzgeci). Bos ekipman alimina 2 gun ve daha az kalanlar ACIL.
 * Not: Bu dosya gercek musteri verisi icermez.
 */
import { gunEkle, trTarih, type FormModeli } from "./siparis-formu.ts";
import { lojistikListesi } from "./siparis-formu-lojistik.ts";

export type SpekSatiri = {
  booking: string;
  anahtar: string;
  firma: string;
  liman: string;
  adet: string;
  urun: string;
  ekipman: string | null;
  etd: string | null;
  /** spek girilmemisse musterinin kalite ayarindan oneri; girilmisse bos */
  oneri: string;
  /** export'un girmesi gerekenler: "Ürün spekleri", "Çuval görseli", "Üretim tarihi", "SKT" */
  eksikler: string[];
  acil: boolean;
};

/** Bos ekipman alimina bu kadar gun (ve daha az) kalan yukleme ACIL. */
export const ACIL_GUN = 2;

export function spekListesi(formlar: FormModeli[], tartilan: Iterable<string>, bugun: string): SpekSatiri[] {
  const model = new Map(formlar.map((m) => [m.anahtar, m]));
  const acilSinir = gunEkle(bugun, ACIL_GUN);
  return lojistikListesi(formlar, tartilan, bugun)
    .map((s) => ({ s, m: model.get(s.anahtar) }))
    .filter((x): x is { s: (typeof x)["s"]; m: FormModeli } => !!x.m && x.m.girisEksikleri.length > 0)
    .map(({ s, m }) => ({
      booking: s.booking, anahtar: s.anahtar, firma: s.firma, liman: s.liman, adet: s.adet, urun: s.urun, ekipman: s.ekipman, etd: s.etd,
      oneri: m.spekKayitli ? "" : m.spekOnerisi, eksikler: m.girisEksikleri,
      acil: !!(s.ekipman && s.ekipman <= acilSinir),
    }));
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#283474";
const TURUNCU = "#F4A07C";
const YESIL = "#10B981";

export function spekKonusu(satirlar: SpekSatiri[], bugun: string, test: boolean): string {
  const acil = satirlar.filter((s) => s.acil).length;
  return `${test ? "[TEST] " : ""}${acil ? "ACİL · " : ""}Ürün speki ve çuval görseli bekleyen yüklemeler · ${satirlar.length} yükleme${acil ? ` (${acil} acil)` : ""} · ${trTarih(bugun)}`;
}

/** Mail: ustte "Sipariş Formları'nı aç" dugmesi (uygulama; giris gerekir), altta liste. Booking no YAZILMAZ. */
export function spekMailHtml(satirlar: SpekSatiri[], bugun: string, baglanti: string, secenek: { test: boolean; alici?: string; hitap?: string | null }): string {
  const satir = (s: SpekSatiri, i: number) => `<tr style="${s.acil ? "background:#FEF2F2" : i % 2 ? "background:#F8FAFC" : ""}">
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;font-weight:bold">${s.acil ? `<span style="color:#B91C1C">ACİL · </span>` : ""}${esc(s.firma)}<div style="font-weight:normal;color:#64748B;font-size:11px">${esc(s.urun)}</div></td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155">${esc(s.liman)}<div style="color:#64748B;font-size:11px">${esc(s.adet)}</div></td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:${s.acil ? "#B91C1C;font-weight:bold" : "#334155"};white-space:nowrap">${esc(trTarih(s.ekipman) || "-")}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#B45309">${esc(s.eksikler.join(", "))}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#334155">${s.oneri ? esc(s.oneri).replace(/\n/g, "<br>") : `<span style="color:#047857">girildi</span>`}</td>
  </tr>`;
  const testSeridi = secenek.test
    ? `<div style="margin:14px 0 0;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Bu e-posta yalnızca test adresine gönderildi${secenek.alici ? `. Canlıda alıcı: <b>${esc(secenek.alici)}</b>` : ""}. Test modunda tamamlanan form üretime değil, yalnızca test adresine gider.</div>`
    : "";
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">UNEX-AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Sipariş bildirim formu · Export girişleri</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(trTarih(bugun))}</div></td>
  </tr></table>
  ${testSeridi}
  <p style="margin:18px 0 6px;color:#1E293B;font-size:14px;line-height:1.55">Günaydın${secenek.hitap ? ` ${esc(secenek.hitap)}` : ""},</p>
  <p style="margin:0 0 14px;color:#1E293B;font-size:14px;line-height:1.55">Rezervasyonu alınmış <b>${satirlar.length} yüklemenin</b> sipariş bildirim formunda ürün speki ve/veya çuval görseli bekleniyor. Önerilen spekler müşterinin kalite ayarından gelir; onaylayın ya da düzeltin. Çuval görseli yüklenince üretim tarihi, SKT ve lot görselden okunur. <b>Form tamamlanıp kaydedildiği anda üretime otomatik gider.</b></p>
  <div style="margin:16px 0 4px;text-align:center">
    <a href="${esc(baglanti)}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 30px;border-radius:6px">Sipariş Formları'nı aç</a>
    <div style="margin-top:6px;font-size:11px;color:#94A3B8">UNEX-AI › Siparişler › Sipariş Formları (giriş gerekir)</div>
  </div>
  <div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${TURUNCU};padding-left:8px">Giriş bekleyenler (${satirlar.length})</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${["Müşteri / ürün", "Liman", "Boş ekipman", "Eksik", "Önerilen spek"].map((b) => `<th style="text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#64748B;border-bottom:2px solid #CBD5E1">${b}</th>`).join("")}</tr>
    ${satirlar.map(satir).join("")}</table>
  <div style="margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Kaynak: Yükleme Planı + müşteri kalite ayarı. Boş ekipman alımına ${ACIL_GUN} gün ve daha az kalanlar ACİL. İlk konteyneri tartılan yükleme listeden çıkar.<br>UNEX-AI tarafından hafta içi her sabah otomatik gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
