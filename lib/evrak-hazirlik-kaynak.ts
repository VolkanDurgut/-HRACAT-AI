/**
 * Evrak hazirlik eksiklerini KAYNAGA gore gruplar (25.10.2026, kullanici istegi:
 * "sari unlem yerine, hangi belgeler yuklendiginde evrakin olusacagini orada
 * belirtelim").
 *
 * Girdi: lib/document-readiness.ts ve lib/sigorta-talimati.ts'in urettigi alan
 * etiketleri ("Fatura No", "Consignee (konsimento talimati eklenmemis)" ...).
 * Cikti: o alanlari dolduran belge / adim ("Fatura", "Konsimento talimati" ...),
 * is akisi sirasiyla, her biri kendi alanlariyla. Hazirlik KURALLARI burada
 * DEGILDIR (degismedi); burasi sadece gosterim icin eslestirme yapar.
 * Bilinmeyen bir etiket gelirse KAYBOLMAZ: kendi adiyla ayri kaynak olarak doner.
 */

export type EksikKaynak = { anahtar: string; etiket: string; alanlar: string[] };

const KAYNAKLAR: { anahtar: string; etiket: string; alanlar: string[] }[] = [
  {
    anahtar: "proforma", etiket: "Proforma bilgileri",
    alanlar: ["Alıcı Firma", "Alıcı Adresi", "Hesap Adı", "Banka", "SWIFT Kodu", "IBAN", "Ürün Detayları",
      "Ürün Tanımı", "Ambalaj", "Lot No", "Proforma No (Rapor No)", "Mal Bedeli", "Teslim Şekli"],
  },
  { anahtar: "lojistik", etiket: "Lojistik bilgileri", alanlar: ["Yükleme Limanı", "Varış Limanı", "Gideceği Yer"] },
  {
    anahtar: "rezervasyon", etiket: "Rezervasyon",
    alanlar: ["Booking No (Rezervasyon No)", "Gemi Adı", "Sefer No", "Gemi Kalkışı", "Taşıyıcı Acente"],
  },
  {
    anahtar: "konteyner", etiket: "Konteyner bilgileri",
    alanlar: ["Konteyner Bilgileri", "Net Ağırlık (bir veya daha fazla konteynerde eksik)",
      "Brüt Ağırlık (bir veya daha fazla konteynerde eksik)", "Kap Adedi (bir veya daha fazla konteynerde eksik)",
      "Konteyner / Ambalaj", "Brüt / Net Ağırlık"],
  },
  { anahtar: "fatura", etiket: "Fatura", alanlar: ["Fatura No", "Fatura Tarihi"] },
  { anahtar: "konsimento", etiket: "Konşimento talimatı", alanlar: ["Consignee (konşimento talimatı eklenmemiş)", "Consignee"] },
  { anahtar: "draft_bl", etiket: "Draft BL", alanlar: ["B/L No", "Konşimento No"] },
  { anahtar: "ek_bilgiler", etiket: "Ek Bilgiler", alanlar: ["Son Kullanım Tarihi", "Üretim Tarihi"] },
];

/** Alan etiketini kisa hale getirir: "Net Ağırlık (bir veya ...)" -> "Net Ağırlık". */
export function kisaAlanAdi(alan: string): string {
  return alan.replace(/\s*\(.*\)\s*$/, "").trim() || alan;
}

/** Eksik alanlari kaynaklara gore gruplar; sira = is akisi sirasi, bilinmeyenler en sonda. */
export function eksikKaynaklari(eksikler: string[]): EksikKaynak[] {
  const sonuc: EksikKaynak[] = [];
  const bilinmeyen: EksikKaynak[] = [];
  const kullanilan = new Set<string>();
  for (const k of KAYNAKLAR) {
    const alanlar = eksikler.filter((e) => k.alanlar.includes(e));
    if (alanlar.length) {
      sonuc.push({ anahtar: k.anahtar, etiket: k.etiket, alanlar: alanlar.map(kisaAlanAdi) });
      alanlar.forEach((a) => kullanilan.add(a));
    }
  }
  for (const e of eksikler) {
    if (kullanilan.has(e)) continue;
    kullanilan.add(e);
    bilinmeyen.push({ anahtar: `diger:${e}`, etiket: kisaAlanAdi(e), alanlar: [kisaAlanAdi(e)] });
  }
  return [...sonuc, ...bilinmeyen];
}
