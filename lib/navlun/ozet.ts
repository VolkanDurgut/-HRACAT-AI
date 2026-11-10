/**
 * NAVLUN BILDIRIMI - liman bazinda ozet (10.11.2026). Saf fonksiyon (veri yok).
 *
 * Girdi: navlun_teklifleri satirlari (maillerden okunan olaylar; migration 20261110150000).
 * Cikti: liman basina -> son hedefimiz, son kabulumuz, her acentenin (ekipman basina) SON fiyati,
 * fiyati olmayan acentelerin son durumu (servis yok / yer yok / hedef soruyor / fiyat ekte).
 * "Hedefiniz uygundur" (hedef_kabul) -> o andaki son hedefimiz o acentenin fiyati sayilir.
 */

export type NavlunSatiri = {
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
  gecerlilik: string | null;
  lokal_dahil: boolean | null;
  kaynak: string;
  tarih: string;
  /** "teklif" | "karsi_teklif" | "hedef_kabul" */
  tur: string;
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
  enIyi20: AcenteFiyati | null;
};

const FIYATLI = new Set(["teklif", "karsi_teklif"]);
export const DURUM_ETIKETI: Record<string, string> = {
  servis_yok: "Servis yok",
  yer_yok: "Yer yok",
  hedef_soru: "Hedef soruyor",
  ek_teklif: "Fiyat ekte",
  hedef_kabul: "Hedefi kabul etti",
  karsi_teklif: "Karşı teklif",
};

export function limanOzetleri(satirlar: NavlunSatiri[]): LimanOzeti[] {
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
        fiyat.set(`${s.acente}|${ekipman}|${s.armator || ""}`, {
          acente: s.acente, ekipman, tutar, armator: s.armator, free_time_gun: s.free_time_gun, gecerlilik: s.gecerlilik,
          lokal_dahil: s.lokal_dahil, kaynak: s.kaynak, tarih: s.tarih, tur: s.tur,
        });
        sonFiyatTarihi.set(s.acente, s.tarih);
      } else if (s.tur !== "hedef" && s.tur !== "kabul") {
        durum.set(s.acente, { acente: s.acente, tur: s.tur, tarih: s.tarih });
      }
    }
    const fiyatlar = Array.from(fiyat.values()).sort((a, b) =>
      (a.ekipman === "20DC" ? 0 : 1) - (b.ekipman === "20DC" ? 0 : 1) || a.ekipman.localeCompare(b.ekipman) || a.tutar - b.tutar);
    // Fiyati olan acentenin, fiyattan ONCEKI durumu (ornegin "hedef soruyor") gosterilmez
    const durumlar = Array.from(durum.values()).filter((d) => !sonFiyatTarihi.has(d.acente) || d.tarih > (sonFiyatTarihi.get(d.acente) as string))
      .sort((a, b) => b.tarih.localeCompare(a.tarih));
    const yirmi = fiyatlar.filter((f) => f.ekipman === "20DC");
    sonuc.push({
      anahtar,
      ad: (liste[liste.length - 1].liman || anahtar).toLocaleUpperCase("tr-TR"),
      sonTarih: liste[liste.length - 1].tarih,
      hedef, kabul, fiyatlar, durumlar,
      enIyi20: yirmi.length ? yirmi[0] : null,
    });
  }
  return sonuc.sort((a, b) => b.sonTarih.localeCompare(a.sonTarih));
}
