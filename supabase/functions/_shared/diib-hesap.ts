/**
 * DIIB TAKIBI - saf hesap modulu (04.11.2026). React / Supabase importu yok (tsx ile test edilir).
 *
 * Kavramlar (Burak Bey'in Excel'iyle AYNI):
 *  - Ihracat taahhudu (kg un)  = ithalat izni (kg bugday) x 97 x 74 / 10000   (Excel: F*97*74/10000)
 *  - Gerceklesen ihracat       = DIIB'e yazilan faturalarin kg toplami
 *  - Kalan ihracat             = taahhut - gerceklesen
 *  - Hak edilen ithalat        = gerceklesen / 74 / 97 x 10000               (Excel: F/74/97*10000)
 *
 * Satir kaynaklari (Excel'den iceri ALINMAZ; kullanici: "Sistem bunu kendi takip etmeli"):
 *  0) DIIB'in "sistem oncesi" devri (devir_kg / devir_tutar): IHR-2026-0065'ten once kesilmis
 *     faturalar sistemde yok; DIIB basina bir kez girilir, gerceklesene eklenir.
 *  1) diib_ihracatlari tablosu (elle eklenen / duzeltilen satir) -> ESAS
 *  2) sistemdeki FATURASI KESILMIS dosyalar -> otomatik satir (kullanici: "otomatik eklensin").
 *     Ayni fatura no ya da ayni dosya tabloda varsa otomatik satir URETILMEZ (cift sayim yok).
 *     Dosya iki DIIB'e bolunduyse (diib_dosya_bolunmeleri) her parca ayri satir (ayri fatura).
 *  3) Faturasi henuz kesilmemis ACIK dosyalar -> "bekleyen yukleme" (kalan hesabina girmez,
 *     bolunme gerekip gerekmedigi buradan gorulur).
 */
import { kalemMiktari, sayiOku } from "./sayi-oku.ts";
import { ticaretYapilanUlke } from "./ulke-bul.ts";

export const DIIB_ORAN = 0.97 * 0.74; // 0,7178

export type DiibBelgesi = {
  id: string;
  belge_no: string;
  anahtar: string;
  belge_tarihi: string | null;
  ithalat_izin_kg: number | string;
  ihracat_taahhut_kg: number | string;
  devir_kg?: number | string | null;
  devir_tutar?: number | string | null;
  kullanim_sirasi: number;
  durum: "aktif" | "tamamlandi";
  aciklama: string | null;
};

export type DiibKaydi = {
  id: string;
  diib_id: string;
  dosya_id: string | null;
  fatura_no: string | null;
  beyanname_no: string | null;
  fatura_tarihi: string | null;
  cari: string;
  stok_adi: string;
  miktar_kg: number | string;
  birim_fiyat: number | string | null;
  tutar: number | string;
  para_birimi: string;
  kaynak: "sistem" | "elle";
  aciklama: string | null;
};

export type DiibDosyasi = {
  id: string;
  dosya_no: string | null;
  durum: string | null;
  fatura_no: string | null;
  fatura_tarihi: string | null;
  beyanname_no: string | null;
  alici_firma: string | null;
  /** Proformadaki alici adresi: "ticaret yapilan ulke" (bayrak) buradan bulunur (05.11.2026). */
  alici_adresi?: string | null;
  urun_detaylari: unknown;
  toplam_tutar: number | string | null;
  para_birimi: string | null;
  diib_no: string | null;
  beyanname_dosya_url?: string | null;
  /** Yuklenen konteynerlerin net toplami (TUM konteynerlerde net > 0 ise; yoksa null). veri.ts doldurur. */
  yuklenenKg?: number | null;
};

export type DiibBolunmesi = { id: string; dosya_id: string; diib_id: string; sira: number; miktar_kg: number | string; fatura_no: string | null; /** Parcanin yuklenen fatura PDF'i (05.11.2026) */ fatura_dosya_url?: string | null };

/** Ekranda gosterilen satir: tablodan ya da otomatik (dosyadan). */
export type DiibSatiri = {
  anahtar: string;              // React key
  kayitId: string | null;       // diib_ihracatlari.id (otomatikte null)
  diibId: string;
  dosyaId: string | null;
  dosyaNo: string | null;
  faturaNo: string | null;
  beyannameNo: string | null;
  faturaTarihi: string | null;
  cari: string;
  /** Ticaret yapilan ulke (alici adresinden; lib/ulke-bul.ts). Bilinmiyorsa null. 05.11.2026 */
  ulke: string | null;
  stokAdi: string;
  miktarKg: number;
  birimFiyat: number | null;    // USD / KG
  tutar: number;
  paraBirimi: string;
  kaynak: "sistem" | "elle" | "otomatik";
  bolunmeSira: number | null;   // bolunmus yuklemenin parcasi
};

/**
 * Kg / miktar girisi: Turkce binlik nokta tanir ("170.900" -> 170900, "7.178.000,5" -> 7178000,5).
 * Yalniz MIKTAR alanlarinda kullanilir (birim fiyat "0.475" bu kalipla eslesmez: ilk hane 0).
 */
export function kgOku(deger: unknown): number {
  const t = String(deger ?? "").trim().replace(/\s+/g, "");
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) return sayiOku(t.replace(/\./g, "").replace(",", "."));
  return sayiOku(t);
}

const yuvarla = (n: number, b = 2) => { const k = 10 ** b; return Math.round((n + Number.EPSILON) * k) / k; };
export const faturaNorm = (s: string | null | undefined) => (s || "").replace(/\s+/g, "").toUpperCase();

/**
 * DIIB anahtari: yil + 5 hane sira ("2026-04219").
 * "2026/D2-04219", "2026 D1-04219", "19.08.2026 TARİH 2026-D2-04219", "DİİB NO: 2026/D2-04219".
 * Yil bulunamazsa null (yalniz siraya gore eslestirme diibBul'da yapilir).
 */
export function diibAnahtari(metin: string | null | undefined): string | null {
  const t = (metin || "").toLocaleUpperCase("tr-TR");
  const m = /(20\d{2})\s*[/\- ]?\s*D\s*\d\s*[/\- ]?\s*(\d{4,6})\b/.exec(t);
  if (!m) return null;
  return `${m[1]}-${m[2].slice(-5).padStart(5, "0")}`;
}
/** Yalniz sira numarasi ("04219"): "D2-04219" gibi yil yazilmamis metinler icin. */
function diibSirasi(metin: string | null | undefined): string | null {
  const m = /D\s*\d\s*[/\- ]?\s*(\d{4,6})\b/i.exec(metin || "");
  return m ? m[1].slice(-5).padStart(5, "0") : null;
}

/** Dosyanin DIIB alanindaki serbest metinden belgeyi bulur (yil+sira, yoksa TEK eslesen sira). */
export function diibBul(metin: string | null | undefined, belgeler: DiibBelgesi[]): DiibBelgesi | null {
  const a = diibAnahtari(metin);
  if (a) return belgeler.find((b) => b.anahtar === a) ?? null;
  const s = diibSirasi(metin);
  if (!s) return null;
  const adaylar = belgeler.filter((b) => b.anahtar.endsWith(`-${s}`));
  return adaylar.length === 1 ? adaylar[0] : null;
}

/** Yuklemenin toplam kg'i (kalemler MTS -> kg). */
export function dosyaKg(urunler: unknown): number {
  const k = Array.isArray(urunler) ? urunler : [];
  return yuvarla(k.reduce((s: number, u) => s + kalemMiktari(u as { miktar_mts?: unknown; quantity?: unknown }), 0) * 1000);
}

/** Yuklemenin tutari: dosyanin toplam tutari, yoksa kalem toplamlari (Excel'deki TUTARI ile ayni). */
export function dosyaTutar(d: Pick<DiibDosyasi, "toplam_tutar" | "urun_detaylari">): number {
  const t = sayiOku(d.toplam_tutar);
  if (t > 0) return yuvarla(t);
  const k = Array.isArray(d.urun_detaylari) ? d.urun_detaylari : [];
  return yuvarla(k.reduce((s: number, u) => s + sayiOku((u as Record<string, unknown>)?.toplam_tutar_usd ?? (u as Record<string, unknown>)?.total_amount), 0));
}

/**
 * Dosya basina yuklenen konteyner net toplami (yuklenenKgleri'nin SAF hesabi): TUM konteynerlerde
 * net > 0 VE girilen konteyner sayisi rezervasyondaki konteyner adedinden az degilse toplam, degilse null.
 * 04.11.2026: 10 konteynerlik rezervasyonda 6'si girilmisti; 6'sinin neti dolu oldugu icin
 * 150 MT "yuklenen" sayildi ve iki DIIB'e bolunen miktarin ikinci parcasi 100 MT eksik cikti.
 */
export function yuklenenHesapla(
  konteynerler: { dosya_id: string | null; net_agirlik_kg: number | string | null }[],
  planlanan: Record<string, number>,
): Record<string, number | null> {
  const top: Record<string, { adet: number; dolu: number; kg: number }> = {};
  for (const x of konteynerler) {
    if (!x.dosya_id) continue;
    const t = (top[x.dosya_id] ||= { adet: 0, dolu: 0, kg: 0 });
    const n = Number(x.net_agirlik_kg);
    t.adet++;
    if (Number.isFinite(n) && n > 0) { t.dolu++; t.kg += n; }
  }
  const sonuc: Record<string, number | null> = {};
  for (const [id, t] of Object.entries(top)) {
    const eksikKonteyner = t.adet < (planlanan[id] || 0);
    sonuc[id] = t.adet > 0 && t.dolu === t.adet && !eksikKonteyner ? Math.round(t.kg * 100) / 100 : null;
  }
  return sonuc;
}

/**
 * DIIB'e yazilan miktar (04.11.2026 duzeltme). Kullanici: "SAAD su an yukleniyor" - proforma 375 MT,
 * bu yuklemede 10 konteyner = 250.000 kg (kalan 5 konteyner sonraki haftada). Eskiden proforma
 * miktari sayiliyordu. Artik: konteynerlerin TAMAMINDA net agirlik girilmisse YUKLENEN net toplam
 * (fatura / beyannamedeki miktar), yoksa proforma miktari. Tutar: faturasi kesilmisse dosya tutari
 * (fatura); kesilmemis ve yuklenen proformadan farkliysa yuklenen orani kadar.
 */
export type DiibMiktari = { kg: number; tutar: number; proformaKg: number; kaynak: "konteyner" | "proforma" };
export function diibMiktari(d: Pick<DiibDosyasi, "toplam_tutar" | "urun_detaylari" | "fatura_no" | "yuklenenKg">): DiibMiktari {
  const proformaKg = dosyaKg(d.urun_detaylari);
  const tutar = dosyaTutar(d);
  const y = d.yuklenenKg ?? 0;
  if (!(y > 0)) return { kg: proformaKg, tutar, proformaKg, kaynak: "proforma" };
  const farkli = Math.abs(y - proformaKg) > 0.5;
  const kesildi = !!faturaNorm(d.fatura_no);
  return { kg: yuvarla(y), tutar: farkli && !kesildi && proformaKg > 0 ? yuvarla(tutar * y / proformaKg) : tutar, proformaKg, kaynak: "konteyner" };
}

/** "BUĞDAY UNU / 25 KG" ya da "BUĞDAY UNU / 25 KG-50 KG" (ambalaj boyutlarindan). */
export function stokAdi(urunler: unknown): string {
  const k = Array.isArray(urunler) ? urunler : [];
  const boyutlar: string[] = [];
  for (const u of k) {
    const r = u as Record<string, unknown>;
    const m = /(\d+(?:[.,]\d+)?)\s*KG/i.exec(String(r?.ambalaj_boyutu ?? r?.packaging_size ?? ""));
    if (m) { const b = `${m[1].replace(".", ",")} KG`; if (!boyutlar.includes(b)) boyutlar.push(b); }
  }
  return boyutlar.length ? `BUĞDAY UNU / ${boyutlar.join("-")}` : "BUĞDAY UNU";
}

const kayitSatiri = (k: DiibKaydi, dosyaNo: string | null, ulke: string | null): DiibSatiri => ({
  anahtar: `k-${k.id}`, kayitId: k.id, diibId: k.diib_id, dosyaId: k.dosya_id, dosyaNo,
  faturaNo: k.fatura_no, beyannameNo: k.beyanname_no, faturaTarihi: k.fatura_tarihi, cari: k.cari, ulke, stokAdi: k.stok_adi,
  miktarKg: sayiOku(k.miktar_kg), birimFiyat: k.birim_fiyat === null || k.birim_fiyat === "" ? null : sayiOku(k.birim_fiyat),
  tutar: sayiOku(k.tutar), paraBirimi: k.para_birimi || "USD", kaynak: k.kaynak, bolunmeSira: null,
});

export type DiibSonucu = {
  satirlar: DiibSatiri[];                    // tum DIIB satirlari (tablo + otomatik)
  eslesmeyen: { dosya: DiibDosyasi; kg: number; tutar: number }[]; // faturali ama DIIB'i bulunamayan
  bekleyen: { dosya: DiibDosyasi; kg: number; tutar: number; diib: DiibBelgesi | null; proformaKg: number }[]; // faturasiz acik dosyalar
};

/** Tablodaki kayitlar + sistemdeki dosyalar -> ekrandaki DIIB satirlari. */
export function diibSatirlari(belgeler: DiibBelgesi[], kayitlar: DiibKaydi[], dosyalar: DiibDosyasi[], bolunmeler: DiibBolunmesi[]): DiibSonucu {
  const dosyaNo = new Map(dosyalar.map((d) => [d.id, d.dosya_no]));
  const dosyaUlke = new Map(dosyalar.map((d) => [d.id, ticaretYapilanUlke(d.alici_adresi)]));
  const satirlar: DiibSatiri[] = kayitlar.map((k) => kayitSatiri(k, k.dosya_id ? dosyaNo.get(k.dosya_id) ?? null : null, k.dosya_id ? dosyaUlke.get(k.dosya_id) ?? null : null));
  const kayitliFatura = new Set(kayitlar.map((k) => faturaNorm(k.fatura_no)).filter(Boolean));
  const kayitliDosyaDiib = new Set(kayitlar.filter((k) => k.dosya_id).map((k) => `${k.dosya_id}|${k.diib_id}`));
  const kayitliDosya = new Set(kayitlar.map((k) => k.dosya_id).filter(Boolean) as string[]);
  const belgeId = new Set(belgeler.map((b) => b.id));
  const eslesmeyen: DiibSonucu["eslesmeyen"] = [];
  const bekleyen: DiibSonucu["bekleyen"] = [];

  for (const d of dosyalar) {
    const { kg, tutar } = diibMiktari(d);
    if (kg <= 0) continue;
    const parcalar = bolunmeler.filter((b) => b.dosya_id === d.id && belgeId.has(b.diib_id)).sort((a, b) => a.sira - b.sira);
    if (!faturaNorm(d.fatura_no)) {
      if (d.durum !== "Kapalı" && d.durum !== "Kapali") bekleyen.push({ dosya: d, kg, tutar, diib: diibBul(d.diib_no, belgeler), proformaKg: dosyaKg(d.urun_detaylari) });
      continue;
    }
    if (parcalar.length) {
      let kalanTutar = tutar;
      parcalar.forEach((p, i) => {
        const pKg = sayiOku(p.miktar_kg);
        const pFatura = p.fatura_no || (p.sira === 1 ? d.fatura_no : null);
        const pTutar = i === parcalar.length - 1 ? yuvarla(kalanTutar) : yuvarla(tutar * pKg / kg);
        kalanTutar -= pTutar;
        if (kayitliDosyaDiib.has(`${d.id}|${p.diib_id}`) || (pFatura && kayitliFatura.has(faturaNorm(pFatura)))) return;
        satirlar.push({
          anahtar: `o-${d.id}-${p.sira}`, kayitId: null, diibId: p.diib_id, dosyaId: d.id, dosyaNo: d.dosya_no,
          faturaNo: pFatura, beyannameNo: d.beyanname_no, faturaTarihi: d.fatura_tarihi, cari: d.alici_firma || "-", ulke: dosyaUlke.get(d.id) ?? null,
          stokAdi: stokAdi(d.urun_detaylari), miktarKg: pKg, birimFiyat: pKg ? yuvarla(pTutar / pKg, 6) : null, tutar: pTutar,
          paraBirimi: d.para_birimi || "USD", kaynak: "otomatik", bolunmeSira: p.sira,
        });
      });
      continue;
    }
    if (kayitliDosya.has(d.id) || kayitliFatura.has(faturaNorm(d.fatura_no))) continue;
    const b = diibBul(d.diib_no, belgeler);
    if (!b) { eslesmeyen.push({ dosya: d, kg, tutar }); continue; }
    satirlar.push({
      anahtar: `o-${d.id}`, kayitId: null, diibId: b.id, dosyaId: d.id, dosyaNo: d.dosya_no,
      faturaNo: d.fatura_no, beyannameNo: d.beyanname_no, faturaTarihi: d.fatura_tarihi, cari: d.alici_firma || "-", ulke: dosyaUlke.get(d.id) ?? null,
      stokAdi: stokAdi(d.urun_detaylari), miktarKg: kg, birimFiyat: yuvarla(tutar / kg, 6), tutar,
      paraBirimi: d.para_birimi || "USD", kaynak: "otomatik", bolunmeSira: null,
    });
  }
  satirlar.sort((a, b) => (a.faturaTarihi || "9999").localeCompare(b.faturaTarihi || "9999") || (a.faturaNo || "").localeCompare(b.faturaNo || ""));
  return { satirlar, eslesmeyen, bekleyen };
}

export type DiibOzeti = {
  belge: DiibBelgesi;
  taahhutKg: number;
  devirKg: number;         // sistem oncesi (bir kez girilir)
  devirTutar: number;
  gerceklesenKg: number;   // devir + satirlar
  kalanKg: number;
  tutar: number;
  ortalamaFiyat: number | null;
  hakEdilenIthalatKg: number;
  yuzde: number;           // 0..100+
  satirSayisi: number;
  faturasizSatir: number;  // fatura no bos satirlar (cift sayim olabilir)
  bekleyenKg: number;      // faturasi kesilmemis acik dosyalar (bu DIIB'e yazilmis)
};

export function diibOzetleri(belgeler: DiibBelgesi[], sonuc: DiibSonucu): DiibOzeti[] {
  return [...belgeler].sort(diibSiralama).map((b) => {
    const s = sonuc.satirlar.filter((x) => x.diibId === b.id);
    const devirKg = sayiOku(b.devir_kg);
    const devirTutar = sayiOku(b.devir_tutar);
    const kg = yuvarla(devirKg + s.reduce((t, x) => t + x.miktarKg, 0));
    const tutar = yuvarla(devirTutar + s.reduce((t, x) => t + x.tutar, 0));
    const taahhut = sayiOku(b.ihracat_taahhut_kg);
    return {
      belge: b, taahhutKg: taahhut, devirKg, devirTutar, gerceklesenKg: kg, kalanKg: yuvarla(taahhut - kg), tutar,
      ortalamaFiyat: kg > 0 ? yuvarla(tutar / kg, 6) : null, hakEdilenIthalatKg: yuvarla(kg / 74 / 97 * 10000),
      yuzde: taahhut > 0 ? (kg / taahhut) * 100 : 0, satirSayisi: s.length,
      faturasizSatir: s.filter((x) => !faturaNorm(x.faturaNo)).length,
      bekleyenKg: yuvarla(sonuc.bekleyen.filter((x) => x.diib?.id === b.id).reduce((t, x) => t + x.kg, 0)),
    };
  });
}

/** Kullanim sirasi, sonra belge tarihi. */
export const diibSiralama = (a: DiibBelgesi, b: DiibBelgesi) =>
  (a.kullanim_sirasi - b.kullanim_sirasi) || (a.belge_tarihi || "").localeCompare(b.belge_tarihi || "") || a.anahtar.localeCompare(b.anahtar);

export type BolunmeParcasi = { diib: DiibBelgesi; kg: number };
export type BolunmeOnerisi =
  | { tur: "tek"; diib: DiibBelgesi; kalanKg: number }
  | { tur: "bolunmeli"; parcalar: BolunmeParcasi[]; eksikKg: number }
  | { tur: "diib_yok" };

/**
 * Yukleme (kg) icin DIIB dagilimi. Dosyanin kendi DIIB'i once dolar; kalan yetmezse fazla,
 * kullanim sirasina gore kalani olan SONRAKI aktif DIIB'lere yazilir (her parca = ayri fatura).
 * `haric`: bu dosyanin halihazirda sayilmis satirlari (fatura kesilmis dosyada kendi payi) kalandan duselmez.
 */
export function bolunmeOnerisi(kg: number, kendiDiib: DiibBelgesi | null, ozetler: DiibOzeti[], kendiPayi: Record<string, number> = {}): BolunmeOnerisi {
  if (!kendiDiib) return { tur: "diib_yok" };
  const kalan = (b: DiibBelgesi) => {
    const o = ozetler.find((x) => x.belge.id === b.id);
    return o ? yuvarla(o.kalanKg + (kendiPayi[b.id] || 0)) : 0;
  };
  const ilkKalan = kalan(kendiDiib);
  if (kg <= ilkKalan + 0.005) return { tur: "tek", diib: kendiDiib, kalanKg: ilkKalan };
  const parcalar: BolunmeParcasi[] = [];
  let ihtiyac = yuvarla(kg);
  if (ilkKalan > 0) { parcalar.push({ diib: kendiDiib, kg: ilkKalan }); ihtiyac = yuvarla(ihtiyac - ilkKalan); }
  const sonrakiler = ozetler.map((o) => o.belge).filter((b) => b.id !== kendiDiib.id && b.durum === "aktif").sort(diibSiralama);
  for (const b of sonrakiler) {
    if (ihtiyac <= 0) break;
    const k = kalan(b);
    if (k <= 0) continue;
    const al = Math.min(k, ihtiyac);
    parcalar.push({ diib: b, kg: yuvarla(al) });
    ihtiyac = yuvarla(ihtiyac - al);
  }
  return { tur: "bolunmeli", parcalar, eksikKg: Math.max(0, ihtiyac) };
}

/** Faturasi kesilmemis yuklemenin sira bilgisi (rezervasyondan). Sira: talimat cut-off -> ETD (once yuklenen once faturalanir). */
export type BekleyenSira = { talimatCutoff: string | null; beyanCutoff: string | null; etd: string | null };
export type SiraliBekleyen = DiibSonucu["bekleyen"][number] & {
  sira: BekleyenSira | null;
  kayitli: DiibBolunmesi[];            // kaydedilmis bolunme (2+ parca) varsa
  oneri: BolunmeOnerisi | null;        // kayitli varsa null
  oncekiler: string[];                 // ayni DIIB'den once dusulen bekleyen dosya no'lari
  kalanOnce: number | null;            // kendi DIIB'inin bu yuklemeden ONCEKI kalani (oncekiler dusulmus)
};

/**
 * Bekleyen yuklemeleri SIRAYLA dagitir (04.11.2026; kullanici: "faturasi kesilmemis yuklemeler
 * kisminda farkli gozukuyor"). Eskiden her yukleme ayni kalana gore ayri ayri hesaplaniyordu; iki
 * yukleme ayni kalani paylasinca ikisi de "tek fatura" gorunebiliyordu. Simdi: talimat cut-off ->
 * ETD -> dosya no sirasiyla (once yuklenen once faturalanir; ilk surumdeki beyan cut-off sirasi
 * kullanici itiraziyla birakildi: "SAAD su an yukleniyor, faturasi daha once kesilecek"); her
 * yuklemenin payi (kayitli bolunme, tek fatura ya da bolunme onerisi) sonrakilerin kalanindan dusulur.
 */
export function siraliBekleyenler(sonuc: DiibSonucu, ozetler: DiibOzeti[], bolunmeler: DiibBolunmesi[], sira: Record<string, BekleyenSira>): SiraliBekleyen[] {
  const anahtar = (d: DiibSonucu["bekleyen"][number]) => {
    const s = sira[d.dosya.id];
    return [s?.talimatCutoff || s?.etd || "9999", s?.etd || "9999", d.dosya.dosya_no || ""];
  };
  const dizi = [...sonuc.bekleyen].sort((a, b) => {
    const x = anahtar(a), y = anahtar(b);
    return x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]);
  });
  const dus: Record<string, number> = {};
  const oncekiDosya: Record<string, string[]> = {};
  return dizi.map((b) => {
    const kayitli = bolunmeler.filter((x) => x.dosya_id === b.dosya.id).sort((x, y) => x.sira - y.sira);
    const oncekiler = b.diib ? [...(oncekiDosya[b.diib.id] || [])] : [];
    const kalanOnce = b.diib ? yuvarla((ozetler.find((o) => o.belge.id === b.diib!.id)?.kalanKg ?? 0) - (dus[b.diib.id] || 0)) : null;
    const ekle = (diibId: string, kg: number) => {
      dus[diibId] = yuvarla((dus[diibId] || 0) + kg);
      const no = b.dosya.dosya_no || "-";
      const liste = (oncekiDosya[diibId] ||= []);
      if (!liste.includes(no)) liste.push(no);
    };
    if (kayitli.length > 1) {
      kayitli.forEach((p) => ekle(p.diib_id, sayiOku(p.miktar_kg)));
      return { ...b, sira: sira[b.dosya.id] ?? null, kayitli, oneri: null, oncekiler, kalanOnce };
    }
    const ayarli = ozetler.map((o) => ({ ...o, kalanKg: yuvarla(o.kalanKg - (dus[o.belge.id] || 0)) }));
    const oneri = bolunmeOnerisi(b.kg, b.diib, ayarli);
    if (oneri.tur === "tek") ekle(oneri.diib.id, b.kg);
    else if (oneri.tur === "bolunmeli") oneri.parcalar.forEach((p) => ekle(p.diib.id, p.kg));
    return { ...b, sira: sira[b.dosya.id] ?? null, kayitli: [], oneri, oncekiler, kalanOnce };
  });
}

/**
 * GUNCEL DIIB (05.11.2026). Kullanici: "Ayarlar'daki DIIB numarasi kaldirilmali; her ihracat dosyasinda
 * guncel DIIB otomatik doldurulmali." Kullanim sirasina gore ILK aktif DIIB'den, faturasi kesilmis
 * satirlar VE faturasi kesilmemis bekleyen yuklemelerin paylari (siraliBekleyenler: kayitli bolunme /
 * tek / bolunme onerisi) dusuldukten sonra kalani olan. Hepsi dolmussa null (DIIB Takibi'ne yeni DIIB).
 */
export function guncelDiib(ozetler: DiibOzeti[], sirali: SiraliBekleyen[]): DiibBelgesi | null {
  const dus: Record<string, number> = {};
  const ekle = (id: string, kg: number) => { dus[id] = yuvarla((dus[id] || 0) + kg); };
  for (const b of sirali) {
    if (b.kayitli.length > 1) b.kayitli.forEach((p) => ekle(p.diib_id, sayiOku(p.miktar_kg)));
    else if (b.oneri?.tur === "tek") ekle(b.oneri.diib.id, b.kg);
    else if (b.oneri?.tur === "bolunmeli") b.oneri.parcalar.forEach((p) => ekle(p.diib.id, p.kg));
  }
  const aday = ozetler.map((o) => o.belge).filter((b) => b.durum === "aktif").sort(diibSiralama)
    .find((b) => yuvarla((ozetler.find((o) => o.belge.id === b.id)?.kalanKg ?? 0) - (dus[b.id] || 0)) > 0.005);
  return aday ?? null;
}

/** Dosyanin DIIB No alanina yazilan metin (mevcut dosyalardaki bicim): "19.08.2026 TARİH 2026-D2-04219". */
export function diibAlanMetni(b: Pick<DiibBelgesi, "belge_no" | "belge_tarihi">): string {
  const no = String(b.belge_no || "").trim().replace(/\s*\/\s*/g, "-");
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(b.belge_tarihi || "");
  return t ? `${t[3]}.${t[2]}.${t[1]} TARİH ${no}` : no;
}

/** Bolunen yuklemenin parca tutarlari (kg oraninda; son parca yuvarlama farkini alir -> toplam birebir). */
export function parcaTutarlari(toplam: number, kgler: number[]): number[] {
  const kgT = kgler.reduce((a, b) => a + b, 0);
  let kalan = yuvarla(toplam);
  return kgler.map((k, i) => {
    if (i === kgler.length - 1) return yuvarla(kalan);
    const t = kgT > 0 ? yuvarla(toplam * k / kgT) : 0;
    kalan = yuvarla(kalan - t);
    return t;
  });
}

export const kgYaz = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
