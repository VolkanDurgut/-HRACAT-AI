/**
 * KAYITLI PROFORMALAR (03.11.2026) - saf modul (React / Supabase importu yok; tsx ile test edilir).
 * Kullanici: "Hazirlanan proformalar kayitli kalmali ve duzenlenebilmeli."
 * Tablo `proformalar` (migration 20261103100000): taslak = ekranin tamami (ProformaTaslak);
 * ozet kolonlar listede gosterilir. PDF her zaman taslaktan yeniden uretilir.
 */
import { kalemleriHesapla, toplamlar, type ProformaTaslak } from "@/lib/proforma/belge";
import { proformaHataMesaji } from "@/lib/proforma/kayit";

export type ProformaKaydi = {
  id: string;
  proforma_no: string;
  alici_unvan: string;
  tarih: string;
  para_birimi: "USD" | "EUR";
  toplam: number | string;
  toplam_mts: number | string;
  olusturan_email: string | null;
  guncelleyen_email: string | null;
  created_at: string;
  updated_at: string;
};

/** Listede okunan kolonlar (taslak HARIC; acilinca ayrica okunur). */
export const KAYIT_LISTE_KOLONLARI = "id, proforma_no, alici_unvan, tarih, para_birimi, toplam, toplam_mts, olusturan_email, guncelleyen_email, created_at, updated_at";

/** Kaydetmek icin en az: unvan + gecerli proforma no (diger alanlar yarim kalabilir = taslak). */
export function kayitEksigi(t: ProformaTaslak): string | null {
  const unvan = t.unvan.replace(/\s+/g, " ").trim();
  if (unvan.length < 2) return "Kaydetmek için müşteri seçin veya ünvan yazın.";
  if (unvan.length > 200) return "Ünvan en fazla 200 karakter olabilir.";
  const no = t.proformaNo.trim().toUpperCase();
  if (!/^[A-Z0-9-/ ]{4,40}$/.test(no)) return "Kaydetmek için proforma numarası gerekli (müşteri kodu girin).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.tarih)) return "Tarih geçersiz.";
  return null;
}

/** Veritabanina yazilacak satir (company_id / e-posta cagiran ekler). */
export function kayitSatiri(t: ProformaTaslak) {
  const top = toplamlar(kalemleriHesapla(t.kalemler));
  return {
    proforma_no: t.proformaNo.trim().toUpperCase(),
    alici_unvan: t.unvan.replace(/\s+/g, " ").trim().toUpperCase(),
    tarih: t.tarih,
    para_birimi: t.paraBirimi === "EUR" ? "EUR" : "USD",
    toplam: Math.round(Math.max(0, top.tutar) * 100) / 100,
    toplam_mts: Math.round(Math.max(0, top.mts) * 1000) / 1000,
    taslak: t,
  };
}

/** Kaydedilmemis degisiklik kontrolu icin karsilastirma anahtari. */
export const taslakImzasi = (t: ProformaTaslak) => JSON.stringify(t);

/** Kayit hatasini kullaniciya anlasilir yazar (ayni no = 23505). */
export function kayitHataMesaji(e: unknown, proformaNo: string): string {
  const kod = (e as { code?: string } | null)?.code;
  const mesaj = String((e as { message?: string } | null)?.message || "");
  if (kod === "23505" || /proformalar_no_tekil|duplicate key/i.test(mesaj)) {
    return `${proformaNo} numaralı proforma zaten kayıtlı. "Kayıtlı Proformalar" listesinden açın ya da numarayı değiştirin.`;
  }
  if (kod === "42P01" || /relation .*proformalar.* does not exist/i.test(mesaj)) {
    return "Proforma kayıt tablosu henüz kurulmamış. Yöneticiye bildirin.";
  }
  return proformaHataMesaji(e);
}

/** "03.11.2026 10:42" (Turkiye saati) */
export function kayitZamani(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
