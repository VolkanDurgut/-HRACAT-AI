/**
 * PAZAR gorev sayfasi (/gorev/[token]) -> edge "pazar-gorev" (10.11.2026). Girissiz; yetki 32 haneli token.
 * Veritabanina dogrudan erisim YOK (pazar_gorevler istemciye kapali).
 */
export type GorevNeden = "hatirlatma1" | "hatirlatma2" | "siparissiz" | "potansiyel";
export type GorevBilgisi = {
  gorev: { tarih: string; sira: number; neden: GorevNeden; durum: "bekliyor" | "yapildi" | "atlandi"; isleyen: string | null; tamamlanma: string | null; atanan?: string | null; temas_var?: boolean };
  /** Gorevin atandigi satisci (pazar_ekip); eski gorevlerde null. */
  ekip?: { kod: string; eposta: string; hitap: string | null } | null;
  adim: "sorgulama" | "hatirlatma1" | "hatirlatma2";
  firma: { ad: string; ulke: string | null; durum: "musteri" | "potansiyel"; crm_asama: string; alici_adi: string | null; son_siparis: string | null; aktif: boolean };
  kisiler: { id: string; ad: string | null; eposta: string | null; eposta_gecerli: boolean; telefonlar: string[]; whatsapp: string | null }[];
  fuarlar: string[];
  /** Arsivden tespit edilen son cevaplar (3.5; son 30 gun). */
  gelenler?: { tarih: string; gonderen: string; konu: string | null; ozet: string | null; tur: "cevap" | "otomatik"; oneri: "teklif" | "siparis" | "ilgilenmiyor" | null }[];
  son_urun: string | null;
  gecmis: { adim: string; kanal: string | null; sonuc: string | null; alici: string | null; konu: string | null; isleyen: string | null; olusturma: string }[];
  gunun_gorevleri: { sira: number; durum: string; token: string; ad: string; neden: GorevNeden }[];
  /** Sirkette daha once yazilan atlama nedenleri (en sik / en yeni 8). */
  atlama_nedenleri?: string[];
};
export type GorevIslemi = "gonderildi" | "cevap" | "teklif" | "siparis" | "ilgilenmiyor" | "atla";
export type GorevCevap<T> = { ok: true; veri: T } | { ok: false; hata: string; durum: number };

async function cagir<T>(govde: Record<string, unknown>): Promise<GorevCevap<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  try {
    const res = await fetch(`${url}/functions/v1/pazar-gorev`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anahtar, Authorization: `Bearer ${anahtar}` },
      body: JSON.stringify(govde),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, hata: (veri as { hata?: string }).hata || "Beklenmeyen bir hata oluştu.", durum: res.status };
    return { ok: true, veri: veri as T };
  } catch {
    return { ok: false, hata: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", durum: 0 };
  }
}

export const gorevBilgisi = (token: string) => cagir<GorevBilgisi>({ islem: "bilgi", token });

export const gorevIsle = (token: string, is: GorevIslemi, ek: { kanal?: "eposta" | "whatsapp"; sablon?: string; alici?: string; konu?: string; govde?: string; isleyen?: string } = {}) =>
  cagir<GorevBilgisi>({ islem: "isle", token, is, ...ek });
