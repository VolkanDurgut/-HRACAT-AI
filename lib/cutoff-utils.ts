/**
 * Tarih/saat metninden (hem duz "YYYY-MM-DD" tarih hem "YYYY-MM-DDTHH:MM:SS+TZ"
 * bicimini destekler) sadece takvim tarihini HAM olarak cikartir - herhangi bir
 * saat dilimi donusumu YAPMADAN.
 *
 * Neden gerekli: talimat_cutoff / beyanname_cutoff veritabaninda timestamptz
 * olarak saklaniyor ama kaydedilirken saat dilimi belirtilmiyor (bkz.
 * rezervasyon-tab.tsx). Postgres bu durumda degeri UTC sanip "+00" etiketiyle
 * kaydediyor - ama deger aslinda kullanicinin girdigi YEREL (Turkiye) saatidir.
 * new Date(...) ile ayristirmak bu degeri yanlislikla tekrar yerel saate CEVIRIR
 * (3 saat ileri kayar) - ozellikle gec saatlerde (ör. 22:00+) takvim gununu bile
 * bir sonraki gune kaydirabilir. Bu fonksiyon metinden dogrudan okuyarak bu
 * riski tamamen ortadan kaldirir; duz "date" alanlari icin de zararsizdir.
 */
function ayristirHamTarih(dateStr: string): { yil: number; ay: number; gun: number } | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { yil: parseInt(m[1], 10), ay: parseInt(m[2], 10), gun: parseInt(m[3], 10) };
}

/**
 * talimat_cutoff / beyanname_cutoff gibi "yanlislikla UTC etiketli ama aslinda
 * yerel" timestamptz alanlarindan saat:dakika kismini DOGRUDAN metinden okur -
 * new Date(...) ile ayristirip yerel saate CEVIRMEZ. Bu, 16:00 girilen bir
 * cutoff saatinin ekranda 19:00 olarak gorunmesine neden olan hatanin duzeltmesidir.
 */
export function formatCutoffSaat(dateStr: string | null): string {
  if (!dateStr) return "-";
  const m = dateStr.match(/T(\d{2}):(\d{2})/);
  if (!m) return "-";
  return `${m[1]}:${m[2]}`;
}

export function getCutOffDays(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const p = ayristirHamTarih(dateStr);
  if (!p) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(p.yil, p.ay - 1, p.gun);
  cutoff.setHours(0, 0, 0, 0);
  return Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type CutOffStyle = { text: string; color: string; icon: string };

export function getCutOffLabel(dateStr: string | null): CutOffStyle {
  if (!dateStr) return { text: "-", color: "text-slate-400", icon: "" };
  const days = getCutOffDays(dateStr);
  if (days === null) return { text: "-", color: "text-slate-400", icon: "" };
  if (days < 0) return { text: "Gecti", color: "text-red-600 font-semibold", icon: "" };
  if (days === 0) return { text: "Bugun!", color: "text-red-600 font-semibold", icon: "" };
  if (days <= 2) return { text: `${days} Gün`, color: "text-orange-600 font-semibold", icon: "" };
  return { text: `${days} Gün`, color: "text-blue-600", icon: "" };
}

export function isCutoffApproaching(talimatCutoff: string | null, beyannameCutoff: string | null): boolean {
  const tDays = getCutOffDays(talimatCutoff);
  const bDays = getCutOffDays(beyannameCutoff);
  const days: number[] = [];
  if (tDays !== null) days.push(tDays);
  if (bDays !== null) days.push(bDays);
  if (days.length === 0) return false;
  return days.some((d) => d >= 0 && d <= 3);
}

export function formatDateTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

export function formatDateTimeShortTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString("tr-TR");
  const timePart = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

export function formatDateTimeTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "-";
  const cur = currency || "USD";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Sistemde urun birim fiyatlari TON (MT) basina tutulur (orn. $460/MT). Fatura
 * Talimatinda muhasebe KG basina, 3 ondalikli, virgullu ve para birimi
 * sembolsuz format bekliyor (orn. "0,460"). Bu fonksiyon SADECE goruntuleme
 * icindir - veritabanindaki MT bazli deger degismez, hicbir hesaplamada
 * kullanilmaz.
 */
export function formatBirimFiyatKg(tutarPerMt: number | null | undefined): string {
  if (tutarPerMt === null || tutarPerMt === undefined || isNaN(tutarPerMt)) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(tutarPerMt / 1000);
}

/**
 * "Varis Limani" alani proforma-oku AI'i tarafindan "Liman, Ulke" biciminde
 * (orn. "Djibouti Port, Djibouti") tek bir serbest metin olarak dolduruluyor.
 * Ulke, muhasebenin kolayca gorebilmesi icin Fatura Talimatinda AYRI, etiketli
 * bir satir olarak da gosterilir - bu fonksiyon metni bozmadan sondaki virgul
 * sonrasini ulke olarak ayiklar. Virgul yoksa (ulke ayirt edilemiyorsa) null
 * doner - "liman adini ulke gibi tekrar gostermek" yanlis bilgi olur.
 */
export function ulkeAyikla(varisLimani: string | null | undefined): string | null {
  if (!varisLimani) return null;
  const parcalar = varisLimani.split(",");
  if (parcalar.length < 2) return null;
  const ulke = parcalar[parcalar.length - 1].trim();
  return ulke || null;
}

/**
 * "Varis Limani" alanindan ("Liman, Ulke" bicimi, orn. "Djibouti Port,
 * Djibouti") CFR incoterm'inde kullanilacak LIMAN adini ayiklar - ulkeyi
 * DEGIL, cunku CFR her zaman isimlendirilmis bir varis LIMANINA gore
 * tanimlanir (orn. "Berbera Port, Somalia" icin CFR BERBERA denir, CFR
 * SOMALIA degil). Sondaki " Port"/" PORT" ekini atar ve buyuk harfe
 * cevirir (talep: 28.09.2026, ECTN Commercial Invoice). Virgul yoksa
 * (liman ayirt edilemiyorsa) null doner.
 */
export function limanAdiAyikla(varisLimani: string | null | undefined): string | null {
  if (!varisLimani) return null;
  const parcalar = varisLimani.split(",");
  if (parcalar.length < 2) return null;
  const liman = parcalar[0].trim().replace(/\s+port$/i, "").trim();
  return liman ? liman.toUpperCase() : null;
}

/**
 * DIIB No ve DIIB Tarihini tek bir satirda birlestirir (muhasebenin istedigi
 * bicim: "DIIB NO: <no>   TARIH: <tarih>"). Ikisi de bos ise null doner
 * (satir hic gosterilmez); sadece biri doluysa yine de gosterilir.
 */
export function formatDiibBilgisi(diibNo: string | null | undefined, diibTarihi: string | null | undefined): string | null {
  const parcalar: string[] = [];
  if (diibNo) parcalar.push(`DİİB NO: ${diibNo}`);
  if (diibTarihi) parcalar.push(`TARİH: ${formatDateTR(diibTarihi)}`);
  return parcalar.length > 0 ? parcalar.join("   ") : null;
}

/**
 * "Detayli Ambalaj" metninde BIRDEN FAZLA ambalaj/urun segmenti olup olmadigini
 * tespit eder (orn. "2.000 PIECES 25 KG PP BAG, 1.000 PIECES OF 50 KG PP
 * BAGS" - iki AYRI kap sayisi). Konteynerler sekmesindeki toplam kap adedi
 * (tum konteynerlerin "pieces" toplami) TEK bir sayidir ve sistemde hangi
 * konteynerin hangi urun/ambalaj tipine ait oldugu bilgisi TUTULMADIGI icin,
 * coklu segmentli metinlerde bu toplami metnin basina yapistirmak metni
 * BOZAR ve YANLIS bilgi uretir (kok neden incelemesi: 28.09.2026, IHR-2026-0081
 * - "2.000"in yanlislikla 4 konteynerin toplami olan "3.000" ile
 * degistirilmesi). Commercial Invoice ve Packing List uretimi, coklu segment
 * tespit ederse OTOMATIK DUZELTMEYI ATLAMALI ve kullanicinin Dosya Detay'da
 * girdigi metni OLDUGU GIBI kullanmalidir - bkz. invoice-builder.ts
 * buildDetayliAmbalaj, packing-list-builder.ts buildPackingListHtml.
 */
export function detayliAmbalajCokluSegmentli(metin: string): boolean {
  const eslesmeler = metin.match(/\d[\d.,]*\s*(PIECES|PCS|BAGS?|ADET)/gi);
  return !!eslesmeler && eslesmeler.length > 1;
}

export function autoSuggestContainers(totalMiktar: number | null): number | null {
  if (!totalMiktar || totalMiktar <= 0) return null;
  return Math.ceil(totalMiktar / 25);
}

export type FobFreightCifToplamlari = {
  toplamCif: number;
  netNavlunToplam: number | null;
  toplamFob: number | null;
};

/**
 * CIF toplami, Net Navlun (navlun - lokal masraf) ve bunlardan turetilen FOB
 * toplamini hesaplar. TEK DOGRU KAYNAK: hem Fatura Talimati
 * (fatura-talimati-pdf-builder.ts) hem Commercial Invoice'taki ECTN
 * satirlari (invoice-builder.ts -> hesaplaEctnOtomatikDegerler) bu
 * fonksiyonu kullanir.
 *
 * Kok neden incelemesi (29.09.2026, IHR-2026-0084): daha once invoice-builder.ts
 * kendi (yanlis) hesabini yapiyordu - TOTAL FOB alaninda CIF toplamini
 * (navlun dahil, $46.000), FREIGHT alaninda lokal masraf dusulmemis HAM
 * navlunu ($7.200) gosteriyordu. Dogrusu (Fatura Talimatinda zaten
 * dogrulanmis): FOB = CIF - Net Navlun ($40.500), FREIGHT = Net Navlun
 * ($5.500). Iki belge farkli formul kullandigi icin sessizce birbirinden
 * sapmisti - bu fonksiyon o sapmayi bir daha mumkun olmayacak sekilde
 * ortadan kaldirir.
 *
 * konteynerAdedi CAGIRAN TARAFTAN parametre olarak alinir - bu fonksiyon
 * hangi rezervasyon(lar)in konteyner adedinin sayilacagina KARISMAZ (Fatura
 * Talimati TUM rezervasyonlari toplar, Commercial Invoice'taki ECTN ise
 * sadece ilk rezervasyonu kullanir - bu, her rezervasyonun ayri bir evrak
 * seti anlamina geldigi ve mevcut ECTN davranisinin degistirilmesi
 * istenmedigi icin BILEREK boyle birakilmistir, talep: 29.09.2026).
 */
export function hesaplaFobFreightCifToplamlari(
  dosya: { urun_detaylari: unknown; navlun_tutari: number | null; lokal_masraf_tutari?: number | null },
  konteynerAdedi: number
): FobFreightCifToplamlari {
  const urunler = (dosya.urun_detaylari as any[]) || [];
  const toplamCif = urunler.reduce((s, u) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0);

  const navlunBirim = dosya.navlun_tutari;
  const lokalMasrafBirim = (dosya as any).lokal_masraf_tutari as number | null;
  const navlunToplam = navlunBirim != null && konteynerAdedi > 0 ? navlunBirim * konteynerAdedi : null;
  const lokalMasrafToplam = lokalMasrafBirim != null && konteynerAdedi > 0 ? lokalMasrafBirim * konteynerAdedi : null;

  const netNavlunToplam = navlunToplam !== null ? navlunToplam - (lokalMasrafToplam ?? 0) : null;
  const toplamDusulecek =
    navlunToplam !== null && lokalMasrafToplam !== null ? navlunToplam - lokalMasrafToplam : navlunToplam !== null ? navlunToplam : 0;
  const dusulecekVarMi = navlunToplam !== null || lokalMasrafToplam !== null;
  const toplamFob = dusulecekVarMi ? toplamCif - toplamDusulecek : null;

  return { toplamCif, netNavlunToplam, toplamFob };
}

/**
 * Europe/Istanbul saat dilimine gore "bugun"un tarihini "YYYY-MM-DD" olarak
 * dondurur. Tarayicinin/isletim sisteminin kendi saat dilimine GUVENMEZ -
 * boylece "bugun" hesaplarken kullanicinin bilgisayar ayarlarina bagli
 * kaymalar yasanmaz (talep: 29.09.2026).
 */
export function bugunTarihIstanbul(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}

/**
 * DBA belgesinden yapay zeka ile cikarilan "DD.MM.YYYY HH:MM:SS" formatindaki
 * GERCEK tartim tarihini { gun, saat } olarak ayristirir. Bu, konteynerin
 * SISTEME NE ZAMAN YUKLENDIGINDEN (dba_yukleme_tarihi) FARKLI bir bilgidir -
 * personel belgeyi ertesi gun/gec yukleyebilir, bu durumda konteyner yanlis
 * gune dusmemesi icin belgedeki gercek tarih esas alinir. Format tanınamazsa
 * (nadir AI cikarim hatasi) null doner ve cagiran kod yukleme tarihine
 * guvenli sekilde geri doner - hicbir konteyner sessizce kaybolmaz.
 */
export function tartimTarihiAyristir(deger: string | null | undefined): { gun: string; saat: string } | null {
  if (!deger) return null;
  const eslesme = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[ ,T]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!eslesme) return null;
  const [, gg, aa, yyyy, ss, dd, sn] = eslesme;
  return { gun: `${yyyy}-${aa}-${gg}`, saat: `${ss}:${dd}:${sn || "00"}` };
}

/**
 * Bir konteyner icin "efektif gun/saat" bilgisini dondurur: once DBA
 * belgesindeki GERCEK tartim tarihi denenir, o yoksa/bozuksa (Turkiye
 * saatine cevrilmis) sistem yukleme tarihine guvenli sekilde doner.
 *
 * TEK DOGRU KAYNAK (talep: 29.09.2026): hem Dashboard'daki "Bugun Yuklenen"
 * sayaci hem Gunluk Ihracat Kantar Raporu bu fonksiyonu kullanir. Daha once
 * Dashboard sadece dba_yukleme_tarihi'ne (sisteme yukleme zamani) bakiyordu,
 * rapor ise bu fonksiyonu kullaniyordu - personel bir DBA belgesini ertesi
 * gun yukledinde iki ekran farkli sayilar gosteriyordu (kok neden incelemesi:
 * 29.09.2026, ör. SEGU1669290 - 28 Eylul'de tartilmis, DBA'si 29 Eylul sabahi
 * yuklenmis, Dashboard "bugun" sayarken rapor dogru sekilde 28 Eylul'e
 * atiyordu). Artik ikisi de ayni gunu gosterir.
 */
export function efektifTartimBilgisi(
  dbaKontrolSonucu: Record<string, unknown> | null | undefined,
  dbaYuklemeTarihi: string | null
): { gun: string; saat: string } | null {
  const aiTarihi = tartimTarihiAyristir((dbaKontrolSonucu as any)?.tartim_tarih_saat);
  if (aiTarihi) return aiTarihi;
  if (!dbaYuklemeTarihi) return null;
  const yuklemeDate = new Date(dbaYuklemeTarihi);
  const gun = yuklemeDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const saat = yuklemeDate.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour12: false });
  return { gun, saat };
}