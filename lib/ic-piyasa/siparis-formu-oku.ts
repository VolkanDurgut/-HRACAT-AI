/**
 * IC PIYASA SIPARIS FORMU OKUYUCU (21.10.2026)
 *
 * Unex'in Excel sablonundan uretilen "SIPARIS FORMU" PDF'i (musteriyle imzalanan,
 * butun sureci baslatan belge; ornek: Alize - Kirik Bugday - 14.10.2026) GERCEK
 * metin katmanina sahiptir. Metin tarayicida pdf.js (unpdf) ile, sayfadaki x/y
 * konumuyla cikarilir ve bu dosyadaki SAF fonksiyonla okunur: yapay zeka yok,
 * sunucuya gitmez, ucretsiz.
 *
 * Neden konum: pdf.js metni akis sirasiyla verir; etiketler ve degerler farkli
 * sirada gelir. Etiket solda, deger AYNI satirda saginda durur. Secimler
 * (urun cinsi, nakliye, odeme) "✔" isaretinin hemen sagindaki metindir.
 *
 * Okunan her bilgi kullaniciya DUZENLENEBILIR olarak gosterilir; kayit ancak
 * kullanici onaylayinca yapilir. Supheli / bulunamayan alan bos doner ve
 * `uyarilar` listesine yazilir (tahmin yok).
 *
 * Taranmis / fotografi cekilmis formda metin yoktur -> `metinYok` (form yine
 * is emrine eklenir, bilgiler elle girilir).
 */

export type MetinParcasi = { metin: string; x: number; y: number };

export type SiparisAlici = {
  unvan: string | null;
  adres: string | null;
  vergiDairesi: string | null;
  /** 10 (VKN) veya 11 (TCKN) hane */
  vergiNo: string | null;
  yetkili: string | null;
  eposta: string | null;
  /** Rakamlar (ör. "05428186620"); ekranda telefonNormallestir ile 90... yapilir */
  telefon: string | null;
};

export type SiparisFormuOkuma = {
  /** YYYY-MM-DD */
  formTarihi: string | null;
  alici: SiparisAlici;
  /** Formda isaretli urun(ler) - ham yazim ("K.BUĞDAY") */
  isaretliUrunler: string[];
  /** Is emrine yazilacak ad ("Kırık Buğday"); tek urun isaretliyse */
  urun: string | null;
  miktar: { ham: string; kg: number | null } | null;
  /** TL/kg; formdaki birim ton ise /1000 */
  fiyat: { ham: string; tlKg: number | null; kdvDahil: boolean | null } | null;
  nakliye: "alici" | "satici" | null;
  teslimYeri: string | null;
  sevkAdresi: string | null;
  teslimSuresiGun: number | null;
  odeme: "pesin" | "vadeli" | null;
  /** Pesin -> 0; vadeli -> "… 30 Gün" */
  vadeGun: number | null;
  vadeAciklama: string | null;
  /** Bos ("-") olmayan urun ozellikleri, formdaki sirayla */
  ozellikler: { ad: string; deger: string }[];
  uyarilar: string[];
};

export type SiparisFormuSonuc =
  | { tamam: true; veri: SiparisFormuOkuma }
  | { tamam: false; neden: "metin_yok" | "form_degil"; hata: string };

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------
const sade = (s: string) => s.replace(/\s+/g, " ").trim();
/** Karsilastirma icin: Turkce harfler katlanir, buyuk harf, noktalama bosluk */
const TR_ASCII: Record<string, string> = { ı: "I", i: "I", İ: "I", ç: "C", Ç: "C", ğ: "G", Ğ: "G", ö: "O", Ö: "O", ş: "S", Ş: "S", ü: "U", Ü: "U" };
export function katla(s: string): string {
  return s.replace(/[ıiİçÇğĞöÖşŞüÜ]/g, (h) => TR_ASCII[h] || h).toUpperCase().replace(/[^A-Z0-9%]/g, " ").replace(/\s+/g, " ").trim();
}

/** Isaret: ✔ ✓ ☑ ✅ veya tek basina X */
const ISARET = /^(?:[✔✓☑✅]|[xX])$/;
const ISARET_BAS = /^[✔✓☑✅]\s*/;

/** "15,25" / "1.250,50" / "19" -> sayi */
function sayi(metin: string): number | null {
  const s = metin.trim();
  let t: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(s)) t = s.replace(",", ".");
  else if (/^\d+\.\d+$/.test(s)) t = s;
  else return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formdaki urun secenekleri -> sistemdeki ad (BASLANGIC_URUNLERI ile ayni yazim) */
const URUN_ADI: Record<string, string> = {
  "BUGDAY": "Buğday",
  "K BUGDAY": "Kırık Buğday",
  "KIRIK BUGDAY": "Kırık Buğday",
  "BONKALIT": "Bonkalit",
  "KEPEK": "Kepek",
  "RAZMOL": "Razmol",
  "KAVUZ": "Kavuz",
};
export function urunAdi(ham: string): string {
  const k = katla(ham);
  if (URUN_ADI[k]) return URUN_ADI[k];
  // Bilinmeyen: ilk harf buyuk (Turkce)
  return sade(ham).toLocaleLowerCase("tr-TR").replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toLocaleUpperCase("tr-TR"));
}

// ---------------------------------------------------------------------------
// Ana fonksiyon
// ---------------------------------------------------------------------------
export function siparisFormunuOku(parcalarHam: MetinParcasi[]): SiparisFormuSonuc {
  // Isaret ile metin bitisik gelebilir ("✔K.BUĞDAY") -> ayir
  const p: MetinParcasi[] = [];
  for (const x of parcalarHam) {
    const m = sade(x.metin || "");
    if (!m) continue;
    const bas = m.match(ISARET_BAS);
    if (bas && m.length > bas[0].length) {
      p.push({ metin: "✔", x: x.x, y: x.y });
      p.push({ metin: m.slice(bas[0].length), x: x.x + 6, y: x.y });
    } else {
      p.push({ metin: m, x: x.x, y: x.y });
    }
  }
  if (p.length < 10) {
    return { tamam: false, neden: "metin_yok", hata: "PDF'te okunabilir metin yok (taranmış ya da fotoğraf olabilir). Bilgileri elle girin; form yine iş emrine eklenir." };
  }
  const bul = (etiket: string) => p.filter((x) => katla(x.metin).replace(/ ?:$/, "") === katla(etiket));
  const tek = (etiket: string) => {
    const l = bul(etiket);
    return l.length === 1 ? l[0] : null;
  };

  const baslik = tek("SİPARİŞ FORMU");
  const aliciEtiket = tek("ALICI FİRMA ADI");
  if (!baslik || !aliciEtiket) {
    return { tamam: false, neden: "form_degil", hata: "Belge Unex sipariş formu değil (\"SİPARİŞ FORMU\" / \"ALICI FİRMA ADI\" bulunamadı)." };
  }
  const uyarilar: string[] = [];

  // ---- Ust bilgi (alici) : etiket x < 215, deger x > 225; satir bantlari etiketler arasi orta nokta
  const UST_ETIKETLER = ["ALICI FİRMA ADI", "ADRES", "VERGİ DAİRESİ-VERGİ NO/T.C. NO", "YETKİLİ KİŞİ", "İLETİŞİM BİLGİLERİ"] as const;
  const ustEtiketler = UST_ETIKETLER.map((e) => {
    const adaylar = bul(e).filter((x) => x.x < 215);
    return adaylar.length === 1 ? adaylar[0] : null;
  });
  const ustDeger = (i: number): string | null => {
    const e = ustEtiketler[i];
    if (!e) return null;
    const onceki = ustEtiketler.slice(0, i).reverse().find(Boolean) || null;
    const sonraki = ustEtiketler.slice(i + 1).find(Boolean) || null;
    const ust = onceki ? (onceki.y + e.y) / 2 : e.y + 9;
    const alt = sonraki ? (sonraki.y + e.y) / 2 : e.y - 9;
    const degerler = p
      .filter((x) => x.x > e.x + 200 && x.y < ust && x.y > alt && x.metin !== ":")
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const metin = sade(degerler.map((x) => x.metin).join(" "));
    return metin || null;
  };
  const unvan = ustDeger(0);
  const adres = ustDeger(1);
  const vdHam = ustDeger(2);
  const yetkiliHam = ustDeger(3);
  const iletisimHam = ustDeger(4);

  let vergiDairesi: string | null = null;
  let vergiNo: string | null = null;
  if (vdHam) {
    const m = vdHam.match(/^(.*?)[\s\-/:]*(\d{10,11})\s*$/);
    if (m) {
      vergiNo = m[2];
      vergiDairesi = sade(m[1].replace(/[-/:]+$/, "")) || null;
    } else {
      vergiDairesi = vdHam;
      uyarilar.push("Vergi numarası okunamadı.");
    }
  } else {
    uyarilar.push("Vergi dairesi / numarası bulunamadı.");
  }

  const EPOSTA = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const ikiAlan = [yetkiliHam, iletisimHam].filter(Boolean).join(" ");
  const eposta = ikiAlan.match(EPOSTA)?.[0]?.toLowerCase() || null;
  const telefonHam = (iletisimHam || "").replace(EPOSTA, " ").match(/\+?\d[\d\s()-]{8,}\d/)?.[0] || (yetkiliHam || "").replace(EPOSTA, " ").match(/\+?\d[\d\s()-]{8,}\d/)?.[0] || null;
  const telefon = telefonHam ? telefonHam.replace(/\D/g, "") : null;
  let yetkili = yetkiliHam ? sade(yetkiliHam.replace(EPOSTA, " ").replace(/\+?\d[\d\s()-]{8,}\d/, " ")) || null : null;
  if (yetkili && !/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(yetkili)) yetkili = null;
  if (!unvan) uyarilar.push("Alıcı firma adı bulunamadı.");

  // ---- Tarih: "TARİH" etiketinin saginda
  let formTarihi: string | null = null;
  const tarihEtiket = bul("TARİH").find((x) => x.y > aliciEtiket.y);
  const tarihAday = p.find((x) => tarihEtiket && Math.abs(x.y - tarihEtiket.y) <= 4 && x.x > tarihEtiket.x && /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(x.metin));
  if (tarihAday) {
    const [g, a, y] = tarihAday.metin.split(/[./-]/).map(Number);
    const d = new Date(Date.UTC(y, a - 1, g));
    if (d.getUTCFullYear() === y && d.getUTCMonth() === a - 1 && d.getUTCDate() === g) {
      formTarihi = `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
    }
  }
  if (!formTarihi) uyarilar.push("Form tarihi okunamadı.");

  // ---- Secim yardimcisi: banttaki isaretlerin hemen sagindaki metin
  const isaretliSecimler = (ust: number, alt: number, solSinir = -1, sagSinir = 10000): string[] => {
    const bant = p.filter((x) => x.y < ust && x.y > alt && x.x > solSinir && x.x < sagSinir);
    const sonuc: string[] = [];
    for (const i of bant.filter((x) => ISARET.test(x.metin))) {
      const sag = bant
        .filter((x) => !ISARET.test(x.metin) && x.x > i.x && Math.abs(x.y - i.y) <= 3)
        .sort((a, b) => a.x - b.x)[0];
      if (sag && sag.x - i.x < 40) sonuc.push(sag.metin);
    }
    return sonuc;
  };

  // ---- Urun cinsi: "ÜRÜN CİNSİ" ile "ÜRÜN ÖZELLİKLERİ" arasi
  const urunCinsi = tek("ÜRÜN CİNSİ");
  const ozBaslik = tek("ÜRÜN ÖZELLİKLERİ");
  const sevkBaslik = tek("SEVKİYAT VE ÖDEME BİLGİLERİ");
  let isaretliUrunler: string[] = [];
  if (urunCinsi && ozBaslik) {
    isaretliUrunler = Array.from(new Set(isaretliSecimler(urunCinsi.y, ozBaslik.y + 3)));
  }
  let urun: string | null = null;
  if (isaretliUrunler.length === 1) urun = urunAdi(isaretliUrunler[0]);
  else if (isaretliUrunler.length === 0) uyarilar.push("Ürün cinsinde işaretli seçenek bulunamadı.");
  else uyarilar.push(`Birden fazla ürün işaretli (${isaretliUrunler.join(", ")}); her ürün için ayrı iş emri açın.`);

  // ---- Alt sinir: diger kosullar basligi (yoksa sayfanin alti)
  const kosullar = p.find((x) => katla(x.metin).startsWith("SIPARIS FORMU DIGER KOSULLAR"));
  const altSinir = kosullar ? kosullar.y + 3 : 0;

  // ---- Sevkiyat ve odeme (sag tablo): etiket "Xxx :" x ~ 323
  const SAG_ETIKETLER = ["Ürün Miktarı", "Ürün Fiyatı", "Ürün Nakliyesi", "Teslim Yeri", "Sevk Adresi", "Teslim Süresi", "Ödeme", "Vadeli ise"] as const;
  // Form surumleri: "Ürün Fiyatı" (14.10) / "Ürün Kg Fiyatı" (21.10)
  const ESDEGER: Record<string, string[]> = { "Ürün Fiyatı": ["Ürün Kg Fiyatı"] };
  const sagEtiket = (e: string) => {
    const adlar = [e, ...(ESDEGER[e] || [])].map(katla);
    const l = p.filter((x) => adlar.includes(katla(x.metin).replace(/ ?:$/, "")) && (!sevkBaslik || (x.y < sevkBaslik.y && x.x > sevkBaslik.x - 120)) && x.y > altSinir);
    return l.length === 1 ? l[0] : null;
  };
  const sagEtiketler = SAG_ETIKETLER.map(sagEtiket);
  const sagBant = (i: number): { ust: number; alt: number; sol: number } | null => {
    const e = sagEtiketler[i];
    if (!e) return null;
    const onceki = sagEtiketler.slice(0, i).reverse().find(Boolean) || null;
    const sonraki = sagEtiketler.slice(i + 1).find(Boolean) || null;
    return {
      ust: onceki ? (onceki.y + e.y) / 2 : e.y + 9,
      alt: sonraki ? (sonraki.y + e.y) / 2 : Math.max(e.y - 12, altSinir),
      sol: e.x + 60,
    };
  };
  const sagDeger = (i: number): string | null => {
    const b = sagBant(i);
    if (!b) return null;
    const l = p.filter((x) => x.y < b.ust && x.y > b.alt && x.x > b.sol && !ISARET.test(x.metin)).sort((a, c) => c.y - a.y || a.x - c.x);
    return sade(l.map((x) => x.metin).join(" ")) || null;
  };
  const sagSecim = (i: number): string[] => {
    const b = sagBant(i);
    return b ? isaretliSecimler(b.ust, b.alt, b.sol) : [];
  };

  // Miktar: "19 TON" / "25.000 KG"
  let miktar: SiparisFormuOkuma["miktar"] = null;
  const miktarHam = sagDeger(0);
  if (miktarHam) {
    const m = miktarHam.match(/^([\d.,]+)\s*(TON|TN|T|KG|KGM)\b/i);
    const n = m ? sayi(m[1]) : null;
    const birim = m ? katla(m[2]) : "";
    const kg = n === null ? null : birim.startsWith("K") ? n : Math.round(n * 1000 * 100) / 100;
    miktar = { ham: miktarHam, kg: kg !== null && kg > 0 ? kg : null };
    if (miktar.kg === null) uyarilar.push(`Ürün miktarı anlaşılamadı ("${miktarHam}").`);
  } else {
    uyarilar.push("Ürün miktarı bulunamadı.");
  }

  // Fiyat: "15,25 TL/KG + KDV"
  let fiyat: SiparisFormuOkuma["fiyat"] = null;
  const fiyatHam = sagDeger(1);
  if (fiyatHam) {
    const k = katla(fiyatHam);
    const m = fiyatHam.match(/([\d.,]+)/);
    let tlKg = m ? sayi(m[1]) : null;
    const tl = /\b(TL|TRY)\b/.test(k) || k.includes("₺");
    const doviz = /\b(USD|EUR|EURO|DOLAR|\$|€)\b/.test(k) || /[$€]/.test(fiyatHam);
    if (doviz || !tl) {
      uyarilar.push(`Fiyat TL değil ya da birimi okunamadı ("${fiyatHam}"); fiyatı elle girin.`);
      tlKg = null;
    } else if (/\/\s*TON|TL TON/.test(k) || /\/\s*TON/i.test(fiyatHam)) {
      tlKg = tlKg === null ? null : Math.round((tlKg / 1000) * 10000) / 10000;
      uyarilar.push("Fiyat ton başına yazılmış; kg fiyatına çevrildi, kontrol edin.");
    } else if (!/\/\s*KG/i.test(fiyatHam) && !/TL KG/.test(k) && !/\bKG\b/.test(katla(sagEtiketler[1]?.metin || ""))) {
      uyarilar.push("Fiyat birimi (TL/KG) yazmıyor; kg fiyatı varsayıldı, kontrol edin.");
    }
    const kdvDahil = /KDV DAHIL/.test(k) ? true : /\+ ?KDV|KDV HARIC/.test(k) || /\+\s*KDV/i.test(fiyatHam) ? false : null;
    if (kdvDahil === null) uyarilar.push("Fiyatın KDV durumu yazmıyor; kontrol edin.");
    fiyat = { ham: fiyatHam, tlKg: tlKg !== null && tlKg > 0 ? Math.round(tlKg * 100) / 100 : null, kdvDahil };
    if (fiyat.tlKg !== null && tlKg !== null && Math.abs(fiyat.tlKg - tlKg) > 0.0001) uyarilar.push("Fiyat kuruş hassasiyetine yuvarlandı.");
  } else {
    uyarilar.push("Ürün fiyatı bulunamadı.");
  }

  // Nakliye: Alıcıya / Satıcıya
  const nakliyeSecim = sagSecim(2).map(katla);
  let nakliye: SiparisFormuOkuma["nakliye"] = null;
  if (nakliyeSecim.length === 1) nakliye = nakliyeSecim[0].startsWith("ALICI") ? "alici" : nakliyeSecim[0].startsWith("SATICI") ? "satici" : null;
  if (!nakliye) uyarilar.push("Ürün nakliyesi (alıcıya / satıcıya) işareti okunamadı.");

  const teslimYeri = sagDeger(3);
  const sevkAdresi = sagDeger(4);
  let teslimSuresiGun: number | null = null;
  const tsHam = sagDeger(5);
  if (tsHam) {
    const m = katla(tsHam).match(/^(\d{1,3}) ?(GUN|IS GUNU)?$/);
    if (m) teslimSuresiGun = Number(m[1]);
    else uyarilar.push(`Teslim süresi anlaşılamadı ("${tsHam}").`);
  }

  // Odeme: Peşin / Vadeli (+ "Vadeli ise")
  const odemeSecim = sagSecim(6).map(katla);
  let odeme: SiparisFormuOkuma["odeme"] = null;
  if (odemeSecim.length === 1) odeme = odemeSecim[0].startsWith("PESIN") ? "pesin" : odemeSecim[0].startsWith("VADELI") ? "vadeli" : null;
  const vadeAciklama = sagDeger(7);
  let vadeGun: number | null = null;
  if (odeme === "pesin") vadeGun = 0;
  else if (odeme === "vadeli") {
    const m = vadeAciklama ? katla(vadeAciklama).match(/(\d{1,3}) ?GUN/) : null;
    if (m) vadeGun = Number(m[1]);
    else uyarilar.push("Vadeli seçilmiş ama vade günü okunamadı.");
  } else {
    uyarilar.push("Ödeme (peşin / vadeli) işareti okunamadı.");
  }

  // ---- Urun ozellikleri (sol tablo): etiket sutunu en soldaki x; deger etiketin
  // 40pt+ sagi ve sag tablonun solu. Cok satirli etiket ("HCL'de / Çözülmeyen / Kül")
  // degere hizali satirla birlikte, bloku degere en iyi ortalayan satira baglanir.
  const ozellikler: { ad: string; deger: string }[] = [];
  if (ozBaslik) {
    // Sag tablonun etiket sutunu (x ~ 313-323) ozellik degeri sayilmasin
    const sagIlk = sagEtiketler.find(Boolean);
    const sagSutun = sagIlk ? sagIlk.x - 5 : 310;
    const bolge = p.filter((x) => x.y < ozBaslik.y - 3 && x.y > altSinir && x.x < sagSutun && x.metin.trim());
    const etiketX = bolge.length ? Math.min(...bolge.map((x) => x.x)) : 0;
    const etiketler = bolge.filter((x) => x.x < etiketX + 40);
    const satirlar = bolge.filter((x) => x.x >= etiketX + 40).sort((a, b) => b.y - a.y).map((d) => ({ d, adlar: [] as MetinParcasi[] }));
    if (satirlar.length) {
      const serbest: MetinParcasi[] = [];
      for (const e of etiketler) {
        const hizali = satirlar.find((r) => Math.abs(r.d.y - e.y) <= 2);
        if (hizali) hizali.adlar.push(e); else serbest.push(e);
      }
      for (const e of serbest.sort((a, b) => b.y - a.y)) {
        const sapma = (r: { d: MetinParcasi; adlar: MetinParcasi[] }) => {
          const ys = [...r.adlar.map((x) => x.y), e.y];
          return Math.abs(ys.reduce((t, y) => t + y, 0) / ys.length - r.d.y);
        };
        const aday = satirlar.filter((r) => Math.abs(r.d.y - e.y) <= 14).sort((a, b) => sapma(a) - sapma(b))[0];
        if (aday) aday.adlar.push(e);
      }
      for (const r of satirlar) {
        if (/^[-–—]+$/.test(r.d.metin.trim())) continue;
        const ad = sade(r.adlar.sort((a, b) => b.y - a.y).map((x) => x.metin).join(" "));
        if (ad) ozellikler.push({ ad, deger: sade(r.d.metin) });
      }
    }
  }

  return {
    tamam: true,
    veri: {
      formTarihi,
      alici: { unvan, adres, vergiDairesi, vergiNo, yetkili, eposta, telefon },
      isaretliUrunler,
      urun,
      miktar,
      fiyat,
      nakliye,
      teslimYeri,
      sevkAdresi,
      teslimSuresiGun,
      odeme,
      vadeGun,
      vadeAciklama,
      ozellikler,
      uyarilar,
    },
  };
}

// ---------------------------------------------------------------------------
// PDF -> metin parcalari (tarayicida; pdf.js SADECE gerekince yuklenir)
// ---------------------------------------------------------------------------
export async function siparisFormuParcalari(dosya: File | Blob): Promise<MetinParcasi[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await dosya.arrayBuffer()));
  try {
    const sayfa = await pdf.getPage(1);
    const icerik = await sayfa.getTextContent();
    return (icerik.items as { str?: string; transform?: number[] }[])
      .filter((i) => typeof i.str === "string" && Array.isArray(i.transform))
      .map((i) => ({ metin: i.str as string, x: i.transform![4], y: i.transform![5] }));
  } finally {
    try { await pdf.destroy(); } catch { /* yoksay */ }
  }
}

export async function siparisFormuPdfOku(dosya: File | Blob): Promise<SiparisFormuSonuc> {
  return siparisFormunuOku(await siparisFormuParcalari(dosya));
}
