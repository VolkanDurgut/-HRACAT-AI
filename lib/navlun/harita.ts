/**
 * NAVLUN HARITASI + LIMAN MASASI - saf hesap (11.11.2026). Veri yok, React yok.
 *
 * Kullanici: "Navlun Bildirimi acildiginda kullaniciyi canli bir harita karsilasin (Kontrol Merkezi'ndeki gibi). Liman
 * isimleri gorunsun; haritadan ve sagdaki listeden limana tiklanabilsin; arama ile bulunan limanin disindakilerin isigi
 * sonsun. Liman yuvarlagina tiklayinca butun acenteleri listeleyen, chat yazismasi seklinde navlunlari, fiyatlari ve
 * navlun raporunu gosteren bir ekran one ciksin."
 *
 * Kaynak: navlun_teklifleri satirlari (lib/navlun/veri.ts) + limanOzetleri (lib/navlun/ozet.ts). Konum: Kontrol
 * Merkezi'nin liman koordinatlari (lib/liman-koordinat.ts); navlun okuyucusunun Turkce yazimlari icin es adlar asagida.
 * Cikis: Ambarli / Asyaport (11.11.2026 kullanici: "Biz sadece Ambarli ve Asyaport ile calisiyoruz").
 */
import { trBuyuk } from "@/lib/tr-arama";
import { LIMAN_ES_ADLARI, limanKonumu, type LimanKonumu } from "@/lib/liman-koordinat";
import { satirKarsilastirmasi, type LimanOzeti, type NavlunSatiri } from "@/lib/navlun/ozet";
import type { KarsilastirmaBaglami } from "@/lib/navlun/karsilastirma";

/** Navlun okuyucusunun liman anahtari -> koordinat listesindeki anahtar. 17.11.2026: ortak kural lib/liman-koordinat.ts. */
export const HARITA_ES_ADLARI: Record<string, string> = LIMAN_ES_ADLARI;

export function navlunLimanKonumu(anahtar: string): LimanKonumu | null {
  return limanKonumu(HARITA_ES_ADLARI[anahtar] || anahtar);
}

/** belirsiz (13.11.2026): fiyat var ama hicbirinin lokali kesin degil -> hedefte / ustunde denemez */
export type NoktaDurumu = "hedefte" | "ustunde" | "fiyatli" | "belirsiz" | "fiyatsiz";
export type NavlunNoktasi = {
  anahtar: string;
  ad: string;
  konum: LimanKonumu | null;
  /** En iyi teklifin karsilastirma tutari (navlun + lokal + ek) */
  enIyi: number | null;
  enIyiAcente: string | null;
  /** "340 + lokal 356 = 696" / "lokal dahil" */
  enIyiMetin: string | null;
  hedef: number | null;
  /** 25.11.2026: gecerli teklif yoksa suresi dolmus en iyi teklif (yalniz gri bilgi; durum "fiyatsiz" kalir) */
  dolan: { tutar: number; acente: string; bitis: string | null } | null;
  acenteSayisi: number;
  teklifSayisi: number;
  sonTarih: string;
  durum: NoktaDurumu;
  /** Son gorulmeden sonra yeni olay var */
  yeni: boolean;
};

export function navlunNoktalari(limanlar: LimanOzeti[], satirlar: NavlunSatiri[], oncekiGorulme: string | null): NavlunNoktasi[] {
  return limanlar.map((l) => {
    const olaylar = satirlar.filter((s) => s.liman_anahtar === l.anahtar);
    const acenteler = new Set(olaylar.map((s) => s.acente).filter(Boolean));
    // 13.11.2026: karsilastirma tutari; lokali kesin teklif yoksa "belirsiz" (asla yesil degil)
    const enIyi = l.enIyi20?.karsi.toplam ?? null;
    const hedef = l.hedef?.tutar ?? null;
    const durum: NoktaDurumu = enIyi === null ? (l.belirsiz20 ? "belirsiz" : "fiyatsiz") : hedef === null ? "fiyatli" : enIyi <= hedef ? "hedefte" : "ustunde";
    return {
      anahtar: l.anahtar, ad: l.ad, konum: navlunLimanKonumu(l.anahtar), enIyi, enIyiAcente: l.enIyi20?.acente ?? null,
      enIyiMetin: l.enIyi20?.karsi.metin ?? null, hedef,
      dolan: l.dolan20 ? { tutar: l.dolan20.karsi.toplam, acente: l.dolan20.acente, bitis: l.dolan20.gecerlilikBitis ?? null } : null,
      acenteSayisi: acenteler.size, teklifSayisi: olaylar.filter((s) => s.tur === "teklif" || s.tur === "karsi_teklif").length,
      sonTarih: l.sonTarih, durum, yeni: !!oncekiGorulme && l.sonTarih > oncekiGorulme,
    };
  }).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

/** Turkce buyuk harf + I sadelestirme (arama) */
export const aramaAnahtari = (s: string) => trBuyuk(s).replace(/\s+/g, " ").trim(); // ortak kural: lib/tr-arama.ts

export function aramayaUyar(n: Pick<NavlunNoktasi, "ad" | "anahtar" | "enIyiAcente">, q: string): boolean {
  const a = aramaAnahtari(q);
  if (!a) return true;
  return aramaAnahtari(n.ad).includes(a) || n.anahtar.includes(a) || aramaAnahtari(n.enIyiAcente || "").includes(a);
}

// ---------------------------------------------------------------------------
// LIMAN MASASI: grup sohbeti (biz = sag, acenteler = sol)
// ---------------------------------------------------------------------------
export type SohbetMesaji = {
  id: string;
  taraf: "biz" | "acente";
  acente: string | null;
  armator: string | null;
  tur: string;
  /** Balonun ana metni (Turkce) */
  metin: string;
  /** Balonda buyuk yazilan tutar ("1.850 $ · 20'DC") */
  tutar: string | null;
  ayrinti: string[];
  tarih: string;
  /** Bu limandaki en iyi (en dusuk) guncel 20'DC teklifi */
  enIyi: boolean;
};

const para = (t: number | null, p: string) => (t === null ? "" : `${t.toLocaleString("tr-TR")} ${p === "EUR" ? "€" : p === "USD" || !p ? "$" : p}`);
const ekipmanAdi = (e: string | null) => (e === "20DC" || !e ? "20'DC" : e === "40HC" ? "40'HC" : e);

export function limanSohbeti(satirlar: NavlunSatiri[], anahtar: string, enIyi: { acente: string; tutar: number; tarih: string } | null, baglam: KarsilastirmaBaglami | null = null): SohbetMesaji[] {
  return satirlar
    .filter((s) => s.liman_anahtar === anahtar)
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .map((s, i): SohbetMesaji | null => {
      const ortak = { id: `${s.mesaj_id}|${s.tur}|${s.ekipman || ""}|${i}`, acente: s.acente, armator: s.armator, tur: s.tur, tarih: s.tarih };
      const ayrinti: string[] = [];
      if (s.free_time_gun != null) ayrinti.push(`Free time ${s.free_time_gun} gün`);
      if (s.transit_gun) ayrinti.push(`Transit ${s.transit_gun} gün`);
      if (s.gecerlilik) ayrinti.push(`Geçerlilik ${s.gecerlilik}`);
      // 13.11.2026: lokal durumu ve karsilastirma tutari (mail + acente hafizasi + rezervasyon)
      // 14.11.2026 (kullanici: "Navlun bildiriminde Beyrut hala 340 gozukuyor"): balonun buyuk rakami lokal dahil TOPLAM
      // (kesinse); acentenin yazdigi tutar dokumde kalir ("340 + lokal 356 = 696").
      // 24.11.2026: hesap sunucudan (navlun_teklif_degerlendirme; EUR teklif kurla USD'ye, "≈"); suresi dolan teklif belirtilir
      let buyukTutar: number | null = s.tutar;
      let buyukPara = s.para_birimi;
      let yaklasik = false;
      if ((s.tur === "teklif" || s.tur === "karsi_teklif") && s.tutar) {
        const k = satirKarsilastirmasi(s, s.tutar, s.lokal_dahil, baglam);
        ayrinti.push(k.kesin ? k.metin : `⚠ ${k.metin}`);
        if (k.kesin) { buyukTutar = k.toplam; if (s.degerlendirme) buyukPara = "USD"; yaklasik = !!k.yaklasik; }
        if (s.degerlendirme?.durum === "suresi_doldu") ayrinti.push(`Süresi doldu${s.degerlendirme.gecerlilik_bitis ? ` (${s.degerlendirme.gecerlilik_bitis.slice(8, 10)}.${s.degerlendirme.gecerlilik_bitis.slice(5, 7)})` : ""}`);
      }
      if (s.kaynak === "pdf") ayrinti.push("PDF'ten okundu");
      if (s.kaynak === "gorsel") ayrinti.push("görselden okundu");
      if (s.kaynak === "elle") ayrinti.push("elle girildi");
      switch (s.tur) {
        case "hedef": return { ...ortak, taraf: "biz", metin: "Hedef rakamımız", tutar: para(s.tutar, s.para_birimi), ayrinti: [], enIyi: false };
        case "kabul": return { ...ortak, taraf: "biz", metin: `Kabul edildi${s.armator ? ` · ${s.armator}` : ""}`, tutar: para(s.tutar, s.para_birimi), ayrinti: [], enIyi: false };
        case "teklif":
        case "karsi_teklif": {
          const enIyiMi = !!enIyi && s.acente === enIyi.acente && s.tutar === enIyi.tutar && s.tarih === enIyi.tarih;
          return { ...ortak, taraf: "acente", metin: s.tur === "karsi_teklif" ? "Karşı teklif" : `Teklif${s.armator && s.armator !== s.acente ? ` · ${s.armator}` : ""}`, tutar: `${yaklasik ? "≈ " : ""}${para(buyukTutar, buyukPara)} · ${ekipmanAdi(s.ekipman)}`, ayrinti, enIyi: enIyiMi };
        }
        case "hedef_kabul": return { ...ortak, taraf: "acente", metin: "Hedefiniz uygundur ✓", tutar: null, ayrinti, enIyi: false };
        case "hedef_soru": return { ...ortak, taraf: "acente", metin: "Hedefiniz nedir?", tutar: null, ayrinti: [], enIyi: false };
        case "servis_yok": return { ...ortak, taraf: "acente", metin: "Bu limana servisimiz yok.", tutar: null, ayrinti: [], enIyi: false };
        case "yer_yok": return { ...ortak, taraf: "acente", metin: "Şu an yer yok.", tutar: null, ayrinti: [], enIyi: false };
        case "ek_teklif": return { ...ortak, taraf: "acente", metin: "Fiyat ekte (okunamadı; Okunamayanlar'da)", tutar: null, ayrinti: [], enIyi: false };
        default: return null;
      }
    })
    .filter((m): m is SohbetMesaji => m !== null);
}

/** Masadaki acente listesi: son fiyat (20'DC once), son durum, mesaj sayisi. */
export type MasaAcentesi = {
  acente: string; sonFiyat: number | null; ekipman: string | null; freeTime: number | null; transit: string | null; sonDurum: string | null; mesaj: number; sonTarih: string; enIyi: boolean;
  /** 13.11.2026: karsilastirma tutari ve kesinligi */
  toplam: number | null; kesin: boolean; metin: string | null;
};
export function masaAcenteleri(l: LimanOzeti, mesajlar: SohbetMesaji[]): MasaAcentesi[] {
  const adlar = Array.from(new Set(mesajlar.filter((m) => m.acente).map((m) => m.acente as string)));
  return adlar.map((a) => {
    // 24.11.2026: suresi dolan teklif yalniz baska guncel teklifi yoksa gosterilir ve kesin sayilmaz (masada uyari rengi)
    const f = l.fiyatlar.filter((x) => x.acente === a).sort((x, y) => (x.suresiDoldu ? 1 : 0) - (y.suresiDoldu ? 1 : 0)
      || (x.ekipman === "20DC" ? 0 : 1) - (y.ekipman === "20DC" ? 0 : 1) || x.karsi.toplam - y.karsi.toplam)[0] || null;
    const d = l.durumlar.find((x) => x.acente === a) || null;
    const ms = mesajlar.filter((m) => m.acente === a);
    return {
      acente: a, sonFiyat: f?.tutar ?? null, ekipman: f?.ekipman ?? null, freeTime: f?.free_time_gun ?? null, transit: f?.transit_gun ?? null,
      sonDurum: d?.tur ?? null, mesaj: ms.length, sonTarih: ms[ms.length - 1]?.tarih || "", enIyi: !!l.enIyi20 && l.enIyi20.acente === a,
      toplam: f ? f.karsi.toplam : null, kesin: !!f && f.karsi.kesin && !f.suresiDoldu, metin: f ? (f.suresiDoldu ? `süresi doldu · ${f.karsi.metin}` : f.karsi.metin) : null,
    };
  }).sort((x, y) => (x.toplam === null ? 1 : 0) - (y.toplam === null ? 1 : 0) || (x.kesin ? 0 : 1) - (y.kesin ? 0 : 1)
    || (x.toplam ?? 0) - (y.toplam ?? 0) || x.acente.localeCompare(y.acente, "tr"));
}
