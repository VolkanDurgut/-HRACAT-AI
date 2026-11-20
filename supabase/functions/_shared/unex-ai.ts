/**
 * UNEX-AI marka ve ic mail kimligi (20.11.2026). Kullanici: "Programin ismini komple UNEX-AI yapmamiz gerekiyor.
 * Mail raporlarinda ilk Unex AI'in gonderdigi gozuksun; yaninda Hatirlatma / Onemli / Rapor olsun."
 *
 * Tek kaynak: butun IC mailler (rapor, hatirlatma, talimat) buradaki gonderenle ve konu etiketiyle gider.
 * MUSTERIYE giden mailler (ic piyasa musteri bildirimleri, musteri durum raporu) ve musteriye giden evraklar
 * "Unex Gida" olarak KALIR; bu modulu kullanmazlar.
 * Adres (bildirim@ihracatasistanim.com) DEGISMEZ: Resend alan adi dogrulamasi bu adrese bagli.
 *
 * Etiket anlami:
 *   Rapor      - bilgi amacli, zamanli rapor (gunluk ihracat, ic piyasa, navlun, siparis, DIIB, VGM, yedek)
 *   Hatirlatma - sizden bir is bekleniyor (konsimento talimati, pazar gorevi, arac cikis onayi, satin alma talebi)
 *   Onemli     - is baslatan talimat ya da uyari (siparis bildirim formu, fatura talimati, cevapsiz cikis, yedek uyarisi)
 */
export const MARKA = "UNEX-AI";
export const GONDEREN_ADI = "Unex AI";
export const BILDIRIM_ADRESI = "bildirim@ihracatasistanim.com";
export const UNEX_AI_GONDEREN = `${GONDEREN_ADI} <${BILDIRIM_ADRESI}>`;

export type MailEtiketi = "Rapor" | "Hatırlatma" | "Önemli";
export const MAIL_ETIKETLERI: readonly MailEtiketi[] = ["Rapor", "Hatırlatma", "Önemli"];

const ON_EK = /^\s*\[(TEST|DENEME)\]\s*/i;
const ETIKET_ON_EK = /^\s*\[(Rapor|Hatırlatma|Önemli)\]\s*/i;

/**
 * "[Rapor] Navlun Raporu · 20.11.2026". Test / deneme on eki en basta kalir ("[TEST] [Rapor] ...").
 * sirketAdi verilirse konunun basindaki "<sirketAdi> " atilir (gonderen zaten Unex AI).
 * Ikinci kez cagrilirsa etiket cogalmaz.
 */
export function etiketliKonu(etiket: MailEtiketi, konu: string, secenek: { sirketAdi?: string | null } = {}): string {
  let govde = String(konu ?? "").trim();
  let test = "";
  const t = ON_EK.exec(govde);
  if (t) { test = `[${t[1].toUpperCase()}] `; govde = govde.slice(t[0].length); }
  govde = govde.replace(ETIKET_ON_EK, "");
  const sirket = (secenek.sirketAdi || "").trim();
  if (sirket && govde.toLocaleLowerCase("tr-TR").startsWith(`${sirket} `.toLocaleLowerCase("tr-TR"))) {
    const kalan = govde.slice(sirket.length).trim();
    if (kalan) govde = kalan;
  }
  return `${test}[${etiket}] ${govde}`;
}
