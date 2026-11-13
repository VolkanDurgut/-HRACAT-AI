/**
 * Ayarlar > Rapor Alicilari (11.11.2026). Butun otomatik maillerin alici (To) + CC listesi ve test-modlu raporlarda canli /
 * test secimi. Kayit: rapor_alicilari_liste / rapor_alicilari_kaydet RPC (yalniz super admin).
 * 12.11.2026 (kullanici: "Butun raporlar orada gozuksun; tiklandiginda ALICI - CC ayarlanabilsin; bizim maillerimiz hizli
 * tiklanabilir olarak kayitli olmali; tek ekrana sigmali"): 11 mail turu, CC, adres defteri (rapor_adres_defteri_* RPC).
 * Onizleme ({deneme: true}) mail GONDERMEZ, HTML doner; test ({test: true}) "[TEST]" maili YALNIZ test adresine gider.
 */
import { supabase } from "@/lib/supabase";

export type RaporTuru =
  | "gunluk_ihracat" | "siparis" | "navlun" | "navlun_haftalik" | "diib" | "vgm" | "konsimento_hatirlatma"
  | "fatura_onay" | "fatura_dagitim" | "pazar_gorev" | "musteri_durum" | "satin_alma";
export type RaporAlicisi = { rapor: RaporTuru; alicilar: string[]; cc: string[]; canli: boolean; kayitli: boolean; guncelleyen: string | null; guncelleme: string | null };

export type RaporGrubu = "Günlük raporlar" | "Operasyon" | "Satış ve müşteri";
export type RaporTanimi = {
  rapor: RaporTuru; ad: string; grup: RaporGrubu; aciklama: string; saat: string;
  /** Onizle / Test maili olan raporlarin edge'i */
  edge: string | null;
  /** Onizle / test cagrisina eklenen sabit parametre (13.11.2026: ayni edge'deki haftalik navlun tablosu -> {haftalik: true}) */
  govde?: Record<string, unknown>;
  /** true: Canli / Test anahtari var (kapaliyken yalniz test adresine gider). false: her zaman canli, yalniz alicilar */
  testModu: boolean;
  /** Alici listesi yerine sabit aciklama (alicisi raporun kendisinden gelir) */
  otomatikAlici?: string;
  /**
   * Buradaki ayarin maile yansimasi (12.11.2026, asamali gecis): "tam" = Alici + CC; "alici" = yalniz Alici (CC sonraki
   * guncellemede); "yakinda" = mail bugun sunucu ayarindaki sabit alicilara gider, duzenleme sonraki guncellemede acilir.
   */
  etkin: "tam" | "alici" | "yakinda";
};

export const RAPORLAR: RaporTanimi[] = [
  { rapor: "gunluk_ihracat", ad: "Günlük İhracat Raporu", grup: "Günlük raporlar", aciklama: "Kontrol Merkezi özeti: dosyalar, sevkiyatlar, tahsilat", saat: "Her gün 09:00, 12:00 ve 17:00", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "siparis", ad: "Sipariş Raporu", grup: "Günlük raporlar", aciklama: "Günün özeti (4 gösterge) + gelen ön ödemeler + Excel", saat: "Her gün 08:00 ve 17:00", edge: "siparis-rapor", testModu: true, etkin: "alici" },
  { rapor: "navlun", ad: "Navlun Raporu", grup: "Günlük raporlar", aciklama: "Satın alınan navlunlar + rezervasyon bekleyen müşteriler + Excel", saat: "Her gün 17:00", edge: "navlun-tablosu", testModu: true, etkin: "tam" },
  { rapor: "navlun_haftalik", ad: "Haftalık Navlun Tablosu", grup: "Günlük raporlar", aciklama: "Bütün navlunlar tek Excel'de (Navlun Bildirimi › Excel indir ile aynı dosya)", saat: "Her Cumartesi 09:00", edge: "navlun-tablosu", govde: { haftalik: true }, testModu: true, etkin: "tam" },
  { rapor: "diib", ad: "DİİB Raporu", grup: "Günlük raporlar", aciklama: "DİİB kapatma ve süre takibi", saat: "Her gün 17:00", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "vgm", ad: "VGM Bildirimi", grup: "Operasyon", aciklama: "Konteynerleri tamamlanan dosyanın VGM PDF'i", saat: "Konteynerler tamamlanınca", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "konsimento_hatirlatma", ad: "Konşimento Hatırlatma", grup: "Operasyon", aciklama: "Fatura talimatından sonra konşimento talimatı bekleyen dosyalar", saat: "Talimat gönderilince", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "fatura_onay", ad: "Fatura Talimatı Onayı", grup: "Operasyon", aciklama: "İncele ve Onayla maili (onay / revize)", saat: "Konteynerler tamamlanınca (10 dk içinde)", edge: null, testModu: true, etkin: "alici" },
  { rapor: "fatura_dagitim", ad: "Onaylı Fatura Talimatı", grup: "Operasyon", aciklama: "Onaylanan talimat PDF ekli: “FATURA VE BEYANNAME TALİMATI HAKKINDA // …”", saat: "Talimat onaylanınca", edge: null, testModu: true, etkin: "alici" },
  { rapor: "pazar_gorev", ad: "Pazar Görev Maili", grup: "Satış ve müşteri", aciklama: "Ekibe günün müşteri görevleri", saat: "İş günleri sabah", edge: null, testModu: false, otomatikAlici: "Görev atanan ekip üyesi", etkin: "yakinda" },
  { rapor: "musteri_durum", ad: "Müşteri Durum Raporu", grup: "Satış ve müşteri", aciklama: "Siparişi olan her müşteriye İngilizce sipariş durumu", saat: "Canlıya alınınca belirlenecek", edge: "musteri-durum-rapor", testModu: true, otomatikAlici: "Müşterinin kendisi", etkin: "tam" },
  { rapor: "satin_alma", ad: "Satın Alma Talebi", grup: "Satış ve müşteri", aciklama: "Satın alma listesi gönderim maili (sonuç maili ayrı)", saat: "Liste gönderilince", edge: null, testModu: false, etkin: "yakinda" },
];
export const AZAMI_ALICI = 10;

const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const epostaGecerli = (s: string) => EPOSTA_RE.test(s.trim());

/** "a@x.com, b@y.com; c@z.com" -> temiz, tekil, kucuk harf liste + gecersizler */
export function adresAyikla(metin: string): { gecerli: string[]; gecersiz: string[] } {
  const parca = metin.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const gecerli = Array.from(new Set(parca.filter((x) => EPOSTA_RE.test(x))));
  return { gecerli, gecersiz: parca.filter((x) => !EPOSTA_RE.test(x)) };
}

/** Kisa gorunen ad: "export2@unex.com.tr" -> "export2", baska alan adlari tam. */
export function kisaAdres(e: string, alan = "unex.com.tr"): string {
  return e.endsWith(`@${alan}`) ? e.slice(0, -alan.length - 1) : e;
}

export async function raporAlicilariGetir(): Promise<RaporAlicisi[]> {
  const { data, error } = await supabase.rpc("rapor_alicilari_liste");
  if (error) throw new Error(error.message);
  return ((data || []) as RaporAlicisi[]).map((r) => ({ ...r, cc: r.cc || [], kayitli: r.kayitli !== false }));
}

export async function raporAlicilariKaydet(rapor: RaporTuru, alicilar: string[], cc: string[], canli: boolean): Promise<void> {
  const { error } = await supabase.rpc("rapor_alicilari_kaydet", { p_rapor: rapor, p_alicilar: alicilar, p_cc: cc, p_canli: canli });
  if (error) throw new Error(error.message);
}

export async function adresDefteriGetir(): Promise<string[]> {
  const { data, error } = await supabase.rpc("rapor_adres_defteri_liste");
  if (error) throw new Error(error.message);
  return ((data || []) as { eposta: string }[]).map((x) => x.eposta);
}
export async function adresDefterineEkle(eposta: string): Promise<void> {
  const { error } = await supabase.rpc("rapor_adres_defteri_ekle", { p_eposta: eposta });
  if (error) throw new Error(error.message);
}
export async function adresDefterindenSil(eposta: string): Promise<void> {
  const { error } = await supabase.rpc("rapor_adres_defteri_sil", { p_eposta: eposta });
  if (error) throw new Error(error.message);
}

async function edgeCagir(edge: string, govde: Record<string, unknown>) {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edge}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${token}` },
    body: JSON.stringify(govde),
  });
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string; sonuclar?: { html?: string; konu?: string; atlandi?: string; gonderildi?: boolean; musteriler?: string[] }[] };
  if (!res.ok || !veri.ok) throw new Error(veri.hata || `İstek başarısız (HTTP ${res.status}).`);
  const s = veri.sonuclar?.[0];
  if (!s) throw new Error("Rapor oluşturulamadı (veri yok).");
  if (s.atlandi) throw new Error(s.atlandi);
  return s;
}

/** Mail gondermeden raporun bugunku halini getirir (musteri durum raporunda musteri secilebilir). */
export async function raporOnizle(edge: string, ek: Record<string, unknown> = {}): Promise<{ konu: string; html: string; musteriler?: string[] }> {
  const s = await edgeCagir(edge, { deneme: true, ...ek });
  return { konu: s.konu || "", html: s.html || "", musteriler: s.musteriler };
}

/** "[TEST]" maili yalniz test adresine. */
export async function raporTestMaili(edge: string, ek: Record<string, unknown> = {}): Promise<void> {
  await edgeCagir(edge, { test: true, ...ek });
}
