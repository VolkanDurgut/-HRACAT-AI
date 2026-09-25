import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, errorResponse, successResponse, requireAuthToken } from "../_shared/gemini-helper.ts";

/** Canli sitede zaten yayinda olan logo - e-postaya gomulu base64 yerine
 * dogrudan URL olarak kullaniliyor (Edge Function boyutunu sismemesi icin). */
const UNEX_LOGO_URL = "https://ihracatasistanim.com/images/logo.png";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GERI_BILDIRIM_ALICI = Deno.env.get("GERI_BILDIRIM_ALICI") || "volkandurgut.tr@gmail.com";

type GeriBildirimTuru = "sorun" | "oneri" | "sikayet";

const TUR_ETIKETI: Record<GeriBildirimTuru, string> = {
  sorun: "Sorun Bildirimi",
  oneri: "Öneri",
  sikayet: "Şikayet",
};

async function restGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST GET hatası (${path}): ${res.status}`);
  return res.json();
}

async function restPost(path: string, body: unknown, dondurKayit = false): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: dondurKayit ? "return=representation" : "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`REST POST hatası (${path}): ${res.status} ${err}`);
  }
  if (dondurKayit) return res.json();
}

async function restPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
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
    console.error(`REST PATCH hatası (${path}): ${res.status} ${err}`);
  }
}

/** Ek dosya icin 7 gunluk imzali (private bucket) URL uretir. */
async function ekDosyaImzaliUrlUret(ekDosyaYolu: string): Promise<string | null> {
  const YEDI_GUN_SANIYE = 7 * 24 * 60 * 60;
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/geri-bildirim-ekleri/${ekDosyaYolu}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: YEDI_GUN_SANIYE }),
    }
  );
  if (!res.ok) {
    console.error("İmzalı URL üretilemedi:", await res.text());
    return null;
  }
  const data = await res.json();
  if (!data?.signedURL) return null;
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Tema, uygulamadaki lib/theme.ts ile BIREBIR AYNI renkleri kullanir. */
const TEMA = {
  sayfaZemin: "#0B0F14",
  kartZemin: "#12161F",
  kartKenar: "#1E2530",
  satirBasligi: "#0F131A",
  mutedMetin: "#8B95A5",
  vurgu: "#10B981",
};

function buildEmailHtml(params: {
  tur: GeriBildirimTuru;
  mesaj: string;
  gonderenAdi: string;
  gonderenEmail: string;
  sirketAdi: string;
  ekUrl: string | null;
  ekAdi: string | null;
  tarih: string;
}): string {
  const { tur, mesaj, gonderenAdi, gonderenEmail, sirketAdi, ekUrl, ekAdi, tarih } = params;
  const etiket = TUR_ETIKETI[tur];
  const rozetRenk = tur === "sikayet" ? "#F87171" : tur === "sorun" ? "#FBBF24" : TEMA.vurgu;
  const gonderenBasHarf = escapeHtml((gonderenAdi || "?").trim().charAt(0).toUpperCase() || "?");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>İhracat AI · ${escapeHtml(etiket)}</title>
</head>
<body style="margin:0;padding:32px 16px;background:${TEMA.sayfaZemin};font-family:-apple-system,'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:separate;">
    <tr>
      <td style="background:${TEMA.kartZemin};border:1px solid ${TEMA.kartKenar};border-radius:14px 14px 0 0;padding:22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;" width="40">
              <img src="${UNEX_LOGO_URL}" width="36" height="36" alt="UNEX" style="display:block;border-radius:8px;">
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.2;">İhracat AI</div>
              <div style="font-size:11px;color:${TEMA.mutedMetin};letter-spacing:0.03em;">EXPORT MANAGEMENT</div>
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <span style="display:inline-block;background:${rozetRenk}22;border:1px solid ${rozetRenk};color:${rozetRenk};font-size:11px;font-weight:600;padding:5px 12px;border-radius:999px;white-space:nowrap;">${escapeHtml(etiket.toUpperCase())}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#FFFFFF;border:1px solid ${TEMA.kartKenar};border-top:none;border-radius:0 0 14px 14px;padding:28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td width="42" style="vertical-align:top;">
              <div style="width:36px;height:36px;border-radius:50%;background:${TEMA.vurgu}1A;color:${TEMA.vurgu};font-weight:700;font-size:15px;text-align:center;line-height:36px;">${gonderenBasHarf}</div>
            </td>
            <td style="vertical-align:top;padding-left:12px;">
              <div style="font-size:14px;font-weight:700;color:#111827;">${escapeHtml(gonderenAdi)}</div>
              <div style="font-size:12.5px;color:#6B7280;margin-top:1px;">${escapeHtml(gonderenEmail)}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:2px;">${escapeHtml(sirketAdi)} · ${escapeHtml(tarih)}</div>
            </td>
          </tr>
        </table>
        <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-left:3px solid ${TEMA.vurgu};border-radius:10px;padding:16px 18px;white-space:pre-line;font-size:14px;line-height:1.65;color:#1F2937;">${escapeHtml(mesaj)}</div>
        ${ekUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr><td style="background:${TEMA.vurgu};border-radius:8px;"><a href="${ekUrl}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#FFFFFF;text-decoration:none;">📎 Ek dosyayı görüntüle${ekAdi ? ` — ${escapeHtml(ekAdi)}` : ""}</a></td></tr></table><div style="font-size:11px;color:#9CA3AF;margin-top:6px;">Bu bağlantı 7 gün geçerlidir.</div>` : ""}
      </td>
    </tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0 auto;text-align:center;font-size:11.5px;color:${TEMA.mutedMetin};">
    İhracat AI · Export Management — bu bildirim panelinizdeki "Sorun Bildir" formu üzerinden otomatik olarak gönderilmiştir.
  </p>
</body>
</html>`;
}

async function mailGonder(params: {
  tur: GeriBildirimTuru;
  mesaj: string;
  gonderenAdi: string;
  gonderenEmail: string;
  sirketAdi: string;
  ekUrl: string | null;
  ekAdi: string | null;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY ortam değişkeni ayarlanmamış. Lütfen API anahtarını yapılandırın.");
  }
  const tarih = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const html = buildEmailHtml({ ...params, tarih });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "İhracat AI <bildirim@ihracatasistanim.com>",
      to: [GERI_BILDIRIM_ALICI],
      reply_to: params.gonderenEmail || undefined,
      subject: `[${TUR_ETIKETI[params.tur]}] ${params.gonderenAdi} - İhracat AI`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mail gönderilemedi (${res.status}): ${err}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = requireAuthToken(req);

    // 1) Kullaniciyi dogrula
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return errorResponse("Oturum doğrulanamadı. Lütfen tekrar giriş yapın.", 401);
    const userData = await userRes.json();
    const userId: string = userData.id;
    const email: string = userData.email || "";
    const fullName: string | undefined = userData.user_metadata?.full_name || userData.user_metadata?.name;

    // 2) Kullanicinin sirketini bul
    const roller = await restGet(`kullanici_rolleri?user_id=eq.${userId}&select=company_id&limit=1`);
    const companyId = roller?.[0]?.company_id;
    if (!companyId) return errorResponse("Şirket bilgisi bulunamadı.", 403);

    const sirketBilgisi = await restGet(`companies?id=eq.${companyId}&select=company_name&limit=1`);
    const sirketAdi = sirketBilgisi?.[0]?.company_name || "-";

    const body = await req.json();
    const tur: GeriBildirimTuru = body?.tur;
    const mesaj: string = (body?.mesaj || "").toString().trim();
    const ekDosyaYolu: string | null = body?.ek_dosya_yolu || null;
    const ekDosyaAdi: string | null = body?.ek_dosya_adi || null;

    if (!tur || !["sorun", "oneri", "sikayet"].includes(tur)) {
      return errorResponse("Geçersiz bildirim türü.", 400);
    }
    if (!mesaj) return errorResponse("Mesaj boş olamaz.", 400);
    if (mesaj.length > 5000) return errorResponse("Mesaj çok uzun (maksimum 5000 karakter).", 400);

    // Gunluk guvenlik agi: ayni sirket 24 saatte 50 bildirimi astiysa dur
    const gunlukSayim = await restGet(
      `geri_bildirimler?company_id=eq.${companyId}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())}&select=id`
    );
    if (gunlukSayim.length >= 50) {
      return errorResponse("Günlük bildirim limitine ulaşıldı. Lütfen daha sonra tekrar deneyin.", 429);
    }

    const gonderenAdi = fullName?.trim() || email.split("@")[0] || "Kullanıcı";

    // 3) Kaydi olustur
    const kayit = await restPost(
      "geri_bildirimler",
      {
        company_id: companyId,
        user_id: userId,
        tur,
        mesaj,
        gonderen_adi: gonderenAdi,
        gonderen_email: email,
        ek_dosya_yolu: ekDosyaYolu,
        ek_dosya_adi: ekDosyaAdi,
      },
      true
    );
    const kayitId = kayit?.[0]?.id;

    // 4) Ek dosya varsa imzali URL uret
    let ekUrl: string | null = null;
    if (ekDosyaYolu) {
      ekUrl = await ekDosyaImzaliUrlUret(ekDosyaYolu);
    }

    // 5) Maili gonder
    try {
      await mailGonder({ tur, mesaj, gonderenAdi, gonderenEmail: email, sirketAdi, ekUrl, ekAdi: ekDosyaAdi });
      if (kayitId) await restPatch(`geri_bildirimler?id=eq.${kayitId}`, { mail_gonderildi: true });
    } catch (mailHatasi) {
      // Kayit veritabaninda guvende - mail basarisiz olsa bile kullaniciya
      // "mesajiniz ulasti" diyebiliriz, ama sunucu tarafinda logluyoruz.
      console.error("Mail gönderim hatası:", mailHatasi);
    }

    return successResponse({ basarili: true, gonderenAdi });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return errorResponse(message);
  }
});
