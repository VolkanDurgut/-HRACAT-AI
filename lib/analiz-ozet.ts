/**
 * Analiz > "Otomatik Özet" karti (26.10.2026, kullanicinin ornek paneli "AI Summary").
 *
 * YAPAY ZEKA YOK: cumleler sayfanin zaten hesapladigi toplamlardan kurala gore
 * kurulur (tahmin / yorum yok, her sayi ekrandaki kartlarla ayni kaynaktan).
 * Saf fonksiyon - test: scratchpad `analizpanel/ozet.ts`.
 */

export type OzetAyi = { anahtar: string; konteyner: number };

export type OzetGirdisi = {
  dosya: number;
  acik: number;
  konteyner: number;
  /** "12.450 MTS" gibi hazir metin (bos ise cumleden duser). */
  miktarMetni: string | null;
  /** "$2,9 mn" gibi hazir metin. */
  hacimMetni: string;
  musteri?: { ad: string; pay: number; dosya: number } | null;
  liman?: { ad: string; konteyner: number; pay: number } | null;
  acente?: { ad: string; konteyner: number; navlun?: { liman: string; metin: string } | null } | null;
  /** Aylik konteyner (YYYY-MM, bos aylar dahil, sirali). */
  aylar: OzetAyi[];
  /** Bugunun ayi (YYYY-MM, Istanbul). */
  buAy: string;
};

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function ayAdi(anahtar: string): string {
  const [y, m] = anahtar.split("-").map(Number);
  return `${AYLAR[m - 1] ?? "?"} ${y}`;
}

function yuzdeMetni(pay: number): string {
  const p = pay * 100;
  if (p > 0 && p < 1) return "%1'den az";
  return `%${Math.round(p)}`;
}

const sayi = (n: number) => n.toLocaleString("tr-TR");

export function analizOzeti(g: OzetGirdisi): string[] {
  if (g.dosya === 0) return [];
  const c: string[] = [];

  const miktar = g.miktarMetni ? `, ${g.miktarMetni}` : "";
  c.push(`${sayi(g.dosya)} dosyada ${sayi(g.konteyner)} konteyner${miktar}; toplam hacim ${g.hacimMetni}.${g.acik > 0 ? ` ${sayi(g.acik)} dosya hâlâ açık.` : ""}`);

  if (g.musteri) {
    c.push(`En büyük müşteri ${g.musteri.ad}: hacimdeki payı ${yuzdeMetni(g.musteri.pay)} (${sayi(g.musteri.dosya)} dosya).`);
  }
  if (g.liman) {
    c.push(`En çok gönderilen liman ${g.liman.ad}: ${sayi(g.liman.konteyner)} konteyner (${yuzdeMetni(g.liman.pay)}).`);
  }
  if (g.acente) {
    const n = g.acente.navlun ? `; ${g.acente.navlun.liman} için son navlun ${g.acente.navlun.metin} / konteyner` : "";
    c.push(`En çok çalışılan acente ${g.acente.ad}: ${sayi(g.acente.konteyner)} konteyner${n}.`);
  }

  // Ay karsilastirmasi: bu ay (yoksa bugune kadarki son ay) ve bir onceki ay.
  // Ileri tarihli (ETD'si gelecek ay) sevkiyatlar ayrica "planlandi" olarak yazilir.
  const gecmis = g.aylar.filter((a) => a.anahtar <= g.buAy);
  const gelecek = g.aylar.filter((a) => a.anahtar > g.buAy && a.konteyner > 0);
  const son = gecmis[gecmis.length - 1];
  if (son) {
    const onceki = gecmis[gecmis.length - 2];
    const devam = son.anahtar === g.buAy ? " (ay devam ediyor)" : "";
    let cumle = `${ayAdi(son.anahtar)}${devam}: ${sayi(son.konteyner)} konteyner`;
    if (onceki) {
      cumle += ` · ${ayAdi(onceki.anahtar)}: ${sayi(onceki.konteyner)}`;
      if (!devam && onceki.konteyner > 0) {
        const fark = Math.round(((son.konteyner - onceki.konteyner) / onceki.konteyner) * 100);
        cumle += fark === 0 ? " (aynı)" : ` (${fark > 0 ? "+" : "−"}%${Math.abs(fark)})`;
      }
    }
    c.push(cumle + ".");
  }
  if (gelecek.length > 0) {
    c.push(`${gelecek.map((a) => `${ayAdi(a.anahtar)} için ${sayi(a.konteyner)} konteyner`).join(", ")} planlandı.`);
  }
  return c;
}
