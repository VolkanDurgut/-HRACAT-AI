/**
 * MUSTERI OZET RAPORU - hesap + HTML (11.11.2026). Edge: musteri-ozet-rapor. SAF: veri yok, ag yok.
 *
 * Kullanici: "Her musteri icin ozet raporu olusturulsun. Veritabanina gore. Hergun musterilere gonderilmesi icin
 * mail ile talimat verilecek departmanlara. Musteri ozeti unutma. Potansiyel musterilerimiz icin ozet rapor
 * olusturulsun." Alicilar: operation, export, export2, execution, bbt (secret; ilk asamada yalniz test adresi).
 *
 * Kaynak: musteri_ozet_veri(p_company) RPC (migration 20261111180000). Musteri = Pazar'daki "musteri"
 * (rezervasyonla musteri olan firma); dosya / siparis eslesmesi pazar_anahtar() ile.
 * Musteriye sistemden mail GITMEZ: her aktif musteri icin Ingilizce durum metni "Outlook'ta hazirla" (mailto)
 * ile departmandan gonderilir. Fiyat / tutar musteri metnine YAZILMAZ.
 *
 * Talimat kurallari (her biri sorumlu departmanla):
 *  OPERASYON : rezervasyon girilmemis acik dosya; on odemesi alinmis ama rezervasyonu olmayan siparis;
 *              talimat cut-off'u 3 gun icinde; draft BL revize istendi.
 *  EXPORT    : draft BL yuklu, musteriye gonderilmedi; draft onayi bekleniyor (2+ gun); onay / on odeme
 *              bekleyen proforma (3+ gun); musteriden son 3 gunde gelen yazi; varisa 7 gun kala bilgi.
 *  EXECUTION : gemisi kalkmis, faturasi kesilmemis; gemisi kalkmis, odemesi alinmamis (konsimento X / alindi / ...).
 */

import { esc, raporKabugu, sikiTablo } from "./rapor-kabugu.ts";
import { XS, type XlsxSayfa } from "./xlsx-yaz.ts";

export type MoMusteri = {
  id: string; ad: string; anahtarlar: string[]; ulke: string | null; crm_asama: string | null;
  son_temas: string | null; sonraki_adim: string | null; musteri_olma_tarihi: string | null; epostalar: string[];
};
export type MoDosya = {
  id: string; anahtar: string | null; dosya_no: string | null; durum: string | null; olusturma_tarihi: string | null;
  alici_firma: string | null; varis_limani: string | null; proforma_no: string | null; urun_tanimi: string | null;
  toplam_konteyner: number | null; fatura_no: string | null; fatura_tarihi: string | null; bl_no: string | null;
  fatura_var: boolean; konsimento_var: boolean; draft_var: boolean; draft_mail: boolean; draft_mail_tarihi: string | null;
  draft_onay: boolean; draft_revize: boolean; draft_revize_notu: string | null;
};
export type MoRezervasyon = {
  dosya_id: string; booking_no: string | null; gemi_adi: string | null; sefer_no: string | null; etd: string | null;
  eta: string | null; konteyner_adedi: number | null; acente: string | null; talimat_cutoff: string | null; konsimento_durumu: string | null;
};
export type MoSiparis = {
  anahtar: string | null; proforma_no: string | null; proforma_tarihi: string | null; firma: string | null; urun: string | null;
  miktar_mt: number | null; konteyner: number | null; liman: string | null; durum: "onay_bekliyor" | "on_odeme_alindi"; on_odeme_tarihi: string | null; dosya_no: string | null;
};
export type MoGelen = { firma_id: string | null; tarih: string; konu: string | null; oneri: string | null; tur: string | null };
export type MoPotansiyel = {
  toplam: number; asamalar: Record<string, number>; ulkeler: { ulke: string; adet: number }[]; temas7: number;
  surecte: { id: string; ad: string; ulke: string | null; crm_asama: string; son_temas: string | null; sonraki_adim: string | null }[];
};
export type MoVeri = {
  bugun: string; musteriler: MoMusteri[]; dosyalar: MoDosya[]; rezervasyonlar: MoRezervasyon[];
  hatirlatmalar: { dosya_id: string; adet: number; son: string | null }[]; siparisler: MoSiparis[]; gelenler: MoGelen[]; potansiyel: MoPotansiyel;
};

export type Departman = "operasyon" | "export" | "execution";
export type Seviye = "acil" | "bugun" | "bilgi";
export type Talimat = { departman: Departman; seviye: Seviye; musteri: string; dosya: string | null; metin: string };
export type SevkAsamasi = "rezervasyon_bekliyor" | "planlandi" | "yolda" | "varista";
export type Sevkiyat = {
  dosya: MoDosya; asama: SevkAsamasi; booking: string | null; gemi: string | null; etd: string | null; eta: string | null;
  konteyner: number; odemeAlindi: boolean; odemeBekliyor: boolean; konsimento: string | null; cutoff: string | null;
  hatirlatma: { adet: number; son: string | null } | null;
};
export type MusteriOzeti = {
  musteri: MoMusteri; ulke: string | null; sevkiyatlar: Sevkiyat[]; siparisler: MoSiparis[]; gelenler: MoGelen[];
  talimatlar: Talimat[]; aktif: boolean; sonSiparis: string | null; siparissizGun: number | null; musteriMetni: string;
};
export type ProformaliFirma = { firma: string; siparisler: MoSiparis[]; mt: number; konteyner: number; enEski: string | null; gun: number | null };
export type MusteriOzetRaporu = {
  tarih: string; musteriler: MusteriOzeti[]; aktifler: MusteriOzeti[]; siparissizler: MusteriOzeti[]; talimatlar: Talimat[];
  proformali: ProformaliFirma[]; potansiyel: MoPotansiyel; gelenSayisi: number;
  ozet: { musteri: number; aktif: number; yolda: number; yoldaKont: number; odemeBekleyen: number; talimat: number; acil: number; proformaliFirma: number; potansiyel: number };
};

/** Odeme alindi = telex | seawaybill | vesaik (lib/odeme-takibi.ts ile ayni kural). */
const ODEME_ALINDI = new Set(["telex", "seawaybill", "vesaik"]);
const KONSIMENTO_ADI: Record<string, string> = {
  x: "X (serbest değil)", alindi: "Orijinal elimizde", telex: "Telex", seawaybill: "Seawaybill", vesaik: "Vesaik",
  kargo: "Kargoda", kuehne: "Kuehne", acente: "Acentede",
};
export const DEPARTMAN_ADI: Record<Departman, string> = { operasyon: "Operasyon", export: "Export", execution: "Execution" };
export const ASAMA_ADI: Record<SevkAsamasi, string> = {
  rezervasyon_bekliyor: "Rezervasyon bekleniyor", planlandi: "Yükleme planlandı", yolda: "Yolda", varista: "Varış limanında",
};
export const CRM_ADI: Record<string, string> = {
  yeni: "Henüz görüşülmedi", sorgulandi: "Sorgulandı", hatirlatma1: "1. hatırlatma", hatirlatma2: "2. hatırlatma",
  sessiz: "Sessiz", cevap: "Cevap geldi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor",
};
/** Odemesi alinmamis sevkiyat bu kadar gunden eskiyse takipten duser (eski Excel kayitlari). */
const ODEME_TAKIP_GUN = 120;
const SIPARISSIZ_UYARI_GUN = 45;

const GUN = 86400000;
const gunFarki = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / GUN);
export const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "-");
const kisa = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "-");
const enTarih = (iso: string | null | undefined) => {
  if (!iso) return "TBA";
  const ay = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1] || "";
  return `${iso.slice(8, 10)} ${ay} ${iso.slice(0, 4)}`;
};
/** Cut-off yerel saat UTC etiketiyle saklanir: HAM okunur. */
const cutoffYaz = (ham: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(ham || "");
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : "-";
};

function sevkiyatlar(dosyalar: MoDosya[], rez: MoRezervasyon[], hat: MoVeri["hatirlatmalar"], bugun: string): Sevkiyat[] {
  const out: Sevkiyat[] = [];
  for (const d of dosyalar) {
    const r = rez.filter((x) => x.dosya_id === d.id);
    const etd = r.map((x) => x.etd).filter(Boolean).sort()[0] ?? null;
    const eta = r.map((x) => x.eta).filter(Boolean).sort().slice(-1)[0] ?? null;
    const kalkti = !!etd && etd <= bugun;
    const durumlar = r.map((x) => x.konsimento_durumu);
    const odemeAlindi = r.length > 0 && durumlar.every((k) => !!k && ODEME_ALINDI.has(k));
    const odemeBekliyor = kalkti && !odemeAlindi;
    const acik = d.durum === "Açık";
    const yolda = kalkti && (!eta || eta >= bugun);
    const takipteOdeme = odemeBekliyor && !!etd && gunFarki(bugun, etd) <= ODEME_TAKIP_GUN;
    if (!acik && !yolda && !takipteOdeme) continue;
    const asama: SevkAsamasi = !r.length ? "rezervasyon_bekliyor" : !kalkti ? "planlandi" : eta && eta < bugun ? "varista" : "yolda";
    const ilk = r[0];
    const h = hat.find((x) => x.dosya_id === d.id);
    out.push({
      dosya: d, asama, booking: r.map((x) => x.booking_no).filter(Boolean).join(", ") || null,
      gemi: ilk ? [ilk.gemi_adi, ilk.sefer_no].filter(Boolean).join(" / ") || null : null, etd, eta,
      konteyner: r.reduce((t, x) => t + (Number(x.konteyner_adedi) || 0), 0) || Number(d.toplam_konteyner) || 0,
      odemeAlindi, odemeBekliyor, konsimento: Array.from(new Set(durumlar.filter(Boolean))).map((k) => KONSIMENTO_ADI[k as string] || k).join(", ") || null,
      cutoff: r.map((x) => x.talimat_cutoff).filter(Boolean).sort()[0] ?? null,
      hatirlatma: h ? { adet: h.adet, son: h.son } : null,
    });
  }
  return out.sort((a, b) => (a.etd || "9999").localeCompare(b.etd || "9999"));
}

function sevkiyatTalimatlari(m: string, s: Sevkiyat, bugun: string): Talimat[] {
  const t: Talimat[] = [];
  const dosya = s.dosya.dosya_no;
  const ekle = (departman: Departman, seviye: Seviye, metin: string) => t.push({ departman, seviye, musteri: m, dosya, metin });
  if (s.asama === "rezervasyon_bekliyor") ekle("operasyon", "bugun", "Rezervasyon girilmedi — booking alınıp sisteme girilmeli.");
  if (s.cutoff && s.asama === "planlandi") {
    const g = gunFarki(s.cutoff, bugun);
    if (g >= 0 && g <= 3) ekle("operasyon", g <= 1 ? "acil" : "bugun", `Talimat cut-off ${cutoffYaz(s.cutoff)} (${g === 0 ? "bugün" : `${g} gün`}) — yükleme talimatı ve evraklar hazır olmalı.`);
  }
  if (s.dosya.draft_revize) ekle("operasyon", "acil", `Müşteri draft BL revizesi istedi${s.dosya.draft_revize_notu ? `: "${s.dosya.draft_revize_notu}"` : ""}.`);
  else if (s.dosya.draft_var && !s.dosya.draft_mail) ekle("export", "bugun", "Draft BL yüklendi, müşteriye gönderilmedi.");
  else if (s.dosya.draft_mail && !s.dosya.draft_onay) {
    const g = s.dosya.draft_mail_tarihi ? gunFarki(bugun, s.dosya.draft_mail_tarihi) : null;
    if (g === null || g >= 2) ekle("export", g !== null && g >= 5 ? "acil" : "bugun", `Draft BL onayı bekleniyor${g !== null ? ` (${g} gündür)` : ""} — müşteriden onay istenmeli.`);
  }
  if (s.etd && s.etd <= bugun && !s.dosya.fatura_no) ekle("execution", "acil", `Gemi ${trTarih(s.etd)} kalktı, fatura kesilmedi.`);
  if (s.odemeBekliyor) {
    const g = s.etd ? gunFarki(bugun, s.etd) : 0;
    const h = s.hatirlatma ? `son hatırlatma ${kisa(s.hatirlatma.son)} (${s.hatirlatma.adet} kez)` : "hatırlatma gönderilmedi";
    ekle("execution", s.asama === "varista" || g >= 21 ? "acil" : "bugun", `Ödeme bekleniyor — ETD +${g} gün, konşimento: ${s.konsimento || "girilmedi"}; ${h}.`);
  }
  if (s.eta && s.eta >= bugun) {
    const g = gunFarki(s.eta, bugun);
    if (g <= 7) ekle("export", "bilgi", `Varışa ${g === 0 ? "bugün" : `${g} gün`} (ETA ${trTarih(s.eta)}) — müşteriye varış bilgisi verilmeli.`);
  }
  return t;
}

/** Musteriye gonderilecek Ingilizce durum metni (fiyat / odeme YOK; yalniz sevkiyat ve siparis durumu). */
export function musteriMetni(firma: string, sevk: Sevkiyat[], sip: MoSiparis[], sirketAdi: string): string {
  const satir: string[] = [];
  for (const p of sip) {
    satir.push(`- Proforma ${p.proforma_no || "-"}${p.urun ? ` (${p.urun})` : ""}: ${p.durum === "on_odeme_alindi" ? "advance payment received, booking in progress" : "awaiting your confirmation / advance payment"}.`);
  }
  for (const s of sevk) {
    const d = s.dosya;
    const parca = [`${s.konteyner || "-"} x container${d.urun_tanimi ? ` ${d.urun_tanimi}` : ""}`];
    if (s.booking) parca.push(`Booking ${s.booking}`);
    if (s.gemi) parca.push(`Vessel ${s.gemi}`);
    parca.push(`ETD ${enTarih(s.etd)}`);
    if (s.eta) parca.push(`ETA ${enTarih(s.eta)}`);
    if (d.bl_no) parca.push(`B/L ${d.bl_no}`);
    const durum = s.asama === "rezervasyon_bekliyor" ? "booking in progress" : s.asama === "planlandi" ? "loading scheduled" : s.asama === "yolda" ? "on board / in transit" : "arrived at destination";
    satir.push(`- ${d.varis_limani ? `${d.varis_limani}: ` : ""}${parca.join(", ")} — ${durum}.`);
  }
  return `Dear ${firma} team,\n\nPlease find below the current status of your orders with ${sirketAdi}:\n\n${satir.join("\n")}\n\nShould you need any further information, please do not hesitate to contact us.\n\nBest regards,\nExport Department\n${sirketAdi}`;
}

export function musteriOzetHesapla(v: MoVeri, sirketAdi = "Unex Gıda"): MusteriOzetRaporu {
  const bugun = v.bugun.slice(0, 10);
  const tumAnahtar = new Set(v.musteriler.flatMap((m) => m.anahtarlar));
  const musteriler: MusteriOzeti[] = v.musteriler.map((m) => {
    const an = new Set(m.anahtarlar);
    const dosyalar = v.dosyalar.filter((d) => d.anahtar && an.has(d.anahtar));
    const sevk = sevkiyatlar(dosyalar, v.rezervasyonlar, v.hatirlatmalar, bugun);
    const sip = v.siparisler.filter((s) => s.anahtar && an.has(s.anahtar));
    const gelen = v.gelenler.filter((g) => g.firma_id === m.id);
    const talimatlar = sevk.flatMap((s) => sevkiyatTalimatlari(m.ad, s, bugun));
    for (const s of sip) {
      const g = s.proforma_tarihi ? gunFarki(bugun, s.proforma_tarihi) : null;
      if (s.durum === "on_odeme_alindi") talimatlar.push({ departman: "operasyon", seviye: "bugun", musteri: m.ad, dosya: s.proforma_no, metin: `Ön ödeme alındı${s.on_odeme_tarihi ? ` (${kisa(s.on_odeme_tarihi)})` : ""} — rezervasyon alınmalı.` });
      else if (g === null || g >= 3) talimatlar.push({ departman: "export", seviye: g !== null && g >= 14 ? "acil" : "bugun", musteri: m.ad, dosya: s.proforma_no, metin: `Proforma onayı / ön ödeme bekleniyor${g !== null ? ` (${g} gündür)` : ""} — müşteri aranmalı.` });
    }
    for (const g of gelen) {
      if (g.tur === "cevap" && gunFarki(bugun, g.tarih) <= 3) talimatlar.push({ departman: "export", seviye: "bugun", musteri: m.ad, dosya: null, metin: `Müşteri yazdı (${kisa(g.tarih)}): "${g.konu || "-"}"${g.oneri ? ` · öneri: ${g.oneri}` : ""}.` });
    }
    const tarihler = dosyalar.map((d) => d.olusturma_tarihi).filter((t): t is string => !!t).sort();
    const sonSiparis = tarihler.length ? tarihler[tarihler.length - 1] : null;
    const aktif = sevk.length > 0 || sip.length > 0;
    return {
      musteri: m, ulke: m.ulke, sevkiyatlar: sevk, siparisler: sip, gelenler: gelen, talimatlar, aktif, sonSiparis,
      siparissizGun: sonSiparis ? Math.max(0, gunFarki(bugun, sonSiparis)) : null,
      musteriMetni: aktif ? musteriMetni(m.ad, sevk, sip, sirketAdi) : "",
    };
  });
  const sira: Record<Seviye, number> = { acil: 0, bugun: 1, bilgi: 2 };
  const puan = (m: MusteriOzeti) => Math.min(...m.talimatlar.map((t) => sira[t.seviye]), 3);
  const aktifler = musteriler.filter((m) => m.aktif).sort((a, b) => puan(a) - puan(b) || b.talimatlar.length - a.talimatlar.length || a.musteri.ad.localeCompare(b.musteri.ad, "tr"));
  const siparissizler = musteriler.filter((m) => !m.aktif).sort((a, b) => (b.siparissizGun ?? -1) - (a.siparissizGun ?? -1));
  for (const m of siparissizler) {
    if ((m.siparissizGun ?? 0) >= SIPARISSIZ_UYARI_GUN && m.musteri.crm_asama === "yeni") {
      m.talimatlar.push({ departman: "export", seviye: "bilgi", musteri: m.musteri.ad, dosya: null, metin: `${m.siparissizGun} gündür sipariş yok — yeni sezon teklifi / sipariş sorgusu (UNEX Satış görevi).` });
    }
  }
  const depSira: Record<Departman, number> = { operasyon: 0, export: 1, execution: 2 };
  const talimatlar = musteriler.flatMap((m) => m.talimatlar)
    .sort((a, b) => depSira[a.departman] - depSira[b.departman] || sira[a.seviye] - sira[b.seviye] || a.musteri.localeCompare(b.musteri, "tr"));

  // Proforma verilmis, henuz musterimiz olmayan firmalar (potansiyelin en sicak kismi)
  const pf = new Map<string, ProformaliFirma>();
  for (const s of v.siparisler) {
    if (s.anahtar && tumAnahtar.has(s.anahtar)) continue;
    const k = s.anahtar || s.firma || "-";
    const e = pf.get(k) || { firma: s.firma || "-", siparisler: [], mt: 0, konteyner: 0, enEski: null, gun: null };
    e.siparisler.push(s);
    e.mt += Number(s.miktar_mt) || 0;
    e.konteyner += Number(s.konteyner) || 0;
    if (s.proforma_tarihi && (!e.enEski || s.proforma_tarihi < e.enEski)) e.enEski = s.proforma_tarihi;
    pf.set(k, e);
  }
  const proformali = Array.from(pf.values()).map((p) => ({ ...p, mt: Math.round(p.mt), gun: p.enEski ? gunFarki(bugun, p.enEski) : null }))
    .sort((a, b) => (a.siparisler.some((s) => s.durum === "on_odeme_alindi") ? 0 : 1) - (b.siparisler.some((s) => s.durum === "on_odeme_alindi") ? 0 : 1) || (a.gun ?? 9999) - (b.gun ?? 9999));

  const yolda = aktifler.flatMap((m) => m.sevkiyatlar).filter((s) => s.asama === "yolda");
  return {
    tarih: bugun, musteriler, aktifler, siparissizler, talimatlar, proformali, potansiyel: v.potansiyel,
    gelenSayisi: v.gelenler.filter((g) => g.tur === "cevap").length,
    ozet: {
      musteri: musteriler.length, aktif: aktifler.length, yolda: yolda.length, yoldaKont: yolda.reduce((t, s) => t + s.konteyner, 0),
      odemeBekleyen: musteriler.flatMap((m) => m.sevkiyatlar).filter((s) => s.odemeBekliyor).length,
      talimat: talimatlar.length, acil: talimatlar.filter((t) => t.seviye === "acil").length,
      proformaliFirma: proformali.length, potansiyel: v.potansiyel.toplam,
    },
  };
}

// ---------------------------------------------------------------------------
// MAIL (11.11.2026 revize, kullanici: "cok uzun; otomatik ozet metni + ekte yalniz Excel; tek sayfa")
// Mailde: Otomatik Ozet maddeleri + en acil 8 is (tek satir). Tum talimatlar, musteriler, sevkiyatlar, musteriye
// gonderilecek Ingilizce metin ve potansiyeller ekteki Excel'de.
// ---------------------------------------------------------------------------
const sayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

export function musteriOzetKonusu(r: MusteriOzetRaporu, sirketAdi = "Unex Gıda"): string {
  const o = r.ozet;
  return `${sirketAdi} Müşteri Özeti · ${trTarih(r.tarih)} · ${o.aktif} aktif müşteri · ${o.talimat} iş${o.acil ? ` (${o.acil} acil)` : ""}`;
}

export function musteriOzetMaddeleri(r: MusteriOzetRaporu): string[] {
  const o = r.ozet;
  const m: string[] = [];
  m.push(`Aktif müşteri <b>${o.aktif} / ${o.musteri}</b>: ${o.yolda} sevkiyat yolda (${sayi(o.yoldaKont)} kont.), ${o.odemeBekleyen} sevkiyatta ödeme bekleniyor.`);
  const dep = (d: Departman) => r.talimatlar.filter((t) => t.departman === d).length;
  m.push(`Bugün <b>${o.talimat}</b> iş: Operasyon ${dep("operasyon")} · Export ${dep("export")} · Execution ${dep("execution")}${o.acil ? `; <b style="color:#B91C1C">${o.acil} acil</b>` : ""}.`);
  const enCok = [...r.aktifler].sort((a, b) => b.talimatlar.length - a.talimatlar.length)[0];
  if (enCok && enCok.talimatlar.length) m.push(`En çok iş bekleyen müşteri ${esc(enCok.musteri.ad)}: ${enCok.talimatlar.length} iş (${enCok.sevkiyatlar.length} sevkiyat, ${enCok.siparisler.length} açık proforma).`);
  const ss = r.siparissizler.filter((x) => x.siparissizGun !== null);
  if (ss.length) m.push(`<b>${r.siparissizler.length}</b> müşterinin şu an siparişi yok; en uzun ${esc(ss[0].musteri.ad)} (${ss[0].siparissizGun} gün).`);
  const onOdemeli = r.proformali.filter((f) => f.siparisler.some((s) => s.durum === "on_odeme_alindi")).length;
  m.push(`Potansiyel: ${sayi(o.potansiyel)} firma; <b>${o.proformaliFirma}</b> firmaya proforma verildi, henüz müşteri değil${onOdemeli ? ` (${onOdemeli} tanesinin ön ödemesi alındı)` : ""}${r.gelenSayisi ? `; son 14 günde ${r.gelenSayisi} cevap geldi` : ""}.`);
  return m;
}

export function musteriOzetHtml(r: MusteriOzetRaporu, sirketAdi = "Unex Gıda", oturumEtiketi = "Sabah raporu"): string {
  const seviyeRenk: Record<Seviye, string> = { acil: "#B91C1C", bugun: "#B45309", bilgi: "#0369A1" };
  const seviyeAd: Record<Seviye, string> = { acil: "ACİL", bugun: "BUGÜN", bilgi: "BİLGİ" };
  const sira: Record<Seviye, number> = { acil: 0, bugun: 1, bilgi: 2 };
  const enAcil = [...r.talimatlar].sort((a, b) => sira[a.seviye] - sira[b.seviye]).filter((t) => t.seviye !== "bilgi").slice(0, 8);
  const kes = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  const tablo = enAcil.length ? sikiTablo(
    [{ ad: "" }, { ad: "Dept." }, { ad: "Müşteri · Dosya" }, { ad: "İş" }],
    enAcil.map((t) => [
      `<b style="color:${seviyeRenk[t.seviye]};font-size:9.5px">${seviyeAd[t.seviye]}</b>`,
      DEPARTMAN_ADI[t.departman],
      `<b>${esc(kes(t.musteri, 22))}</b>${t.dosya ? ` <span style="color:#64748B;font-family:monospace">${esc(t.dosya)}</span>` : ""}`,
      `<span style="white-space:normal">${esc(kes(t.metin, 90))}</span>`,
    ]),
    `Öncelikli işler · ${enAcil.length} / ${r.talimatlar.length}`,
  ) : "";
  return raporKabugu({
    sirketAdi, baslik: "Müşteri Özeti", tarih: trTarih(r.tarih), oturum: oturumEtiketi,
    ozetAlt: "İhracat dosyaları, rezervasyonlar, sipariş listesi ve UNEX Satış kayıtlarına göre",
    maddeler: musteriOzetMaddeleri(r), ekBolum: tablo,
    dugme: { metin: "UNEX Satış'ı aç", yol: "/pazar" },
    dipnot: "Tüm işler (departman bazında), müşteri durumları, müşteriye gönderilecek İngilizce metin ve potansiyeller ekteki Excel'de.<br>Müşteriye sistemden mail gitmez.",
  });
}

/** Ek Excel: Isler · Musteriler · Sevkiyatlar · Potansiyel */
export function musteriOzetSayfalari(r: MusteriOzetRaporu): XlsxSayfa[] {
  const b = (v: string) => ({ v, s: XS.tabloBaslik });
  const m = (v: string | number | null | undefined) => ({ v: v ?? "", s: typeof v === "number" ? XS.tamSayi : XS.metin });
  const tarih = (iso: string | null | undefined) => ({ v: iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : null, s: XS.tarih });
  const sira: Record<Seviye, number> = { acil: 0, bugun: 1, bilgi: 2 };
  const isler: XlsxSayfa = {
    ad: "İşler", sutunGenislik: [9, 12, 30, 18, 90],
    satirlar: [["Öncelik", "Departman", "Müşteri", "Dosya / Proforma", "İş"].map(b),
      ...[...r.talimatlar].sort((x, y) => sira[x.seviye] - sira[y.seviye]).map((t) => [m(t.seviye === "acil" ? "ACİL" : t.seviye === "bugun" ? "BUGÜN" : "BİLGİ"), m(DEPARTMAN_ADI[t.departman]), m(t.musteri), m(t.dosya), m(t.metin)])],
  };
  const musteriler: XlsxSayfa = {
    ad: "Müşteriler", sutunGenislik: [30, 14, 10, 10, 10, 10, 10, 12, 10, 18, 80],
    satirlar: [["Müşteri", "Ülke", "Durum", "Sevkiyat", "Yoldaki kont.", "Ödeme bekleyen", "Açık proforma", "Son dosya", "Siparişsiz gün", "E-posta", "Müşteriye gönderilecek metin"].map(b),
      ...[...r.aktifler, ...r.siparissizler].map((x) => [m(x.musteri.ad), m(x.ulke), m(x.aktif ? "Aktif" : "Siparişsiz"), m(x.sevkiyatlar.length),
        m(x.sevkiyatlar.filter((s) => s.asama === "yolda").reduce((t, s) => t + s.konteyner, 0)), m(x.sevkiyatlar.filter((s) => s.odemeBekliyor).length),
        m(x.siparisler.length), tarih(x.sonSiparis), m(x.siparissizGun), m(x.musteri.epostalar.join(", ")), m(x.musteriMetni)])],
  };
  const sevkiyatlar: XlsxSayfa = {
    ad: "Sevkiyatlar", sutunGenislik: [28, 16, 18, 22, 24, 11, 11, 7, 20, 22, 16],
    satirlar: [["Müşteri", "Dosya", "Varış", "Booking", "Gemi", "ETD", "ETA", "Kont.", "Durum", "Konşimento / ödeme", "Fatura"].map(b),
      ...r.aktifler.flatMap((x) => x.sevkiyatlar.map((s) => [m(x.musteri.ad), m(s.dosya.dosya_no), m(s.dosya.varis_limani), m(s.booking), m(s.gemi), tarih(s.etd), tarih(s.eta), m(s.konteyner),
        m(ASAMA_ADI[s.asama]), m(s.etd && s.etd <= r.tarih ? (s.odemeAlindi ? `Alındı (${s.konsimento || "-"})` : `Bekliyor (${s.konsimento || "girilmedi"})`) : "-"), m(s.dosya.fatura_no)]))],
  };
  const potansiyel: XlsxSayfa = {
    ad: "Potansiyel", sutunGenislik: [30, 26, 12, 10, 26, 10],
    satirlar: [["Proforma verilmiş firma", "Proforma", "Miktar (MT)", "Kont.", "Durum", "Bekleme (gün)"].map(b),
      ...r.proformali.map((f) => [m(f.firma), m(f.siparisler.map((s) => s.proforma_no || "-").join(", ")), m(f.mt), m(f.konteyner),
        m(f.siparisler.some((s) => s.durum === "on_odeme_alindi") ? "Ön ödeme alındı" : "Onay / ön ödeme bekliyor"), m(f.gun)]),
      [], ["Görüşme sürecindeki firma", "Ülke", "Aşama", "Son temas", "Sonraki adım"].map(b),
      ...r.potansiyel.surecte.map((f) => [m(f.ad), m(f.ulke), m(CRM_ADI[f.crm_asama] || f.crm_asama), tarih(f.son_temas), tarih(f.sonraki_adim)])],
  };
  return [isler, musteriler, sevkiyatlar, potansiyel];
}
