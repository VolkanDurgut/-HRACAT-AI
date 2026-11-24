/**
 * NAVLUN BILDIRIMI - liman bazinda ozet (10.11.2026). Saf fonksiyon (veri yok).
 *
 * Girdi: navlun_teklifleri satirlari (maillerden okunan olaylar; migration 20261110150000).
 * Cikti: liman basina -> son hedefimiz, son kabulumuz, her acentenin (ekipman basina) SON fiyati,
 * fiyati olmayan acentelerin son durumu (servis yok / yer yok / hedef soruyor / fiyat ekte).
 * "Hedefiniz uygundur" (hedef_kabul) -> o andaki son hedefimiz o acentenin fiyati sayilir.
 */

import { enIyiSec, karsilastir, type Karsilastirma, type KarsilastirmaBaglami } from "@/lib/navlun/karsilastirma";

/**
 * 24.11.2026 TEK HESAP (kullanici onayi: "Navlun bildirimi mevcut hali ile mimari yapisini onarmak"): her teklifin konteyner
 * basi maliyeti, lokal durumu, gecerliligi ve durumu SUNUCUDA hesaplanir (edge navlun-bildirimi "degerlendir" ->
 * navlun_teklif_degerlendirme; 17:00 maili ve Excel ile ayni kod). Sayfa bunu okur; tarayici yalniz degerlendirmesi henuz
 * olmayan satirda (hedef kabulu, birkac dakikalik yeni teklif) eski yoldan hesaplar.
 */
export type SunucuDegerlendirmesi = {
  toplam_usd: number;
  lokal: number | null;
  ek: number;
  lokal_durum: "dahil" | "haric" | "bilinmiyor";
  metin: string | null;
  dayanak: string | null;
  celiski: string | null;
  yaklasik: boolean;
  durum: "kesin" | "kontrol" | "eksik" | "suresi_doldu";
  en_iyi: boolean;
  gecerlilik_bitis: string | null;
};

export type NavlunSatiri = {
  /** navlun_teklifleri.id (24.11.2026: sunucu degerlendirmesiyle eslesme) */
  id?: string;
  /** Sunucunun bu teklif icin hesabi (yalniz teklif / karsi_teklif; yoksa null) */
  degerlendirme?: SunucuDegerlendirmesi | null;
  mesaj_id: string;
  tur: string;
  liman: string | null;
  liman_anahtar: string | null;
  acente: string | null;
  armator: string | null;
  tutar: number | null;
  para_birimi: string;
  ekipman: string | null;
  free_time_gun: number | null;
  /** Transit suresi (gun, ham "35" / "46-48"); 11.11.2026 */
  transit_gun?: string | null;
  gecerlilik: string | null;
  lokal_dahil: boolean | null;
  kaynak: string;
  tarih: string;
};

export type AcenteFiyati = {
  acente: string;
  ekipman: string;
  tutar: number;
  armator: string | null;
  free_time_gun: number | null;
  transit_gun: string | null;
  gecerlilik: string | null;
  lokal_dahil: boolean | null;
  kaynak: string;
  tarih: string;
  /** "teklif" | "karsi_teklif" | "hedef_kabul" */
  tur: string;
  /** Acentenin yazdigi tutarin para birimi (USD / EUR) */
  para?: string;
  /** 24.11.2026: gecerliligi dolmus (teklifte yazan / acente aliskanligi / 21 gun); "en iyi" secilmez */
  suresiDoldu?: boolean;
  /** Gecerlilik bitisi (sunucu) */
  gecerlilikBitis?: string | null;
  /** 13.11.2026: karsilastirma tutari (navlun + lokal + ek), lokal durumu ve dayanagi (lib/navlun/karsilastirma.ts) */
  karsi: Karsilastirma;
};

export type AcenteDurumu = { acente: string; tur: string; tarih: string };

export type LimanOzeti = {
  anahtar: string;
  ad: string;
  sonTarih: string;
  hedef: { tutar: number; tarih: string } | null;
  kabul: { tutar: number; armator: string | null; tarih: string } | null;
  /** 20DC once, sonra tutara gore artan */
  fiyatlar: AcenteFiyati[];
  /** Fiyati olmayan acentelerin son durumu */
  durumlar: AcenteDurumu[];
  /** 13.11.2026: YALNIZ toplami kesin teklifler arasinda en dusuk toplam (navlun + lokal + ek) */
  enIyi20: AcenteFiyati | null;
  /** Toplami kesin olmayan (lokal belirsiz) en dusuk 20'DC teklif; en iyi sayilmaz, ayrica uyarilir */
  belirsiz20: AcenteFiyati | null;
};

const FIYATLI = new Set(["teklif", "karsi_teklif"]);

/** Sunucu degerlendirmesini sayfanin karsilastirma bicimine cevirir (hesap yok; yalniz bicim). */
export function sunucuKarsilastirmasi(tutar: number, d: SunucuDegerlendirmesi): Karsilastirma {
  const metin = d.metin || "";
  const dayanak = d.dayanak || "";
  const temel = metin.startsWith("yalnız navlun") ? "navlun" as const : "toplam" as const;
  const kaynak = temel === "navlun" ? "liman" as const : dayanak.startsWith("Teklif metninde") ? "mail" as const
    : dayanak.startsWith("Acente hafızası") ? "hafiza" as const : dayanak.startsWith("Rezervasyondan") ? "rezervasyon" as const : "yok" as const;
  // Gecerlilik ayrica isaretlenir (suresiDoldu); burada lokal / celiski kesinligi
  const kesin = temel === "navlun" || (!d.celiski && (d.lokal_durum === "dahil" || (d.lokal_durum === "haric" && d.lokal !== null)));
  return {
    navlun: tutar, lokal: d.lokal_durum === "dahil" ? 0 : d.lokal, ek: d.ek, toplam: d.toplam_usd, kesin, lokalDurum: d.lokal_durum, temel, kaynak,
    metin, dayanak, yaklasik: d.yaklasik, celiski: d.celiski,
  };
}

/** Satirin karsilastirmasi: sunucu degerlendirmesi varsa o, yoksa (hedef kabulu / yeni teklif) tarayicida. */
export function satirKarsilastirmasi(s: Pick<NavlunSatiri, "acente" | "tutar" | "ekipman" | "lokal_dahil" | "liman_anahtar" | "degerlendirme">, tutar: number,
  lokalDahil: boolean | null, baglam: KarsilastirmaBaglami | null): Karsilastirma {
  if (s.degerlendirme) return sunucuKarsilastirmasi(tutar, s.degerlendirme);
  return karsilastir({ acente: s.acente, tutar, ekipman: s.ekipman, lokal_dahil: lokalDahil, liman_anahtar: s.liman_anahtar }, baglam);
}
export const DURUM_ETIKETI: Record<string, string> = {
  servis_yok: "Servis yok",
  yer_yok: "Yer yok",
  hedef_soru: "Hedef soruyor",
  ek_teklif: "Fiyat ekte",
  hedef_kabul: "Hedefi kabul etti",
  karsi_teklif: "Karşı teklif",
};

/**
 * baglam (13.11.2026): acente hafizasi + rezervasyondan ogrenilen + liman kurallari. Yoksa (okunamadi) yalniz mail metni
 * kullanilir ve lokali belirsiz teklif hic "en iyi" secilmez.
 */
export function limanOzetleri(satirlar: NavlunSatiri[], baglam: KarsilastirmaBaglami | null = null): LimanOzeti[] {
  const sirali = [...satirlar].filter((s) => s.liman_anahtar).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const gruplar = new Map<string, NavlunSatiri[]>();
  for (const s of sirali) {
    const k = s.liman_anahtar as string;
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k)!.push(s);
  }
  const sonuc: LimanOzeti[] = [];
  for (const [anahtar, liste] of Array.from(gruplar.entries())) {
    let hedef: LimanOzeti["hedef"] = null;
    let kabul: LimanOzeti["kabul"] = null;
    const fiyat = new Map<string, AcenteFiyati>();          // acente|ekipman|armator -> son fiyat
    const durum = new Map<string, AcenteDurumu>();          // acente -> son fiyatsiz durum
    const sonFiyatTarihi = new Map<string, string>();       // acente -> son fiyat tarihi
    for (const s of liste) {
      if (!s.acente) {
        if (s.tur === "hedef" && s.tutar) hedef = { tutar: s.tutar, tarih: s.tarih };
        if (s.tur === "kabul" && s.tutar) kabul = { tutar: s.tutar, armator: s.armator, tarih: s.tarih };
        continue;
      }
      if ((FIYATLI.has(s.tur) && s.tutar) || (s.tur === "hedef_kabul" && hedef)) {
        const tutar = s.tur === "hedef_kabul" ? hedef!.tutar : (s.tutar as number);
        const ekipman = s.ekipman || "20DC";
        // "Hedefiniz uygundur": hedefimiz ayni temelle (lokal dahil toplam) okunur
        const lokalDahil = s.tur === "hedef_kabul" ? true : s.lokal_dahil;
        fiyat.set(`${s.acente}|${ekipman}|${s.armator || ""}`, {
          acente: s.acente, ekipman, tutar, armator: s.armator, free_time_gun: s.free_time_gun, transit_gun: s.transit_gun ?? null, gecerlilik: s.gecerlilik,
          lokal_dahil: lokalDahil, kaynak: s.kaynak, tarih: s.tarih, tur: s.tur, para: s.tur === "hedef_kabul" ? "USD" : s.para_birimi || "USD",
          karsi: s.tur === "hedef_kabul" ? karsilastir({ acente: s.acente, tutar, ekipman, lokal_dahil: lokalDahil, liman_anahtar: anahtar }, baglam)
            : satirKarsilastirmasi({ ...s, liman_anahtar: anahtar }, tutar, lokalDahil, baglam),
          suresiDoldu: s.tur !== "hedef_kabul" && s.degerlendirme?.durum === "suresi_doldu",
          gecerlilikBitis: s.tur !== "hedef_kabul" ? s.degerlendirme?.gecerlilik_bitis ?? null : null,
        });
        sonFiyatTarihi.set(s.acente, s.tarih);
      } else if (s.tur !== "hedef" && s.tur !== "kabul") {
        durum.set(s.acente, { acente: s.acente, tur: s.tur, tarih: s.tarih });
      }
    }
    // 13.11.2026: siralama karsilastirma tutarina gore; kesin olanlar once
    // 24.11.2026: suresi dolan teklif listede kalir ama en sona ve hicbir zaman en iyi / belirsiz uyarisi degil
    const fiyatlar = Array.from(fiyat.values()).sort((a, b) =>
      (a.ekipman === "20DC" ? 0 : 1) - (b.ekipman === "20DC" ? 0 : 1) || a.ekipman.localeCompare(b.ekipman)
      || (a.suresiDoldu ? 1 : 0) - (b.suresiDoldu ? 1 : 0)
      || (a.karsi.kesin ? 0 : 1) - (b.karsi.kesin ? 0 : 1) || a.karsi.toplam - b.karsi.toplam);
    // Fiyati olan acentenin, fiyattan ONCEKI durumu (ornegin "hedef soruyor") gosterilmez
    const durumlar = Array.from(durum.values()).filter((d) => !sonFiyatTarihi.has(d.acente) || d.tarih > (sonFiyatTarihi.get(d.acente) as string))
      .sort((a, b) => b.tarih.localeCompare(a.tarih));
    const yirmi = fiyatlar.filter((f) => f.ekipman === "20DC" && !f.suresiDoldu);
    const secim = enIyiSec(yirmi, (f) => f.karsi);
    sonuc.push({
      anahtar,
      ad: (liste[liste.length - 1].liman || anahtar).toLocaleUpperCase("tr-TR"),
      sonTarih: liste[liste.length - 1].tarih,
      hedef, kabul, fiyatlar, durumlar,
      enIyi20: secim.enIyi,
      // Belirsiz teklif yalniz en iyiden daha ucuzsa (ya da kesin teklif yoksa) uyari olarak gosterilir
      belirsiz20: secim.belirsiz && (!secim.enIyi || secim.belirsiz.karsi.toplam < secim.enIyi.karsi.toplam) ? secim.belirsiz : null,
    });
  }
  return sonuc.sort((a, b) => b.sonTarih.localeCompare(a.sonTarih));
}

/** Sag panel "Yeni gelen bilgiler" (11.11.2026): son okunan olaylar, en yeni once. */
export type YeniBilgi = {
  anahtar: string; tur: string; liman: string | null; liman_anahtar: string | null; acente: string | null;
  armator: string | null; tutar: number | null; para_birimi: string; ekipman: string | null; tarih: string;
};
const PANEL_TURLERI = new Set(["teklif", "karsi_teklif", "servis_yok", "yer_yok", "hedef_kabul", "kabul", "hedef", "hedef_soru"]);
export const YENI_TUR_ADI: Record<string, string> = {
  teklif: "Yeni teklif", karsi_teklif: "Karşı teklif", servis_yok: "Servis yok", yer_yok: "Yer yok",
  hedef_kabul: "Hedef kabul", kabul: "Kabul edildi", hedef: "Hedefimiz", hedef_soru: "Hedef soruyor",
};
export function yeniBilgiler(satirlar: NavlunSatiri[], adet = 16): YeniBilgi[] {
  return satirlar
    .filter((s) => PANEL_TURLERI.has(s.tur) && s.liman_anahtar)
    .sort((a, b) => b.tarih.localeCompare(a.tarih))
    .slice(0, adet)
    .map((s, i) => ({
      anahtar: `${s.mesaj_id}|${s.tur}|${s.ekipman || ""}|${i}`, tur: s.tur, liman: s.liman, liman_anahtar: s.liman_anahtar, acente: s.acente,
      armator: s.armator, tutar: s.tutar, para_birimi: s.para_birimi, ekipman: s.ekipman, tarih: s.tarih,
    }));
}
