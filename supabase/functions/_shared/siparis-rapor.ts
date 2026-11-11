/**
 * SIPARIS RAPORU MAILI - hesap + HTML (11.11.2026). Edge: siparis-rapor. SAF: veri yok, ag yok.
 * Kaynak: siparis_listesi_veri + yukleme_plani_veri (Siparisler sayfasiyla AYNI veri ve ayni kurallar:
 * siparis-liste.ts bolumleri / plan gorunumu). Ek: sayfadaki "Excel indir" ile ayni dosya (siparis-xlsx.ts).
 * Musteriye GITMEZ (ic rapor; fiyat ve tutarlar gorunur).
 */
import {
  planGorunumu, planSirala, siparisBolumleri, siparisOzeti, trTarih,
  type PlanSatiri, type SiparisOzeti, type SiparisSatiri,
} from "./siparis-liste.ts";
import { RAPOR_SAATLERI, oturumAdi, oturumSaatten } from "./rapor-oturum.ts";
import { esc, paraKisa, raporKabugu } from "./rapor-kabugu.ts";

export const SIPARIS_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
export const SIPARIS_RAPOR_SAATI = RAPOR_SAATLERI;
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

export function siparisRaporHesapla(siparisler: SiparisSatiri[], plan: PlanSatiri[], tarih: string): SiparisRapor {
  const bolum = (b: string) => siparisBolumleri(siparisler).find((x) => x.bolum === b)?.satirlar || [];
  const onOdeme = bolum("on_odeme");
  const onay = bolum("bekleyen");
  const acikRezervasyon = bolum("rezervasyon").filter((s) => s.durum === "rezervasyonlu" || s.durum === "bl_eksik");
  const bugunOnOdeme = onOdeme.filter((s) => s.on_odeme_tarihi && s.on_odeme_tarihi.slice(0, 10) === tarih);
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
    tarih,
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

export function siparisRaporKonusu(r: SiparisRapor, sirketAdi = "Unex Gıda"): string {
  const o = r.ozet;
  return `${sirketAdi} Sipariş Raporu · ${trTarih(r.tarih)} · ${o.onOdeme} ön ödemeli rezervasyon bekliyor · ${o.onay} onay bekliyor`;
}

/** Gun farki (YYYY-MM-DD) */
const gunFarki = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86400000);

/**
 * "Otomatik Ozet" maddeleri (11.11.2026, kullanici: "rapor cok uzun; ozet metin + ekte Excel; tek sayfa").
 * Ayrinti (tum satirlar) ekteki Excel'de; mailde yalniz bu cumleler.
 */
export function siparisOzetMaddeleri(r: SiparisRapor): string[] {
  const o = r.ozet;
  const m: string[] = [];
  const acikTutar: ParaToplami = {};
  for (const s of [...r.onOdeme, ...r.onay, ...r.acikRezervasyon]) paraEkle(acikTutar, s.para_birimi, s.tutar);
  const tutarYaz = Object.keys(acikTutar).sort().map((p) => paraKisa(acikTutar[p], p)).join(" + ");
  m.push(`<b>${o.acikSiparis}</b> açık sipariş: ${sayi(o.acikKont)} konteyner, ${sayi(o.acikMt)} MT${tutarYaz ? `; toplam ${esc(tutarYaz)}` : ""}.`);
  if (r.onOdeme.length) {
    const enEski = [...r.onOdeme].filter((s) => s.on_odeme_tarihi).sort((a, b) => (a.on_odeme_tarihi || "").localeCompare(b.on_odeme_tarihi || ""))[0];
    const g = enEski?.on_odeme_tarihi ? gunFarki(r.tarih, enEski.on_odeme_tarihi) : null;
    m.push(`<b>${o.onOdeme}</b> sipariş ön ödemeli, rezervasyon bekliyor (${sayi(o.onOdemeKont)} kont., ${sayi(o.onOdemeMt)} MT)${enEski && g !== null ? `; en eskisi ${esc(enEski.firma || "-")}, ${g} gündür` : ""}.`);
  } else m.push("Ön ödemesi alınıp rezervasyon bekleyen sipariş yok.");
  if (r.onay.length) {
    const eski = r.onay.filter((s) => s.proforma_tarihi && gunFarki(r.tarih, s.proforma_tarihi) >= 14).length;
    m.push(`<b>${o.onay}</b> proforma onay / ön ödeme bekliyor (${sayi(o.onayKont)} kont.${Object.keys(o.onayTutar).length ? `, ${esc(Object.keys(o.onayTutar).sort().map((p) => paraKisa(o.onayTutar[p], p)).join(" + "))}` : ""})${eski ? `; ${eski} tanesi 2 haftadan eski` : ""}.`);
  }
  if (r.planYakin.length) {
    const ilk = r.planYakin.find((p) => p.etd);
    m.push(`Önümüzdeki ${PLAN_GUN} günde <b>${o.planYakinBooking}</b> yükleme, ${sayi(o.planYakinKont)} konteyner${ilk ? `; ilk ETD ${kisaTarih(ilk.etd)} (${esc(ilk.musteri || "-")}${ilk.varis_limani ? `, ${esc(ilk.varis_limani)}` : ""})` : ""}.`);
  } else m.push(`Önümüzdeki ${PLAN_GUN} günde planlı yükleme yok.`);
  const rez = r.acikRezervasyon.filter((s) => s.durum === "rezervasyonlu").length;
  if (rez || o.blEksik) m.push(`${rez ? `<b>${rez}</b> rezervasyonlu sipariş sevk bekliyor` : ""}${rez && o.blEksik ? "; " : ""}${o.blEksik ? `<b style="color:#B91C1C">${o.blEksik}</b> sevkiyatta BL eksik` : ""}.`);
  if (r.bugunOnOdeme.length) m.push(`Bugün ön ödemesi işaretlenen: ${r.bugunOnOdeme.map((s) => `${esc(s.firma || "-")} (${esc(s.proforma_no || "-")})`).join(", ")}.`);
  if (o.olasiTekrar) m.push(`<span style="color:#B45309">${o.olasiTekrar} proforma olası tekrar</span> — Sipariş Listesi'nde kontrol edin.`);
  return m;
}

export function siparisRaporHtml(r: SiparisRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString()): string {
  const saatYaz = new Date(Date.parse(olusturmaIso) + 3 * 3600000).toISOString().slice(11, 16);
  return raporKabugu({
    sirketAdi, baslik: "Sipariş Raporu", tarih: trTarih(r.tarih), oturum: `${oturumAdi(oturumSaatten(Date.parse(olusturmaIso)))} · ${saatYaz}`,
    ozetAlt: "Sipariş listesi ve yükleme planına göre",
    maddeler: siparisOzetMaddeleri(r),
    dugme: { metin: "Siparişleri aç", yol: "/siparisler" },
    dipnot: `Tüm satırlar ekteki Excel'de (Sipariş Listesi + Yükleme Planı; sayfadaki "Excel indir" ile aynı).<br>Her gün ${SIPARIS_RAPOR_SAATI}'de · müşteriye gitmez.`,
  });
}
