/**
 * GUNLUK RAPOR - ortak hesap (07.10.2026)
 *
 * TEK KAYNAK: hem uygulamadaki /rapor/gunluk sayfasi (Next.js) hem her sabah
 * 08:00 / aksam 17:00 giden rapor maili (edge function gunluk-rapor-gonder)
 * bu dosyayi kullanir; iki cikti ayni sayilari gosterir. Bu yuzden dosya
 * SAF TypeScript'tir: hicbir import yok, Deno / tarayici / Node'a ozel API
 * kullanmaz.
 *
 * Sevkiyat satiri (kullanici ornegi):
 *   "VIADUC HOL HOL SARLU - 4x - LE SOLEIL - Yukleme Tamamlandi ✔"
 *   musteri - sevkiyatin konteyner adedi - cuval (marka) - durum
 *
 * Konteyner adedi = rezervasyonlardaki konteyner adedi toplami (planlanan);
 * rezervasyon yoksa / eklenen daha fazlaysa eklenen konteyner sayisi.
 * "Yuklendi" = konteynerin DBA belgesi yuklenmis (Kantar Paneli ile ayni).
 * Durum: tum planlanan konteynerlerin DBA'si yuklendiyse "tamamlandi",
 * en az biri yuklendiyse "yukleniyor", hic yoksa "bekliyor" (ekranda
 * "Yukleme Baslamadi").
 */

export type RaporDosyasi = {
  id: string;
  dosya_no: string | null;
  alici_firma: string | null;
  marka: string | null;
  /** Fatura PDF'i yuklendiyse fatura kesilmis sayilir (getDosyaAkisDurumu ile ayni kural). */
  fatura_dosya_url?: string | null;
  fatura_no?: string | null;
  fatura_tarihi?: string | null;
  varis_limani?: string | null;
};

/** Sevkiyattaki tek konteyner (plaka / tonaj gosterimi icin). */
export type SevkiyatKonteyneri = {
  konteyner_no: string;
  plaka: string | null;
  muhur_no: string | null;
  /** Gercek net = VGM - Dara; yoksa null. */
  net: number | null;
  yuklendi: boolean;
};

export type RaporRezervasyonu = {
  dosya_id: string;
  konteyner_adedi: number | null;
  booking_no?: string | null;
  gemi_adi?: string | null;
  gemi_kalkis_tarihi?: string | null;
};

export type RaporKonteyneri = {
  id: string;
  dosya_id: string;
  konteyner_no: string;
  muhur_no?: string | null;
  plaka?: string | null;
  marka?: string | null;
  tare_kg?: number | null;
  vgm_kg?: number | null;
  dba_dosya_url?: string | null;
  dba_yukleme_tarihi?: string | null;
  dba_kontrol_sonucu?: unknown;
};

export type SevkiyatDurumu = "tamamlandi" | "yukleniyor" | "bekliyor";

export type SevkiyatSatiri = {
  dosya_id: string;
  dosya_no: string;
  musteri: string;
  marka: string;
  konteynerAdedi: number;
  eklenen: number;
  yuklenen: number;
  /** Rapor gunu yuklenen (tartilan) konteyner sayisi. */
  gunYuklenen: number;
  durum: SevkiyatDurumu;
  /** Son konteyner rapor gunu yuklendiyse true ("bugun tamamlandi"). */
  gunTamamlandi: boolean;
  booking: string | null;
  gemi: string | null;
  etd: string | null;
  faturaKesildi: boolean;
  faturaNo: string | null;
  faturaTarihi: string | null;
  /** Dosyaya eklenmis konteynerler (yuklenenler once, konteyner no sirasiyla). */
  konteynerler: SevkiyatKonteyneri[];
  /** Yuklenen (DBA'li) konteynerlerin gercek net toplami (kg). */
  yuklenenNetKg: number;
  /** Varis limani (gosterim icin buyuk harf; kayit degismez). */
  varisLimani: string | null;
  /**
   * Ekipman dagilimi (07.10.2026). Bos ekipman alininca konteyner no sisteme
   * eklenir, dolup tartilinca DBA yuklenir:
   *   ekipmanAlinan  = sisteme eklenmis konteyner (eklenen)
   *   dolu           = DBA'li (yuklenen)
   *   dolumBekleyen  = ekipmani alinmis ama henuz dolmamis (eklenen - dolu)
   *   ekipmanAlinmayan = rezervasyonda olup henuz eklenmemis (adet - eklenen)
   */
  dolumBekleyen: number;
  ekipmanAlinmayan: number;
};

export type YuklenenKonteyner = {
  id: string;
  konteyner_no: string;
  muhur_no: string | null;
  plaka: string | null;
  /** Gercek net agirlik = VGM - Dara (net_agirlik_kg alani teorik deger tutar). */
  net: number | null;
  saat: string;
  musteri: string;
  marka: string;
  dosya_no: string;
};

export type GunlukRapor = {
  tarih: string;
  sevkiyatlar: SevkiyatSatiri[];
  gunYuklenenler: YuklenenKonteyner[];
  ozet: {
    gunYuklenenKonteyner: number;
    gunYuklenenNetKg: number;
    acikSevkiyat: number;
    tamamlanan: number;
    gunTamamlanan: number;
    yukleniyor: number;
    bekliyor: number;
    /** Acik dosyalarin planlanan (rezervasyondaki) toplam konteyner sayisi. */
    toplamKonteyner: number;
    /** Bunlardan DBA'si yuklenmis olanlar (planlanandan fazlasi sayilmaz). */
    yuklenenKonteyner: number;
    /** Rezervasyonu alinmis ama DBA'si henuz yuklenmemis konteyner = toplam - yuklenen. */
    bekleyenKonteyner: number;
    /** Ekipmani alinmis ama henuz dolmamis konteyner toplami. */
    dolumBekleyen: number;
    /** Acik sevkiyatlardan faturasi kesilmis / kesilmemis olanlar. */
    faturaKesilen: number;
    faturaKesilmeyen: number;
  };
};

/** DBA'dan AI ile cikarilan "DD.MM.YYYY HH:MM[:SS]" -> { gun: YYYY-MM-DD, saat }. */
export function tartimTarihiAyristir(deger: string | null | undefined): { gun: string; saat: string } | null {
  if (!deger) return null;
  const eslesme = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[ ,T]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!eslesme) return null;
  const [, gg, aa, yyyy, ss, dd, sn] = eslesme;
  return { gun: `${yyyy}-${aa}-${gg}`, saat: `${ss}:${dd}:${sn || "00"}` };
}

/**
 * Konteynerin "efektif" tartim gunu/saati: once DBA'daki GERCEK tartim tarihi,
 * yoksa Turkiye saatine cevrilmis sisteme yukleme zamani. Dashboard "Bugun
 * Yuklenen" sayaci, rapor sayfasi ve rapor maili bunu kullanir (29.09.2026).
 */
export function efektifTartimBilgisi(
  dbaKontrolSonucu: unknown,
  dbaYuklemeTarihi: string | null | undefined
): { gun: string; saat: string } | null {
  const ai = tartimTarihiAyristir((dbaKontrolSonucu as { tartim_tarih_saat?: string } | null | undefined)?.tartim_tarih_saat);
  if (ai) return ai;
  if (!dbaYuklemeTarihi) return null;
  const t = new Date(dbaYuklemeTarihi);
  const gun = t.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const saat = t.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour12: false });
  return { gun, saat };
}

/** Istanbul'a gore bugun (YYYY-MM-DD). */
export function istanbulBugun(simdi: Date = new Date()): string {
  return simdi.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}

/** YYYY-MM-DD'ye gun ekler/cikarir (saat dilimi bagimsiz). */
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  const d = new Date(Date.UTC(y, a - 1, g + gun));
  return d.toISOString().slice(0, 10);
}

/** "LE SOLEIL BRAND" -> "LE SOLEIL"; bos ise "". */
function markaSade(m: string | null | undefined): string {
  return String(m || "").replace(/\bBRAND\b/gi, "").replace(/\s+/g, " ").trim();
}

/** Konteynerlerdeki markalar (farkliysa "SAAD & ASLI"), yoksa dosya markasi. */
function sevkiyatMarkasi(dosya: RaporDosyasi, konteynerler: RaporKonteyneri[]): string {
  const markalar: string[] = [];
  for (const k of konteynerler) {
    const m = markaSade(k.marka);
    if (m && !markalar.some((x) => x.toLocaleUpperCase("tr-TR") === m.toLocaleUpperCase("tr-TR"))) markalar.push(m);
  }
  if (markalar.length > 0) return markalar.join(" & ");
  return markaSade(dosya.marka) || "—";
}

const DURUM_SIRASI: Record<SevkiyatDurumu, number> = { tamamlandi: 0, yukleniyor: 1, bekliyor: 2 };

/**
 * @param tarih       rapor gunu (YYYY-MM-DD, Istanbul)
 * @param acikDosyalar ACIK ihracat dosyalari
 * @param rezervasyonlar acik dosyalarin rezervasyonlari
 * @param konteynerler acik dosyalarin konteynerleri + (gun yuklenenler icin)
 *                    sirketin DBA'si yuklenmis TUM konteynerleri; ayni id iki
 *                    kez gelirse bir kez sayilir
 * @param dosyaBilgisi kapali dosyalarda yuklenen konteynerlerin musteri/marka
 *                    bilgisi icin (opsiyonel; acik dosyalar zaten bilinir)
 */
export function gunlukRaporHesapla(
  tarih: string,
  acikDosyalar: RaporDosyasi[],
  rezervasyonlar: RaporRezervasyonu[],
  konteynerler: RaporKonteyneri[],
  dosyaBilgisi: RaporDosyasi[] = []
): GunlukRapor {
  const tekil = new Map<string, RaporKonteyneri>();
  for (const k of konteynerler) tekil.set(k.id, k);
  const tumKonteynerler = Array.from(tekil.values());
  const efektif = new Map<string, { gun: string; saat: string } | null>();
  for (const k of tumKonteynerler) {
    efektif.set(k.id, k.dba_dosya_url ? efektifTartimBilgisi(k.dba_kontrol_sonucu, k.dba_yukleme_tarihi) : null);
  }

  const sevkiyatlar: SevkiyatSatiri[] = [];
  for (const d of acikDosyalar) {
    const kendi = tumKonteynerler.filter((k) => k.dosya_id === d.id);
    const rezler = rezervasyonlar.filter((r) => r.dosya_id === d.id);
    const planlanan = rezler.reduce((t, r) => t + (r.konteyner_adedi || 0), 0);
    const konteynerAdedi = Math.max(planlanan, kendi.length);
    if (konteynerAdedi === 0) continue; // ne rezervasyon ne konteyner: raporda yeri yok
    const yuklenenler = kendi.filter((k) => !!k.dba_dosya_url);
    const gunYuklenen = yuklenenler.filter((k) => efektif.get(k.id)?.gun === tarih).length;
    const durum: SevkiyatDurumu =
      yuklenenler.length >= konteynerAdedi ? "tamamlandi" : yuklenenler.length > 0 ? "yukleniyor" : "bekliyor";
    const sonGun = yuklenenler.map((k) => efektif.get(k.id)?.gun || "").sort().pop() || "";
    const netHesapla = (k: RaporKonteyneri) => (k.vgm_kg != null && k.tare_kg != null ? k.vgm_kg - k.tare_kg : null);
    const sevkKonteynerleri: SevkiyatKonteyneri[] = kendi
      .map((k) => ({ konteyner_no: k.konteyner_no, plaka: k.plaka ?? null, muhur_no: k.muhur_no ?? null, net: netHesapla(k), yuklendi: !!k.dba_dosya_url }))
      .sort((a, b) => Number(b.yuklendi) - Number(a.yuklendi) || a.konteyner_no.localeCompare(b.konteyner_no));
    const ilkRez = [...rezler].sort((a, b) => String(a.gemi_kalkis_tarihi || "").localeCompare(String(b.gemi_kalkis_tarihi || "")))[0];
    sevkiyatlar.push({
      dosya_id: d.id,
      dosya_no: d.dosya_no || "—",
      musteri: (d.alici_firma || "Belirtilmemiş").trim(),
      marka: sevkiyatMarkasi(d, kendi),
      konteynerAdedi,
      eklenen: kendi.length,
      yuklenen: yuklenenler.length,
      gunYuklenen,
      durum,
      gunTamamlandi: durum === "tamamlandi" && sonGun === tarih,
      booking: ilkRez?.booking_no?.trim() || null,
      gemi: ilkRez?.gemi_adi || null,
      etd: ilkRez?.gemi_kalkis_tarihi || null,
      faturaKesildi: !!d.fatura_dosya_url,
      faturaNo: d.fatura_no?.trim() || null,
      faturaTarihi: d.fatura_tarihi || null,
      konteynerler: sevkKonteynerleri,
      yuklenenNetKg: sevkKonteynerleri.reduce((t, k) => t + (k.yuklendi && k.net ? k.net : 0), 0),
      varisLimani: d.varis_limani?.trim() ? d.varis_limani.trim().toLocaleUpperCase("en-US") : null,
      dolumBekleyen: Math.max(0, kendi.length - yuklenenler.length),
      ekipmanAlinmayan: Math.max(0, konteynerAdedi - kendi.length),
    });
  }
  sevkiyatlar.sort(
    (a, b) =>
      DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] ||
      String(a.etd || "9999").localeCompare(String(b.etd || "9999")) ||
      a.musteri.localeCompare(b.musteri, "tr")
  );

  const dosyaHaritasi = new Map<string, RaporDosyasi>();
  for (const d of [...dosyaBilgisi, ...acikDosyalar]) dosyaHaritasi.set(d.id, d);
  const gunYuklenenler: YuklenenKonteyner[] = tumKonteynerler
    .filter((k) => efektif.get(k.id)?.gun === tarih)
    .map((k) => {
      const d = dosyaHaritasi.get(k.dosya_id);
      return {
        id: k.id,
        konteyner_no: k.konteyner_no,
        muhur_no: k.muhur_no ?? null,
        plaka: k.plaka ?? null,
        net: k.vgm_kg != null && k.tare_kg != null ? k.vgm_kg - k.tare_kg : null,
        saat: (efektif.get(k.id)?.saat || "").slice(0, 5),
        musteri: (d?.alici_firma || "—").trim(),
        marka: markaSade(k.marka) || markaSade(d?.marka) || "—",
        dosya_no: d?.dosya_no || "—",
      };
    })
    .sort((a, b) => a.saat.localeCompare(b.saat) || a.konteyner_no.localeCompare(b.konteyner_no));

  return {
    tarih,
    sevkiyatlar,
    gunYuklenenler,
    ozet: {
      gunYuklenenKonteyner: gunYuklenenler.length,
      gunYuklenenNetKg: gunYuklenenler.reduce((t, k) => t + (k.net || 0), 0),
      acikSevkiyat: sevkiyatlar.length,
      tamamlanan: sevkiyatlar.filter((s) => s.durum === "tamamlandi").length,
      gunTamamlanan: sevkiyatlar.filter((s) => s.gunTamamlandi).length,
      yukleniyor: sevkiyatlar.filter((s) => s.durum === "yukleniyor").length,
      bekliyor: sevkiyatlar.filter((s) => s.durum === "bekliyor").length,
      toplamKonteyner: sevkiyatlar.reduce((t, s) => t + s.konteynerAdedi, 0),
      yuklenenKonteyner: sevkiyatlar.reduce((t, s) => t + Math.min(s.yuklenen, s.konteynerAdedi), 0),
      bekleyenKonteyner: sevkiyatlar.reduce((t, s) => t + Math.max(0, s.konteynerAdedi - s.yuklenen), 0),
      dolumBekleyen: sevkiyatlar.reduce((t, s) => t + s.dolumBekleyen, 0),
      faturaKesilen: sevkiyatlar.filter((s) => s.faturaKesildi).length,
      faturaKesilmeyen: sevkiyatlar.filter((s) => !s.faturaKesildi).length,
    },
  };
}

export const DURUM_METNI: Record<SevkiyatDurumu, string> = {
  tamamlandi: "Yükleme Tamamlandı ✔",
  yukleniyor: "Yükleme Devam Ediyor",
  // "Bekleyen konteyner" ozetiyle karismasin diye: hic konteyneri yuklenmemis sevkiyat
  bekliyor: "Yükleme Başlamadı",
};

/**
 * Rozet metni. "Yukleniyor 2/5" yerine "2/5 Yüklendi": 5 konteynerin 2'si
 * DOLDURULUP tartildi (DBA yuklendi). Bos ekipman alimi SAYILMAZ.
 */
export function durumRozetMetni(s: SevkiyatSatiri): string {
  return s.durum === "yukleniyor" ? `${s.yuklenen}/${s.konteynerAdedi} Yüklendi` : DURUM_METNI[s.durum];
}

/** "Ekipman 6/10 · Dolu 3 · Dolum bekleyen 3" (tamamlanan sevkiyatta null). */
export function ekipmanOzetMetni(s: SevkiyatSatiri): string | null {
  if (s.durum === "tamamlandi") return null;
  return `Ekipman ${s.eklenen}/${s.konteynerAdedi} · Dolu ${s.yuklenen} · Dolum bekleyen ${s.dolumBekleyen}`;
}

/** "VIADUC HOL HOL SARLU - 4x - LE SOLEIL - Yükleme Tamamlandı ✔" */
export function sevkiyatSatiriMetni(s: SevkiyatSatiri): string {
  const durum = durumRozetMetni(s);
  return `${s.musteri} - ${s.konteynerAdedi}x - ${s.marka} - ${durum}`;
}
