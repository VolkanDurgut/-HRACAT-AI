/**
 * NAVLUN MERKEZI - saf kurallar (24.11.2026, Asama 2). Veri yok, ag yok.
 *
 * Kullanici (24.11.2026): "Ekranda sundugumuz kartlar, ozellikler ne kadar sey varsa tek basina calismamali." Yeni ekranin
 * (app/navlun/merkez) tum sekmeleri TEK okumanin (lib/navlun/merkez-veri.ts) sonucunu bu fonksiyonlarla turetir:
 *  - limanListesi: liman basina guncel teklifler + en iyi (en iyi secimi SUNUCUDA: navlun_teklif_degerlendirme.en_iyi).
 *  - kontrolKuyrugu: elle bakilmasi gereken her sey tek listede (okunamayan mail, teklif olabilecek mail, mail lokali ile
 *    acente hafizasi celiskisi, lokali belirsiz acente, tutmayan gerceklesen navlun). Kapatilan kalem (Kontrol islemleri
 *    izi: navlun_kontrol_islemleri) listeden duser. 48 saati gecen kalem "gecikti" isaretlenir.
 */
import { acenteAnahtari } from "@/lib/navlun/karsilastirma";
import type { OkunamayanMesaj, TeklifAdayi } from "@/lib/navlun/veri";

export type DegerlendirmeDurumu = "kesin" | "kontrol" | "eksik" | "suresi_doldu";

export type DegerlendirmeSatiri = {
  teklif_id: string;
  liman_anahtar: string | null;
  acente: string | null;
  ekipman: string | null;
  tutar: number;
  para: string;
  toplam_usd: number;
  lokal: number | null;
  ek: number;
  lokal_durum: "dahil" | "haric" | "bilinmiyor";
  metin: string | null;
  dayanak: string | null;
  celiski: string | null;
  yaklasik: boolean;
  gecerlilik_bitis: string;
  gecerlilik_kaynagi: "teklif" | "acente" | "varsayilan";
  durum: DegerlendirmeDurumu;
  en_iyi: boolean;
  /** Teklifin kendisi (navlun_teklifleri) */
  liman: string | null;
  armator: string | null;
  free_time_gun: number | null;
  transit_gun: string | null;
  tarih: string;
  kaynak: string | null;
};

export type GerceklesenDurumu = "tutuyor" | "eski_teklifle_tutuyor" | "tutmuyor" | "teklif_yok" | "fob" | "eksik";
export type GerceklesenSatiri = {
  sevkiyat_id: string;
  booking_no: string | null;
  acente: string | null;
  liman_anahtar: string | null;
  etd: string | null;
  referans_tarih: string | null;
  gercek: number;
  para: string;
  teklif_tutar: number | null;
  teklif_para: string | null;
  teklif_tarih: string | null;
  fark: number | null;
  durum: GerceklesenDurumu;
  aciklama: string | null;
};

export type KontrolHedefi = "mesaj" | "teklif" | "acente" | "gerceklesen";
export type KontrolIslemTuru = "duzelt" | "onayla" | "yoksay" | "ogret";
export type KontrolIslemi = {
  id: string;
  hedef_tur: KontrolHedefi;
  hedef_id: string;
  islem: KontrolIslemTuru;
  onceki: Record<string, unknown> | null;
  sonraki: Record<string, unknown> | null;
  gerekce: string | null;
  kullanici_eposta: string | null;
  zaman: string;
};

export type HedefKabul = { liman_anahtar: string | null; tur: "hedef" | "kabul"; tutar: number | null; armator: string | null; tarih: string };

export type AcenteHafiza = { acente_anahtar: string; acente_ad: string; lokal: "dahil" | "haric" | "bilinmiyor"; lokal_20: number | null; lokal_40: number | null; ek_kont: number; guven: string; kanit: string; kaynak: string };

export type MerkezVerisi = {
  degerlendirme: DegerlendirmeSatiri[];
  gerceklesen: GerceklesenSatiri[];
  islemler: KontrolIslemi[];
  okunamayanlar: OkunamayanMesaj[];
  adaylar: TeklifAdayi[];
  hedefKabul: HedefKabul[];
  hafiza: AcenteHafiza[];
  /** Degerlendirmenin son hesaplandigi an (sunucu) */
  hesapZamani: string | null;
  /** Ikincil bir parca okunamadiysa (sayfa yine acilir) */
  uyarilar: string[];
};

// ---------------------------------------------------------------------------------------------------------------------
// LIMANLAR
// ---------------------------------------------------------------------------------------------------------------------
export type LimanSatiri = {
  anahtar: string;
  ad: string;
  sonTarih: string;
  enIyi: DegerlendirmeSatiri | null;
  /** Her acente + armator + ekipman icin en son teklif; en iyi once, sonra toplam */
  guncel: DegerlendirmeSatiri[];
  /** Pencere icindeki tum teklifler (yeniden eskiye) */
  tumu: DegerlendirmeSatiri[];
  hedef: { tutar: number; tarih: string } | null;
  kabul: { tutar: number; armator: string | null; tarih: string } | null;
  /** Guncel tekliflerde durum sayilari */
  sayilar: Record<DegerlendirmeDurumu, number>;
};

const DURUM_SIRASI: Record<DegerlendirmeDurumu, number> = { kesin: 0, kontrol: 1, eksik: 2, suresi_doldu: 3 };

export function limanListesi(d: DegerlendirmeSatiri[], hk: HedefKabul[]): LimanSatiri[] {
  const grup = new Map<string, DegerlendirmeSatiri[]>();
  for (const x of d) {
    if (!x.liman_anahtar) continue;
    const l = grup.get(x.liman_anahtar) ?? [];
    l.push(x);
    grup.set(x.liman_anahtar, l);
  }
  const sonuc: LimanSatiri[] = [];
  grup.forEach((liste, anahtar) => {
    const tumu = [...liste].sort((a, b) => b.tarih.localeCompare(a.tarih));
    const son = new Map<string, DegerlendirmeSatiri>();
    for (const x of tumu) {
      const k = `${acenteAnahtari(x.acente) ?? "?"}|${x.armator ?? ""}|${x.ekipman ?? "20DC"}`;
      if (!son.has(k)) son.set(k, x);
    }
    const guncel = Array.from(son.values()).sort((a, b) =>
      Number(b.en_iyi) - Number(a.en_iyi) || (a.ekipman ?? "20DC").localeCompare(b.ekipman ?? "20DC")
      || DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || a.toplam_usd - b.toplam_usd);
    const sayilar: Record<DegerlendirmeDurumu, number> = { kesin: 0, kontrol: 0, eksik: 0, suresi_doldu: 0 };
    guncel.forEach((x) => { sayilar[x.durum]++; });
    const buLiman = hk.filter((h) => h.liman_anahtar === anahtar && h.tutar != null).sort((a, b) => b.tarih.localeCompare(a.tarih));
    const h = buLiman.find((x) => x.tur === "hedef");
    const k = buLiman.find((x) => x.tur === "kabul");
    sonuc.push({
      anahtar, ad: tumu[0].liman || anahtar, sonTarih: tumu[0].tarih, enIyi: liste.find((x) => x.en_iyi) ?? null, guncel, tumu,
      hedef: h ? { tutar: h.tutar as number, tarih: h.tarih } : null,
      kabul: k ? { tutar: k.tutar as number, armator: k.armator, tarih: k.tarih } : null,
      sayilar,
    });
  });
  return sonuc.sort((a, b) => b.sonTarih.localeCompare(a.sonTarih));
}

// ---------------------------------------------------------------------------------------------------------------------
// KONTROL KUYRUGU
// ---------------------------------------------------------------------------------------------------------------------
export const GECIKME_SAAT = 48;

export type KontrolTuru = "okunamayan" | "aday" | "celiski" | "lokal_belirsiz" | "tutmayan";
export const KONTROL_ADI: Record<KontrolTuru, string> = {
  okunamayan: "Okunamayan teklif",
  aday: "Teklif olabilecek mail",
  celiski: "Lokal çelişkisi",
  lokal_belirsiz: "Lokali belirsiz acente",
  tutmayan: "Gerçekleşen navlun tutmuyor",
};

export type KontrolKalemi = {
  /** React anahtari */
  anahtar: string;
  tur: KontrolTuru;
  hedefTur: KontrolHedefi;
  hedefId: string;
  liman: string | null;
  acente: string | null;
  /** Bekleme suresinin olculdugu an (mail / teklif tarihi; acente kaleminde en eski teklif; gerceklesende kalkis) */
  tarih: string;
  yasSaat: number;
  gecikti: boolean;
  aciklama: string;
  okunamayan?: OkunamayanMesaj;
  aday?: TeklifAdayi;
  teklif?: DegerlendirmeSatiri;
  teklifler?: DegerlendirmeSatiri[];
  gerceklesen?: GerceklesenSatiri;
};

const KAPATAN: Record<KontrolHedefi, KontrolIslemTuru[]> = {
  mesaj: ["duzelt", "yoksay"],
  teklif: ["ogret", "yoksay"],
  acente: ["ogret", "yoksay"],
  gerceklesen: ["onayla", "yoksay"],
};

/** Hedefin, verilen andan (dahil) sonra kapatilip kapatilmadigi. */
export function kapatildiMi(islemler: KontrolIslemi[], hedefTur: KontrolHedefi, hedefId: string, sonra?: string): KontrolIslemi | null {
  const s = sonra ? Date.parse(sonra) : -Infinity;
  for (const i of islemler) {
    if (i.hedef_tur === hedefTur && i.hedef_id === hedefId && KAPATAN[hedefTur].includes(i.islem) && Date.parse(i.zaman) >= s) return i;
  }
  return null;
}

const yas = (tarih: string, simdi: number) => Math.max(0, (simdi - Date.parse(tarih)) / 3600000);
const sayiYaz = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function kontrolKuyrugu(v: Pick<MerkezVerisi, "degerlendirme" | "gerceklesen" | "islemler" | "okunamayanlar" | "adaylar">, simdi = Date.now()): KontrolKalemi[] {
  const out: KontrolKalemi[] = [];
  const ekle = (k: Omit<KontrolKalemi, "yasSaat" | "gecikti">) => {
    const s = yas(k.tarih, simdi);
    out.push({ ...k, yasSaat: s, gecikti: s > GECIKME_SAAT });
  };
  for (const m of v.okunamayanlar) {
    ekle({ anahtar: `okunamayan:${m.id}`, tur: "okunamayan", hedefTur: "mesaj", hedefId: m.id, liman: m.liman, acente: m.acente, tarih: m.tarih,
      aciklama: m.kaynak === "gorsel" ? "Fiyat görselde; tutarı girin ya da yoksayın." : m.kaynak === "pdf" ? "PDF'teki fiyat belirsiz; tutarı girin ya da yoksayın." : "Fiyat ekte; tutarı girin ya da yoksayın.",
      okunamayan: m });
  }
  const okunamayanId = new Set(v.okunamayanlar.map((m) => m.id));
  for (const a of v.adaylar) {
    if (okunamayanId.has(a.id)) continue;
    ekle({ anahtar: `aday:${a.id}`, tur: "aday", hedefTur: "mesaj", hedefId: a.id, liman: a.liman, acente: a.acente || a.alan, tarih: a.tarih,
      aciklama: a.neden || (a.acente ? "Metninde tutar geçiyor ama teklif okunmadı." : "Tanınmayan gönderenden navlun yazışması."), aday: a });
  }
  for (const t of v.degerlendirme) {
    if (t.durum !== "kontrol" || kapatildiMi(v.islemler, "teklif", t.teklif_id)) continue;
    ekle({ anahtar: `celiski:${t.teklif_id}`, tur: "celiski", hedefTur: "teklif", hedefId: t.teklif_id, liman: t.liman || t.liman_anahtar, acente: t.acente, tarih: t.tarih,
      aciklama: t.celiski || "Maildeki lokal acente hafızasıyla çelişiyor.", teklif: t });
  }
  const belirsiz = new Map<string, DegerlendirmeSatiri[]>();
  for (const t of v.degerlendirme) {
    const a = acenteAnahtari(t.acente);
    if (t.durum !== "eksik" || !a) continue;
    const l = belirsiz.get(a) ?? [];
    l.push(t);
    belirsiz.set(a, l);
  }
  belirsiz.forEach((liste, a) => {
    const sirali = [...liste].sort((x, y) => x.tarih.localeCompare(y.tarih));
    // Kapatildiktan SONRA gelen yeni belirsiz teklif kalemi yeniden acar
    if (kapatildiMi(v.islemler, "acente", a, sirali[sirali.length - 1].tarih)) return;
    const limanlar = Array.from(new Set(sirali.map((x) => x.liman || x.liman_anahtar).filter(Boolean)));
    const haricBilinmeyen = sirali.some((x) => x.lokal_durum === "haric");
    ekle({ anahtar: `acente:${a}`, tur: "lokal_belirsiz", hedefTur: "acente", hedefId: a, liman: limanlar.slice(0, 3).join(", ") + (limanlar.length > 3 ? ` +${limanlar.length - 3}` : ""),
      acente: sirali[0].acente, tarih: sirali[0].tarih,
      aciklama: `${sirali.length} teklif${haricBilinmeyen ? "te lokal hariç ama tutarı bilinmiyor" : "in lokali dahil mi hariç mi bilinmiyor"}; en iyi seçilemiyor. Bir kez öğretin, hepsi düzelir.`,
      teklifler: sirali });
  });
  for (const g of v.gerceklesen) {
    if (g.durum !== "tutmuyor" || kapatildiMi(v.islemler, "gerceklesen", g.sevkiyat_id)) continue;
    ekle({ anahtar: `tutmayan:${g.sevkiyat_id}`, tur: "tutmayan", hedefTur: "gerceklesen", hedefId: g.sevkiyat_id, liman: g.liman_anahtar, acente: g.acente,
      tarih: g.etd || g.referans_tarih || new Date(simdi).toISOString(),
      aciklama: g.aciklama || `Gerçekleşen ${sayiYaz(g.gercek)} ${g.para}, teklif ${g.teklif_tutar == null ? "?" : sayiYaz(g.teklif_tutar)} ${g.teklif_para || ""}.`,
      gerceklesen: g });
  }
  return out.sort((a, b) => Number(b.gecikti) - Number(a.gecikti) || b.yasSaat - a.yasSaat);
}

/** "3 sa", "2 gün" */
export function yasYaz(saat: number): string {
  if (saat < 1) return "az önce";
  if (saat < 48) return `${Math.floor(saat)} sa`;
  return `${Math.floor(saat / 24)} gün`;
}
