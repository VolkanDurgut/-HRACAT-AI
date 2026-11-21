/**
 * YUKLEME PLANI - REZERVASYON BEKLEYEN SIPARISLER paneli (21.11.2026). Saf hesap (veri / ag yok).
 * Test: tests/plan-bekleyen.test.ts.
 *
 * Kullanici: "On odeme alinan musteriler yukleme planinda ust kisimda belirtilmeli ve son alinan navlun fiyatlari ile
 * varis limanlari - transit sure ve free time bilgisi ile gosterilmeli. Ve yaninda ilgili proformaya rezervasyon
 * eklenebilmeli."
 *
 *  - Navlun: navlun_teklifleri (Navlun Bildirimi'nin okudugu acente teklifleri). Liman eslesmesi Kontrol Merkezi /
 *    Navlun haritasiyla ayni kural (limanAnahtari + es adlar + koordinat listesi). Acente basina EN SON teklif
 *    (20'DC onceligi), ucuzdan pahaliya.
 *  - Aksiyon (rezervasyon sistemde ihracat dosyasina eklenir):
 *      rezervasyonsuz acik dosya var  -> "Rezervasyon ekle"  (dosya > Rezervasyon > yeni)
 *      devam eden siparis takibi var  -> "Sevkiyat aç"       (Ihracatlar > Siparise Devam Et; sevkiyat secimi acilir)
 *      sistem proformasi var          -> "Dosya aç"          (Proforma Yukle ?otomatik=1; sonra rezervasyon)
 *      hicbiri (Excel'den gelen)      -> "Proforma yükle"
 */
import { limanAnahtari } from "@/lib/liman-anahtari";
import { limanKonumu } from "@/lib/liman-koordinat";

export type NavlunTeklifi = {
  tur: string;
  liman: string | null;
  liman_anahtar: string | null;
  acente: string | null;
  tutar: number | null;
  para_birimi: string | null;
  ekipman: string | null;
  free_time_gun: number | null;
  transit_gun: string | null;
  tarih: string;
};

export type LimanNavlunu = {
  acente: string;
  tutar: number;
  para: string;
  ekipman: string | null;
  freeTime: number | null;
  transit: string | null;
  tarih: string;
};

/** Navlun teklifinin ve plan varis limaninin ORTAK anahtari (koordinat listesindeki ad; yoksa sade anahtar). */
export function navlunLimanAnahtari(ad: string | null | undefined): string {
  const a = limanAnahtari(ad || "");
  if (!a) return "";
  return limanKonumu(a)?.anahtar || a;
}

/** Limanin son teklifleri: acente basina en son (20'DC once), ucuzdan pahaliya; en fazla `enFazla`. */
export function limanNavlunlari(teklifler: NavlunTeklifi[], varisLimani: string | null | undefined, enFazla = 3): LimanNavlunu[] {
  const hedef = navlunLimanAnahtari(varisLimani);
  if (!hedef) return [];
  const acenteBasina = new Map<string, NavlunTeklifi>();
  for (const t of teklifler) {
    if (t.tutar === null || !(t.tutar > 0) || !t.acente) continue;
    if (t.tur !== "teklif" && t.tur !== "karsi_teklif") continue;
    const k = navlunLimanAnahtari(t.liman_anahtar || t.liman);
    if (k !== hedef) continue;
    const a = t.acente.trim();
    const onceki = acenteBasina.get(a);
    const yirmi = (x: NavlunTeklifi) => ((x.ekipman || "").toUpperCase().startsWith("20") ? 1 : 0);
    if (!onceki || yirmi(t) > yirmi(onceki) || (yirmi(t) === yirmi(onceki) && t.tarih > onceki.tarih)) acenteBasina.set(a, t);
  }
  return Array.from(acenteBasina.entries())
    .map(([acente, t]) => ({ acente, tutar: t.tutar as number, para: t.para_birimi || "USD", ekipman: t.ekipman, freeTime: t.free_time_gun, transit: t.transit_gun, tarih: t.tarih }))
    .sort((x, y) => x.tutar - y.tutar || y.tarih.localeCompare(x.tarih))
    .slice(0, enFazla);
}

export type BekleyenDurum = {
  proforma_no: string;
  proforma_id: string | null;
  dosya: { id: string; dosya_no: string } | null;
  ana_siparis: { id: string; proforma_no: string } | null;
};

export type BekleyenAksiyon = { tur: "rezervasyon" | "sevkiyat" | "dosya_ac" | "proforma_yukle"; etiket: string; href: string; aciklama: string };

export function bekleyenAksiyonu(d: BekleyenDurum | undefined, proformaNo: string | null): BekleyenAksiyon {
  if (d?.dosya) {
    return { tur: "rezervasyon", etiket: "Rezervasyon ekle", href: `/dosya/${encodeURIComponent(d.dosya.id)}?tab=rezervasyon&action=new`,
      aciklama: `${d.dosya.dosya_no} açık, rezervasyonu yok` };
  }
  if (d?.ana_siparis) {
    return { tur: "sevkiyat", etiket: "Sevkiyat aç", href: `/ihracatlar?siparis=${encodeURIComponent(d.ana_siparis.proforma_no)}`,
      aciklama: "Sipariş takibinde; sıradaki sevkiyatın dosyası açılır" };
  }
  if (d?.proforma_id) {
    return { tur: "dosya_ac", etiket: "Dosya aç", href: `/yeni-dosya?proforma=${encodeURIComponent(d.proforma_id)}&otomatik=1`,
      aciklama: "Proforma sistemde; dosya açılınca rezervasyon eklenir" };
  }
  return { tur: "proforma_yukle", etiket: "Proforma yükle", href: "/yeni-dosya",
    aciklama: proformaNo ? `${proformaNo} sistemde yok (Excel'den); PDF'i yükleyip dosya açın` : "Proforma PDF'ini yükleyip dosya açın" };
}

const trTarih = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** Kisa navlun metni (Excel / ipucu): "Horoz 2.450 USD 20DC · FT 14 · 45 gün · 20.11" */
export function navlunMetni(n: LimanNavlunu): string {
  return [`${n.acente} ${n.tutar.toLocaleString("tr-TR")} ${n.para}${n.ekipman ? ` ${n.ekipman}` : ""}`,
    n.freeTime !== null ? `FT ${n.freeTime}` : null, n.transit ? `${n.transit} gün` : null, n.tarih ? trTarih(n.tarih) : null].filter(Boolean).join(" · ");
}
