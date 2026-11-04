/**
 * Irsaliye okunamayan alanlarin ELLE girilmesi (04.11.2026).
 * Kullanici: "Ic piyasa kisminda bazen irsaliyeleri okumuyor. Sanirim gorsel PDF oldugu icin okumuyor;
 * oyle durumlar icin manuel ekleme yapmaliyiz."
 * Plaka / net / irsaliye no zaten elle yaziliyordu; iki eksik vardi:
 *  1) Kismen okunan PDF'te (or. plaka okundu, net okunamadi) ekran yesil "Irsaliyeden okundu"
 *     diyordu; okunamayan alan soylenmiyordu -> artik okunamayan alanlar tek tek yazar.
 *  2) Irsaliye TARIHI okunamazsa bos kaliyordu (rapor / yola cikti mesaji kayit saatini kullaniyordu)
 *     -> elle tarih + saat (varsayilan simdi; gelecek ve 30 gunden eski kabul edilmez).
 * SAF (tarayici / sunucu bagimliligi yok). Kantar Yurt Ici (satis) ve Arac Teslim Al (alis) ortak kullanir.
 */
import type { IrsaliyeOkuma } from "@/lib/ic-piyasa/irsaliye-oku";

/** Okunamayan alanlarin ekran adlari (sira sabit). okuma yoksa hepsi. */
export function okunamayanAlanlar(okuma: Pick<IrsaliyeOkuma, "plaka" | "netKg" | "irsaliyeNo" | "tarih"> | null, ettnVar = false): string[] {
  const liste: string[] = [];
  if (!okuma?.plaka) liste.push("araç plakası");
  if (!(okuma?.netKg && okuma.netKg > 0)) liste.push("net ağırlık");
  if (!okuma?.irsaliyeNo && !ettnVar) liste.push("irsaliye no");
  if (!okuma?.tarih) liste.push("irsaliye tarihi");
  return liste;
}

/** Turkiye saatiyle "YYYY-MM-DDTHH:mm" (datetime-local girisi icin). */
export function trTarihSaatGirdisi(simdi = new Date()): string {
  const tr = new Date(simdi.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 16);
}

export const ELLE_TARIH_AZAMI_GUN = 30;

/**
 * datetime-local degeri (Turkiye saati) -> ISO (+03:00). Bos -> { iso: null } (sunucu kayit saatini kullanir).
 * Gelecek (10 dk payla) ya da 30 gunden eski tarih hata verir.
 */
export function elleTarihIso(deger: string, simdi = new Date()): { iso: string | null; hata: string | null } {
  const s = (deger || "").trim();
  if (!s) return { iso: null, hata: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return { iso: null, hata: "Tarih ve saat geçersiz." };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+03:00`;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || Number(m[2]) > 12 || Number(m[3]) > 31 || Number(m[4]) > 23 || Number(m[5]) > 59) return { iso: null, hata: "Tarih ve saat geçersiz." };
  if (t > simdi.getTime() + 10 * 60 * 1000) return { iso: null, hata: "İrsaliye tarihi ileri bir saat olamaz." };
  if (t < simdi.getTime() - ELLE_TARIH_AZAMI_GUN * 24 * 60 * 60 * 1000) return { iso: null, hata: `İrsaliye tarihi ${ELLE_TARIH_AZAMI_GUN} günden eski olamaz.` };
  return { iso, hata: null };
}
