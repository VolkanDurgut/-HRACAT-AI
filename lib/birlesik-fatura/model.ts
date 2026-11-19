/**
 * BIRLESIK FATURA - fatura talimati modeli (19.11.2026). SAF: veri / ag yok.
 * Kullanici: "Ayni musterinin ayni gemideki butun siparisleri icin tek fatura kesmek istiyoruz. Boyle bir durumda fatura
 * talimatinin ona gore hazirlanmasi gerekir." Grup: fatura_gruplari (migration 20261119110000); dosyalar kullanicinin
 * onayiyla birlestirilir. Bu model gruptaki dosyalardan TEK fatura talimati uretir (PDF: ./pdf.ts, mail metni: asagida).
 *
 * Hesaplar tek dosyalik talimatla AYNI kaynaktan:
 *  - CIF / FOB / net navlun: her dosya icin hesaplaFobFreightCifToplamlari (kendi konteyner adedi ve navlunuyla), sonra toplanir.
 *  - Kalem FOB birimi: fobBirimFiyati(CIF birim, grup CIF, grup FOB, grup MT) -> ton basina ayni net navlun dusulur.
 *  - Konteyner adedi: urunKonteynerDagilimi (dosya bazinda), kalem miktari: kalemMiktari.
 * Ayni urun + ambalaj + birim fiyat kalemleri tek fatura satirinda toplanir; dosya dagilimi ayrica gosterilir.
 * Dosyalar arasinda farkli olan kritik alanlar (para birimi, teslim sekli, banka, varis limani, gemi) "farklar" uyarisidir.
 */
import type { Dosya, Konteyner, Rezervasyon } from "@/lib/supabase";
import { formatCurrency, formatDiibBilgisi, formatBirimFiyatKg, formatFobBirimFiyatKg, fobBirimFiyati, hesaplaFobFreightCifToplamlari } from "@/lib/cutoff-utils";
import { faturaTalimatiBankasi } from "@/lib/supabase/constants";
import { kalemMiktari } from "@/lib/sayi-oku";
import { urunKonteynerDagilimi } from "@/lib/urun-konteyner-dagilimi";

export type GrupUyesi = { dosya: Dosya; rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

export type BirlesikKalem = { ad: string; ambalaj: string; konteyner: number; mt: number; cifBirimMt: number; fobBirimMt: number | null; tutar: number };
export type BirlesikDosyaSatiri = {
  dosyaId: string; dosyaNo: string; proformaNo: string; lotNo: string; bookingNo: string; marka: string;
  konteyner: number; girilenKonteyner: number; mt: number; cif: number; fob: number | null; netNavlun: number | null;
};
export type BirlesikKonteyner = Konteyner & { dosyaNo: string };

export type BirlesikFaturaModeli = {
  dosyaSayisi: number;
  paraBirimi: string;
  fiyatlarFob: boolean;
  aliciFirma: string;
  saticiFirma: string;
  aliciAdresi: string | null;
  varisLimani: string;
  yuklemeLimani: string;
  teslimSekli: string;
  odemeSekli: string;
  gemi: string;
  acente: string;
  banka: string;
  navlunBirim: string;
  lokalBirim: string;
  ambalaj: string;
  markalar: string;
  diib: string;
  blNo: string;
  beyannameNo: string;
  uretim: string;
  skt: string;
  /** En erken beyanname cut-off'u (ISO) */
  beyannameCutoff: string | null;
  dosyalar: BirlesikDosyaSatiri[];
  kalemler: BirlesikKalem[];
  konteynerler: BirlesikKonteyner[];
  toplam: { konteyner: number; girilenKonteyner: number; mt: number; cif: number; fob: number | null; netNavlun: number | null; net: number; brut: number; kap: number; vgm: number };
  /** Dosyalar arasinda farkli kritik alanlar (talimat oncesi kontrol edilmeli) */
  farklar: string[];
  /** Konteynerleri eksik dosyalar (ON talimat) */
  eksikDosyalar: string[];
};

const metin = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();
const sayi = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const tekil = (l: unknown[]) => Array.from(new Set(l.map(metin).filter(Boolean)));
const birlesik = (l: unknown[]) => tekil(l).join(" / ");
const trTarih = (iso: string | null | undefined) => { const m = metin(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
/** Musteri adlari: en kisa ad (adresi karismis uzun yazim yerine; eslesme kurali bas kismi ayni). */
const enKisa = (l: unknown[]) => tekil(l).sort((a, b) => a.length - b.length)[0] || "";

/** "2.000" / "2,000" / "2000" -> 2000 (binlik ayirac); gecersizse null. */
function adetOku(v: string): number | null {
  const t = v.trim();
  const n = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, "")) : Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Birlesik ambalaj metni (19.11.2026, kullanici: "Ambalaj kisminda eksik var"): ayni ambalaj tanimli dosyalar TEKILLESTIRILMEZ,
 * adetleri TOPLANIR. "2.000 PIECES OF 25 KG BAGS (MARKA)" x 4 dosya -> "8.000 PIECES OF 25 KG BAGS (MARKA)".
 * Adet okunamayan metin dosya sayisiyla yazilir ("... (2 dosya)"). Birden cok tanim varsa sonuna toplam adet eklenir.
 */
export function ambalajToplami(metinler: unknown[]): string {
  const sira: string[] = [];
  const adetli = new Map<string, { birim: string; tanim: string; adet: number }>();
  const adetsiz = new Map<string, number>();
  for (const m of metinler.map(metin).filter(Boolean)) {
    const e = m.match(/^([\d.,]+)\s*(PIECES?|PCS|BAGS?|ADET)\s+(?:OF\s+)?(.+)$/i);
    const adet = e ? adetOku(e[1]) : null;
    if (e && adet !== null) {
      const anahtar = `A|${e[2].toUpperCase()}|${e[3].replace(/\s+/g, " ").trim().toUpperCase()}`;
      const k = adetli.get(anahtar);
      if (k) k.adet += adet;
      else { adetli.set(anahtar, { birim: e[2].toUpperCase(), tanim: e[3].replace(/\s+/g, " ").trim(), adet }); sira.push(anahtar); }
    } else {
      const anahtar = `M|${m}`;
      if (!adetsiz.has(anahtar)) sira.push(anahtar);
      adetsiz.set(anahtar, (adetsiz.get(anahtar) || 0) + 1);
    }
  }
  const tr = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  const parcalar = sira.map((a) => {
    const k = adetli.get(a);
    if (k) return `${tr(k.adet)} ${k.birim}${/^(PIECES?|PCS)$/.test(k.birim) ? " OF" : ""} ${k.tanim}`;
    const n = adetsiz.get(a) || 1;
    return n > 1 ? `${a.slice(2)} (${n} dosya)` : a.slice(2);
  });
  const toplamAdet = Array.from(adetli.values()).reduce((t, k) => t + k.adet, 0);
  const birimler = new Set(Array.from(adetli.values()).map((k) => k.birim.replace(/S$/, "")));
  const toplam = parcalar.length > 1 && adetsiz.size === 0 && birimler.size === 1 ? ` (TOPLAM ${tr(toplamAdet)} ${Array.from(adetli.values())[0].birim})` : "";
  return parcalar.join(" / ") + toplam;
}

const kontAdedi = (u: GrupUyesi) => u.rezervasyonlar.reduce((t, r) => t + (r.konteyner_adedi || 0), 0);

export function birlesikFaturaModeli(uyelerHam: GrupUyesi[], bolunmeliDosyalar: string[] = []): BirlesikFaturaModeli {
  const uyeler = [...uyelerHam].sort((a, b) => metin(a.dosya.dosya_no).localeCompare(metin(b.dosya.dosya_no)));
  const ilkRez = (u: GrupUyesi) => u.rezervasyonlar[0] as (Rezervasyon & Record<string, unknown>) | undefined;
  const farklar: string[] = [];
  const kritik = (ad: string, l: unknown[]) => { const t = tekil(l); if (t.length > 1) farklar.push(`${ad} dosyalar arasında farklı: ${t.join(" / ")}`); return t.join(" / "); };

  const paraBirimi = kritik("Para birimi", uyeler.map((u) => u.dosya.para_birimi || "USD")) || "USD";
  const teslimSekli = kritik("Teslim şekli", uyeler.map((u) => u.dosya.teslim_sekli));
  const banka = kritik("Aracı banka", uyeler.map((u) => faturaTalimatiBankasi(u.dosya)));
  const varisLimani = kritik("Varış limanı", uyeler.map((u) => u.dosya.varis_limani));
  const gemi = kritik("Gemi / sefer", uyeler.map((u) => [ilkRez(u)?.gemi_adi, ilkRez(u)?.sefer_no].map(metin).filter(Boolean).join(" ")));
  const odemeSekli = kritik("Ödeme şekli", uyeler.map((u) => u.dosya.gumruk_odeme_sekli));

  const hesap = uyeler.map((u) => ({ u, k: kontAdedi(u), h: hesaplaFobFreightCifToplamlari(u.dosya as never, kontAdedi(u)) }));
  const fobTipleri = tekil(hesap.map((x) => (x.h.fiyatlarFob ? "FOB" : "CIF")));
  if (fobTipleri.length > 1) farklar.push("Fiyat tipi dosyalar arasında farklı (CIF / FOB).");
  const fiyatlarFob = hesap.length > 0 && hesap.every((x) => x.h.fiyatlarFob);
  for (const d of bolunmeliDosyalar) farklar.push(`${d}: DİİB fatura bölünmesi var; birleşik talimatta bölünme yazılmaz, kontrol edin.`);

  const dosyalar: BirlesikDosyaSatiri[] = hesap.map(({ u, k, h }) => ({
    dosyaId: u.dosya.id,
    dosyaNo: metin(u.dosya.dosya_no),
    proformaNo: metin(u.dosya.proforma_no),
    lotNo: metin(u.dosya.lot_no),
    bookingNo: birlesik(u.rezervasyonlar.map((r) => r.booking_no)),
    marka: metin(u.dosya.marka),
    konteyner: k,
    girilenKonteyner: u.konteynerler.length,
    mt: ((u.dosya.urun_detaylari as unknown[]) || []).reduce((t: number, x) => t + kalemMiktari(x as never), 0),
    cif: h.toplamCif,
    fob: h.toplamFob,
    netNavlun: h.netNavlunToplam,
  }));

  const toplam = {
    konteyner: dosyalar.reduce((t, d) => t + d.konteyner, 0),
    girilenKonteyner: dosyalar.reduce((t, d) => t + d.girilenKonteyner, 0),
    mt: dosyalar.reduce((t, d) => t + d.mt, 0),
    cif: dosyalar.reduce((t, d) => t + d.cif, 0),
    fob: dosyalar.every((d) => d.fob !== null) ? dosyalar.reduce((t, d) => t + (d.fob as number), 0) : null,
    netNavlun: dosyalar.some((d) => d.netNavlun !== null) ? dosyalar.reduce((t, d) => t + (d.netNavlun || 0), 0) : null,
    net: uyeler.reduce((t, u) => t + u.konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0), 0),
    brut: uyeler.reduce((t, u) => t + u.konteynerler.reduce((s, k) => s + sayi((k as unknown as Record<string, unknown>).brut_agirlik_kg), 0), 0),
    kap: uyeler.reduce((t, u) => t + u.konteynerler.reduce((s, k) => s + sayi((k as unknown as Record<string, unknown>).pieces), 0), 0),
    vgm: uyeler.reduce((t, u) => t + u.konteynerler.reduce((s, k) => s + sayi((k as unknown as Record<string, unknown>).vgm_kg), 0), 0),
  };

  // Fatura kalemleri: ayni urun + ambalaj + CIF birim (MT) tek satir
  const kalemHarita = new Map<string, BirlesikKalem>();
  for (const u of uyeler) {
    const urunler = ((u.dosya.urun_detaylari as unknown[]) || []) as Record<string, unknown>[];
    const dagilim = urunKonteynerDagilimi(urunler as never, u.konteynerler as never);
    urunler.forEach((x, i) => {
      const ad = metin(x.urun_adi || x.description) || "Ürün";
      const ambalaj = metin(x.ambalaj_boyutu || x.packaging_size);
      const birim = sayi(x.birim_fiyat_usd || x.unit_price);
      const anahtar = `${ad.toUpperCase()}|${ambalaj.toUpperCase()}|${birim}`;
      const k = kalemHarita.get(anahtar) || { ad, ambalaj, konteyner: 0, mt: 0, cifBirimMt: birim, fobBirimMt: null, tutar: 0 };
      // Konteyner: dagilim (konteynerler girildiyse), yoksa tek kalemli dosyada rezervasyon adedi
      k.konteyner += u.konteynerler.length ? (dagilim.satirlar[i]?.konteyner || 0) : urunler.length === 1 ? kontAdedi(u) : 0;
      k.mt += kalemMiktari(x as never);
      k.tutar += sayi(x.toplam_tutar_usd || x.total_amount);
      kalemHarita.set(anahtar, k);
    });
  }
  const kalemler = Array.from(kalemHarita.values()).map((k) => ({
    ...k,
    fobBirimMt: fiyatlarFob ? null : fobBirimFiyati(k.cifBirimMt, toplam.cif, toplam.fob, toplam.mt),
  }));

  const konteynerler: BirlesikKonteyner[] = uyeler.flatMap((u) => u.konteynerler.map((k) => ({ ...k, dosyaNo: metin(u.dosya.dosya_no) })));
  const navlunlar = tekil(uyeler.map((u) => u.dosya.navlun_tutari));
  const lokaller = tekil(uyeler.map((u) => u.dosya.lokal_masraf_tutari));
  const cutofflar = uyeler.flatMap((u) => u.rezervasyonlar.map((r) => metin(r.beyanname_cutoff))).filter(Boolean).sort();

  return {
    dosyaSayisi: uyeler.length,
    paraBirimi,
    fiyatlarFob,
    aliciFirma: enKisa(uyeler.map((u) => u.dosya.alici_firma)),
    saticiFirma: birlesik(uyeler.map((u) => u.dosya.satici_firma)),
    aliciAdresi: uyeler.map((u) => metin(u.dosya.alici_adresi)).find(Boolean) || null,
    varisLimani,
    yuklemeLimani: birlesik(uyeler.map((u) => ilkRez(u)?.yuklenme_limani || u.dosya.yuklenme_limani)),
    teslimSekli,
    odemeSekli,
    gemi,
    acente: birlesik(uyeler.map((u) => ilkRez(u)?.acente_ismi)),
    banka,
    navlunBirim: navlunlar.length === 1 ? formatCurrency(sayi(navlunlar[0]), paraBirimi) : navlunlar.length ? "Dosyaya göre (dağılım tablosu)" : "",
    lokalBirim: lokaller.length === 1 ? formatCurrency(sayi(lokaller[0]), paraBirimi) : lokaller.length ? "Dosyaya göre" : "",
    ambalaj: ambalajToplami(uyeler.map((u) => u.dosya.detayli_ambalaj || u.dosya.ambalaj)),
    markalar: birlesik(uyeler.map((u) => u.dosya.marka)),
    diib: birlesik(uyeler.map((u) => formatDiibBilgisi(u.dosya.diib_no, u.dosya.diib_tarihi))),
    blNo: birlesik(uyeler.map((u) => u.dosya.bl_no)),
    beyannameNo: birlesik(uyeler.map((u) => u.dosya.beyanname_no)),
    uretim: birlesik(uyeler.map((u) => trTarih(u.dosya.uretim_tarihi))),
    skt: birlesik(uyeler.map((u) => trTarih(u.dosya.son_kullanim_tarihi))),
    beyannameCutoff: cutofflar[0] || null,
    dosyalar,
    kalemler,
    konteynerler,
    toplam,
    farklar,
    eksikDosyalar: dosyalar.filter((d) => d.konteyner === 0 || d.girilenKonteyner !== d.konteyner).map((d) => d.dosyaNo),
  };
}

/** Mail / PDF konusu */
export function birlesikKonu(m: BirlesikFaturaModeli, on: boolean): string {
  return ["BIRLESIK FATURA", `${m.dosyaSayisi} DOSYA`, m.aliciFirma, m.toplam.konteyner ? `${m.toplam.konteyner}x` : null, m.varisLimani, on ? "ON TALIMAT" : null]
    .filter(Boolean).join(" - ");
}

/** Fatura talimati mail metni (mailto govdesi; ASCII disi karakterler tek dosyalik talimattaki gibi korunur). */
export function birlesikTalimatMetni(m: BirlesikFaturaModeli, on: boolean, ekBilgi: { gidecegiUlke?: string; ticaretUlkesi?: string; beyannameSuresi?: string } = {}): string {
  const pb = m.paraBirimi;
  const satir = (l: string, v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : `${l}: ${v}`);
  const sayiTr = (n: number, k = 3) => n.toLocaleString("tr-TR", { maximumFractionDigits: k });
  const bolum = (baslik: string, satirlar: (string | null)[]) => { const s = satirlar.filter(Boolean); return s.length ? `${baslik}\n${s.join("\n")}` : null; };
  const bolumler = [
    bolum("BIRLESIK FATURA", [
      `Asagidaki ${m.dosyaSayisi} dosya icin TEK fatura kesilecektir.`,
      ...m.dosyalar.map((d) => `  - ${d.dosyaNo}: Proforma ${d.proformaNo || "-"}, Booking ${d.bookingNo || "-"}, ${d.konteyner} konteyner, ${sayiTr(d.mt)} MTS, ${m.fiyatlarFob ? "FOB" : "CIF"} ${formatCurrency(d.cif, pb)}${!m.fiyatlarFob && d.fob !== null ? ` / FOB ${formatCurrency(d.fob, pb)}` : ""}`),
    ]),
    bolum("DOSYA BILGILERI", [
      satir("Alici Firma", m.aliciFirma), satir("Satici Firma", m.saticiFirma),
      satir("Proforma No", m.dosyalar.map((d) => d.proformaNo).filter(Boolean).join(", ")),
      satir("Lot No", m.dosyalar.map((d) => d.lotNo).filter(Boolean).join(", ")),
      satir("Marka", m.markalar), satir("Ambalaj", m.ambalaj),
      satir("Net Agirlik", m.toplam.net ? `${sayiTr(m.toplam.net, 2)} KG` : null),
      satir("Brut Agirlik", m.toplam.brut ? `${sayiTr(m.toplam.brut, 2)} KG` : null),
    ]),
    bolum("LOJISTIK BILGILERI", [
      satir("Yukleme Limani", m.yuklemeLimani), satir("Varis Limani", m.varisLimani),
      satir("Gidecegi Ulke", ekBilgi.gidecegiUlke), satir("Ticaret Yapilan Ulke", ekBilgi.ticaretUlkesi),
      satir("Teslim Sekli", m.teslimSekli), satir("Odeme Sekli", m.odemeSekli), satir("Gemi Adi", m.gemi), satir("Acente", m.acente),
      satir("Booking No", m.dosyalar.map((d) => d.bookingNo).filter(Boolean).join(", ")),
      satir("Beyanname Teslim Suresi", ekBilgi.beyannameSuresi),
    ]),
    bolum("MALIYET VE BANKA BILGILERI", [
      satir("Navlun (Konteyner Basina)", m.navlunBirim), satir("Toplam Navlun Fiyati (net)", m.toplam.netNavlun !== null ? formatCurrency(m.toplam.netNavlun, pb) : null),
      satir("Lokal Masraflar (Konteyner Basina)", m.lokalBirim), satir("Araci Banka", m.banka),
    ]),
    bolum("FATURA KALEMLERI (TEK FATURA)", [
      ...m.kalemler.map((k) => `  - ${k.ad}${k.ambalaj ? ` (${k.ambalaj})` : ""} [${k.konteyner} konteyner, ${sayiTr(k.mt)} MTS]: ${m.fiyatlarFob ? "FOB" : "CIF"} ${formatBirimFiyatKg(k.cifBirimMt)} ${pb}/KG${k.fobBirimMt !== null ? ` / FOB ${formatFobBirimFiyatKg(k.fobBirimMt)} ${pb}/KG` : ""}`),
      m.fiyatlarFob ? null : satir("Toplam CIF", formatCurrency(m.toplam.cif, pb)),
      satir("Toplam FOB", m.fiyatlarFob ? formatCurrency(m.toplam.cif, pb) : m.toplam.fob !== null ? formatCurrency(m.toplam.fob, pb) : null),
      satir("Toplam Miktar", `${sayiTr(m.toplam.mt)} MTS`),
    ]),
    `KONTEYNER BILGILERI (${m.konteynerler.length} adet)\n${m.konteynerler.map((k, i) => {
      const r = k as unknown as Record<string, unknown>;
      const d = [k.muhur_no ? `Muhur: ${k.muhur_no}` : null, k.tip ? `Tip: ${k.tip}` : null, r.marka ? `Marka: ${r.marka}` : null,
        r.pieces ? `Kap: ${sayiTr(sayi(r.pieces), 0)}` : null, k.net_agirlik_kg ? `Net: ${sayiTr(k.net_agirlik_kg, 2)} KG` : null,
        r.brut_agirlik_kg ? `Brut: ${sayiTr(sayi(r.brut_agirlik_kg), 2)} KG` : null].filter(Boolean).join(", ");
      return `  ${i + 1}. ${k.konteyner_no} [${k.dosyaNo}]${d ? ` (${d})` : ""}`;
    }).join("\n") || "  -"}${m.toplam.net || m.toplam.brut ? `\n\n  TOPLAM: ${m.konteynerler.length} Konteyner${m.toplam.kap ? `, ${sayiTr(m.toplam.kap, 0)} Kap` : ""}${m.toplam.net ? `, ${sayiTr(m.toplam.net, 2)} KG Net` : ""}${m.toplam.brut ? `, ${sayiTr(m.toplam.brut, 2)} KG Brut` : ""}` : ""}`,
    bolum("EVRAK VE TARIH BILGILERI", [
      satir("Beyanname No", m.beyannameNo), satir("BL No", m.blNo), satir("Diib Bilgisi", m.diib),
      satir("Uretim Tarihi", m.uretim), satir("Son Kullanim Tarihi", m.skt),
    ]),
  ].filter(Boolean).join("\n\n");
  const onNotu = on
    ? `*** ON FATURA TALIMATI ***\nKonteyner bilgileri eksik dosyalar: ${m.eksikDosyalar.join(", ")}. Booking, konteyner ve agirlik bilgileri belirlenince ayrica bildirilecektir.\n\n`
    : "";
  return `${onNotu}Sayin Ilgili,\n\nAsagida belirtilen ${m.dosyaSayisi} ihracat dosyasi AYNI MUSTERI ve AYNI GEMIYE ait olup TEK FATURA kesilecektir. Fatura tanzimi icin gerekli bilgiler tarafiniza iletilmistir.\n\n${bolumler}\n\nBilgilerinize arz ederiz.\n\nSaygilarimizla,\nIhracat Departmani`;
}
