/**
 * NAVLUN TABLOSU OKUMA (18.11.2026) - edge fonksiyonlari icin ortak yukleyici. Siparis raporunun "rezervasyon bekleyen
 * siparislerin en yeni navlun fiyatlari" bolumu bunu kullanir. Hesap navlun-tablosu edge'indeki sirketTablosu +
 * karsilastirmaBaglami ile AYNI (ayni tablolar, ayni sira, ayni karsilastirma baglami); ag erisimi cagirandan gelir
 * (service_role ile yalniz okuma). Karsilastirma baglami okunamazsa null: yalniz mail metni (belirsiz en iyi secilmez).
 */
import { baglamKur, type AcenteHafizasi, type LimanKurali } from "./navlun-karsilastirma.ts";
import { degerlendirmeleriBagla, esleriYukle, navlunTablosuHesapla, type AdEsi, type NavlunOlayi, type NavlunTablosu, type PlanNavlunSatiri } from "./navlun-tablosu.ts";
import { limanAnahtari } from "./liman-anahtari.ts";

export type Cekici = <T>(yol: string) => Promise<T[]>;
export type RpcCekici = (ad: string, companyId: string) => Promise<Record<string, unknown>[]>;

const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const sayiMi = (v: unknown) => (v == null || v === "" ? null : Number(v));

export async function navlunTablosuOku(cek: Cekici, rpc: RpcCekici, companyId: string, tarih: string): Promise<NavlunTablosu> {
  const [olaylarHam, planHam, mesajlar] = await Promise.all([
    cek<Record<string, unknown>>(`navlun_teklifleri?select=id,tur,liman,liman_anahtar,acente,armator,tutar,para_birimi,ekipman,free_time_gun,transit_gun,tarih,mesaj_id,lokal_dahil&company_id=eq.${companyId}&order=tarih,id`),
    rpc("yukleme_plani_veri", companyId),
    cek<{ mesaj_id: string; konu: string | null }>(`navlun_mesajlari?select=mesaj_id,konu&company_id=eq.${companyId}&order=id`),
  ]);
  const konular = new Map(mesajlar.map((m) => [m.mesaj_id, m.konu]));
  const olaylar = olaylarHam.map((o) => ({ ...o, tutar: o.tutar == null ? null : Number(o.tutar), konu: konular.get(String(o.mesaj_id)) ?? null })) as unknown as NavlunOlayi[];
  // 25.11.2026: teklif degerlendirmesi sunucudan (Navlun sayfasiyla AYNI sayi); okunamazsa eski yol
  try { degerlendirmeleriBagla(olaylar, await cek<Record<string, unknown>>(`navlun_teklif_degerlendirme?select=teklif_id,toplam_usd,lokal,ek,lokal_durum,metin,dayanak,celiski,yaklasik,durum,en_iyi,gecerlilik_bitis&company_id=eq.${companyId}&order=teklif_id`)); }
  catch (e) { console.error("navlun-veri: teklif degerlendirmesi okunamadi:", e instanceof Error ? e.message : e); }
  const plan: PlanNavlunSatiri[] = planHam.map((p) => ({
    varis_limani: metin(p.varis_limani), acente: metin(p.acente), navlun: p.navlun == null || p.navlun === "" ? null : Number(p.navlun) || null,
    navlun_para: metin(p.navlun_para), etd: metin(p.etd), kaynak: metin(p.kaynak), booking_no: metin(p.booking_no), musteri: metin(p.musteri),
    konteyner: p.konteyner == null || p.konteyner === "" ? null : Number(p.konteyner) || null, dosya_no: metin(p.dosya_no),
    hafta: p.hafta == null ? null : Number(p.hafta) || null, yil: p.yil == null ? null : Number(p.yil) || null,
  }));
  // Liman / firma es sozlugu; okunamazsa sabit eslerle devam
  try { esleriYukle(await cek<AdEsi>(`ad_esleri?select=tur,kaynak,hedef&company_id=eq.${companyId}&order=id`)); }
  catch (e) { esleriYukle([]); console.error("navlun-veri: es sozlugu okunamadi:", e instanceof Error ? e.message : e); }
  const tablo = navlunTablosuHesapla(olaylar, plan.filter((p) => p.kaynak !== "siparis"), tarih);
  tablo.baglam = await karsilastirmaBaglami(cek, companyId, olaylar);
  return tablo;
}

async function karsilastirmaBaglami(cek: Cekici, companyId: string, olaylar: NavlunOlayi[]) {
  try {
    const [hafiza, kurallar, kanit] = await Promise.all([
      cek<AcenteHafizasi & { lokal_20: number | string | null; lokal_40: number | string | null; ek_kont: number | string }>(
        `navlun_acente_hafizasi?select=acente_anahtar,acente_ad,lokal,lokal_20,lokal_40,ek_kont,guven,kanit&company_id=eq.${companyId}&order=acente_anahtar`),
      cek<LimanKurali>(`navlun_liman_kurallari?select=liman_anahtar,temel,aciklama&company_id=eq.${companyId}&order=liman_anahtar`),
      cek<{ acente: string | null; varis_limani: string | null; etd: string | null; navlun_kont: number | string | null; lokal_kont: number | string | null; navlun_para: string | null }>(
        `sevkiyat_plani?select=acente,varis_limani,etd,navlun_kont,lokal_kont,navlun_para&company_id=eq.${companyId}&navlun_kont=not.is.null&order=id`),
    ]);
    return baglamKur(
      hafiza.map((h) => ({ ...h, lokal_20: sayiMi(h.lokal_20), lokal_40: sayiMi(h.lokal_40), ek_kont: Number(h.ek_kont || 0) })),
      kurallar,
      olaylar.filter((o) => (o.tur === "teklif" || o.tur === "karsi_teklif") && o.tutar).map((o) => ({
        acente: o.acente, tutar: o.tutar as number, para_birimi: o.para_birimi, ekipman: o.ekipman, lokal_dahil: o.lokal_dahil ?? null, liman_anahtar: o.liman_anahtar, tarih: o.tarih,
      })),
      kanit.map((k) => ({ acente: k.acente, liman_anahtar: limanAnahtari(k.varis_limani), etd: k.etd, navlun: sayiMi(k.navlun_kont), lokal: sayiMi(k.lokal_kont), para: k.navlun_para })),
    );
  } catch (e) {
    console.error("navlun-veri: karsilastirma baglami okunamadi:", e instanceof Error ? e.message : e);
    return null;
  }
}
