// ============================================================================
// DRAFT EVRAK SETI MAILI (24.11.2026) - SAF (Deno/Next bagimliligi yok)
// ============================================================================
// Kullanici: "Hazirlanan draft evraklar (yuklemesi tamamlanmis, beyannamesi iletilmis) 1-2-3-4-5-6 numarali evraklar
// mail ekte PDF olarak, Unex AI basligi altinda 'Draft Evrak Seti ektedir' seklinde konsimento talimati gibi
// gonderilebilir mi? PDF ekte cam gibi gelmeli. Musteri ismi, maili, telefonu gibi bilgiler yer almali. Ilk etapta
// test adresine. Dosya isimleri Taslak Onay Paketi'ndeki gibi."
// Kalip: operasyon-mail.ts (konsimento talimati ile ayni). Ekler tarayicida vektor PDF olarak uretilir
// (lib/html-vektor-pdf.ts); edge yalniz dogrular ve Resend ile gonderir.
// ============================================================================
import { operasyonMailHtml, opKacis } from "./operasyon-mail.ts";

/** Taslak Onay Paketi adi: "DRAFT- 1- INVOICE- <booking>- <proforma>.pdf" (lib/evrak-dosya-adi.ts ile ayni) */
// 24.11.2026: yalniz 1-6 (7 Quality / 8 Fumigation bu maile girmez - kullanici karari)
export const DRAFT_EK_ADI = /^DRAFT- ([1-6])- (INVOICE|PACKING|BL|COO|PHYTO|HEALTH)- [^\/\\:*?"<>|]{1,80}- [^\/\\:*?"<>|]{1,80}\.pdf$/;
export const DRAFT_EK_AZAMI_ADET = 6;
/** Resend siniri 40 MB (base64 dahil); tek belge 8 MB, toplam 20 MB ile genis pay */
export const DRAFT_EK_AZAMI_BAYT = 8 * 1024 * 1024;
export const DRAFT_TOPLAM_AZAMI_BAYT = 20 * 1024 * 1024;

export type DraftEk = { ad: string; icerik: string };

/** base64 metnin cozulmus bayt boyutu */
export function base64Boyut(b64: string): number {
  const temiz = b64.replace(/\s/g, "");
  const dolgu = temiz.endsWith("==") ? 2 : temiz.endsWith("=") ? 1 : 0;
  return Math.floor((temiz.length * 3) / 4) - dolgu;
}

/**
 * Ekleri dogrular: ad kalibi, sira tekrarsiz, PDF imzasi (%PDF -> base64 "JVBERi"), boyut sinirlari.
 * Hata varsa kullaniciya gosterilecek Turkce mesaj; yoksa null.
 */
export function draftEkleriDogrula(ekler: unknown): { hata: string | null; ekler: DraftEk[] } {
  if (!Array.isArray(ekler) || ekler.length === 0) return { hata: "Ek bulunamadı.", ekler: [] };
  if (ekler.length > DRAFT_EK_AZAMI_ADET) return { hata: `En fazla ${DRAFT_EK_AZAMI_ADET} belge gönderilebilir.`, ekler: [] };
  const sonuc: DraftEk[] = [];
  const siralar = new Set<string>();
  let toplam = 0;
  for (const e of ekler) {
    const ad = typeof (e as DraftEk)?.ad === "string" ? (e as DraftEk).ad : "";
    const icerik = typeof (e as DraftEk)?.icerik === "string" ? (e as DraftEk).icerik.replace(/\s/g, "") : "";
    const m = DRAFT_EK_ADI.exec(ad);
    if (!m) return { hata: `Geçersiz belge adı: ${ad.slice(0, 80) || "(boş)"}`, ekler: [] };
    if (siralar.has(m[1])) return { hata: `Aynı sıra numarası iki kez: ${m[1]}`, ekler: [] };
    siralar.add(m[1]);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(icerik) || !icerik.startsWith("JVBERi")) return { hata: `${ad} geçerli bir PDF değil.`, ekler: [] };
    const boyut = base64Boyut(icerik);
    if (boyut > DRAFT_EK_AZAMI_BAYT) return { hata: `${ad} çok büyük (${(boyut / 1048576).toFixed(1)} MB).`, ekler: [] };
    toplam += boyut;
    sonuc.push({ ad, icerik });
  }
  if (toplam > DRAFT_TOPLAM_AZAMI_BAYT) return { hata: `Eklerin toplamı çok büyük (${(toplam / 1048576).toFixed(1)} MB).`, ekler: [] };
  sonuc.sort((a, b) => Number(DRAFT_EK_ADI.exec(a.ad)![1]) - Number(DRAFT_EK_ADI.exec(b.ad)![1]));
  return { hata: null, ekler: sonuc };
}

export type DraftMailVeri = {
  dosya_id: string;
  dosya_no: string | null;
  proforma_no: string | null;
  alici_firma: string | null;
  alici_email: string | null;
  alici_tel: string | null;
  alici_adresi: string | null;
  booking_no: string | null;
  gemi_adi: string | null;
  sefer_no: string | null;
  yuklenme_limani: string | null;
  varis_limani: string | null;
  gemi_kalkis_tarihi: string | null;
  konteyner_adedi: number;
};

const tarihYazi = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
};

export function draftMail(
  v: DraftMailVeri,
  ekAdlari: string[],
  secenek: { site: string; test: boolean; gonderen?: string | null },
): { konu: string; html: string } {
  const k = opKacis;
  const konu = `${secenek.test ? "[TEST] " : ""}Draft Evrak Seti · ${v.proforma_no || v.dosya_no || "-"}${v.booking_no ? ` · ${v.booking_no}` : ""}${v.alici_firma ? ` · ${v.alici_firma}` : ""}`;
  const telHref = (v.alici_tel || "").replace(/[^\d+]/g, "");
  const gemi = [v.gemi_adi, v.sefer_no].filter(Boolean).join(" / ");
  const bilgiler: [string, string][] = [
    ["Müşteri", v.alici_firma ? `<b>${k(v.alici_firma)}</b>` : "-"],
    ["E-posta", v.alici_email ? `<a href="mailto:${k(v.alici_email)}" style="color:#283474;">${k(v.alici_email)}</a>` : "<span style=\"color:#B45309;\">Dosyada kayıtlı değil</span>"],
    ["Telefon", v.alici_tel ? (telHref ? `<a href="tel:${k(telHref)}" style="color:#283474;text-decoration:none;">${k(v.alici_tel)}</a>` : k(v.alici_tel)) : "-"],
    ["Proforma No", k(v.proforma_no || "-")],
    ["Booking No", k(v.booking_no || "-")],
  ];
  if (gemi) bilgiler.push(["Gemi / Sefer", k(gemi)]);
  const rota = [v.yuklenme_limani, v.varis_limani].filter(Boolean).join(" → ");
  if (rota) bilgiler.push(["Rota", k(rota)]);
  const etd = tarihYazi(v.gemi_kalkis_tarihi);
  if (etd) bilgiler.push(["Gemi Kalkış", k(etd)]);
  if (v.konteyner_adedi) bilgiler.push(["Konteyner", `${v.konteyner_adedi} adet`]);
  bilgiler.push(["Ekler", ekAdlari.map((a) => k(a)).join("<br>")]);

  const html = operasyonMailHtml({
    site: secenek.site,
    baslik: "Draft Evrak Seti ektedir",
    testMetni: secenek.test ? "TEST · Bu e-posta yalnızca test adresine gönderildi. Dosya “gönderildi” olarak işaretlenmedi; 48 saatlik yanıt süresi başlamadı." : null,
    girisHtml: `<b>${k(v.dosya_no || "-")}</b>${v.alici_firma ? ` · ${k(v.alici_firma)}` : ""} dosyasının draft evrak seti hazırlandı. <b>${ekAdlari.length} belge</b> PDF olarak ektedir; müşteri onayına gönderebilirsiniz.`,
    bilgiler,
    dugmeler: [
      { metin: "İhracat Evraklarını Aç", href: `${secenek.site}/draft-onay`, birincil: true },
      { metin: "Dosyayı aç", href: `${secenek.site}/dosya/${v.dosya_id}?tab=evraklar` },
    ],
    dugmeNotuHtml: "Müşteriye gönderdikten sonra İhracat Evrakları'nda “Gönderildi İşaretle” ile 48 saatlik yanıt süresini başlatın.",
    altNotHtml: `Bu e-posta UNEX-AI tarafından${secenek.gonderen ? ` ${k(secenek.gonderen)} isteğiyle` : ""} gönderildi. Belgeler sistemdeki güncel bilgilerle oluşturuldu; Draft BL yüklenen dosyanın kendisidir.`,
  });
  return { konu, html };
}
