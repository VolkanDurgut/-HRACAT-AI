/**
 * PAZAR - Yonetici paneli hesaplari (16.11.2026). SAF modul (DOM / Supabase yok; test edilebilir).
 *
 * Kullanici: "Pazar sekmesindeki gorunum bana hicbir sey ifade etmiyor. 'Surecteki firmalar 28 firma · sonraki adim
 * tarihine gore' bunu bu sekilde gormek bize ne sagliyor?" -> Panel yoneticinin dort sorusunu cevaplar:
 *  1) Bugun kime ne yapilmali?      -> aksiyonlar(): cevap yazan / teklif isteyen / maildeki siparis sinyali /
 *                                      islenmeden kalan gorev
 *  2) Ekip ne kadar ulasti, ne dondu? -> ekipOzeti(): kisi basina gorev -> islenen -> ulasilan -> cevap -> teklif -> siparis
 *  3) Surec nerede tikaniyor?        -> huni(): asama basina firma sayisi (tiklayinca liste)
 *  4) Hangi ulkede ne durumdayiz?    -> ulkeOzeti(): musteri / potansiyel / ulasilan / cevap
 * "Ulasilan" = sorgulama ya da hatirlatma temasi yapilmis firma. "Cevap" = ilk temastan SONRA arsivden yakalanan
 * cevap maili (pazar_gelenler, tur = cevap) ya da elle girilen sonuc (cevap / teklif / siparis).
 */
import type { PazarEkip, PazarFirma, PazarGelen, PazarTemas, TakipGorev } from "@/lib/pazar/veri";

export type AksiyonTuru = "cevap" | "oneri" | "teklif" | "islenmedi";
export type Aksiyon = {
  tur: AksiyonTuru;
  firma_id: string;
  /** ISO tarih (siralama + ekranda). */
  tarih: string;
  /** Gorevin atandigi ekip kodu (biliniyorsa). */
  kim: string | null;
  aciklama: string;
  detay: string | null;
};
export type EkipOzeti = {
  kod: string;
  ad: string;
  bugunToplam: number;
  bugunIslenen: number;
  gorev: number;
  islenen: number;
  atlanan: number;
  islenmeyen: number;
  ulasilan: number;
  cevap: number;
  teklif: number;
  siparis: number;
};
export type HuniAsamasi = { kod: string; ad: string; adet: number; firmaIdleri: string[]; yan?: boolean };
export type UlkeSatiri = { ulke: string; musteri: number; potansiyel: number; epostali: number; ulasilan: number; cevap: number; sonTemas: string | null };

const ULASMA = new Set<PazarTemas["adim"]>(["sorgulama", "hatirlatma1", "hatirlatma2"]);
const OLUMLU_ASAMA = new Set(["cevap", "teklif", "siparis"]);
const ONERI_ADI: Record<string, string> = { teklif: "teklif", siparis: "sipariş", ilgilenmiyor: "ilgilenmiyor" };

const zaman = (t: string) => Date.parse(t.length === 10 ? `${t}T00:00:00+03:00` : t);

/** Firma basina ilk ulasma zamani, son temas zamani ve sonuc temaslari. */
export function temasIndeksi(temaslar: PazarTemas[]) {
  const ilkUlasma = new Map<string, number>();
  const sonTemas = new Map<string, string>();
  const sonuclar = new Map<string, number[]>();
  for (const t of temaslar) {
    const z = zaman(t.olusturma);
    if (ULASMA.has(t.adim)) {
      const o = ilkUlasma.get(t.firma_id);
      if (o === undefined || z < o) ilkUlasma.set(t.firma_id, z);
    }
    if (t.adim === "sonuc") sonuclar.set(t.firma_id, [...(sonuclar.get(t.firma_id) || []), z]);
    if (t.adim !== "atla") {
      const s = sonTemas.get(t.firma_id);
      if (!s || s < t.olusturma) sonTemas.set(t.firma_id, t.olusturma);
    }
  }
  return { ilkUlasma, sonTemas, sonuclar };
}

/** Ulasma (sorgulama / hatirlatma) SONRASI gelen cevap maili olan firmalar. */
export function cevapVerenler(gelenler: PazarGelen[], ilkUlasma: Map<string, number>): Set<string> {
  const s = new Set<string>();
  for (const g of gelenler) {
    if (g.tur !== "cevap") continue;
    const ilk = ilkUlasma.get(g.firma_id);
    if (ilk !== undefined && zaman(g.tarih) > ilk) s.add(g.firma_id);
  }
  return s;
}

export function aksiyonlar(g: { bugun: string; firmalar: PazarFirma[]; temaslar: PazarTemas[]; gelenler: PazarGelen[]; gorevler: TakipGorev[]; gun?: number }): Aksiyon[] {
  const { ilkUlasma, sonuclar } = temasIndeksi(g.temaslar);
  const firma = new Map(g.firmalar.map((f) => [f.id, f]));
  const sinir = zaman(g.bugun) - (g.gun ?? 14) * 86400000;
  const atanan = new Map<string, string>();
  for (const x of [...g.gorevler].sort((a, b) => a.tarih.localeCompare(b.tarih))) if (x.atanan) atanan.set(x.firma_id, x.atanan);
  const sonucSonra = (id: string, z: number) => (sonuclar.get(id) || []).some((s) => s > z);
  const sonuc: Aksiyon[] = [];
  const goruldu = new Set<string>();

  // 1) Cevap mailleri: once en yenisi; firma basina bir aksiyon
  for (const m of [...g.gelenler].sort((a, b) => b.tarih.localeCompare(a.tarih))) {
    const z = zaman(m.tarih);
    if (m.tur !== "cevap" || z < sinir || goruldu.has(m.firma_id) || !firma.has(m.firma_id)) continue;
    if (sonucSonra(m.firma_id, z)) continue;
    const ilk = ilkUlasma.get(m.firma_id);
    if (ilk !== undefined && z > ilk) {
      goruldu.add(m.firma_id);
      sonuc.push({ tur: "cevap", firma_id: m.firma_id, tarih: m.tarih, kim: atanan.get(m.firma_id) || null,
        aciklama: m.oneri ? `Cevap verdi (sistem önerisi: ${ONERI_ADI[m.oneri]}) · sonuç girilmedi` : "Cevap verdi · sonuç girilmedi", detay: m.konu });
    } else if (m.oneri === "teklif" || m.oneri === "siparis") {
      goruldu.add(m.firma_id);
      sonuc.push({ tur: "oneri", firma_id: m.firma_id, tarih: m.tarih, kim: atanan.get(m.firma_id) || null,
        aciklama: `Gelen mailde ${ONERI_ADI[m.oneri]} sinyali`, detay: m.konu });
    }
  }
  // 2) Teklif isteyenler (sonuc "teklif istedi" girilmis)
  for (const f of g.firmalar) {
    if (f.crm_asama !== "teklif" || goruldu.has(f.id)) continue;
    goruldu.add(f.id);
    sonuc.push({ tur: "teklif", firma_id: f.id, tarih: f.son_temas || f.created_at, kim: atanan.get(f.id) || null, aciklama: "Teklif istedi · teklif takibi", detay: null });
  }
  // 3) Islenmeden kalan gecmis gorevler (sonradan temas yapilmamis)
  const sonTemasZ = new Map<string, number>();
  for (const t of g.temaslar) sonTemasZ.set(t.firma_id, Math.max(sonTemasZ.get(t.firma_id) || 0, zaman(t.olusturma)));
  for (const x of g.gorevler) {
    if (x.durum !== "bekliyor" || x.tarih >= g.bugun || goruldu.has(x.firma_id)) continue;
    if ((sonTemasZ.get(x.firma_id) || 0) >= zaman(x.tarih)) continue;
    goruldu.add(x.firma_id);
    sonuc.push({ tur: "islenmedi", firma_id: x.firma_id, tarih: x.tarih, kim: x.atanan, aciklama: "Görev işlenmedi (mail / WhatsApp gönderilmedi)", detay: null });
  }
  const sira: Record<AksiyonTuru, number> = { cevap: 0, oneri: 1, teklif: 2, islenmedi: 3 };
  return sonuc.sort((a, b) => sira[a.tur] - sira[b.tur] || b.tarih.localeCompare(a.tarih));
}

export function ekipOzeti(g: { bugun: string; ekip: PazarEkip[]; firmalar: PazarFirma[]; temaslar: PazarTemas[]; gelenler: PazarGelen[]; gorevler: TakipGorev[] }): EkipOzeti[] {
  const { ilkUlasma } = temasIndeksi(g.temaslar);
  const cevap = cevapVerenler(g.gelenler, ilkUlasma);
  const firma = new Map(g.firmalar.map((f) => [f.id, f]));
  const sonucTur = new Map<string, Set<string>>();
  for (const t of g.temaslar) {
    if (t.adim !== "sonuc" || !t.sonuc) continue;
    const kume = sonucTur.get(t.firma_id) || new Set<string>();
    kume.add(t.sonuc);
    sonucTur.set(t.firma_id, kume);
  }
  const kisiler = g.ekip.length ? g.ekip : [{ kod: "", eposta: "", hitap: "Ekip", sira: 1, aktif: true }];
  return kisiler.map((k) => {
    const liste = g.gorevler.filter((x) => (k.kod ? x.atanan === k.kod : true));
    const bugun = liste.filter((x) => x.tarih === g.bugun);
    // Islenen gorevin firmasi o kisinin: ulasma / sonuc / asama bilgisi firmadan
    const firmalari = new Set(liste.filter((x) => x.durum === "yapildi").map((x) => x.firma_id));
    const ulasilan = new Set(Array.from(firmalari).filter((id) => ilkUlasma.has(id)));
    const ara = (tur: string) => Array.from(firmalari).filter((id) => firma.get(id)?.crm_asama === tur || sonucTur.get(id)?.has(tur)).length;
    return {
      kod: k.kod,
      ad: k.hitap || k.eposta || k.kod,
      bugunToplam: bugun.length,
      bugunIslenen: bugun.filter((x) => x.durum !== "bekliyor").length,
      gorev: liste.length,
      islenen: liste.filter((x) => x.durum === "yapildi").length,
      atlanan: liste.filter((x) => x.durum === "atlandi").length,
      islenmeyen: liste.filter((x) => x.durum === "bekliyor" && x.tarih < g.bugun).length,
      ulasilan: ulasilan.size,
      cevap: Array.from(ulasilan).filter((id) => cevap.has(id) || OLUMLU_ASAMA.has(firma.get(id)?.crm_asama || "")).length,
      teklif: ara("teklif"),
      siparis: ara("siparis"),
    };
  });
}

const HUNI: { kod: string; ad: string; yan?: boolean }[] = [
  { kod: "sira", ad: "Sırada" }, { kod: "sorgulandi", ad: "Sorgulandı" }, { kod: "hatirlatma1", ad: "1. hatırlatma" },
  { kod: "hatirlatma2", ad: "2. hatırlatma" }, { kod: "cevap", ad: "Cevap verdi" }, { kod: "teklif", ad: "Teklif istedi" },
  { kod: "siparis", ad: "Sipariş verdi" }, { kod: "sessiz", ad: "Sessiz (bekliyor)", yan: true }, { kod: "ilgilenmiyor", ad: "İlgilenmiyor", yan: true },
];

/** Surec asamalari. "Sirada" = henuz ulasilmamis, e-postasi gecerli potansiyel (gunluk goreve girecek). */
export function huni(firmalar: PazarFirma[], epostali: Set<string>): HuniAsamasi[] {
  return HUNI.map((a) => {
    const ids = firmalar.filter((f) => (a.kod === "sira" ? f.durum === "potansiyel" && f.crm_asama === "yeni" && epostali.has(f.id) : f.crm_asama === a.kod)).map((f) => f.id);
    return { kod: a.kod, ad: a.ad, adet: ids.length, firmaIdleri: ids, yan: a.yan };
  });
}

export function ulkeOzeti(g: { firmalar: PazarFirma[]; temaslar: PazarTemas[]; gelenler: PazarGelen[]; epostali: Set<string> }): UlkeSatiri[] {
  const { ilkUlasma, sonTemas } = temasIndeksi(g.temaslar);
  const cevap = cevapVerenler(g.gelenler, ilkUlasma);
  const m = new Map<string, UlkeSatiri>();
  for (const f of g.firmalar) {
    const u = f.ulke || "—";
    let s = m.get(u);
    if (!s) { s = { ulke: u, musteri: 0, potansiyel: 0, epostali: 0, ulasilan: 0, cevap: 0, sonTemas: null }; m.set(u, s); }
    if (f.durum === "musteri") s.musteri++; else s.potansiyel++;
    if (g.epostali.has(f.id)) s.epostali++;
    if (ilkUlasma.has(f.id)) s.ulasilan++;
    if (cevap.has(f.id) || OLUMLU_ASAMA.has(f.crm_asama)) s.cevap++;
    const st = sonTemas.get(f.id) || f.son_temas;
    if (st && (!s.sonTemas || st > s.sonTemas)) s.sonTemas = st;
  }
  return Array.from(m.values()).sort((a, b) =>
    (a.ulke === "—" ? 1 : 0) - (b.ulke === "—" ? 1 : 0) || b.musteri - a.musteri || b.ulasilan - a.ulasilan || b.potansiyel - a.potansiyel || a.ulke.localeCompare(b.ulke, "tr"));
}
