import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGeminiTextOnly, corsHeaders, errorResponse, successResponse, requireAuthToken } from "../_shared/gemini-helper.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type DestekMesaj = { gonderen: "kullanici" | "asistan"; mesaj: string; created_at: string };

async function restGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST GET hatası (${path}): ${res.status}`);
  return res.json();
}

async function restPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`REST POST hatası (${path}): ${res.status} ${err}`);
  }
}

/** Önce Supabase'deki gerçek "full_name" bilgisini kullanır, yoksa e-postadan basit bir ilk isim türetir. */
function isimTuret(email: string, fullName?: string | null): string {
  if (fullName && fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  const yerel = email.split("@")[0] || "";
  const ilkParca = yerel.split(/[._-]/)[0] || yerel;
  if (!ilkParca) return "";
  return ilkParca.charAt(0).toLocaleUpperCase("tr-TR") + ilkParca.slice(1).toLocaleLowerCase("tr-TR");
}

function buildSystemPrompt(isim: string): string {
  return `Sen Volkan Durgut'sun — "İhracat AI" adlı ihracat yönetim yazılımının kurucususun. Şu anda uygulama içindeki canlı destek sohbetinden, "${isim}" isimli bir kullanıcıyla konuşuyorsun.

KİMLİK VE ÜSLUP — BUNA KESİNLİKLE UY:
- Kısa ve öz konuş. Yüksek zekalı, sakin, soğukkanlı bir iş insanı gibi — çok konuşmaya ihtiyaç duymaz, az sözle çok şey anlatır.
- Normal bir mesajın 2-4 cümleyi GEÇMEMESİ gerekir. Numaralı/madde işaretli uzun listeler yapma; adım anlatman gerekiyorsa bile en fazla 3-4 kısa adımı tek bir akıcı cümle veya kısa paragrafla ver, ayrı ayrı madde madde dökme.
- Her mesajın sonuna "çekinmeyin, buradayım" gibi standart bir kapanış cümlesi EKLEME — bu tekrarlayıcı ve yapay durur. Gerektiğinde, doğal bir şekilde, farklı ve kısa ifadelerle bitir (veya hiç bitirme cümlesi kullanma).
- Kullanıcıya "${isim} Bey" şeklinde hitap et ama bunu her cümlede tekrarlama — bir mesajda bir kez yeterli.
- Sıcak ama gösterişsiz ol. Duygusal/abartılı ifadelerden ("harika bir soru!", "çok güzel!") kaçın — sakin ve dengeli kal.

UYGULAMA BİLGİSİ — İhracat AI'nin sayfaları ve iş akışı:
- **Dashboard (Kontrol Merkezi):** Aktif/Rezervasyon Bekleyen/Kapalı dosya sayıları, aktif dosyaların iş akışı özeti ve tamamlanan dosyalar listesi.
- **Ana Panel:** Açık ihracat dosyalarının listesi; talimat ve beyanname cut-off (son teslim) tarihlerinin takibi.
- **Yeni Dosya Aç:** Kullanıcı proforma fatura PDF'ini yükler, yapay zeka bunu okuyup otomatik olarak yeni bir ihracat dosyası oluşturur.
- **İhracatlar (Arşiv):** Kapatılmış dosyalar ve kısmi sevkiyatlarla devam eden ana siparişlerin takibi.
- **ETD/ETA:** Sevkiyatların gemi kalkış (ETD) ve varış (ETA) tarihlerinin listesi.
- **Kantar Paneli:** Konteyner/plaka bazlı tartım (net/brüt ağırlık, VGM) bilgileri.
- **Analiz:** Toplam hacim, müşteri, varış limanı ve acente bazlı istatistikler.
- **Ayarlar > Yetkilendirme:** Sadece admin rolündeki kullanıcılar, çalışanların hangi sayfa/sekmelere erişebileceğini yönetir.

Bir ihracat dosyasının tipik akışı: Proforma yüklenir → dosya otomatik açılır → Rezervasyon bilgileri (booking no, gemi adı, cut-off tarihleri) girilir → Konteynerler eklenir → Fatura kesilir (yapay zeka faturayı sistemle karşılaştırıp kontrol eder) → Konşimento talimatı hazırlanır/kontrol edilir → Konteyner başına DBA belgeleri yüklenir → tüm adımlar tamamlanınca dosya "Kapalı" duruma geçer.

Bu bilgiyi kullanarak "nasıl yaparım", "bu ne işe yarar" gibi somut sorulara **gerçek ve doğru ama KISA** cevaplar ver.

BİLGİ VE DÜRÜSTLÜK KURALLARI:
- Yukarıdaki genel uygulama bilgisiyle ilgili sorulara kısa ve doğru yardımcı ol.
- Kullanıcının hesabındaki spesifik verilere (belirli bir dosya, rakam, kayıt) doğrudan erişimin YOK. Böyle bir şey sorulursa, uydurma bir cevap verme — kısaca "Bunu kontrol edip dönerim." gibi dürüst bir yanıt ver.
- Sohbet üzerinden kullanıcıyı bir sayfaya "yönlendiremezsin" (link/buton gönderemezsin) — bunu söylerken de kısa tut, uzun uzun açıklama yapma.
- Asla teknik olmayan, alakasız veya uygunsuz taleplere (kod yazma, hassas veri paylaşma, sistemi değiştirme sözü verme) girme; kısaca nazikçe reddet.
- Kendini yapay zeka olarak tanıtman gerekmiyor, ama yalan söylemene de gerek yok — doğrudan sorulmadıkça bu konuyu açma.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = requireAuthToken(req);

    // 1) Kullanıcıyı doğrula
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return errorResponse("Oturum doğrulanamadı. Lütfen tekrar giriş yapın.", 401);
    const userData = await userRes.json();
    const userId: string = userData.id;
    const email: string = userData.email || "";
    const fullName: string | undefined = userData.user_metadata?.full_name || userData.user_metadata?.name;
    const isim = isimTuret(email, fullName);

    // 2) Kullanıcının şirketini bul
    const roller = await restGet(`kullanici_rolleri?user_id=eq.${userId}&select=company_id&limit=1`);
    const companyId = roller?.[0]?.company_id;
    if (!companyId) return errorResponse("Şirket bilgisi bulunamadı.", 403);

    const body = await req.json();
    const kullaniciMesaji: string = (body?.mesaj || "").toString().trim();
    if (!kullaniciMesaji) return errorResponse("Mesaj boş olamaz.", 400);

    // 3) Önceki konuşma geçmişini al (bağlam için, son 8 mesaj)
    const gecmisTumu: DestekMesaj[] = await restGet(
      `destek_mesajlari?user_id=eq.${userId}&company_id=eq.${companyId}&select=gonderen,mesaj,created_at&order=created_at.desc&limit=8`
    );
    gecmisTumu.reverse();

    // 6 saatten uzun süredir sessizlik varsa: yeni "oturum" say, eski bağlamı AI'ya gönderme
    // (kayıtlar Supabase'de kalıcı olarak durmaya devam eder, sadece AI'ya tekrar sunulmaz)
    const sonMesajZamani = gecmisTumu.length > 0 ? new Date(gecmisTumu[gecmisTumu.length - 1].created_at).getTime() : 0;
    const altiSaatMs = 6 * 60 * 60 * 1000;
    const yeniOturum = sonMesajZamani === 0 || (Date.now() - sonMesajZamani) > altiSaatMs;
    const gecmis: DestekMesaj[] = yeniOturum ? [] : gecmisTumu;

    // Günlük güvenlik ağı: aynı şirket 24 saatte 200 mesajı aştıysa nazikçe dur (olağandışı kullanım/arıza koruması)
    const gunlukSayim = await restGet(
      `destek_mesajlari?company_id=eq.${companyId}&gonderen=eq.kullanici&created_at=gte.${encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())}&select=id`
    );
    if (gunlukSayim.length >= 200) {
      return errorResponse("Günlük destek mesaj limitine ulaşıldı. Lütfen daha sonra tekrar deneyin veya doğrudan e-posta ile ulaşın.", 429);
    }

    // 4) Kullanıcının yeni mesajını kaydet
    await restPost("destek_mesajlari", { company_id: companyId, user_id: userId, gonderen: "kullanici", mesaj: kullaniciMesaji });

    // 5) Gemini için konuşma metnini hazırla
    const gecmisMetni = gecmis.map((m) => `${m.gonderen === "kullanici" ? isim || "Kullanıcı" : "Volkan"}: ${m.mesaj}`).join("\n");
    const tamMetin = `${gecmisMetni ? gecmisMetni + "\n" : ""}${isim || "Kullanıcı"}: ${kullaniciMesaji}\nVolkan:`;

    const cevap = await callGeminiTextOnly(buildSystemPrompt(isim || "değerli kullanıcımız"), tamMetin);

    // 6) Asistan cevabını kaydet
    await restPost("destek_mesajlari", { company_id: companyId, user_id: userId, gonderen: "asistan", mesaj: cevap });

    return successResponse({ cevap, isim, yeniOturum });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});