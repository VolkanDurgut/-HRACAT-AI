/**
 * NAVLUN TABLOSU - Excel indir (11.11.2026; sayfadaki test maili 19.11.2026 kaldirildi). Hesap ve Excel duzeni TEK YERDE:
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
