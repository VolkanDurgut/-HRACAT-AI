/**
 * NAVLUN TABLOSU - Excel indir + test maili (11.11.2026). Hesap ve Excel duzeni TEK YERDE:
 * supabase/functions/_shared/navlun-tablosu.ts (edge navlun-tablosu ayni dosyayi mail eki olarak uretir).
 */
import { supabase } from "@/lib/supabase";
import { yuklemePlaniOku } from "@/lib/siparis/veri";
import { navlunTablosuHesapla, navlunTablosuSayfasi, type NavlunOlayi, type NavlunTablosu } from "@/supabase/functions/_shared/navlun-tablosu";

const SAYFA = 1000;

/** Tum teklif gecmisi (sayfadaki 120 gun siniri YOK) + yukleme planindaki gerceklesen navlun. */
export async function navlunTablosuOku(bugun: string): Promise<{ tablo: NavlunTablosu; planOkunamadi: boolean }> {
  const olaylar: NavlunOlayi[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("navlun_teklifleri")
      .select("tur,liman,liman_anahtar,acente,armator,tutar,para_birimi,ekipman,free_time_gun,transit_gun,tarih")
      .order("tarih", { ascending: true })
      .order("id", { ascending: true })
      .range(i * SAYFA, i * SAYFA + SAYFA - 1);
    if (error) throw new Error(error.message);
    olaylar.push(...((data || []) as NavlunOlayi[]).map((s) => ({ ...s, tutar: s.tutar == null ? null : Number(s.tutar) })));
    if (!data || data.length < SAYFA) break;
  }
  // Gerceklesen navlun yukleme planindan; plan yetkisi olmayan kullanicida tablo yalniz tekliflerle cikar
  let plan: Awaited<ReturnType<typeof yuklemePlaniOku>> = [];
  let planOkunamadi = false;
  try { plan = (await yuklemePlaniOku()).filter((p) => p.kaynak !== "siparis"); } catch { planOkunamadi = true; }
  return { tablo: navlunTablosuHesapla(olaylar, plan, bugun), planOkunamadi };
}

export async function navlunTablosuExcel(bugun: string): Promise<{ blob: Blob; planOkunamadi: boolean }> {
  const [{ xlsxOlustur }, { tablo, planOkunamadi }] = await Promise.all([import("@/lib/xlsx-yaz"), navlunTablosuOku(bugun)]);
  return { blob: await xlsxOlustur([navlunTablosuSayfasi(tablo)]), planOkunamadi };
}

/** Edge navlun-tablosu {"test": true}: "[TEST]" mail YALNIZ test adresine (yonetici yetkisi). */
export async function navlunTablosuTestMaili(): Promise<string> {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const res = await fetch(`${url}/functions/v1/navlun-tablosu`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ test: true }),
  });
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string; sonuclar?: { gonderildi?: boolean; atlandi?: string }[] };
  if (!res.ok || !veri.ok) {
    if (res.status === 401 || res.status === 403) throw new Error(veri.hata && res.status === 403 ? "Test maili yalnızca yöneticiler tarafından gönderilebilir." : "Yetki doğrulanamadı.");
    throw new Error(veri.hata || "Test maili gönderilemedi.");
  }
  const s = veri.sonuclar?.[0];
  if (s?.atlandi) throw new Error(s.atlandi);
  return "Test maili gönderildi (test adresine, Excel ekli).";
}
