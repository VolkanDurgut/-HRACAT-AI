import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiWithPdf, corsHeaders, pdfToBase64, errorResponse, successResponse, requireAuthToken } from "../_shared/gemini-helper.ts";
import { kotaKontrolVeLogla } from "../_shared/kota-kontrol.ts";

function isProformaVerisi(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).satici_firma === "string";
}

const PROFORMA_PROMPT = `Bu bir Türk gıda ihracat proforma faturasıdır. Aşağıdaki JSON formatında tüm verileri çıkarın:

{
  "satici_firma": "",
  "alici_firma": "",
  "alici_tel": "",
  "alici_email": "",
  "alici_adresi": "",
  "proforma_no": "",
  "proforma_tarihi": "YYYY-MM-DD",
  "gecerlilik_tarihi": "YYYY-MM-DD",
  "lot_no": "",
  "miktar": 0,
  "miktar_birimi": "MTS",
  "ambalaj": "",
  "detayli_ambalaj": "",
  "toplam_tutar": 0,
  "para_birimi": "USD",
  "avans_tutari": 0,
  "varis_limani": "",
  "yukleme_limani": "",
  "teslim_sekli": "",
  "sevkiyat_suresi": "",
  "odeme_sekli": "",
  "menşei": "Türkiye",
  "marka": "",
  "hesap_adi": "",
  "banka": "",
  "swift": "",
  "hesap_numarasi": "",
  "iban": "",
  "urun_detaylari": [
    {
      "description": "",
      "packaging_size": "",
      "quantity": 0,
      "unit_price": 0,
      "total_amount": 0
    }
  ],
  "sevkiyat_evraklari": []
}

ÖNEMLİ - "teslim_sekli" ve "varis_limani" alanları AYRI bilgilerdir, birbirine karıştırmayın:
- "teslim_sekli": SADECE Incoterm kodu (örn: "CIF", "CFR", "FOB", "EXW", "CPT", "DAP"). Belgede "CFR Singapore Port Singapore" gibi birleşik bir ifade görseniz, sadece "CFR" kısmını bu alana yazın.
- "varis_limani": SADECE liman/şehir/ülke adı (örn: "Singapore Port, Singapore"). Incoterm kodunu bu alana KOYMAYIN.
Örnek: Belgede "CFR Singapore Port Singapore" yazıyorsa → teslim_sekli: "CFR", varis_limani: "Singapore Port, Singapore"

ÖNEMLİ - "alici_adresi" alanı:
- Alıcı firmanın (Buyer) belgede yazan TAM açık adresi (sokak, şehir, ülke, P.O. Box vb. dahil her şey).
- Bu, "alici_firma" (firma adı) ile karıştırılmamalı, sadece adres bilgisi olmalı.

ÖNEMLİ - "ambalaj" ve "detayli_ambalaj" alanları AYRI bilgilerdir:
- "ambalaj": Kısa, genel ambalaj türü (örn: "25kg çuval", "PP Bag").
- "detayli_ambalaj": Belgede "PACKAGING" başlığı altında yazan TAM ifade, sayısı ve birimiyle birlikte (örn: "2502 PIECES OF 30 KG PP BAGS" veya "2.000 PIECES OF 25 KG PP BAGS + KRAFT"). Bu alanı belgede yazıldığı gibi, eksiksiz kopyalayın.

ÖNEMLİ - "marka" alanı (Brand & Marking):
- Belgenin (genelde 2. veya 3. sayfasındaki "Sales Contract" bölümünde) "BRAND & MARKING", "BRAND", veya "MARKING" etiketiyle yazan değeri bu alana koyun (örnek: "BACKALDRIN HOLLY LAND BRANDS").
- Bu alan, alıcının çuval/ambalaj üzerinde görmek istediği marka/etiket bilgisidir, satıcı veya alıcı firma adıyla KARIŞTIRMAYIN.
- Eğer belgede bu etiket hiç geçmiyorsa, "marka" alanını boş string olarak bırakın, tahmin etmeyin.

ÖNEMLİ - "hesap_numarasi" ve "iban" alanları AYRI bilgilerdir, birbirine karıştırmayın:
- "hesap_numarasi": Belgede "Account Number", "Account No", "A/C No" gibi etiketlerle yazan klasik banka hesap numarası (IBAN'dan farklı, genelde daha kısa bir rakam dizisi).
- "iban": Belgede "IBAN" etiketiyle yazan, "TR" veya başka ülke koduyla başlayan uzun banka numarası.
- Eğer belgede SADECE "Account Number" yazıyor ve IBAN hiç yoksa, bu değeri "hesap_numarasi" alanına yazın, "iban" alanını boş bırakın.
- Eğer belgede SADECE "IBAN" yazıyor ve Account Number hiç yoksa, bu değeri "iban" alanına yazın, "hesap_numarasi" alanını boş bırakın.

Sadece JSON döndürün, başka metin eklemeyin. Boş alanlar için boş string veya 0 kullanın.`;

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
    const kota = await kotaKontrolVeLogla(token, "proforma-oku");
    if (!kota.izin) {
      return errorResponse(kota.mesaj, 403);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return errorResponse("PDF dosyası gerekli", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = pdfToBase64(new Uint8Array(arrayBuffer));

    const extracted = await callGeminiWithPdf(base64, file.type || "application/pdf", PROFORMA_PROMPT, isProformaVerisi);

    return successResponse(extracted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});