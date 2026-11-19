/**
 * Siparis Bildirim Formu - istemci (18.11.2026). Model: supabase/functions/_shared/siparis-formu.ts (edge ile AYNI).
 * Okuma: siparis_formu_listesi() RPC; kayit: siparis_formu_kaydet() (tarihler ayni booking'li dosyanin Ek Bilgiler'ine de yazilir).
 * Cuval gorseli: 'siparis-formlari' kovasi, yol <sirket>/<booking>/<zaman>.jpg; yuklemeden once JPEG'e cevrilir (en fazla 2000 px).
 * Excel: edge mailinin ekiyle AYNI uretici (_shared/siparis-formu-xlsx.ts), tarayicida.
 */
import JSZip from "jszip";
import { supabase } from "@/lib/supabase";
import { formModeli, formDosyaAdi, type FormHam, type FormModeli } from "@/supabase/functions/_shared/siparis-formu";
import { gorselTuru, siparisFormuXlsx, type FormGorseli } from "@/supabase/functions/_shared/siparis-formu-xlsx";

export { cuvalLotunuAyikla, cuvalTarihleriniAyikla, firmaTemizle, formDurumu, lotTemizle, gunEkle, trTarih, type CuvalTarihi, type CuvalTarihleri, type FormModeli, type FormDurumu } from "@/supabase/functions/_shared/siparis-formu";

const KOVA = "siparis-formlari";
const AZAMI_PX = 2000;

export async function siparisFormlariOku(): Promise<FormModeli[]> {
  const { data, error } = await supabase.rpc("siparis_formu_listesi");
  if (error) throw new Error(error.message || "Sipariş formları okunamadı.");
  return ((data || []) as FormHam[]).map(formModeli);
}

/** Gorseli JPEG'e cevirir (seffaf alan beyaz), uzun kenar en fazla 2000 px. */
async function jpegYap(dosya: File): Promise<Blob> {
  const bmp = await createImageBitmap(dosya);
  const oran = Math.min(1, AZAMI_PX / Math.max(bmp.width, bmp.height));
  const en = Math.max(1, Math.round(bmp.width * oran));
  const boy = Math.max(1, Math.round(bmp.height * oran));
  const tuval = document.createElement("canvas");
  tuval.width = en;
  tuval.height = boy;
  const c = tuval.getContext("2d");
  if (!c) throw new Error("Görsel işlenemedi.");
  c.fillStyle = "#FFFFFF";
  c.fillRect(0, 0, en, boy);
  c.drawImage(bmp, 0, 0, en, boy);
  bmp.close?.();
  return await new Promise<Blob>((ok, hata) => tuval.toBlob((b) => (b ? ok(b) : hata(new Error("Görsel dönüştürülemedi."))), "image/jpeg", 0.88));
}

export async function gorselYukle(companyId: string, anahtar: string, dosya: File): Promise<{ yol: string; ad: string }> {
  if (!/^image\//.test(dosya.type)) throw new Error("Lütfen bir görsel dosyası seçin (JPG, PNG).");
  if (dosya.size > 25 * 1024 * 1024) throw new Error("Görsel en fazla 25 MB olabilir.");
  const blob = await jpegYap(dosya);
  if (blob.size > 5 * 1024 * 1024) throw new Error("Görsel sıkıştırıldıktan sonra da 5 MB'tan büyük.");
  const guvenli = anahtar.replace(/[^A-Za-z0-9_-]/g, "_");
  const yol = `${companyId}/${guvenli}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(KOVA).upload(yol, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Görsel yüklenemedi: ${error.message}`);
  return { yol, ad: dosya.name.slice(0, 200) };
}

export async function gorselSil(yol: string): Promise<void> {
  await supabase.storage.from(KOVA).remove([yol]);
}

export async function gorselAdresi(yol: string): Promise<string | null> {
  const { data } = await supabase.storage.from(KOVA).createSignedUrl(yol, 3600);
  return data?.signedUrl || null;
}

export type FormKaydi = {
  booking: string;
  spekler: string;
  /** Cuvaldaki yazim ("NOVEMBER 2026" / "12.11.2026"); ISO yalniz tam tarihte (dosyanin Ek Bilgiler'i yalniz o zaman guncellenir). */
  uretimMetin: string | null; sktMetin: string | null; uretimIso: string | null; sktIso: string | null;
  tarihKaynagi: "gorsel" | "elle" | null;
  gorsel: { yol: string; ad: string } | null;
  gorselKaldir: boolean;
  /** 19.11.2026: cuvaldaki lot (= proforma no) ve formdaki firma adi; bos = dosyadaki. */
  lotNo: string;
  firmaAdi: string;
};

export async function formKaydet(k: FormKaydi): Promise<number> {
  const { data, error } = await supabase.rpc("siparis_formu_kaydet", {
    p_booking: k.booking, p_spekler: k.spekler || null, p_uretim_metin: k.uretimMetin || null, p_skt_metin: k.sktMetin || null,
    p_uretim: k.uretimIso || null, p_skt: k.sktIso || null, p_gorsel_yolu: k.gorsel?.yol || null, p_gorsel_adi: k.gorsel?.ad || null,
    p_gorsel_sil: k.gorselKaldir, p_tarih_kaynagi: k.tarihKaynagi, p_lot_no: k.lotNo || null, p_firma_adi: k.firmaAdi || null,
  });
  if (error) throw new Error(error.message || "Kaydedilemedi.");
  return Number((data as { dosya?: number } | null)?.dosya || 0);
}

/** Kayitli gorselin kendisi (OCR icin). */
export async function gorselBlob(yol: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(KOVA).download(yol);
  return error ? null : data;
}

async function bayt(adres: string): Promise<FormGorseli | null> {
  try {
    const r = await fetch(adres);
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    const t = gorselTuru(b);
    return t ? { veri: b, tur: t } : null;
  } catch {
    return null;
  }
}

/** Formun Excel'i (mailin ekiyle ayni) tarayicida indirilir. */
export async function formExcelIndir(m: FormModeli): Promise<void> {
  const [logo, cuval] = await Promise.all([
    bayt("/images/logo.png"),
    m.gorselYolu ? gorselAdresi(m.gorselYolu).then((a) => (a ? bayt(a) : null)) : Promise.resolve(null),
  ]);
  const zip = new JSZip();
  for (const p of siparisFormuXlsx(m, logo, cuval)) zip.file(p.yol, p.icerik);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = formDosyaAdi(m);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** "[TEST]" formu test adresine; canli: formu uretime (alicilar + CC), booking basina bir kez. */
export async function testFormuGonder(booking: string, canli = false): Promise<string> {
  const { data, error } = await supabase.functions.invoke("siparis-formu", { body: canli ? { gonder: true, booking } : { test: true, booking } });
  const yanit = data as { ok?: boolean; hata?: string; alici?: string[] } | null;
  if (error || !yanit?.ok) {
    let mesaj = yanit?.hata || "";
    const ctx = (error as { context?: Response } | null)?.context;
    if (!mesaj && ctx && typeof ctx.json === "function") {
      try { mesaj = ((await ctx.json()) as { hata?: string }).hata || ""; } catch { /* yanit govdesi okunamadi */ }
    }
    throw new Error(mesaj || "Gönderilemedi.");
  }
  return (yanit.alici || []).join(", ");
}
