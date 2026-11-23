/**
 * SIPARIS BILDIRIM FORMU - LOJISTIK SECIM LISTESI (23.11.2026). SAF: veri / ag yok; edge (siparis-formu) ve web secim sayfasi
 * (/siparis-formu-sec/[token]) AYNI listeyi kullanir.
 *
 * Kullanici: "Onayi ve rezervasyonu alinmis yuklemeler Suleyman Bey'e mail gitse; Suleyman Bey oradan siparis bildirim formu
 * gonderilmesi gerekenleri secse. Guncel yukleme planindan alabilirsin fakat su an yuklenenleri dahil etme."
 * Liste: yukleme planinda booking'i olan, formu henuz gonderilmemis (ya da "gonderildi" isaretlenmemis), ilk konteyneri
 * TARTILMAMIS (DBA kaydi yok) ve gemisi kalkmamis yuklemeler; en yakin ekipman alim gunu once.
 * Not: Bu dosya gercek musteri verisi icermez.
 */
import { trTarih, type FormModeli } from "./siparis-formu.ts";

export type LojistikSatiri = {
  booking: string;
  anahtar: string;
  firma: string;
  liman: string;
  adet: string;
  urun: string;
  ekipman: string | null;
  etd: string | null;
  gemi: string;
  temsilci: string;
  hazir: boolean;
  eksikler: string[];
};

const kes = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** formlar: siparis_formu_veri modelleri; tartilan: siparis_formu_tartilanlar(); bugun: TR "YYYY-MM-DD". */
export function lojistikListesi(formlar: FormModeli[], tartilan: Iterable<string>, bugun: string): LojistikSatiri[] {
  const t = new Set(tartilan);
  return formlar
    .filter((m) => !m.gonderim?.zaman)
    .filter((m) => !t.has(m.anahtar))
    .filter((m) => (m.etd ?? m.ekipmanTarihi ?? bugun) >= bugun)
    .map((m) => ({
      booking: m.bookingNo, anahtar: m.anahtar,
      firma: kes(m.alanlar.firma || "-", 60), liman: m.alanlar.varisLimani || "-", adet: m.alanlar.adet || "-",
      urun: kes(m.alanlar.urunTipi || "", 40), ekipman: m.ekipmanTarihi, etd: m.etd, gemi: m.alanlar.gemi || "",
      temsilci: m.temsilciHitap || m.alanlar.temsilci || "", hazir: m.gonderilebilir, eksikler: m.girisEksikleri,
    }))
    .sort((a, b) => (a.ekipman || a.etd || "9999").localeCompare(b.ekipman || b.etd || "9999") || a.booking.localeCompare(b.booking));
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#283474";
const TURUNCU = "#F4A07C";
const YESIL = "#10B981";

export function lojistikKonusu(satirlar: LojistikSatiri[], bugun: string, test: boolean): string {
  const hazir = satirlar.filter((s) => s.hazir).length;
  return `${test ? "[TEST] " : ""}Sipariş bildirim formu bekleyen yüklemeler · ${satirlar.length} yükleme (${hazir} hazır) · ${trTarih(bugun)}`;
}

/**
 * Mail: ustte "Formları seç ve gönder" dugmesi (girissiz secim sayfasi, 3 gun), altta liste. Booking numarasi mailde YAZILMAZ
 * (rapor / bildirim maili kurali); musteri + liman + konteyner + ekipman gunu ile tanimlanir.
 */
export function lojistikMailHtml(satirlar: LojistikSatiri[], bugun: string, baglanti: string, secenek: { test: boolean; alici?: string; hitap?: string | null }): string {
  const hazir = satirlar.filter((s) => s.hazir);
  const eksik = satirlar.filter((s) => !s.hazir);
  const satir = (s: LojistikSatiri, i: number) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;font-weight:bold">${esc(s.firma)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155">${esc(s.liman)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;white-space:nowrap">${esc(s.adet)}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;white-space:nowrap">${esc(trTarih(s.ekipman) || "-")}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;white-space:nowrap">${esc(trTarih(s.etd) || "-")}</td>
    <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:${s.hazir ? "#047857" : "#B45309"}">${s.hazir ? "Hazır" : esc(`Eksik: ${s.eksikler.join(", ")}`)}</td>
  </tr>`;
  const tablo = (liste: LojistikSatiri[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${["Müşteri", "Liman", "Konteyner", "Boş ekipman", "ETD", "Form"].map((b) => `<th style="text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#64748B;border-bottom:2px solid #CBD5E1">${b}</th>`).join("")}</tr>
    ${liste.map(satir).join("")}</table>`;
  const baslik = (t: string) => `<div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${TURUNCU};padding-left:8px">${esc(t)}</div>`;
  const testSeridi = secenek.test
    ? `<div style="margin:14px 0 0;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Bu e-posta yalnızca test adresine gönderildi${secenek.alici ? `. Canlıda alıcı: <b>${esc(secenek.alici)}</b>` : ""}. Sayfadan seçilen formlar da yalnızca test adresine gider.</div>`
    : "";
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">UNEX-AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Sipariş bildirim formu · Lojistik</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(trTarih(bugun))}</div></td>
  </tr></table>
  ${testSeridi}
  <p style="margin:18px 0 6px;color:#1E293B;font-size:14px;line-height:1.55">Günaydın${secenek.hitap ? ` ${esc(secenek.hitap)}` : ""},</p>
  <p style="margin:0 0 14px;color:#1E293B;font-size:14px;line-height:1.55">Rezervasyonu alınmış, yüklemesi henüz başlamamış ve sipariş bildirim formu üretime gitmemiş <b>${satirlar.length} yükleme</b> var. Gönderilecekleri seçip tek tuşla üretime iletebilirsiniz; daha önce elle gönderdikleriniz için “Zaten gönderildi” işaretleyin.</p>
  <div style="margin:16px 0 4px;text-align:center">
    <a href="${esc(baglanti)}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 30px;border-radius:6px">Formları seç ve gönder</a>
    <div style="margin-top:6px;font-size:11px;color:#94A3B8">Bağlantı 3 gün geçerlidir; giriş gerektirmez.</div>
  </div>
  ${hazir.length ? `${baslik(`Gönderime hazır (${hazir.length})`)}${tablo(hazir)}` : ""}
  ${eksik.length ? `${baslik(`Bilgisi eksik (${eksik.length})`)}<div style="font-size:11px;color:#64748B;margin:-2px 0 6px">Çuval görseli / spek / üretim / SKT girilmeden form gönderilemez (Siparişler › Sipariş Formları).</div>${tablo(eksik)}` : ""}
  <div style="margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Kaynak: Yükleme Planı. İlk konteyneri tartılan yükleme listeden çıkar.<br>UNEX-AI tarafından hafta içi her sabah otomatik gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
