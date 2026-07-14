// Ortak AI kota kontrol modülü
// Tüm AI Edge Function'ları (proforma-oku, fatura-kontrol, konsimento-kontrol, dba-oku)
// Gemini'yi çağırmadan ÖNCE bu kontrolü çalıştırır.
// Amaç: tenant (şirket) başına AI belge okuma kotasını backend seviyesinde zorlamak.
// Kontrol backend'de olduğu için kullanıcı frontend'i baypas edip limiti aşamaz.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type KotaSonuc =
  | { izin: true; companyId: string; userId: string }
  | { izin: false; mesaj: string };

/**
 * REST API'ye service_role ile istek atan yardımcı (RLS baypas eder).
 */
async function restGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`REST GET hatası (${path}): ${res.status}`);
  return res.json();
}

/**
 * AI çağrısı yapılmadan önce kotayı kontrol eder.
 * İzin varsa ai_usage_logs'a kayıt yazar ve { izin: true } döner.
 * Limit aşılmışsa { izin: false } döner — çağıran fonksiyon Gemini'yi ÇAĞIRMAMALI.
 *
 * @param token - kullanıcının JWT access_token'ı (Authorization header'dan)
 * @param fonksiyonAdi - log için: 'proforma-oku', 'fatura-kontrol' vb.
 */
export async function kotaKontrolVeLogla(token: string, fonksiyonAdi: string): Promise<KotaSonuc> {
  // 1) Token'dan kullanıcıyı doğrula (JWT -> user_id). Sahtelenemez.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return { izin: false, mesaj: "Yetkilendirme geçersiz. Lütfen tekrar giriş yapın." };
  }
  const user = await userRes.json();
  const userId = user?.id;
  if (!userId) {
    return { izin: false, mesaj: "Kullanıcı bulunamadı." };
  }

  // 2) Kullanıcının company_id'sini kullanici_rolleri'nden al
  const roller = await restGet(`kullanici_rolleri?user_id=eq.${userId}&select=company_id&limit=1`);
  const companyId = roller?.[0]?.company_id;
  if (!companyId) {
    return { izin: false, mesaj: "Şirket bilgisi bulunamadı. Lütfen yöneticinizle iletişime geçin." };
  }

  // 3) Şirketin limitini ve dönem başlangıcını al
  const sirket = await restGet(`companies?id=eq.${companyId}&select=ai_document_limit,ai_usage_period_start&limit=1`);
  const limit = sirket?.[0]?.ai_document_limit ?? 0;
  const periodStart = sirket?.[0]?.ai_usage_period_start;
  if (!periodStart) {
    return { izin: false, mesaj: "Kota bilgisi okunamadı." };
  }

  // 4) Bu dönemde kaç AI çağrısı yapılmış say (created_at >= period_start)
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_usage_logs?company_id=eq.${companyId}&created_at=gte.${encodeURIComponent(periodStart)}&select=id`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );
  // content-range header: "0-0/42" -> toplam 42
  const contentRange = countRes.headers.get("content-range") || "*/0";
  const kullanim = parseInt(contentRange.split("/")[1] || "0", 10);

  // 5) Limit kontrolü
  if (kullanim >= limit) {
    return {
      izin: false,
      mesaj: `Aylık belge okuma limitinize (${limit}) ulaştınız. Paketinizi yükseltmek için yöneticinizle iletişime geçin.`,
    };
  }

  // 6) İzin var -> log yaz (service_role ile, RLS baypas)
  await fetch(`${SUPABASE_URL}/rest/v1/ai_usage_logs`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      company_id: companyId,
      user_id: userId,
      fonksiyon: fonksiyonAdi,
    }),
  });

  return { izin: true, companyId, userId };
}