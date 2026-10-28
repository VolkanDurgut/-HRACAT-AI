/**
 * Kullanim Kilavuzu icerigi (28.10.2026, kullanici: "UNEX GIDA - IHRACAT AI KULLANIM
 * KILAVUZU ... konulu olmali, evrenden evrene gecer gibi").
 *
 * Hikaye: KURGUSAL ornek sevkiyat IHR-2026-0141 (Nordline Trading, 10 konteyner un,
 * Mersin -> Tema) proformadan denize kadar izlenir; her "evren" uygulamanin bir
 * bolumudur. Ekran goruntuleri ve isaret noktalari: public/kilavuz/*.webp +
 * lib/kilavuz/ekran-noktalari.ts (kurgusal veriyle cekildi; gercek musteri YOK).
 *
 * Yeni bolum / adim eklerken: `nokta` EKRAN_NOKTALARI[ekran] icindeki bir anahtar
 * olmali (birim testi gibi: app/kilavuz/page.tsx gelistirme modunda uyarir).
 */
import type { SayfaYetkileri } from "@/lib/auth-context";

export type KilavuzAdimi = {
  /** Ekran goruntusundeki isaret noktasi (yoksa genel gorunum). */
  nokta?: string;
  baslik: string;
  metin: string;
};

export type KilavuzKonusu = {
  id: string;
  /** Menudeki / sayfadaki adi */
  baslik: string;
  /** Evrenin adi (kisa, siirsel) */
  evren: string;
  /** Hikayenin bu bolumdeki cumlesi */
  hikaye: string;
  /** Evren renkleri: [ana, ikincil] */
  renk: [string, string];
  /** public/kilavuz/<ekran>.webp */
  ekran?: string;
  /** Uygulamadaki sayfa adresi (ekran goruntusunun cubugunda ve "Sayfaya git"te) */
  adres?: string;
  /** Ekran goruntusunun adres cubugunda gorunecek yol (yoksa `adres`) */
  cubuk?: string;
  yetki?: keyof SayfaYetkileri;
  adimlar: KilavuzAdimi[];
};

export const KILAVUZ_KONULARI: KilavuzKonusu[] = [
  {
    id: "ana-panel", baslik: "Ana Panel", evren: "Komuta Köprüsü",
    hikaye: "Sabah 08:30. Nordline Trading'in 10 konteynerlik unu yola çıkmaya hazırlanıyor. Her gün burada başlar.",
    renk: ["#10B981", "#283474"], ekran: "panel", adres: "/panel", yetki: "panel",
    adimlar: [
      { baslik: "Her güne buradan başlayın", metin: "Ana Panel açık dosyaların tamamını tek ekranda toplar. Giriş yaptığınızda sizi ilk bu sayfa karşılar." },
      { nokta: "kartlar", baslik: "Dört özet kartı", metin: "Aktif Dosya, Bugün Yüklenen, Yüklenecek Konteyner ve Cut-off Uyarısı. Sayılar her dakika ve sekmeye her dönüşünüzde kendiliğinden yenilenir." },
      { nokta: "filtre", baslik: "Hızlı filtreler", metin: "Tümü, Cut-Off Yaklaşan, Rezervasyon Bekleyen… Listeyi tek tıkla ihtiyacınız olan dosyalara daraltın." },
      { nokta: "satir", baslik: "Dosya satırı", metin: "Proforma, müşteri, booking, gemi kalkışı, yüklenen konteyner ve canlı cut-off sayaçları. Sayaç 48 saatin altında sarıya, 10 saatin altında kırmızıya döner. Detay ile dosyaya girersiniz." },
      { nokta: "rapor", baslik: "Günlük Rapor", metin: "Güncel İhracat Raporu'nu açar. Aynı rapor her gün 09:00, 12:00 ve 17:00'de e-postayla da gelir." },
      { nokta: "menu", baslik: "Menü", metin: "Menü yetkinize göre şekillenir: İhracat, Operasyon, Yurt İçi ve Şirket İçi. Soluk görünen bir menü, o sayfa için yetkinizin olmadığını gösterir." },
      { nokta: "sorun", baslik: "Sorun Bildir", metin: "Bir şey ters giderse ya da bir fikriniz varsa sağ alttaki Sorun Bildir'e yazın; ekran görüntüsü ekleyebilirsiniz." },
    ],
  },
  {
    id: "proforma-olustur", baslik: "Proforma Oluştur", evren: "Siparişin Doğduğu Yer",
    hikaye: "Her şey bir teklifle başladı: Nordline Trading 250 ton un istedi.",
    renk: ["#F4A07C", "#283474"], ekran: "proforma-olustur", adres: "/proformalar", yetki: "proformalar",
    adimlar: [
      { baslik: "Tek ekranda proforma", metin: "Müşteriye gidecek proformayı tek ekranda hazırlarsınız. Sağda, indireceğiniz PDF'in kendisi canlı olarak çizilir." },
      { nokta: "musteri", baslik: "1 · Müşteri", metin: "Listeden müşteriyi seçin ya da yeni ünvanı yazın. Son proformasındaki adres, ürünler, teslim, ödeme ve banka bilgileri kendiliğinden gelir." },
      { nokta: "urunler", baslik: "2 · Ürünler", metin: "Ürün, marka, ambalaj, miktar (MTS) ve fiyatı girin; tutar, FCL ve çuval sayısı otomatik hesaplanır. Yeni kalem için “Ürün satırı ekle”." },
      { nokta: "odeme", baslik: "3 · Ödeme ve Sevkiyat", metin: "Teslim şekli, sevkiyat, ödeme metni, banka ve para birimi (formun altında). Önizlemede bu satırlara basılır. Proforma no, tarih ve paketleme otomatik oluşur; elle değiştirirseniz “Otomatik” ile geri alırsınız." },
      { nokta: "onizleme", baslik: "Canlı önizleme", metin: "Sağdaki belge indireceğiniz PDF'in kendisidir; her değişiklik anında yansır (Sayfa 1-2-3). Alttaki eksik listesi boşalınca “Taslak PDF İndir” ile dosyayı alın." },
    ],
  },
  {
    id: "proforma-yukle", baslik: "Proforma Yükle", evren: "Yapay Zekâ Kapısı",
    hikaye: "Müşteri proformayı onayladı. Şimdi onu bir ihracat dosyasına dönüştürme zamanı.",
    renk: ["#8B5CF6", "#10B981"], ekran: "proforma-yukle", adres: "/yeni-dosya", yetki: "yeni_dosya",
    adimlar: [
      { baslik: "Dosyayı yapay zekâ açar", metin: "Onaylanan proformayı yükleyin; İhracat AI belgeyi okur ve ihracat dosyasını sizin için hazırlar." },
      { nokta: "asistan", baslik: "AI Asistan", metin: "Alıcı ve adresi, ürün kalemlerini, tutar ve ödemeyi, limanları ve banka bilgilerini okur. Mevcut bir siparişle eşleşiyorsa size sorar." },
      { nokta: "birak", baslik: "PDF'i bırakın", metin: "Proformayı sürükleyip bırakın ya da tıklayıp seçin (PDF, en fazla 20 MB)." },
      { nokta: "oku", baslik: "Oku ve hazırla", metin: "Okunanlar dosya açılmadan önce özet olarak gösterilir; okunamayan alanlar işaretlenir. Onaylayınca IHR numaralı dosya açılır." },
    ],
  },
  {
    id: "dosya", baslik: "Dosya Detayı", evren: "Sevkiyatın Kalbi",
    hikaye: "IHR-2026-0141 doğdu. Bu sevkiyatla ilgili her bilgi artık tek bir dosyada.",
    renk: ["#38BDF8", "#283474"], ekran: "dosya-proforma", adres: "/panel", cubuk: "/dosya/IHR-2026-0141", yetki: "panel",
    adimlar: [
      { baslik: "Her ihracat bir dosyadır", metin: "Dosyaya Ana Panel'deki Detay düğmesiyle girersiniz. Proformadan konşimentoya kadar her şey burada." },
      { nokta: "sekmeler", baslik: "Dört sekme, tek akış", metin: "Proforma Bilgileri, Sevkiyat Evrakları, Rezervasyon ve Konteynerler. Sekmedeki kırmızı ünlem eksik bir bilgiyi gösterir." },
      { nokta: "taraflar", baslik: "Kartlar ve Düzenle", metin: "Taraflar, Proforma, Lojistik, Ödeme ve Banka kartlarındaki her bilgi “Düzenle” ile güncellenir; değişiklik bütün evraklara kendiliğinden yansır." },
      { nokta: "urunler", baslik: "Ürün detayları", metin: "Kalemler, ambalaj, miktar ve tutarlar. Evraklardaki ürün açıklaması buradan üretilir." },
      { nokta: "kapat", baslik: "Dosyayı Kapat", metin: "Sevkiyat tamamlanınca dosyayı kapatın; dosya İhracatlar arşivine geçer." },
    ],
  },
  {
    id: "rezervasyon", baslik: "Rezervasyon", evren: "Gemide Bir Yer",
    hikaye: "Acente MSC AURORA'da 10 konteynerlik yer ayırdı. Saat artık cut-off'a göre işliyor.",
    renk: ["#06B6D4", "#1E3A8A"], ekran: "dosya-rezervasyon", adres: "/panel", cubuk: "/dosya/IHR-2026-0141?tab=rezervasyon", yetki: "panel",
    adimlar: [
      { baslik: "Booking bilgileri", metin: "Acenteden gelen rezervasyonu dosyanın Rezervasyon sekmesine girersiniz." },
      { nokta: "kart", baslik: "Rezervasyon kartı", metin: "Booking no, gemi, sefer, acente, yükleme ve varış limanı, konteyner adedi. Bir dosyada birden fazla rezervasyon olabilir." },
      { nokta: "cutoff", baslik: "Tarihler ve cut-off", metin: "Talimat ve beyanname cut-off'u, gemi kalkışı ve ETA. Son 10 saate girilince tüm sayfaların üstünde uyarı ve masaüstü bildirimi çıkar." },
      { nokta: "yeni", baslik: "Yeni rezervasyon", metin: "Ek booking için “Yeni Rezervasyon Ekle”." },
    ],
  },
  {
    id: "konteynerler", baslik: "Konteynerler", evren: "Yükleme Başlıyor",
    hikaye: "Ekipmanlar fabrikaya geldi, dolum başladı. Her konteyner kendi kimliğiyle sisteme giriyor.",
    renk: ["#22C55E", "#0F766E"], ekran: "dosya-konteyner", adres: "/panel", cubuk: "/dosya/IHR-2026-0141?tab=konteynerler", yetki: "panel",
    adimlar: [
      { baslik: "Ekipmandan DBA'ya", metin: "Boş ekipman alınınca konteyner ve mühür no eklenir; konteyner dolup tartılınca DBA yüklenir." },
      { nokta: "ust", baslik: "İlerleme", metin: "DBA Durumu çubuğu yüklenen konteyneri gösterir; 10/10 yüklemenin tamamlandığı anlamına gelir." },
      { nokta: "tablo", baslik: "Konteyner tablosu", metin: "Konteyner, mühür, tip, marka, plaka, dara, net/brüt, kap adedi ve VGM. Kap adedi ambalajla tutmazsa toplam satırı uyarır." },
      { nokta: "dba", baslik: "DBA", metin: "Kantar belgesi. Kantar bilgisayarı DBA'yı kendiliğinden yükler (Oto rozeti); gerekirse elle de yüklenir. Ağırlıklar DBA'dan okunur." },
      { nokta: "butonlar", baslik: "Fatura talimatı", metin: "Tüm konteynerler girilince fatura talimatını buradan indirip muhasebeye iletin." },
    ],
  },
  {
    id: "kantar", baslik: "Kantar Paneli", evren: "Tartının Ritmi",
    hikaye: "Her konteyner kantardan geçiyor; DBA belgeleri sisteme kendiliğinden düşüyor.",
    renk: ["#F59E0B", "#7C2D12"], ekran: "kantar", adres: "/kantar", yetki: "kantar",
    adimlar: [
      { baslik: "Kantar ekibinin ekranı", metin: "Açık dosyalarda yüklenecek bütün konteynerler tek listede. Müşteri adları gizli gösterilir." },
      { nokta: "sekme", baslik: "İhracat · Yurt İçi", metin: "İhracat konteynerleri için DBA, iç piyasa araçları için irsaliye sekmesi." },
      { nokta: "ara", baslik: "Hızlı arama", metin: "Konteyner no, mühür, plaka ya da dosya no ile anında bulun." },
      { nokta: "sayac", baslik: "Bekleyen ve tamamlanan", metin: "DBA bekleyen ve tamamlanan konteyner sayıları; liste aynı ekranda iki bölüm halinde." },
      { nokta: "yukle", baslik: "DBA yükle", metin: "Satırdaki DBA düğmesiyle belgeyi yükleyin; sistem PDF'teki konteyner no ve ağırlıkları kontrol eder." },
    ],
  },
  {
    id: "evraklar", baslik: "Sevkiyat Evrakları", evren: "Kendini Yazan Belgeler",
    hikaye: "Fatura kesildi, Draft BL geldi. Evraklar artık kendini yazıyor.",
    renk: ["#A78BFA", "#283474"], ekran: "dosya-evrak", adres: "/panel", cubuk: "/dosya/IHR-2026-0142?tab=evraklar", yetki: "panel",
    adimlar: [
      { baslik: "Yükledikçe hazırlanır", metin: "Fatura, konşimento talimatı, Draft BL ve beyanname yüklendikçe ihracat evrakları otomatik hazırlanır." },
      { nokta: "fatura", baslik: "Muhasebe · Fatura", metin: "Fatura PDF'ini yükleyin; fatura no ve tarih evraklara işlenir." },
      { nokta: "konsimento", baslik: "Konşimento talimatı", metin: "Alıcı ve consignee bilgileri talimattan gelir; talimat yüklenmeden evraklar tamamlanmaz." },
      { nokta: "draftbl", baslik: "Draft BL", metin: "Acenteden gelen taslak konşimento. Yüklenince dosya Draft Onay'a hazırlanır." },
      { nokta: "beyanname", baslik: "Gümrük beyannamesi", metin: "Beyanname cut-off'u burada görünür; beyannameyi bu alana yükleyin." },
      { nokta: "evraklar", baslik: "İhracat evrakları", metin: "Commercial Invoice, Packing List, menşe, bitki sağlığı, sağlık ve kalite sertifikaları. Her biri Draft ve Orijinal olarak tek tıkla açılır; “Taslak Onay Paketi İndir” hepsini tek ZIP yapar." },
      { nokta: "uyari", baslik: "“Bekleniyor” uyarısı", metin: "Yanıp sönen kutu, evrakın oluşması için hangi bilginin beklendiğini söyler. Eksik tamamlanınca kendiliğinden kaybolur." },
    ],
  },
  {
    id: "draft-onay", baslik: "Draft Onay", evren: "48 Saatlik Yörünge",
    hikaye: "Taslaklar müşteriye gitti. Saat işliyor: 48 saat.",
    renk: ["#34D399", "#065F46"], ekran: "draft-onay", adres: "/draft-onay", yetki: "draft_onay",
    adimlar: [
      { baslik: "Onaya hazır dosyalar", metin: "Taslak evrakları ve Draft BL'i hazır olan açık dosyalar burada listelenir." },
      { nokta: "evraklar", baslik: "İlgili evraklar", metin: "Üst satır taslak (yeşil), alt satır orijinal (mavi). Tıklayınca belge yeni sekmede açılır." },
      { nokta: "durum", baslik: "Durum ve sayaç", metin: "Akış: Onayla → Gönderildi İşaretle → Müşteri Onayladı ya da Revize. Gönderimden sonra 48 saatlik yanıt sayacı başlar." },
      { nokta: "aksiyon", baslik: "Sıradaki adım", metin: "Yalnızca sıradaki adımın düğmesi görünür. “Hatırlat” hazır bir hatırlatma e-postası açar; revize istenirse dosya Onayla adımına döner." },
    ],
  },
  {
    id: "etd-eta", baslik: "ETD / ETA", evren: "Açık Deniz",
    hikaye: "Gemi demir aldı. Tema'ya 24 gün var.",
    renk: ["#3B82F6", "#0C4A6E"], ekran: "etd-eta", adres: "/etd-eta", yetki: "etd_eta",
    adimlar: [
      { baslik: "Bütün yolculuklar", metin: "Tüm sevkiyatların kalkış (ETD) ve varış (ETA) tarihleri tek tabloda." },
      { nokta: "sayac", baslik: "Özet", metin: "Toplam sevkiyat, ETA girilmiş ve ETA eksik sayıları. Filtre düğmeleriyle eksikleri ayırın." },
      { nokta: "ara", baslik: "Arama", metin: "Firma, booking, BL, gemi ya da liman ile arayın." },
      { nokta: "tablo", baslik: "Sevkiyat tablosu", metin: "Varışı yaklaşan sevkiyatlar renkli tarihle öne çıkar. ETA değişince buradan güncelleyin." },
    ],
  },
  {
    id: "ihracatlar", baslik: "İhracatlar", evren: "Hafıza Arşivi",
    hikaye: "Yolculuk tamamlandı, dosya arşivde. Siparişin kalan 250 tonu sırada bekliyor.",
    renk: ["#EAB308", "#283474"], ekran: "ihracatlar", adres: "/ihracatlar", yetki: "ihracatlar",
    adimlar: [
      { baslik: "Arşiv ve siparişler", metin: "Kapatılmış dosyalar ve birden fazla sevkiyata bölünen siparişler burada." },
      { nokta: "siparis", baslik: "Devam eden siparişler", metin: "Her sipariş kalem kalem izlenir: sipariş, sevk edilen, kalan ve dosyası açılmamış miktar (FCL ve çuval)." },
      { nokta: "devam", baslik: "Siparişe Devam Et", metin: "Kalan miktar için yeni sevkiyat dosyasını birkaç tıkla açar; ambalaj ve marka önerilir." },
      { nokta: "arsiv", baslik: "Kapatılmış dosyalar", metin: "Alıcı, proforma, ürün, liman, BL ya da markayla arayın; satıra tıklayınca evraklar ve konteynerler açılır." },
    ],
  },
  {
    id: "kontrol-merkezi", baslik: "Kontrol Merkezi", evren: "Tek Gökyüzü",
    hikaye: "Bütün yolculuklar tek gökyüzünde: hacim, rotalar ve müşteriler bir bakışta.",
    renk: ["#10B981", "#F4A07C"], ekran: "kontrol-merkezi", adres: "/analiz", yetki: "analiz",
    adimlar: [
      { baslik: "Büyük resim", metin: "Tüm dosyalardan hesaplanan analizler. Sayılar sayfadaki verilerle birebir aynıdır, tahmin içermez." },
      { nokta: "filtre", baslik: "Filtre", metin: "Tümü / Açık / Tamamlanan ve yıl seçimi bütün kartları birlikte değiştirir." },
      { nokta: "kpi", baslik: "Göstergeler", metin: "Toplam hacim, konteyner, miktar, ortalama birim fiyat, teslim şekli ve tamamlanma oranı." },
      { nokta: "grafik", baslik: "Aylık sevkiyat", metin: "Gemi kalkış ayına göre hacim, konteyner ya da MTS. Kesikli çubuk planlanan sevkiyattır." },
      { nokta: "ozet", baslik: "Otomatik özet", metin: "Seçili filtreye göre öne çıkan bulgular cümle cümle yazılır." },
      { nokta: "harita", baslik: "Sevkiyat haritası", metin: "Mersin'den varış limanlarına rotalar; aşağıda limanlar, müşteriler, acente ve navlun, transit süreleri." },
    ],
  },
  {
    id: "ic-piyasa", baslik: "İç Piyasa", evren: "Yurt İçi Galaksisi",
    hikaye: "Değirmenin yan ürünleri yurt içindeki müşterilere yola çıkıyor.",
    renk: ["#84CC16", "#365314"], ekran: "ic-piyasa", adres: "/ic-piyasa/is-emirleri", yetki: "ic_piyasa",
    adimlar: [
      { baslik: "Yurt içi satış", metin: "İş emri, kantar çıkışı, irsaliye ve müşteri bildirimleri tek bölümde." },
      { nokta: "sekmeler", baslik: "Bölümler", metin: "İş Emirleri, Bildirimler, Müşteriler ve Fiyat Formu." },
      { nokta: "sayaclar", baslik: "Günün özeti", metin: "Açık iş emri, bugün yüklenen araç, açık emirlerde yüklenen miktar ve kontrol bekleyen uyarılar." },
      { nokta: "emir", baslik: "İş emri satırı", metin: "Hedef miktar ve yükleme ilerlemesi, araçların çıkışı ve irsaliyeleri. Detay ile sevkleri yönetin." },
      { nokta: "yeni", baslik: "Sipariş formundan aç", metin: "Müşteriyle imzalanan sipariş formunu yükleyin, iş emri kendiliğinden açılsın; ya da “Yeni İş Emri”." },
    ],
  },
  {
    id: "satin-alma", baslik: "Satın Alma", evren: "Fabrikanın Nabzı",
    hikaye: "Fabrikanın ihtiyaçları da aynı düzenle karşılanıyor.",
    renk: ["#FB7185", "#283474"], ekran: "satin-alma", adres: "/satin-alma", yetki: "satin_alma",
    adimlar: [
      { baslik: "Departman talepleri", metin: "Departmanlar kendilerine özel bağlantıdan, giriş yapmadan ihtiyaç listesi gönderir; onay buradan verilir." },
      { nokta: "sekmeler", baslik: "Sekmeler", metin: "Onay bekleyen, Onaylı fişler, Departman geçmişi, Departmanlar ve bağlantılar." },
      { nokta: "liste", baslik: "Talep listesi", metin: "Her listede ürün, miktar, talep eden ve aciliyet." },
      { nokta: "karar", baslik: "Onayla / Reddet", metin: "Her kalem için karar verin ya da “Tümünü onayla”. Kaydedince sonuç e-postası gider." },
      { nokta: "not", baslik: "Akıllı kontroller", metin: "Aynı ürün başka departmanda da bekliyorsa, benzer ürün varsa ya da yakın zamanda alındıysa satırda not çıkar." },
    ],
  },
];
