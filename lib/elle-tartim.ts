// ============================================================================
// ELLE TARTIM KAYDI (26.10.2026)
// ============================================================================
// Kullanici: "DBA tartimi yetkili kantarimizda unutuldu, liman girisinde
// yapildi; DBA belgesini yukleyemiyoruz, bilgileri manuel isleyelim."
//
// Sistemde bir konteynerin "yuklendi" sayilmasi `dba_dosya_url` doluluguna
// bagli (rapor, dashboard, siparis takibi, kantar...). Bu yuzden elle kayit da
// bir PDF uretir ("ELLE GIRILEN TARTIM KAYDI - resmi DBA degildir") ve DBA
// yerine baglanir; alanlar DBA yuklemesiyle AYNI kolonlara yazilir:
//   plaka, tare_kg, vgm_kg, dba_dosya_url/adi/yukleme_tarihi, dba_kontrol_sonucu
// `dba_belge_no` BOS birakilir (dba-otomatik dogrulamasi belge nosu olmayan
// kaydi atlar; bizim urettigimiz PDF'i resmi DBA gibi okumaya calismaz).
// Ayirt etmek icin dba_kontrol_sonucu.elle_giris = true.
// SAF dosya: Node ile test edilir.
// ============================================================================

export const TARTIM_YERLERI = {
  kendi_kantar: "Kendi kantarımız",
  liman: "Liman girişi",
} as const;
export type TartimYeri = keyof typeof TARTIM_YERLERI;

export type ElleTartimFormu = {
  plaka: string;
  daraKg: string;
  netKg: string;
  /** Bos birakilirsa net + dara. */
  vgmKg: string;
  tartimYeri: TartimYeri;
  /** <input type="datetime-local"> degeri: "2026-10-23T14:19" (bos olabilir). */
  girisZamani: string;
  /** Yukleme cikis / tartim zamani (zorunlu). */
  cikisZamani: string;
  /** Limandaki DBA / tartim belgesi no (varsa). */
  limanBelgeNo: string;
  aciklama: string;
};

export type ElleTartimKaydi = {
  elle_giris: true;
  konteyner_no: string;
  arac_plaka: string;
  konteyner_dara_kg: number;
  net_yuk_kg: number;
  dogrulanmis_brut_agirlik_kg: number;
  vgm_hesaplanan: boolean;
  tartim_yeri: string;
  kantar_firma_unvan: string;
  giris_tarih_saat: string | null;
  /** "DD.MM.YYYY HH:MM:SS" - rapordaki "yuklendigi gun" bunu kullanir (DBA ile ayni bicim). */
  tartim_tarih_saat: string;
  liman_belge_no: string | null;
  aciklama: string | null;
  kaydeden: string | null;
  kayit_zamani: string;
  uyusmazliklar: string[];
};

export const VARSAYILAN_ACIKLAMA = "Yetkili kantarımızda DBA tartımı yapılmadı; konteyner liman girişinde tartıldı.";

export function bosElleTartimFormu(): ElleTartimFormu {
  return { plaka: "", daraKg: "", netKg: "", vgmKg: "", tartimYeri: "kendi_kantar", girisZamani: "", cikisZamani: "", limanBelgeNo: "", aciklama: VARSAYILAN_ACIKLAMA };
}

/** "2026-10-23T16:40" -> "23.10.2026 16:40:00" (gecersizse null). */
export function yerelZamaniTrYaz(deger: string): string | null {
  const m = (deger || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, a, g, s, d, sn] = m;
  if (+a < 1 || +a > 12 || +g < 1 || +g > 31 || +s > 23 || +d > 59) return null;
  return `${g}.${a}.${y} ${s}:${d}:${sn || "00"}`;
}

/** "25.120", "25120", "25 120 kg" -> 25120. Tam sayi degilse / bossa null. */
export function kgOku(deger: string): number | null {
  const temiz = (deger || "").replace(/kg/gi, "").replace(/[\s.]/g, "").replace(",", ".");
  if (!temiz) return null;
  const n = Number(temiz);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function plakaTemizle(deger: string): string {
  return (deger || "").toUpperCase().replace(/\s/g, "");
}

/** Bos VGM -> net + dara. */
export function vgmHesapla(f: ElleTartimFormu): number | null {
  const elle = kgOku(f.vgmKg);
  if (elle !== null) return elle;
  const net = kgOku(f.netKg);
  const dara = kgOku(f.daraKg);
  return net !== null && dara !== null ? net + dara : null;
}

/** Alan -> hata metni. Bos nesne = gecerli. */
export function elleTartimHatalari(f: ElleTartimFormu): Partial<Record<keyof ElleTartimFormu, string>> {
  const h: Partial<Record<keyof ElleTartimFormu, string>> = {};
  const plaka = plakaTemizle(f.plaka);
  if (!plaka) h.plaka = "Plaka zorunlu.";
  else if (!/^[0-9]{2}[A-Z]{1,3}[0-9]{2,5}$/.test(plaka)) h.plaka = "Biçim: 59ABC123 gibi.";

  const dara = kgOku(f.daraKg);
  if (dara === null) h.daraKg = "Dara zorunlu (kg, tam sayı).";
  else if (dara < 1500 || dara > 6000) h.daraKg = "Dara 1.500 – 6.000 kg arasında olmalı.";

  const net = kgOku(f.netKg);
  if (net === null) h.netKg = "Net yük zorunlu (kg, tam sayı).";
  else if (net > 35000) h.netKg = "Net yük 35.000 kg'ı geçemez.";

  if (f.vgmKg.trim()) {
    const vgm = kgOku(f.vgmKg);
    if (vgm === null) h.vgmKg = "VGM kg olarak tam sayı olmalı.";
    else if (vgm > 40000) h.vgmKg = "VGM 40.000 kg'ı geçemez.";
    else if (dara !== null && vgm <= dara) h.vgmKg = "VGM daradan büyük olmalı.";
  }

  const cikis = yerelZamaniTrYaz(f.cikisZamani);
  if (!cikis) h.cikisZamani = "Tartım (çıkış) tarihi ve saati zorunlu.";
  else if (new Date(f.cikisZamani).getTime() > Date.now() + 5 * 60 * 1000) h.cikisZamani = "Gelecek bir zaman girilemez.";
  if (f.girisZamani.trim()) {
    if (!yerelZamaniTrYaz(f.girisZamani)) h.girisZamani = "Geçersiz tarih.";
    else if (cikis && f.girisZamani > f.cikisZamani) h.girisZamani = "Giriş, çıkıştan sonra olamaz.";
  }
  return h;
}

/** Gecerli formdan konteynere yazilacak kayit. Gecersizse firlatir. */
export function elleTartimKaydiOlustur(konteynerNo: string, f: ElleTartimFormu, kaydeden: string | null, simdi = new Date()): ElleTartimKaydi {
  const hatalar = elleTartimHatalari(f);
  const ilk = Object.values(hatalar)[0];
  if (ilk) throw new Error(ilk);
  const dara = kgOku(f.daraKg)!;
  const net = kgOku(f.netKg)!;
  const elleVgm = kgOku(f.vgmKg);
  return {
    elle_giris: true,
    konteyner_no: konteynerNo.toUpperCase(),
    arac_plaka: plakaTemizle(f.plaka),
    konteyner_dara_kg: dara,
    net_yuk_kg: net,
    dogrulanmis_brut_agirlik_kg: elleVgm ?? net + dara,
    vgm_hesaplanan: elleVgm === null,
    tartim_yeri: TARTIM_YERLERI[f.tartimYeri],
    kantar_firma_unvan: `ELLE KAYIT · ${TARTIM_YERLERI[f.tartimYeri]}`,
    giris_tarih_saat: f.girisZamani.trim() ? yerelZamaniTrYaz(f.girisZamani) : null,
    tartim_tarih_saat: yerelZamaniTrYaz(f.cikisZamani)!,
    liman_belge_no: f.limanBelgeNo.trim() || null,
    aciklama: f.aciklama.trim() || null,
    kaydeden,
    kayit_zamani: simdi.toISOString(),
    uyusmazliklar: [],
  };
}

/** dba_kontrol_sonucu elle tartim mi? */
export function elleTartimMi(dbaKontrolSonucu: unknown): boolean {
  return !!dbaKontrolSonucu && typeof dbaKontrolSonucu === "object" && (dbaKontrolSonucu as { elle_giris?: unknown }).elle_giris === true;
}
