import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiWithPdf, corsHeaders, errorResponse, successResponse, pdfToBase64 } from "../_shared/gemini-helper.ts";

type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
};

function isFaturaKontrolSonucu(value: unknown): value is FaturaKontrolSonucu {
  return typeof value === "object" && value !== null && typeof (value as FaturaKontrolSonucu).uyumlu === "boolean";
}

function buildPrompt(sistemVerisi: Record<string, unknown>): string {
  return `Ekte muhasebenin kestiği bir Türk Ticari Faturası (resmi fatura, e-fatura veya kağıt fatura) bulunmaktadır. Bu faturadaki bilgileri, aşağıda JSON olarak verilen bizim sistemimizdeki kayıtlı verilerle karşılaştır.

SISTEMDEKI VERI:
${JSON.stringify(sistemVerisi, null, 2)}

Karşılaştırmada şu noktalara dikkat et:
- Alıcı firma, satıcı firma, ürün adı/tanımı, toplam tutar, para birimi gibi alanları kontrol et.
- Küçük yazım farklarını (büyük/küçük harf, fazla boşluk, firma unvanındaki "LTD.STI." gibi kısaltma farkları) uyumsuzluk SAYMA.
- Tutarlarda küçük yuvarlama farkları (1 USD altı) uyumsuzluk SAYMA.
- Önemli bir tutar veya firma adı farkı varsa bunu mutlaka uyumsuzluk olarak bildir.
- LİMAN VE GEMİ ADI KARŞILAŞTIRMASI (esnek olun): Liman isimleri ve gemi adlarında, bir değerin diğerini İÇERMESİ veya kısmen eşleşmesi durumunda bunu uyumsuzluk SAYMA. Örnek: "MARPORT" ile "MARPORT/AMBARLI/ISTANBUL/TURKIYE" aynı limandır, uyumsuzluk DEĞİLDİR. "POLAR ECUADOR" ile "POLAR ECUADOR / 627W" aynı gemidir, uyumsuzluk DEĞİLDİR. Sadece tamamen alakasız bir isim varsa gerçek uyumsuzluk say.
- KONTEYNER KARŞILAŞTIRMASI (kritik): Faturada konteyner numaraları listelenmişse (genelde "KONTEYNER NO:" başlığı altında, tire veya virgülle ayrılmış), bunları sistemdeki "konteynerler" listesiyle TEK TEK eşleştirip karşılaştır. Konteyner numarasında tek bir karakter farkı bile varsa mutlaka uyumsuzluk olarak bildir.
- AĞIRLIK KARŞILAŞTIRMASI: Faturada toplam Net KG ve Brüt KG yazıyorsa, sistemdeki konteynerlerin toplam net/brüt ağırlığıyla karşılaştır. Sistemde bu veriler henüz girilmemişse (boş/null), uyumsuzluk SAYMA.
- DIIB KARŞILAŞTIRMASI: Faturada DIIB No/Tarihi yazıyorsa, sistemdeki "diib_no" ile karşılaştır. Sistemde boşsa uyumsuzluk SAYMA.
- Faturadan ayrıca "fatura_no" (fatura numarası) ve "fatura_tarihi" (YYYY-MM-DD formatında) bilgilerini çıkar, bunlar sistemde olmasa bile mutlaka doldur. Fatura tarihinde saat bilgisi varsa (örn. "30-06-2026 11:53:59"), sadece tarih kısmını al, saati yok say.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir metin ekleme:
{
  "uyumlu": true/false,
  "uyusmazliklar": [
    { "alan": "alan adi", "sistemde": "sistemdeki deger", "dosyada": "faturadaki deger" }
  ],
  "ozet": "Kisa, 1-2 cumlelik Turkce ozet. Eger uyumlu ise olumlu bir mesaj yaz.",
  "fatura_no": "faturadaki fatura numarasi",
  "fatura_tarihi": "YYYY-MM-DD"
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
