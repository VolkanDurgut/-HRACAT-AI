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
  return { ...(r as unknown as PlanSatiri), hafta: sayi(r.hafta), yil: sayi(r.yil), konteyner: sayi(r.konteyner), navlun: sayi(r.navlun), lokal: sayi(r.lokal) };
}

/**
 * Yukleme planindaki hafta: lojistigin Excel'indeki kural - 1. hafta = 1-7 Ocak, 2. hafta = 8-14 Ocak ...
 * (ISO hafta DEGIL). ETD varsa ondan hesaplanir, yoksa Excel'deki hafta kullanilir.
 */
export function planHaftasi(etd: string | null, yedekHafta: number | null, yedekYil: number | null): { hafta: number | null; yil: number | null } {
  if (etd && /^\d{4}-\d{2}-\d{2}/.test(etd)) {
    const [y, m, g] = etd.slice(0, 10).split("-").map(Number);
    const gun = Math.round((Date.UTC(y, m - 1, g) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    return { hafta: Math.floor((gun - 1) / 7) + 1, yil: y };
  }
  return { hafta: yedekHafta, yil: yedekYil };
}

const AYLAR = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

/** "46.HAFTA (12 KASIM - 18 KASIM)" */
export function haftaEtiketi(hafta: number, yil: number): string {
  const bas = new Date(Date.UTC(yil, 0, 1 + (hafta - 1) * 7));
  const bit = new Date(Date.UTC(yil, 0, 7 + (hafta - 1) * 7));
  const f = (d: Date) => `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]}`;
  return `${hafta}.HAFTA (${f(bas)} - ${f(bit)})`;
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

export function planSirala(liste: PlanSatiri[]): PlanSatiri[] {
  return [...liste].sort((a, b) => (a.etd || "9999").localeCompare(b.etd || "9999") || (a.booking_no || "").localeCompare(b.booking_no || ""));
}
