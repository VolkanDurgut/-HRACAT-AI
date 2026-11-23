/**
 * SIPARIS BILDIRIM FORMU - EXPORT SPEK ONAYI (23.11.2026). SAF: veri / ag yok; edge (siparis-formu-spek) ve web onay sayfasi
 * (/siparis-formu-spek/[token]) AYNI listeyi kullanir.
 *
 * Kullanici: "Urun speklerini lojistik bilemez. O yuzden bunlari export onaylayacak."
 * Liste: lojistik listesindeki (rezervasyonu alinmis, formu gitmemis, ilk konteyneri tartilmamis, gemisi kalkmamis) ve
 * urun spekleri KAYDEDILMEMIS yuklemeler. Oneri = musterinin kalite ayarindaki spekler (yoksa varsayilan); export onaylar ya da
 * duzeltir; kaydedilen spek forma yazilir ve lojistik o formu gonderebilir.
 * Not: Bu dosya gercek musteri verisi icermez.
 */
import { spekTemizle, trTarih, type FormModeli } from "./siparis-formu.ts";
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
  oneri: string;
  /** spek disinda eksik kalanlar (cuval gorseli / uretim / SKT): bilgi icin */
  digerEksikler: string[];
};

export function spekListesi(formlar: FormModeli[], tartilan: Iterable<string>, bugun: string): SpekSatiri[] {
  const model = new Map(formlar.map((m) => [m.anahtar, m]));
  return lojistikListesi(formlar, tartilan, bugun)
    .map((s) => ({ s, m: model.get(s.anahtar) }))
    .filter((x): x is { s: (typeof x)["s"]; m: FormModeli } => !!x.m && !x.m.spekKayitli)
    .map(({ s, m }) => ({
      booking: s.booking, anahtar: s.anahtar, firma: s.firma, liman: s.liman, adet: s.adet, urun: s.urun, ekipman: s.ekipman, etd: s.etd,
      oneri: m.spekOnerisi, digerEksikler: m.girisEksikleri.filter((e) => e !== "Ürün spekleri"),
    }));
}

/** Onaylanan spek metni: bos olamaz; satirlar korunur (spekTemizle ile ayni kural). */
export function spekGecerli(v: unknown): string | null {
  const t = spekTemizle(v);
  return t.length >= 3 ? t : null;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#283474";
const TURUNCU = "#F4A07C";
const YESIL = "#10B981";

export function spekKonusu(satirlar: SpekSatiri[], bugun: string, test: boolean): string {
  return `${test ? "[TEST] " : ""}Ürün speki onayı bekleyen yüklemeler · ${satirlar.length} yükleme · ${trTarih(bugun)}`;
}

/** Mail: ustte "Spekleri onayla" dugmesi (girissiz onay sayfasi, 3 gun), altta liste + onerilen spekler. Booking no YAZILMAZ. */
export function spekMailHtml(satirlar: SpekSatiri[], bugun: string, baglanti: string, secenek: { test: boolean; alici?: string }): string {
  const satir = (s: SpekSatiri, i: number) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;font-weight:bold">${esc(s.firma)}<div style="font-weight:normal;color:#64748B;font-size:11px">${esc(s.urun)}</div></td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155">${esc(s.liman)}<div style="color:#64748B;font-size:11px">${esc(s.adet)}</div></td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;white-space:nowrap">${esc(trTarih(s.ekipman) || "-")}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#334155">${esc(s.oneri).replace(/\n/g, "<br>")}</td>
  </tr>`;
  const testSeridi = secenek.test
    ? `<div style="margin:14px 0 0;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Bu e-posta yalnızca test adresine gönderildi${secenek.alici ? `. Canlıda alıcı: <b>${esc(secenek.alici)}</b>` : ""}. Test modunda onaylanan spek kaydedilmez.</div>`
    : "";
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">UNEX-AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Sipariş bildirim formu · Ürün speki onayı</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(trTarih(bugun))}</div></td>
  </tr></table>
  ${testSeridi}
  <p style="margin:18px 0 14px;color:#1E293B;font-size:14px;line-height:1.55">Günaydın, rezervasyonu alınmış ve sipariş bildirim formu hazırlanan <b>${satirlar.length} yüklemenin</b> ürün spekleri onay bekliyor. Önerilen spekler müşterinin kalite ayarından gelir; onaylayın ya da düzeltin. Onaylanan form lojistik tarafından üretime gönderilebilir.</p>
  <div style="margin:16px 0 4px;text-align:center">
    <a href="${esc(baglanti)}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 30px;border-radius:6px">Spekleri onayla</a>
    <div style="margin-top:6px;font-size:11px;color:#94A3B8">Bağlantı 3 gün geçerlidir; giriş gerektirmez.</div>
  </div>
  <div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${TURUNCU};padding-left:8px">Onay bekleyenler (${satirlar.length})</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${["Müşteri / ürün", "Liman", "Boş ekipman", "Önerilen spek"].map((b) => `<th style="text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#64748B;border-bottom:2px solid #CBD5E1">${b}</th>`).join("")}</tr>
    ${satirlar.map(satir).join("")}</table>
  <div style="margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Kaynak: Yükleme Planı + müşteri kalite ayarı. İlk konteyneri tartılan yükleme listeden çıkar.<br>UNEX-AI tarafından hafta içi her sabah otomatik gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
