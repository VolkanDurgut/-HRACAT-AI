import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiWithPdf, corsHeaders, errorResponse, successResponse, pdfToBase64 } from "../_shared/gemini-helper.ts";
import { kotaKontrolVeLogla } from "../_shared/kota-kontrol.ts";

type KontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  consignee: string;
  notify: string[];
  bl_no?: string;
};

function isKontrolSonucu(value: unknown): value is KontrolSonucu {
  return typeof value === "object" && value !== null && typeof (value as KontrolSonucu).uyumlu === "boolean";
}

function buildPrompt(sistemVerisi: Record<string, unknown>, belgeTipi: string): string {
  const belgeAdi = belgeTipi === "draft_bl"
    ? "taslak konşimento (Draft Bill of Lading)"
    : "konşimento talimatı (Bill of Lading Instruction)";
  return `Ekte bir ${belgeAdi} dosyası bulunmaktadır. Bu dosyadaki bilgileri, aşağıda JSON olarak verilen bizim sistemimizdeki kayıtlı verilerle karşılaştır.

SISTEMDEKI VERI:
${JSON.stringify(sistemVerisi, null, 2)}

Karşılaştırmada şu noktalara dikkat et:
- Dosya/Lot numaraları, firma isimleri, booking no, gemi adı, yükleme/varış limanları gibi alanları kontrol et.
- Küçük yazım farklarını (büyük/küçük harf, fazla boşluk) uyumsuzluk SAYMA.
- LİMAN VE GEMİ ADI KARŞILAŞTIRMASI (önemli, esnek olun): Liman isimleri ve gemi adlarında, bir değerin diğerini İÇERMESİ veya kısmen eşleşmesi durumunda bunu uyumsuzluk SAYMA. Örnekler:
  - "MARPORT" ile "ISTANBUL-MARPORT" aynı limandır (şehir öneki eklenmiş), uyumsuzluk DEĞİLDİR.
  - "MOMBASA" ile "MOMBASA PORT" aynı limandır ("PORT" kelimesi eklenmiş/çıkarılmış), uyumsuzluk DEĞİLDİR.
  - "POLAR ECUADOR" ile "POLAR ECUADOR 627W" aynı gemidir (sefer numarası eklenmiş), uyumsuzluk DEĞİLDİR.
  - Sadece TAMAMEN FARKLI bir liman veya gemi adı varsa (örn. "MARPORT" ile "AMBARLI" gibi alakasız isimler) bunu gerçek bir uyumsuzluk olarak bildir.
- KONTEYNER KARŞILAŞTIRMASI (kritik): Dosyadaki her konteynerin Konteyner No, Mühür No, Net Ağırlık (KG), Brüt Ağırlık (KG), ve Kap/Parça Adedini, sistemdeki "konteynerler" listesiyle TEK TEK eşleştirip karşılaştır. Eşleştirme konteyner numarasına göre yapılır.
- Konteyner veya mühür numaralarında tek bir karakter farkı bile varsa bunu mutlaka uyumsuzluk olarak bildir, bu kritik bir hatadır.
- Net/Brüt ağırlık veya kap adedinde fark varsa (sistemde kayıtlı değerle dosyadaki değer farklıysa), bunu da uyumsuzluk olarak bildir; hangi konteynere ait olduğunu "alan" kısmında belirt (örnek: "MRKU7041920 - Net Ağırlık").
- Sistemde bir konteyner için Net/Brüt/Kap Adeti henüz hiç girilmemişse (boş/null ise), bunu uyumsuzluk SAYMA, çünkü bu bilgi henüz idari personel tarafından girilmemiş olabilir.
- Sistemde olmayan ama dosyada olan bilgileri (örn. dosyada yazan ama bizim sistemde tutmadığımız alanlar) görmezden gel.
- CONSIGNEE ve ALICI FIRMA AYRIMI (çok önemli): Dosyadaki "Consignee" alanını SADECE sistemdeki "consignee" değeriyle karşılaştır. Consignee'yi ASLA "alici_firma" ile karşılaştırma; bunlar farklı alanlardır. Konşimentolarda Consignee sıklıkla "TO ORDER", "TO ORDER OF SHIPPER" veya bir banka adı olabilir; bu, alıcı firmadan farklı olduğu için uyumsuzluk DEĞİLDİR ve bunu asla "alici_firma" uyumsuzluğu olarak bildirme.
- SISTEMDE BOŞ OLAN ALANLAR: Sistemdeki bir alan boş, null veya tanımsız ise (örneğin bl_no henüz girilmemişse), dosyada o bilgi bulunsa bile bunu uyumsuzluk SAYMA. Bu bilgi henüz sisteme girilmemiş demektir, hata değildir.
- BL NUMARASI: Dosyada bir konşimento/BL numarası (Bill of Lading No, B/L No, Document No) varsa bunu tespit et ve "bl_no" alanına yaz. Yoksa boş string döndür.
- Ayrıca dosyadan "Consignee" (malı teslim alacak taraf, alıcıdan farklı olabilir) bilgisini çıkar ve mutlaka doldur. Consignee yoksa boş string döndür.
- Dosyada bulunan TÜM "Notify" veya "Notify Party" (Bildirim Yapılacak Taraf) bilgilerini tespit et. Bazen birden fazla Notify (Notify 1, Also Notify vb.) olabilir. Bunları tam adres ve unvanlarıyla birlikte bir dizi (array) olarak çıkar. Eğer hiç Notify bilgisi yoksa boş bir dizi [] döndür.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir metin ekleme:
{
  "uyumlu": true/false,
  "uyusmazliklar": [
    { "alan": "alan adi", "sistemde": "sistemdeki deger", "dosyada": "dosyadaki deger" }
  ],
  "ozet": "Kisa, 1-2 cumlelik Turkce ozet. Eger uyumlu ise olumlu bir mesaj yaz.",
  "consignee": "Consignee firma adi ve adresi (varsa)",
  "notify": ["Birinci notify unvan ve adresi", "Ikinci notify unvan ve adresi (varsa)"],
  "bl_no": "Dosyadaki konsimento/BL numarasi (varsa, yoksa bos string)"
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
    const kota = await kotaKontrolVeLogla(token, "konsimento-kontrol");
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
    // Belge tipi: "talimat" (varsayilan) veya "draft_bl"
    const belgeTipi = (formData.get("belge_tipi") as string | null) || "talimat";
    const arrayBuffer = await file.arrayBuffer();
    const base64 = pdfToBase64(new Uint8Array(arrayBuffer));

    const prompt = buildPrompt(sistemVerisi, belgeTipi);
    const sonuc = await callGeminiWithPdf(base64, file.type || "application/pdf", prompt, isKontrolSonucu);

    return successResponse(sonuc);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});
