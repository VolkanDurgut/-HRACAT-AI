/**
 * Ic piyasa: musteri kartlari, is emirleri ve sevkler icin ortak tipler ve
 * yardimcilar (12.10.2026). Veri: migration 20261012100000.
 */

export type IcMusteri = {
  id: string;
  company_id: string;
  unvan: string;
  kisa_ad: string | null;
  vergi_dairesi: string | null;
  vergi_no: string | null;
  adres: string | null;
  yetkili_ad: string | null;
  telefon: string | null;
  eposta: string | null;
  whatsapp_izin: boolean;
  haftalik_fiyat_listesi: boolean;
  notlar: string | null;
  aktif: boolean;
  olusturma: string;
};

export type IsEmriDurum = "acik" | "tamamlandi" | "iptal";
export type HedefTur = "kg" | "arac";

export type IcIsEmri = {
  id: string;
  company_id: string;
  is_emri_no: string;
  musteri_id: string;
  urun: string;
  ambalaj: string | null;
  hedef_tur: HedefTur;
  hedef_kg: number | null;
  hedef_arac: number | null;
  birim_fiyat: number | null;
  kdv_dahil: boolean;
  vade_gun: number | null;
  odeme: string | null;
  teslim: string | null;
  teslim_adresi: string | null;
  fiyat_formu_id: string | null;
  fiyat_formu_no: string | null;
  talimat_veren: string | null;
  musteri_siparis_no: string | null;
  notlar: string | null;
  durum: IsEmriDurum;
  kapanis_zamani: string | null;
  olusturan_email: string | null;
  olusturma: string;
  takip_token: string;
};

export type CikisDurumu = "bekliyor" | "planlandi" | "cikti" | "bugun_degil";

export type IcSevk = {
  id: string;
  is_emri_id: string;
  plaka: string;
  dorse_plaka: string | null;
  net_kg: number;
  irsaliye_no: string | null;
  irsaliye_tarihi: string | null;
  ettn: string | null;
  sofor_ad: string | null;
  irsaliye_urun: string | null;
  irsaliye_dosya_yolu: string;
  irsaliye_dosya_adi: string | null;
  elle_duzeltildi: boolean;
  uyarilar: string[];
  girilen_email: string | null;
  olusturma: string;
  cikis_durumu: CikisDurumu;
  cikis_planlanan: string | null;
  cikis_zamani: string | null;
  cikis_isleyen: string | null;
};

/** Kantar Paneli icin (fiyatsiz, musteri maskeli) - kantar_ic_is_emirleri() */
export type KantarIsEmri = {
  id: string;
  is_emri_no: string;
  musteri_maskeli: string;
  urun: string;
  ambalaj: string | null;
  teslim: string | null;
  hedef_tur: HedefTur;
  hedef_kg: number | null;
  hedef_arac: number | null;
  yuklenen_kg: number;
  yuklenen_arac: number;
  olusturma: string;
};

export type KantarSonSevk = {
  id: string;
  is_emri_no: string;
  musteri_maskeli: string;
  urun: string;
  plaka: string;
  dorse_plaka: string | null;
  net_kg: number;
  irsaliye_no: string | null;
  irsaliye_dosya_yolu: string;
  uyari_var: boolean;
  girilen_email: string | null;
  olusturma: string;
  cikis_durumu: CikisDurumu;
  cikis_planlanan: string | null;
  cikis_zamani: string | null;
};

export const IC_BELGE_BUCKET = "ic-piyasa-belgeler";

export const DURUM_ETIKET: Record<IsEmriDurum, string> = {
  acik: "Açık",
  tamamlandi: "Tamamlandı",
  iptal: "İptal",
};

/** Cikis durumu kisa metni + renk sinifi (uygulama ici koyu tema) */
export function cikisEtiketi(s: { cikis_durumu: CikisDurumu; cikis_planlanan: string | null; cikis_zamani: string | null }): { metin: string; sinif: string } {
  const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }) : "-");
  if (s.cikis_durumu === "cikti") return { metin: `Yola çıktı ${saat(s.cikis_zamani)}`, sinif: "bg-emerald-500/15 text-emerald-400" };
  if (s.cikis_durumu === "planlandi") return { metin: `Planlandı ${saat(s.cikis_planlanan)}`, sinif: "bg-sky-500/15 text-sky-400" };
  if (s.cikis_durumu === "bugun_degil") return { metin: "Bugün çıkmayacak", sinif: "bg-slate-500/15 text-slate-300" };
  return { metin: "Çıkış bekleniyor", sinif: "bg-amber-500/15 text-amber-400" };
}

/** 25500 -> "25.500 kg" */
export function kgYazi(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || Number.isNaN(Number(kg))) return "-";
  return `${Number(kg).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg`;
}

/** 75000 -> "75 ton", 25500 -> "25,5 ton" */
export function tonYazi(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "-";
  return `${(Number(kg) / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ton`;
}

export function tlYazi(tutar: number | null | undefined): string {
  if (tutar === null || tutar === undefined || Number.isNaN(Number(tutar))) return "-";
  return `${Number(tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

export function hedefYazi(e: { hedef_tur: HedefTur; hedef_kg: number | null; hedef_arac: number | null }): string {
  return e.hedef_tur === "kg" ? tonYazi(e.hedef_kg) : `${e.hedef_arac ?? "-"} araç`;
}

/** Ilerleme orani 0..1+ (hedef turune gore) */
export function ilerlemeOrani(e: { hedef_tur: HedefTur; hedef_kg: number | null; hedef_arac: number | null }, yuklenenKg: number, yuklenenArac: number): number {
  if (e.hedef_tur === "kg") return e.hedef_kg ? yuklenenKg / Number(e.hedef_kg) : 0;
  return e.hedef_arac ? yuklenenArac / e.hedef_arac : 0;
}

/** "2 / 3 araç · 50.720 kg" veya "50.720 / 75.000 kg · 2 araç" */
export function ilerlemeYazi(e: { hedef_tur: HedefTur; hedef_kg: number | null; hedef_arac: number | null }, yuklenenKg: number, yuklenenArac: number): string {
  if (e.hedef_tur === "kg") {
    return `${Number(yuklenenKg).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / ${kgYazi(e.hedef_kg)} · ${yuklenenArac} araç`;
  }
  return `${yuklenenArac} / ${e.hedef_arac ?? "-"} araç · ${kgYazi(yuklenenKg)}`;
}

/** Hedefe ulasildi mi? (kg: %98 ve uzeri; arac: sayi tamam) */
export function hedefTamam(e: { hedef_tur: HedefTur; hedef_kg: number | null; hedef_arac: number | null }, yuklenenKg: number, yuklenenArac: number): boolean {
  if (e.hedef_tur === "kg") return !!e.hedef_kg && yuklenenKg >= Number(e.hedef_kg) * 0.98;
  return !!e.hedef_arac && yuklenenArac >= e.hedef_arac;
}

/** Tutar = net kg x birim fiyat (TL/kg). */
export function tutarHesapla(netKg: number, birimFiyat: number | null): number | null {
  if (birimFiyat === null || birimFiyat === undefined) return null;
  return Math.round(Number(netKg) * Number(birimFiyat) * 100) / 100;
}

/** "0532 111 22 33" / "+90 532..." / "5321112233" -> "905321112233"; gecersizse null */
export function telefonNormallestir(girdi: string): string | null | undefined {
  const r = girdi.replace(/\D/g, "");
  if (!r) return null; // bos
  let t = r;
  if (t.startsWith("0090")) t = t.slice(2);
  if (t.length === 11 && t.startsWith("0")) t = "9" + t; // 05xx -> 905xx
  if (t.length === 10 && t.startsWith("5")) t = "90" + t;
  if (/^[0-9]{10,15}$/.test(t)) return t;
  return undefined; // gecersiz
}

/** "905321112233" -> "0532 111 22 33" */
export function telefonYazi(t: string | null | undefined): string {
  if (!t) return "-";
  const m = t.match(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${t}`;
}

/** Tarih-saat (TR): "12.10.2026 14:05" */
export function tarihSaatYazi(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Musteri adini maskeler (Kantar Paneli ile ayni kural). */
export function maskele(isim: string | null | undefined): string {
  if (!isim) return "-";
  return isim.split(" ").map((k) => (k.length <= 1 ? k : k[0] + "*".repeat(k.length - 1))).join(" ");
}

/** Supabase RPC/PostgREST hata mesajini kullaniciya uygun hale getirir. */
export function hataMesaji(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/uq_ic_musteriler_vergi_no|duplicate key.*vergi_no/i.test(m)) return "Bu vergi numarasıyla kayıtlı bir müşteri zaten var.";
  if (/ic_musteriler_vergi_no_check/i.test(m)) return "Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalı.";
  if (/ic_musteriler_telefon_check/i.test(m)) return "Telefon numarası geçersiz.";
  if (/ic_is_emirleri_musteri_id_fkey/i.test(m)) return "Bu müşteriye ait iş emri var; müşteri silinemez. Pasife alabilirsiniz.";
  if (/ic_sevkler_is_emri_id_fkey/i.test(m)) return "Bu iş emrine sevk girilmiş; silinemez. İptal edebilirsiniz.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.";
  return m;
}
