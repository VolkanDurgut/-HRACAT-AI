// Navlun Bildirimi: tek mailin kayda donusturulmesi (edge navlun-bildirimi kullanir; test edilebilir olsun diye ayri).
import { armatorAdi, ekFormuOku, fiyatAdaylari, navlunMesajOku, acenteAdi, bizdenMi, konudanLiman, yeniKisim, type AcenteTablosu, type NavlunOlay } from "./navlun-oku.ts";
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
  // Ek yalniz mail metni "teklif ekte / asagidaki gibidir" diyorsa okunur (foy, booking onayi vb. ekler fiyat degil)
  if (!biz && !metindeFiyat && ekBekleniyor && g.ek_metin.trim()) {
    kaynak = g.ek_kaynak === "gorsel" ? "gorsel" : "pdf";
    // Once bilinen teklif formu (K+N, Link...): yerlesim sabit, belirsizlik yok. Taninmazsa genel siki okuma.
    const formdan = ekFormuOku(g.ek_metin, g.konu);
    const ekten = formdan ?? navlunMesajOku({ konu: g.konu, gonderen: g.gonderen, govde: g.ek_metin }, acenteler, { ek: true })
      .filter((o) => FIYATLI.has(o.tur));
    if (ekten.length && (formdan || ektenGuvenli(ekten, g.ek_metin))) {
      // metindeki free time / gecerlilik bilgisi ekten gelen fiyata tasinir
      const ekBilgi = olaylar.find((o) => o.tur === "ek_teklif");
      olaylar = [
        ...olaylar.filter((o) => o.tur !== "ek_teklif"),
        ...ekten.map((o) => ({ ...o, free_time_gun: o.free_time_gun ?? ekBilgi?.free_time_gun ?? null, gecerlilik: o.gecerlilik ?? ekBilgi?.gecerlilik ?? null, armator: o.armator ?? ekBilgi?.armator ?? null })),
      ];
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
    // Ekten okunan / okunamayan teklifte ek metni de saklanir (denetim + hata kuyrugunda gosterim)
    ozet: durum === "okunamadi" || kaynak !== "metin"
      ? (yeniKisim(g.govde).slice(0, 600) + (g.ek_metin.trim() ? "\n--- EK ---\n" + g.ek_metin.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim() : "")).slice(0, 2000)
      : null,
    olaylar: olaylar.map((o) => ({ ...o, liman_anahtar: limanAnahtari(o.liman) })),
  };
}


// ---------------------------------------------------------------------------
// Yeni acente ogrenme: tabloda olmayan bir alan adindan "NAVLUN TALEBI" konulu mail gelir ve
// icerik acikca navlun teklifi gibi okunursa (fiyat / teklif ekte / servis yok / hedef sorusu)
// alan adi acente olarak eklenir. Kisisel posta, bizim alan ve booking yazismalari ogrenilmez.
// ---------------------------------------------------------------------------
const KISISEL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|yandex|icloud|me|msn|aol|mail|proton(?:mail)?)\./i;
const OGRENILIR = new Set(["teklif", "karsi_teklif", "ek_teklif", "servis_yok", "hedef_soru"]);

/** Alan adindan gorunen acente adi: bilinen armator adi ("oocl.com" -> OOCL), yoksa ilk etiket buyuk harfle. */
export function alandanAd(alan: string): string {
  const etiket = alan.split(".")[0] || alan;
  // "coscoshipping" -> "cosco shipping", "akkonlines" -> "akkon lines"
  const ayrik = etiket.replace(/[-_]/g, " ").replace(/(shipping|lines?|container|logistics|denizcilik)$/i, " $1");
  return armatorAdi(ayrik) ?? etiket.charAt(0).toUpperCase() + etiket.slice(1);
}

export function acenteOgren(g: NavlunGirdi, acenteler: AcenteTablosu): { alan: string; ad: string; kayit: NonNullable<ReturnType<typeof mesajIsle>> } | null {
  if (bizdenMi(g.gonderen) || acenteAdi(g.gonderen, acenteler)) return null;
  const alan = (g.gonderen.split("@")[1] || "").toLowerCase().trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(alan) || KISISEL.test(alan) || /ihracatasistanim/.test(alan)) return null;
  if (!/NAVLUN\s*TALEB|NAVLUN\s*TAELB/i.test(buyukHarf(g.konu))) return null;
  const ad = alandanAd(alan);
  const kayit = mesajIsle(g, { ...acenteler, [alan]: ad });
  if (!kayit || !kayit.olaylar.some((o) => OGRENILIR.has(o.tur))) return null;
  return { alan, ad, kayit };
}

function buyukHarf(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase().replace(/İ/g, "I");
}
