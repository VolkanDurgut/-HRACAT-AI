/**
 * Beyanname kontrolunun SISTEM tarafi (06.11.2026): dosyanin fatura(lar)i, tutar, teslim, liman, alici,
 * rezervasyon gemi(ler)i, konteyner no'lari + net toplam, DIIB(ler). Bolunmus yuklemede (DIIB
 * bolunmesi) her parcanin faturasi ve DIIB'i beklenir. Yalniz OKUR (RLS: kendi sirketi).
 */
import { supabase } from "@/lib/supabase";
import { diibAnahtari } from "@/lib/diib/hesap";
import type { BeyannameBeklenen } from "@/lib/beyanname-kontrol";

export async function beyannameBeklenenGetir(dosyaId: string, companyId: string): Promise<BeyannameBeklenen | null> {
  const [d, k, r, b] = await Promise.all([
    supabase.from("ihracat_dosyalari").select("fatura_no, fatura_tarihi, toplam_tutar, para_birimi, teslim_sekli, varis_limani, yuklenme_limani, alici_firma, diib_no")
      .eq("id", dosyaId).eq("company_id", companyId).maybeSingle(),
    supabase.from("konteynerler").select("konteyner_no, net_agirlik_kg").eq("dosya_id", dosyaId).eq("company_id", companyId),
    supabase.from("rezervasyonlar").select("gemi_adi, yuklenme_limani").eq("dosya_id", dosyaId).eq("company_id", companyId),
    supabase.from("diib_dosya_bolunmeleri").select("sira, diib_id, fatura_no").eq("dosya_id", dosyaId).eq("company_id", companyId),
  ]);
  if (d.error || !d.data) return null;
  const dosya = d.data as { fatura_no: string | null; fatura_tarihi: string | null; toplam_tutar: number | string | null; para_birimi: string | null; teslim_sekli: string | null; varis_limani: string | null; yuklenme_limani: string | null; alici_firma: string | null; diib_no: string | null };
  const konteynerler = ((k.data as { konteyner_no: string | null; net_agirlik_kg: number | string | null }[] | null) || []);
  const parcalar = ((b.data as { sira: number; diib_id: string; fatura_no: string | null }[] | null) || []).sort((x, y) => x.sira - y.sira);

  let diibler: BeyannameBeklenen["diibler"] = [];
  if (parcalar.length) {
    const ids = Array.from(new Set(parcalar.map((p) => p.diib_id)));
    const { data: belgeler } = await supabase.from("diib_belgeleri").select("id, belge_no, anahtar").eq("company_id", companyId).in("id", ids);
    diibler = parcalar.map((p) => (belgeler as { id: string; belge_no: string; anahtar: string }[] | null)?.find((x) => x.id === p.diib_id))
      .filter((x): x is { id: string; belge_no: string; anahtar: string } => !!x)
      .map((x) => ({ anahtar: x.anahtar, belgeNo: x.belge_no }));
  } else if (dosya.diib_no) {
    const a = diibAnahtari(dosya.diib_no);
    if (a) diibler = [{ anahtar: a, belgeNo: dosya.diib_no.replace(/^.*?(20\d{2}\s*[/\- ]?\s*D)/i, "$1").trim() }];
  }

  const netler = konteynerler.map((x) => Number(x.net_agirlik_kg));
  const faturalar = [dosya.fatura_no, ...parcalar.map((p) => p.fatura_no)].map((f) => (f || "").replace(/\s+/g, "").toUpperCase()).filter(Boolean);
  const tutar = Number(dosya.toplam_tutar);
  const rezler = ((r.data as { gemi_adi: string | null; yuklenme_limani: string | null }[] | null) || []);
  // Yukleme yeri: rezervasyondaki (gercek booking) liman; rezervasyon yoksa dosyadaki (proforma) liman
  const rezYerleri = Array.from(new Set(rezler.map((x) => (x.yuklenme_limani || "").trim()).filter(Boolean)));
  const yuklemeYerleri = rezYerleri.length ? rezYerleri : dosya.yuklenme_limani?.trim() ? [dosya.yuklenme_limani.trim()] : [];
  return {
    faturaNolari: Array.from(new Set(faturalar)),
    faturaTarihi: dosya.fatura_tarihi ? String(dosya.fatura_tarihi).slice(0, 10) : null,
    toplamTutar: Number.isFinite(tutar) && tutar > 0 ? tutar : null,
    paraBirimi: dosya.para_birimi,
    teslimSekli: dosya.teslim_sekli,
    varisLimani: dosya.varis_limani,
    yuklemeYerleri,
    aliciFirma: dosya.alici_firma,
    gemiler: Array.from(new Set(rezler.map((x) => (x.gemi_adi || "").trim()).filter(Boolean))),
    konteynerler: konteynerler.map((x) => (x.konteyner_no || "").replace(/\s+/g, "").toUpperCase()).filter(Boolean),
    netKg: netler.length && netler.every((n) => Number.isFinite(n) && n > 0) ? Math.round(netler.reduce((a, n) => a + n, 0) * 100) / 100 : null,
    diibler,
  };
}
