/**
 * ANA PANEL - TEK IS LISTESI (23.11.2026). Saf hesap (veri / ag yok); test: tests/panel-is-listesi.test.ts.
 *
 * Kullanici: "Bu sayfa cok karisik dostum. Tek sayfa seklinde verebilmeliyiz. Renklendirme kurallari: acik sevkiyatlar,
 * rezervasyonu alinmislar acik sevkiyat olarak gorulmeli. Odeme bekleyenler gri, kocaman 'Odeme bekliyor' seklinde;
 * odeme gelince aktif hale gelecek." + "Bunlar otomatik belirlenemiyor mu" -> durum TAMAMEN mevcut kayitlardan:
 *
 *  - cutoff        (kirmizi) acik sevkiyat; belgesi verilmemis talimat / beyanname cut-off'u 0-3 gun icinde
 *                  (eski "Cut-Off Yaklasan" sekmesinin AYNI kurali: lib/panel-gorunum.ts panelFiltrele / isCutoffApproaching)
 *  - acik          (yesil)   rezervasyonlu acik dosya + Yukleme Plani'nda booking'i olup dosyasi acilmamis is emri
 *  - rez_bekliyor  (mavi)    rezervasyonsuz acik dosya + on odemesi alinmis, booking'i olmayan siparis
 *  - odeme         (gri)     Siparis Listesi "Onay bekleyen" (on odeme / imzali proforma isaretlenmedi;
 *                            panel_odeme_bekleyenleri). Isaretlenince kendiliginden rez_bekliyor olur.
 * Tekrar yok: booking'li is emri rezervasyonsuz bir dosyayi isaret ediyorsa dosya satiri gizlenir (is emri satiri
 * booking'iyle "Rezervasyon ekle" der); on odeme is emri rezervasyonsuz dosyayi isaret ediyorsa is emri gizlenir.
 * Odeme bekleyen proforma listede baska bir satirda varsa (dosya / is emri) tekrar gosterilmez.
 * Siralama: cutoff > acik > rez_bekliyor > odeme; grup icinde en yakin cut-off / en eski bekleyen ustte.
 *
 * 23.11.2026 (kullanici: "Ilk konteyneri alinan yani baslamis olarak gozukur. Sari olarak boyali ve en ustte konteyner
 * fazlalik siralamasina gore gozukmeli. O kismin alti ise ilk talimat cut-off kimin erkense ona gore siralanmali."):
 *  - basladi       (sari)    rezervasyonlu dosya; en az 1 konteyner ALINMIS (numarasi girilmis) ve dolu (DBA'li)
 *                            konteyner rezervasyon adedine ULASMAMIS = yuklemesi suruyor. Hepsi dolunca normal duruma
 *                            (acik / cutoff) doner; aksi halde evrak bekleyen dolu dosyalarin hepsi sari olurdu.
 *                            Sira: kalan (yuklenecek) konteyner cok olan ustte, esitse toplam, sonra talimat.
 *                            Cut-off'u yaklasiyorsa satir sari kalir, "cut-off yakin" notu ve Cut-off filtresinde gorunur.
 *  - Altinda cutoff + acik TEK sira: ilk (en erken) talimat cut-off'u ustte (talimat yoksa beyanname / ETD).
 */
import { isCutoffApproaching, talimatCutoffTamamMi, beyannameCutoffTamamMi } from "@/lib/cutoff-utils";
import { noParcala } from "@/lib/coklu-no";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";

export type ListeDurumu = "basladi" | "cutoff" | "acik" | "rez_bekliyor" | "odeme";
export type ListeFiltresi = "tumu" | "basladi" | "acik" | "cutoff" | "rez_bekliyor" | "odeme";

export const LISTE_FILTRELERI: { key: ListeFiltresi; label: string }[] = [
  { key: "tumu", label: "Tümü" },
  { key: "basladi", label: "Yükleme başladı" },
  { key: "acik", label: "Açık sevkiyat" },
  { key: "cutoff", label: "Cut-off yaklaşan" },
  { key: "rez_bekliyor", label: "Rezervasyon bekliyor" },
  { key: "odeme", label: "Ödeme bekliyor" },
];

export const DURUM_ETIKETI: Record<ListeDurumu, string> = {
  basladi: "Yükleme başladı", cutoff: "Cut-off yaklaşıyor", acik: "Açık sevkiyat", rez_bekliyor: "Rezervasyon bekliyor", odeme: "Ödeme bekliyor",
};

/** ?filtre= (eski degerler dahil: "rezervasyon" = rezervasyonsuz dosya -> rez_bekliyor). Bilinmeyen -> tumu. */
export function listeFiltresi(filtre: string | null | undefined, eski?: string | null): ListeFiltresi {
  const v = (filtre || eski || "").trim();
  if (v === "rezervasyon") return "rez_bekliyor";
  return v === "basladi" || v === "acik" || v === "cutoff" || v === "rez_bekliyor" || v === "odeme" ? v : "tumu";
}

export type OdemeBekleyen = {
  anahtar: string; kaynak: string | null; proforma_no: string | null; proforma_tarihi: string | null; musteri: string | null;
  urun: string | null; konteyner: number | null; miktar_mt: number | null; tutar: number | null; para_birimi: string | null;
  varis_limani: string | null; marka: string | null; paketleme: string | null;
};

const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const sayi = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function odemeBekleyenNormalle(r: Record<string, unknown> | null | undefined): OdemeBekleyen | null {
  const anahtar = metin(r?.anahtar);
  if (!r || !anahtar) return null;
  return {
    anahtar, kaynak: metin(r.kaynak), proforma_no: metin(r.proforma_no), proforma_tarihi: metin(r.proforma_tarihi), musteri: metin(r.musteri),
    urun: metin(r.urun), konteyner: sayi(r.konteyner), miktar_mt: sayi(r.miktar_mt), tutar: sayi(r.tutar), para_birimi: metin(r.para_birimi),
    varis_limani: metin(r.varis_limani), marka: metin(r.marka), paketleme: metin(r.paketleme),
  };
}

export function odemeBekleyenleriHazirla(veri: unknown): OdemeBekleyen[] {
  return (Array.isArray(veri) ? veri : []).map((x) => odemeBekleyenNormalle(x as Record<string, unknown>)).filter((x): x is OdemeBekleyen => x !== null);
}

/** Listede kullanilan dosya alanlari (Ana Panel'in DosyaWithRelations'i bunu karsilar). */
export type ListeDosyasi = {
  id: string; dosya_no: string | null; proforma_no: string | null; alici_firma: string | null; olusturma_tarihi?: string | null;
  konsimento_dosya_url?: string | null; draft_bl_dosya_url?: string | null; beyanname_dosya_url?: string | null;
  rezervasyonlar: { booking_no?: string | null; talimat_cutoff: string | null; beyanname_cutoff: string | null; gemi_kalkis_tarihi?: string | null; konteyner_adedi?: number | null }[];
  /** Alinan konteynerler (numarasi girilmis); dba_dosya_url = dolu (tartildi). Yoksa yukleme baslamamis sayilir. */
  konteynerler?: { dba_dosya_url?: string | null }[];
};

export type YuklemeDurumu = { toplam: number; alinan: number; dolu: number; kalan: number };

/** Rezervasyon adedi / alinan / dolu konteyner ve kalan (yuklenecek) sayi. */
export function yuklemeDurumu(d: ListeDosyasi): YuklemeDurumu {
  const toplam = d.rezervasyonlar.reduce((t, r) => t + (Number(r.konteyner_adedi) || 0), 0);
  const kont = d.konteynerler || [];
  const dolu = kont.filter((k) => !!k.dba_dosya_url).length;
  return { toplam, alinan: kont.length, dolu, kalan: Math.max(0, toplam - dolu) };
}

/** Yuklemesi suruyor: en az 1 konteyner alindi, dolu sayisi rezervasyon adedine ulasmadi. */
export function yuklemeBasladi(y: YuklemeDurumu): boolean {
  return y.alinan > 0 && y.toplam > 0 && y.dolu < y.toplam;
}

/** talimat: ilk talimat cut-off (ms; yoksa SONSUZ); cutoffYakin: durum sari olsa da cut-off 0-3 gun icinde. */
type OrtakAlan = { anahtar: string; zaman: number; talimat: number; cutoffYakin: boolean };
export type ListeOgesi<D extends ListeDosyasi> =
  | (OrtakAlan & { tur: "dosya"; durum: ListeDurumu; dosya: D; yukleme: YuklemeDurumu })
  | (OrtakAlan & { tur: "is_emri"; durum: ListeDurumu; isEmri: IsEmriSatiri })
  | (OrtakAlan & { tur: "odeme"; durum: "odeme"; odeme: OdemeBekleyen });

const SONSUZ = Number.MAX_SAFE_INTEGER;
/** "2026-11-29" (gun sonu) ya da zaman damgasi -> ms; okunamazsa SONSUZ (en alta). */
function zamanMs(v: string | null | undefined): number {
  if (!v) return SONSUZ;
  const t = Date.parse(v.length <= 10 ? `${v}T23:59:59Z` : v);
  return Number.isFinite(t) ? t : SONSUZ;
}
const enKucuk = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), SONSUZ);

/** Proforma anahtari: bosluk / buyuk-kucuk harf duyarsiz, revize eki R (UNEXEMT300926R) atilir. */
export function proformaAnahtari(no: string | null | undefined): string {
  return (no || "").replace(/\s/g, "").toUpperCase().replace(/(\d)R\d?$/, "$1");
}

/** Rezervasyonlu dosyanin durumu (cut-off kurali eski "Cut-Off Yaklasan" sekmesiyle ayni). */
export function dosyaDurumu(d: ListeDosyasi): ListeDurumu {
  if (d.rezervasyonlar.length === 0) return "rez_bekliyor";
  if (yuklemeBasladi(yuklemeDurumu(d))) return "basladi";
  return dosyaCutoffDurumu(d);
}

/** Yukleme durumundan bagimsiz cut-off rengi (rezervasyonlu dosya). */
export function dosyaCutoffDurumu(d: ListeDosyasi): "cutoff" | "acik" {
  const tamam = { talimat: talimatCutoffTamamMi(d), beyanname: beyannameCutoffTamamMi(d) };
  return d.rezervasyonlar.some((r) => isCutoffApproaching(r.talimat_cutoff, r.beyanname_cutoff, tamam)) ? "cutoff" : "acik";
}

/** Ilk (en erken) talimat cut-off'u; belge verilmis olsa da (siralama icin sabit tarih). */
const ilkTalimat = (d: ListeDosyasi) => enKucuk(d.rezervasyonlar.map((r) => zamanMs(r.talimat_cutoff)));

function dosyaZamani(d: ListeDosyasi, durum: ListeDurumu): number {
  if (durum === "rez_bekliyor") return zamanMs(d.olusturma_tarihi || null);
  const talimatTamam = talimatCutoffTamamMi(d);
  const beyanTamam = beyannameCutoffTamamMi(d);
  const acik = enKucuk(d.rezervasyonlar.flatMap((r) => [talimatTamam ? SONSUZ : zamanMs(r.talimat_cutoff), beyanTamam ? SONSUZ : zamanMs(r.beyanname_cutoff)]));
  return acik !== SONSUZ ? acik : enKucuk(d.rezervasyonlar.map((r) => zamanMs(r.gemi_kalkis_tarihi)));
}

/** Booking'li is emri: belgesi olmadigi icin iki cut-off da acik sayilir. */
export function isEmriDurumu(s: IsEmriSatiri): ListeDurumu {
  if (s.tur === "on_odeme") return "rez_bekliyor";
  return isCutoffApproaching(s.talimat_cutoff, s.beyan_cutoff) ? "cutoff" : "acik";
}

function isEmriZamani(s: IsEmriSatiri): number {
  if (s.tur === "on_odeme") return zamanMs(s.on_odeme_tarihi);
  const c = enKucuk([zamanMs(s.talimat_cutoff), zamanMs(s.beyan_cutoff)]);
  return c !== SONSUZ ? c : zamanMs(s.etd);
}

/** "Rezervasyon ekle" aksiyonunun isaret ettigi dosya (/dosya/<id>?...). */
export function aksiyonDosyasi(s: IsEmriSatiri): string | null {
  if (s.aksiyon.tur !== "rezervasyon") return null;
  const m = s.aksiyon.href.match(/^\/dosya\/([^?/#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** cutoff ve acik ayni grup: aralarinda ilk talimat cut-off'u belirler. */
const GRUP_SIRASI: Record<ListeDurumu, number> = { basladi: 0, cutoff: 1, acik: 1, rez_bekliyor: 2, odeme: 3 };
const musteriOf = <D extends ListeDosyasi>(o: ListeOgesi<D>) =>
  (o.tur === "dosya" ? o.dosya.alici_firma : o.tur === "is_emri" ? o.isEmri.musteri : o.odeme.musteri) || "";

export function isListesiKur<D extends ListeDosyasi>(
  dosyalar: D[],
  isEmirleri: { rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[] } | null,
  odemeler: OdemeBekleyen[] | null,
): ListeOgesi<D>[] {
  const dosyaIdleri = new Set(dosyalar.map((d) => d.id));
  const rezervasyonlu = isEmirleri?.rezervasyonlu || [];
  const onOdeme = isEmirleri?.onOdeme || [];
  // Booking'li is emrinin isaret ettigi rezervasyonsuz dosya: is emri satiri temsil eder
  const gizliDosya = new Set(rezervasyonlu.map(aksiyonDosyasi).filter((x): x is string => !!x && dosyaIdleri.has(x)));

  const ogeler: ListeOgesi<D>[] = [];
  for (const d of dosyalar) {
    if (gizliDosya.has(d.id)) continue;
    const durum = dosyaDurumu(d);
    const cutoffYakin = durum === "cutoff" || (durum === "basladi" && dosyaCutoffDurumu(d) === "cutoff");
    ogeler.push({ tur: "dosya", anahtar: `dosya:${d.id}`, durum, dosya: d, yukleme: yuklemeDurumu(d), cutoffYakin,
      zaman: dosyaZamani(d, durum === "basladi" ? "acik" : durum), talimat: durum === "rez_bekliyor" ? SONSUZ : ilkTalimat(d) });
  }
  for (const s of rezervasyonlu) {
    const durum = isEmriDurumu(s);
    ogeler.push({ tur: "is_emri", anahtar: `is:${s.anahtar}`, durum, isEmri: s, zaman: isEmriZamani(s), talimat: zamanMs(s.talimat_cutoff), cutoffYakin: durum === "cutoff" });
  }
  for (const s of onOdeme) {
    const hedef = aksiyonDosyasi(s);
    if (hedef && dosyaIdleri.has(hedef)) continue; // rezervasyonsuz dosya satiri zaten "Rezervasyon bekliyor"
    ogeler.push({ tur: "is_emri", anahtar: `is:${s.anahtar}`, durum: "rez_bekliyor", isEmri: s, zaman: isEmriZamani(s), talimat: SONSUZ, cutoffYakin: false });
  }
  const gorulen = new Set<string>();
  for (const o of ogeler) {
    const nolar = o.tur === "dosya" ? noParcala(o.dosya.proforma_no) : o.tur === "is_emri" ? [o.isEmri.proforma_no || ""] : [];
    nolar.forEach((n) => { const k = proformaAnahtari(n); if (k) gorulen.add(k); });
  }
  for (const p of odemeler || []) {
    const k = proformaAnahtari(p.proforma_no);
    if (k && gorulen.has(k)) continue;
    ogeler.push({ tur: "odeme", anahtar: `odeme:${p.anahtar}`, durum: "odeme", odeme: p, zaman: zamanMs(p.proforma_tarihi), talimat: SONSUZ, cutoffYakin: false });
  }
  const yuk = (o: ListeOgesi<D>) => (o.tur === "dosya" ? o.yukleme : { kalan: 0, toplam: 0 });
  return ogeler.sort((a, b) => {
    const g = GRUP_SIRASI[a.durum] - GRUP_SIRASI[b.durum];
    if (g) return g;
    if (a.durum === "basladi") {
      const ya = yuk(a), yb = yuk(b);
      const f = yb.kalan - ya.kalan || yb.toplam - ya.toplam;
      if (f) return f;
    }
    if (GRUP_SIRASI[a.durum] <= 1) {
      const t = a.talimat - b.talimat;
      if (t) return t;
    }
    return a.zaman - b.zaman || musteriOf(a).localeCompare(musteriOf(b), "tr");
  });
}

/** cutoffYakin: sari (yuklemesi suren) satirin cut-off'u da yaklasiyorsa Cut-off filtresinde de gorunur. */
export function filtreyeUyar(durum: ListeDurumu, filtre: ListeFiltresi, cutoffYakin = false): boolean {
  if (filtre === "tumu") return true;
  if (filtre === "acik") return durum === "acik" || durum === "cutoff" || durum === "basladi";
  if (filtre === "cutoff") return durum === "cutoff" || cutoffYakin;
  return durum === filtre;
}

export function listeSayilari<D extends ListeDosyasi>(ogeler: ListeOgesi<D>[]): Record<ListeFiltresi, number> {
  const say: Record<ListeFiltresi, number> = { tumu: ogeler.length, basladi: 0, acik: 0, cutoff: 0, rez_bekliyor: 0, odeme: 0 };
  for (const o of ogeler) for (const f of ["basladi", "acik", "cutoff", "rez_bekliyor", "odeme"] as const) if (filtreyeUyar(o.durum, f, o.cutoffYakin)) say[f] += 1;
  return say;
}

const temiz = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");

/** Arama: musteri, proforma, dosya no, booking (harf / rakam disi ve aksan duyarsiz). */
export function listeAra<D extends ListeDosyasi>(ogeler: ListeOgesi<D>[], aranan: string): ListeOgesi<D>[] {
  const t = temiz(aranan || "");
  if (!t) return ogeler;
  return ogeler.filter((o) => {
    const alanlar = o.tur === "dosya"
      ? [o.dosya.alici_firma, o.dosya.proforma_no, o.dosya.dosya_no, ...o.dosya.rezervasyonlar.map((r) => r.booking_no || null)]
      : o.tur === "is_emri" ? [o.isEmri.musteri, o.isEmri.proforma_no, o.isEmri.booking_no]
      : [o.odeme.musteri, o.odeme.proforma_no];
    return alanlar.some((x) => !!x && temiz(x).includes(t));
  });
}

/** Takvim gunu (Istanbul) olarak kac gundur: on odeme / proforma tarihinden bugune. */
export function gundur(iso: string | null | undefined, simdi: number = Date.now()): number | null {
  if (!iso) return null;
  const gun = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
  const bas = iso.length <= 10 ? iso : gun(Date.parse(iso));
  const fark = (Date.parse(`${gun(simdi)}T00:00:00Z`) - Date.parse(`${bas}T00:00:00Z`)) / 86400000;
  return Number.isFinite(fark) ? Math.max(0, Math.round(fark)) : null;
}
