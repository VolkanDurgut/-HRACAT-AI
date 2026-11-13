// ============================================================================
// GUNLUK VERI YEDEGI - mail gorunumu (26.10.2026)
// ============================================================================
// Kullanici: "gunluk rapor gibi temaya uygun hale getirmeliyiz; 0 olanlar nedir?"
// Gorunum gunluk rapor mailiyle AYNI dil: logo, lacivert #283474 + seftali #F4A07C,
// ozet kutulari, bolum basliklari. Tablolar TURKCE adlariyla, gruplu; kaydi 0 olan
// tablonun yaninda NEDEN bos oldugu yazar (BOS_ACIKLAMA).
// SAF TypeScript (Deno/Supabase bagimliligi yok) - Node ile test edilir
// (scratchpad `yedekmail/`). Yedegin icerigi / geri yukleme testi / kapasite
// hesabi index.ts'te, bu dosya SADECE gorunum.
// ============================================================================

export type TabloSayisi = { tablo: string; adet: number | null; not?: string };
export type KapasiteGirdisi = { kaynak: string; bayt: number | null; kota: number; oran: number | null; durum: "normal" | "uyari" | "kritik" | "olculemedi" };
export type YedekMailGirdisi = {
  tarih: string; // "26.10.2026"
  saat: string; // "03:00"
  ekSigiyor: boolean;
  /** 13.11.2026: zip ozel depoda (mail eki yok); indirme Ayarlar > Yedekler sayfasindan, giris gerekir. */
  depoda?: boolean;
  indirmeLinki?: string;
  saklamaGun?: number;
  ekAdi: string;
  ekBayt: number;
  /** 13.11.2026: ek .zip; icindeki .json'un adi ve boyutu */
  jsonAdi?: string;
  jsonBayt?: number;
  toplamKayit: number;
  tablolar: TabloSayisi[];
  kapasite: KapasiteGirdisi[];
  bucketlar: Record<string, { dosya: number; bayt: number }>;
  /** "konsimento-talimatlari" kovasinin belge turu dokumu (28.10.2026; bkz. sevkiyatBelgeTuru). */
  belgeTurleri?: Record<string, { dosya: number; bayt: number }>;
  geriYukleme: { tablo_sayisi: number; birebir: number; bag_sorunlari: { bag: string; kirik: number }[] } | null;
  uyarilar: string[];
  kullaniciSayisi: number | null;
  /** Elle istenen test gonderimi: ustte bilgi notu. */
  test?: boolean;
  /** Gece yedeginin gittigi adresler (test notunda gosterilir). */
  gercekAlicilar?: string[];
};

const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const UYGULAMA_URL = "https://ihracatasistanim.com";

type TabloBilgisi = { ad: string; grup: string };
/** Teknik tablo adi -> kullaniciya gorunen ad + grup. Yeni tablo eklenirse buraya da eklenir (eklenmezse "Diger"de teknik adiyla cikar). */
export const TABLO_BILGISI: Record<string, TabloBilgisi> = {
  ihracat_dosyalari: { ad: "İhracat dosyaları", grup: "İhracat operasyonu" },
  rezervasyonlar: { ad: "Rezervasyonlar (booking)", grup: "İhracat operasyonu" },
  konteynerler: { ad: "Konteynerler", grup: "İhracat operasyonu" },
  ana_siparisler: { ad: "Ana siparişler (devam eden)", grup: "İhracat operasyonu" },
  dosya_evraklari: { ad: "Üretilen evraklar (CI, PL, CoO…)", grup: "İhracat operasyonu" },
  acenteler: { ad: "Acente kartları", grup: "İhracat operasyonu" },
  acente_teklifleri: { ad: "Acente navlun teklifleri", grup: "İhracat operasyonu" },
  sevkiyatlar: { ad: "Sevkiyatlar (eski yapı)", grup: "İhracat operasyonu" },
  diib_belgeleri: { ad: "DİİB belgeleri", grup: "İhracat operasyonu" },
  diib_ihracatlari: { ad: "DİİB elle eklenen / düzeltilen satırlar", grup: "İhracat operasyonu" },
  diib_dosya_bolunmeleri: { ad: "DİİB fatura bölünmeleri", grup: "İhracat operasyonu" },
  plakalar: { ad: "Plakalar (eski yapı)", grup: "İhracat operasyonu" },
  fumigation_ayarlari: { ad: "Fumigasyon sertifikası ayarları", grup: "Evrak ayarları" },
  kalite_sertifikasi_ayarlari: { ad: "Kalite sertifikası ayarları", grup: "Evrak ayarları" },
  banka_presetleri: { ad: "Özel banka kartları", grup: "Evrak ayarları" },
  ihracat_musterileri: { ad: "Proforma müşteri kartları", grup: "Proforma" },
  ihracat_urunleri: { ad: "Proforma ürün kütüphanesi", grup: "Proforma" },
  proforma_ayarlari: { ad: "Proforma şablon ayarları", grup: "Proforma" },
  proformalar: { ad: "Kayıtlı proformalar", grup: "Proforma" },
  ic_fiyat_kalemleri: { ad: "Fiyat tablosu kalemleri", grup: "İç piyasa" },
  ic_fiyat_formlari: { ad: "Fiyat bilgilendirme formları", grup: "İç piyasa" },
  ic_musteriler: { ad: "İç piyasa müşterileri", grup: "İç piyasa" },
  ic_is_emirleri: { ad: "İş emirleri", grup: "İç piyasa" },
  ic_sevkler: { ad: "Araç sevkleri (irsaliye)", grup: "İç piyasa" },
  ic_tedarikciler: { ad: "Tedarikçi kartları", grup: "İç piyasa" },
  ic_alis_siparisleri: { ad: "Alış siparişleri", grup: "İç piyasa" },
  ic_alis_teslimler: { ad: "Teslim alınan araçlar (alış)", grup: "İç piyasa" },
  ic_bildirimler: { ad: "Bildirimler (WhatsApp / e-posta)", grup: "İç piyasa" },
  ic_is_emri_devirleri: { ad: "Siparişler arası tonaj devri", grup: "İç piyasa" },
  ic_piyasa_ayarlari: { ad: "İç piyasa ayarları", grup: "İç piyasa" },
  kantar_cihazlari: { ad: "Kantar cihazları", grup: "Kantar ve DBA otomasyonu" },
  dba_otomatik_kayitlari: { ad: "Otomatik DBA kayıtları", grup: "Kantar ve DBA otomasyonu" },
  satin_alma_departmanlari: { ad: "Departmanlar ve talep bağlantıları", grup: "Satın alma" },
  satin_alma_listeleri: { ad: "İhtiyaç listeleri", grup: "Satın alma" },
  satin_alma_kalemleri: { ad: "Liste kalemleri", grup: "Satın alma" },
  satin_alma_urunleri: { ad: "Daha önce sipariş verilen ürünler", grup: "Satın alma" },
  pazar_firmalar: { ad: "Potansiyel / müşteri firmalar", grup: "Pazar (CRM)" },
  pazar_kisiler: { ad: "Firma yetkilileri", grup: "Pazar (CRM)" },
  pazar_fuar_katilimlari: { ad: "Fuar katılımları", grup: "Pazar (CRM)" },
  pazar_ice_aktarimlari: { ad: "Fuar listesi yüklemeleri", grup: "Pazar (CRM)" },
  pazar_temaslar: { ad: "Görüşmeler (sorgulama / hatırlatma)", grup: "Pazar (CRM)" },
  pazar_gorevler: { ad: "Günlük müşteri görevleri", grup: "Pazar (CRM)" },
  pazar_gorev_gonderimleri: { ad: "Günlük görev maili kaydı", grup: "Pazar (CRM)" },
  pazar_ekip: { ad: "Satış ekibi (görev alanlar)", grup: "Pazar (CRM)" },
  pazar_gelenler: { ad: "Arşivden yakalanan müşteri cevapları", grup: "Pazar (CRM)" },
  siparis_defteri: { ad: "Sipariş defteri (proformalar)", grup: "Sipariş, plan ve navlun" },
  siparis_defteri_aktarimlari: { ad: "Sipariş listesi Excel yüklemeleri", grup: "Sipariş, plan ve navlun" },
  siparis_on_odemeler: { ad: "Ön ödeme işaretleri", grup: "Sipariş, plan ve navlun" },
  sevkiyat_plani: { ad: "Yükleme planı", grup: "Sipariş, plan ve navlun" },
  sevkiyat_plani_aktarimlari: { ad: "Yükleme planı Excel yüklemeleri", grup: "Sipariş, plan ve navlun" },
  odeme_excel_yuklemeleri: { ad: "Tahsilat Excel yüklemeleri", grup: "Sipariş, plan ve navlun" },
  odeme_hatirlatmalari: { ad: "Ödeme hatırlatma mailleri", grup: "Sipariş, plan ve navlun" },
  navlun_acenteler: { ad: "Navlun acenteleri", grup: "Sipariş, plan ve navlun" },
  navlun_mesajlari: { ad: "Navlun mailleri (acente yazışmaları)", grup: "Sipariş, plan ve navlun" },
  navlun_teklifleri: { ad: "Navlun teklifleri / anlaşmalar", grup: "Sipariş, plan ve navlun" },
  fatura_talimati_onaylari: { ad: "Fatura talimatı onayları", grup: "Sipariş, plan ve navlun" },
  konsimento_hatirlatmalari: { ad: "Konşimento hatırlatmaları", grup: "Sipariş, plan ve navlun" },
  rapor_alicilari: { ad: "Rapor alıcıları (Ayarlar)", grup: "Raporlar" },
  rapor_adres_defteri: { ad: "Rapor adres defteri", grup: "Raporlar" },
  rapor_gonderimleri: { ad: "Günlük ihracat raporu gönderimleri", grup: "Raporlar" },
  ic_gunluk_rapor_gonderimleri: { ad: "İç piyasa raporu gönderimleri", grup: "Raporlar" },
  diib_rapor_gonderimleri: { ad: "DİİB raporu gönderimleri", grup: "Raporlar" },
  vgm_rapor_gonderimleri: { ad: "VGM raporu gönderimleri", grup: "Raporlar" },
  siparis_rapor_gonderimleri: { ad: "Sipariş raporu gönderimleri", grup: "Raporlar" },
  navlun_tablosu_gonderimleri: { ad: "Navlun raporu gönderimleri", grup: "Raporlar" },
  companies: { ad: "Şirket", grup: "Kullanıcılar ve sistem" },
  kullanici_rolleri: { ad: "Kullanıcı rolleri", grup: "Kullanıcılar ve sistem" },
  kullanici_yetkileri: { ad: "Kullanıcı yetkileri", grup: "Kullanıcılar ve sistem" },
  destek_mesajlari: { ad: "Sorun Bildir mesajları", grup: "Kullanıcılar ve sistem" },
  geri_bildirimler: { ad: "Geri bildirimler", grup: "Kullanıcılar ve sistem" },
  ai_usage_logs: { ad: "Yapay zekâ kullanım kayıtları", grup: "Kullanıcılar ve sistem" },
  denetim_kayitlari: { ad: "Denetim kayıtları (değişiklik geçmişi)", grup: "Kullanıcılar ve sistem" },
};
const GRUP_SIRASI = ["İhracat operasyonu", "Sipariş, plan ve navlun", "Evrak ayarları", "Proforma", "İç piyasa", "Kantar ve DBA otomasyonu", "Satın alma", "Pazar (CRM)", "Raporlar", "Kullanıcılar ve sistem", "Diğer"];

/**
 * Kaydi 0 olan tablonun NEDENI (26.10.2026 canli kontrol: kod + veritabani).
 * tur -> rozet: "kullanilmiyor" = uygulama bu tabloyu artik kullanmiyor (eski yapi);
 * "kullanilmadi" = ozellik var ama henuz kullanilmadi; "normal" = bos olmasi beklenen.
 */
export const BOS_ACIKLAMA: Record<string, { tur: "normal" | "kullanilmiyor" | "kullanilmadi"; metin: string }> = {
  sevkiyatlar: { tur: "kullanilmiyor", metin: "İlk tasarımdan kalan tablo; uygulama bu tabloya yazmıyor, sevkiyat bilgisi dosya ve rezervasyonda tutuluyor." },
  plakalar: { tur: "kullanilmiyor", metin: "İlk tasarımdan kalan tablo; plakalar konteyner kaydında tutuluyor." },
  acente_teklifleri: { tur: "kullanilmadi", metin: "Proforma Yükle sonrası “Acentelerden Teklif Al” kullanılınca dolar." },
  banka_presetleri: { tur: "normal", metin: "Özel banka kartı kaydedilmedi; standart banka hesapları uygulamada tanımlı." },
  ihracat_musterileri: { tur: "normal", metin: "İsteğe bağlı müşteri kartı açılmadı; proforma bilgileri geçmiş dosyalardan geliyor." },
  proforma_ayarlari: { tur: "normal", metin: "Varsayılan proforma şablon metinleri kullanılıyor." },
  ihracat_urunleri: { tur: "normal", metin: "İsteğe bağlı ürün kartı açılmadı; proformadaki ürün bilgileri geçmiş dosyalardan geliyor." },
  diib_belgeleri: { tur: "kullanilmadi", metin: "DİİB Takibi yeni (04.11.2026); ilk DİİB eklenince dolar." },
  diib_ihracatlari: { tur: "normal", metin: "DİİB satırları faturası kesilen dosyalardan otomatik gelir; burada yalnız elle eklenen / düzeltilen satırlar tutulur." },
  diib_dosya_bolunmeleri: { tur: "normal", metin: "Yalnız DİİB kalanı yetmeyen bir yükleme iki faturaya bölününce dolar." },
  ic_is_emri_devirleri: { tur: "normal", metin: "Yalnız bir siparişin fazlası başka siparişe aktarılınca dolar." },
  satin_alma_listeleri: { tur: "kullanilmadi", metin: "Satın Alma yeni (26.10.2026); departman ilk kalemi ekleyince dolar." },
  satin_alma_kalemleri: { tur: "kullanilmadi", metin: "Satın Alma yeni (26.10.2026); departman ilk kalemi ekleyince dolar." },
  pazar_kisiler: { tur: "kullanilmadi", metin: "Pazar yeni (10.11.2026); fuar listesi yüklenince dolar." },
  pazar_fuar_katilimlari: { tur: "kullanilmadi", metin: "Pazar yeni (10.11.2026); fuar listesi yüklenince dolar." },
  pazar_ice_aktarimlari: { tur: "kullanilmadi", metin: "Pazar yeni (10.11.2026); fuar listesi yüklenince dolar." },
  pazar_temaslar: { tur: "kullanilmadi", metin: "Görüşme süreci yeni (10.11.2026); görev sayfasında ilk mail \"Gönderdim\" ile kaydedilince dolar." },
  pazar_gorevler: { tur: "kullanilmadi", metin: "Günlük görevler yeni (10.11.2026); ilk günlük mail ile dolar." },
  pazar_gorev_gonderimleri: { tur: "kullanilmadi", metin: "Günlük görev maili yeni (10.11.2026); ilk gönderimle dolar." },
  pazar_gelenler: { tur: "kullanilmadi", metin: "Cevap tespiti yeni (10.11.2026); arşiv Gmail betiği kurulup ilk müşteri cevabı gelince dolar." },
};
const BOS_ROZET: Record<"normal" | "kullanilmiyor" | "kullanilmadi" | "bilinmiyor", [string, string, string]> = {
  kullanilmiyor: ["#F1F5F9", "#475569", "Kullanılmıyor"],
  kullanilmadi: ["#FEF3C7", "#92400E", "Henüz kullanılmadı"],
  normal: ["#E0E7FF", "#3730A3", "Boş · normal"],
  bilinmiyor: ["#FEF3C7", "#92400E", "Boş"],
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (n: number) => n.toLocaleString("tr-TR");
export const mbYaz = (bayt: number) => `${(bayt / (1024 * 1024)).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
const yuzde = (oran: number) => `%${(oran * 100).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

/** Depo bucket'larinin kullaniciya gorunen adi + icerigi. */
export const BUCKET_BILGISI: Record<string, string> = {
  "konsimento-talimatlari": "Sevkiyat belgeleri (türüne göre ayrı klasörlerde)",
  evraklar: "Üretilen evrak arşivi — CI, PL, CoO, Phyto, Health…",
  "geri-bildirim-ekleri": "Sorun Bildir ekleri",
  "ic-piyasa-belgeler": "İç piyasa — irsaliye ve sipariş formları",
  "veri-yedekleri": "Günlük veri yedekleri (zip, giriş gerektirir)",
};

/**
 * Sevkiyat belgeleri kovasi ("konsimento-talimatlari") icinde BELGE TURU (28.10.2026).
 * Kullanici: "Bunlarin hepsi veritabaninda neden ayri tutulmuyor?" -> Ayri tutuluyor:
 * veritabaninda her turun kendi alani var (ihracat_dosyalari.fatura_/konsimento_/
 * draft_bl_/beyanname_/proforma_dosya_url; konteynerler.dba_/irsaliye_dosya_url),
 * depoda her turun kendi klasoru var. Mail tek satir gosterdigi icin ayri degil sanildi;
 * artik tur bazinda dokum verilir. Klasor yollari yukleyen kodla AYNI:
 *   dba/<dosya>/…  fatura/<dosya>/…  irsaliye/<dosya>/…  <dosya>/draft-bl/…
 *   <dosya>/beyanname/…  <dosya>/proforma/…  <dosya>/<dosya-adi> = konsimento talimati
 * (Kova adi tarihsel; degistirilmez: kayitli baglantilar bu ada bagli.)
 */
export const SEVKIYAT_BELGE_SIRASI = ["DBA", "Fatura", "Draft BL", "Konşimento talimatı", "Beyanname", "Proforma", "İrsaliye", "Diğer"] as const;
export function sevkiyatBelgeTuru(yol: string): (typeof SEVKIYAT_BELGE_SIRASI)[number] {
  if (yol.startsWith("dba/")) return "DBA";
  if (yol.startsWith("fatura/")) return "Fatura";
  if (yol.startsWith("irsaliye/")) return "İrsaliye";
  if (/^[^/]+\/draft-bl\//.test(yol)) return "Draft BL";
  if (/^[^/]+\/beyanname\//.test(yol)) return "Beyanname";
  if (/^[^/]+\/proforma\//.test(yol)) return "Proforma";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/i.test(yol)) return "Konşimento talimatı";
  return "Diğer";
}

const KAPASITE_RENK: Record<KapasiteGirdisi["durum"], string> = { normal: "#047857", uyari: "#B45309", kritik: "#B91C1C", olculemedi: "#64748B" };

export function yedekMailKonusu(g: YedekMailGirdisi): string {
  return `${g.uyarilar.length ? "[UYARI] " : ""}İhracat AI - Günlük Veri Yedeği (${g.tarih})`;
}

/** Tablolari gruplara ayirir (grup sirasi sabit, grup icinde gelen sira korunur). */
export function tabloGruplari(tablolar: TabloSayisi[]): { grup: string; satirlar: (TabloSayisi & { ad: string })[] }[] {
  const m = new Map<string, (TabloSayisi & { ad: string })[]>();
  for (const t of tablolar) {
    const b = TABLO_BILGISI[t.tablo];
    const grup = b?.grup ?? "Diğer";
    if (!m.has(grup)) m.set(grup, []);
    m.get(grup)!.push({ ...t, ad: b?.ad ?? t.tablo });
  }
  return GRUP_SIRASI.filter((g) => m.has(g)).map((g) => ({ grup: g, satirlar: m.get(g)! }));
}

export function yedekMailHtml(g: YedekMailGirdisi): string {
  const gy = g.geriYukleme;
  const gyTam = !!gy && gy.birebir === gy.tablo_sayisi && gy.bag_sorunlari.length === 0;
  const bolumBaslik = (t: string) => `<div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${t}</div>`;
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold">${t}</th>`;

  // --- Durum bandi
  const okunamayan = g.tablolar.filter((t) => t.adet === null).length;
  const bant = g.uyarilar.length === 0
    ? `<div style="margin-top:14px;border:1px solid #A7F3D0;border-left:4px solid #10B981;background:#ECFDF5;border-radius:4px;padding:9px 12px;font-size:13px;color:#065F46"><b>✔ Yedek alındı ve doğrulandı.</b> ${g.depoda ? "Yedek dosyası güvenli depoda; aşağıdaki düğmeyle indirilir." : g.ekSigiyor ? "Yedek dosyası ektedir." : ""} Geri yükleme testi tüm tablolarda birebir sonuç verdi.</div>`
    : `<div style="margin-top:14px;border:1px solid #FECACA;border-left:4px solid #DC2626;background:#FEF2F2;border-radius:4px;padding:9px 12px;font-size:12px;color:#7F1D1D"><div style="font-size:11px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;color:#B91C1C;margin-bottom:4px">Dikkat edilmesi gerekenler (${g.uyarilar.length})</div><ul style="margin:0;padding-left:18px">${g.uyarilar.map((u) => `<li style="margin:2px 0">${esc(u)}</li>`).join("")}</ul></div>`;

  // --- Ozet kutulari
  const kutu = (etiket: string, deger: string, alt: string, renk: string, ek = "") =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.4">${alt}</div>${ek}</td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const cubuk = (oran: number | null, renk: string) => {
    if (oran === null) return "";
    const w = Math.max(1, Math.min(100, Math.round(oran * 100)));
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:collapse"><tr><td style="width:${w}%;height:6px;background:${renk};font-size:0;line-height:0">&nbsp;</td><td style="height:6px;background:#E2E8F0;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
  };
  const kap = (ad: string) => g.kapasite.find((k) => k.kaynak.startsWith(ad));
  const kapKutu = (etiket: string, k: KapasiteGirdisi | undefined) => {
    if (!k) return kutu(etiket, "—", "", "#64748B");
    const renk = KAPASITE_RENK[k.durum];
    return k.oran === null
      ? kutu(etiket, "ölçülemedi", `kota ${mbYaz(k.kota)}`, renk)
      : kutu(etiket, yuzde(k.oran), `${mbYaz(k.bayt!)} / ${mbYaz(k.kota)}`, renk, cubuk(k.oran, renk));
  };
  const toplamTablo = g.tablolar.length;
  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu("Toplam kayıt", sayi(g.toplamKayit), `${toplamTablo} tablo${okunamayan ? ` · <b style="color:#B91C1C">${okunamayan} okunamadı</b>` : ""}`, LACIVERT)}${arasi}
    ${gy ? kutu("Geri yükleme testi", `${gy.birebir}/${gy.tablo_sayisi}`, gyTam ? "tablo birebir · bağlar tutarlı" : `${gy.bag_sorunlari.length ? `${gy.bag_sorunlari.length} bağ sorunu` : "farklı tablo var"}`, gyTam ? "#047857" : "#B91C1C") : kutu("Geri yükleme testi", "—", "çalıştırılamadı", "#B91C1C")}${arasi}
    ${kapKutu("Veritabanı", kap("Veritabanı"))}${arasi}
    ${kapKutu("Dosya deposu", kap("Dosya deposu"))}
  </tr></table>`;

  // --- Tablolar (gruplu)
  const satirlar = tabloGruplari(g.tablolar).map(({ grup, satirlar }) => {
    const grupToplam = satirlar.reduce((t, s) => t + (s.adet || 0), 0);
    const baslik = `<tr><td colspan="3" style="padding:7px 8px;background:#F1F5F9;border-top:1px solid #CBD5E1;font-size:11px;font-weight:bold;color:${LACIVERT};text-transform:uppercase;letter-spacing:.5px">${esc(grup)}<span style="float:right;color:#64748B;font-weight:normal;text-transform:none;letter-spacing:0">${sayi(grupToplam)} kayıt</span></td></tr>`;
    return baslik + satirlar.map((s) => {
      let durum: string;
      if (s.adet === null) {
        durum = `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#FEE2E2;color:#B91C1C;font-size:10px;font-weight:bold">OKUNAMADI</span>`;
      } else if (s.adet === 0) {
        const a = BOS_ACIKLAMA[s.tablo];
        const [z, r, e] = BOS_ROZET[a?.tur ?? "bilinmiyor"];
        durum = `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${z};color:${r};font-size:10px;font-weight:bold;white-space:nowrap">${e}</span><div style="font-size:10px;color:#64748B;margin-top:2px;line-height:1.35">${esc(a?.metin ?? "Henüz kayıt yok.")}</div>`;
      } else {
        durum = `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#D1FAE5;color:#047857;font-size:10px;font-weight:bold">✔ Yedeklendi</span>${s.not ? ` <span style="font-size:10px;color:#64748B">(${esc(s.not)})</span>` : ""}`;
      }
      return `<tr><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top">${esc(s.ad)}<div style="font-size:10px;color:#94A3B8;font-family:monospace;word-break:break-all">${esc(s.tablo)}</div></td><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;font-weight:bold;color:${s.adet === 0 ? "#94A3B8" : "#1E293B"};text-align:right;vertical-align:top;white-space:nowrap">${s.adet === null ? "—" : sayi(s.adet)}</td><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;vertical-align:top;width:52%">${durum}</td></tr>`;
    }).join("");
  }).join("");
  const tabloBolumu = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Tablo")}${th("Kayıt", true)}${th("Durum")}</tr>${satirlar}</table>`;

  // --- Dosya deposu
  // Sevkiyat belgeleri kovasinin altinda tur bazinda dokum (girintili, acik renk)
  const turSatirlari = (b: string) => b !== "konsimento-talimatlari" || !g.belgeTurleri ? "" : SEVKIYAT_BELGE_SIRASI
    .filter((t) => g.belgeTurleri![t]?.dosya)
    .map((t) => `<tr><td style="padding:3px 8px 3px 22px;border-bottom:1px solid #F1F5F9;font-size:11px;color:#475569">↳ ${esc(t)}</td><td style="padding:3px 8px;border-bottom:1px solid #F1F5F9;font-size:11px;color:#475569;text-align:right;white-space:nowrap">${sayi(g.belgeTurleri![t].dosya)}</td><td style="padding:3px 8px;border-bottom:1px solid #F1F5F9;font-size:11px;color:#475569;text-align:right;white-space:nowrap">${mbYaz(g.belgeTurleri![t].bayt)}</td></tr>`).join("");
  const bucketSatirlari = Object.entries(g.bucketlar).sort((a, b) => b[1].bayt - a[1].bayt).map(([b, o], i) =>
    `<tr style="${i % 2 ? "background:#F8FAFC" : ""}"><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B">${esc(BUCKET_BILGISI[b] ?? b)}<div style="font-size:10px;color:#94A3B8;font-family:monospace;word-break:break-all">${esc(b)}</div></td><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;text-align:right;white-space:nowrap">${sayi(o.dosya)}</td><td style="padding:5px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;font-weight:bold;text-align:right;white-space:nowrap">${mbYaz(o.bayt)}</td></tr>${turSatirlari(b)}`).join("");
  const depoBolumu = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th("Klasör")}${th("Dosya", true)}${th("Boyut", true)}</tr>${bucketSatirlari || `<tr><td colspan="3" style="padding:10px;color:#94A3B8;font-style:italic;font-size:12px">Dosya listesi alınamadı.</td></tr>`}</table>
  <div style="margin-top:6px;font-size:11px;color:#64748B;line-height:1.5">PDF dosyalarının kendisi mail ekine sığmadığı için yedekte <b>yer almaz</b>; Supabase Storage'da durur. Yedekte bu dosyaların tam <b>listesi</b> (klasör, yol, boyut, tarih) vardır.</div>`;

  // --- Indirme dugmesi (13.11.2026: ek yerine giris gerektiren link)
  const indirmeKutusu = g.depoda && g.indirmeLinki
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr><td style="border:1px solid #E2E8F0;border-left:4px solid ${MARKA_TURUNCU};border-radius:4px;padding:12px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;font-size:12px;color:#334155;line-height:1.55"><div style="font-size:13px;font-weight:bold;color:${LACIVERT}">Yedek dosyası</div><span style="font-family:monospace;word-break:break-all">${esc(g.ekAdi)}</span> · ${mbYaz(g.ekBayt)}${g.jsonBayt ? ` (açılınca ${mbYaz(g.jsonBayt)})` : ""}<br><span style="color:#64748B">Güvenlik için mail eki olarak gönderilmez; indirmek için uygulamaya giriş gerekir (yalnız yetkili yöneticiler). ${g.saklamaGun ? `${g.saklamaGun} gün saklanır.` : ""}</span></td>
      <td style="vertical-align:middle;text-align:right;width:170px;padding-left:12px"><a href="${esc(g.indirmeLinki)}" style="display:inline-block;background:${LACIVERT};color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px;white-space:nowrap">Yedeği indir</a></td>
    </tr></table></td></tr></table>`
    : "";

  // --- Ek ve oneriler
  const ekSatiri = g.depoda
    ? `<b>Dosya:</b> güvenli depoda (<span style="font-family:monospace">${esc(g.ekAdi)}</span>); Ayarlar &gt; Yedekler sayfasından indirilir.`
    : g.ekSigiyor
    ? `<b>Ek:</b> <span style="font-family:monospace;word-break:break-all">${esc(g.ekAdi)}</span> (${mbYaz(g.ekBayt)})${g.jsonAdi ? ` · sıkıştırılmış; içinde <span style="font-family:monospace">${esc(g.jsonAdi)}</span>${g.jsonBayt ? ` (${mbYaz(g.jsonBayt)})` : ""}` : ""}`
    : `<b style="color:#B91C1C">Yedek dosyası bu sefer eke sığmadı</b> (${mbYaz(g.ekBayt)}).`;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="Logo" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">İhracat AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Veri Yedeği</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(g.tarih)}</div><div style="font-size:11px;color:#94A3B8">Otomatik yedek · ${esc(g.saat)}</div></td>
  </tr></table>
  ${g.test ? `<div style="margin-top:14px;border:1px dashed #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST GÖNDERİMİ</b> · Bu mail elle istenen bir denemedir; içerik ve yedek dosyası gerçektir. Otomatik yedek her gece 03:00'te gönderilir.${g.gercekAlicilar?.length ? `<div style="margin-top:4px">Gece yedeğinin alıcıları: <b>${g.gercekAlicilar.map(esc).join(", ")}</b></div>` : ""}</div>` : ""}
  ${bant}
  ${indirmeKutusu}
  ${kutular}

  ${bolumBaslik("Yedeklenen Tablolar")}
  ${tabloBolumu}

  ${bolumBaslik("Dosya Deposu (PDF vb.)")}
  ${depoBolumu}

  <div style="margin-top:22px;border:1px solid #E2E8F0;border-radius:4px;padding:10px 12px;font-size:12px;color:#334155;line-height:1.6">
    ${ekSatiri}<br>
    Kapasite sınırları: <b>%85</b>'te uyarı, <b>%90</b>'da kritik (Supabase Free plan kotası).${g.kullaniciSayisi !== null ? `<br>Giriş kullanıcıları yedekte: <b>${sayi(g.kullaniciSayisi)}</b> (şifreler yedeğe <b>alınmaz</b>).` : ""}<br>
    ${g.depoda ? "İndirdiğiniz dosyayı güvenli bir yerde saklayın; içinde şirketin tüm kayıtları vardır." : "Bu dosyayı güvenli bir yerde (bilgisayarınızda veya bulut depolamada) saklamanızı öneririz."}
  </div>
</td></tr></table>
</td></tr></table></body></html>`;
}
