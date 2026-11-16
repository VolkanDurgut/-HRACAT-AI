/**
 * OPERASYON BAĞLANTILARI (16.11.2026) — istemci tarafı saf yardımcılar. Veri: migration
 * 20261116230000_operasyon_baglantilari.sql (rezervasyon_onerisi, navlun_liman_referansi RPC'leri).
 * Hiçbiri kayıt yazmaz; öneriler yalnız kullanıcı "Doldur" / "Kullan" derse forma girer.
 */

export type PlanOnerisi = {
  booking_no: string | null; gemi_adi: string | null; sefer_no: string | null; acente_ismi: string | null;
  gemi_kalkis_tarihi: string | null; talimat_cutoff: string | null; beyanname_cutoff: string | null;
  ekipman_alim_tarihi: string | null; ardiyesiz_giris: string | null; yuklenme_limani: string | null; varis_limani: string | null;
  konteyner_adedi: number | null; musteri: string | null; navlun_tutari: number | null; lokal_masraf_tutari: number | null; navlun_para: string | null;
};
export type NavlunAnlasmasi = {
  tutar: number; para: string; tarih: string; acente: string | null; armator: string | null; konu: string | null;
  eslesme: "booking" | "rezervasyon" | "liman";
};
export type RezervasyonOnerisi = { plan: PlanOnerisi | null; navlun: NavlunAnlasmasi[] };

const metin = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const sayi = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const nesne = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** rezervasyon_onerisi() cevabını güvenli tipe çevirir. */
export function rezervasyonOnerisiOku(ham: unknown): RezervasyonOnerisi {
  const h = nesne(ham);
  const p = h.plan && typeof h.plan === "object" ? nesne(h.plan) : null;
  const plan: PlanOnerisi | null = p
    ? {
        booking_no: metin(p.booking_no), gemi_adi: metin(p.gemi_adi), sefer_no: metin(p.sefer_no), acente_ismi: metin(p.acente_ismi),
        gemi_kalkis_tarihi: metin(p.gemi_kalkis_tarihi), talimat_cutoff: metin(p.talimat_cutoff), beyanname_cutoff: metin(p.beyanname_cutoff),
        ekipman_alim_tarihi: metin(p.ekipman_alim_tarihi), ardiyesiz_giris: metin(p.ardiyesiz_giris), yuklenme_limani: metin(p.yuklenme_limani),
        varis_limani: metin(p.varis_limani), konteyner_adedi: sayi(p.konteyner_adedi), musteri: metin(p.musteri),
        navlun_tutari: sayi(p.navlun_tutari), lokal_masraf_tutari: sayi(p.lokal_masraf_tutari), navlun_para: metin(p.navlun_para),
      }
    : null;
  const navlun = (Array.isArray(h.navlun) ? h.navlun : [])
    .map((x) => nesne(x))
    .map((x) => ({
      tutar: sayi(x.tutar) ?? 0, para: (metin(x.para) || "USD").toUpperCase(), tarih: metin(x.tarih) || "",
      acente: metin(x.acente), armator: metin(x.armator), konu: metin(x.konu),
      eslesme: (x.eslesme === "booking" || x.eslesme === "rezervasyon" ? x.eslesme : "liman") as NavlunAnlasmasi["eslesme"],
    }))
    .filter((x) => x.tutar > 0);
  return { plan, navlun };
}

/** Formun öneri ile doldurulabilecek alanları (rezervasyon formu emptyForm ile aynı adlar). */
export type OneriFormu = {
  booking_no: string; gemi_adi: string; sefer_no: string; acente_ismi: string; gemi_kalkis_tarihi: string;
  talimat_cutoff: string; talimat_cutoff_saat: string; beyanname_cutoff: string; beyanname_cutoff_saat: string;
  ekipman_alim_tarihi: string; ardiyesiz_giris: string; yuklenme_limani: string; varis_limani: string; konteyner_adedi: number;
  navlun_tutari: string; lokal_masraf_tutari: string;
};

/** "2026-11-13T17:00:00+00:00" -> ["2026-11-13", "17:00"]. Formun kendi okuma kuralıyla AYNI (buildFormFromRez):
 *  saat, kayıttaki saat olarak alınır; dönüştürülmez. Saat 00:00 ise boş bırakılır (planda saat yoktur). */
export function tarihSaatAyir(v: string | null): [string, string] {
  if (!v) return ["", ""];
  const [tarih, kalan] = v.split("T");
  const saat = kalan ? kalan.slice(0, 5) : "";
  return [tarih || "", saat === "00:00" ? "" : saat];
}

const sayiMetni = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Plandan YALNIZ formda BOŞ olan alanlar için öneri üretir (kullanıcının yazdığı hiçbir şey ezilmez).
 * Navlun / lokal masraf yalnız para birimi dosyanınkiyle aynıysa önerilir.
 */
export function bosAlanOnerileri(form: OneriFormu, plan: PlanOnerisi | null, dosyaParaBirimi: string | null | undefined): Partial<OneriFormu> {
  if (!plan) return {};
  const o: Partial<OneriFormu> = {};
  const bos = (v: string | number) => (typeof v === "number" ? !v : !v.trim());
  const koy = <K extends keyof OneriFormu>(k: K, v: OneriFormu[K] | null | undefined) => {
    if (v === null || v === undefined || v === "" || v === 0) return;
    if (bos(form[k])) o[k] = v;
  };
  koy("gemi_adi", plan.gemi_adi?.toUpperCase());
  koy("sefer_no", plan.sefer_no?.toUpperCase());
  koy("acente_ismi", plan.acente_ismi?.toUpperCase());
  koy("yuklenme_limani", plan.yuklenme_limani?.toUpperCase());
  koy("gemi_kalkis_tarihi", plan.gemi_kalkis_tarihi?.slice(0, 10));
  koy("ekipman_alim_tarihi", plan.ekipman_alim_tarihi?.slice(0, 10));
  koy("ardiyesiz_giris", plan.ardiyesiz_giris?.slice(0, 10));
  koy("konteyner_adedi", plan.konteyner_adedi ?? undefined);
  const [tT, tS] = tarihSaatAyir(plan.talimat_cutoff);
  if (bos(form.talimat_cutoff)) { koy("talimat_cutoff", tT); if (tT && bos(form.talimat_cutoff_saat)) koy("talimat_cutoff_saat", tS); }
  const [bT, bS] = tarihSaatAyir(plan.beyanname_cutoff);
  if (bos(form.beyanname_cutoff)) { koy("beyanname_cutoff", bT); if (bT && bos(form.beyanname_cutoff_saat)) koy("beyanname_cutoff_saat", bS); }
  const ayniPara = (plan.navlun_para || "USD").toUpperCase() === (dosyaParaBirimi || "USD").toUpperCase();
  if (ayniPara) {
    if (plan.navlun_tutari && plan.navlun_tutari > 0) koy("navlun_tutari", sayiMetni(plan.navlun_tutari));
    if (plan.lokal_masraf_tutari && plan.lokal_masraf_tutari > 0) koy("lokal_masraf_tutari", sayiMetni(plan.lokal_masraf_tutari));
  }
  return o;
}

export const ESLESME_METNI: Record<NavlunAnlasmasi["eslesme"], string> = {
  booking: "bu booking'in maili",
  rezervasyon: "rezervasyon talebi (aynı konteyner adedi)",
  liman: "aynı liman",
};

// ---------------------------------------------------------------------------------------------------------------
// Proforma: limanın güncel navlunu
export type LimanTeklifi = { acente: string | null; armator: string | null; tutar: number; tarih: string; lokal_dahil: boolean | null; free_time_gun: number | null };
export type LimanReferansi = { liman: string | null; teklifler: LimanTeklifi[]; anlasma: { tutar: number; tarih: string; acente: string | null; armator: string | null } | null };

export function limanReferansiOku(ham: unknown): LimanReferansi {
  const h = nesne(ham);
  const teklifler = (Array.isArray(h.teklifler) ? h.teklifler : []).map((x) => nesne(x)).map((x) => ({
    acente: metin(x.acente), armator: metin(x.armator), tutar: sayi(x.tutar) ?? 0, tarih: metin(x.tarih) || "",
    lokal_dahil: typeof x.lokal_dahil === "boolean" ? x.lokal_dahil : null, free_time_gun: sayi(x.free_time_gun),
  })).filter((x) => x.tutar > 0).sort((a, b) => a.tutar - b.tutar);
  const a = h.anlasma && typeof h.anlasma === "object" ? nesne(h.anlasma) : null;
  const anlasma = a && (sayi(a.tutar) ?? 0) > 0 ? { tutar: sayi(a.tutar) as number, tarih: metin(a.tarih) || "", acente: metin(a.acente), armator: metin(a.armator) } : null;
  return { liman: metin(h.liman), teklifler, anlasma };
}

/**
 * Proforma teslim ifadesinden varış limanı: "CIF DJIBOUTI PORT BASIS" -> "DJIBOUTI".
 * SQL siparis_listesi_veri ile AYNI kural: başta incoterm, sonda BASIS atılır, " PORT"tan öncesi alınır.
 * Navlunu alıcı ödüyorsa (FOB / FCA / FAS / EXW) ya da incoterm yoksa null (proformada navlun yok).
 */
export function teslimdenVarisLimani(teslim: string | null | undefined): string | null {
  const s = (teslim || "").trim();
  const m = /^(CFR|CIF|CPT|CIP|DAP|DDP|CNF|C&F)\s+(.+)$/i.exec(s);
  if (!m) return null;
  const govde = m[2].replace(/\s+BASIS\s*$/i, "");
  const i = govde.toUpperCase().indexOf(" PORT");
  const liman = (i >= 0 ? govde.slice(0, i) : govde).replace(/[,.;]+$/, "").trim();
  return liman.length >= 3 ? liman : null;
}
