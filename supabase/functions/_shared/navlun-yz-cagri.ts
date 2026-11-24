/**
 * NAVLUN YAPAY ZEKA CAGRISI (24.11.2026). Saf kurallar ve denetim navlun-yz.ts'de; burasi yalniz Gemini'ye istek atar.
 * Sabit JSON semasi (responseSchema), sicaklik 0. PDF ve gorsel ek dogrudan (yazi tanima ara adimi yok) gider; Excel eki
 * sunucuda tabloya (CSV) cevrilip METIN olarak verilir (daha tutarli, daha az token). Hata durumunda istisna atilmaz:
 * { ok: false } doner, cagiran maili "okunamadi" (kontrol bekliyor) birakir.
 */
import { NAVLUN_YZ_SEMA, yzYonergesi } from "./navlun-yz.ts";

export type YzDosya = { ad: string; mime: string; veri: string };
export type YzSonuc = { ok: true; cikti: unknown; dosyalar: string[] } | { ok: false; hata: string };

const MODEL = "gemini-2.5-flash";
const DOGRUDAN = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;
const EXCEL = /spreadsheetml|ms-excel|\.xlsx?$|\.xlsm$/i;
const gecikme = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base64Bayt(b64: string): Uint8Array {
  const ikili = atob(b64);
  const out = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) out[i] = ikili.charCodeAt(i);
  return out;
}

/** Excel ekini sayfa sayfa CSV metnine cevirir (en fazla 5 sayfa, 12.000 karakter). */
export async function excelMetni(b64: string): Promise<string> {
  // SheetJS resmi dagitimi (npm'deki 0.18.5 eski ve guvenlik yamasiz; 0.20.3 yamali)
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const wb = XLSX.read(base64Bayt(b64), { type: "array", cellFormula: false, cellHTML: false, sheetRows: 400 });
  const parcalar: string[] = [];
  for (const ad of wb.SheetNames.slice(0, 5)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[ad], { FS: " | ", blankrows: false, strip: true });
    if (csv.trim()) parcalar.push(`[Sayfa: ${ad}]\n${csv.trim()}`);
  }
  return parcalar.join("\n\n").slice(0, 12000);
}

export async function navlunYzOku(konu: string, metin: string, dosyalar: YzDosya[] = []): Promise<YzSonuc> {
  const anahtar = Deno.env.get("GEMINI_API_KEY");
  if (!anahtar) return { ok: false, hata: "GEMINI_API_KEY yok" };
  const parts: Record<string, unknown>[] = [{ text: yzYonergesi(konu) }, { text: `MAIL METNI:\n${metin.slice(0, 20000)}` }];
  const kullanilan: string[] = [];
  for (const d of dosyalar.slice(0, 4)) {
    try {
      if (DOGRUDAN.test(d.mime)) { parts.push({ inline_data: { mime_type: d.mime.toLowerCase(), data: d.veri } }); kullanilan.push(d.ad); }
      else if (EXCEL.test(d.mime) || EXCEL.test(d.ad)) {
        const t = await excelMetni(d.veri);
        if (t) { parts.push({ text: `EK TABLO (${d.ad.slice(0, 80)}):\n${t}` }); kullanilan.push(d.ad); }
      }
    } catch (e) { console.error("navlun-yz: ek okunamadi", d.ad.slice(0, 80), e instanceof Error ? e.message : e); }
  }
  const govde = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: NAVLUN_YZ_SEMA },
  });
  let sonHata = "bilinmiyor";
  // 24.11.2026 (gecmis mail denemesi: uzun tarife maili 45 sn'de bitmedi): deneme basina 55 sn, en fazla 2 deneme
  for (let deneme = 1; deneme <= 2; deneme++) {
    const ac = new AbortController();
    const zaman = setTimeout(() => ac.abort(), 55000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${anahtar}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: govde, signal: ac.signal,
      });
      if (!res.ok) {
        sonHata = `HTTP ${res.status}`;
        console.error("navlun-yz", sonHata, (await res.text()).slice(0, 200));
        if ([429, 500, 502, 503, 504].includes(res.status) && deneme < 2) { await gecikme(2000); continue; }
        break;
      }
      const veri = await res.json();
      const metinCikti = veri?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      if (!metinCikti) { sonHata = "boş cevap"; break; }
      return { ok: true, cikti: JSON.parse(metinCikti), dosyalar: kullanilan };
    } catch (e) {
      sonHata = e instanceof Error ? e.name === "AbortError" ? "zaman aşımı" : e.message.slice(0, 120) : "hata";
      if (deneme < 2 && !(e instanceof Error && e.name === "AbortError")) { await gecikme(2000); continue; }
      break;
    } finally { clearTimeout(zaman); }
  }
  return { ok: false, hata: sonHata };
}
