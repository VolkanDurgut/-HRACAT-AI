/**
 * PAZAR Satis Rehberi icerigi (10.11.2026). Kullanici: "Bilgilendirici mail iletmeli miyiz? ... kullanim kilavuzu
 * gibi dusun; ayni Unex kullanim kilavuzunda yaptigimiz gibi goruntulu, animasyonlu bir sunum."
 * Sayfa: app/gorev/rehber (GIRISSIZ; satis ekibinin uygulama hesabi gerekmez) - sunum components/kilavuz/sunum.tsx.
 * Ekranlar public/kilavuz/{pazar-*,gorev-*}.webp + lib/pazar/rehber-noktalari.ts: KURGUSAL veri (repo acik;
 * gercek musteri / personel adi YOK). Anlatim "siz" diliyle; isimler mailde veritabanindan (pazar_ekip) gelir.
 */
import type { KilavuzKonusu } from "@/lib/kilavuz/konular";

export const REHBER_KONULARI: KilavuzKonusu[] = [
  {
    id: "sabah-maili", baslik: "Sabah Maili", evren: "Güne Başlarken",
    hikaye: "Saat 09:00. Gelen kutunuzda İhracat AI'dan kısa bir mail var: bugün kiminle görüşeceğiniz hazır.",
    renk: ["#10B981", "#283474"], ekran: "pazar-mail", cubuk: "Outlook · Gelen Kutusu",
    adimlar: [
      { baslik: "Her sabah size özel tek mail", metin: "Hafta içi her sabah 09:00'da size özel bir mail gelir. Satış ekibindeki her kişiye farklı müşteriler düşer; aynı firma aynı gün iki kişiye verilmez." },
      { nokta: "kart", baslik: "Bugünkü müşteriniz", metin: "Kartta firma, ülke, yetkili ve neden seçildiği yazar: siparişsiz müşterimiz, hatırlatma zamanı ya da fuar potansiyeli." },
      { nokta: "basla", baslik: "Başla", metin: "Yeşil Başla düğmesi görev sayfasını açar. Giriş ya da şifre gerekmez; bağlantı 3 gün geçerlidir." },
      { nokta: "liste", baslik: "Sıradakiler", metin: "Altta günün diğer müşterileri listelenir. İlkini bitirince sayfadan sıradakine geçersiniz; günde en fazla 6 müşteri." },
    ],
  },
  {
    id: "musteriyi-tani", baslik: "Müşteriyi Tanıyın", evren: "Kart Masası",
    hikaye: "Başla'ya bastınız. Sayfa, müşteri hakkında bilmeniz gereken her şeyi tek kartta topladı.",
    renk: ["#38BDF8", "#283474"], ekran: "gorev-ust", cubuk: "/gorev/••••••",
    adimlar: [
      { nokta: "firma", baslik: "Firma kartı", metin: "Neden seçildiği, ülke, son sipariş tarihi ve en son aldığı ürün. Mesaj bu bilgilere göre hazırlanır." },
      { nokta: "adimlar", baslik: "Üç adımlı süreç", metin: "1. Sipariş sorgulama → 2. Hatırlatma 1 → 3. Hatırlatma 2. Hangi adımda olunduğunu sistem bilir; siz yalnız bugünkü adımı yaparsınız." },
      { nokta: "sahip", baslik: "Görev sizin", metin: "Görevin kime ait olduğu ve mailin hangi adresten gideceği burada yazar." },
      { nokta: "kime", baslik: "Kime yazıyoruz?", metin: "Firmanın yetkililerinden birini seçin. Mesajdaki hitap seçtiğiniz kişiye göre kendiliğinden değişir." },
    ],
  },
  {
    id: "mesaj", baslik: "Mesajı Gönderin", evren: "Kelime Atölyesi",
    hikaye: "Mesaj hazır: İngilizce, kısa ve kibar. İsterseniz değiştirirsiniz, istemezseniz olduğu gibi gönderirsiniz.",
    renk: ["#A78BFA", "#283474"], ekran: "gorev-mesaj", cubuk: "/gorev/••••••",
    adimlar: [
      { nokta: "sablonlar", baslik: "Üç hazır şablon", metin: "Yeni sipariş planı, güncel fiyat teklifi ya da kısa ve samimi. Sekmeye tıklayınca konu ve metin değişir." },
      { nokta: "metin", baslik: "Konu ve metin sizin", metin: "Metni dilediğiniz gibi düzenleyebilirsiniz. İmzada kendi e-posta adresiniz yer alır." },
      { ekran: "gorev-gonderdim", nokta: "outlook", baslik: "Outlook'ta aç", metin: "Düğme Outlook'u hazır mailin açık hâliyle açar: alıcı, konu ve metin dolu; execution@ bilgiye (CC) kendiliğinden eklenir. Gönder'e siz basarsınız." },
      { ekran: "gorev-gonderdim", nokta: "gonderdim", baslik: "Evet, gönderdim", metin: "Outlook'tan dönünce sayfa sorar: gönderdiniz mi? Evet derseniz kayıt düşer ve hatırlatma günü kendiliğinden hesaplanır. Göndermediyseniz Henüz değil'e basın." },
    ],
  },
  {
    id: "whatsapp", baslik: "WhatsApp", evren: "Hızlı Hat",
    hikaye: "Müşteri WhatsApp'ta daha hızlıysa aynı mesaj tek tıkla oradan da gider.",
    renk: ["#25D366", "#0F3D2E"], ekran: "gorev-whatsapp", cubuk: "/gorev/••••••",
    adimlar: [
      { nokta: "numaralar", baslik: "Numaraya doğrudan", metin: "Fuar listesindeki potansiyellerin numarası kayıtlıdır; her numara için ayrı düğme vardır. Tıklayınca WhatsApp, mesaj yazılmış hâlde açılır." },
      { nokta: "kopyala", baslik: "Grup, Paylaş, Kopyala", metin: "Kendi müşterilerimizde mesaj hazır gelir, WhatsApp grubunu seçersiniz. Telefonda Paylaş, her yerde Mesajı kopyala çalışır." },
      { baslik: "Gönderdim'i unutmayın", metin: "WhatsApp'tan dönünce de Evet, gönderdim deyin. Aynı gün hem mail hem WhatsApp gönderirseniz süreç bir kez ilerler." },
    ],
  },
  {
    id: "sonuc", baslik: "Sonuç ve Sıradaki", evren: "Yol Ayrımı",
    hikaye: "Müşteri döndü mü, yoksa bugün ulaşılamıyor mu? Tek kural: temas bildirmeden sıradakine geçilmez.",
    renk: ["#F59E0B", "#3B2A0B"], ekran: "gorev-sonuc", cubuk: "/gorev/••••••",
    adimlar: [
      { nokta: "sonuclar", baslik: "Müşteri döndü mü? (zorunlu değil)", metin: "Cevap verdi, Teklif istedi, Sipariş verdi ya da İlgilenmiyor. İşaretlerseniz bu firmaya hatırlatma gitmez." },
      { nokta: "atla", baslik: "Müşteriyi atla", metin: "Bugün ulaşılamıyorsa atlayın; kısa bir neden yazmak zorunludur. Daha önce yazılan nedenler hazır seçenek olarak gelir. Firma birkaç gün sonra yeniden sıraya girer." },
      { nokta: "siradaki", baslik: "Yeni müşteriyle devam et", metin: "Mail ya da WhatsApp gönderdiğinizi bildirdiğinizde (ya da nedeniyle atladığınızda) kilit açılır ve sıradaki müşteriye geçersiniz." },
    ],
  },
  {
    id: "otomatik", baslik: "Sistem Takip Eder", evren: "Otomatik Pilot",
    hikaye: "Siz gönderdikten sonra hatırlatma günlerini, gelen cevapları ve sırayı sistem tutar.",
    renk: ["#60A5FA", "#1E3A8A"], ekran: "gorev-cevap", cubuk: "/gorev/••••••",
    adimlar: [
      { baslik: "Hatırlatma takvimi", metin: "Sorgulamadan 4 iş günü sonra Hatırlatma 1, ondan 6 iş günü sonra Hatırlatma 2 listenize kendiliğinden gelir. Cevap yoksa firma bir süre dinlenmeye alınır." },
      { nokta: "cevap", baslik: "Cevaplar kendiliğinden yakalanır", metin: "Müşteri Tümünü yanıtla ile cevap verirse sistem 10 dakika içinde yakalar, hatırlatmayı durdurur ve cevabı sayfanın en üstünde gösterir." },
      { nokta: "oneri", baslik: "Öneriyi kaydet", metin: "Sistem cevabı okuyup öneride bulunur: teklif istedi, sipariş verdi ya da ilgilenmiyor. Doğruysa tek tıkla kaydedin." },
    ],
  },
  {
    id: "takip", baslik: "Takip Ekranı", evren: "Gözlem Kulesi",
    hikaye: "Yöneticiler günü İhracat AI'da Pazar sayfasının Takip sekmesinden izler; her adımınız burada görünür.",
    renk: ["#F4A07C", "#283474"], ekran: "pazar-takip", cubuk: "/pazar",
    adimlar: [
      { nokta: "bugun", baslik: "Bugün", metin: "Herkesin günün görevleri, ne yapıldığı ve atlananların nedeni. İlerleme çubuğu günün ne kadarının bittiğini gösterir." },
      { nokta: "cevaplar", baslik: "Gelen cevaplar", metin: "Son 14 günün müşteri cevapları ve sistemin önerisi." },
      { nokta: "surec", baslik: "Süreçteki firmalar", metin: "Sonraki hatırlatma tarihleri: geciken kırmızı, bugünkü sarı. Cevap veren firmalarda takip sizdedir." },
    ],
  },
];
