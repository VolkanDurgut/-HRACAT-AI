/**
 * PAZAR 3.2 - Musterilerimiz: aktif / siparissiz (10.11.2026). SAF modul (test edilebilir).
 *
 * Kullanici: "Bizim kendi musterilerimiz farkli bir kartta olmali ... yaninda su an siparisleri var mi
 * yok mu gorebilmeliyiz. Mevcut siparisi yoksa export adresine musteri gondermeye ilk bunlardan baslamaliyiz."
 *
 * AKTIF = su an siparisi var:
 *   - rezervasyonu girilmis ACIK ihracat dosyasi, ya da
 *   - tamamlanmamis ana siparis (proforma) ve sevk edilmemis miktari var (lib/siparis-takip ile ayni hesap).
 *   - 21.11.2026: Siparis Listesi'nde acik siparisi var (pesinat bekliyor / on odeme alindi / rezervasyonlu).
 *     Kullanici: "Siparissiz musteri hala 18 gozukuyor aslinda onaylanan siparisleri var." (GMB, OM GENERAL, STE AYRA)
 * SIPARISSIZ = musteri ama su an siparisi yok -> gunluk "Bugunku musteriniz" icin ilk aday (3.3).
 * Ulke: kartta yoksa son dosyanin varis limanindan / alici adresinden (Kontrol Merkezi ile ayni kural).
 */
import { siparisIlerlemesiHesapla, fclAdedi } from "@/lib/siparis-takip";
import { gidecegiUlke, ticaretYapilanUlke } from "@/lib/ulke-bul";
import type { MusteriListeSiparisi, MusteriSiparisVerisi, PazarFirma } from "@/lib/pazar/veri";

export type AcikDosya = { id: string; dosya_no: string; rezKonteyner: number; yuklenen: number; tarih: string | null };
export type AcikSiparis = { id: string; proforma_no: string; siparisMts: number; kalanMts: number; kalanFcl: number };
/** 21.11.2026 Siparis Listesi'ndeki acik siparis (acik dosyasiyla zaten gorunen satir tekrar edilmez) */
export type ListeSiparisi = { proforma_no: string; durum: MusteriListeSiparisi["durum"]; miktarMt: number | null; konteyner: number | null; tarih: string | null; booking: string | null };

export const LISTE_DURUM_ETIKETI: Record<MusteriListeSiparisi["durum"], string> = {
  onay_bekliyor: "peşinat bekleniyor",
  on_odeme_alindi: "ön ödeme alındı · rezervasyon bekliyor",
  rezervasyonlu: "rezervasyonlu",
};
export type MusteriDurumu = {
  aktif: boolean;
  acikDosyalar: AcikDosya[];
  acikSiparisler: AcikSiparis[];
  /** 21.11.2026: Siparis Listesi'ndeki acik siparisler */
  listeSiparisleri: ListeSiparisi[];
  /** Son siparisin tarihi: son dosya ya da Siparis Listesi / sistem proformasi (hangisi yeniyse). */
  sonSiparis: string | null;
  /** Son siparisten bu yana gecen gun (bugun dahil degil). */
  siparissizGun: number | null;
  toplamDosya: number;
  /** Rezervasyonlarin toplam konteyneri (tum zamanlar). */
  toplamKonteyner: number;
  /** Kartta ulke yoksa siparislerden bulunan ulke. */
  ulke: string | null;
  dosyalar: { id: string; dosya_no: string; durum: string; tarih: string | null; konteyner: number; varis: string | null }[];
  /** 16.11.2026: tum dosyalarin toplam tutari, para birimine gore (kur cevrimi yok; Kontrol Merkezi ile ayni kaynak) */
  hacim: { para: string; tutar: number }[];
};

const GUN = 86400000;

/** Dosya tutarlari para birimine gore (buyukten kucuge). Tutar yok / 0 olan dosya sayilmaz. */
export function dosyaHacmi(dosyalar: { toplam_tutar?: number | string | null; para_birimi?: string | null }[]): { para: string; tutar: number }[] {
  const m = new Map<string, number>();
  for (const d of dosyalar) {
    const t = typeof d.toplam_tutar === "number" ? d.toplam_tutar : d.toplam_tutar ? Number(d.toplam_tutar) : 0;
    if (!Number.isFinite(t) || t <= 0) continue;
    const p = (d.para_birimi || "USD").trim().toUpperCase() || "USD";
    m.set(p, (m.get(p) || 0) + t);
  }
  return Array.from(m.entries()).map(([para, tutar]) => ({ para, tutar })).sort((a, b) => b.tutar - a.tutar);
}

export function firmaAnahtarlari(f: Pick<PazarFirma, "anahtar" | "ek_anahtarlar">): string[] {
  return [f.anahtar, ...(f.ek_anahtarlar || [])].filter(Boolean);
}

export function musteriDurumu(firma: PazarFirma, v: MusteriSiparisVerisi, bugun: Date = new Date()): MusteriDurumu {
  const anahtarlar = new Set(firmaAnahtarlari(firma));
  const dosyalar = v.dosyalar.filter((d) => anahtarlar.has(d.anahtar));
  const dosyaIdleri = new Set(dosyalar.map((d) => d.id));
  const rezKont = new Map<string, number>();
  for (const r of v.rezervasyonlar) {
    if (!dosyaIdleri.has(r.dosya_id)) continue;
    rezKont.set(r.dosya_id, (rezKont.get(r.dosya_id) || 0) + (Number(r.konteyner_adedi) || 0));
  }
  const dbaKont = new Map<string, number>();
  for (const k of v.konteynerler) {
    if (!dosyaIdleri.has(k.dosya_id) || !k.dba_dosya_url) continue;
    dbaKont.set(k.dosya_id, (dbaKont.get(k.dosya_id) || 0) + 1);
  }

  const acikDosyalar: AcikDosya[] = dosyalar
    .filter((d) => d.durum === "Açık" && rezKont.has(d.id))
    .map((d) => ({ id: d.id, dosya_no: d.dosya_no || "-", rezKonteyner: rezKont.get(d.id) || 0, yuklenen: dbaKont.get(d.id) || 0, tarih: d.olusturma_tarihi }));

  const takipDosyalari = dosyalar.map((d) => ({ id: d.id, ana_siparis_id: d.ana_siparis_id, durum: d.durum, urun_detaylari: d.urun_detaylari }));
  const takipKonteynerleri = v.konteynerler.filter((k) => dosyaIdleri.has(k.dosya_id));
  const acikSiparisler: AcikSiparis[] = v.ana_siparisler
    .filter((s) => anahtarlar.has(s.anahtar) && !s.tamamlandi)
    .map((s) => {
      const il = siparisIlerlemesiHesapla(
        { id: s.id, proforma_no: s.proforma_no, urun_tanimi: s.urun_tanimi, toplam_mts: s.toplam_mts, urun_detaylari_master: s.urun_detaylari_master },
        takipDosyalari,
        takipKonteynerleri
      );
      return { id: s.id, proforma_no: s.proforma_no || "-", siparisMts: il.toplamSiparisMts, kalanMts: il.toplamKalanMts, kalanFcl: fclAdedi(il.toplamKalanMts), devam: il.devamEdiyor };
    })
    .filter((s) => s.devam)
    .map((s) => ({ id: s.id, proforma_no: s.proforma_no, siparisMts: s.siparisMts, kalanMts: s.kalanMts, kalanFcl: s.kalanFcl }));

  const acikDosyaNolari = new Set(acikDosyalar.map((d) => d.dosya_no));
  const anaProformalar = new Set(acikSiparisler.map((s) => s.proforma_no));
  const gorulen = new Set<string>();
  const listeSiparisleri: ListeSiparisi[] = [];
  for (const s of v.siparis_listesi || []) {
    if (s.firma_id !== firma.id) continue;
    if (s.dosya_no && acikDosyaNolari.has(s.dosya_no)) continue;
    const no = s.proforma_no || "-";
    if (anaProformalar.has(no)) continue;
    const anahtar = `${no}|${s.durum}|${s.booking_no || ""}|${s.miktar_mt ?? ""}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const mt = s.miktar_mt === null || s.miktar_mt === "" ? null : Number(s.miktar_mt);
    listeSiparisleri.push({ proforma_no: no, durum: s.durum, miktarMt: mt !== null && Number.isFinite(mt) ? mt : null, konteyner: s.konteyner ?? null, tarih: s.proforma_tarihi, booking: s.booking_no });
  }
  const listedenAktif = (v.siparis_listesi || []).some((s) => s.firma_id === firma.id);

  const tarihler = [
    ...dosyalar.map((d) => d.olusturma_tarihi),
    ...(v.siparis_tarihleri || []).filter((t) => t.firma_id === firma.id).map((t) => t.tarih),
  ].filter((t): t is string => !!t).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const sonSiparis = tarihler.length ? tarihler[tarihler.length - 1] : null;
  const siparissizGun = sonSiparis ? Math.max(0, Math.floor((bugun.getTime() - new Date(sonSiparis).getTime()) / GUN)) : null;

  let ulke: string | null = null;
  for (const d of dosyalar) {
    ulke = gidecegiUlke(d.varis_limani) || ticaretYapilanUlke(d.alici_adresi);
    if (ulke) break;
  }

  return {
    aktif: acikDosyalar.length > 0 || acikSiparisler.length > 0 || listedenAktif,
    acikDosyalar,
    acikSiparisler,
    listeSiparisleri,
    sonSiparis,
    siparissizGun,
    toplamDosya: dosyalar.length,
    toplamKonteyner: Array.from(rezKont.values()).reduce((t, n) => t + n, 0),
    ulke,
    dosyalar: dosyalar.map((d) => ({ id: d.id, dosya_no: d.dosya_no || "-", durum: d.durum || "", tarih: d.olusturma_tarihi, konteyner: rezKont.get(d.id) || 0, varis: d.varis_limani })),
    hacim: dosyaHacmi(dosyalar),
  };
}
