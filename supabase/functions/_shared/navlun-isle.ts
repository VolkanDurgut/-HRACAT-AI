// Navlun Bildirimi: tek mailin kayda donusturulmesi (edge navlun-bildirimi kullanir; test edilebilir olsun diye ayri).
import { fiyatAdaylari, navlunMesajOku, acenteAdi, bizdenMi, konudanLiman, yeniKisim, type AcenteTablosu, type NavlunOlay } from "./navlun-oku.ts";
import { limanAnahtari } from "./liman-anahtari.ts";

const FIYATLI = new Set(["teklif", "karsi_teklif"]);
const ANLAMLI = new Set(["teklif", "karsi_teklif", "hedef", "kabul", "hedef_kabul", "hedef_soru", "servis_yok", "yer_yok"]);

/** Ekten (PDF / gorsel OCR) gelen fiyatlar: ekipman basina tek tutar olmali; degilse belirsiz -> elle. */
function ektenGuvenli(olaylar: NavlunOlay[], ekMetin: string): boolean {
  const fiyat = olaylar.filter((o) => FIYATLI.has(o.tur));
  if (!fiyat.length) return false;
  const limanSayisi = new Set(fiyat.map((o) => o.liman ?? "")).size;
  if (limanSayisi === 1) {
    const ham = new Map<string, Set<number>>();
    for (const a of fiyatAdaylari(ekMetin)) {
      if (!ham.has(a.ekipman)) ham.set(a.ekipman, new Set());
      ham.get(a.ekipman)!.add(a.tutar);
    }
    if ([...ham.values()].some((s) => s.size > 1)) return false;
  }
  const grup = new Map<string, Set<number>>();
  for (const o of fiyat) {
    const k = `${o.liman ?? ""}|${o.ekipman ?? ""}`;
    if (!grup.has(k)) grup.set(k, new Set());
    grup.get(k)!.add(o.tutar ?? 0);
  }
  return [...grup.values()].every((s) => s.size === 1);
}

export type NavlunGirdi = { mesaj_id: string; gonderen: string; konu: string; govde: string; tarih: string; ek_metin: string; ek_kaynak: string };

export function mesajIsle(g: NavlunGirdi, acenteler: AcenteTablosu) {
  const biz = bizdenMi(g.gonderen);
  const acente = biz ? null : acenteAdi(g.gonderen, acenteler);
  if (!biz && !acente) return null;                       // liman / terminal / bilinmeyen gonderen: navlun degil
  const liman = konudanLiman(g.konu);
  let olaylar = navlunMesajOku({ konu: g.konu, gonderen: g.gonderen, govde: g.govde }, acenteler);
  let kaynak: "metin" | "pdf" | "gorsel" = "metin";
  let durum: "okundu" | "bilgi" | "okunamadi";

  const metindeFiyat = olaylar.some((o) => FIYATLI.has(o.tur));
  const ekBekleniyor = olaylar.some((o) => o.tur === "ek_teklif");
  if (!biz && !metindeFiyat && g.ek_metin.trim()) {
    const ekten = navlunMesajOku({ konu: g.konu, gonderen: g.gonderen, govde: g.ek_metin }, acenteler)
      .filter((o) => FIYATLI.has(o.tur));
    if (ekten.length && ektenGuvenli(ekten, g.ek_metin)) {
      // metindeki free time / gecerlilik bilgisi ekten gelen fiyata tasinir
      const ekBilgi = olaylar.find((o) => o.tur === "ek_teklif");
      olaylar = [
        ...olaylar.filter((o) => o.tur !== "ek_teklif"),
        ...ekten.map((o) => ({ ...o, free_time_gun: o.free_time_gun ?? ekBilgi?.free_time_gun ?? null, gecerlilik: o.gecerlilik ?? ekBilgi?.gecerlilik ?? null, armator: o.armator ?? ekBilgi?.armator ?? null })),
      ];
      kaynak = g.ek_kaynak === "gorsel" ? "gorsel" : "pdf";
    } else if (ekten.length || ekBekleniyor) {
      kaynak = g.ek_kaynak === "gorsel" ? "gorsel" : "pdf";
      if (!olaylar.some((o) => o.tur === "ek_teklif")) olaylar.push({ tur: "ek_teklif", liman, tutar: null, ekipman: null, armator: null, free_time_gun: null, gecerlilik: null, lokal_dahil: null, pol: null });
    }
  }

  if (olaylar.some((o) => FIYATLI.has(o.tur))) durum = "okundu";
  else if (olaylar.some((o) => o.tur === "ek_teklif")) durum = "okunamadi";
  else if (olaylar.some((o) => ANLAMLI.has(o.tur))) durum = "okundu";
  else if (biz) return null;                              // bizden fiyatsiz yazisma (hatirlatma vb.): kaydetme
  else durum = "bilgi";

  return {
    mesaj_id: g.mesaj_id, konu: g.konu, gonderen: g.gonderen, acente, liman, liman_anahtar: limanAnahtari(liman),
    tarih: g.tarih, kaynak, durum,
    ozet: durum === "okunamadi" ? yeniKisim(g.govde).slice(0, 1500) : null,
    olaylar: olaylar.map((o) => ({ ...o, liman_anahtar: limanAnahtari(o.liman) })),
  };
}

