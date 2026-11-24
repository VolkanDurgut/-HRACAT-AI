"use client";
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya, yazmaHatasi } from "@/lib/supabase";
import { formatCurrency, formatDateTR, formatCutoffSaat, formatCutoffTarihUzun, formatBirimFiyatKg, formatFobBirimFiyatKg, fobBirimFiyati, ulkeAyikla, formatDiibBilgisi } from "@/lib/cutoff-utils";
import { asciiYap, gidecegiUlke, dosyaTicaretUlkesi, TICARET_ULKESI_BELIRSIZ, ULKE_ADLARI, varisLimaniUlkeli } from "@/lib/ulke-bul";
import { ticaretUlkesiKaydet } from "@/lib/dosya/ticaret-ulkesi";
import { useToast } from "@/lib/toast-context";
import { Mail, X, Download } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { indirFaturaTalimatiPdf } from "@/lib/fatura-talimati-pdf-builder";
import { faturaTalimatiBankasi } from "@/lib/supabase/constants";
import { bankaFarki } from "@/lib/proforma-banka";
import { kalemMiktari } from "@/lib/sayi-oku";
import { urunKonteynerDagilimi, konteynerAdetYazi } from "@/lib/urun-konteyner-dagilimi";
import { navlunAliciyaAitMi } from "@/lib/teslim-sekli";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ON_TALIMAT_ISARETI, type FaturaTalimatiDurumu } from "@/lib/fatura-talimati-durum";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { bolunmeUyumsuz, faturaBolunmesi, parcaAgirliklari, parcaAgirlikMetni, urunToplamKg, type TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";
import { DIIB_BOLUNME_OLAYI, dosyaBolunmesiGetir } from "@/lib/diib/veri";
import { birlesikFaturaModeli, birlesikKonu, birlesikTalimatMetni, type BirlesikFaturaModeli } from "@/lib/birlesik-fatura/model";
import { grupTalimatiGonderildi, grupUyeleriniGetir } from "@/lib/birlesik-fatura/veri";
import { beyannameSuresi as birlesikBeyannameSuresi, indirBirlesikTalimatPdf } from "@/lib/birlesik-fatura/pdf";

/** Mail metnindeki bolunme bolumunun basligi (kayitli metinde aranir). */
const BOLUNME_BASLIGI = "FATURA BOLUNMESI";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  /** 03.11.2026: tam | on (rezervasyon / konteyner kesinlesmeden) | yok */
  durum: FaturaTalimatiDurumu;
  eklenenKonteynerAdedi: number;
  rezervasyonKonteynerAdedi: number;
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

export type FaturaTalimatiSectionHandle = { acFatura: () => void; indirFaturaTalimati: () => void };

const FaturaTalimatiSection = forwardRef<FaturaTalimatiSectionHandle, Props>(function FaturaTalimatiSection({
  dosyaId, dosya, konteynerler, rezervasyonlar,
  durum, rezervasyonKonteynerAdedi, onRefresh, companyId,
}, ref) {
  const { showToast } = useToast();
  const on = durum.tur === "on";
  const [onayIslemi, setOnayIslemi] = useState<"ac" | "indir" | null>(null);

  const [showFaturaTalimati, setShowFaturaTalimati] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [konu, setKonu] = useState("");
  const [metin, setMetin] = useState("");

  const talimatGonderildi = !!dosya.fatura_talimati_gonderildi;

  // 19.11.2026: BIRLESIK FATURA (ayni musteri + ayni gemi, tek fatura). Dosya bir gruptaysa talimat GRUBUN tamamindan
  // uretilir (lib/birlesik-fatura); grupta degilse tek dosyalik talimat eskisi gibi.
  const [grupModu, setGrupModu] = useState<{ model: BirlesikFaturaModeli; on: boolean; ids: string[] } | null>(null);
  // 20.11.2026: elle ticaret yapilan ulke (undefined = kayitli deger; null = adresten bul)
  const [elleUlke, setElleUlke] = useState<string | null | undefined>(undefined);
  const [ulkeDuzenle, setUlkeDuzenle] = useState(false);
  const [ulkeGirdi, setUlkeGirdi] = useState("");
  const [ulkeKaydediliyor, setUlkeKaydediliyor] = useState(false);
  useEffect(() => { setElleUlke(undefined); }, [dosya.id, dosya.ticaret_ulkesi]);
  const ticaretUlkesi = grupModu
    ? dosyaTicaretUlkesi(elleUlke !== undefined ? elleUlke : grupModu.model.ticaretUlkesiElle, grupModu.model.aliciAdresi)
    : dosyaTicaretUlkesi(elleUlke !== undefined ? elleUlke : dosya.ticaret_ulkesi ?? null, dosya.alici_adresi);
  const grupModeli = useCallback(async () => {
    if (!companyId || !dosya.id) return null;
    try {
      const g = await grupUyeleriniGetir(companyId, dosya.id);
      if (!g) return null;
      const model = birlesikFaturaModeli(g.uyeler, g.bolunmeliDosyalar);
      return { model, on: model.eksikDosyalar.length > 0, ids: g.uyeler.map((u) => u.dosya.id) };
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Birleşik fatura okunamadı.", "error");
      throw e;
    }
  }, [companyId, dosya.id, showToast]);

  // 04.11.2026: DIIB bolunmesi (iki fatura) - dosyanin DIIB kartinda kaydedilir
  const [bolunme, setBolunme] = useState<TalimatParcaGirdisi[]>([]);
  const bolunmeGetir = useCallback(async () => {
    if (!companyId || !dosya.id) return [] as TalimatParcaGirdisi[];
    const b = await dosyaBolunmesiGetir(companyId, dosya.id);
    setBolunme(b);
    return b;
  }, [companyId, dosya.id]);
  useEffect(() => {
    bolunmeGetir();
    const dinle = () => { bolunmeGetir(); };
    window.addEventListener(DIIB_BOLUNME_OLAYI, dinle);
    return () => window.removeEventListener(DIIB_BOLUNME_OLAYI, dinle);
  }, [bolunmeGetir]);

  const buildKonu = () => [dosya.dosya_no, dosya.alici_firma, rezervasyonKonteynerAdedi ? `${rezervasyonKonteynerAdedi}x` : null, dosya.varis_limani, on ? "ON TALIMAT" : null].filter(Boolean).join(" - ");

  const buildMetin = (parcaGirdi: TalimatParcaGirdisi[] = bolunme) => {
    const urunler = dosya.urun_detaylari || [];
    const rez = rezervasyonlar[0];
    const toplamCif = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0);
    const navlunBirim = dosya.navlun_tutari;
    const lokalMasrafBirim = dosya.lokal_masraf_tutari;
    const navlunToplam = navlunBirim && rezervasyonKonteynerAdedi > 0 ? navlunBirim * rezervasyonKonteynerAdedi : null;
    const lokalMasrafToplam = lokalMasrafBirim && rezervasyonKonteynerAdedi > 0 ? lokalMasrafBirim * rezervasyonKonteynerAdedi : null;
    const toplamDusulecek = navlunToplam !== null && lokalMasrafToplam !== null
      ? navlunToplam - lokalMasrafToplam
      : navlunToplam !== null
      ? navlunToplam
      : 0;
    const dusulecekVarMi = navlunToplam !== null || lokalMasrafToplam !== null;
    // FOB / FCA / FAS / EXW: proforma fiyati ZATEN FOB'dur - navlun dusulmez,
    // CIF yazilmaz (PDF ile ayni kural: hesaplaFobFreightCifToplamlari).
    const fiyatlarFob = navlunAliciyaAitMi(dosya.teslim_sekli);
    const toplamFob = fiyatlarFob ? toplamCif : dusulecekVarMi ? toplamCif - toplamDusulecek : null;
    // 16.11.2026: ton basi FOB icin toplam miktar (MT) - PDF ile ayni (kalemMiktari)
    const toplamMiktarMt = urunler.reduce((s: number, u: any) => s + kalemMiktari(u), 0);
    // Muhasebe talebi (14.10.2026): her urunden kac konteyner / kac MTS (PDF ile ayni hesap).
    const dagilim = urunKonteynerDagilimi(urunler as any[], konteynerler as any[]);
    const adetEki = (u: any, i: number) => {
      const parcalar = [
        konteynerler.length && dagilim.satirlar[i] ? konteynerAdetYazi(dagilim.satirlar[i]) : null,
        kalemMiktari(u) ? `${kalemMiktari(u).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} MTS` : null,
      ].filter(Boolean);
      return parcalar.length ? ` [${parcalar.join(", ")}]` : "";
    };
    const urunSatirlari = urunler.map((u: any, i: number) => {
      const ad = u.urun_adi || u.description || "Urun";
      // Ayni urun adiyla farkli ambalaj boyutunda (orn. 25 KG / 50 KG) birden
      // fazla kalem olabilir - ayirt edilebilmesi icin ambalaj boyutu da yazilir.
      const ambalajBoyutu = u.ambalaj_boyutu || u.packaging_size;
      const cifBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
      // FOB: CIF biriminden ton basina ayni net navlun dusulur (16.11.2026, PDF ile ayni)
      const fobBirim = fobBirimFiyati(cifBirim, toplamCif, toplamFob, toplamMiktarMt);
      // Muhasebe talebi: birim fiyatlar KG basina, virgullu 3 ondalikli, para
      // birimi sembolsuz (orn. "0,460") - PDF versiyonuyla tutarli.
      const birim = dosya.para_birimi || "USD";
      if (fiyatlarFob) return `  - ${ad}${ambalajBoyutu ? ` (${ambalajBoyutu})` : ""}${adetEki(u, i)}: FOB ${formatBirimFiyatKg(cifBirim)} ${birim}/KG`;
      return `  - ${ad}${ambalajBoyutu ? ` (${ambalajBoyutu})` : ""}${adetEki(u, i)}: CIF ${formatBirimFiyatKg(cifBirim)} ${birim}/KG${fobBirim !== null ? ` / FOB ${formatFobBirimFiyatKg(fobBirim)} ${birim}/KG` : ""}`;
    }).join("\n") + (dagilim.eslesmeyen > 0 ? `\n  ! ${dagilim.eslesmeyen} konteynerin markasi hicbir urunle eslesmedi - kontrol edin.` : "");
    const konteynerSatirlari = konteynerler.map((k, i) => {
      // Muhur/Tip/Marka/Kap/Net/Brut/VGM/Tartim Tarihi - sadece dolu olanlar yazilir.
      const detaylar = [
        k.muhur_no ? `Muhur: ${k.muhur_no}` : null,
        k.tip ? `Tip: ${k.tip}` : null,
        (k as any).marka ? `Marka: ${(k as any).marka}` : null,
        (k as any).pieces ? `Kap: ${Number((k as any).pieces).toLocaleString("tr-TR")}` : null,
        k.net_agirlik_kg ? `Net: ${Number(k.net_agirlik_kg).toLocaleString("tr-TR")} KG` : null,
        (k as any).brut_agirlik_kg ? `Brut: ${Number((k as any).brut_agirlik_kg).toLocaleString("tr-TR")} KG` : null,
        (k as any).vgm_kg ? `VGM: ${Number((k as any).vgm_kg).toLocaleString("tr-TR")} KG` : null,
        ((k as any).dba_kontrol_sonucu as any)?.tartim_tarih_saat ? `Tartim Tarihi: ${((k as any).dba_kontrol_sonucu as any).tartim_tarih_saat}` : null,
      ].filter(Boolean).join(", ");
      return `  ${i + 1}. ${k.konteyner_no}${detaylar ? ` (${detaylar})` : ""}`;
    }).join("\n");

    // Konteynerlerin toplam Net/Brut/Kap adedi - manuel formdaki TOPLAM satirina karsilik gelir.
    const toplamNet = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
    const toplamBrut = konteynerler.reduce((s, k) => s + ((k as any).brut_agirlik_kg || 0), 0);
    const toplamKap = konteynerler.reduce((s, k) => s + ((k as any).pieces || 0), 0);

    const satir = (label: string, value: string | number | null | undefined) => {
      if (value === null || value === undefined || value === "" || value === "-") return null;
      return `${label}: ${value}`;
    };

    const dosyaBilgileri = [
      satir("Lot No", dosya.lot_no),
      satir("Alici Firma", dosya.alici_firma),
      satir("Satici Firma", dosya.satici_firma),
      satir("Marka", dosya.marka),
      satir("Proforma No", dosya.proforma_no),
      satir("Ambalaj", dosya.detayli_ambalaj || dosya.ambalaj),
      // Muhasebe talebi: Net/Brut toplam agirlik icin ayri, etiketli bir satir
      // (25.09.2026) - PDF'teki DOSYA BILGILERI bolumundeki yeni satirlarla tutarli.
      satir("Net Agirlik", toplamNet ? `${toplamNet.toLocaleString("tr-TR")} KG` : null),
      satir("Brut Agirlik", toplamBrut ? `${toplamBrut.toLocaleString("tr-TR")} KG` : null),
    ].filter(Boolean).join("\n");

    const beyannameSuresi = rez?.beyanname_cutoff
      ? `${formatCutoffTarihUzun(rez.beyanname_cutoff)} ${formatCutoffSaat(rez.beyanname_cutoff)}`
      : null;

    const lojistikBilgileri = [
      satir("Yukleme Limani", rez?.yuklenme_limani || dosya.yuklenme_limani),
      satir("Varis Limani", dosya.varis_limani ? asciiYap(varisLimaniUlkeli(dosya.varis_limani) ?? "") : null),
      // PDF ile ayni kural (lib/ulke-bul.ts); mailto govdesi ASCII.
      satir("Gidecegi Ulke", asciiYap(gidecegiUlke(dosya.varis_limani) ?? ulkeAyikla(dosya.varis_limani) ?? "")),
      satir("Ticaret Yapilan Ulke", asciiYap(dosyaTicaretUlkesi(elleUlke !== undefined ? elleUlke : dosya.ticaret_ulkesi ?? null, dosya.alici_adresi) ?? TICARET_ULKESI_BELIRSIZ)),
      satir("Teslim Sekli", dosya.teslim_sekli),
      satir("Odeme Sekli", dosya.gumruk_odeme_sekli),
      satir("Gemi Adi", rez?.gemi_adi),
      satir("Acente", rez?.acente_ismi),
      satir("Booking No", rez?.booking_no),
      satir("Beyanname Teslim Suresi", beyannameSuresi),
    ].filter(Boolean).join("\n");

    // Navlun/Lokal Masraf birim ve toplam degerleri ile "All in Navlun Fiyati"
    // (ikisinin konteyner basina toplami) ve Araci Banka - ayri bir bolumde.
    const allInNavlun = navlunBirim != null && lokalMasrafBirim != null ? navlunBirim + lokalMasrafBirim : null;
    const maliyetBilgileri = [
      satir("Navlun (Konteyner Basina)", navlunBirim != null ? formatCurrency(navlunBirim, dosya.para_birimi) : null),
      satir("Toplam Navlun Fiyati", navlunToplam !== null ? formatCurrency(navlunToplam, dosya.para_birimi) : null),
      satir("Lokal Masraflar (Konteyner Basina)", lokalMasrafBirim != null ? formatCurrency(lokalMasrafBirim, dosya.para_birimi) : null),
      satir("All in Navlun Fiyati (Konteyner Basina)", allInNavlun !== null ? formatCurrency(allInNavlun, dosya.para_birimi) : null),
      // 04.11.2026: Araci Banka = proformadaki banka (dosya.banka)
      satir("Araci Banka", faturaTalimatiBankasi(dosya)),
    ].filter(Boolean).join("\n");

    const toplamFobStr = toplamFob !== null ? formatCurrency(toplamFob, dosya.para_birimi) : null;
    const urunFiyatBilgileri = [
      urunSatirlari || null,
      fiyatlarFob ? null : satir("Toplam CIF", formatCurrency(toplamCif, dosya.para_birimi)),
      satir("Toplam FOB", toplamFobStr),
    ].filter(Boolean).join("\n");

    // 04.11.2026: DIIB kalani yetmeyen yukleme -> ayri faturalar (PDF ile ayni hesap)
    const pb = dosya.para_birimi || "USD";
    const parcalar = faturaBolunmesi(urunler, parcaGirdi, fiyatlarFob ? toplamCif : toplamFob);
    // 05.11.2026: her faturanin kap / net / brut'u (PDF ile ayni hesap: parcaAgirliklari)
    const agirliklar = parcaAgirliklari(parcalar, toplamNet, toplamBrut);
    const bolunmeBilgileri = parcalar.length >= 2 ? parcalar.map((p, pi) => [
      `  ${p.sira}. FATURA${p.faturaNo ? ` (${p.faturaNo})` : ""} - DIIB ${p.belgeNo}: ${p.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG, ${fiyatlarFob ? "FOB" : "CIF"} ${formatCurrency(p.tutar, pb)}${p.fobTutar !== null && !fiyatlarFob ? `, FOB ${formatCurrency(p.fobTutar, pb)}` : ""}`,
      `     ${parcaAgirlikMetni(agirliklar[pi], true)}`,
      // 05.11.2026: CIF fiyatli dosyada FOB birim fiyat da (PDF ile ayni hesap: fobBirimFiyati)
      ...p.kalemler.map((k) => {
        const fobBirim = !fiyatlarFob ? fobBirimFiyati(k.birimKg * 1000, toplamCif, toplamFob, toplamMiktarMt) : null;
        return `     - ${k.ad}${k.ambalaj ? ` (${k.ambalaj})` : ""}: ${k.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG x ${fiyatlarFob ? "FOB " : "CIF "}${formatBirimFiyatKg(k.birimKg * 1000)} ${pb}/KG = ${formatCurrency(k.tutar, pb)}${fobBirim !== null ? ` (FOB birim ${formatFobBirimFiyatKg(fobBirim)} ${pb}/KG)` : ""}`;
      }),
    ].join("\n")).join("\n") : null;

    const evrakTarihBilgileri = [
      satir("Beyanname No", dosya.beyanname_no),
      satir("BL No", dosya.bl_no),
      satir("Diib Bilgisi", parcalar.length >= 2
        ? parcalar.map((p) => `${p.sira}. fatura: ${p.belgeNo} (${p.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG)`).join(" / ")
        : formatDiibBilgisi(dosya.diib_no, dosya.diib_tarihi)),
      satir("Uretim Tarihi", dosya.uretim_tarihi ? formatDateTR(dosya.uretim_tarihi) : null),
      satir("Son Kullanim Tarihi", dosya.son_kullanim_tarihi ? formatDateTR(dosya.son_kullanim_tarihi) : null),
    ].filter(Boolean).join("\n");

    const konteynerToplamSatiri = (toplamNet || toplamBrut || toplamKap)
      ? `\n\n  TOPLAM: ${konteynerler.length} Konteyner${toplamKap ? `, ${toplamKap.toLocaleString("tr-TR")} Kap` : ""}${toplamNet ? `, ${toplamNet.toLocaleString("tr-TR")} KG Net` : ""}${toplamBrut ? `, ${toplamBrut.toLocaleString("tr-TR")} KG Brut` : ""}`
      : "";

    const bolumler = [
      `DOSYA BILGILERI\n${dosyaBilgileri}`,
      lojistikBilgileri ? `LOJISTIK BILGILERI\n${lojistikBilgileri}` : null,
      maliyetBilgileri ? `MALIYET VE BANKA BILGILERI\n${maliyetBilgileri}` : null,
      `URUN VE FIYAT BILGILERI\n${urunFiyatBilgileri}`,
      bolunmeBilgileri ? `${BOLUNME_BASLIGI} (${parcalar.length} AYRI FATURA - HER FATURA AYRI DIIB'E)\n${bolunmeBilgileri}` : null,
      `KONTEYNER BILGILERI (${konteynerler.length} adet)\n${konteynerSatirlari || "  -"}${konteynerToplamSatiri}`,
      evrakTarihBilgileri ? `EVRAK VE TARIH BILGILERI\n${evrakTarihBilgileri}` : null,
    ].filter(Boolean).join("\n\n");

    const onNotu = on
      ? `${ON_TALIMAT_ISARETI}\nRezervasyon ve konteyner bilgileri henuz kesinlesmemistir. Fatura asagidaki proforma bilgilerine gore kesilecektir; booking, konteyner ve agirlik bilgileri belirlenince ayrica bildirilecektir.\n\n`
      : "";
    return `${onNotu}Sayin Ilgili,\n\nAsagida belirtilen ihracat dosyasina ait fatura tanzimi icin gerekli bilgiler tarafiniza iletilmistir. Bilgilerinize ve gereginin yapilmasini rica ederiz.\n\n${bolumler}\n\nBilgilerinize arz ederiz.\n\nSaygilarimizla,\nIhracat Departmani`;
  };

  /** Elle ticaret yapilan ulke: dosyaya (birlesikte gruptaki butun dosyalara) yazilir, mail metnindeki satir guncellenir. */
  const ulkeKaydet = async (deger: string | null) => {
    setUlkeKaydediliyor(true);
    const ids = grupModu ? grupModu.ids : [dosya.id];
    const sorun = await ticaretUlkesiKaydet(companyId, ids, deger);
    setUlkeKaydediliyor(false);
    if (sorun) { showToast(`Ülke kaydedilemedi: ${sorun}`, "error"); return; }
    const kayit = deger && deger.trim() ? deger.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR") : null;
    setElleUlke(kayit);
    if (grupModu) setGrupModu({ ...grupModu, model: { ...grupModu.model, ticaretUlkesiElle: kayit } });
    const yeni = grupModu ? dosyaTicaretUlkesi(kayit, grupModu.model.aliciAdresi) : dosyaTicaretUlkesi(kayit, dosya.alici_adresi);
    setMetin((m) => m.replace(/^Ticaret Yapilan Ulke: .*$/m, `Ticaret Yapilan Ulke: ${asciiYap(yeni ?? TICARET_ULKESI_BELIRSIZ)}`));
    setUlkeDuzenle(false);
    showToast("Ticaret yapılan ülke kaydedildi.", "success");
    onRefresh();
  };

  const handleFaturaTalimatiAc = async (onaylandi = false) => {
    const g = await grupModeli().catch(() => undefined);
    if (g === undefined) return;
    if (g) {
      setGrupModu(g);
      setKonu(birlesikKonu(g.model, g.on));
      setMetin(birlesikTalimatMetni(g.model, g.on, {
        gidecegiUlke: asciiYap(gidecegiUlke(g.model.varisLimani) ?? ulkeAyikla(g.model.varisLimani) ?? ""),
        ticaretUlkesi: asciiYap(dosyaTicaretUlkesi(g.model.ticaretUlkesiElle, g.model.aliciAdresi) ?? TICARET_ULKESI_BELIRSIZ),
        beyannameSuresi: birlesikBeyannameSuresi(g.model) || undefined,
      }));
      setTo(""); setCc("");
      setShowFaturaTalimati(true);
      return;
    }
    setGrupModu(null);
    if (durum.tur === "yok") { showToast(durum.neden, "error"); return; }
    if (on && !onaylandi) { setOnayIslemi("ac"); return; }
    const guncelBolunme = await bolunmeGetir();
    setKonu(buildKonu());
    // Kaydedilmis metin SADECE tam talimatta ve on talimat metni degilse kullanilir
    // (on talimatlar kaydedilmez; eski bir on metin tam talimatta yeniden uretilir).
    // 04.11.2026: bolunme varsa ve kayitli metinde bolunme bolumu yoksa metin yeniden uretilir.
    const kayitli = dosya.fatura_talimati_metni;
    const bolunmeEksik = guncelBolunme.length >= 2 && !!kayitli && !kayitli.includes(BOLUNME_BASLIGI);
    setMetin(!on && kayitli && !kayitli.includes(ON_TALIMAT_ISARETI) && !bolunmeEksik ? kayitli : buildMetin(guncelBolunme));
    setTo(""); setCc("");
    setShowFaturaTalimati(true);
  };

  // Modal hic acilmadan, dogrudan PDF indirir - VGM Indir ile ayni davranis
  // (her zaman gorunen ust bar butonu icin). PDF artik metin/konu'dan degil,
  // dogrudan guncel sistem verisinden (kart tasarimi) uretilir - boylece PDF
  // her zaman en guncel dosya/konteyner bilgisini yansitir.
  const handleFaturaTalimatiIndir = async (onaylandi = false) => {
    const g = await grupModeli().catch(() => undefined);
    if (g === undefined) return;
    if (g) { await indirBirlesikTalimatPdf(g.model, g.on); return; }
    if (durum.tur === "yok") { showToast(durum.neden, "error"); return; }
    if (on && !onaylandi) { setOnayIslemi("indir"); return; }
    await indirFaturaTalimatiPdf(dosya, rezervasyonlar, konteynerler, on, await bolunmeGetir());
  };

  const handleMailGonder = async () => {
    const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : "";
    window.open(`mailto:${to}?subject=${encodeURIComponent(konu)}${ccPart}&body=${encodeURIComponent(metin)}`);
    // Birlesik fatura: gruptaki BUTUN dosyalar gonderildi olarak isaretlenir (on talimat isaretlenmez)
    if (grupModu) {
      if (grupModu.on) {
        setShowFaturaTalimati(false);
        showToast("Birleşik ön fatura talimatı maili açıldı. Konteynerler girilince tam talimatı ayrıca gönderin.", "success");
        return;
      }
      const sorun = await grupTalimatiGonderildi(companyId, grupModu.ids, metin);
      if (sorun) { showToast(`Fatura talimatı durumu ${sorun}.`, "error"); return; }
      setShowFaturaTalimati(false);
      showToast(`Birleşik fatura talimatı maili gönderildi (${grupModu.ids.length} dosya işaretlendi).`, "success");
      onRefresh();
      return;
    }
    // On talimat "gonderildi" olarak ISARETLENMEZ (konsimento beklentisi / kayitli metin
    // tam talimata aittir); konteynerler girilince tam talimat ayrica gonderilir.
    if (on) {
      setShowFaturaTalimati(false);
      showToast("Ön fatura talimatı maili açıldı. Konteynerler girilince tam talimatı ayrıca gönderin.", "success");
      return;
    }
    const { data: yazilan, error } = await supabase.from("ihracat_dosyalari").update({
      fatura_talimati_gonderildi: true,
      fatura_talimati_metni: metin,
    }).eq("id", dosyaId).eq("company_id", companyId).select("id");
    const yazmaSorunu = yazmaHatasi(error, yazilan);
    if (yazmaSorunu) {
      showToast(`Fatura talimatı durumu kaydedilemedi: ${yazmaSorunu}`, "error");
      return;
    }
    setShowFaturaTalimati(false);
    showToast("Fatura talimatı maili gönderildi.", "success");
    onRefresh();
  };

  useImperativeHandle(ref, () => ({
    acFatura: () => handleFaturaTalimatiAc(),
    indirFaturaTalimati: () => handleFaturaTalimatiIndir(),
  }));

  return (
    <>
      <ConfirmDialog
        open={onayIslemi !== null}
        onOpenChange={(a) => { if (!a) setOnayIslemi(null); }}
        title="Ön fatura talimatı hazırlansın mı?"
        description={`Bu dosyada ${durum.tur === "on" ? durum.eksikler.join(", ").toLocaleLowerCase("tr-TR") : "bazı bilgiler eksik"}. Talimat proforma bilgileriyle hazırlanır ve üzerinde "ÖN TALİMAT" yazar; konteyner, booking ve ağırlık bilgileri sonradan bildirilir. Filistin (M24) gibi rezervasyondan önce fatura kesilmesi gereken durumlar için kullanın.`}
        confirmLabel={onayIslemi === "indir" ? "Ön talimatı indir" : "Ön talimatı hazırla"}
        cancelLabel="Vazgeç"
        onConfirm={() => { const i = onayIslemi; setOnayIslemi(null); if (i === "indir") handleFaturaTalimatiIndir(true); else handleFaturaTalimatiAc(true); }}
      />
      {showFaturaTalimati && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowFaturaTalimati(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-5 space-y-3 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{grupModu ? (grupModu.on ? "Birleşik Ön Fatura Talimatı Maili" : "Birleşik Fatura Talimatı Maili") : on ? "Ön Fatura Talimatı Maili" : "Fatura Talimatı Maili"}</p>
              <button onClick={() => setShowFaturaTalimati(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            {/* 05.11.2026: ticaret yapilan ulke + bayrak (PDF ile ayni kaynak: alici adresi) */}
            <p className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }} data-testid="talimat-ticaret-ulkesi">
              Ticaret yapılan ülke:
              {ticaretUlkesi
                ? <span className="inline-flex items-center gap-1.5 font-semibold text-white"><UlkeBayrak ulke={ticaretUlkesi} yukseklik={13} />{ticaretUlkesi}</span>
                : <span className="text-amber-300">belirlenemedi (alıcı adresini kontrol edin)</span>}
              {!ulkeDuzenle && (
                <button type="button" onClick={() => { setUlkeGirdi(ticaretUlkesi || ""); setUlkeDuzenle(true); }} className="underline hover:text-white" data-testid="ticaret-ulkesi-degistir">Değiştir</button>
              )}
            </p>
            {ulkeDuzenle && (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="ticaret-ulkesi-duzenle">
                <input list="ticaret-ulkesi-listesi" value={ulkeGirdi} onChange={(e) => setUlkeGirdi(e.target.value)} placeholder="Ülke (ör. SURİNAM)"
                  className="h-8 px-2 rounded-lg border text-white flex-1 min-w-[160px]" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                <datalist id="ticaret-ulkesi-listesi">{ULKE_ADLARI.map((u) => <option key={u} value={u} />)}</datalist>
                <button type="button" disabled={ulkeKaydediliyor || ulkeGirdi.trim().length < 2} onClick={() => ulkeKaydet(ulkeGirdi)}
                  className="h-8 px-3 rounded-lg font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>Kaydet</button>
                <button type="button" disabled={ulkeKaydediliyor} onClick={() => ulkeKaydet(null)} className="h-8 px-3 rounded-lg border hover:bg-white/[0.04]"
                  style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Elle girilen ülkeyi sil; alıcı adresinden bulunsun">Adresten bul</button>
                <button type="button" onClick={() => setUlkeDuzenle(false)} className="h-8 px-2" style={{ color: TEXT_MUTED }}>Vazgeç</button>
              </div>
            )}
            {grupModu && (
              <div className="text-xs rounded-lg border px-3 py-2 space-y-1" style={{ borderColor: "rgba(244,160,124,0.45)", backgroundColor: "rgba(244,160,124,0.08)", color: "#FCD9C6" }} data-testid="birlesik-talimat-notu">
                <p><b className="text-white">Birleşik fatura:</b> {grupModu.model.dosyaSayisi} dosya ({grupModu.model.dosyalar.map((d) => d.dosyaNo).join(", ")}) tek faturada · {grupModu.model.toplam.konteyner} konteyner · {grupModu.model.toplam.mt.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} MTS</p>
                {grupModu.on && <p className="text-amber-300">Konteyner bilgileri eksik: {grupModu.model.eksikDosyalar.join(", ")} (ön talimat; gönderildi olarak işaretlenmez).</p>}
                {grupModu.model.farklar.map((f) => <p key={f} className="text-amber-300">Dikkat: {f}</p>)}
              </div>
            )}
            {!grupModu && bolunmeUyumsuz(urunToplamKg(dosya.urun_detaylari), bolunme) && (
              <p className="text-xs rounded-lg border px-3 py-2 text-red-300" style={{ borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)" }} data-testid="bolunme-uyumsuz">
                DİİB fatura bölünmesi ({bolunme.reduce((t, p) => t + p.kg, 0).toLocaleString("tr-TR")} kg) ürün miktarıyla ({urunToplamKg(dosya.urun_detaylari).toLocaleString("tr-TR")} kg) aynı değil; bölünme talimata YAZILMADI. Önce Proforma sekmesinde ürün miktarını yüklenen miktara göre düzeltin.
              </p>
            )}
            {!grupModu && (() => {
              // 18.11.2026: talimata yazilacak banka proformadakinden farkliysa gonderimden once uyar
              const fark = bankaFarki(faturaTalimatiBankasi(dosya), dosya.ham_veri);
              return fark ? (
                <p className="text-xs rounded-lg border px-3 py-2 text-amber-300" style={{ borderColor: "rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.08)" }} data-testid="talimat-banka-farki">
                  Aracı banka ({faturaTalimatiBankasi(dosya) || "boş"}) proformadaki bankadan ({fark.banka}) farklı. Göndermeden önce Proforma sekmesindeki Banka Bilgileri kartından kontrol edin.
                </p>
              ) : null;
            })()}
            {on && !grupModu && (
              <p className="text-xs rounded-lg border px-3 py-2 text-amber-300" style={{ borderColor: "rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.08)" }} data-testid="on-talimat-notu">
                Ön talimat: rezervasyon / konteyner bilgileri olmadan hazırlandı. Gönderildi olarak işaretlenmez; konteynerler girilince tam talimatı ayrıca gönderin.
              </p>
            )}
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>TO (Alıcı)</p>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="muhasebe@firma.com" type="email" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>CC</p>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc1@firma.com" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Konu</p>
              <input value={konu} onChange={(e) => setKonu(e.target.value)} className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Metin</p>
              <textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={14} className="w-full text-sm px-3 py-2 border rounded-lg font-mono resize-none text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleMailGonder} disabled={!to} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                <Mail size={14} /> Mail Uygulamasını Aç
              </button>
              <button onClick={async () => (grupModu ? indirBirlesikTalimatPdf(grupModu.model, grupModu.on) : indirFaturaTalimatiPdf(dosya, rezervasyonlar, konteynerler, on, await bolunmeGetir()))} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Fatura talimatını PDF olarak indir">
                <Download size={14} /> Fatura Talimatı İndir
              </button>
              <button onClick={() => setShowFaturaTalimati(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>İptal</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default FaturaTalimatiSection;