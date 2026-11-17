/**
 * Proforma Yukle: sistem proformasini tarayicida, yapay zekasiz okur (06.11.2026; hesap: okuma.ts).
 * PDF bilgisi + metni unpdf ile (fatura okumasiyla ayni kutuphane), kayitli taslak `proformalar`
 * tablosundan (RLS: yalniz kendi sirketi). Hata olursa sessizce "sistem_disi" doner: cagiran
 * mevcut yapay zeka okumasina gecer, akis hicbir durumda bu adim yuzunden durmaz.
 */
import { supabase } from "@/lib/supabase";
import { taslakNormalle } from "@/lib/proforma/belge";
import { sistemProformaNo, sistemProformasiCoz, sistemUretimiMi, type SistemOkumaSonucu } from "@/lib/proforma/okuma";

async function pdfBilgisi(dosya: File): Promise<{ baslik: string | null; olusturan: string | null; metin: string } | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await dosya.arrayBuffer()));
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info || {}) as { Title?: unknown; Creator?: unknown };
    const { text } = await extractText(pdf, { mergePages: true });
    return {
      baslik: typeof info.Title === "string" ? info.Title : null,
      olusturan: typeof info.Creator === "string" ? info.Creator : null,
      metin: Array.isArray(text) ? text.join("\n") : text,
    };
  } catch {
    return null;
  }
}

export async function sistemProformasiOku(dosya: File, companyId: string | null): Promise<SistemOkumaSonucu> {
  if (!companyId) return { tur: "sistem_disi" };
  const pdf = await pdfBilgisi(dosya);
  if (!pdf) return { tur: "sistem_disi" };
  const no = sistemProformaNo(pdf.baslik, pdf.metin);
  if (!no || !sistemUretimiMi(pdf.olusturan)) return { tur: "sistem_disi" };
  try {
    const { data, error } = await supabase.from("proformalar").select("taslak")
      .eq("company_id", companyId).eq("proforma_no", no).maybeSingle();
    if (error) return { tur: "sistem_disi" };
    const taslak = data ? taslakNormalle((data as { taslak: unknown }).taslak) : null;
    return sistemProformasiCoz(pdf, () => taslak);
  } catch {
    return { tur: "sistem_disi" };
  }
}

/**
 * "Onay geldi" -> dosya ac (17.11.2026): Proforma Yukle ?proforma=<id>. Kayitli proformanin PDF'i, Proforma Olustur'un
 * indirdigi PDF'in AYNISI uretilir: sirketin sablonu (proforma_ayarlari; yoksa varsayilan) + IMZALI (app/proformalar
 * ile ayni kural). PDF bilgisi Title "Proforma <NO>", Creator "Ihracat AI" -> sayfa bu dosyayi yuklenmis gibi isler,
 * sistemProformasiOku yapay zekasiz okur, dosya acma akisi DEGISMEZ.
 * Kayit yok / taslak bozuk / yetki yok -> null (cagiran kullaniciya soyler). PDF kutuphanesi (fontlar) gerektiginde yuklenir.
 */
export async function kayitliProformaPdf(proformaId: string, companyId: string | null): Promise<{ dosya: File; proformaNo: string } | null> {
  if (!companyId || !/^[0-9a-f-]{36}$/i.test(proformaId)) return null;
  const [kayit, ayarlar] = await Promise.all([
    supabase.from("proformalar").select("proforma_no, taslak").eq("company_id", companyId).eq("id", proformaId).maybeSingle(),
    supabase.from("proforma_ayarlari").select("ozel_sartlar, alt_bilgi, ust_bilgi_tarih, ust_bilgi_revizyon").eq("company_id", companyId).maybeSingle(),
  ]);
  if (kayit.error || !kayit.data) return null;
  const taslak = taslakNormalle((kayit.data as { taslak: unknown }).taslak);
  if (!taslak) return null;
  const ayar = (ayarlar.data || null) as { ozel_sartlar?: string[] | null; alt_bilgi?: string[] | null; ust_bilgi_tarih?: string | null; ust_bilgi_revizyon?: string | null } | null;
  const [{ belgeOlustur }, { proformaPdf, proformaDosyaAdi }, sabit] = await Promise.all([
    import("@/lib/proforma/belge"), import("@/lib/proforma/pdf"), import("@/lib/proforma/sabitler"),
  ]);
  const sablon = {
    ozelSartlar: ayar?.ozel_sartlar?.length ? ayar.ozel_sartlar : sabit.VARSAYILAN_OZEL_SARTLAR,
    altBilgi: ayar?.alt_bilgi?.length ? ayar.alt_bilgi : sabit.VARSAYILAN_ALT_BILGI,
    ustBilgi: { tarih: ayar?.ust_bilgi_tarih || sabit.VARSAYILAN_UST_BILGI.tarih, revizyon: ayar?.ust_bilgi_revizyon || sabit.VARSAYILAN_UST_BILGI.revizyon },
  };
  const belge = belgeOlustur(taslak, sablon, true); // IMZALI: Proforma Olustur'un indirdigi ile ayni
  const blob = proformaPdf(belge).output("blob");
  return { dosya: new File([blob], proformaDosyaAdi(belge), { type: "application/pdf" }), proformaNo: (kayit.data as { proforma_no: string }).proforma_no };
}
