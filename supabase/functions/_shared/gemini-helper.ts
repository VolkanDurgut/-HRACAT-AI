// Ortak Gemini yardimci modulu
// Hem dba-oku hem konsimento-kontrol Edge Function'lari tarafindan kullanilir

export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * PDF binary verisini base64'e cevirir.
 */
export function pdfToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Gemini API'ye PDF + prompt gonderir, modeller arasinda fallback yapar.
 * validate fonksiyonu, donen JSON'un beklenen sekilde olup olmadigini kontrol eder.
 *
 * @param base64Pdf - base64 kodlanmis PDF verisi
 * @param mimeType - dosyanin mime type'i (orn. application/pdf)
 * @param prompt - Gemini'ye gonderilecek prompt metni
 * @param validate - donen JSON'un gecerli olup olmadigini kontrol eden fonksiyon
 */
export async function callGeminiWithPdf<T>(
  base64Pdf: string,
  mimeType: string,
  prompt: string,
  validate: (parsed: unknown) => parsed is T
): Promise<T> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ortam değişkeni ayarlanmamış. Lütfen API anahtarını yapılandırın.");
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Pdf } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`Model ${model} failed: ${err}`);
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const parsed = JSON.parse(text);
      if (validate(parsed)) return parsed;
    } catch (e) {
      console.error(`Model ${model} error:`, e);
      continue;
    }
  }

  throw new Error("Tüm Gemini modelleri başarısız oldu. Lütfen tekrar deneyin.");
}

/**
 * Edge Function icin standart hata yaniti olusturur.
 */
export function errorResponse(message: string, status?: number): Response {
  const finalStatus = status ?? (message.includes("ortam değişkeni") ? 503 : 500);
  return new Response(
    JSON.stringify({ error: message }),
    { status: finalStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Edge Function icin standart basarili yanit olusturur.
 */
export function successResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Auth token'i request header'indan dogrular (opsiyonel kullanim).
 * Token yoksa veya gecersizse hata firlatir.
 */
export function requireAuthToken(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Yetkilendirme gerekli. Lütfen giriş yapın.");
  }
  return authHeader.replace("Bearer ", "");
}