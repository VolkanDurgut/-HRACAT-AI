/**
 * SIPARIS RAPORU MAILI - hesap + HTML (11.11.2026). Edge: siparis-rapor. SAF: veri yok, ag yok.
 * 11.11.2026 (2. revize): mail = "Bugun gelen on odemeler" tablosu (musteri, konteyner, varis limani); ozet maddeleri
 * kaldirildi. 12.11.2026: ustte "Gunun Ozeti" 4 gosterge kutusu (yoneticiOzeti). Kaynak: siparis_listesi_veri + yukleme_plani_veri (Siparisler sayfasiyla AYNI veri ve ayni kurallar:
 * siparis-liste.ts bolumleri / plan gorunumu). Ek: sayfadaki "Excel indir" ile ayni dosya (siparis-xlsx.ts).
 * 18.11.2026 (kullanici): mail IKI bolum - ust: on odemesi alinmis / rezervasyonu alinmamis siparisler; alt: bu siparislerin
 * varis limanlari icin en yeni navlun fiyatlari (navlun-tablosu.ts limanSonTeklifleri; veri edge'de navlun-veri.ts ile okunur).
 * Musteriye GITMEZ (ic rapor; fiyat ve tutarlar gorunur).
 */
import {
  BOLUM_BASLIGI, planGorunumu, planSirala, siparisBolumleri, siparisOzeti, trTarih,
  type PlanSatiri, type SiparisOzeti, type SiparisSatiri,
} from "./siparis-liste.ts";
import { limanAnahtariBul, limanSonTeklifleri, type LimanTeklifi, type NavlunTablosu } from "./navlun-tablosu.ts";
import { oturumAdi } from "./rapor-oturum.ts";
import { RAPOR_LACIVERT, esc, raporKabugu } from "./rapor-kabugu.ts";

export const SIPARIS_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
/** 19.11.2026 (kullanici): siparis raporu yalniz her cumartesi 09:00 (pg_cron 0 6 * * 6; aksam isi kapali). */
export const SIPARIS_RAPOR_SAATI = "her cumartesi 09:00";
/** Plan bolumunde gosterilecek ileri gun sayisi (ETD bugun .. bugun+14) */
const PLAN_GUN = 14;

const sayi = (v: number | null | undefined, ond = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : v.toLocaleString("tr-TR", { minimumFractionDigits: ond, maximumFractionDigits: ond });
const kisaTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const gunEkle = (iso: string, gun: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + gun * 86400000).toISOString().slice(0, 10);

export type ParaToplami = Record<string, number>;
const paraEkle = (t: ParaToplami, para: string | null, v: number | null) => { if (v !== null && Number.isFinite(v)) t[para || "USD"] = (t[para || "USD"] || 0) + v; };

export type SiparisRapor = {
  tarih: string;
  oturum: "sabah" | "aksam";
  ozet: SiparisOzeti & {
    onOdemeKont: number; onOdemeMt: number; onOdemeTutar: ParaToplami;
    onayKont: number; onayMt: number; onayTutar: ParaToplami;
    bugunOnOdeme: number; planBekleyenKont: number; planYakinKont: number; planYakinBooking: number;
  };
  onOdeme: SiparisSatiri[];
  onay: SiparisSatiri[];
  acikRezervasyon: SiparisSatiri[];
  bugunOnOdeme: SiparisSatiri[];
  planYakin: PlanSatiri[];
};

/**
 * Ön ödeme penceresi (11.11.2026 kullanici: "Siparis raporuna bugun gelen on odemeler; musteri, konteyner adedi,
 * varis limani"). Aksam raporu: bugun. Sabah raporu (08:00, gun yeni basladi): dun + bugun.
 */
export function onOdemePenceresi(tarih: string, oturum: "sabah" | "aksam"): { bas: string; bit: string } {
  return { bas: oturum === "sabah" ? gunEkle(tarih, -1) : tarih, bit: tarih };
}

export function siparisRaporHesapla(siparisler: SiparisSatiri[], plan: PlanSatiri[], tarih: string, oturum: "sabah" | "aksam" = "aksam"): SiparisRapor {
  const bolum = (b: string) => siparisBolumleri(siparisler).find((x) => x.bolum === b)?.satirlar || [];
  const onOdeme = bolum("on_odeme");
  const onay = bolum("bekleyen");
  const acikRezervasyon = bolum("rezervasyon").filter((s) => s.durum === "rezervasyonlu" || s.durum === "bl_eksik");
  // Bolumden bagimsiz: ayni gun rezervasyonu da yapilan siparis de "gelen on odeme"dir
  const p = onOdemePenceresi(tarih, oturum);
  const bugunOnOdeme = siparisler
    .filter((s) => s.on_odeme && s.on_odeme_tarihi && s.on_odeme_tarihi.slice(0, 10) >= p.bas && s.on_odeme_tarihi.slice(0, 10) <= p.bit)
    .sort((a, b) => (b.on_odeme_tarihi || "").localeCompare(a.on_odeme_tarihi || "") || (a.firma || "").localeCompare(b.firma || "", "tr"));
  const g = planGorunumu(plan, tarih);
  const sinir = gunEkle(tarih, PLAN_GUN);
  const planYakin = planSirala(g.guncel.filter((p) => !p.etd || p.etd.slice(0, 10) <= sinir))
    .sort((a, b) => (a.etd || "9999").localeCompare(b.etd || "9999"));
  const kont = (l: { konteyner: number | null }[]) => l.reduce((t, s) => t + (s.konteyner || 0), 0);
  const mt = (l: SiparisSatiri[]) => Math.round(l.reduce((t, s) => t + (s.miktar_mt || 0), 0));
  const onOdemeTutar: ParaToplami = {}, onayTutar: ParaToplami = {};
  for (const s of onOdeme) paraEkle(onOdemeTutar, s.para_birimi, s.tutar);
  for (const s of onay) paraEkle(onayTutar, s.para_birimi, s.tutar);
  return {
    tarih, oturum,
    ozet: {
      ...siparisOzeti(siparisler),
      onOdemeKont: kont(onOdeme), onOdemeMt: mt(onOdeme), onOdemeTutar,
      onayKont: kont(onay), onayMt: mt(onay), onayTutar,
      bugunOnOdeme: bugunOnOdeme.length, planBekleyenKont: kont(g.bekleyen),
      planYakinKont: kont(planYakin), planYakinBooking: planYakin.length,
    },
    onOdeme, onay, acikRezervasyon, bugunOnOdeme, planYakin,
  };
}


/** 18.11.2026: konu = rezervasyon bekleyen siparis ozeti (rapor iki bolum: bekleyen siparisler + limanlarinin en yeni navlunlari). */
export function siparisRaporKonusu(r: SiparisRapor, sirketAdi = "Unex Gıda"): string {
  const liman = new Set(r.onOdeme.map((s) => (s.liman || "").trim().toLocaleUpperCase("tr-TR")).filter(Boolean)).size;
  const bekleyen = r.onOdeme.length
    ? `Rezervasyon bekleyen ${r.onOdeme.length} sipariş · ${sayi(r.ozet.onOdemeKont)} konteyner · ${liman} liman`
    : "Rezervasyon bekleyen sipariş yok";
  return `${sirketAdi} Sipariş Raporu · ${trTarih(r.tarih)} · ${bekleyen}`;
}

const gunFarki = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86400000);
const buyukTr = (s: string | null | undefined) => (s || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
/** Ayni firmanin kisa / uzun yazimi tek satir ("ORNEK" / "ORNEK & TICARET LTD"): biri digerinin basi (navlun raporuyla ayni kural) */
const firmaSade = (s: string | null | undefined) => buyukTr(s).replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, "");
const ayniFirma = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x)));

export type BekleyenGrup = { firma: string; liman: string; siparis: number; kont: number; enEski: string | null };
/** Rezervasyon bekleyen (on odemesi alinmis) siparisler: ayni musteri + ayni liman tek satir; en uzun bekleyen ustte. */
export function bekleyenGruplari(r: SiparisRapor): BekleyenGrup[] {
  const gruplar: (BekleyenGrup & { fa: string; la: string })[] = [];
  for (const s of r.onOdeme) {
    const fa = firmaSade(s.firma), la = buyukTr(s.liman);
    let g = gruplar.find((x) => x.la === la && ayniFirma(x.fa, fa));
    if (!g) { g = { firma: s.firma || "-", liman: s.liman || "-", siparis: 0, kont: 0, enEski: null, fa, la }; gruplar.push(g); }
    // Gorunen ad: kisa yazim (ayni firmanin uzun unvani tabloyu tasirmasin)
    if (s.firma && s.firma.length < g.firma.length) g.firma = s.firma;
    g.siparis++; g.kont += s.konteyner || 0;
    const t = s.on_odeme_tarihi ? s.on_odeme_tarihi.slice(0, 10) : null;
    if (t && (!g.enEski || t < g.enEski)) g.enEski = t;
  }
  return gruplar.map(({ fa: _fa, la: _la, ...g }) => g)
    .sort((a, b) => (a.enEski || "9999").localeCompare(b.enEski || "9999") || a.firma.localeCompare(b.firma, "tr"));
}

const th = (ad: string, sag = false, gen = "") => `<th style="background:${RAPOR_LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px 8px;text-align:${sag ? "right" : "left"};white-space:nowrap${gen ? `;width:${gen}` : ""}">${ad}</th>`;
const td = (h: string, sag = false, ek = "") => `<td style="padding:5px 8px;border-bottom:1px solid #EEF2F7;font-size:12.5px;line-height:1.35;color:#1E293B;${sag ? "text-align:right;white-space:nowrap;" : ""}${ek}">${h}</td>`;
const UST = "border-bottom:0;border-top:2px solid " + RAPOR_LACIVERT + ";";

/** UST BOLUM: on odemesi alinmis, rezervasyonu alinmamis siparisler (Musteri | Konteyner | Varis limani | Ön ödeme · bekleme). */
export function rezervasyonBekleyenTablosu(r: SiparisRapor): string {
  const liste = bekleyenGruplari(r);
  if (!liste.length) return `<div style="font-size:13px;color:#64748B;padding:4px 0">Rezervasyon bekleyen onaylı sipariş yok.</div>`;
  const satirlar = liste.map((g, i) => {
    const gun = g.enEski ? gunFarki(r.tarih, g.enEski) : null;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${[
      td(`<b>${esc(g.firma)}</b>${g.siparis > 1 ? ` <span style="font-size:11px;color:#94A3B8">${g.siparis} sipariş</span>` : ""}`),
      td(sayi(g.kont), true),
      td(esc(g.liman)),
      td(gun === null ? `<span style="color:#94A3B8">tarih yok</span>` : `${kisaTarih(g.enEski)} <span style="color:${gun >= 14 ? "#B91C1C" : "#64748B"}">· ${gun} gün</span>`, true),
    ].join("")}</tr>`;
  }).join("");
  const toplam = `<tr>${td(`<b>Toplam · ${r.onOdeme.length} sipariş</b>`, false, UST)}${td(`<b>${sayi(r.ozet.onOdemeKont)}</b>`, true, UST)}${td("", false, UST)}${td("", true, UST)}</tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Müşteri")}${th("Konteyner", true, "80px")}${th("Varış limanı", false, "30%")}${th("Ön ödeme · bekleme", true, "130px")}</tr>${satirlar}${toplam}</table>`;
}

// ------------------------------------------------------------------------------------------------ alt bolum ---
/** Navlun tablosu okunamazsa rapor yine gider; alt bolumde not cikar. */
export type BekleyenNavlunu = {
  liman: string; anahtar: string | null; kont: number; musteriler: string[];
  teklifler: LimanTeklifi[]; eski: boolean; anlasma: { tutar: number; tarih: string } | null;
};
/** Ust bolumdeki her varis limani icin en yeni navlunlar (limanSonTeklifleri: her acentenin son 20'DC teklifi, 60 gun). */
export function bekleyenNavlunlari(r: SiparisRapor, t: NavlunTablosu, gun = 60, adet = 5): BekleyenNavlunu[] {
  const out: BekleyenNavlunu[] = [];
  for (const g of bekleyenGruplari(r)) {
    const anahtar = limanAnahtariBul(g.liman);
    const ad = (anahtar && t.limanlar.find((l) => l.anahtar === anahtar)?.ad) || buyukTr(g.liman) || "-";
    let x = out.find((o) => (anahtar ? o.anahtar === anahtar : o.liman === ad));
    if (!x) {
      const s = anahtar ? limanSonTeklifleri(t, anahtar, gun, adet) : { teklifler: [], eski: false };
      const kb = anahtar ? t.limanlar.find((l) => l.anahtar === anahtar)?.kabul : null;
      x = { liman: ad, anahtar, kont: 0, musteriler: [], teklifler: s.teklifler, eski: s.eski, anlasma: kb && kb.para === "USD" ? { tutar: kb.tutar, tarih: kb.tarih } : null };
      out.push(x);
    }
    x.kont += g.kont;
    if (!x.musteriler.includes(g.firma)) x.musteriler.push(g.firma);
  }
  return out.sort((a, b) => b.kont - a.kont || a.liman.localeCompare(b.liman, "tr"));
}

const usd = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} $`;
const kes = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ALT BOLUM: liman basligi + acentelerin en yeni 20'DC teklifleri (Acente / Hat | Navlun | Lokal dahil | FT | TT | Tarih). */
export function bekleyenNavlunTablosu(liste: BekleyenNavlunu[] | null): string {
  if (liste === null) return `<div style="font-size:12.5px;color:#B45309;padding:4px 0">Navlun fiyatları bu raporda okunamadı; Navlun Bildirimi sayfasından bakın.</div>`;
  if (!liste.length) return `<div style="font-size:13px;color:#64748B;padding:4px 0">Rezervasyon bekleyen sipariş olmadığı için navlun listesi yok.</div>`;
  const gri = (h: string) => `<span style="color:#94A3B8">${h}</span>`;
  const govde = liste.map((l) => {
    const baslik = `<tr><td colspan="6" style="padding:8px 8px 4px;border-bottom:1px solid #CBD5E1;font-size:12.5px;color:${RAPOR_LACIVERT}">`
      + `<b>${esc(l.liman)}</b> <span style="color:#64748B">· ${sayi(l.kont)} kont. · ${esc(kes(l.musteriler.join(", "), 60))}</span>`
      + (l.anlasma ? `<span style="float:right;color:#64748B;font-size:11px">son anlaşma ${usd(l.anlasma.tutar)} · ${kisaTarih(l.anlasma.tarih.slice(0, 10))}</span>` : "")
      + `</td></tr>`;
    if (!l.teklifler.length) {
      return baslik + `<tr>${td(`<span style="color:#B45309">Bu liman için 20'DC teklif yok — navlun talebi açın.</span>`, false, "")}${td("")}${td("")}${td("")}${td("")}${td("")}</tr>`;
    }
    const satirlar = l.teklifler.map((x) => {
      const renk = x.enIyi ? "#047857" : "#1E293B";
      const eski = l.eski ? ` <span style="color:#94A3B8;font-size:10.5px">(60 günden eski)</span>` : "";
      return `<tr style="${x.enIyi ? "background:#ECFDF5" : ""}">${[
        td(`${esc(kes(x.blok, 26))}${x.enIyi ? ` <span style="font-size:10px;font-weight:bold;color:#047857;border:1px solid #6EE7B7;border-radius:3px;padding:0 4px">EN İYİ</span>` : ""}`),
        td(`<b style="color:${renk}">${usd(x.navlun)}</b>`, true),
        td(x.kesin ? (x.toplam === x.navlun ? gri("lokal dahil") : `<span title="${esc(x.metin)}">${usd(x.toplam)}</span>`) : `<span style="color:#7C3AED">lokal belirsiz</span>`, true),
        td(x.freeTime !== null ? `${x.freeTime} gün` : gri("-"), true),
        td(x.transit ? `${esc(x.transit)} gün` : gri("-"), true),
        td(`${kisaTarih(x.tarih.slice(0, 10))}${eski}`, true, "color:#64748B;"),
      ].join("")}</tr>`;
    }).join("");
    return baslik + satirlar;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Acente / Hat")}${th("20'DC navlun", true, "95px")}${th("Lokal dahil", true, "90px")}${th("FT", true, "55px")}${th("Transit", true, "70px")}${th("Teklif", true, "70px")}</tr>${govde}</table>`;
}

const bolumBasligi = (metin: string) =>
  `<div style="margin:2px 0 7px;font-size:12px;font-weight:bold;line-height:1.45;color:${RAPOR_LACIVERT}">${esc(metin)}</div>`;

/**
 * 18.11.2026 (kullanici): rapor IKI bolum.
 *  Ust: "ÖN ÖDEMESİ ALINMIŞ- ONAYLI PROFORMA FAKAT HENÜZ REZERVASYON ALINMAMIŞ. MÜŞTERİ SİPARİŞ VERDİĞİNDE HAREKETE GEÇİLECEKTİR." (Siparisler sayfasindaki bolum basligi aynen)
 *  Alt: ayni siparislerin varis limanlari icin en yeni navlun fiyatlari.
 * Onceki 4 gosterge kutusu ve "bugun gelen on odemeler" tablosu kaldirildi. Ek: sayfadaki "Excel indir" ile ayni dosya.
 */
export function siparisRaporHtml(r: SiparisRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString(), navlunlar: BekleyenNavlunu[] | null = null): string {
  const saatYaz = new Date(Date.parse(olusturmaIso) + 3 * 3600000).toISOString().slice(11, 16);
  const altBaslik = `${BOLUM_BASLIGI.on_odeme.replace(/\.\s*$/, "")} — EN YENİ NAVLUN FİYATLARI`;
  return raporKabugu({
    sirketAdi, baslik: "Sipariş Raporu", tarih: trTarih(r.tarih), oturum: `${oturumAdi(r.oturum)} · ${saatYaz}`,
    ozetBaslik: "Rezervasyon Bekleyen Siparişler ve Güncel Navlunlar",
    ozetAlt: "",
    maddeler: [],
    ozetIcerik: `${bolumBasligi(BOLUM_BASLIGI.on_odeme)}
    ${rezervasyonBekleyenTablosu(r)}
    <div style="margin-top:16px">${bolumBasligi(altBaslik)}</div>
    ${bekleyenNavlunTablosu(navlunlar)}`,
    dugme: { metin: "Siparişleri aç", yol: "/siparisler" },
    dipnot: `Navlun = her acente / hattın son 60 gündeki en yeni 20'DC USD teklifi (yoksa en son teklif, "60 günden eski"). Lokal dahil = navlun + çıkış lokali + mühür vb., KDV hariç (acente hafızası; VGM eklenmez). EN İYİ = lokali kesin teklifler arasında en düşük.<br>Tüm siparişler ve yükleme planı ekteki Excel'de (sayfadaki "Excel indir" ile aynı). ${SIPARIS_RAPOR_SAATI.charAt(0).toUpperCase()}${SIPARIS_RAPOR_SAATI.slice(1)}'de · müşteriye gitmez.`,
  });
}
