import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiWithPdf, corsHeaders, errorResponse, successResponse, pdfToBase64 } from "../_shared/gemini-helper.ts";

type DbaVerisi = {
  dba_belge_no: string;
  tartim_tarih_saat: string;
  kantar_firma_unvan: string;
  kantar_no: string;
  konteyner_no: string;
  konteyner_payload_kg: number;
  konteyner_dara_kg: number;
  dogrulanmis_brut_agirlik_kg: number;
  arac_plaka: string;
  arac_bos_agirlik_kg: number;
  yukleten_unvan: string;
  yuklenecegi_yer: string;
};

function isDbaVerisi(value: unknown): value is DbaVerisi {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DbaVerisi).konteyner_no === "string" &&
    (value as DbaVerisi).konteyner_no.length > 0
  );
}

const DBA_PROMPT = `Bu bir Türk Ulaştırma ve Altyapı Bakanlığı onaylı "Konteyner Doğrulanmış Brüt Ağırlık Belgesi" (DBA) dir. Aşağıdaki JSON formatında tüm verileri çıkarın. Ağırlık değerlerini sadece sayısal değer olarak döndürün (KG ibaresi olmadan, nokta veya virgül ayracı olmadan tam sayı olarak).

{
  "dba_belge_no": "",
  "tartim_tarih_saat": "",
  "kantar_firma_unvan": "",
  "kantar_no": "",
  "konteyner_no": "",
  "konteyner_payload_kg": 0,
  "konteyner_dara_kg": 0,
  "dogrulanmis_brut_agirlik_kg": 0,
  "arac_plaka": "",
  "arac_bos_agirlik_kg": 0,
  "yukleten_unvan": "",
  "yuklenecegi_yer": ""
}

Sadece JSON döndürün, başka metin eklemeyin. Ağırlıkları tam sayı olarak döndürün (örn: 27240, 15240, 2200).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    return successResponse({ status: "ok" });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return errorResponse("PDF dosyası gerekli", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = pdfToBase64(new Uint8Array(arrayBuffer));

    const extracted = await callGeminiWithPdf(base64, file.type || "application/pdf", DBA_PROMPT, isDbaVerisi);

    // Net agirlik hesapla: payload - konteyner dara
    const payload = Number(extracted.konteyner_payload_kg) || 0;
    const dara = Number(extracted.konteyner_dara_kg) || 0;
    const netAgirlik = payload > 0 && dara > 0 ? payload - dara : 0;

    return successResponse({ ...extracted, net_agirlik_kg: netAgirlik });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});