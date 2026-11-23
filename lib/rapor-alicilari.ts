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
  | "fatura_onay" | "fatura_dagitim" | "pazar_gorev" | "musteri_durum" | "satin_alma" | "siparis_formu" | "siparissiz" | "siparis_formu_lojistik" | "siparis_formu_spek";
export type RaporAlicisi = { rapor: RaporTuru; alicilar: string[]; cc: string[]; canli: boolean; kayitli: boolean; guncelleyen: string | null; guncelleme: string | null };

export type RaporGrubu = "Günlük raporlar" | "Operasyon" | "Satış ve müşteri";
export type RaporTanimi = {
  rapor: RaporTuru; ad: string; grup: RaporGrubu; aciklama: string; saat: string;
  /** Onizle / Test maili olan raporlarin edge'i */
  edge: string | null;
  /** Onizle / test cagrisina eklenen sabit parametre (bugun kullanan yok; 13.11.2026 haftalik navlun maili kaldirildi) */
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
  { rapor: "gunluk_ihracat", ad: "Günlük İhracat Raporu", grup: "Günlük raporlar", aciklama: "Kontrol Merkezi özeti: dosyalar, sevkiyatlar, tahsilat", saat: "Her gün 17:00", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "siparis", ad: "Sipariş Raporu", grup: "Günlük raporlar", aciklama: "Rezervasyon bekleyen (ön ödemeli) siparişler + limanlarının en yeni navlun fiyatları + Excel", saat: "Her cumartesi 09:00", edge: "siparis-rapor", testModu: true, etkin: "alici" },
  { rapor: "navlun", ad: "Navlun Raporu", grup: "Günlük raporlar", aciklama: "Satın alınan navlunlar + rezervasyon bekleyen müşteriler + 2 Excel (satın alma listesi, bütün navlunlar)", saat: "Her gün 17:00", edge: "navlun-tablosu", testModu: true, etkin: "tam" },
  { rapor: "diib", ad: "DİİB Raporu", grup: "Günlük raporlar", aciklama: "DİİB kapatma ve süre takibi", saat: "Her cumartesi 09:00 (son 7 gün)", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "vgm", ad: "VGM Bildirimi", grup: "Operasyon", aciklama: "Konteynerleri tamamlanan dosyanın VGM PDF'i", saat: "Konteynerler tamamlanınca", edge: null, testModu: false, etkin: "yakinda" },
  { rapor: "konsimento_hatirlatma", ad: "Konşimento Hatırlatma", grup: "Operasyon", aciklama: "Fatura talimatından sonra konşimento talimatı bekleyen dosyalar", saat: "Talimat gönderilince", edge: null, testModu: false, etkin: "yakinda" },
  // 14.11.2026: onay adimi kaldirildi; 'fatura_onay' listesi = talimat mailinin alicilari (Alici + CC). 'fatura_dagitim' kullanilmiyor.
  { rapor: "fatura_onay", ad: "Fatura Talimatı", grup: "Operasyon", aciklama: "“FATURA VE BEYANNAME TALİMATI HAKKINDA // …” · Harun Bey merhaba + PDF indir düğmesi", saat: "Konteynerler tamamlanınca (10 dk içinde)", edge: null, testModu: true, etkin: "tam" },
  { rapor: "siparis_formu", ad: "Sipariş Bildirim Formu", grup: "Operasyon", aciklama: "Her yükleme için üretime sipariş formu (Excel + çuval görseli); test için Siparişler > Sipariş Formları", saat: "Export girişi tamamlanınca otomatik + Gönder butonu", edge: null, testModu: true, etkin: "tam" },
  // 23.11.2026 (kullanici: "Onayi ve rezervasyonu alinmis yuklemeler Suleyman Bey'e mail gitse; oradan siparis bildirim formu
  // gonderilmesi gerekenleri secse"): lojistige liste + girissiz secim sayfasi; secilen formlar 'siparis_formu' alicilarina gider
  // 23.11.2026 ogleden sonra: secim adimi kaldirildi (form export girisi tamamlaninca otomatik gider); cron kapali, satir yedek
  { rapor: "siparis_formu_lojistik", ad: "Sipariş Formu · Lojistik Seçimi (kullanılmıyor)", grup: "Operasyon", aciklama: "Kaldırıldı: form, export spek + çuval görselini girince otomatik gider. Zamanlanmış mail kapalı.", saat: "Kapalı", edge: "siparis-formu", testModu: true, etkin: "tam" },
  // 23.11.2026 (kullanici: "Harun Bey spek ve urun gorseli eklediginde form otomatik gitsin; her gun mail + ekranda bildirim"):
  // export'a spek / cuval gorseli bekleyen liste; CANLI anahtari otomatik form gonderiminin de canli / test secimidir
  { rapor: "siparis_formu_spek", ad: "Sipariş Formu · Export Girişi ve Otomatik Gönderim", grup: "Operasyon", aciklama: "Ürün speki / çuval görseli bekleyen yüklemeler (ekranda da bildirim). Form tamamlanıp kaydedilince üretime otomatik gider; canlı değilken yalnızca test adresine", saat: "Hafta içi her sabah 08:17 + kaydedince anında", edge: null, testModu: true, etkin: "tam" },
  // 23.11.2026: haftalik siparissiz musteri ozeti (export ekibi; kurulumda CANLI KAPALI, test yalniz test adresine)
  { rapor: "siparissiz", ad: "Siparişsiz Müşteri Raporu", grup: "Satış ve müşteri", aciklama: "Açık siparişi olmayan müşterilerimiz: sipariş ritmi, iletişim durumu, son görev + Excel", saat: "Her pazartesi 09:00", edge: "siparissiz-musteri-rapor", testModu: true, etkin: "tam" },
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

/** Kisa gorunen ad: "sales@unex.com.tr" -> "sales", baska alan adlari tam. */
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

export type RaporSonucu = { html?: string; konu?: string; atlandi?: string; gonderildi?: boolean; musteriler?: string[]; alici?: string[] };

async function edgeCagir(edge: string, govde: Record<string, unknown>): Promise<RaporSonucu> {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  // 23.11.2026: tarayicidan edge'e dogrudan cagri CORS on kontrolunde (OPTIONS 403) dusuyordu; ayni kokenli sunucu yolu
  // (app/api/rapor-edge) istegi edge'e sunucudan iletir.
  let res: Response;
  try {
    res = await fetch("/api/rapor-edge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ edge, govde }),
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
  }
  // Netlify sunucu yolu ~10 sn'de keser (rapor ~6-8 sn); edge yine de tamamlanir: test maili buyuk olasilikla gitmistir
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new Error(govde.test === true
      ? "Rapor hazırlanırken bağlantı zaman aşımına uğradı. Test maili büyük olasılıkla yine de gönderildi; birkaç dakika içinde test adresini kontrol edin, gelmediyse tekrar deneyin."
      : "Rapor hazırlanırken bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.");
  }
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string; sonuclar?: RaporSonucu[] };
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

/** "[TEST]" maili yalniz test adresine; giden konu ve alici(lar) doner (ekranda gosterilir). */
export async function raporTestMaili(edge: string, ek: Record<string, unknown> = {}): Promise<{ konu: string; alici: string[] }> {
  const s = await edgeCagir(edge, { test: true, ...ek });
  return { konu: s.konu || "", alici: Array.isArray(s.alici) ? s.alici : [] };
}
