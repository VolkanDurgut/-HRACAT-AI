/**
 * Kantar Paneli · Sevkiyat Durumu (28.10.2026). Kullanici: "Kantar panelinde hangi sevkiyattan
 * kac tane dolu gozukebilmeli; cuval isimleri, konteyner no, muhur no, musteri ismi (sifrelenecek,
 * anlasilabilir sekilde)." SAF fonksiyonlar (test: scratchpad `kantar/birim.ts`).
 *
 * Sayim kurali gunluk rapor / Ana Panel ile AYNI:
 *   toplam = max(rezervasyonlardaki konteyner_adedi toplami, eklenen konteyner)
 *   dolu   = DBA yuklu konteyner (dolup tartildi)
 *   bos    = eklenmis (ekipman alinmis) ama DBA'si yok
 *   alinmayan = toplam - eklenen (ekipman henuz alinmadi)
 * Musteri adi kantara HIC gelmez: sunucu `kantar_sevkiyat_listesi()` proforma kodunu verir
 * (migration 20261028120000). `musteriKodu` ayni kuralin istemci kopyasi - yalniz migration
 * uygulanmadan once eski fonksiyona dusuldugunde kullanilir.
 */

export type KantarKonteyner = {
  id: string;
  dosya_id: string;
  konteyner_no: string | null;
  muhur_no: string | null;
  marka: string | null;
  dba_dosya_url: string | null;
};

export type KantarDosya = {
  id: string;
  dosya_no: string;
  marka: string | null;
  musteri_kodu: string;
};

export type SevkiyatDurumu = "tamamlandi" | "yukleniyor" | "dolum_bekliyor" | "baslamadi";

export type SevkiyatOzeti = {
  dosya_id: string;
  dosya_no: string;
  musteri_kodu: string;
  cuval: string;
  toplam: number;
  eklenen: number;
  dolu: number;
  bos: number;
  alinmayan: number;
  durum: SevkiyatDurumu;
  konteynerler: KantarKonteyner[];
};

const HUKUKI_EKLER = new Set(["LTD", "SARL", "SARLU", "SA", "SAL", "SL", "LLC", "PTE", "INC", "CO", "EURL", "DE", "CV", "ETS", "STE", "AND"]);

/** SQL `kantar_musteri_kodu` ile BIREBIR: "UNEXCCS160926 / …" -> "CCS"; yoksa bas harfler; yoksa "—". */
export function musteriKodu(proformaNo: string | null | undefined, alici: string | null | undefined): string {
  const ilk = (proformaNo || "").split("/")[0].toUpperCase();
  const m = /^\s*UNEX([A-Z]{2,6})[0-9]/.exec(ilk);
  if (m) return m[1];
  const harfler = (alici || "")
    .replace(/[^A-Za-z ]/g, " ")
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !HUKUKI_EKLER.has(w))
    .slice(0, 4)
    .map((w) => w[0])
    .join("");
  return harfler || "—";
}

/** "STAR BRAND" -> "STAR"; birden fazla marka "SAAD & ASLI" (gunluk rapordaki gibi). */
export function cuvalAdi(konteynerMarkalari: (string | null | undefined)[], dosyaMarkasi: string | null | undefined): string {
  const temizle = (m: string) => m.replace(/\bBRAND\b/gi, "").replace(/\s+/g, " ").trim().toUpperCase();
  const set: string[] = [];
  for (const m of konteynerMarkalari) {
    const t = m ? temizle(m) : "";
    if (t && !set.includes(t)) set.push(t);
  }
  if (set.length) return set.join(" & ");
  const d = dosyaMarkasi ? temizle(dosyaMarkasi) : "";
  return d || "—";
}

const DURUM_SIRASI: Record<SevkiyatDurumu, number> = { yukleniyor: 0, dolum_bekliyor: 1, baslamadi: 2, tamamlandi: 3 };

export function sevkiyatOzetleri(
  dosyalar: KantarDosya[],
  konteynerler: KantarKonteyner[],
  rezerveAdet: Record<string, number>,
): SevkiyatOzeti[] {
  const grup: Record<string, KantarKonteyner[]> = {};
  for (const k of konteynerler) (grup[k.dosya_id] ||= []).push(k);
  return dosyalar
    .map((d) => {
      const ks = (grup[d.id] || []).slice().sort((a, b) => {
        const ad = a.dba_dosya_url ? 1 : 0, bd = b.dba_dosya_url ? 1 : 0;
        return ad - bd || (a.konteyner_no || "").localeCompare(b.konteyner_no || "");
      });
      const eklenen = ks.length;
      const dolu = ks.filter((k) => !!k.dba_dosya_url).length;
      const toplam = Math.max(rezerveAdet[d.id] || 0, eklenen);
      const durum: SevkiyatDurumu =
        toplam > 0 && dolu === toplam ? "tamamlandi" : dolu > 0 ? "yukleniyor" : eklenen > 0 ? "dolum_bekliyor" : "baslamadi";
      return {
        dosya_id: d.id,
        dosya_no: d.dosya_no,
        musteri_kodu: d.musteri_kodu,
        cuval: cuvalAdi(ks.map((k) => k.marka), d.marka),
        toplam, eklenen, dolu,
        bos: eklenen - dolu,
        alinmayan: Math.max(0, toplam - eklenen),
        durum,
        konteynerler: ks,
      };
    })
    .sort((a, b) => DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || a.dosya_no.localeCompare(b.dosya_no));
}

export const DURUM_ETIKETI: Record<SevkiyatDurumu, string> = {
  tamamlandi: "Yükleme tamamlandı",
  yukleniyor: "Yükleniyor",
  dolum_bekliyor: "Dolum bekliyor",
  baslamadi: "Başlamadı",
};
