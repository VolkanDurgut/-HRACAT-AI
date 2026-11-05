/**
 * GUNLUK IC PIYASA RAPORU (04.11.2026). SAF: ag / veritabani yok - edge function ic-gunluk-rapor
 * veriyi getirir; burada yalniz hesap + HTML uretilir (Node ile test edilir).
 * Kullanici: "Gunluk ihracat raporu gibi gunluk ic piyasa raporu olusturulmasini istiyorum. Bugun
 * yuklenenler ve bugun gelenler seklinde olabilir." + siparis kapanis e-postasi kaldirildi; bugun
 * kapanan siparisler bu raporda.
 * Gorunum ihracat gunluk raporu / kapanis raporuyla AYNI dil (logo, lacivert #283474 + seftali
 * #F4A07C, ozet kutulari, lacivert tablo basliklari, tablo tabanli + satir ici stil).
 * Yuklenen = arac toplami + siparisler arasi devir (is emirleri / kantar ile ayni kural).
 * Kalan / fazla / kapanis sonucu TEK YERDE: mesaj-sablonlari.ts (kalanMetni, teslimFarki).
 * FIYAT YOK (sirket ici ekip raporu; fiyat ayri yetki). Musteriye GITMEZ.
 * 04.11.2026 aksam: gunde 3 kez (ihracat raporuyla ayni duzen, 15 dk sonra): SABAH 09:15 = DUNUN raporu,
 * OGLE 12:15 ve AKSAM 17:15 = bugunun (o ana kadar). Kullanici: "Bundan sonraki gunlerde sabah ogle aksam".
 */
import { SITE_ADRESI, kalanMetni, teslimFarki } from "./mesaj-sablonlari.ts";

export type RaporIsEmri = {
  id: string; is_emri_no: string; durum: string; urun: string; ambalaj: string | null; teslim: string | null;
  hedef_tur: "kg" | "arac"; hedef_kg: number | string | null; hedef_arac: number | null;
  devir_kg?: number | string | null; kapanis_zamani: string | null; olusturma: string;
  musteri: string; musteri_kisa: string | null;
};
export type RaporSevk = {
  id: string; is_emri_id: string; plaka: string; dorse_plaka: string | null; net_kg: number | string;
  irsaliye_no: string | null; irsaliye_tarihi: string | null; olusturma: string;
  cikis_durumu: string | null; cikis_zamani: string | null; gecmis?: boolean | null;
  /** 06.11.2026: varsa raporda "İrsaliye İncele" baglantisi (belge adresi maile YAZILMAZ). */
  irsaliye_dosya_yolu?: string | null;
};
export type RaporAlis = {
  id: string; alis_no: string; durum: string; urun: string; depo: string | null; miktar_kg: number | string;
  tedarikci: string; tedarikci_kisa: string | null; kapanis_zamani: string | null;
};
export type RaporTeslim = {
  id: string; alis_id: string; plaka: string | null; dorse_plaka: string | null; net_kg: number | string;
  teslim_zamani: string | null; irsaliye_no: string | null; irsaliye_tarihi: string | null; olusturma: string;
  sevk_id: string | null; gecmis?: boolean | null;
  irsaliye_dosya_yolu?: string | null;
};

/**
 * Irsaliye No hucresi (06.11.2026, kullanici: "irsaliye numarasinda 'İrsaliye İncele' ile irsaliyeyi
 * gosterebilmeliyiz"): numara + uygulamadaki /belge/irsaliye sayfasina baglanti (giris gerekir; belge
 * adresi maile yazilmaz). sorgu: "s=<sevk id>" | "a=<alis teslim id>"; belge yoksa yalniz numara.
 */
export function irsaliyeHucresi(no: string | null, sorgu: string | null): string {
  const numara = `<span style="font-family:monospace;font-size:11px">${esc(no || "-")}</span>`;
  if (!sorgu || !/^[sa]=[0-9a-f-]{36}$/i.test(sorgu)) return numara;
  return `${numara}<br><a href="${SITE_ADRESI}/belge/irsaliye?${sorgu}" style="display:inline-block;margin-top:3px;font-size:11px;font-weight:bold;color:#1D4ED8;text-decoration:none;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:3px;padding:1px 6px;white-space:nowrap">İrsaliye İncele &rsaquo;</a>`;
}

/** ISO -> Turkiye takvim gunu "YYYY-MM-DD" */
export function trGun(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}
export const trBugun = (simdi = new Date()) => simdi.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const n = (x: unknown) => Number(x || 0);
const yuvarla = (x: number) => Math.round(x * 100) / 100;
/** Satis araci hangi gun yuklendi: irsaliye tarihi, yoksa kantar kaydi. */
export const sevkGunu = (s: Pick<RaporSevk, "irsaliye_tarihi" | "olusturma">) => trGun(s.irsaliye_tarihi || s.olusturma);
/** Alis araci hangi gun geldi: teslim zamani, yoksa irsaliye, yoksa kayit. */
export const teslimGunu = (t: Pick<RaporTeslim, "teslim_zamani" | "irsaliye_tarihi" | "olusturma">) => trGun(t.teslim_zamani || t.irsaliye_tarihi || t.olusturma);

export type IcGunlukRapor = {
  tarih: string;
  yuklenen: { sevk: RaporSevk; emir: RaporIsEmri | null }[];
  gelen: { teslim: RaporTeslim; alis: RaporAlis | null; dogrudanIsEmri: string | null }[];
  acikSatis: { emir: RaporIsEmri; yuklenenKg: number; devirKg: number; arac: number; bugunArac: number; kalan: { metin: string; durum: "kalan" | "fazla" | "tamam" } }[];
  acikAlis: { alis: RaporAlis; alinanKg: number; arac: number; bugunArac: number; kalanKg: number }[];
  kapanan: { emir: RaporIsEmri; yuklenenKg: number; arac: number; sonuc: "tam" | "eksik" | "fazla"; metin: string }[];
  ozet: {
    yuklenenArac: number; yuklenenKg: number; gelenArac: number; gelenKg: number;
    acikSatis: number; acikSatisKalanKg: number; acikAlis: number; acikAlisKalanKg: number; kapanan: number;
  };
};

export function icGunlukRaporHesapla(tarih: string, emirler: RaporIsEmri[], sevkler: RaporSevk[], alislar: RaporAlis[], teslimler: RaporTeslim[]): IcGunlukRapor {
  const emirMap = new Map(emirler.map((e) => [e.id, e]));
  const alisMap = new Map(alislar.map((a) => [a.id, a]));
  const sevkMap = new Map(sevkler.map((s) => [s.id, s]));
  const emirSevk = new Map<string, RaporSevk[]>();
  sevkler.forEach((s) => emirSevk.set(s.is_emri_id, [...(emirSevk.get(s.is_emri_id) || []), s]));
  const alisTeslim = new Map<string, RaporTeslim[]>();
  teslimler.forEach((t) => alisTeslim.set(t.alis_id, [...(alisTeslim.get(t.alis_id) || []), t]));
  const emirKg = (e: RaporIsEmri) => yuvarla((emirSevk.get(e.id) || []).reduce((t, s) => t + n(s.net_kg), 0) + n(e.devir_kg));
  const zaman = (s: RaporSevk) => s.irsaliye_tarihi || s.olusturma;

  const yuklenen = sevkler.filter((s) => sevkGunu(s) === tarih)
    .sort((a, b) => zaman(a).localeCompare(zaman(b)))
    .map((s) => ({ sevk: s, emir: emirMap.get(s.is_emri_id) || null }));
  const tz = (t: RaporTeslim) => t.teslim_zamani || t.irsaliye_tarihi || t.olusturma;
  const gelen = teslimler.filter((t) => teslimGunu(t) === tarih)
    .sort((a, b) => tz(a).localeCompare(tz(b)))
    .map((t) => {
      const s = t.sevk_id ? sevkMap.get(t.sevk_id) : undefined;
      return { teslim: t, alis: alisMap.get(t.alis_id) || null, dogrudanIsEmri: s ? emirMap.get(s.is_emri_id)?.is_emri_no ?? null : (t.sevk_id ? "satış" : null) };
    });

  const acikSatis = emirler.filter((e) => e.durum === "acik").map((e) => {
    const ss = emirSevk.get(e.id) || [];
    const kg = emirKg(e);
    const hedef = e.hedef_tur === "kg" ? n(e.hedef_kg) : n(e.hedef_arac);
    return { emir: e, yuklenenKg: kg, devirKg: n(e.devir_kg), arac: ss.length, bugunArac: ss.filter((s) => sevkGunu(s) === tarih).length, kalan: kalanMetni(e.hedef_tur, hedef, kg, ss.length) };
  }).sort((a, b) => b.bugunArac - a.bugunArac || a.emir.is_emri_no.localeCompare(b.emir.is_emri_no));

  const acikAlis = alislar.filter((a) => a.durum === "acik").map((a) => {
    const tt = alisTeslim.get(a.id) || [];
    const kg = yuvarla(tt.reduce((t, x) => t + n(x.net_kg), 0));
    return { alis: a, alinanKg: kg, arac: tt.filter((x) => !x.gecmis).length, bugunArac: tt.filter((x) => teslimGunu(x) === tarih).length, kalanKg: yuvarla(n(a.miktar_kg) - kg) };
  }).sort((a, b) => b.bugunArac - a.bugunArac || a.alis.alis_no.localeCompare(b.alis.alis_no));

  const kapanan = emirler.filter((e) => e.durum === "tamamlandi" && trGun(e.kapanis_zamani) === tarih).map((e) => {
    const ss = emirSevk.get(e.id) || [];
    const kg = emirKg(e);
    const f = teslimFarki(e.hedef_tur, e.hedef_tur === "kg" ? n(e.hedef_kg) : n(e.hedef_arac), kg, ss.length);
    return { emir: e, yuklenenKg: kg, arac: ss.length, sonuc: f.sonuc, metin: f.metin };
  });

  return {
    tarih, yuklenen, gelen, acikSatis, acikAlis, kapanan,
    ozet: {
      yuklenenArac: yuklenen.length, yuklenenKg: yuvarla(yuklenen.reduce((t, x) => t + n(x.sevk.net_kg), 0)),
      gelenArac: gelen.length, gelenKg: yuvarla(gelen.reduce((t, x) => t + n(x.teslim.net_kg), 0)),
      acikSatis: acikSatis.length,
      acikSatisKalanKg: yuvarla(acikSatis.filter((x) => x.emir.hedef_tur === "kg").reduce((t, x) => t + Math.max(0, n(x.emir.hedef_kg) - x.yuklenenKg), 0)),
      acikAlis: acikAlis.length, acikAlisKalanKg: yuvarla(acikAlis.reduce((t, x) => t + Math.max(0, x.kalanKg), 0)),
      kapanan: kapanan.length,
    },
  };
}

// ---------------------------------------------------------------- gorunum
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
export const IC_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (x: number, en = 0) => x.toLocaleString("tr-TR", { maximumFractionDigits: en });
const ton = (kg: number) => `${sayi(kg / 1000, 3)} ton`;
const saat = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
};
export const tarihTR = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;
const musteriAdi = (e: RaporIsEmri | null) => (e ? (e.musteri_kisa || "").trim() || e.musteri : "-");
const urunAdi = (u: string, ambalaj?: string | null) => `${u}${ambalaj ? ` (${ambalaj})` : ""}`;

export type IcRaporOturumu = "sabah" | "ogle" | "aksam";
export const IC_RAPOR_OTURUMLARI: IcRaporOturumu[] = ["sabah", "ogle", "aksam"];
/** Turkiye saati (saat, dakika). Ihracat raporu 09:00 / 12:00 / 17:00 -> ic piyasa 15 dk sonra. */
export const IC_RAPOR_SAATI: Record<IcRaporOturumu, [number, number]> = { sabah: [9, 15], ogle: [12, 15], aksam: [17, 15] };
const OTURUM_AD: Record<IcRaporOturumu, string> = { sabah: "Sabah", ogle: "Öğle", aksam: "Akşam" };
export const icRaporSaatYazi = (o: IcRaporOturumu) => `${String(IC_RAPOR_SAATI[o][0]).padStart(2, "0")}:${String(IC_RAPOR_SAATI[o][1]).padStart(2, "0")}`;
/** Sabah raporu DUNU anlatir ("Dün"); ogle / aksam bugunu. */
const gunAdi = (o: IcRaporOturumu) => (o === "sabah" ? "Dün" : "Bugün");

export function icGunlukRaporKonusu(r: IcGunlukRapor, sirketAdi = "Unex Gıda", oturum: IcRaporOturumu = "aksam"): string {
  const o = r.ozet;
  const parcalar = [`Yüklenen ${o.yuklenenArac} araç · ${ton(o.yuklenenKg)}`, `Gelen ${o.gelenArac} araç · ${ton(o.gelenKg)}`];
  if (o.kapanan) parcalar.push(`${o.kapanan} sipariş kapandı`);
  return `${sirketAdi} İç Piyasa Raporu — ${tarihTR(r.tarih)} ${oturum === "sabah" ? "(Dün)" : OTURUM_AD[oturum]} | ${parcalar.join(" | ")}`;
}

const CIKIS: Record<string, [string, string]> = {
  cikti: ["Yola çıktı", "#047857"],
  bugun_degil: ["Bugün çıkmayacak", "#B45309"],
};

export function icGunlukRaporHtml(r: IcGunlukRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString(), oturum: IcRaporOturumu = "aksam"): string {
  const G = gunAdi(oturum);
  const g = G === "Dün" ? "dün" : "bugün";
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold;white-space:nowrap">${t}</th>`;
  const td = (t: string, st = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${t}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, renk: string) =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.4">${alt}</div></td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolum = (t: string, sag = "") => `<div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${t}${sag ? `<span style="float:right;font-weight:normal;text-transform:none;letter-spacing:0;color:#64748B">${sag}</span>` : ""}</div>`;
  const bos = (cols: number, metin: string) => `<tr><td colspan="${cols}" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px;border-bottom:1px solid #E2E8F0">${metin}</td></tr>`;
  const toplam = (cols: number, etiket: string, deger: string) => `<tr><td colspan="${cols - 1}" style="padding:8px;font-size:11px;font-weight:bold;color:#475569;border-top:2px solid #CBD5E1">${etiket}</td><td style="padding:8px;font-size:11px;font-weight:bold;text-align:right;border-top:2px solid #CBD5E1;white-space:nowrap">${deger}</td></tr>`;
  const tablo = (baslik: string, govde: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${baslik}</tr>${govde}</table>`;
  const o = r.ozet;

  // Ozet kutulari
  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu(`${G} Yüklenen`, `${o.yuklenenArac} araç`, `${ton(o.yuklenenKg)} · satış`, "#047857")}${arasi}
    ${kutu(`${G} Gelen`, `${o.gelenArac} araç`, `${ton(o.gelenKg)} · alış`, LACIVERT)}${arasi}
    ${kutu("Açık Satış", `${o.acikSatis} sipariş`, `kalan ${ton(o.acikSatisKalanKg)}`, "#B45309")}${arasi}
    ${kutu("Açık Alış", `${o.acikAlis} sipariş`, `teslim alınacak ${ton(o.acikAlisKalanKg)}`, "#475569")}
  </tr></table>`;

  // Bugun yuklenenler (satis)
  const yRows = r.yuklenen.map(({ sevk: s, emir: e }, i) => {
    const c = s.cikis_durumu ? CIKIS[s.cikis_durumu] : undefined;
    const durum = c ? `<span style="color:${c[1]};font-weight:bold">${c[0]}</span>${s.cikis_durumu === "cikti" && s.cikis_zamani ? ` <span style="color:#94A3B8">${saat(s.cikis_zamani)}</span>` : ""}` : `<span style="color:#64748B">Çıkış bekliyor</span>`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(saat(s.irsaliye_tarihi || s.olusturma), "color:#64748B;white-space:nowrap")}${td(`<b>${esc(musteriAdi(e))}</b><br><span style="color:#64748B;font-size:11px">${esc(e?.is_emri_no || "-")} · ${esc(e ? urunAdi(e.urun, e.ambalaj) : "-")}</span>`)}${td(`<b>${esc(s.plaka)}</b>${s.dorse_plaka ? `<br><span style="color:#64748B;font-size:11px">Dorse ${esc(s.dorse_plaka)}</span>` : ""}`, "white-space:nowrap")}${td(irsaliyeHucresi(s.irsaliye_no, s.irsaliye_dosya_yolu ? `s=${s.id}` : null))}${td(durum, "font-size:11px;white-space:nowrap")}${td(sayi(n(s.net_kg)), "text-align:right;font-weight:bold;white-space:nowrap")}</tr>`;
  }).join("");
  const yTablo = tablo(`${th("Saat")}${th("Müşteri · Sipariş")}${th("Plaka")}${th("İrsaliye No")}${th("Durum")}${th("Net (kg)", true)}`,
    r.yuklenen.length ? yRows + toplam(6, `TOPLAM — ${o.yuklenenArac} araç`, `${sayi(o.yuklenenKg)} kg`) : bos(6, `${G} satış aracı yüklenmedi.`));

  // Bugun gelenler (alis)
  const gRows = r.gelen.map(({ teslim: t, alis: a, dogrudanIsEmri }, i) =>
    `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(saat(t.teslim_zamani || t.irsaliye_tarihi || t.olusturma), "color:#64748B;white-space:nowrap")}${td(`<b>${esc(a ? (a.tedarikci_kisa || "").trim() || a.tedarikci : "-")}</b><br><span style="color:#64748B;font-size:11px">${esc(a?.alis_no || "-")} · ${esc(a?.urun || "-")}${a?.depo ? ` · ${esc(a.depo)}` : ""}</span>${dogrudanIsEmri ? `<br><span style="color:#B45309;font-size:11px;font-weight:bold">Doğrudan müşteriye · ${esc(dogrudanIsEmri)}</span>` : ""}`)}${td(`<b>${esc(t.plaka || "-")}</b>${t.dorse_plaka ? `<br><span style="color:#64748B;font-size:11px">Dorse ${esc(t.dorse_plaka)}</span>` : ""}`, "white-space:nowrap")}${td(irsaliyeHucresi(t.irsaliye_no, t.irsaliye_dosya_yolu ? `a=${t.id}` : null))}${td(sayi(n(t.net_kg)), "text-align:right;font-weight:bold;white-space:nowrap")}</tr>`).join("");
  const gTablo = tablo(`${th("Saat")}${th("Tedarikçi · Alış")}${th("Plaka")}${th("İrsaliye No")}${th("Net (kg)", true)}`,
    r.gelen.length ? gRows + toplam(5, `TOPLAM — ${o.gelenArac} araç`, `${sayi(o.gelenKg)} kg`) : bos(5, `${G} alış aracı gelmedi.`));

  // Acik satis siparisleri
  const KALAN_RENK = { kalan: "#B45309", fazla: LACIVERT, tamam: "#047857" } as const;
  const sRows = r.acikSatis.map((x, i) => {
    const e = x.emir;
    const hedef = e.hedef_tur === "kg" ? `${sayi(n(e.hedef_kg))} kg` : `${e.hedef_arac ?? 0} araç`;
    const devir = x.devirKg ? `<br><span style="color:#64748B;font-size:10px">devir ${x.devirKg > 0 ? "+" : "−"}${sayi(Math.abs(x.devirKg))} kg dahil</span>` : "";
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(e.is_emri_no)}</b>`, "white-space:nowrap")}${td(`${esc(musteriAdi(e))}<br><span style="color:#64748B;font-size:11px">${esc(urunAdi(e.urun, e.ambalaj))}${e.teslim ? ` · ${esc(e.teslim)}` : ""}</span>`)}${td(hedef, "text-align:right;white-space:nowrap")}${td(`${sayi(x.yuklenenKg)} kg${devir}`, "text-align:right;white-space:nowrap")}${td(`${x.arac}${x.bugunArac ? ` <span style="color:#047857;font-weight:bold">(+${x.bugunArac} ${g})</span>` : ""}`, "text-align:right;white-space:nowrap")}${td(`<span style="color:${KALAN_RENK[x.kalan.durum]};font-weight:bold">${esc(x.kalan.metin)}</span>`, "white-space:nowrap")}</tr>`;
  }).join("");
  const sTablo = tablo(`${th("Sipariş")}${th("Müşteri · Ürün")}${th("Hedef", true)}${th("Yüklenen", true)}${th("Araç", true)}${th("Durum")}`,
    sRows || bos(6, "Açık satış siparişi yok."));

  // Acik alis siparisleri
  const aRows = r.acikAlis.map((x, i) => {
    const a = x.alis;
    const kalan = x.kalanKg > 0 ? `<span style="color:#B45309;font-weight:bold">Kalan ${ton(x.kalanKg)}</span>` : x.kalanKg < 0 ? `<span style="color:${LACIVERT};font-weight:bold">Fazla ${ton(-x.kalanKg)}</span>` : `<span style="color:#047857;font-weight:bold">Tamam</span>`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(a.alis_no)}</b>`, "white-space:nowrap")}${td(`${esc((a.tedarikci_kisa || "").trim() || a.tedarikci)}<br><span style="color:#64748B;font-size:11px">${esc(a.urun)}${a.depo ? ` · ${esc(a.depo)}` : ""}</span>`)}${td(`${sayi(n(a.miktar_kg))} kg`, "text-align:right;white-space:nowrap")}${td(`${sayi(x.alinanKg)} kg`, "text-align:right;white-space:nowrap")}${td(`${x.arac}${x.bugunArac ? ` <span style="color:#047857;font-weight:bold">(+${x.bugunArac} ${g})</span>` : ""}`, "text-align:right;white-space:nowrap")}${td(kalan, "white-space:nowrap")}</tr>`;
  }).join("");
  const aTablo = tablo(`${th("Alış")}${th("Tedarikçi · Ürün")}${th("Sipariş", true)}${th("Teslim alınan", true)}${th("Araç", true)}${th("Durum")}`,
    aRows || bos(6, "Açık alış siparişi yok."));

  // Bugun kapanan siparisler
  const SONUC_RENK = { tam: "#047857", eksik: "#B45309", fazla: LACIVERT } as const;
  const kRows = r.kapanan.map((x, i) => {
    const e = x.emir;
    const hedef = e.hedef_tur === "kg" ? `${sayi(n(e.hedef_kg))} kg` : `${e.hedef_arac ?? 0} araç`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(e.is_emri_no)}</b>`, "white-space:nowrap")}${td(`${esc(musteriAdi(e))}<br><span style="color:#64748B;font-size:11px">${esc(urunAdi(e.urun, e.ambalaj))}</span>`)}${td(hedef, "text-align:right;white-space:nowrap")}${td(`${sayi(x.yuklenenKg)} kg · ${x.arac} araç`, "text-align:right;white-space:nowrap")}${td(`<span style="color:${SONUC_RENK[x.sonuc]};font-weight:bold">${esc(x.metin)}</span>`, "white-space:nowrap")}</tr>`;
  }).join("");
  const kBolum = r.kapanan.length
    ? bolum(`${G} Kapanan Siparişler`, `${r.kapanan.length} sipariş`) + tablo(`${th("Sipariş")}${th("Müşteri · Ürün")}${th("Hedef", true)}${th("Gerçekleşen", true)}${th("Sonuç")}`, kRows)
    : "";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>İç Piyasa Günlük Rapor</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${IC_RAPOR_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} İç Piyasa</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Rapor · Yükleme ve Teslim Alma</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(tarihTR(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">${OTURUM_AD[oturum]} raporu${oturum === "sabah" ? " (dün)" : ""} · ${esc(saat(olusturmaIso))}</div></td>
  </tr></table>
  ${kutular}

  ${bolum(`${G} Yüklenenler — Satış`, `${o.yuklenenArac} araç · ${ton(o.yuklenenKg)}`)}
  ${yTablo}

  ${bolum(`${G} Gelenler — Alış`, `${o.gelenArac} araç · ${ton(o.gelenKg)}`)}
  ${gTablo}

  ${kBolum}

  ${bolum("Açık Satış Siparişleri", `${o.acikSatis} sipariş`)}
  ${sTablo}

  ${bolum("Açık Alış Siparişleri", `${o.acikAlis} sipariş`)}
  ${aTablo}

  <div style="margin-top:24px;text-align:center">
    <a href="${IC_RAPOR_UYGULAMA_URL}/ic-piyasa/is-emirleri" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">İç piyasayı uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Yüklenen miktar: araçların net toplamı + siparişler arası devir. Gün: satışta irsaliye saati, alışta teslim alma saati (Türkiye).<br>Her gün ${icRaporSaatYazi("sabah")} (dünün raporu), ${icRaporSaatYazi("ogle")} ve ${icRaporSaatYazi("aksam")}'te gönderilir · müşteriye gitmez · alıcılar: İç Piyasa › Bildirimler › Ayarlar.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
