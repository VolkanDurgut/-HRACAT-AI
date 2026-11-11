/**
 * SIPARIS RAPORU MAILI - hesap + HTML (11.11.2026). Edge: siparis-rapor. SAF: veri yok, ag yok.
 * Kaynak: siparis_listesi_veri + yukleme_plani_veri (Siparisler sayfasiyla AYNI veri ve ayni kurallar:
 * siparis-liste.ts bolumleri / plan gorunumu). Ek: sayfadaki "Excel indir" ile ayni dosya (siparis-xlsx.ts).
 * Musteriye GITMEZ (ic rapor; fiyat ve tutarlar gorunur).
 */
import {
  BOLUM_BASLIGI, DURUM_ADI, planGorunumu, planHaftasi, planKalemleri, planSirala, saat, siparisBolumleri, siparisOzeti, trTarih,
  type PlanSatiri, type SiparisOzeti, type SiparisSatiri,
} from "./siparis-liste.ts";
import { RAPOR_SAATLERI, oturumAdi, oturumSaatten } from "./rapor-oturum.ts";

const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const YESIL = "#10B981";
export const SIPARIS_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
export const SIPARIS_RAPOR_SAATI = RAPOR_SAATLERI;
/** Plan bolumunde gosterilecek ileri gun sayisi (ETD bugun .. bugun+14) */
const PLAN_GUN = 14;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (v: number | null | undefined, ond = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : v.toLocaleString("tr-TR", { minimumFractionDigits: ond, maximumFractionDigits: ond });
const kisaTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const gunEkle = (iso: string, gun: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + gun * 86400000).toISOString().slice(0, 10);

export type ParaToplami = Record<string, number>;
const paraEkle = (t: ParaToplami, para: string | null, v: number | null) => { if (v !== null && Number.isFinite(v)) t[para || "USD"] = (t[para || "USD"] || 0) + v; };
const paraYaz = (t: ParaToplami) => Object.keys(t).sort().map((p) => `${sayi(t[p], 0)} ${esc(p)}`).join(" + ") || "-";

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

export function siparisRaporHtml(r: SiparisRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString()): string {
  const o = r.ozet;
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 6px;text-align:${sag ? "right" : "left"};font-weight:bold;white-space:nowrap">${t}</th>`;
  const td = (t: string, st = "") => `<td style="padding:6px 6px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${t}</td>`;
  const alt = (t: string) => (t ? `<br><span style="color:#64748B;font-size:11px">${t}</span>` : "");
  const mono = (t: string | null) => `<b style="font-family:monospace">${esc(t || "-")}</b>`;
  const sag = "text-align:right;white-space:nowrap";
  const kutu = (etiket: string, deger: string, altYazi: string, renk: string) =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.4">${altYazi}</div></td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolum = (t: string, sagYazi = "") => `<div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px;line-height:1.4">${t}${sagYazi ? `<div style="font-weight:normal;text-transform:none;letter-spacing:0;color:#64748B">${sagYazi}</div>` : ""}</div>`;
  const bos = (cols: number, metin: string) => `<tr><td colspan="${cols}" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px;border-bottom:1px solid #E2E8F0">${metin}</td></tr>`;
  const tablo = (baslik: string, govde: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${baslik}</tr>${govde}</table>`;
  const zebra = (i: number) => (i % 2 ? "background:#F8FAFC" : "");
  const urun = (s: SiparisSatiri) => `${esc(s.urun || "-")}${alt([s.marka, s.paketleme].filter(Boolean).map(esc).join(" · "))}`;
  const proforma = (s: SiparisSatiri) => `${mono(s.proforma_no)}${alt(trTarih(s.proforma_tarihi))}`;
  const onOdemeYaz = (s: SiparisSatiri) => s.on_odeme_tutar !== null
    ? `<b style="color:#047857">${sayi(s.on_odeme_tutar, 0)} ${esc(s.on_odeme_para || "USD")}</b>${alt(trTarih(s.on_odeme_tarihi))}`
    : `<span style="color:#047857">Alındı</span>${alt(trTarih(s.on_odeme_tarihi))}`;

  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Rezervasyon Bekleyen", `${o.onOdeme} sipariş`, `ön ödemesi alınmış · ${sayi(o.onOdemeKont)} kont. · ${sayi(o.onOdemeMt)} MT`, YESIL)}${arasi}
    ${kutu("Onay / Ön Ödeme Bekleyen", `${o.onay} proforma`, `${sayi(o.onayKont)} kont. · ${sayi(o.onayMt)} MT`, "#B45309")}${arasi}
    ${kutu("Rezervasyonlu", `${o.rezervasyonlu + o.blEksik} sipariş`, o.blEksik ? `${o.blEksik} tanesinde BL eksik` : "sevk bekliyor", LACIVERT)}${arasi}
    ${kutu("Yakın Yüklemeler", `${sayi(o.planYakinKont)} kont.`, `${o.planYakinBooking} satır · önümüzdeki ${PLAN_GUN} gün`, "#475569")}
  </tr></table>`;

  const bugun = r.bugunOnOdeme.length
    ? `<div style="margin-top:12px;padding:9px 12px;border:1px solid #BBF7D0;background:#F0FDF4;border-radius:4px;font-size:12px;color:#14532D"><b>Bugün ön ödemesi işaretlenen ${r.bugunOnOdeme.length} sipariş:</b> ${r.bugunOnOdeme.map((s) => `${esc(s.proforma_no)} (${esc(s.firma || "-")}${s.on_odeme_tutar !== null ? ` · ${sayi(s.on_odeme_tutar, 0)} ${esc(s.on_odeme_para || "USD")}` : ""})`).join(", ")}. Yükleme planına "rezervasyon alınmadı" olarak eklendi.</div>`
    : "";

  // 1) On odemesi alinmis, rezervasyon bekleyen
  const oRows = r.onOdeme.map((s, i) => `<tr style="${zebra(i)}">${td(proforma(s), "white-space:nowrap")}${td(esc(s.firma || "-"))}${td(urun(s))}${td(sayi(s.miktar_mt, 0), sag)}${td(sayi(s.konteyner), sag)}${td(esc(s.liman || "-"))}${td(onOdemeYaz(s), sag)}</tr>`).join("");
  const oTablo = tablo(`${th("Proforma")}${th("Firma")}${th("Ürün · Marka")}${th("MT", true)}${th("Kont.", true)}${th("Liman")}${th("Ön ödeme", true)}`, oRows || bos(7, "Rezervasyon bekleyen sipariş yok."));

  // 2) On odemesi veya onayi alinmamis
  const bRows = r.onay.map((s, i) => `<tr style="${zebra(i)}">${td(`${proforma(s)}${s.benzer && s.kaynak === "sistem" ? `<br><span style="color:#B45309;font-size:11px">olası tekrar: ${esc(s.benzer)}</span>` : ""}`, "white-space:nowrap")}${td(esc(s.firma || "-"))}${td(urun(s))}${td(sayi(s.miktar_mt, 0), sag)}${td(sayi(s.konteyner), sag)}${td(esc(s.liman || "-"))}${td(`${sayi(s.tutar, 0)} ${esc(s.para_birimi || "")}${alt(s.birim_fiyat !== null ? `${sayi(s.birim_fiyat, 2)} / MT` : "")}`, sag)}</tr>`).join("");
  const bTablo = tablo(`${th("Proforma")}${th("Firma")}${th("Ürün · Marka")}${th("MT", true)}${th("Kont.", true)}${th("Liman")}${th("Tutar", true)}`, bRows || bos(7, "Onay bekleyen proforma yok."));

  // 3) Rezervasyonlu, henuz sevk edilmemis / BL eksik
  const rRows = r.acikRezervasyon.map((s, i) => `<tr style="${zebra(i)}">${td(proforma(s), "white-space:nowrap")}${td(esc(s.firma || "-"))}${td(`${mono(s.dosya_no)}${alt(esc(s.booking_no || ""))}`, "white-space:nowrap")}${td(sayi(s.konteyner), sag)}${td(esc(s.liman || "-"))}${td(trTarih(s.etd) || "-", "white-space:nowrap")}${td(s.durum === "bl_eksik" ? `<b style="color:#B91C1C">${DURUM_ADI.bl_eksik}</b>` : DURUM_ADI[s.durum], "white-space:nowrap")}</tr>`).join("");
  const rTablo = tablo(`${th("Proforma")}${th("Firma")}${th("Dosya · Booking")}${th("Kont.", true)}${th("Liman")}${th("ETD")}${th("Durum")}`, rRows || bos(7, "Sevk bekleyen rezervasyonlu sipariş yok."));

  // 4) Yakin yuklemeler (plan)
  const pRows = r.planYakin.map((p, i) => {
    const h = planHaftasi(p);
    const k = planKalemleri(p);
    return `<tr style="${zebra(i)}">${td(`<b>${trTarih(p.etd) || "-"}</b>${alt(h.hafta ? `${h.hafta}. hafta` : "")}`, "white-space:nowrap")}${td(esc(p.musteri || "-"))}${td(k.map((x) => `${esc(x.cinsi || "-")}${x.cuval_markasi ? ` <span style="color:#64748B;font-size:11px">${esc(x.cuval_markasi)}</span>` : ""}`).join("<br>"))}${td(sayi(p.konteyner), sag)}${td(esc(p.varis_limani || "-"))}${td(`${mono(p.booking_no)}${alt(esc([p.acente, p.liman].filter(Boolean).join(" · ")))}`, "white-space:nowrap")}${td(p.talimat_cutoff ? `${trTarih(p.talimat_cutoff)}${alt(saat(p.talimat_cutoff))}` : "-", "white-space:nowrap")}${td(`${esc(p.gemi || "-")}${alt(esc(p.sefer || ""))}`)}</tr>`;
  }).join("");
  const pTablo = tablo(`${th("ETD")}${th("Müşteri")}${th("Cinsi")}${th("Kont.", true)}${th("Varış")}${th("Booking")}${th("Talimat c/o")}${th("Gemi")}`, pRows || bos(8, `Önümüzdeki ${PLAN_GUN} günde planlı yükleme yok.`));

  const saatYaz = new Date(Date.parse(olusturmaIso) + 3 * 3600000).toISOString().slice(11, 16);
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sipariş Raporu</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="820" cellpadding="0" cellspacing="0" style="max-width:820px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${SIPARIS_RAPOR_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} Sipariş Raporu</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Sipariş Listesi · Yükleme Planı</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(trTarih(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">${esc(oturumAdi(oturumSaatten(Date.parse(olusturmaIso))))} · ${esc(saatYaz)}</div></td>
  </tr></table>
  ${kutular}
  ${bugun}

  ${bolum(esc(BOLUM_BASLIGI.on_odeme), `${o.onOdeme} sipariş · ${sayi(o.onOdemeKont)} kont. · proforma toplamı ${paraYaz(o.onOdemeTutar)} · en güncel en altta`)}
  ${oTablo}

  ${bolum(esc(BOLUM_BASLIGI.bekleyen), `${o.onay} proforma · ${sayi(o.onayKont)} kont. · ${paraYaz(o.onayTutar)} · en güncel en altta`)}
  ${bTablo}

  ${bolum("Rezervasyonlu, sevk bekleyen siparişler", `${r.acikRezervasyon.length} sipariş`)}
  ${rTablo}

  ${bolum(`Yükleme planı · önümüzdeki ${PLAN_GUN} gün`, `${o.planYakinBooking} satır · ${sayi(o.planYakinKont)} konteyner${o.planBekleyenKont ? ` · ayrıca rezervasyonu alınmamış ${sayi(o.planBekleyenKont)} konteyner` : ""}`)}
  ${pTablo}

  <div style="margin-top:24px;text-align:center">
    <a href="${SIPARIS_RAPOR_UYGULAMA_URL}/siparisler" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">Siparişleri uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Ekteki Excel, Siparişler sayfasındaki "Excel indir" ile aynı dosyadır (Sipariş Listesi + Yükleme Planı).<br>Liste proforma, ön ödeme, dosya ve rezervasyon kayıtlarından anlık hesaplanır; sevk edilen siparişler yalnız ekte yer alır.<br>Her gün ${SIPARIS_RAPOR_SAATI}'de gönderilir · müşteriye gitmez.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
