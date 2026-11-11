/**
 * SIPARIS LISTESI + YUKLEME PLANI - tipler ve saf yardimcilar (11.11.2026). Veri yok.
 * Kaynak: siparis_listesi() / yukleme_plani() RPC (migration 20261110160000 + 20261110170000 + 20261111090000).
 * Liste ve plan veritabaninda KOPYALANMAZ, her okumada proforma / dosya / rezervasyondan canli hesaplanir.
 */

export type SiparisDurum = "onay_bekliyor" | "on_odeme_alindi" | "rezervasyonlu" | "sevk_edildi" | "bl_eksik" | "iptal";

export type SiparisSatiri = {
  anahtar: string;
  kaynak: "excel" | "sistem";
  sira: number | null;
  proforma_no: string | null;
  proforma_tarihi: string | null;
  firma: string | null;
  urun: string | null;
  birim_fiyat: number | null;
  miktar_mt: number | null;
  tutar: number | null;
  para_birimi: string | null;
  konteyner: number | null;
  liman: string | null;
  bl_no: string | null;
  marka: string | null;
  paketleme: string | null;
  durum: SiparisDurum;
  on_odeme: boolean;
  on_odeme_tarihi: string | null;
  dosya_no: string | null;
  booking_no: string | null;
  etd: string | null;
  benzer: string | null;
};

export type PlanKalemi = { cinsi: string | null; konteyner: number | null; cuval_markasi: string | null; ambalaj: string | null };

export type PlanSatiri = {
  anahtar: string;
  kaynak: "excel" | "sistem";
  hafta: number | null;
  yil: number | null;
  etd: string | null;
  booking_no: string | null;
  musteri: string | null;
  cinsi: string | null;
  konteyner: number | null;
  varis_limani: string | null;
  cuval_markasi: string | null;
  ambalaj: string | null;
  acente: string | null;
  liman: string | null;
  ekipman: string | null;
  bos_ekipman_tarihi: string | null;
  ekipman_alim_yeri: string | null;
  ardiyesiz_giris: string | null;
  talimat_cutoff: string | null;
  beyan_cutoff: string | null;
  gemi: string | null;
  sefer: string | null;
  navlun: number | null;
  lokal: number | null;
  navlun_para: string | null;
  dosya_no: string | null;
  proforma_no: string | null;
  /** Urun kalemleri (Excel'de booking altindaki ikinci urun satiri); KON.AD. = toplam */
  kalemler: PlanKalemi[] | null;
  /** Excel'deki hafta basligi aynen: "46.HAFTA (08 KASIM - 14 KASIM)" */
  hafta_baslik: string | null;
  sira: number | null;
};

export const DURUM_ADI: Record<SiparisDurum, string> = {
  onay_bekliyor: "Onay bekliyor",
  on_odeme_alindi: "Ön ödeme alındı",
  rezervasyonlu: "Rezervasyonlu",
  sevk_edildi: "Sevk edildi",
  bl_eksik: "BL eksik",
  iptal: "İptal",
};

/** Acik = henuz sevk edilmemis ya da BL'i eksik (takip gerektiren). */
export const ACIK_DURUMLAR: SiparisDurum[] = ["onay_bekliyor", "on_odeme_alindi", "rezervasyonlu", "bl_eksik"];
/** On odeme yalniz rezervasyon oncesi asamada degistirilebilir (sonrasi zaten odeme alinmis kabul). */
export const ON_ODEME_DEGISIR: SiparisDurum[] = ["onay_bekliyor", "on_odeme_alindi"];

const sayi = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function siparisNormalize(r: Record<string, unknown>): SiparisSatiri {
  return {
    ...(r as unknown as SiparisSatiri),
    sira: sayi(r.sira), birim_fiyat: sayi(r.birim_fiyat), miktar_mt: sayi(r.miktar_mt), tutar: sayi(r.tutar), konteyner: sayi(r.konteyner),
    on_odeme: r.on_odeme === true,
  };
}

export function planNormalize(r: Record<string, unknown>): PlanSatiri {
  return {
    ...(r as unknown as PlanSatiri), hafta: sayi(r.hafta), yil: sayi(r.yil), konteyner: sayi(r.konteyner), navlun: sayi(r.navlun), lokal: sayi(r.lokal),
    sira: sayi(r.sira), hafta_baslik: typeof r.hafta_baslik === "string" && r.hafta_baslik.trim() ? r.hafta_baslik.replace(/\s+/g, " ").trim() : null,
    kalemler: Array.isArray(r.kalemler) ? (r.kalemler as PlanKalemi[]) : null,
  };
}

const AYLAR = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

/**
 * Lojistigin hafta kurali (yukleme plani Excel'i): haftalar PAZAR baslar, 1. hafta 1 Ocak'i iceren haftadir
 * (Excel WEEKNUM(tarih;1)). Ornek 2026: 46. hafta = 08 - 14 Kasim.
 */
export function haftaNo(iso: string): { hafta: number; yil: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const gun = Math.round((Date.UTC(y, Number(m[2]) - 1, Number(m[3])) - Date.UTC(y, 0, 1)) / 86400000);
  const ocak1 = new Date(Date.UTC(y, 0, 1)).getUTCDay(); // 0 = Pazar
  return { hafta: Math.floor((gun + ocak1) / 7) + 1, yil: y };
}

/** "46.HAFTA (08 KASIM - 14 KASIM)" (Pazar - Cumartesi; yil sinirinda kirpilir) */
export function haftaEtiketi(hafta: number, yil: number): string {
  const ocak1 = new Date(Date.UTC(yil, 0, 1)).getUTCDay();
  const basGun = Math.max(0, (hafta - 1) * 7 - ocak1);
  const bitGun = Math.min((hafta - 1) * 7 - ocak1 + 6, (yil % 4 === 0 && (yil % 100 !== 0 || yil % 400 === 0) ? 365 : 364));
  const f = (g: number) => { const d = new Date(Date.UTC(yil, 0, 1 + g)); return `${String(d.getUTCDate()).padStart(2, "0")} ${AYLAR[d.getUTCMonth()]}`; };
  return `${hafta}.HAFTA (${f(basGun)} - ${f(bitGun)})`;
}

export type PlanHaftasi = { anahtar: string; hafta: number | null; yil: number | null; etiket: string | null };

/**
 * Satirin haftasi. Excel'den gelen satirda operasyonun koydugu hafta (ETD'den yeniden hesaplanmaz; ETD sonraki
 * haftada olsa bile yukleme o haftadadir). Sistemden gelen (Excel'de olmayan rezervasyon) satirda ETD'den.
 */
export function planHaftasi(p: Pick<PlanSatiri, "kaynak" | "hafta" | "yil" | "etd" | "hafta_baslik">): PlanHaftasi {
  if (p.kaynak === "excel" && p.hafta && p.yil) return { anahtar: `${p.yil}|${p.hafta}`, hafta: p.hafta, yil: p.yil, etiket: p.hafta_baslik };
  const h = p.etd ? haftaNo(p.etd) : null;
  if (h) return { anahtar: `${h.yil}|${h.hafta}`, hafta: h.hafta, yil: h.yil, etiket: null };
  if (p.hafta && p.yil) return { anahtar: `${p.yil}|${p.hafta}`, hafta: p.hafta, yil: p.yil, etiket: p.hafta_baslik };
  return { anahtar: "?", hafta: null, yil: null, etiket: null };
}

export type PlanBlogu = { anahtar: string; etiket: string; yil: number | null; hafta: number | null; satirlar: PlanSatiri[]; konteyner: number };

/** Hafta bloklari (eski -> yeni). Blok basligi: o haftanin Excel basligi, yoksa kurala gore hesaplanan. */
export function planBloklari(liste: PlanSatiri[]): PlanBlogu[] {
  const harita = new Map<string, PlanBlogu>();
  for (const p of liste) {
    const h = planHaftasi(p);
    let b = harita.get(h.anahtar);
    if (!b) { b = { anahtar: h.anahtar, etiket: "", yil: h.yil, hafta: h.hafta, satirlar: [], konteyner: 0 }; harita.set(h.anahtar, b); }
    if (!b.etiket && h.etiket) b.etiket = h.etiket;
    b.satirlar.push(p);
    b.konteyner += p.konteyner || 0;
  }
  const bloklar = Array.from(harita.values());
  for (const b of bloklar) {
    if (!b.etiket) b.etiket = b.hafta && b.yil ? haftaEtiketi(b.hafta, b.yil) : "HAFTA BELİRSİZ (ETD YOK)";
    b.satirlar = planSirala(b.satirlar);
  }
  return bloklar.sort((a, b) => (a.yil ?? 9999) - (b.yil ?? 9999) || (a.hafta ?? 99) - (b.hafta ?? 99));
}

export function trTarih(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Bugun (Istanbul) YYYY-MM-DD */
export function bugunIst(simdi = new Date()): string {
  return new Date(simdi.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

export type SiparisOzeti = { acikSiparis: number; acikMt: number; acikKont: number; onay: number; onOdeme: number; rezervasyonlu: number; blEksik: number; olasiTekrar: number };

export function siparisOzeti(liste: SiparisSatiri[]): SiparisOzeti {
  const acik = liste.filter((s) => ACIK_DURUMLAR.includes(s.durum));
  return {
    acikSiparis: acik.length,
    acikMt: Math.round(acik.reduce((t, s) => t + (s.miktar_mt || 0), 0)),
    acikKont: acik.reduce((t, s) => t + (s.konteyner || 0), 0),
    onay: liste.filter((s) => s.durum === "onay_bekliyor").length,
    onOdeme: liste.filter((s) => s.durum === "on_odeme_alindi").length,
    rezervasyonlu: liste.filter((s) => s.durum === "rezervasyonlu").length,
    blEksik: liste.filter((s) => s.durum === "bl_eksik").length,
    olasiTekrar: liste.filter((s) => s.benzer && s.kaynak === "sistem").length,
  };
}

/** Listeleme sirasi: Excel sirasi (eski -> yeni), ardindan sistemden gelenler proforma tarihine gore. */
export function siparisSirala(liste: SiparisSatiri[]): SiparisSatiri[] {
  return [...liste].sort((a, b) => {
    const ka = a.sira ?? 100000, kb = b.sira ?? 100000;
    if (ka !== kb) return ka - kb;
    return (a.proforma_tarihi || "").localeCompare(b.proforma_tarihi || "") || (a.proforma_no || "").localeCompare(b.proforma_no || "");
  });
}

/** Hafta ici sira: Excel'deki sira (operasyonun dizdigi gibi), ardindan sistemden gelenler ETD'ye gore. */
export function planSirala(liste: PlanSatiri[]): PlanSatiri[] {
  return [...liste].sort((a, b) => (a.sira ?? 1e9) - (b.sira ?? 1e9) || (a.etd || "9999").localeCompare(b.etd || "9999") || (a.booking_no || "").localeCompare(b.booking_no || ""));
}

/** Saat "HH:MM" (cut-off; yerel saat UTC etiketiyle saklanir). 00:00 -> bos. */
export function saat(iso: string | null): string {
  const m = iso ? iso.match(/[T ](\d{2}):(\d{2})/) : null;
  return m && !(m[1] === "00" && m[2] === "00") ? `${m[1]}:${m[2]}` : "";
}

/** Satirin kalemleri (yoksa ana satirdan tek kalem) */
export function planKalemleri(p: PlanSatiri): PlanKalemi[] {
  if (p.kalemler && p.kalemler.length) return p.kalemler;
  return [{ cinsi: p.cinsi, konteyner: p.konteyner, cuval_markasi: p.cuval_markasi, ambalaj: p.ambalaj }];
}
