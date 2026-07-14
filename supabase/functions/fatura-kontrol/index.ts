import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiWithPdf, corsHeaders, errorResponse, successResponse, pdfToBase64 } from "../_shared/gemini-helper.ts";
import { kotaKontrolVeLogla } from "../_shared/kota-kontrol.ts";

type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
  diib_no: string | null;
  diib_tarihi: string | null;
};

function isFaturaKontrolSonucu(value: unknown): value is FaturaKontrolSonucu {
  return typeof value === "object" && value !== null && typeof (value as FaturaKontrolSonucu).uyumlu === "boolean";
}

function buildPrompt(sistemVerisi: Record<string, unknown>): string {
  return `Ekte muhasebenin kestiği bir Türk Ticari Faturası (resmi fatura, e-fatura veya kağıt fatura) bulunmaktadır. Bu faturadaki bilgileri, aşağıda JSON olarak verilen bizim sistemimizdeki kayıtlı verilerle karşılaştır.

SISTEMDEKI VERI:
${JSON.stringify(sistemVerisi, null, 2)}

Karşılaştırmada ŞU KURALLARA KESİNLİKLE UY:

1. YOK SAYILACAKLAR (BUNLARI KESİNLİKLE UYUMSUZLUK SAYMA):
   - "alici_firma" (Alıcı Firma): Müşteri gizliliği veya yer darlığı için faturada kasıtlı olarak kısaltılmış olabilir (Örn: "COOL LINK & MARKETING" yerine "C.L.M.P.L" veya unvan eksikliği). Bunu uyumsuzluk SAYMA.
   - "urun_tanimi" (Ürün Tanımı): Muhasebe/gümrük zorunluluğu nedeniyle faturada Türkçe çevirisi veya farklı bir gümrük ibaresi (örn: "BUĞDAY UNU 74 RANDIMAN") yer alabilir. Ürün tanımını uyumsuzluk SAYMA.
   - "proforma_no" (Proforma No): Faturada yer almayabilir veya Booking/Sipariş numarası ile değiştirilmiş olabilir. Proforma numarasını KARŞILAŞTIRMA.
   - Liman isimleri ve gemi adlarındaki kısmi eşleşmeleri (örn: "MARPORT" vs "ISTANBUL-MARPORT", "POLAR ECUADOR" vs "POLAR ECUADOR / 627W") uyumsuzluk SAYMA.
   - DİİB Numarası ve Tarihi: Faturada DİİB numarası var ancak sistemde yoksa bunu KESİNLİKLE "uyusmazliklar" listesine EKLEME.

2. ODAKLANILACAK ASIL KONTROLLER (BUNLARI KONTROL ET):
   - KONTEYNER NUMARALARI: Faturada listelenen konteyner numaralarını sistemdeki "konteynerler" listesiyle tek tek eşleştir. Tek bir karakter farkı bile varsa bildir.
   - AĞIRLIK VE KAP ADEDİ: Faturadaki toplam Net KG, Brüt KG ve Kap Adedi (Pieces) bilgilerini kontrol et. Eğer faturada konteyner bazlı ağırlık yazıyorsa sistemdeki verilerle eşleştirerek bak.
   - TUTARLAR: Toplam tutarı ve para birimini kontrol et.

3. KARŞILAŞTIRMA KATILIĞI (ESNEKLİK):
   - Binlik/ondalık ayraç farklılıklarını (virgül vs nokta kullanımı) YOK SAY.
   - Küçük yuvarlama veya kantar tartım farklarını YOK SAY (Örn: Net 25.000 ile 25.050 arasında ufak farklar normaldir, tutarlarda 1-2 USD/EUR altı farklar yuvarlamadan kaynaklanır, bunları uyumsuzluk sayma).

- Faturadan "fatura_no", "fatura_tarihi" (YYYY-MM-DD), "diib_no" ve "diib_tarihi" (YYYY-MM-DD) bilgilerini çıkar. Bu 4 bilgiyi "uyusmazliklar" dizisine KESİNLİKLE KOYMA, doğrudan JSON ana objesinde döndür. Bulamazsan null ver.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir metin ekleme:
{
  "uyumlu": true/false,
  "uyusmazliklar": [
    { "alan": "alan adi", "sistemde": "sistemdeki deger", "dosyada": "faturadaki deger" }
  ],
  "ozet": "Kisa, 1-2 cumlelik Turkce ozet.",
  "fatura_no": "faturadaki fatura numarasi",
  "fatura_tarihi": "YYYY-MM-DD",
  "diib_no": "faturadaki diib numarasi veya null",
  "diib_tarihi": "YYYY-MM-DD veya null"
}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    const geminiKey = !!Deno.env.get("GEMINI_API_KEY");
    return successResponse({ status: "ok", gemini_configured: geminiKey });
  }

  try {
    // AI kota kontrolü — Gemini çağrılmadan önce (maliyet koruması)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Yetkilendirme gerekli. Lütfen giriş yapın.", 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const kota = await kotaKontrolVeLogla(token, "fatura-kontrol");
    if (!kota.izin) {
      return errorResponse(kota.mesaj, 403);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sistemVerisiRaw = formData.get("sistem_verisi") as string | null;

    if (!file) {
      return errorResponse("PDF dosyası gerekli", 400);
    }
    if (!sistemVerisiRaw) {
      return errorResponse("Sistem verisi gerekli", 400);
    }

    const sistemVerisi = JSON.parse(sistemVerisiRaw);
    const arrayBuffer = await file.arrayBuffer();
    const base64 = pdfToBase64(new Uint8Array(arrayBuffer));

    const prompt = buildPrompt(sistemVerisi);
    const sonuc = await callGeminiWithPdf(base64, file.type || "application/pdf", prompt, isFaturaKontrolSonucu);

    return successResponse(sonuc);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});
