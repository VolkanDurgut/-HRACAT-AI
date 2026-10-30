/**
 * Ic Piyasa - SATIS & ALIS SIPARIS RAPORU (30.10.2026).
 * Lojistigin her gun elle tuttugu Excel'in ("27.10.2026_SİPARİŞ ALIM RAPORU")
 * iki tablosunun sistemden uretilen hali. SAF fonksiyonlar (ekran ve Excel
 * ciktisi ayni satirlari kullanir).
 *
 * Kapsam (Excel ile ayni: "AKTIF BEKLEYEN & TAMAMLANAN"): acik siparislerin
 * hepsi + son `tamamlananGun` gunde tamamlananlar (yesil). Iptaller girmez.
 * Toplam tutar = SIPARIS miktari x birim fiyat (Excel'deki "=+G3*J3").
 */
import { alisUrunYazi, vadeExcelYazi, type AlisTeslim, type ParaBirimi } from "./alis";

export type RaporSatisGirdi = {
  id: string;
  is_emri_no: string;
  durum: "acik" | "tamamlandi" | "iptal";
  kapanis_zamani: string | null;
  olusturma: string;
  siparis_tarihi: string | null;
  musteri: string;
  musteri_siparis_no: string | null;
  urun: string;
  ambalaj: string | null;
  hedef_tur: "kg" | "arac";
  hedef_kg: number | null;
  hedef_arac: number | null;
  birim_fiyat: number | null;
  vade_gun: number | null;
  teslim: string | null;
  teslim_suresi_gun: number | null;
  /** Bu is emrine girilen araclarin net toplami + sayisi */
  sevk_kg: number;
  sevk_arac: number;
  /** En az bir araci TMO'dan dogrudan (alis teslimine bagli) mi geldi */
  dogrudan: boolean;
};

export type RaporAlisGirdi = {
  id: string;
  alis_no: string;
  durum: "acik" | "tamamlandi" | "iptal";
  kapanis_zamani: string | null;
  olusturma: string;
  siparis_tarihi: string;
  tedarikci: string;
  depo: string | null;
  tedarikci_siparis_no: string | null;
  urun: string;
  urun_kodu: string | null;
  miktar_kg: number;
  birim_fiyat: number | null;
  para_birimi: ParaBirimi;
  vade_gun: number | null;
  termin: string | null;
  teslim: AlisTeslim;
  alinan_kg: number;
  alinan_arac: number;
};

export type RaporSatisSatiri = {
  id: string;
  kayitNo: string;
  fisTarihi: string; // YYYY-MM-DD
  cari: string;
  siparisNo: string;
  malzeme: string;
  birim: "KG";
  siparisKg: number | null;
  /** Hedef arac sayisiyla acilan is emri ("3 araç") */
  siparisArac: number | null;
  sevkKg: number;
  bekleyenKg: number | null;
  birimFiyat: number | null;
  vade: string;
  tutar: number | null;
  termin: string;
  teslim: string;
  tamamlandi: boolean;
};

export type RaporAlisSatiri = {
  id: string;
  kayitNo: string;
  fisTarihi: string;
  cari: string;
  siparisNo: string;
  malzeme: string;
  birim: "KG";
  siparisKg: number;
  alinanKg: number;
  bekleyenKg: number;
  birimFiyat: number | null;
  paraBirimi: ParaBirimi;
  vade: string;
  termin: string | null; // YYYY-MM-DD
  teslim: string;
  tutar: number | null;
  tamamlandi: boolean;
};

/** ISO zaman -> TR takvim gunu "YYYY-MM-DD" */
export function trGun(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

/** "YYYY-MM-DD" gunune n gun ekler (saat dilimi etkisiz). */
export function gunEkle(gun: string, n: number): string {
  const [y, m, d] = gun.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Satis teslim yazimi Excel'deki gibi: "Adrese Teslim" -> "ADRESE", "Fabrika Teslim" -> "FABRİKA" */
export function satisTeslimYazi(teslim: string | null, dogrudan: boolean): string {
  if (dogrudan) return "TMO";
  const t = (teslim || "").trim();
  if (!t) return "";
  const k = t.toLocaleLowerCase("tr");
  if (k.startsWith("adres")) return "ADRESE";
  if (k.startsWith("fabrika")) return "FABRİKA";
  return t.toLocaleUpperCase("tr");
}

/** Raporda gorunur mu: acik hepsi; tamamlanan son `gun` gunde kapandiysa. */
function gorunur(durum: string, kapanis: string | null, bugun: string, gun: number): boolean {
  if (durum === "acik") return true;
  if (durum !== "tamamlandi") return false;
  if (gun < 0) return true; // tumu
  if (!kapanis) return false;
  return trGun(kapanis) >= gunEkle(bugun, -gun);
}

export function satisSatirlari(girdiler: RaporSatisGirdi[], bugun: string, tamamlananGun: number): RaporSatisSatiri[] {
  return girdiler
    .filter((e) => gorunur(e.durum, e.kapanis_zamani, bugun, tamamlananGun))
    .map((e) => {
      const kg = e.hedef_tur === "kg" && e.hedef_kg !== null ? Number(e.hedef_kg) : null;
      const fiyat = e.birim_fiyat === null || e.birim_fiyat === undefined ? null : Number(e.birim_fiyat);
      const sevk = Number(e.sevk_kg) || 0;
      // Tutar: siparis kg x fiyat; arac hedefli is emrinde siparis kg yok -> sevk edilen x fiyat
      const tutarTaban = kg ?? (e.hedef_tur === "arac" ? sevk : null);
      return {
        id: e.id,
        kayitNo: e.is_emri_no,
        fisTarihi: e.siparis_tarihi || trGun(e.olusturma),
        cari: e.musteri,
        siparisNo: e.musteri_siparis_no || "",
        malzeme: e.ambalaj ? `${e.urun} ${e.ambalaj}` : e.urun,
        birim: "KG" as const,
        siparisKg: kg,
        siparisArac: e.hedef_tur === "arac" ? e.hedef_arac : null,
        sevkKg: sevk,
        bekleyenKg: kg === null ? null : Math.max(0, kg - sevk),
        birimFiyat: fiyat,
        vade: vadeExcelYazi(e.vade_gun),
        tutar: fiyat === null || tutarTaban === null ? null : Math.round(tutarTaban * fiyat * 100) / 100,
        termin: e.teslim_suresi_gun ? `${e.teslim_suresi_gun} GÜN` : "",
        teslim: satisTeslimYazi(e.teslim, e.dogrudan),
        tamamlandi: e.durum === "tamamlandi",
      };
    })
    .sort((a, b) => a.fisTarihi.localeCompare(b.fisTarihi) || a.kayitNo.localeCompare(b.kayitNo));
}

export function alisSatirlari(girdiler: RaporAlisGirdi[], bugun: string, tamamlananGun: number): RaporAlisSatiri[] {
  return girdiler
    .filter((a) => gorunur(a.durum, a.kapanis_zamani, bugun, tamamlananGun))
    .map((a) => {
      const kg = Number(a.miktar_kg) || 0;
      const alinan = Number(a.alinan_kg) || 0;
      const fiyat = a.birim_fiyat === null || a.birim_fiyat === undefined ? null : Number(a.birim_fiyat);
      const siparisNo = [a.depo ? `DEPO: ${a.depo}` : "", a.tedarikci_siparis_no || ""].filter(Boolean).join(" · ");
      return {
        id: a.id,
        kayitNo: a.alis_no,
        fisTarihi: a.siparis_tarihi,
        cari: a.tedarikci,
        siparisNo,
        malzeme: alisUrunYazi(a),
        birim: "KG" as const,
        siparisKg: kg,
        alinanKg: alinan,
        bekleyenKg: Math.max(0, kg - alinan),
        birimFiyat: fiyat,
        paraBirimi: a.para_birimi,
        vade: vadeExcelYazi(a.vade_gun),
        termin: a.termin,
        teslim: a.teslim === "fabrika" ? "FABRİKAYA" : "ADRESTEN",
        tutar: fiyat === null ? null : Math.round(kg * fiyat * 100) / 100,
        tamamlandi: a.durum === "tamamlandi",
      };
    })
    .sort((a, b) => a.fisTarihi.localeCompare(b.fisTarihi) || a.kayitNo.localeCompare(b.kayitNo));
}

export type RaporToplam = { siparisKg: number; gerceklesenKg: number; bekleyenKg: number; tutar: Record<string, number>; satir: number; tamamlanan: number };

export function satisToplami(satirlar: RaporSatisSatiri[]): RaporToplam {
  const t: RaporToplam = { siparisKg: 0, gerceklesenKg: 0, bekleyenKg: 0, tutar: {}, satir: satirlar.length, tamamlanan: 0 };
  for (const s of satirlar) {
    t.siparisKg += s.siparisKg || 0;
    t.gerceklesenKg += s.sevkKg;
    if (!s.tamamlandi) t.bekleyenKg += s.bekleyenKg || 0;
    if (s.tutar !== null) t.tutar.TRY = (t.tutar.TRY || 0) + s.tutar;
    if (s.tamamlandi) t.tamamlanan += 1;
  }
  return t;
}

export function alisToplami(satirlar: RaporAlisSatiri[]): RaporToplam {
  const t: RaporToplam = { siparisKg: 0, gerceklesenKg: 0, bekleyenKg: 0, tutar: {}, satir: satirlar.length, tamamlanan: 0 };
  for (const s of satirlar) {
    t.siparisKg += s.siparisKg;
    t.gerceklesenKg += s.alinanKg;
    if (!s.tamamlandi) t.bekleyenKg += s.bekleyenKg;
    if (s.tutar !== null) t.tutar[s.paraBirimi] = (t.tutar[s.paraBirimi] || 0) + s.tutar;
    if (s.tamamlandi) t.tamamlanan += 1;
  }
  return t;
}
