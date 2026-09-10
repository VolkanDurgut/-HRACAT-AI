// Ortak Gemini yardimci modulu
// Hem dba-oku hem konsimento-kontrol Edge Function'lari tarafindan kullanilir

export const GEMINI_MODELS = ["gemini-2.5-flash"];

/** Belirtilen milisaniye kadar bekler (yeniden deneme aralari icin). */
function gecikme(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTP durum kodu, TEKRAR DENENINCE duzelme ihtimali olan gecici bir
 * hatayi mi gosteriyor (yogunluk/asiri istek/gecici sunucu hatasi),
 * yoksa kalici bir hatayi mi (ornegin gecersiz istek) gosteriyor. */
function geciciHataMi(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Kullaniciya gosterilecek son hata mesaji - herhangi bir yapay zeka
 * saglayicisinin/model adinin ic detayini ASLA disari sizdirmaz. */
const SON_HATA_MESAJI = "Belge okuma servisinde geçici bir yoğunluk yaşandı. Lütfen birkaç saniye sonra tekrar deneyin.";

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
    const MAKS_DENEME = 3;
    for (let deneme = 1; deneme <= MAKS_DENEME; deneme++) {
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
          console.error(`Model ${model} deneme ${deneme}/${MAKS_DENEME} basarisiz (${response.status}): ${err}`);
          if (geciciHataMi(response.status) && deneme < MAKS_DENEME) {
            await gecikme(deneme * 1500);
            continue;
          }
          break;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) break;

        const parsed = JSON.parse(text);
        if (validate(parsed)) return parsed;
        break;
      } catch (e) {
        console.error(`Model ${model} deneme ${deneme}/${MAKS_DENEME} hata:`, e);
        if (deneme < MAKS_DENEME) {
          await gecikme(deneme * 1500);
          continue;
        }
      }
    }
  }

  throw new Error(SON_HATA_MESAJI);
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

/**
 * Gemini API'ye SADECE METİN (PDF olmadan) gönderir, modeller arasında fallback yapar.
 * Destek sohbeti gibi düz metin tabanlı senaryolar için kullanılır.
 *
 * @param systemPrompt - Kalıcı talimat/persona metni
 * @param conversationText - Önceki konuşma geçmişi + kullanıcının yeni mesajı, düz metin olarak
 */
export async function callGeminiTextOnly(systemPrompt: string, conversationText: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ortam değişkeni ayarlanmamış. Lütfen API anahtarını yapılandırın.");
  }

  for (const model of GEMINI_MODELS) {
    const MAKS_DENEME = 3;
    for (let deneme = 1; deneme <= MAKS_DENEME; deneme++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: conversationText }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error(`Model ${model} deneme ${deneme}/${MAKS_DENEME} basarisiz (${response.status}): ${err}`);
          if (geciciHataMi(response.status) && deneme < MAKS_DENEME) {
            await gecikme(deneme * 1500);
            continue;
          }
          break;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
        break;
      } catch (e) {
        console.error(`Model ${model} deneme ${deneme}/${MAKS_DENEME} hata:`, e);
        if (deneme < MAKS_DENEME) {
          await gecikme(deneme * 1500);
          continue;
        }
      }
    }
  }

  throw new Error(SON_HATA_MESAJI);
}