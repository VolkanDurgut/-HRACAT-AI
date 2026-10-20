/**
 * DBA BELGESI METIN OKUYUCU (20.10.2026, DBA otomatik yukleme)
 *
 * Kantar programi (Solas) DBA'yi resmi sablondan GERCEK METIN katmanli PDF
 * olarak uretir (JasperReports). Bu dosya, PDF'ten cikarilan metin
 * parcalarindan (metin + sayfadaki x/y konumu) belge alanlarini YAPAY ZEKA
 * KULLANMADAN okur ve siki dogrular.
 *
 * Neden konum: pdf.js (unpdf) metni akis sirasiyla verir; bu sablonda once
 * TUM etiketler sonra TUM degerler gelir. "Etiket: deger" eslesmesi bu yuzden
 * duz metinden guvenli yapilamaz. Etiket sol sutunda (x ~ 51), deger sag
 * sutunda (x ~ 194) ve AYNI satirda (y farki birkac pt) durur.
 *
 * Cift kontrol: etiketten okunan konteyner no / belge no / tartim zamani, sayfanin
 * TAMAMINDA bicime gore aranan tek degerle ayni olmali; konteyner no ISO 6346
 * kontrol hanesinden gecmeli; agirliklar birbiriyle tutarli olmali. Herhangi
 * bir supheli durumda belge OKUNAMADI sayilir (otomatik yuklenmez, personel
 * elle yukler) - yanlis yuklemektense yuklememek.
 *
 * SAF TypeScript: import yok, Deno / Node / tarayici fark etmez (Node'da test edilir).
 */

export type MetinParcasi = { metin: string; x: number; y: number };

/** dba-oku (yapay zeka) ciktisiyla AYNI alan adlari - dba_kontrol_sonucu bu bicimde saklanir. */
export type DbaVerisi = {
  dba_belge_no: string;
  tartim_tarih_saat: string;
  kantar_firma_vergi_no: string;
  kantar_firma_unvan: string;
  kantar_no: string;
  konteyner_no: string;
  konteyner_payload_kg: number;
  konteyner_dara_kg: number;
  dogrulanmis_brut_agirlik_kg: number;
  arac_plaka: string;
  arac_bos_agirlik_kg: number;
  yukleten_unvan: string;
  yuklenecegi_yer: string;
  /** dba-oku ile ayni hesap: payload - dara */
  net_agirlik_kg: number;
};

export type DbaOkumaSonucu = { tamam: true; veri: DbaVerisi } | { tamam: false; hata: string };

/** Sablondaki etiketler (sol sutun). Eslesme bosluk / iki nokta farkini yok sayar. */
const ETIKETLER = {
  belgeNo: "DBA Belge No",
  tartim: "Tartım Tarih/Saat",
  kantarVergiNo: "Kantar Firma Vergi No",
  kantarUnvan: "Kantar Firma Unvan",
  kantarNo: "Kantar No",
  konteynerNo: "Konteyner No",
  payload: "Konteyner Pay Load",
  dara: "Konteyner Dara",
  vgm: "Doğrulanmış Brüt Ağırlık",
  yer: "Yükleneceği Yurtiçi",
  yukleten: "Yükleten Ünvan",
  plaka: "Araç Plaka",
  aracBos: "Araç Boş Ağırlık",
} as const;
type EtiketAnahtari = keyof typeof ETIKETLER;

const BASLIK = "KONTEYNER DOĞRULANMIŞ BRÜT AĞIRLIK BELGESİ";
/** Etiket ile degerin y farki (pt). Sablonda satirlar ~17 pt arali, ayni satir farki <= 4 pt. */
const SATIR_TOLERANSI = 6;
/** Deger sutunu etiket sutununun en az bu kadar sagindadir (sablonda ~143 pt). */
const SUTUN_ARALIGI = 60;

const sade = (s: string) => s.replace(/\s+/g, " ").trim();
const etiketSade = (s: string) => sade(s).replace(/:$/, "").trim().toLocaleUpperCase("tr-TR");

/** ISO 6346 konteyner no kontrol hanesi (sistemdeki 181 konteynerin hepsi gecer, 20.10.2026). */
export function konteynerNoGecerliMi(no: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(no)) return false;
  const deger: Record<string, number> = {};
  let n = 10;
  for (const h of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (n % 11 === 0) n++;
    deger[h] = n++;
  }
  let toplam = 0;
  for (let i = 0; i < 10; i++) {
    const c = no[i];
    toplam += (i < 4 ? deger[c] : Number(c)) * 2 ** i;
  }
  return (toplam % 11) % 10 === Number(no[10]);
}

/** "28.380 KG" -> 28380 (binlik ayraci nokta; ondalik yok). Bicim disi -> null. */
function kgOku(s: string | undefined): number | null {
  const m = sade(s || "").match(/^(\d{1,3}(?:\.\d{3})*|\d+)\s*KG$/i);
  return m ? Number(m[1].replace(/\./g, "")) : null;
}

/** Dosya adinin ilk 12 hanesi (Solas: "258720262193_OM GENERAL.pdf"). */
export function dosyaAdindanBelgeNo(dosyaAdi: string): string | null {
  const m = String(dosyaAdi || "").match(/^(\d{12})_/);
  return m ? m[1] : null;
}

/**
 * @param parcalar  PDF'in 1. sayfasindaki metin parcalari (pdf.js getTextContent: str, transform[4], transform[5])
 * @param beklenen  dosya adindan gelen belge no + cihazin kantar no / vergi no'su
 */
export function dbaAlanlariniOku(
  parcalar: MetinParcasi[],
  beklenen: { belgeNo: string; kantarNo: string; kantarVergiNo: string }
): DbaOkumaSonucu {
  const p = parcalar.map((x) => ({ metin: sade(x.metin), x: x.x, y: x.y })).filter((x) => x.metin);
  if (!p.some((x) => x.metin.toLocaleUpperCase("tr-TR") === BASLIK)) {
    return { tamam: false, hata: "Belge bir DBA (Konteyner Doğrulanmış Brüt Ağırlık Belgesi) değil veya şablon değişmiş." };
  }

  // Etiket -> ayni satirdaki en yakin sag sutun degeri
  const oku: Partial<Record<EtiketAnahtari, string>> = {};
  for (const [anahtar, etiket] of Object.entries(ETIKETLER) as [EtiketAnahtari, string][]) {
    const aranan = etiketSade(etiket);
    const etiketler = p.filter((x) => etiketSade(x.metin) === aranan);
    if (etiketler.length !== 1) {
      return { tamam: false, hata: `"${etiket}" alanı belgede ${etiketler.length === 0 ? "bulunamadı" : "birden fazla"}.` };
    }
    const e = etiketler[0];
    const adaylar = p
      .filter((x) => x.x >= e.x + SUTUN_ARALIGI && Math.abs(x.y - e.y) <= SATIR_TOLERANSI)
      .sort((a, b) => Math.abs(a.y - e.y) - Math.abs(b.y - e.y) || a.x - b.x);
    if (adaylar.length === 0) return { tamam: false, hata: `"${etiket}" alanının değeri okunamadı.` };
    // Ayni satirda birden fazla parca varsa (uzun unvan bolunmus olabilir) soldan saga birlestir
    const satirY = adaylar[0].y;
    oku[anahtar] = sade(
      adaylar
        .filter((x) => Math.abs(x.y - satirY) <= 1.5)
        .sort((a, b) => a.x - b.x)
        .map((x) => x.metin)
        .join(" ")
    );
  }

  const tumMetin = p.map((x) => x.metin).join(" ");
  const tekBicim = (re: RegExp) => Array.from(new Set(tumMetin.match(re) || []));

  // --- belge no
  const belgeNo = oku.belgeNo || "";
  if (!/^\d{12}$/.test(belgeNo)) return { tamam: false, hata: `DBA belge no biçimi hatalı ("${belgeNo}").` };
  if (belgeNo !== beklenen.belgeNo) return { tamam: false, hata: `Dosya adındaki belge no (${beklenen.belgeNo}) belgedekiyle (${belgeNo}) aynı değil.` };

  // --- kantar
  if (oku.kantarNo !== beklenen.kantarNo) return { tamam: false, hata: `Kantar no ${oku.kantarNo} — bu cihaz için ${beklenen.kantarNo} bekleniyordu.` };
  if (oku.kantarVergiNo !== beklenen.kantarVergiNo) return { tamam: false, hata: `Kantar firma vergi no (${oku.kantarVergiNo}) beklenen değil.` };
  if (!belgeNo.startsWith(beklenen.kantarNo)) return { tamam: false, hata: "Belge no kantar no ile başlamıyor." };

  // --- konteyner no: etiket + ISO 6346 + sayfada TEK konteyner no
  const konteynerNo = (oku.konteynerNo || "").replace(/\s/g, "").toUpperCase();
  if (!konteynerNoGecerliMi(konteynerNo)) return { tamam: false, hata: `Konteyner no geçersiz veya kontrol hanesi tutmuyor ("${oku.konteynerNo}").` };
  const sayfadakiKonteynerler = tekBicim(/\b[A-Z]{4}\d{7}\b/g).filter(konteynerNoGecerliMi);
  if (sayfadakiKonteynerler.length !== 1 || sayfadakiKonteynerler[0] !== konteynerNo) {
    return { tamam: false, hata: "Belgede konteyner numarası tek ve net değil." };
  }

  // --- tartim zamani
  const tartim = oku.tartim || "";
  const t = tartim.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!t) return { tamam: false, hata: `Tartım tarih/saat biçimi hatalı ("${tartim}").` };
  const [gg, aa, yyyy, ss, dd, sn] = t.slice(1).map(Number);
  const tarihNesne = new Date(Date.UTC(yyyy, aa - 1, gg, ss, dd, sn));
  if (tarihNesne.getUTCDate() !== gg || tarihNesne.getUTCMonth() !== aa - 1 || ss > 23 || dd > 59 || sn > 59) {
    return { tamam: false, hata: `Tartım tarihi geçersiz ("${tartim}").` };
  }
  if (!belgeNo.slice(beklenen.kantarNo.length).startsWith(String(yyyy))) {
    return { tamam: false, hata: "Belge no yılı ile tartım yılı uyuşmuyor." };
  }

  // --- agirliklar (kg, tam sayi) ve tutarlilik
  const payload = kgOku(oku.payload);
  const dara = kgOku(oku.dara);
  const vgm = kgOku(oku.vgm);
  const aracBos = kgOku(oku.aracBos);
  if (payload === null || dara === null || vgm === null || aracBos === null) {
    return { tamam: false, hata: "Ağırlık alanlarından biri okunamadı." };
  }
  if (dara < 1000 || dara > 6000) return { tamam: false, hata: `Konteyner darası olağan dışı (${dara} kg).` };
  if (vgm <= dara || vgm > 40000) return { tamam: false, hata: `Doğrulanmış brüt ağırlık olağan dışı (${vgm} kg).` };
  if (payload <= dara || payload > 40000) return { tamam: false, hata: `Konteyner payload olağan dışı (${payload} kg).` };
  if (vgm > payload + dara) return { tamam: false, hata: "Brüt ağırlık, payload + dara toplamını aşıyor." };
  if (aracBos < 3000 || aracBos > 30000) return { tamam: false, hata: `Araç boş ağırlığı olağan dışı (${aracBos} kg).` };

  // --- plaka (bosluksuz Turk plakasi; dba-oku ile ayni bicim "59AGF749")
  const plaka = (oku.plaka || "").replace(/\s/g, "").toUpperCase();
  if (!/^\d{2}[A-Z]{1,3}\d{2,4}$/.test(plaka)) return { tamam: false, hata: `Araç plakası biçimi hatalı ("${oku.plaka}").` };

  const yukleten = oku.yukleten || "";
  const kantarUnvan = oku.kantarUnvan || "";
  const yer = oku.yer || "";
  if (!yukleten || !kantarUnvan || !yer) return { tamam: false, hata: "Yükleten / kantar firması / liman alanlarından biri boş." };

  return {
    tamam: true,
    veri: {
      dba_belge_no: belgeNo,
      tartim_tarih_saat: tartim,
      kantar_firma_vergi_no: oku.kantarVergiNo || "",
      kantar_firma_unvan: kantarUnvan,
      kantar_no: oku.kantarNo || "",
      konteyner_no: konteynerNo,
      konteyner_payload_kg: payload,
      konteyner_dara_kg: dara,
      dogrulanmis_brut_agirlik_kg: vgm,
      arac_plaka: plaka,
      arac_bos_agirlik_kg: aracBos,
      yukleten_unvan: yukleten,
      yuklenecegi_yer: yer,
      net_agirlik_kg: payload - dara,
    },
  };
}
