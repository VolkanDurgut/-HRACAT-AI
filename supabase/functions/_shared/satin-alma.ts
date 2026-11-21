// ============================================================================
// SATIN ALMA - ortak sabitler + mail sablonlari (26.10.2026)
// ============================================================================
// SAF TypeScript (Deno/Next bagimliligi yok): hem edge function "satin-alma"
// hem uygulama (app/satin-alma, app/talep/[token]) ayni etiketleri kullanir.
// Veritabanindaki CHECK listeleriyle (migration 20261026100000) BIREBIR ayni.
// ============================================================================

export const SA_SITE = "https://ihracatasistanim.com";
export const talepAdresi = (token: string) => `${SA_SITE}/talep/${token}`;
export const yonetimAdresi = (listeId: string) => `${SA_SITE}/satin-alma?liste=${listeId}`;
/** 21.11.2026: haftalik toplu liste (Burak Bey'in karar ekrani) */
export const topluAdresi = (topluId: string) => `${SA_SITE}/satin-alma?toplu=${topluId}`;
/** Onaylanan kalemlerin girissiz "Unex cek listesi" sayfasi (execution@ isaretler). */
export const cekAdresi = (token: string) => `${SA_SITE}/cek/${token}`;

export const KATEGORILER = {
  kirtasiye: "Kırtasiye",
  temizlik: "Temizlik",
  mutfak: "Mutfak",
  elektronik: "Bilgisayar / Elektronik",
  is_guvenligi: "İş Güvenliği",
  diger: "Diğer",
} as const;
export type Kategori = keyof typeof KATEGORILER;

export const BIRIMLER = {
  adet: "Adet",
  paket: "Paket",
  koli: "Koli",
  kutu: "Kutu",
  top: "Top",
  kg: "Kg",
  gr: "Gr",
  litre: "Litre",
  metre: "Metre",
  takim: "Takım",
  kova: "Kova",
  bidon: "Bidon",
  // 21.11.2026: Excel listesinde "Limon suyu 2 şişe", "Acı biber turşusu 2 kavanoz"
  sise: "Şişe",
  kavanoz: "Kavanoz",
  diger: "Diğer",
} as const;
export type Birim = keyof typeof BIRIMLER;

export type SaKalem = {
  id: string;
  kategori: Kategori;
  urun: string;
  miktar: number | string;
  birim: Birim;
  aciliyet: "normal" | "acil";
  aciklama: string | null;
  talep_eden: string;
  karar: "bekliyor" | "onaylandi" | "reddedildi";
  red_nedeni: string | null;
  olusturma: string;
  /** Cek listesi: onaylanan kalem alindi mi */
  alindi?: boolean;
  alinma_zamani?: string | null;
  alan_ad?: string | null;
  /** 31.10.2026: nereden alinacak (ops.); onayli fiste gruplama */
  tedarikci?: string | null;
  /** 14.11.2026 "Degistirerek onayla": onaylanan miktar (null = talep edilen miktar) + onay notu */
  onay_miktar?: number | string | null;
  onay_notu?: string | null;
};

export type SaListe = {
  id: string;
  liste_no: string | null;
  /** 21.11.2026: taslak -> on_onay (Volkan Bey) -> bekliyor (Burak Bey) -> sonuclandi */
  durum: "taslak" | "on_onay" | "bekliyor" | "sonuclandi";
  departman: string;
  departman_id?: string;
  sirket: string | null;
  /** Test departmani: mailler SADECE test adresine gider, konu "[TEST] " ile baslar. */
  test?: boolean;
  /** 31.10.2026: departmanin haftalik liste gunu var (konu "Haftalık satın alma listesi"). */
  haftalik?: boolean;
  gonderen_ad: string | null;
  gonderim_zamani: string | null;
  karar_veren_email: string | null;
  karar_zamani: string | null;
  karar_notu: string | null;
  gonderim_maili: "gonderildi" | "hata" | null;
  sonuc_maili: "gonderildi" | "hata" | null;
  /** Onaylanan kalem varsa karar aninda 'aktif'; hepsi alininca 'tamamlandi'. */
  cek_durumu?: "aktif" | "tamamlandi" | null;
  cek_tamamlanma?: string | null;
  /** SADECE karar / mail verisinde gelir (departman sayfasina ASLA). */
  cek_token?: string | null;
  /** 21.11.2026: haftalik toplu listeyle onaya sunulduysa toplu liste; acil sunulduysa null */
  toplu_id?: string | null;
  onaya_sunma_zamani?: string | null;
  kalemler: SaKalem[];
};

/** 21.11.2026 haftalik toplu satin alma listesi (TSA-YYYY-NNNN): ayni anda Burak Bey'e sunulan formlar. */
export type SaToplu = {
  id: string;
  toplu_no: string;
  test?: boolean;
  olusturma: string;
  olusturan_email: string | null;
  onay_maili?: "gonderildi" | "hata" | null;
  listeler: SaListe[];
};

/** Toplu listenin ozeti: departman / form / kalem / acil sayilari */
export function topluOzeti(t: Pick<SaToplu, "listeler">) {
  const kalemler = t.listeler.flatMap((l) => l.kalemler || []);
  return {
    form: t.listeler.length,
    departman: new Set(t.listeler.map((l) => l.departman)).size,
    kalem: kalemler.length,
    acil: kalemler.filter((k) => k.aciliyet === "acil").length,
    tedarikci: tedarikciGruplari(kalemler).length,
  };
}

/** Ad soyad (27.10.2026): bosluklar teke iner. Veritabanindaki sa_ad_soyad_duzelt ile AYNI. */
export const adSoyadDuzelt = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().slice(0, 80);
/** En az iki kelime, her biri en az 2 karakter, rakam / @ yok (sa_ad_soyad_gecerli ile AYNI). */
export const adSoyadGecerli = (s: string | null | undefined) => {
  const t = adSoyadDuzelt(s);
  return /^[^ ]{2,}( [^ ]{2,})+$/.test(t) && !/[0-9@]/.test(t);
};

// ---------------------------------------------------------------------------
// Urun eslestirme (28.10.2026): mukerrer / diger departman / son 30 gun uyarilari
// ---------------------------------------------------------------------------
const TR_KATLA: Record<string, string> = {
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u", Â: "a", Î: "i", Û: "u",
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
};
/** Karsilastirma anahtari: Turkce harfler katlanir, kucuk harf, harf/rakam disi bosluk.
 * "ZIMBA TELİ" = "zımba teli" = "zimba teli". Veritabanindaki sa_urun_norm ile AYNI. */
export function urunNorm(s: string | null | undefined): string {
  return (s || "").replace(/[ÇĞİIÖŞÜÂÎÛçğıöşüâîû]/g, (c) => TR_KATLA[c]).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
/** "ayni": anahtar birebir ayni (sunucu ayni formda ikinci satiri reddeder).
 * "benzer": kisa adin tum kelimeleri uzun adda var ("Klasör" ~ "Geniş mavi klasör");
 * tek kelimelik kisa adlarda en az 4 harf (yanlis esleme olmasin: "A4", "çay" gibi). */
export function urunEslesme(a: string | null | undefined, b: string | null | undefined): "ayni" | "benzer" | null {
  const x = urunNorm(a), y = urunNorm(b);
  if (!x || !y) return null;
  if (x === y) return "ayni";
  const [kisa, uzun] = x.length <= y.length ? [x, y] : [y, x];
  const kelimeler = kisa.split(" ");
  if (kelimeler.length === 1 && kelimeler[0].length < 4) return null;
  const uzunKelimeler = new Set(uzun.split(" "));
  return kelimeler.every((w) => uzunKelimeler.has(w)) ? "benzer" : null;
}
/** Daha once siparis verilen urun (gonderilen formlardan otomatik; sa_token_urunler).
 * 31.10.2026: katalog alanlari (tedarikci, son miktar) + departmana ozel ozet (dep_*). */
export type SaUrun = {
  ad: string; kategori: Kategori; birim: Birim; kullanim: number;
  tedarikci?: string | null; son_miktar?: number | string | null;
  dep_kullanim?: number; dep_son_miktar?: number | string | null; dep_son_birim?: Birim | null; dep_son?: string | null;
};

/** Haftalik liste gunleri (ISO: 1=Pazartesi). Veritabanindaki haftalik_gun ile ayni. */
export const HAFTA_GUNLERI: Record<number, string> = { 1: "Pazartesi", 2: "Salı", 3: "Çarşamba", 4: "Perşembe", 5: "Cuma", 6: "Cumartesi", 7: "Pazar" };

/** Tedarikci adi karsilastirma / gosterim: bosluklar teke, buyuk harf (TR). Bos -> null. */
export function tedarikciDuzelt(s: string | null | undefined): string | null {
  const t = (s || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return t ? t.toLocaleUpperCase("tr-TR") : null;
}

/** 14.11.2026: Ayni formda TEKRAR kurali URUN + TEDARIKCI. "Patates" hem TAKOZLAR'dan hem CEM MARKET'ten
 * alinabilir; ayni urun ayni tedarikciden (ya da ikisi de tedarikcisiz) ikinci satir olamaz.
 * Veritabanindaki sa_token_kalem_ekle kontrolu ile AYNI. */
export function kalemAnahtari(urun: string | null | undefined, tedarikci: string | null | undefined): string {
  return `${urunNorm(urun)}|${urunNorm(tedarikci)}`;
}

/** Kalemleri tedarikciye gore gruplar (girdi sirasi korunur; tedarikcisizler EN SONDA "Belirtilmemiş"). */
export function tedarikciGruplari<T extends { tedarikci?: string | null }>(kalemler: T[]): { tedarikci: string | null; kalemler: T[] }[] {
  const gruplar = new Map<string, { tedarikci: string | null; kalemler: T[] }>();
  for (const k of kalemler) {
    const t = tedarikciDuzelt(k.tedarikci);
    const anahtar = t ?? "\u0000";
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { tedarikci: t, kalemler: [] });
    gruplar.get(anahtar)!.kalemler.push(k);
  }
  const liste = Array.from(gruplar.values());
  return [...liste.filter((g) => g.tedarikci), ...liste.filter((g) => !g.tedarikci)];
}

/** 5 -> "5", 2.5 -> "2,5" */
export function miktarYaz(m: number | string): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return String(m);
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export const miktarBirim = (k: Pick<SaKalem, "miktar" | "birim">) => `${miktarYaz(k.miktar)} ${BIRIMLER[k.birim] ?? k.birim}`;

/** 14.11.2026: onaylanan kalemde gecerli miktar (degistirerek onaylandiysa onay_miktar). */
export const onayliMiktar = (k: Pick<SaKalem, "miktar" | "onay_miktar">): number | string =>
  k.onay_miktar != null && k.onay_miktar !== "" ? k.onay_miktar : k.miktar;
/** Onaylanan miktar talep edilenden farkli mi */
export const miktarDegisti = (k: Pick<SaKalem, "miktar" | "onay_miktar">) =>
  k.onay_miktar != null && k.onay_miktar !== "" && Number(k.onay_miktar) !== Number(k.miktar);
export const onayliMiktarBirim = (k: Pick<SaKalem, "miktar" | "birim" | "onay_miktar">) => miktarBirim({ miktar: onayliMiktar(k), birim: k.birim });

/** "26.10.2026 14:05" (Turkiye saati) */
export function saTarih(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function listeOzeti(l: Pick<SaListe, "kalemler">) {
  const k = l.kalemler || [];
  return {
    toplam: k.length,
    acil: k.filter((x) => x.aciliyet === "acil").length,
    onay: k.filter((x) => x.karar === "onaylandi").length,
    red: k.filter((x) => x.karar === "reddedildi").length,
    alinan: k.filter((x) => x.karar === "onaylandi" && x.alindi).length,
  };
}

// ---------------------------------------------------------------------------
// Mail (27.10.2026 kurumsal belge tasarimi)
// ---------------------------------------------------------------------------
// Kullanici: "bu tasarimi begenmedim; liste buyuk olursa her turlu sigiyor degil mi?"
// - Belge dili: /cek A4 fisi ile ayni (ince cizgili bilgi tablosu, duz kalem tablosu,
//   hap / renkli rozet yok, 4px koseli dugme).
// - BOYUT: Gmail 102 KB'i gecen maili kirpar ("[Mesaj kirpildi]"). Eski sablonda 100
//   kalemlik sonuc maili 102,3 KB idi. Hucre bicimleri <style> siniflarinda (her hucrede
//   tekrar etmez) + tablo nitelikleri (cellpadding/border) yedek; 100 kalem ~27 KB.
//   Uzun urun adlari kirilarak sarar (tablo 680 px'i asmaz).
const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LACIVERT = "#1B2352";
const SEFTALI = "#F4A07C";

const STIL = `body{margin:0;background:#EEF0F3;font-family:Arial,Helvetica,sans-serif;color:#161B2E}
table{border-collapse:collapse}
.k{background:#fff;border:1px solid #D5D9E0;border-radius:4px}
.b td{padding:7px 10px;border:1px solid #D5D9E0;font-size:13px;vertical-align:top}
.b td.e{background:#F5F6F8;color:#5B6275;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;width:22%}
.t th{background:#F5F6F8;color:#1B2352;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:7px 8px;border-bottom:1px solid #D5D9E0;white-space:nowrap}
.t td{padding:7px 8px;border-bottom:1px solid #E6E8EC;font-size:12px;vertical-align:top;word-break:break-word}
.t .r{text-align:right;white-space:nowrap}
.t .s{color:#5B6275}
.t .n{white-space:nowrap;word-break:normal}
.a{display:block;color:#5B6275;font-size:11px;margin-top:2px}
.acil{color:#B42318;font-weight:bold;font-size:10px;letter-spacing:.4px}
.red{color:#B42318}
.h{margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#1B2352}
@media (max-width:600px){.g{padding:16px 12px 20px!important}.t th,.t td{padding:6px 4px!important}.t th{white-space:normal!important;letter-spacing:0!important}.b td{padding:6px!important}.b td.e{width:auto!important}.d{padding:8px 0!important}.ust{padding:12px!important}}`;

function cerceve(belge: string, no: string, govde: string, test = false): string {
  const testSeridi = test
    ? `<tr><td style="background:#FFF8E6;color:#7A5200;font-size:12px;font-weight:bold;padding:9px 24px;border-bottom:1px solid #EBCB80;">TEST · Bu e-posta test departmanından gönderildi. Gerçek alıcılara (execution@ / bbt@) gönderilmedi.</td></tr>`
    : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${STIL}</style></head>
<body style="margin:0;background:#EEF0F3;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F3;"><tr><td class="d" align="center" style="padding:24px 8px;">
<table role="presentation" class="k" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border:1px solid #D5D9E0;">
<tr><td class="ust" style="background:${LACIVERT};padding:14px 24px;border-bottom:3px solid ${SEFTALI};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:56px;"><img src="${SA_SITE}/images/logo.png" width="52" height="52" alt="Unex Gıda" style="display:block;border:0;"></td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:1px;">UNEX GIDA<br><span style="color:#AEB4CC;font-size:11px;font-weight:normal;letter-spacing:.5px;">Satın Alma</span></td>
<td align="right" style="vertical-align:middle;color:#ffffff;"><span style="font-size:15px;font-weight:bold;letter-spacing:1.5px;">${kacis(belge)}</span><br><span style="color:${SEFTALI};font-size:12px;font-family:Consolas,Menlo,monospace;font-weight:bold;">${kacis(no)}</span></td>
</tr></table></td></tr>
${testSeridi}
<tr><td class="g" style="padding:22px 24px 26px;">${govde}</td></tr>
</table>
<p style="margin:12px 0 0;color:#8B91A8;font-size:11px;">Unex Gıda San. ve Tic. Ltd. Şti. · Süleymanpaşa / Tekirdağ · Bu e-posta UNEX-AI › Satın Alma tarafından otomatik gönderildi.</p>
</td></tr></table></body></html>`;
}

/** Iki sutunlu ince cizgili bilgi tablosu: [etiket, deger] ciftleri, satir basina 2 cift. */
function bilgiTablosu(alanlar: [string, string][]): string {
  const satirlar: string[] = [];
  for (let i = 0; i < alanlar.length; i += 2) {
    const [a, b] = [alanlar[i], alanlar[i + 1]];
    satirlar.push(`<tr><td class="e">${kacis(a[0])}</td><td>${kacis(a[1])}</td>${b ? `<td class="e">${kacis(b[0])}</td><td>${kacis(b[1])}</td>` : `<td class="e"></td><td></td>`}</tr>`);
  }
  return `<table role="presentation" class="b" width="100%" cellpadding="7" border="1" style="border-collapse:collapse;border-color:#D5D9E0;">${satirlar.join("")}</table>`;
}

const urunHucresi = (k: SaKalem, tedarikciGoster = true, onayNotu = false) => `<td>${kacis(k.urun)}${k.aciklama ? `<span class="a">${kacis(k.aciklama)}</span>` : ""}${tedarikciGoster && k.tedarikci ? `<span class="a">Tedarikçi: ${kacis(k.tedarikci)}</span>` : ""}${onayNotu && k.onay_notu ? `<span class="a" style="color:#17704A;font-weight:bold;">Onay notu: ${kacis(k.onay_notu)}</span>` : ""}</td>`;
/** Onaylanan miktar; degistirerek onaylandiysa altinda talep edilen miktar */
const onayMiktarHucresi = (k: SaKalem) => `<td class="r"><b>${kacis(onayliMiktarBirim(k))}</b>${miktarDegisti(k) ? `<span class="a" style="color:#B54708;">Talep: ${kacis(miktarBirim(k))}</span>` : ""}</td>`;
const oncelik = (k: SaKalem) => (k.aciliyet === "acil" ? `<span class="acil">ACİL</span>` : `<span class="s">Normal</span>`);

/** Kalem tablosu. tur: talep (karar oncesi) | onay (onaylananlar) | red (reddedilenler). */
function kalemTablosu(kalemler: SaKalem[], tur: "talep" | "onay" | "red", tedarikciGoster = true): string {
  const bas = tur === "red"
    ? `<th>#</th><th>Ürün / hizmet</th><th class="r">Miktar</th><th>Talep eden</th><th>Red nedeni</th>`
    : `<th>#</th><th>Ürün / hizmet</th><th>Kategori</th><th class="r">Miktar</th><th>Öncelik</th><th>Talep eden</th>`;
  const satirlar = kalemler.map((k, i) => tur === "red"
    ? `<tr><td class="s n">${i + 1}</td>${urunHucresi(k, tedarikciGoster)}<td class="r">${kacis(miktarBirim(k))}</td><td>${kacis(k.talep_eden)}</td><td class="red">${kacis(k.red_nedeni || "Belirtilmedi")}</td></tr>`
    : `<tr><td class="s n">${i + 1}</td>${urunHucresi(k, tedarikciGoster, tur === "onay")}<td class="s">${kacis(KATEGORILER[k.kategori] ?? k.kategori)}</td>${tur === "onay" ? onayMiktarHucresi(k) : `<td class="r"><b>${kacis(miktarBirim(k))}</b></td>`}<td class="n">${oncelik(k)}</td><td>${kacis(k.talep_eden)}</td></tr>`).join("\n");
  return `<table role="presentation" class="t" width="100%" cellpadding="7" style="border-collapse:collapse;border:1px solid #D5D9E0;table-layout:auto;"><tr>${bas}</tr>\n${satirlar}</table>`;
}

const dugme = (metin: string, adres: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td style="background:#283474;border-radius:4px;"><a href="${kacis(adres)}" style="display:inline-block;padding:11px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">${kacis(metin)}</a></td></tr></table>
<p style="margin:0;color:#8B91A8;font-size:11px;word-break:break-all;">Düğme çalışmazsa: ${kacis(adres)}</p>`;

const giris = (metin: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#161B2E;">${metin}</p>`;
const baslik = (metin: string, renk = LACIVERT) => `<p class="h" style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${renk};">${kacis(metin)}</p>`;

const testKonu = (l: SaListe, konu: string) => (l.test ? `[TEST] ${konu}` : konu);

/** Onaylanan kalemler: tedarikci girilmisse tedarikci bazinda (alisveris sirasi), yoksa tek tablo. */
function onayliBolum(onaylar: SaKalem[]): string {
  if (!onaylar.some((k) => tedarikciDuzelt(k.tedarikci))) return `${baslik(`Onaylanan kalemler (${onaylar.length})`, "#17704A")}${kalemTablosu(onaylar, "onay")}`;
  return `${baslik(`Onaylanan kalemler (${onaylar.length}) · tedarikçiye göre`, "#17704A")}` + tedarikciGruplari(onaylar)
    .map((g) => `<p style="margin:14px 0 6px;font-size:12px;font-weight:bold;color:#161B2E;">${kacis(g.tedarikci ?? "Tedarikçi belirtilmemiş")} <span style="color:#5B6275;font-weight:normal;">· ${g.kalemler.length} kalem</span></p>${kalemTablosu(g.kalemler, "onay", false)}`)
    .join("\n");
}

/**
 * Talep formu maili. 21.11.2026 asama:
 *  - "on_onay": departman gonderdi -> YALNIZ execution@ (Volkan Bey'in on onayi; cumartesi toplu listeye girer)
 *  - "acil"   : Volkan Bey formu acil olarak Burak Bey'e sundu -> bbt@
 *  - "onay"   : eski akis (21.11.2026 oncesi gonderilen ve "Maili tekrar gonder" ile yeniden giden form)
 */
export function gonderimMaili(l: SaListe, asama: "on_onay" | "acil" | "onay" = "onay"): { konu: string; html: string } {
  const o = listeOzeti(l);
  const ozet = `${l.departman} · ${l.liste_no} (${o.toplam} kalem${o.acil ? `, ${o.acil} acil` : ""})`;
  const konu = asama === "on_onay"
    ? `Ön onay: ${ozet}`
    : asama === "acil"
      ? `Acil satın alma talebi onayınızda: ${ozet}`
      : `${l.haftalik ? "Haftalık satın alma listesi" : "Satın alma talebi"}: ${ozet}`;
  const metin = asama === "on_onay"
    ? `<b>${kacis(l.departman)}</b> departmanı satın alma talep formunu gönderdi. Form <b>ön onayınızda</b>: cumartesi oluşturacağınız toplu alışveriş listesine eklenir. Acilse uygulamadan hemen Burak Bey'in onayına sunabilirsiniz.`
    : asama === "acil"
      ? `<b>${kacis(l.departman)}</b> departmanının talep formu haftalık toplu listeyi beklemeden <b>acil</b> olarak onayınıza sunuldu. Kalemleri tek tek onaylayabilir ya da reddedebilirsiniz.`
      : `<b>${kacis(l.departman)}</b> departmanı satın alma talep formunu gönderdi. Kalemleri tek tek onaylayabilir ya da reddedebilirsiniz.`;
  const govde = `${giris(metin)}
${bilgiTablosu([["Departman", l.departman], ["Talep no", l.liste_no || "-"], ["Gönderen", l.gonderen_ad || "-"], ["Gönderim", saTarih(l.gonderim_zamani)], ["Kalem", String(o.toplam)], ["Acil kalem", o.acil ? String(o.acil) : "Yok"]])}
${baslik(`Talep kalemleri (${o.toplam})`)}${kalemTablosu(l.kalemler, "talep")}
${dugme(asama === "on_onay" ? "Ön onay ekranını aç" : "Talebi incele ve karar ver", yonetimAdresi(l.id))}`;
  return { konu: testKonu(l, konu), html: cerceve(asama === "on_onay" ? "TALEP FORMU · ÖN ONAY" : "SATIN ALMA TALEP FORMU", l.liste_no || "", govde, l.test) };
}

/** Toplu liste kalem tablosu: departman sutunlu (tedarikci grubunun icinde) */
function topluKalemTablosu(satirlar: { k: SaKalem; departman: string }[]): string {
  const govde = satirlar.map(({ k, departman }, i) => `<tr><td class="s n">${i + 1}</td>${urunHucresi(k, false)}<td class="s">${kacis(departman)}</td><td class="r"><b>${kacis(miktarBirim(k))}</b></td><td class="n">${oncelik(k)}</td><td>${kacis(k.talep_eden)}</td></tr>`).join("\n");
  return `<table role="presentation" class="t" width="100%" cellpadding="7" style="border-collapse:collapse;border:1px solid #D5D9E0;table-layout:auto;"><tr><th>#</th><th>Ürün / hizmet</th><th>Departman</th><th class="r">Miktar</th><th>Öncelik</th><th>Talep eden</th></tr>\n${govde}</table>`;
}

/** 21.11.2026: Volkan Bey haftalik toplu listeyi olusturdu -> bbt@ (TEK mail, tum departmanlar). */
export function topluOnayMaili(t: SaToplu): { konu: string; html: string } {
  const o = topluOzeti(t);
  const konu = `Haftalık toplu satın alma listesi onayınızda: ${t.toplu_no} (${o.departman} departman, ${o.kalem} kalem${o.acil ? `, ${o.acil} acil` : ""})`;
  const satirlar = t.listeler.flatMap((l) => (l.kalemler || []).map((k) => ({ k, departman: l.departman, tedarikci: k.tedarikci })));
  const gruplar = tedarikciGruplari(satirlar);
  const formlar = `<table role="presentation" class="t" width="100%" cellpadding="7" style="border-collapse:collapse;border:1px solid #D5D9E0;"><tr><th>Departman</th><th>Talep no</th><th>Gönderen</th><th>Gönderim</th><th class="r">Kalem</th></tr>
${t.listeler.map((l) => { const lo = listeOzeti(l); return `<tr><td>${kacis(l.departman)}</td><td class="n">${kacis(l.liste_no || "-")}</td><td>${kacis(l.gonderen_ad || "-")}</td><td class="n s">${kacis(saTarih(l.gonderim_zamani))}</td><td class="r">${lo.toplam}${lo.acil ? ` <span class="acil">· ${lo.acil} ACİL</span>` : ""}</td></tr>`; }).join("\n")}</table>`;
  const govde = `${giris(`Bu haftanın satın alma talepleri <b>tek listede</b> onayınıza sunuldu. Tüm departmanların kalemlerini tek ekranda onaylayabilir, miktarını değiştirebilir ya da reddedebilirsiniz.`)}
${bilgiTablosu([["Toplu liste no", t.toplu_no], ["Sunulma", saTarih(t.olusturma)], ["Departman", String(o.departman)], ["Talep formu", String(o.form)], ["Kalem", String(o.kalem)], ["Acil kalem", o.acil ? String(o.acil) : "Yok"]])}
${baslik(`Talep formları (${o.form})`)}${formlar}
${baslik(`Kalemler (${o.kalem}) · tedarikçiye göre`)}${gruplar.map((g) => `<p style="margin:14px 0 6px;font-size:12px;font-weight:bold;color:#161B2E;">${kacis(g.tedarikci ?? "Tedarikçi belirtilmemiş")} <span style="color:#5B6275;font-weight:normal;">· ${g.kalemler.length} kalem</span></p>${topluKalemTablosu(g.kalemler)}`).join("\n")}
${dugme("Toplu listeyi incele ve karar ver", topluAdresi(t.id))}`;
  return { konu: t.test ? `[TEST] ${konu}` : konu, html: cerceve("TOPLU SATIN ALMA LİSTESİ", t.toplu_no, govde, t.test === true) };
}

/** Burak Bey karar verdi -> execution@: departman etiketli ONAYLI SATIN ALMA FISI
 * (veritabaninda "cek listesi"). execution@ fis baglantisini ilgili departmana iletir. */
export function sonucMaili(l: SaListe): { konu: string; html: string } {
  const o = listeOzeti(l);
  const onaylar = l.kalemler.filter((k) => k.karar === "onaylandi");
  const redler = l.kalemler.filter((k) => k.karar === "reddedildi");
  const konu = o.onay
    ? `[${l.departman}] Onaylı satın alma fişi · ${l.liste_no} (${o.onay} kalem${o.red ? `, ${o.red} reddedildi` : ""})`
    : `[${l.departman}] Satın alma talebi reddedildi · ${l.liste_no}`;
  const degisen = onaylar.filter((k) => miktarDegisti(k)).length;
  const alanlar: [string, string][] = [["Departman", l.departman], ["Fiş / talep no", l.liste_no || "-"], ["Gönderen", l.gonderen_ad || "-"], ["Onaylayan", l.karar_veren_email || "-"], ["Onay tarihi", saTarih(l.karar_zamani)], ["Kalem durumu", `${o.onay} onaylı${degisen ? ` (${degisen} miktarı değiştirilerek)` : ""}${o.red ? ` · ${o.red} reddedildi` : ""}`]];
  const govde = `${giris(o.onay
    ? `<b>${kacis(l.departman)}</b> departmanının talebinde <b>${o.onay} kalem onaylandı</b>. Onaylı satın alma fişini bağlantıyla ya da yazdırarak ilgili departmana iletebilirsiniz.`
    : `<b>${kacis(l.departman)}</b> departmanının talebindeki kalemlerin hiçbiri onaylanmadı.`)}
${bilgiTablosu(alanlar)}
${l.karar_notu ? `<p style="margin:12px 0 0;padding:8px 12px;border-left:3px solid ${SEFTALI};background:#F5F6F8;font-size:13px;"><b style="color:#5B6275;">Onay notu:</b> ${kacis(l.karar_notu)}</p>` : ""}
${onaylar.length ? onayliBolum(onaylar) : ""}
${redler.length ? `${baslik(`Reddedilen kalemler (${redler.length}) · satın alınmayacak`, "#B42318")}${kalemTablosu(redler, "red")}` : ""}
${o.onay && l.cek_token ? dugme("Satın alma fişini aç", cekAdresi(l.cek_token)) : dugme("Talebi uygulamada aç", yonetimAdresi(l.id))}
<p style="margin:10px 0 0;color:#8B91A8;font-size:11px;line-height:1.5;">Departman sonucu kendi talep bağlantısında da görür.</p>`;
  return { konu: testKonu(l, konu), html: cerceve(o.onay ? "ONAYLI SATIN ALMA FİŞİ" : "SATIN ALMA TALEBİ · RED", l.liste_no || "", govde, l.test) };
}

/** Haftalik liste hatirlatmasi (31.10.2026): departmanin liste gunu geldi, bu hafta liste gonderilmedi. */
export type HaftalikHatirlatma = {
  departman: string; token: string; test?: boolean; sirket?: string | null; taslak_kalem: number;
  son_liste: { liste_no: string; gonderim_zamani: string; kalem: number } | null;
};
export function haftalikHatirlatmaMaili(h: HaftalikHatirlatma): { konu: string; html: string } {
  const konu = `Hatırlatma: haftalık satın alma listesi · ${h.departman}`;
  const alanlar: [string, string][] = [
    ["Departman", h.departman], ["Bugün", saTarih(new Date().toISOString()).slice(0, 10)],
    ["Hazırlanan form", h.taslak_kalem ? `${h.taslak_kalem} kalem, gönderilmedi` : "Boş"],
    ["Son gönderilen", h.son_liste ? `${h.son_liste.liste_no} · ${saTarih(h.son_liste.gonderim_zamani).slice(0, 10)} · ${h.son_liste.kalem} kalem` : "-"],
  ];
  const govde = `${giris(`Bugün <b>${kacis(h.departman)}</b> departmanının haftalık satın alma listesi günü. Bu hafta henüz liste gönderilmedi.${h.taslak_kalem ? " Formda hazırlanmış kalemler var; kontrol edip onaya gönderebilirsiniz." : " Formda <b>Geçen listeyi kopyala</b> ya da <b>Excel'den yükle</b> ile hızlıca hazırlayabilirsiniz."}`)}
${bilgiTablosu(alanlar)}
${dugme("Satın alma formunu aç", talepAdresi(h.token))}`;
  return { konu: h.test ? `[TEST] ${konu}` : konu, html: cerceve("HAFTALIK LİSTE HATIRLATMASI", h.departman, govde, h.test === true) };
}
