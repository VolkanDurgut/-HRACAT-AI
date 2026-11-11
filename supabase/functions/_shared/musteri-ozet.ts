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
// HTML (acik kurumsal tema: lacivert #283474, seftali #F4A07C, yesil #10B981)
// ---------------------------------------------------------------------------
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const YESIL = "#10B981";
export const MUSTERI_OZET_URL = "https://ihracatasistanim.com";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

export function musteriOzetKonusu(r: MusteriOzetRaporu, sirketAdi = "Unex Gıda"): string {
  const o = r.ozet;
  return `${sirketAdi} Müşteri Özeti · ${trTarih(r.tarih)} · ${o.aktif} aktif müşteri · ${o.talimat} talimat${o.acil ? ` (${o.acil} acil)` : ""}`;
}

/** mailto: Outlook ~2000 karakter sinirina karsi govde kisaltilir. */
function mailtoLink(epostalar: string[], konu: string, govde: string): string {
  const g = govde.length > 1400 ? `${govde.slice(0, 1380)}\n…` : govde;
  return `mailto:${epostalar.slice(0, 4).map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(g)}`;
}

export function musteriOzetHtml(r: MusteriOzetRaporu, sirketAdi = "Unex Gıda", oturumEtiketi = "Sabah raporu"): string {
  const o = r.ozet;
  const th = (x: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 6px;text-align:${sag ? "right" : "left"};white-space:nowrap">${x}</th>`;
  const td = (x: string, st = "") => `<td style="padding:6px 6px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${x}</td>`;
  const alt = (x: string) => (x ? `<br><span style="color:#64748B;font-size:11px">${x}</span>` : "");
  const tablo = (b: string, g: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${b}</tr>${g}</table>`;
  const bos = (n: number, m: string) => `<tr><td colspan="${n}" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px;border-bottom:1px solid #E2E8F0">${m}</td></tr>`;
  const zebra = (i: number) => (i % 2 ? "background:#F8FAFC" : "");
  const kutu = (e: string, d: string, a: string, renk: string) =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${e}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${d}</div><div style="font-size:11px;color:#475569;line-height:1.4">${a}</div></td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolum = (t: string, a = "") => `<div style="margin:26px 0 8px;font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px;line-height:1.4">${t}${a ? `<div style="font-weight:normal;text-transform:none;letter-spacing:0;color:#64748B">${a}</div>` : ""}</div>`;
  const rozet = (s: Seviye) => {
    const [bg, fg, ad] = s === "acil" ? ["#FEE2E2", "#991B1B", "ACİL"] : s === "bugun" ? ["#FEF3C7", "#92400E", "BUGÜN"] : ["#E0F2FE", "#075985", "BİLGİ"];
    return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${bg};color:${fg};font-size:9px;font-weight:bold;letter-spacing:.4px">${ad}</span>`;
  };
  const asamaRozet = (a: SevkAsamasi) => {
    const [bg, fg] = a === "rezervasyon_bekliyor" ? ["#F1F5F9", "#475569"] : a === "planlandi" ? ["#E0E7FF", LACIVERT] : a === "yolda" ? ["#DCFCE7", "#166534"] : ["#FFEDD5", "#9A3412"];
    return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${bg};color:${fg};font-size:10px;font-weight:bold;white-space:nowrap">${ASAMA_ADI[a]}</span>`;
  };

  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Aktif Müşteri", `${o.aktif} / ${o.musteri}`, "sevkiyatı ya da açık siparişi olan", LACIVERT)}${arasi}
    ${kutu("Yoldaki Sevkiyat", `${o.yolda}`, `${sayi(o.yoldaKont)} konteyner`, "#047857")}${arasi}
    ${kutu("Ödeme Bekleyen", `${o.odemeBekleyen}`, "gemisi kalkmış, konşimento serbest değil", "#B45309")}${arasi}
    ${kutu("Bugünkü Talimat", `${o.talimat}`, o.acil ? `${o.acil} acil` : "acil yok", o.acil ? "#B91C1C" : "#475569")}
  </tr></table>`;

  // 1) Departman talimatlari
  const depBolumleri = (["operasyon", "export", "execution"] as Departman[]).map((dep) => {
    const l = r.talimatlar.filter((t) => t.departman === dep);
    const sat = l.map((t, i) => `<tr style="${zebra(i)}">${td(rozet(t.seviye), "width:52px")}${td(`<b>${esc(t.musteri)}</b>${alt(t.dosya ? `<span style="font-family:monospace">${esc(t.dosya)}</span>` : "")}`)}${td(esc(t.metin))}</tr>`).join("");
    return `<div style="margin:12px 0 4px;font-size:12px;font-weight:bold;color:${LACIVERT}">${DEPARTMAN_ADI[dep]} <span style="font-weight:normal;color:#64748B">· ${l.length} talimat</span></div>${tablo(`${th("")}${th("Müşteri · Dosya")}${th("Talimat")}`, sat || bos(3, "Talimat yok."))}`;
  }).join("");

  // 2) Musteri kartlari
  const kartlar = r.aktifler.map((m) => {
    const sat = m.sevkiyatlar.map((s, i) => `<tr style="${zebra(i)}">${td(`<b style="font-family:monospace">${esc(s.dosya.dosya_no || "-")}</b>${alt(esc(s.dosya.varis_limani || ""))}`, "white-space:nowrap")}${td(`${esc(s.booking || "-")}${alt(esc(s.gemi || ""))}`)}${td(`${kisa(s.etd)}${alt(s.eta ? `ETA ${kisa(s.eta)}` : "")}`, "white-space:nowrap")}${td(`${s.konteyner || "-"}`, "text-align:right")}${td(asamaRozet(s.asama))}${td(s.etd && s.etd <= r.tarih ? (s.odemeAlindi ? `<span style="color:#047857">Alındı</span>${alt(esc(s.konsimento || ""))}` : `<b style="color:#B45309">Bekliyor</b>${alt(esc(s.konsimento || "girilmedi"))}`) : `<span style="color:#94A3B8">-</span>`, "white-space:nowrap")}</tr>`).join("");
    const sip = m.siparisler.map((p) => `<div style="font-size:12px;color:#1E293B;margin-top:4px">• Proforma <b style="font-family:monospace">${esc(p.proforma_no || "-")}</b> ${esc(p.urun || "")} · ${p.miktar_mt ? `${sayi(Number(p.miktar_mt))} MT` : "-"}${p.konteyner ? ` · ${p.konteyner} kont.` : ""} — <span style="color:${p.durum === "on_odeme_alindi" ? "#047857" : "#B45309"};font-weight:bold">${p.durum === "on_odeme_alindi" ? "ön ödeme alındı, rezervasyon bekliyor" : "onay / ön ödeme bekliyor"}</span>${p.proforma_tarihi ? ` <span style="color:#64748B">(${kisa(p.proforma_tarihi)})</span>` : ""}</div>`).join("");
    const konu = `${sirketAdi} — order status update ${trTarih(r.tarih)}`;
    const dugme = m.musteri.epostalar.length
      ? `<a href="${mailtoLink(m.musteri.epostalar, konu, m.musteriMetni)}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:12px;font-weight:bold;padding:7px 12px;border-radius:5px">Müşteriye özeti Outlook'ta hazırla</a><span style="font-size:11px;color:#64748B;margin-left:8px">${esc(m.musteri.epostalar.slice(0, 4).join(", "))}</span>`
      : `<span style="font-size:11px;color:#B45309">Kayıtlı e-posta yok — UNEX Satış &gt; firma kartından yetkili eklenmeli.</span>`;
    const ozetMetin = `<div style="margin-top:8px;padding:8px 10px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:4px;font-size:11px;color:#334155;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif">${esc(m.musteriMetni)}</div>`;
    return `<div style="margin-top:14px;border:1px solid #E2E8F0;border-left:4px solid ${LACIVERT};border-radius:4px;padding:10px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(m.musteri.ad)}</div><div style="font-size:11px;color:#64748B">${esc(m.ulke || "Ülke belirsiz")} · ${m.sevkiyatlar.length} sevkiyat · ${m.siparisler.length} açık proforma${m.talimatlar.length ? ` · ${m.talimatlar.length} talimat` : ""}</div></td>
      <td style="text-align:right;vertical-align:top">${m.talimatlar.some((t) => t.seviye === "acil") ? rozet("acil") : ""}</td></tr></table>
      ${m.sevkiyatlar.length ? `<div style="margin-top:8px">${tablo(`${th("Dosya · Varış")}${th("Booking · Gemi")}${th("ETD")}${th("Kont.", true)}${th("Durum")}${th("Ödeme")}`, sat)}</div>` : ""}
      ${sip}
      ${ozetMetin}
      <div style="margin-top:8px">${dugme}</div>
    </div>`;
  }).join("");

  // 3) Siparissiz musteriler
  const sRows = r.siparissizler.map((m, i) => `<tr style="${zebra(i)}">${td(`<b>${esc(m.musteri.ad)}</b>`)}${td(esc(m.ulke || "-"))}${td(kisa(m.sonSiparis), "white-space:nowrap")}${td(m.siparissizGun !== null ? `${m.siparissizGun} gün` : "-", "text-align:right;white-space:nowrap")}${td(esc(CRM_ADI[m.musteri.crm_asama || "yeni"] || m.musteri.crm_asama || "-"))}</tr>`).join("");

  // 4) Potansiyel
  const p = r.potansiyel;
  const pfRows = r.proformali.map((f, i) => `<tr style="${zebra(i)}">${td(`<b>${esc(f.firma)}</b>`)}${td(f.siparisler.map((s) => `<span style="font-family:monospace">${esc(s.proforma_no || "-")}</span>`).join("<br>"))}${td(`${f.mt ? `${sayi(f.mt)} MT` : "-"}${alt(f.konteyner ? `${f.konteyner} kont.` : "")}`, "text-align:right;white-space:nowrap")}${td(f.siparisler.some((s) => s.durum === "on_odeme_alindi") ? `<b style="color:#047857">Ön ödeme alındı</b>` : `<span style="color:#B45309">Onay / ön ödeme bekliyor</span>`)}${td(f.gun !== null ? `${f.gun} gün` : "-", "text-align:right;white-space:nowrap")}</tr>`).join("");
  const surecRows = p.surecte.slice(0, 15).map((f, i) => `<tr style="${zebra(i)}">${td(`<b>${esc(f.ad)}</b>`)}${td(esc(f.ulke || "-"))}${td(esc(CRM_ADI[f.crm_asama] || f.crm_asama))}${td(kisa(f.son_temas), "white-space:nowrap")}${td(f.sonraki_adim ? `${kisa(f.sonraki_adim)}${f.sonraki_adim < r.tarih ? ` <b style="color:#B91C1C">gecikti</b>` : f.sonraki_adim === r.tarih ? ` <b style="color:#B45309">bugün</b>` : ""}` : "-", "white-space:nowrap")}</tr>`).join("");
  const asamaMetni = Object.entries(p.asamalar).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${esc(CRM_ADI[a] || a)} ${n}`).join(" · ");
  const ulkeMetni = p.ulkeler.map((u) => `${esc(u.ulke)} ${u.adet}`).join(" · ");
  const pKutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:separate"><tr>
    ${kutu("Potansiyel Firma", sayi(p.toplam), "fuar listesi + gelen talepler", LACIVERT)}${arasi}
    ${kutu("Proforma Verilen", `${r.proformali.length}`, "henüz müşterimiz değil", YESIL)}${arasi}
    ${kutu("Süreçte", `${p.surecte.length}`, "sorgulandı / hatırlatma / cevap", "#B45309")}${arasi}
    ${kutu("Son 7 Gün Temas", `${p.temas7}`, `${r.gelenSayisi} gelen cevap (14 gün)`, "#475569")}
  </tr></table>`;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Müşteri Özeti</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="820" cellpadding="0" cellspacing="0" style="max-width:820px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${MUSTERI_OZET_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} Müşteri Özeti</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Departman talimatları · Müşteri durumu · Potansiyel</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(trTarih(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">${esc(oturumEtiketi)}</div></td>
  </tr></table>
  ${kutular}

  ${bolum("Departman talimatları", "Her satır bir iş: sorumlu departman yapar, gerekirse müşteriye aşağıdaki özetle bilgi verir.")}
  ${depBolumleri}

  ${bolum(`Müşteri özetleri · ${r.aktifler.length} aktif müşteri`, "Sevkiyatı yolda / planlı ya da açık proforması olan müşteriler; en acil üstte. Müşteri metni fiyat içermez.")}
  ${kartlar || `<div style="font-size:12px;color:#94A3B8;font-style:italic">Aktif müşteri yok.</div>`}

  ${bolum(`Şu an siparişi olmayan müşteriler · ${r.siparissizler.length}`, "En uzun süredir sipariş vermeyen üstte; UNEX Satış günlük görevleri bu listeden başlar.")}
  ${tablo(`${th("Müşteri")}${th("Ülke")}${th("Son dosya")}${th("Siparişsiz", true)}${th("Görüşme")}`, sRows || bos(5, "Hepsinin aktif siparişi var."))}

  ${bolum("Potansiyel müşteriler", `Aşamalar: ${asamaMetni || "-"}${ulkeMetni ? `<br>En çok: ${ulkeMetni}` : ""}`)}
  ${pKutular}
  <div style="margin:14px 0 4px;font-size:12px;font-weight:bold;color:${LACIVERT}">Proforma verilmiş, henüz müşterimiz olmayan firmalar <span style="font-weight:normal;color:#64748B">· ön ödemeli üstte</span></div>
  ${tablo(`${th("Firma")}${th("Proforma")}${th("Miktar", true)}${th("Durum")}${th("Bekleme", true)}`, pfRows || bos(5, "Yok."))}
  <div style="margin:14px 0 4px;font-size:12px;font-weight:bold;color:${LACIVERT}">Görüşme sürecindeki potansiyeller</div>
  ${tablo(`${th("Firma")}${th("Ülke")}${th("Aşama")}${th("Son temas")}${th("Sonraki adım")}`, surecRows || bos(5, "Süreçte potansiyel firma yok; UNEX Satış görevleri ilerledikçe burada görünür."))}

  <div style="margin-top:24px;text-align:center">
    <a href="${MUSTERI_OZET_URL}/pazar" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">UNEX Satış'ı aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Veriler ihracat dosyaları, rezervasyonlar, sipariş listesi ve UNEX Satış kayıtlarından anlık hesaplanır.<br>Ödeme: konşimento Telex / Seawaybill / Vesaik ise alındı sayılır (ETD-ETA ile aynı kural).<br>Müşteriye sistemden mail gitmez; "Outlook'ta hazırla" ile departmanınız gönderir. Her gün 08:00'de gönderilir.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
