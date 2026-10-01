import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const YEDEK_ALICI = Deno.env.get("GERI_BILDIRIM_ALICI") || "volkandurgut.tr@gmail.com";

// Yedeklenecek tablolar - depositors ve contact_messages bu projeye ait olmadigi icin haric tutuldu
const YEDEKLENECEK_TABLOLAR = [
  "ihracat_dosyalari",
  "rezervasyonlar",
  "konteynerler",
  "sevkiyatlar",
  "acenteler",
  "plakalar",
  "ana_siparisler",
  "acente_teklifleri",
  "dosya_evraklari",
  "fumigation_ayarlari",
  "kullanici_rolleri",
  "kullanici_yetkileri",
  "companies",
  "destek_mesajlari",
  "geri_bildirimler",
  "banka_presetleri",
];

async function tabloVerisiCek(tablo: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablo}?select=*`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    console.error(`Tablo cekilemedi (${tablo}): ${res.status}`);
    return [];
  }
  return res.json();
}

Deno.serve(async (_req: Request) => {
  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY ortam değişkeni ayarlanmamış.");
    }

    const yedek: Record<string, unknown[]> = {};
    for (const tablo of YEDEKLENECEK_TABLOLAR) {
      yedek[tablo] = await tabloVerisiCek(tablo);
    }

    const tarih = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
    const jsonIcerik = JSON.stringify(yedek, null, 2);
    const base64Icerik = btoa(unescape(encodeURIComponent(jsonIcerik)));

    const toplamKayit = Object.values(yedek).reduce((acc, arr) => acc + arr.length, 0);

    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "İhracat AI <bildirim@ihracatasistanim.com>",
        to: [YEDEK_ALICI],
        subject: `İhracat AI - Günlük Veri Yedeği (${tarih})`,
        html: `<p>İhracat AI veritabanınızın ${tarih} tarihli otomatik yedeği ektedir.</p><p>Toplam ${toplamKayit} kayıt, ${YEDEKLENECEK_TABLOLAR.length} tablo.</p><p>Bu dosyayı güvenli bir yerde (örn. bilgisayarınızda veya bulut depolamada) saklamanızı öneririz.</p>`,
        attachments: [
          {
            filename: `ihracat-ai-yedek-${tarih.replace(/\./g, "-")}.json`,
            content: base64Icerik,
          },
        ],
      }),
    });

    if (!mailRes.ok) {
      const err = await mailRes.text();
      throw new Error(`Yedek maili gönderilemedi (${mailRes.status}): ${err}`);
    }

    return new Response(JSON.stringify({ basarili: true, toplamKayit, tabloSayisi: YEDEKLENECEK_TABLOLAR.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("Yedekleme hatasi:", message);
    return new Response(JSON.stringify({ basarili: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});