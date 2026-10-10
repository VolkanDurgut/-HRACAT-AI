import { getCutOffDays } from "@/lib/cutoff-utils";

/**
 * KONTROL MERKEZI (Dashboard) IS AKISI - tek hesap yeri (10.10.2026).
 *
 * Adim sirasi gercek surece gore: Rezervasyon -> Konteyner (ekipman alindi)
 * -> Yukleme (DBA: dolup tartildi) -> Fatura -> Konsimento. Eskiden Fatura
 * DBA'dan once gosteriliyordu; DBA beklenirken fatura "siradaki adim" gibi
 * yaniyordu.
 *
 * Konteyner adedi gunluk raporla AYNI kural: rezervasyonlardaki toplam;
 * eklenen daha fazlaysa o (eskiden "eklenen === rezerve" esitligi arandigi
 * icin fazla konteyner girilen dosyada adim hic tamamlanmiyordu).
 *
 * Cut-off "tamamlandi" kurallari (sistemde beyanname_no fiilen girilmiyor;
 * KANITLANABILIR adimlara baglandi):
 *   Talimat cut-off   -> konsimento talimati yuklendi VEYA Draft BL geldi
 *   Beyanname cut-off -> fatura kesildi (beyanname faturayla verilir)
 * Tamamlanan cut-off kirmizi "Gecti" gostermez (biten iste yanlis alarm).
 *
 * Saf fonksiyon: React / Supabase importu yok, tsx ile test edilir.
 */

export type AkisRezervasyonu = {
  booking_no?: string | null;
  gemi_adi?: string | null;
  konteyner_adedi?: number | null;
  gemi_kalkis_tarihi?: string | null;
  talimat_cutoff?: string | null;
  beyanname_cutoff?: string | null;
};

export type AkisKonteyneri = { dba_dosya_url?: string | null };

export type AkisGirdisi = {
  rezervasyonlar: AkisRezervasyonu[];
  konteynerler: AkisKonteyneri[];
  faturaVar: boolean;
  konsimentoVar: boolean;
  draftBlVar: boolean;
};

export type AkisAdimAnahtari = "rezervasyon" | "konteyner" | "yukleme" | "fatura" | "konsimento";

export type AkisAdimi = {
  anahtar: AkisAdimAnahtari;
  etiket: string;
  tamam: boolean;
  altEtiket?: string;
};

export type CutoffDurumu = {
  /** Takvim gunu farki (getCutOffDays); cut-off yoksa null. */
  gun: number | null;
  /** Ilgili adim bitti mi (bittiyse alarm verilmez). */
  tamam: boolean;
};

export type DosyaAkisi = {
  planlanan: number;
  eklenen: number;
  dbaYuklenen: number;
  /** Raporla ayni: max(planlanan, eklenen). */
  adet: number;
  adimlar: AkisAdimi[];
  /** Ilk tamamlanmamis adim (hepsi tamamsa null). */
  siradaki: AkisAdimAnahtari | null;
  kapatmayaHazir: boolean;
  eksikler: string[];
  talimat: CutoffDurumu;
  beyanname: CutoffDurumu;
  /** ETD'si en yakin rezervasyon (booking/gemi/kalkis bunun). */
  anaRezervasyon: AkisRezervasyonu | null;
  digerRezervasyonSayisi: number;
  /** En erken gemi kalkisi (YYYY-MM-DD...) ve kalan gun. */
  etd: string | null;
  etdGun: number | null;
};

/** ETD'ye gore (bos olanlar sona), esitse talimat cut-off'una gore sirala. */
export function rezervasyonlariSirala<T extends AkisRezervasyonu>(rezler: T[]): T[] {
  const anahtar = (t: string | null | undefined) => (t ? String(t) : "9999");
  return [...rezler].sort(
    (a, b) =>
      anahtar(a.gemi_kalkis_tarihi).localeCompare(anahtar(b.gemi_kalkis_tarihi)) ||
      anahtar(a.talimat_cutoff).localeCompare(anahtar(b.talimat_cutoff))
  );
}

/** Birden fazla rezervasyonda EN ERKEN (en acil) cut-off. Ham deger ISO benzeri; metin karsilastirmasi yeterli. */
function enErken(degerler: (string | null | undefined)[]): string | null {
  const dolu = degerler.filter((d): d is string => !!d).sort();
  return dolu[0] ?? null;
}

export function dosyaAkisiHesapla(g: AkisGirdisi): DosyaAkisi {
  const rezler = rezervasyonlariSirala(g.rezervasyonlar);
  const rezVar = rezler.length > 0;
  const planlanan = rezler.reduce((t, r) => t + (r.konteyner_adedi || 0), 0);
  const eklenen = g.konteynerler.length;
  const dbaYuklenen = g.konteynerler.filter((k) => !!k.dba_dosya_url).length;
  const adet = Math.max(planlanan, eklenen);

  const konteynerTamam = planlanan > 0 && eklenen >= planlanan;
  const yuklemeTamam = adet > 0 && dbaYuklenen >= adet;
  const konsimentoTamam = g.konsimentoVar || g.draftBlVar;

  const adimlar: AkisAdimi[] = [
    { anahtar: "rezervasyon", etiket: "Rezervasyon", tamam: rezVar, altEtiket: rezler[0]?.booking_no || undefined },
    { anahtar: "konteyner", etiket: "Konteyner", tamam: konteynerTamam, altEtiket: rezVar ? `${eklenen}/${planlanan}` : undefined },
    { anahtar: "yukleme", etiket: "Yükleme (DBA)", tamam: yuklemeTamam, altEtiket: adet > 0 ? `${dbaYuklenen}/${adet}` : undefined },
    { anahtar: "fatura", etiket: "Fatura", tamam: g.faturaVar },
    {
      anahtar: "konsimento",
      etiket: "Konşimento",
      tamam: konsimentoTamam,
      altEtiket: g.draftBlVar ? "Draft BL alındı" : g.konsimentoVar ? "Talimat verildi" : undefined,
    },
  ];
  const siradaki = adimlar.find((a) => !a.tamam)?.anahtar ?? null;

  const talimat: CutoffDurumu = { gun: getCutOffDays(enErken(rezler.map((r) => r.talimat_cutoff))), tamam: konsimentoTamam };
  const beyanname: CutoffDurumu = { gun: getCutOffDays(enErken(rezler.map((r) => r.beyanname_cutoff))), tamam: g.faturaVar };

  const eksikler: string[] = [];
  if (!rezVar) eksikler.push("Rezervasyon girilmedi");
  if (rezVar && eklenen < planlanan) eksikler.push(`${planlanan - eklenen} konteyner eksik`);
  if (eklenen > dbaYuklenen) eksikler.push(`${eklenen - dbaYuklenen} DBA bekleniyor`);
  if (yuklemeTamam && !g.faturaVar) eksikler.push("Fatura henüz kesilmedi");
  // Konsimento talimati DBA'dan bagimsiz verilebilir: cut-off yaklastiysa (<= 2 gun / gectiyse)
  // ya da diger her sey bittiyse eksik olarak gosterilir.
  const digerHepsiTamam = rezVar && konteynerTamam && yuklemeTamam && g.faturaVar;
  if (rezVar && !konsimentoTamam && ((talimat.gun !== null && talimat.gun <= 2) || digerHepsiTamam)) {
    eksikler.push("Konşimento talimatı verilmedi");
  }

  const etd = rezler.find((r) => !!r.gemi_kalkis_tarihi)?.gemi_kalkis_tarihi ?? null;

  return {
    planlanan,
    eklenen,
    dbaYuklenen,
    adet,
    adimlar,
    siradaki,
    kapatmayaHazir: siradaki === null,
    eksikler,
    talimat,
    beyanname,
    anaRezervasyon: rezler[0] ?? null,
    digerRezervasyonSayisi: Math.max(0, rezler.length - 1),
    etd,
    etdGun: getCutOffDays(etd),
  };
}
