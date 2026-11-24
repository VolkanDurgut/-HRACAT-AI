/**
 * lib/draft-evrak-seti.ts (24.11.2026)
 *
 * "Draft Seti Mail Gönder": Taslak Onay Paketi'ndeki belgelerin AYNISI, AYNI adlarla - ama VEKTOR PDF
 * (lib/html-vektor-pdf.ts; "cam gibi"). Paket (lib/taslak-onay-paketi.ts, ZIP) ve sevkiyat evraklari DEGISMEDI.
 * Sira/ad kurali paketle birebir: "DRAFT- <sira>- <KOD>- <booking>- <proforma>.pdf"
 *   1 INVOICE, 2 PACKING (DRAFT filigranli), 3 BL (yuklenen dosyanin kendisi), 4 COO, 5 PHYTO, 6 HEALTH,
 *   7 QUALITY, 8 FUMIGATION (musteri istiyorsa ve bilgisi tamsa; filigranli).
 */
import type { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildCertificateOfOriginHtml } from "@/lib/certificate-of-origin-builder";
import { buildPhytosanitaryCertificateHtml } from "@/lib/phytosanitary-certificate-builder";
import { buildHealthCertificateHtml } from "@/lib/health-certificate-builder";
import { buildKaliteSertifikasiHtml } from "@/lib/kalite-sertifikasi-builder";
import { buildFumigationHtml } from "@/lib/fumigation-builder";
import { checkKaliteSertifikasiReadiness, checkFumigationReadiness } from "@/lib/document-readiness";
import { MusteriEvrakAyarlari, BOS_MUSTERI_EVRAK_AYARLARI, dosyaEvrakIstiyorMu } from "@/lib/musteri-evrak-ayarlari";
import { draftFiligranEkle } from "@/lib/watermark";
import { draftEkAdi, baytBase64 } from "@/lib/draft-evrak-adi";
export { draftEkAdi, baytBase64 };

export type DraftSetiPlani = {
  belgeler: { sira: number; kod: string; ad: string; html?: string; blUrl?: string }[];
  eklenmeyenler: string[];
};

/** Hangi belgelerin hangi adla eklenecegi (saf; testli). Draft BL adresi yoksa hata firlatir. */
export function draftSetiPlani(
  dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], draftBlUrl: string | null,
  ayarlar: MusteriEvrakAyarlari = BOS_MUSTERI_EVRAK_AYARLARI,
): DraftSetiPlani {
  if (!draftBlUrl) throw new Error("Draft BL yüklenmemiş.");
  const a = [dosya, rezervasyonlar, konteynerler] as const;
  const ad = (sira: number, kod: string) => draftEkAdi(sira, kod, dosya, rezervasyonlar);
  const belgeler: DraftSetiPlani["belgeler"] = [
    { sira: 1, kod: "INVOICE", ad: ad(1, "INVOICE"), html: draftFiligranEkle(buildCommercialInvoiceHtml(...a)) },
    { sira: 2, kod: "PACKING", ad: ad(2, "PACKING"), html: draftFiligranEkle(buildPackingListHtml(...a)) },
    { sira: 3, kod: "BL", ad: ad(3, "BL"), blUrl: draftBlUrl },
    { sira: 4, kod: "COO", ad: ad(4, "COO"), html: buildCertificateOfOriginHtml(...a) },
    { sira: 5, kod: "PHYTO", ad: ad(5, "PHYTO"), html: buildPhytosanitaryCertificateHtml(...a) },
    { sira: 6, kod: "HEALTH", ad: ad(6, "HEALTH"), html: buildHealthCertificateHtml(...a) },
  ];
  const eklenmeyenler: string[] = [];
  if (dosyaEvrakIstiyorMu(dosya, "Quality")) {
    const h = checkKaliteSertifikasiReadiness(...a);
    if (h.hazir) belgeler.push({ sira: 7, kod: "QUALITY", ad: ad(7, "QUALITY"), html: draftFiligranEkle(buildKaliteSertifikasiHtml(...a, ayarlar.kaliteAyar)) });
    else eklenmeyenler.push(`Quality Certificate (eksik: ${h.eksikler.join(", ")})`);
  }
  if (dosyaEvrakIstiyorMu(dosya, "Fumigation")) {
    const h = checkFumigationReadiness(...a);
    if (h.hazir) belgeler.push({ sira: 8, kod: "FUMIGATION", ad: ad(8, "FUMIGATION"), html: draftFiligranEkle(buildFumigationHtml(...a, ayarlar.fumigationAyar)) });
    else eklenmeyenler.push(`Fumigation Certificate (eksik: ${h.eksikler.join(", ")})`);
  }
  return { belgeler, eklenmeyenler };
}

/** Tarayicida: plani PDF'lere cevirir (vektor). Ilerleme icin her belgede geri cagirim. */
export async function draftSetiUret(
  plan: DraftSetiPlani,
  ilerleme?: (sira: number, toplam: number, ad: string) => void,
): Promise<{ ad: string; icerik: string }[]> {
  const { htmlToVektorPdf } = await import("@/lib/html-vektor-pdf");
  const sonuc: { ad: string; icerik: string }[] = [];
  let i = 0;
  for (const b of plan.belgeler) {
    ilerleme?.(++i, plan.belgeler.length, b.ad);
    let bayt: Uint8Array;
    if (b.blUrl) {
      const res = await fetch(b.blUrl);
      if (!res.ok) throw new Error("Draft BL dosyası indirilemedi.");
      bayt = new Uint8Array(await res.arrayBuffer());
      if (!(bayt[0] === 0x25 && bayt[1] === 0x50 && bayt[2] === 0x44 && bayt[3] === 0x46)) throw new Error("Yüklenen Draft BL bir PDF değil.");
    } else {
      bayt = await htmlToVektorPdf(b.html!, { baslik: b.ad.replace(/\.pdf$/, "") });
    }
    sonuc.push({ ad: b.ad, icerik: baytBase64(bayt) });
  }
  return sonuc;
}
