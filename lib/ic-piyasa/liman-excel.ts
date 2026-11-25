/**
 * Liman portali "Gemi Tartim Bilgileri" Excel'i (ExportToExcel .xls) -> gemi tahliye araclari (25.11.2026).
 * Kullanici: "Liman tonajlarini excel ile yukleyecegiz." Sutunlar BASLIK ADINA gore bulunur (sira degisebilir):
 * Arac Plakasi, Bos Agirlik, Dolu Agirlik, Agirlik (net), Cikis Tarihi (yoksa Operasyon Tarihi), Fis Kodu (tekil anahtar),
 * Gemi/Sefer, Alici Firma. Tarih Excel seri sayisi (TR saati, UTC+3) ya da "25.11.2026 21:38" metni olabilir.
 * Ayni Excel tekrar yuklenirse fis koduna gore atlanir (sunucu: ic_gemi_liman_excel_yukle).
 */
import type { XlsHucre } from "@/lib/xls-oku";
import { plakaBicimle, plakaGecerli } from "./irsaliye-oku";

export type LimanSatiri = {
  satir: number; fis_kodu: string; plaka: string; bos_kg: number | null; dolu_kg: number | null; net_kg: number;
  /** ISO (UTC) */
  cikis: string; gemi_sefer: string | null; alici: string | null;
};
export type LimanHatasi = { satir: number; hata: string };

const duz = (s: unknown) => String(s ?? "").toLocaleUpperCase("tr").replace(/İ/g, "I").replace(/[ĞÜŞÖÇ]/g, (h) => ({ Ğ: "G", Ü: "U", Ş: "S", Ö: "O", Ç: "C" } as Record<string, string>)[h]).replace(/[^A-Z0-9]/g, "");

const BASLIKLAR: Record<string, string[]> = {
  plaka: ["ARACPLAKASI", "PLAKA"],
  bos: ["BOSAGIRLIK", "DARA"],
  dolu: ["DOLUAGIRLIK", "BRUT"],
  net: ["AGIRLIK", "NETAGIRLIK", "NET"],
  cikis: ["CIKISTARIHI"],
  operasyon: ["OPERASYONTARIHI"],
  fis: ["FISKODU", "FISNO"],
  gemi: ["GEMISEFER", "GEMI"],
  alici: ["ALICIFIRMA", "ALICI"],
};

/** Excel seri gunu (TR yerel, UTC+3 sabit) ya da "GG.AA.YYYY SS:DD" -> ISO UTC */
export function limanTarihi(v: XlsHucre): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400) * 1000 - 3 * 3600 * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const d = Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0) - 3, +(m[5] || 0), +(m[6] || 0));
    return Number.isFinite(d) ? new Date(d).toISOString() : null;
  }
  return null;
}

const sayi = (v: XlsHucre): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const t = v.trim().replace(/\s/g, "");
    const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export function limanExceliAyristir(satirlar: XlsHucre[][]): { satirlar: LimanSatiri[]; hatalar: LimanHatasi[]; gemiler: string[] } {
  const bi = satirlar.findIndex((r) => r && r.some((h) => BASLIKLAR.plaka.includes(duz(h))) && r.some((h) => BASLIKLAR.net.includes(duz(h))));
  if (bi < 0) return { satirlar: [], hatalar: [{ satir: 0, hata: "Başlık satırı bulunamadı (Araç Plakası / Ağırlık sütunları yok). Liman portalındaki Gemi Tartım Bilgileri Excel'ini yükleyin." }], gemiler: [] };
  const baslik = satirlar[bi].map(duz);
  const sutun = (k: keyof typeof BASLIKLAR) => baslik.findIndex((h) => BASLIKLAR[k].includes(h));
  const s = { plaka: sutun("plaka"), bos: sutun("bos"), dolu: sutun("dolu"), net: sutun("net"), cikis: sutun("cikis"), op: sutun("operasyon"), fis: sutun("fis"), gemi: sutun("gemi"), alici: sutun("alici") };
  const sonuc: LimanSatiri[] = [];
  const hatalar: LimanHatasi[] = [];
  const gemiler = new Set<string>();
  const goruldu = new Set<string>();
  for (let i = bi + 1; i < satirlar.length; i++) {
    const r = satirlar[i] || [];
    const al = (c: number) => (c >= 0 ? r[c] ?? null : null);
    if (r.every((h) => h === null || h === "")) continue;
    const no = i + 1;
    const plaka = plakaBicimle(String(al(s.plaka) ?? ""));
    const net = sayi(al(s.net));
    const cikis = limanTarihi(al(s.cikis)) || limanTarihi(al(s.op));
    const fis = String(al(s.fis) ?? "").trim() || null;
    if (!plaka && net === null) continue;
    if (!plakaGecerli(plaka)) { hatalar.push({ satir: no, hata: `Plaka okunamadı (${al(s.plaka) ?? "boş"}).` }); continue; }
    if (net === null || net < 1000 || net > 60000) { hatalar.push({ satir: no, hata: `${plaka}: net ağırlık 1.000 - 60.000 kg arasında değil (${al(s.net) ?? "boş"}).` }); continue; }
    if (!cikis) { hatalar.push({ satir: no, hata: `${plaka}: çıkış tarihi okunamadı.` }); continue; }
    // Fis kodu yoksa plaka + cikis zamani tekil anahtar
    const anahtar = fis || `${plaka.replace(/\s/g, "")}-${cikis.slice(0, 16)}`;
    if (goruldu.has(anahtar)) continue;
    goruldu.add(anahtar);
    const gemi = String(al(s.gemi) ?? "").trim() || null;
    if (gemi) gemiler.add(gemi);
    sonuc.push({
      satir: no, fis_kodu: anahtar, plaka, net_kg: net, cikis,
      bos_kg: sayi(al(s.bos)), dolu_kg: sayi(al(s.dolu)),
      gemi_sefer: gemi, alici: String(al(s.alici) ?? "").trim() || null,
    });
  }
  sonuc.sort((a, b) => (a.cikis < b.cikis ? -1 : 1));
  return { satirlar: sonuc, hatalar, gemiler: Array.from(gemiler) };
}

/** "KURGU GEMI 2026-1/2026-1" icinde secili geminin adi geciyor mu (MV / M/V on eki atilir). */
export function gemiSeferUyar(gemiAdi: string, gemiSefer: string | null): boolean {
  if (!gemiSefer) return true;
  const j = duz(gemiAdi.replace(/^\s*(M\s*\/\s*V|MV|M\.V\.)\.?\s+/i, ""));
  return !!j && duz(gemiSefer).includes(j);
}
