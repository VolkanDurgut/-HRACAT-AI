/**
 * SIPARIS RAPORU MAILI - hesap + HTML (11.11.2026). Edge: siparis-rapor. SAF: veri yok, ag yok.
 * 11.11.2026 (2. revize): mail = "Bugun gelen on odemeler" tablosu (musteri, konteyner, varis limani); ozet maddeleri
 * kaldirildi. 12.11.2026: ustte "Gunun Ozeti" 4 gosterge kutusu (yoneticiOzeti). Kaynak: siparis_listesi_veri + yukleme_plani_veri (Siparisler sayfasiyla AYNI veri ve ayni kurallar:
 * siparis-liste.ts bolumleri / plan gorunumu). Ek: sayfadaki "Excel indir" ile ayni dosya (siparis-xlsx.ts).
 * Musteriye GITMEZ (ic rapor; fiyat ve tutarlar gorunur).
 */
import {
  planGorunumu, planSirala, siparisBolumleri, siparisOzeti, trTarih,
  type PlanSatiri, type SiparisOzeti, type SiparisSatiri,
} from "./siparis-liste.ts";
import { RAPOR_SAATLERI, oturumAdi } from "./rapor-oturum.ts";
import { RAPOR_LACIVERT, RAPOR_SEFTALI, esc, paraKisa, raporKabugu } from "./rapor-kabugu.ts";

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

export function siparisRaporKonusu(r: SiparisRapor, sirketAdi = "Unex Gıda"): string {
  const o = r.ozet;
  const kont = r.bugunOnOdeme.reduce((t, s) => t + (s.konteyner || 0), 0);
  const gelen = r.bugunOnOdeme.length ? `${r.bugunOnOdeme.length} ön ödeme (${kont} konteyner)` : "ön ödeme yok";
  return `${sirketAdi} Sipariş Raporu · ${trTarih(r.tarih)} · ${r.oturum === "sabah" ? "Dün ve bugün" : "Bugün"} ${gelen} · ${o.onOdeme} ön ödemeli rezervasyon bekliyor`;
}

/** Gelen on odemeler tablosu (Musteri | Konteyner | Varis limani) + toplam satiri. */
export function onOdemeTablosu(r: SiparisRapor): string {
  if (!r.bugunOnOdeme.length) return `<div style="font-size:13px;color:#64748B;padding:4px 0">${r.oturum === "sabah" ? "Dün ve bugün" : "Bugün"} ön ödeme gelmedi.</div>`;
  const tekGun = r.oturum !== "sabah";
  const th = (ad: string, sag = false, gen = "") => `<th style="background:${RAPOR_LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px 8px;text-align:${sag ? "right" : "left"};white-space:nowrap${gen ? `;width:${gen}` : ""}">${ad}</th>`;
  const td = (h: string, sag = false, ek = "") => `<td style="padding:6px 8px;border-bottom:1px solid #EEF2F7;font-size:13px;line-height:1.35;color:#1E293B;${sag ? "text-align:right;white-space:nowrap;" : ""}${ek}">${h}</td>`;
  const satirlar = r.bugunOnOdeme.map((s, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${[
    td(`<b>${esc(s.firma || "-")}</b>${s.proforma_no ? `<div style="font-size:11px;color:#94A3B8">${esc(s.proforma_no)}</div>` : ""}`),
    td(s.konteyner ? sayi(s.konteyner) : "-", true),
    td(esc(s.liman || "-")),
    ...(tekGun ? [] : [td(kisaTarih(s.on_odeme_tarihi), true, "color:#64748B;")]),
  ].join("")}</tr>`).join("");
  const kont = r.bugunOnOdeme.reduce((t, s) => t + (s.konteyner || 0), 0);
  const toplam = `<tr>${[
    td(`<b>Toplam · ${r.bugunOnOdeme.length} sipariş</b>`, false, "border-bottom:0;border-top:2px solid " + RAPOR_LACIVERT + ";"),
    td(`<b>${sayi(kont)}</b>`, true, "border-bottom:0;border-top:2px solid " + RAPOR_LACIVERT + ";"),
    td("", false, "border-bottom:0;border-top:2px solid " + RAPOR_LACIVERT + ";"),
    ...(tekGun ? [] : [td("", true, "border-bottom:0;border-top:2px solid " + RAPOR_LACIVERT + ";")]),
  ].join("")}</tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Müşteri")}${th("Konteyner", true, "90px")}${th("Varış limanı", false, "34%")}${tekGun ? "" : th("Tarih", true, "60px")}</tr>${satirlar}${toplam}</table>`;
}

const gunFarki = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86400000);
const tutarYaz = (t: ParaToplami) => Object.keys(t).sort().map((p) => paraKisa(t[p], p)).join(" + ");

/**
 * Yonetici ozeti (12.11.2026, kullanici: "daha profesyonel, ise yarayan bir ozet"): cumle yerine 4 gosterge kutusu.
 * Acik siparis | Rezervasyon bekleyen (on odemeli) | 14 gunde yukleme | Dikkat (BL eksik, eski onay, olasi tekrar).
 */
export function yoneticiOzeti(r: SiparisRapor): string {
  const o = r.ozet;
  const acikTutar: ParaToplami = {};
  for (const s of [...r.onOdeme, ...r.onay, ...r.acikRezervasyon]) paraEkle(acikTutar, s.para_birimi, s.tutar);
  const enEski = r.onOdeme.filter((s) => s.on_odeme_tarihi).sort((a, b) => (a.on_odeme_tarihi || "").localeCompare(b.on_odeme_tarihi || ""))[0];
  const bekleme = enEski?.on_odeme_tarihi ? gunFarki(r.tarih, enEski.on_odeme_tarihi) : null;
  const ilk = r.planYakin.find((p) => p.etd);
  const eskiOnay = r.onay.filter((s) => s.proforma_tarihi && gunFarki(r.tarih, s.proforma_tarihi) >= 14).length;
  const dikkat = o.blEksik + eskiOnay + o.olasiTekrar;
  const kutu = (etiket: string, deger: string, alt: string, renk = RAPOR_LACIVERT) =>
    `<td width="25%" style="vertical-align:top;padding:4px"><div style="border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px;height:74px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#64748B">${etiket}</div>
      <div style="font-size:20px;font-weight:bold;color:${RAPOR_LACIVERT};line-height:1.25;margin-top:2px">${deger}</div>
      <div style="font-size:11px;color:#475569;line-height:1.4">${alt}</div></div></td>`;
  const dikkatAlt = [o.blEksik ? `${o.blEksik} sevkiyatta BL eksik` : "", eskiOnay ? `${eskiOnay} onay 14+ gündür bekliyor` : "", o.olasiTekrar ? `${o.olasiTekrar} olası mükerrer proforma` : ""].filter(Boolean).join(" · ") || "Bekleyen sorun yok";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px 6px"><tr>
    ${kutu("Açık sipariş", sayi(o.acikSiparis), `${sayi(o.acikKont)} kont. · ${sayi(o.acikMt)} MT${tutarYaz(acikTutar) ? ` · ${esc(tutarYaz(acikTutar))}` : ""}`)}
    ${kutu("Ön ödemeli", sayi(o.onOdeme), `rezervasyon bekliyor · ${sayi(o.onOdemeKont)} kont.${bekleme !== null ? ` · en eskisi ${bekleme} gün` : ""}`, RAPOR_SEFTALI)}
    ${kutu(`${PLAN_GUN} gün yükleme`, sayi(o.planYakinBooking), `${sayi(o.planYakinKont)} kont.${ilk ? ` · ilk ETD ${kisaTarih(ilk.etd)}` : ""}`, "#10B981")}
    ${kutu("Dikkat", sayi(dikkat), esc(dikkatAlt), dikkat ? "#B91C1C" : "#94A3B8")}
  </tr></table>`;
}

export function siparisRaporHtml(r: SiparisRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString()): string {
  const saatYaz = new Date(Date.parse(olusturmaIso) + 3 * 3600000).toISOString().slice(11, 16);
  return raporKabugu({
    sirketAdi, baslik: "Sipariş Raporu", tarih: trTarih(r.tarih), oturum: `${oturumAdi(r.oturum)} · ${saatYaz}`,
    ozetBaslik: "Günün Özeti",
    ozetAlt: "",
    maddeler: [],
    ozetIcerik: `${yoneticiOzeti(r)}
    <div style="margin:10px 0 5px;font-size:12px;font-weight:bold;color:${RAPOR_LACIVERT}">${r.oturum === "sabah" ? "Dün ve Bugün Gelen Ön Ödemeler" : "Bugün Gelen Ön Ödemeler"}</div>
    ${onOdemeTablosu(r)}`,
    dugme: { metin: "Siparişleri aç", yol: "/siparisler" },
    dipnot: `Tüm siparişler ve yükleme planı ekteki Excel'de (sayfadaki "Excel indir" ile aynı).<br>Her gün ${SIPARIS_RAPOR_SAATI}'de · müşteriye gitmez.`,
  });
}
