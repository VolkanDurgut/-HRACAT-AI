/**
 * SIPARISSIZ MUSTERI RAPORU - hesap + HTML + Excel (23.11.2026). Edge: siparissiz-musteri-rapor. SAF: veri yok, ag yok.
 * Kullanici: "Mevcut pazar icin siparisi olmayan musterilerimizin ihracattaki export arkadasimiza mail olarak iletilmesi
 * gerekiyor." Haftalik ozet, Harun Bey (export@). Veri: pazar_siparissiz_ozet (Pazar sekmesindeki "Siparissiz" ile ayni kural,
 * ritim lib/pazar/siparis-ritmi.ts ile ayni hesap: pazar_siparis_ritmi).
 * Gruplar (aksiyona gore):
 *   hemen     ritmi bozulan (gecikti / siparis zamani geldi): once bunlar aranmali
 *   yaklasan  ritmine gore siparis zamani yaklasan / henuz erken
 *   ikinci    1-2 sevkiyati olan (ritim cikmiyor): ikinci / tekrar siparis gorusmesi
 *   kayit     sevkiyat kaydi yok: musteri karti / eslesme dogrulanmali
 * Iletisim bilgisi (e-posta / telefon) olmayan musteri gunluk gorev sistemine GIREMEZ: mailde ayrica isaretlenir.
 */
import { esc, raporKabugu, sikiTablo, RAPOR_LACIVERT } from "./rapor-kabugu.ts";
import { XS, type XlsxHucre, type XlsxSayfa } from "./xlsx-yaz.ts";

export type RitimDurumu = "gecikti" | "zamani_geldi" | "yaklasiyor" | "erken" | "veri_az";
export type SiparissizGorev = { tarih: string | null; durum: string | null; neden: string | null; atanan: string | null; hitap: string | null };
export type SiparissizMusteri = {
  id: string; ad: string; ulke: string | null; durum: RitimDurumu; fark: number | null; ritimGun: number | null; dalga: number;
  sonEtd: string | null; ortKonteyner: number | null; beklenenSiparis: string | null; sonSiparis: string | null; liman: string | null;
  toplamKonteyner: number; eposta: boolean; telefon: boolean; crmAsama: string | null; bekleme: string | null; sonTemas: string | null;
  gorev: SiparissizGorev | null;
};
export type SiparissizVeri = { bugun: string; toplam: number; aktif: number; musteriler: SiparissizMusteri[] };
export type Grup = "hemen" | "yaklasan" | "ikinci" | "kayit";

export const GRUP_BASLIK: Record<Grup, string> = {
  hemen: "Hemen aranacak · sipariş ritmi bozuldu",
  yaklasan: "Sırası yaklaşan",
  ikinci: "İkinci sipariş fırsatı · 1-2 sevkiyatı olan",
  kayit: "Kaydı doğrulanmalı · sevkiyat kaydı yok",
};
const GRUP_SIRA: Grup[] = ["hemen", "yaklasan", "ikinci", "kayit"];
const DURUMLAR = new Set<RitimDurumu>(["gecikti", "zamani_geldi", "yaklasiyor", "erken", "veri_az"]);

const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const sayi = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const gun = (v: unknown) => { const m = typeof v === "string" ? v.match(/^\d{4}-\d{2}-\d{2}/) : null; return m ? m[0] : null; };

export function siparissizVeriHazirla(ham: unknown): SiparissizVeri {
  const v = (ham || {}) as Record<string, unknown>;
  const liste = Array.isArray(v.musteriler) ? v.musteriler : [];
  const musteriler = liste.map((x) => {
    const r = (x || {}) as Record<string, unknown>;
    const ad = metin(r.ad);
    const id = metin(r.id);
    if (!ad || !id) return null;
    const g = r.gorev && typeof r.gorev === "object" ? (r.gorev as Record<string, unknown>) : null;
    const durum = DURUMLAR.has(r.durum as RitimDurumu) ? (r.durum as RitimDurumu) : "veri_az";
    return {
      id, ad, ulke: metin(r.ulke), durum, fark: sayi(r.fark), ritimGun: sayi(r.ritim_gun), dalga: sayi(r.dalga) ?? 0,
      sonEtd: gun(r.son_etd), ortKonteyner: sayi(r.ort_konteyner), beklenenSiparis: gun(r.beklenen_siparis), sonSiparis: gun(r.son_siparis),
      liman: metin(r.liman), toplamKonteyner: sayi(r.toplam_konteyner) ?? 0, eposta: r.eposta === true, telefon: r.telefon === true,
      crmAsama: metin(r.crm_asama), bekleme: gun(r.bekleme_bitis), sonTemas: gun(r.son_temas),
      gorev: g ? { tarih: gun(g.tarih), durum: metin(g.durum), neden: metin(g.neden), atanan: metin(g.atanan), hitap: metin(g.hitap) } : null,
    } as SiparissizMusteri;
  }).filter((x): x is SiparissizMusteri => x !== null);
  return { bugun: gun(v.bugun) || "", toplam: sayi(v.toplam) ?? 0, aktif: sayi(v.aktif) ?? 0, musteriler };
}

export function grubu(m: SiparissizMusteri): Grup {
  if (m.durum === "gecikti" || m.durum === "zamani_geldi") return "hemen";
  if (m.durum === "yaklasiyor" || m.durum === "erken") return "yaklasan";
  return m.dalga > 0 || m.toplamKonteyner > 0 ? "ikinci" : "kayit";
}

/** Grup icinde: hemen -> en cok geciken once; yaklasan -> en yakin; digerleri -> en son sevkiyat once. */
export function grupla(v: SiparissizVeri): { grup: Grup; musteriler: SiparissizMusteri[] }[] {
  return GRUP_SIRA.map((grup) => ({
    grup,
    musteriler: v.musteriler.filter((m) => grubu(m) === grup).sort((a, b) =>
      grup === "hemen" || grup === "yaklasan" ? (b.fark ?? -9999) - (a.fark ?? -9999) || a.ad.localeCompare(b.ad, "tr")
        : (b.sonEtd || "").localeCompare(a.sonEtd || "") || a.ad.localeCompare(b.ad, "tr")),
  })).filter((g) => g.musteriler.length > 0);
}

export const iletisimYok = (m: SiparissizMusteri) => !m.eposta && !m.telefon;

export type SiparissizOzet = { toplam: number; aktif: number; siparissiz: number; hemen: number; iletisimYok: number; gorevde: number };
export function siparissizOzet(v: SiparissizVeri): SiparissizOzet {
  return {
    toplam: v.toplam, aktif: v.aktif, siparissiz: v.musteriler.length,
    hemen: v.musteriler.filter((m) => grubu(m) === "hemen").length,
    iletisimYok: v.musteriler.filter(iletisimYok).length,
    gorevde: v.musteriler.filter((m) => m.gorev?.durum === "bekliyor").length,
  };
}

const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const kisaTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "-");
const yuzde = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** "54 gün gecikti" / "Sipariş zamanı" / "12 gün sonra" / "1 sevkiyat" / "Kayıt yok" */
export function durumMetni(m: SiparissizMusteri): string {
  if (m.durum === "gecikti") return `${m.fark ?? "?"} gün gecikti`;
  if (m.durum === "zamani_geldi") return "Sipariş zamanı geldi";
  if (m.durum === "yaklasiyor" || m.durum === "erken") return m.fark !== null ? `${Math.abs(m.fark)} gün sonra` : "Yaklaşıyor";
  if (m.dalga > 0) return `${m.dalga} sevkiyat (ritim yok)`;
  return "Sevkiyat kaydı yok";
}

const GOREV_DURUM: Record<string, string> = { bekliyor: "bekliyor", yapildi: "yapıldı", atlandi: "atlandı" };
export function gorevMetni(m: SiparissizMusteri): string {
  const g = m.gorev;
  if (!g?.tarih) return "";
  return [g.hitap || g.atanan || "", kisaTarih(g.tarih), g.durum ? GOREV_DURUM[g.durum] || g.durum : ""].filter(Boolean).join(" · ");
}

export function siparissizKonusu(v: SiparissizVeri): string {
  const o = siparissizOzet(v);
  const tarih = trTarih(v.bugun);
  if (!o.siparissiz) return `Siparişsiz Müşteri Raporu · ${tarih} · Bütün müşterilerimizin aktif siparişi var`;
  return `Siparişsiz Müşteri Raporu · ${tarih} · ${o.siparissiz} müşteri${o.hemen ? ` · ${o.hemen} hemen aranacak` : ""}`;
}

export function siparissizHtml(v: SiparissizVeri, sirketAdi = "Unex Gıda"): string {
  const o = siparissizOzet(v);
  const maddeler = [
    `Aktif müşteri: <b>${o.aktif} / ${o.toplam}</b> (%${yuzde(o.aktif, o.toplam)}). Siparişsiz: <b>${o.siparissiz}</b> müşteri (açık siparişi, yolda ya da yüklemede malı yok).`,
    o.hemen ? `<b>${o.hemen}</b> müşterinin sipariş ritmi bozuldu: normal sipariş aralığı geçti, <b>önce bunlar aranmalı</b>.` : "Sipariş ritmi bozulan müşteri yok.",
    o.iletisimYok ? `<b>${o.iletisimYok}</b> müşterinin Pazar kartında e-posta / telefon yok: bu yüzden günlük görev mailine düşmüyor. Kartına iletişim eklenince görev sistemine girer.` : "Bütün siparişsiz müşterilerin iletişim bilgisi var.",
    o.gorevde ? `<b>${o.gorevde}</b> müşterinin görevi açık (yapıldı / atlandı işaretlenmemiş).` : "",
  ].filter(Boolean);
  const bolumler = grupla(v).map(({ grup, musteriler }) => sikiTablo(
    [{ ad: "Müşteri" }, { ad: "Liman" }, { ad: "Son sevkiyat" }, { ad: "Ort. kont.", sag: true }, { ad: "Durum" }, { ad: "İletişim" }, { ad: "Son görev" }],
    musteriler.map((m) => [
      `<b>${esc(m.ad.length > 34 ? `${m.ad.slice(0, 33)}…` : m.ad)}</b>`,
      esc(m.liman || "-"),
      esc(kisaTarih(m.sonEtd)),
      esc(m.ortKonteyner !== null ? String(m.ortKonteyner).replace(".", ",") : "-"),
      grup === "hemen" ? `<span style="color:#B91C1C;font-weight:bold">${esc(durumMetni(m))}</span>${m.ritimGun ? `<span style="color:#94A3B8"> · ${m.ritimGun} günde bir</span>` : ""}` : esc(durumMetni(m)),
      iletisimYok(m) ? `<span style="color:#B91C1C;font-weight:bold">Yok · ekleyin</span>` : esc([m.eposta ? "E-posta" : "", m.telefon ? "Tel" : ""].filter(Boolean).join(" + ")),
      esc(gorevMetni(m) || "-"),
    ]),
    `${esc(GRUP_BASLIK[grup])} (${musteriler.length})`,
  )).join("");
  return raporKabugu({
    sirketAdi, baslik: "Siparişsiz Müşteri Raporu", tarih: trTarih(v.bugun), oturum: "Haftalık",
    ozetAlt: "Pazar sekmesi ve Yükleme Planı'na göre (açık dosya, açık sipariş, yolda / yüklemede mal)",
    maddeler,
    ekBolum: bolumler || `<div style="margin-top:14px;font-size:13px;color:${RAPOR_LACIVERT}">Bütün müşterilerimizin aktif siparişi var.</div>`,
    dugme: { metin: "Pazar'da aç", yol: "/pazar" },
    dipnot: "Ritim: müşterinin geçmiş sevkiyatları arasındaki ortanca süre; beklenen sipariş = son sevkiyat + ritim - tedarik süresi. Tüm alanlar ekteki Excel'de.",
  });
}

const CRM: Record<string, string> = {
  yeni: "Yeni", sorgulandi: "Soruldu", hatirlatma1: "1. hatırlatma", hatirlatma2: "2. hatırlatma", cevap: "Cevap verdi",
  teklif: "Teklif", siparis: "Sipariş", sessiz: "Sessiz", ilgilenmiyor: "İlgilenmiyor",
};

export const SIPARISSIZ_BASLIK = ["Grup", "Müşteri", "Ülke", "Liman", "Durum", "Gecikme (gün)", "Ritim (gün)", "Son sevkiyat", "Beklenen sipariş",
  "Ort. konteyner", "Toplam konteyner", "Son sipariş", "E-posta", "Telefon", "CRM aşaması", "Son temas", "Son görev"];

const tarihHucre = (iso: string | null): XlsxHucre => ({ v: iso ? new Date(`${iso}T12:00:00`) : null, s: XS.tarih });

export function siparissizSayfasi(v: SiparissizVeri, ad = "Siparişsiz Müşteriler"): XlsxSayfa {
  const satirlar: (XlsxHucre | null)[][] = [SIPARISSIZ_BASLIK.map((b) => ({ v: b, s: XS.tabloBaslik }))];
  for (const { grup, musteriler } of grupla(v)) {
    for (const m of musteriler) {
      const t = (x: string | null | undefined) => ({ v: x ?? "", s: XS.metin });
      satirlar.push([
        t(GRUP_BASLIK[grup].split(" · ")[0]), t(m.ad), t(m.ulke), t(m.liman), t(durumMetni(m)),
        { v: m.durum === "gecikti" || m.durum === "zamani_geldi" ? m.fark : null, s: XS.tamSayi },
        { v: m.ritimGun, s: XS.tamSayi }, tarihHucre(m.sonEtd), tarihHucre(m.beklenenSiparis),
        { v: m.ortKonteyner, s: XS.ondalik }, { v: m.toplamKonteyner, s: XS.tamSayi }, tarihHucre(m.sonSiparis),
        t(m.eposta ? "Var" : "Yok"), t(m.telefon ? "Var" : "Yok"), t(m.crmAsama ? CRM[m.crmAsama] || m.crmAsama : ""),
        tarihHucre(m.sonTemas), t(gorevMetni(m)),
      ]);
    }
  }
  if (satirlar.length === 1) satirlar.push([{ v: "Bütün müşterilerimizin aktif siparişi var.", s: XS.not }]);
  return {
    ad, satirlar, sutunGenislik: [16, 34, 14, 16, 22, 10, 9, 12, 13, 10, 10, 12, 9, 9, 14, 12, 24],
    dondur: "C2", filtre: `A1:Q${satirlar.length}`, yazdirBaslik: "1:1",
  };
}
