/**
 * FATURA TALIMATI - ne zaman hazirlanabilir? (03.11.2026, saf modul)
 *
 * TAM talimat (eskisi gibi): rezervasyon var ve rezervasyondaki konteyner adedinin hepsi eklendi.
 * ON talimat (yeni): rezervasyon / konteyner bilgileri henuz yok ya da eksik, ama proformadan
 *   gelen urun kalemleri (miktar) var. Kullanici: Filistin (Asdod uzerinden) yuklemelerinde
 *   karsi ulkenin ihracatcilar birliginden M24 kodu alinabilmesi icin fatura, rezervasyon ve
 *   konteyner belli olmadan kesilmek zorunda. On talimat PDF / mailde acikca "ON TALIMAT"
 *   yazar; konteyner ve booking bilgileri sonradan bildirilir.
 */
import { kalemMiktari } from "@/lib/sayi-oku";

export type FaturaTalimatiDurumu =
  | { tur: "tam" }
  | { tur: "on"; eksikler: string[] }
  | { tur: "yok"; neden: string };

export function faturaTalimatiDurumu(
  urunler: unknown[] | null | undefined,
  rezervasyonlar: { konteyner_adedi?: number | null }[],
  eklenenKonteyner: number
): FaturaTalimatiDurumu {
  const rezKont = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  if (rezKont > 0 && eklenenKonteyner === rezKont) return { tur: "tam" };
  const kalemVar = (urunler || []).some((u) => kalemMiktari(u as { miktar_mts?: unknown; quantity?: unknown }) > 0);
  if (!kalemVar) return { tur: "yok", neden: "Ürün detaylarında miktar yok (proforma bilgilerini kontrol edin)." };
  const eksikler: string[] = [];
  if (rezervasyonlar.length === 0) eksikler.push("Rezervasyon (booking, gemi, acente) girilmedi");
  else if (rezKont === 0) eksikler.push("Rezervasyonda konteyner adedi yok");
  if (rezKont > 0 && eklenenKonteyner !== rezKont) eksikler.push(`Konteyner bilgileri eksik (${eklenenKonteyner}/${rezKont})`);
  else if (rezKont === 0) eksikler.push("Konteyner bilgileri (no, mühür, ağırlık) girilmedi");
  return { tur: "on", eksikler };
}

/** On talimat mail metninin ilk satiri (kaydedilen metinde de aranir). */
export const ON_TALIMAT_ISARETI = "*** ON FATURA TALIMATI ***";
