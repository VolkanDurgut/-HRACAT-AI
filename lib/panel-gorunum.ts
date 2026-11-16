/**
 * ANA PANEL düzeni (16.11.2026 gece, kullanıcı: "Kontrol Merkezi ve Pazar'daki standart mimari"). HESAPLAR AYNI:
 * filtre kuralları eski sayfa içi kodun, cut-off uyarıları eski özet kartının (components/panel-ozet-kartlari.tsx)
 * birebir taşınmış hâli. Saf modül (test: tests/panel-gorunum.test.ts).
 */
import { isCutoffApproaching, talimatCutoffTamamMi, beyannameCutoffTamamMi } from "@/lib/cutoff-utils";
import { dosyaAkisiHesapla, rezervasyonlariSirala, type AkisRezervasyonu } from "@/lib/dashboard-akis";
import { noParcala } from "@/lib/coklu-no";

export type PanelFiltre = "tumu" | "cutoff" | "rezervasyon" | "acik";
export const PANEL_FILTRELERI: { key: PanelFiltre; label: string }[] = [
  { key: "tumu", label: "Tümü" },
  { key: "cutoff", label: "Cut-Off Yaklaşan" },
  { key: "rezervasyon", label: "Rezervasyon Bekleyen" },
  { key: "acik", label: "Açık" },
];

/** Adresteki ?filtre= (yeni) ya da ?filter= (eski bağlantılar). Bilinmeyen -> "tumu". */
export function panelFiltresi(filtre: string | null | undefined, eski?: string | null): PanelFiltre {
  const v = filtre || eski || "";
  return v === "cutoff" || v === "rezervasyon" || v === "acik" ? v : "tumu";
}

type FiltreDosyasi = Parameters<typeof talimatCutoffTamamMi>[0] & Parameters<typeof beyannameCutoffTamamMi>[0] & {
  durum: string | null;
  rezervasyonlar: { talimat_cutoff: string | null; beyanname_cutoff: string | null }[];
};

/** Eski sayfa içi filtrenin AYNISI. Talimatı verilmiş / beyannamesi yüklenmiş cut-off "yaklaşan" sayılmaz (16.10.2026). */
export function panelFiltrele<T extends FiltreDosyasi>(dosyalar: T[], filtre: PanelFiltre): T[] {
  switch (filtre) {
    case "cutoff": return dosyalar.filter((d) => {
      const tamam = { talimat: talimatCutoffTamamMi(d), beyanname: beyannameCutoffTamamMi(d) };
      return d.rezervasyonlar.some((r) => isCutoffApproaching(r.talimat_cutoff, r.beyanname_cutoff, tamam));
    });
    case "rezervasyon": return dosyalar.filter((d) => d.rezervasyonlar.length === 0 && (d.durum === "Açık" || d.durum === "Acik"));
    case "acik": return dosyalar.filter((d) => d.durum === "Açık" || d.durum === "Acik");
    default: return dosyalar;
  }
}

// Dil bagimsiz: "ihr" (tr-TR buyutmede "İHR" olurdu) = "IHR"; aksanlar atilir, yalniz harf + rakam karsilastirilir
const temiz = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** ?dosya= eşleşmesi: dosya kimliği, dosya no ya da proforma no (çoklu "A / B" ise herhangi biri); boşluk / tire duyarsız. */
export function dosyaEslesir(d: { id: string; dosya_no: string | null; proforma_no: string | null }, aranan: string | null | undefined): boolean {
  const a = (aranan || "").trim();
  if (!a) return false;
  if (d.id === a) return true;
  const t = temiz(a);
  if (!t) return false;
  return [d.dosya_no || "", ...noParcala(d.proforma_no)].some((x) => x && temiz(x) === t);
}

// ---------------------------------------------------------------------------------------------------------------
// Cut-off uyarıları (eski özet kartının hesabı; kart artık yalnız sayaç, liste uyarı çubuğunda)
export const CUTOFF_UYARI_GUN = 2;
export type CutoffUyarisi = { dosyaId: string; dosyaNo: string; musteri: string | null; tur: "Talimat" | "Beyanname"; gun: number; saat: string | null };
export const gunMetni = (gun: number) => (gun < 0 ? `${-gun}g geçti` : gun === 0 ? "bugün" : `${gun}g`);

type UyariDosyasi = {
  id: string; dosya_no: string | null; alici_firma: string | null;
  fatura_dosya_url: string | null; konsimento_dosya_url: string | null; draft_bl_dosya_url: string | null; beyanname_dosya_url: string | null;
  rezervasyonlar: (AkisRezervasyonu & { talimat_cutoff: string | null; beyanname_cutoff: string | null })[];
  konteynerler: { dba_dosya_url?: string | null }[];
};

const enErken = (degerler: (string | null)[]) => degerler.filter((x): x is string => !!x).sort()[0] || null;

/** <= 2 takvim günü kalan / geçen ve ilgili adımı bitmemiş cut-off'lar (dashboard-akis ile aynı kural), en acil önce. */
export function cutoffUyarilari(dosyalar: UyariDosyasi[]): CutoffUyarisi[] {
  return dosyalar.flatMap((d) => {
    const rezervasyonlar = rezervasyonlariSirala(d.rezervasyonlar);
    const akis = dosyaAkisiHesapla({
      rezervasyonlar, konteynerler: d.konteynerler, faturaVar: !!d.fatura_dosya_url, konsimentoVar: !!d.konsimento_dosya_url,
      draftBlVar: !!d.draft_bl_dosya_url, beyannameVar: !!d.beyanname_dosya_url,
    });
    return ([["Talimat", akis.talimat, enErken(d.rezervasyonlar.map((r) => r.talimat_cutoff))], ["Beyanname", akis.beyanname, enErken(d.rezervasyonlar.map((r) => r.beyanname_cutoff))]] as const)
      .filter(([, c]) => !c.tamam && c.gun !== null && c.gun <= CUTOFF_UYARI_GUN)
      .map(([tur, c, saat]) => ({ dosyaId: d.id, dosyaNo: d.dosya_no || "-", musteri: d.alici_firma, tur, gun: c.gun as number, saat }));
  }).sort((a, b) => a.gun - b.gun);
}

// ---------------------------------------------------------------------------------------------------------------
// Kompakt evrak rozetleri (KT · FT · BL · BY)
export const EVRAK_KISA: Record<string, string> = { "Konşimento Talimatı": "KT", "Fatura": "FT", "Draft BL": "BL", "Beyanname": "BY" };
