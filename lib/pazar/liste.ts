/**
 * PAZAR (UNEX Satis) - "Rehber listesi" ayristirma (16.11.2026). SAF modul (DOM yok; test edilebilir).
 *
 * Kullanici: "Elimizde bir musteri listesi var (Safak Bey'in listesi). Mukerrer kayit olmayacak sekilde
 * sisteme entegre etmeliyiz." Fuar listesinden farki:
 *  - Her sayfa bir ULKE ("Gana", "Malezya", "Fildişi Sahilleri" ...); ulke sayfa adindan bulunur.
 *  - Baslik: Firma | Kişi | Mail | Telefon | Fax | Adres | Not (sira / eksik sutun serbest).
 *  - Hucreler cok degerli: birden fazla kisi / e-posta ";" "," ya da yeni satirla ayrilmis.
 *  - Sayfa icinde BOLUM basliklari olabilir ("BANKA", "DEPO", "LOJİSTİK", "Pirinç"): yalniz firma hucresi dolu,
 *    buyuk harf / bilinen kelime. Hizmet bolumleri (banka, depo, ev, arac, sigorta, lojistik, fumigasyon, Turkler)
 *    ve ulke olmayan sayfalar ("aaa") + Turkiye (ic piyasa) ONIZLEMEDE varsayilan olarak HARIC (kullanici acabilir).
 *  - Kaymis satir: Telefon sutununda e-posta, Mail sutununda e-posta yoksa satir bir sutun saga kaymistir
 *    (Firma sutununda ulke adi): firma = Kişi, kişi = Mail, mail = Telefon, telefon = Fax.
 *  - Firma adi bos / "-" ise kisi adi firma adi olur (uyari ile).
 *  - Adres / Fax / Not / ham telefon kaybolmaz: firma notlarina yazilir ("Erişlerin müşterisi" gibi bilgiler).
 * Birlestirme anahtari sunucudan (pazar_anahtarlar) gelir; ayni firma farkli sayfalarda tek kayit olur.
 */
import type { HucreDegeri, XlsxSayfasi } from "@/lib/xlsx-oku";
import { epostalariAyir, excelUlkesi, sade, telefonlariAyir, type FuarKisi } from "@/lib/pazar/fuar";

export type ListeSatiri = {
  sayfa: string;
  satir: number;
  bolum: string | null;
  firma: string;
  kisi: string;
  mail: string;
  telefon: string;
  fax: string;
  adres: string;
  not: string;
  kaydirildi: boolean;
  firmaKisidenAlindi: boolean;
};
export type ListeGrubu = {
  /** "sayfa" ya da "sayfa › bolum" (onizlemede secim anahtari). */
  kod: string;
  sayfa: string;
  bolum: string | null;
  ulke: string | null;
  satir: number;
  /** Varsayilan secim (kullanici degistirebilir). */
  dahil: boolean;
  neden: string | null;
};
export type ListeOkuma = { satirlar: ListeSatiri[]; gruplar: ListeGrubu[]; uyarilar: string[]; kaydirilan: number };
export type ListeFirma = {
  ad: string;
  anahtar: string;
  ulke: string | null;
  ulke_kaynagi: "excel" | null;
  ulke_ham: string | null;
  kisiler: FuarKisi[];
  notlar: string;
  kaynaklar: string[];
};

/** Hizmet / ofis kurulum bolumleri: musteri degil (varsayilan haric). Anahtar: sade(). */
const HIZMET_BOLUMLERI = new Set(["ARAC", "BANKA", "DEPO", "EV", "FUMIGASYON", "LOJISTIK", "SIGORTA", "TURKLER", "KARGO", "GUMRUK", "OTEL"]);
/** Kucuk harfle yazilsa da bolum basligi sayilan kelimeler. */
const BILINEN_BOLUMLER = new Set(["PIRINC", "DIGER", "BAKERY VB", ...Array.from(HIZMET_BOLUMLERI)]);
/** Bu uzunluga kadar anahtarlar ("TRADER") genel ad sayilir; farkli ulkede ayni ad ayri firma. */
const KISA_ANAHTAR = 6;
/** Firma adi yerine yazilmis anlamsiz degerler. */
const BOS_FIRMA = /^[-–—.\s]*$/;

function yazi(v: HucreDegeri | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).replace(/_x000d_/gi, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

type Sutunlar = { firma: number; kisi?: number; mail?: number; telefon?: number; fax?: number; adres?: number; not?: number };

function baslikSutunlari(h: HucreDegeri[]): Sutunlar | null {
  const s: Partial<Sutunlar> = {};
  h.forEach((v, i) => {
    const a = sade(yazi(v)).replace(/\s+/g, " ");
    if (!a) return;
    if (s.firma === undefined && /^(FIRMA|COMPANY|MUSTERI)/.test(a)) s.firma = i;
    else if (s.kisi === undefined && /^(KISI|YETKILI|CONTACT|ISIM|NAME)/.test(a)) s.kisi = i;
    else if (s.mail === undefined && /(MAIL|E POSTA|EPOSTA)/.test(a)) s.mail = i;
    else if (s.telefon === undefined && /(TELEFON|PHONE|^TEL\b|GSM|MOBILE)/.test(a)) s.telefon = i;
    else if (s.fax === undefined && /^(FAX|FAKS)/.test(a)) s.fax = i;
    else if (s.adres === undefined && /^(ADRES|ADDRESS)/.test(a)) s.adres = i;
    else if (s.not === undefined && /^(NOT|NOTE|ACIKLAMA)/.test(a)) s.not = i;
  });
  if (s.firma === undefined || (s.mail === undefined && s.telefon === undefined)) return null;
  return s as Sutunlar;
}

/** Sayfa adi -> ulke ("Dubai" -> BAE, "Kongo, Dem." -> Kongo Dem. Cum.). Ulke degilse null. */
export function sayfaUlkesi(sayfaAdi: string): string | null {
  const s = sade(sayfaAdi).replace(/[@.]/g, " ").replace(/\s+/g, " ").trim();
  const ozel: Record<string, string> = {
    "KONGO DEM": "KONGO DEMOKRATİK CUMHURİYETİ", "DOMINIK CUM": "DOMİNİK CUMHURİYETİ", AMERIKA: "AMERİKA BİRLEŞİK DEVLETLERİ",
    INGILTERE: "BİRLEŞİK KRALLIK", KKTC: "KUZEY KIBRIS TÜRK CUMHURİYETİ", "GINE CONAKRY": "GİNE", "FILDISI SAHILLERI": "FİLDİŞİ SAHİLİ",
    "BOSNA HERSEK": "BOSNA-HERSEK", DUBAI: "BİRLEŞİK ARAP EMİRLİKLERİ", MALAWI: "MALAVİ", ZIMBABWE: "ZİMBABVE", RWANDA: "RUANDA",
    "GINE BISSAU": "GİNE-BİSSAU", HAITI: "HAİTİ", MAURITIUS: "MAURİTİUS", HIRVATISTAN: "HIRVATİSTAN",
  };
  if (ozel[s]) return ozel[s];
  return excelUlkesi(sayfaAdi);
}

/**
 * Bolum basligi: satirda yalniz firma hucresi dolu VE bilinen bolum kelimesi. Yalniz adi yazili gercek firmalar
 * ("UCODIS", "Cedicom") baslik sanilmasin diye genel "buyuk harf" kurali KULLANILMAZ.
 */
function bolumBasligi(firma: string, digerleri: string[]): string | null {
  if (!firma || digerleri.some((x) => x && !BOS_FIRMA.test(x))) return null;
  return BILINEN_BOLUMLER.has(sade(firma).replace(/\s+/g, " ")) ? firma.trim() : null;
}

export function listeSayfalariniOku(sayfalar: XlsxSayfasi[]): ListeOkuma {
  const satirlar: ListeSatiri[] = [];
  const gruplar = new Map<string, ListeGrubu>();
  const uyarilar: string[] = [];
  let kaydirilan = 0;
  for (const sayfa of sayfalar) {
    let baslikNo = -1;
    let sutun: Sutunlar | null = null;
    for (let r = 0; r < Math.min(10, sayfa.satirlar.length) && baslikNo < 0; r++) {
      const s = baslikSutunlari(sayfa.satirlar[r] || []);
      if (s) { baslikNo = r; sutun = s; }
    }
    if (baslikNo < 0 || !sutun) {
      if (sayfa.satirlar.some((x) => x && x.some((v) => yazi(v)))) uyarilar.push(`"${sayfa.ad}" sayfasında "Firma / Mail" başlığı bulunamadı; atlandı.`);
      continue;
    }
    const ulke = sayfaUlkesi(sayfa.ad);
    let bolum: string | null = null;
    for (let r = baslikNo + 1; r < sayfa.satirlar.length; r++) {
      const h = sayfa.satirlar[r] || [];
      const al = (i?: number) => (i === undefined ? "" : yazi(h[i]));
      let firma = al(sutun.firma), kisi = al(sutun.kisi), mail = al(sutun.mail), telefon = al(sutun.telefon), fax = al(sutun.fax);
      const adres = al(sutun.adres), not = al(sutun.not);
      if (![firma, kisi, mail, telefon, fax, adres, not].some((x) => x && !BOS_FIRMA.test(x))) continue;
      const b = bolumBasligi(firma, [kisi, mail, telefon, fax, adres, not]);
      if (b) { bolum = b; continue; }
      // Bir sutun saga kaymis satir (Firma sutununda ulke adi, e-posta Telefon sutununda)
      let kaydirildi = false;
      if (telefon.includes("@") && !mail.includes("@")) {
        [firma, kisi, mail, telefon, fax] = [kisi, mail, telefon, fax, ""];
        kaydirildi = true;
        kaydirilan++;
      }
      let firmaKisidenAlindi = false;
      if (BOS_FIRMA.test(firma)) {
        const ilkKisi = kisi.split(/\n|;|,/)[0].trim();
        if (!ilkKisi || BOS_FIRMA.test(ilkKisi)) { uyarilar.push(`"${sayfa.ad}" satır ${r + 1}: firma ve kişi adı boş; atlandı.`); continue; }
        firma = ilkKisi;
        firmaKisidenAlindi = true;
      }
      const kod = bolum ? `${sayfa.ad} › ${bolum}` : sayfa.ad;
      let g = gruplar.get(kod);
      if (!g) {
        const hizmet = !!bolum && HIZMET_BOLUMLERI.has(sade(bolum).replace(/\s+/g, " "));
        const neden = !ulke ? "Ülke sayfası değil" : ulke === "TÜRKİYE" ? "Türkiye (iç piyasa)" : hizmet ? "Hizmet / ofis bölümü" : null;
        g = { kod, sayfa: sayfa.ad, bolum, ulke, satir: 0, dahil: !neden, neden };
        gruplar.set(kod, g);
      }
      g.satir++;
      satirlar.push({ sayfa: sayfa.ad, satir: r + 1, bolum, firma: firma.replace(/\s+/g, " "), kisi, mail, telefon, fax, adres, not, kaydirildi, firmaKisidenAlindi });
    }
  }
  if (satirlar.length === 0) throw new Error(uyarilar[0] || "Excel'de okunabilir firma satırı bulunamadı.");
  if (kaydirilan) uyarilar.unshift(`${kaydirilan} satırda sütunlar bir sağa kaymıştı (e-posta Telefon sütununda); düzeltilerek okundu.`);
  const kisiden = satirlar.filter((s) => s.firmaKisidenAlindi).length;
  if (kisiden) uyarilar.push(`${kisiden} satırda firma adı yoktu; kişi adı firma adı olarak kullanıldı.`);
  return { satirlar, gruplar: Array.from(gruplar.values()), uyarilar, kaydirilan };
}

const EPOSTA_BUL = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/**
 * Mail hucresi: once metnin icinden gecerli adresler cikarilir ("(Mr Choi):x@y.co.kr", "x@y.com(?" -> temiz adres);
 * hic gecerli adres yoksa fuar okuyucusunun davranisi (bozuk adres "duzeltilmeli" isaretiyle saklanir).
 */
export function listeEpostalari(ham: string): { eposta: string; gecerli: boolean }[] {
  const metin = (ham || "").replace(/\n/g, " ");
  const bulunan = Array.from(new Set((metin.match(EPOSTA_BUL) || []).map((e) => e.toLowerCase())));
  if (bulunan.length) return bulunan.map((eposta) => ({ eposta, gecerli: true }));
  return metin.includes("@") ? epostalariAyir(metin) : [];
}

/** "Mr A , Mr B" / satir satir -> ad listesi (unvan satirlari dahil kalir). */
function kisiAdlari(ham: string): string[] {
  return ham.split(/\n|;|,|\s\/\s|\s-\s/).map((x) => x.trim()).filter((x) => x && !BOS_FIRMA.test(x));
}

function kisiEkle(liste: FuarKisi[], yeni: FuarKisi) {
  const ayni = liste.find((k) => (yeni.eposta && k.eposta === yeni.eposta) || (!yeni.eposta && !k.eposta && yeni.telefonlar.some((t) => k.telefonlar.includes(t))));
  if (!ayni) { liste.push(yeni); return; }
  if (!ayni.ad && yeni.ad) ayni.ad = yeni.ad;
  for (const t of yeni.telefonlar) if (!ayni.telefonlar.includes(t)) ayni.telefonlar.push(t);
  if (!ayni.whatsapp && yeni.whatsapp) ayni.whatsapp = yeni.whatsapp;
}

/** Bir satirin firma notu (bos alanlar yazilmaz). */
export function satirNotu(s: ListeSatiri, etiket: string): string {
  const satirlar = [`${etiket} · ${s.sayfa}${s.bolum ? ` › ${s.bolum}` : ""} (satır ${s.satir})`];
  const ekle = (baslik: string, v: string) => { if (v && !BOS_FIRMA.test(v)) satirlar.push(`${baslik}: ${v.replace(/\n/g, " / ")}`); };
  ekle("Not", s.not);
  ekle("Adres", s.adres);
  if (/[A-Za-z(]/.test(s.telefon)) ekle("Telefon", s.telefon);
  ekle("Faks", s.fax);
  if (!s.mail.includes("@")) ekle("Mail sütunu", s.mail);
  if (s.firmaKisidenAlindi) satirlar.push("Listede firma adı yok; kişi adı kullanıldı.");
  return satirlar.join("\n");
}

/**
 * Secili satirlari firma anahtarina gore birlestirir. anahtarlar[i] = satirlar[i].firma icin sunucu anahtari.
 * Kisi eslemesi: ad sayisi = e-posta sayisi ise sirayla eslenir; degilse tum adlar ilk e-postaya yazilir.
 */
export function listeFirmalariniBirlestir(satirlar: ListeSatiri[], anahtarlar: string[], etiket: string): ListeFirma[] {
  const harita = new Map<string, ListeFirma>();
  satirlar.forEach((s, i) => {
    let a = anahtarlar[i] || "";
    if (!a) return;
    const ulke = sayfaUlkesi(s.sayfa);
    let ad = s.firma;
    // Kisa / genel ad ("trader") baska ulke sayfasinda baska firmadir: ulke adiyla ayrilir
    const onceki = harita.get(a);
    if (onceki && onceki.ulke !== ulke && a.length <= KISA_ANAHTAR) {
      ad = `${s.firma} (${s.sayfa})`;
      a = `${a}${sade(s.sayfa).replace(/[^A-Z0-9]/g, "")}`;
    }
    let f = harita.get(a);
    if (!f) {
      f = { ad, anahtar: a, ulke, ulke_kaynagi: ulke ? "excel" : null, ulke_ham: ulke ? s.sayfa : null, kisiler: [], notlar: "", kaynaklar: [] };
      harita.set(a, f);
    }
    f.kaynaklar.push(`${s.sayfa}:${s.satir}`);
    const not = satirNotu(s, etiket);
    f.notlar = f.notlar ? `${f.notlar}\n\n${not}` : not;

    const { telefonlar, whatsapp } = telefonlariAyir(s.telefon.replace(/\(0\)/g, ""));
    const epostalar = listeEpostalari(s.mail);
    const adlar = kisiAdlari(s.kisi);
    if (epostalar.length === 0) {
      if (telefonlar.length || adlar.length) kisiEkle(f.kisiler, { ad: adlar.join(", ").slice(0, 200) || null, eposta: null, eposta_gecerli: true, telefonlar, whatsapp });
      return;
    }
    const esle = adlar.length === epostalar.length;
    epostalar.forEach((e, j) => kisiEkle(f!.kisiler, {
      ad: (esle ? adlar[j] : j === 0 ? adlar.join(", ") : "").slice(0, 200) || null,
      eposta: e.eposta, eposta_gecerli: e.gecerli,
      telefonlar: j === 0 ? telefonlar : [], whatsapp: j === 0 ? whatsapp : null,
    }));
  });
  return Array.from(harita.values());
}
