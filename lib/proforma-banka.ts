/**
 * PROFORMADAKI BANKA (18.11.2026, kullanici kurali: "Proformadaki banka bilgisi ne ise fatura
 * talimatindaki banka bilgisi de o olmali").
 *
 * Dosyanin proformadan okunan hali ham_veri'de saklanir (Proforma Yukle: yapay zeka okumasi ya da
 * Kayitli Proformalar'dan birebir okuma). "Siparise Devam Et" ile acilan dosyalar eskiden bankayi
 * ilk dosyanin KOLONLARINDAN kopyaliyordu; ilk dosyada banka elle degistirildiyse (0107) sonraki
 * sevkiyat proformayla celisen bankayla aciliyordu (0123). Artik kaynak proformadir; dosyadaki banka
 * proformadakinden farkliysa ekranda acikca uyari gosterilir.
 *
 * SAF: veritabanina / React'e erismez.
 */
import { bankaAnahtariTahmin } from "@/lib/bankalar";

export type BankaAlanlari = {
  hesap_adi: string | null;
  banka: string | null;
  swift: string | null;
  hesap_numarasi: string | null;
  iban: string | null;
};

export type ProformaBankasi = BankaAlanlari & { kaynak: "kayitli_proforma" | "okuma" };

const metin = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s || null;
};

/** ham_veri'deki proforma bankasi; banka adi yoksa null. */
export function proformaBankasi(hamVeri: unknown): ProformaBankasi | null {
  if (!hamVeri || typeof hamVeri !== "object") return null;
  const h = hamVeri as Record<string, unknown>;
  const banka = metin(h.banka);
  if (!banka) return null;
  return {
    hesap_adi: metin(h.hesap_adi),
    banka,
    swift: metin(h.swift),
    hesap_numarasi: metin(h.hesap_numarasi),
    iban: metin(h.iban),
    kaynak: h.okuma_kaynagi === "sistem_proformasi" ? "kayitli_proforma" : "okuma",
  };
}

/** Yeni sevkiyat dosyasinin banka alanlari: once proforma, yoksa ornek dosyanin kolonlari. */
export function sevkiyatBankasi(ornek: (BankaAlanlari & { ham_veri?: unknown }) | null | undefined): BankaAlanlari {
  const p = proformaBankasi(ornek?.ham_veri);
  if (p) {
    return {
      hesap_adi: p.hesap_adi ?? metin(ornek?.hesap_adi),
      banka: p.banka,
      swift: p.swift,
      hesap_numarasi: p.hesap_numarasi,
      iban: p.iban,
    };
  }
  return {
    hesap_adi: metin(ornek?.hesap_adi),
    banka: metin(ornek?.banka),
    swift: metin(ornek?.swift),
    hesap_numarasi: metin(ornek?.hesap_numarasi),
    iban: metin(ornek?.iban),
  };
}

const anahtar = (banka: string | null | undefined) => bankaAnahtariTahmin(banka) || (metin(banka) || "").toLocaleUpperCase("en-US");

/**
 * Verilen banka (dosyadaki ya da fatura talimatina yazilacak) proformadakinden farkliysa proforma
 * bankasi (uyari icin); ayniysa ya da proformada banka yoksa null.
 */
export function bankaFarki(banka: string | null | undefined, hamVeri: unknown): ProformaBankasi | null {
  const p = proformaBankasi(hamVeri);
  if (!p) return null;
  return anahtar(banka) === anahtar(p.banka) ? null : p;
}
