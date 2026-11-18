"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ImagePlus, Loader2, Mail, RefreshCw, Save, ScanText, Send, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/lib/auth-context";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import {
  cuvalTarihleriniAyikla, formDurumu, formExcelIndir, formKaydet, gorselAdresi, gorselBlob, gorselSil, gorselYukle, gunEkle, siparisFormlariOku,
  testFormuGonder, trTarih, type CuvalTarihi, type FormDurumu, type FormModeli,
} from "@/lib/siparis-formu";
import { spekTemizle } from "@/supabase/functions/_shared/siparis-formu";

/**
 * SIPARISLER > SIPARIS FORMLARI (18.11.2026). Yukleme planindaki her booking = 1 Siparis Bildirim Formu; uretime
 * (Ayarlar > Rapor Alicilari > Siparis Bildirim Formu) bos ekipman alimindan 1 gun once 08:00'de otomatik gider.
 * 18.11.2026 v2 (kullanici): yalniz CUVAL GORSELI eklenir + URUN SPEKLERI girilir, kaydedilir. Uretim / SKT gorselden
 * tarayicida ucretsiz OCR ile okunur (lib/cuval-ocr.ts): cuvalda ay-yil ("NOVEMBER 2026") yaziyorsa formda o yazilir ve dosyanin
 * Ek Bilgiler tarihleri DEGISMEZ; tam tarih yaziyorsa dosya da guncellenir. Okunamazsa elle yazilabilir. Temsilci sabit.
 */
const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

const DURUM: Record<FormDurumu, { etiket: (m: FormModeli, bugun: string) => string; renk: string; zemin: string }> = {
  gonderildi: { etiket: (m) => `Üretime gönderildi · ${m.gonderim?.zaman ? new Date(m.gonderim.zaman).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}`, renk: "#6EE7B7", zemin: "rgba(16,185,129,0.12)" },
  bugun: { etiket: () => "Bugün 08:00'den itibaren gider", renk: "#FCD34D", zemin: "rgba(245,158,11,0.14)" },
  bekliyor: { etiket: (m, bugun) => (m.gonderimGunu ? (m.gonderimGunu === gunEkle(bugun, 1) ? "Yarın 08:00'de gider" : `${trTarih(m.gonderimGunu)} 08:00'de gider`) : "Ekipman tarihi yok"), renk: "#93C5FD", zemin: "rgba(59,130,246,0.12)" },
  gecikti: { etiket: () => "Bir sonraki taramada gider (ekipman günü)", renk: "#FCA5A5", zemin: "rgba(239,68,68,0.12)" },
  suresi_gecti: { etiket: () => "Ekipman tarihi geçti · otomatik gönderilmez (Test gönder ile gönderin)", renk: "#FCD34D", zemin: "rgba(245,158,11,0.10)" },
};

type OcrDurumu = "yok" | "okunuyor" | "tamam" | "eksik" | "hata";

/** Elle yazilan tarih metni -> ayni ayiklayici (ay-yil ya da tam tarih). */
function elleTarih(metin: string, uretim: boolean): CuvalTarihi | null {
  const t = cuvalTarihleriniAyikla(`${uretim ? "PRODUCTION DATE" : "EXPIRY DATE"}: ${metin}`);
  return uretim ? t.uretim : t.skt;
}

function FormKarti({ m, bugun, companyId, onDegisti }: { m: FormModeli; bugun: string; companyId: string; onDegisti: (mesaj: string) => void }) {
  const kt = m.kayitliTarih;
  const [spek, setSpek] = useState(m.spekKayitli ? m.alanlar.spekler : m.spekOnerisi);
  const [uretim, setUretim] = useState(kt.uretimMetin);
  const [skt, setSkt] = useState(kt.sktMetin);
  const [kaynak, setKaynak] = useState<"gorsel" | "elle" | null>((kt.kaynak as "gorsel" | "elle" | null) || null);
  const [elleAcik, setElleAcik] = useState(kt.kaynak === "elle");
  const [ocr, setOcr] = useState<OcrDurumu>(kt.uretimMetin && kt.sktMetin ? "tamam" : "yok");
  const [ocrMesaj, setOcrMesaj] = useState("");
  const [yeniGorsel, setYeniGorsel] = useState<File | null>(null);
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [gorselKaldir, setGorselKaldir] = useState(false);
  const [mesgul, setMesgul] = useState<null | "kaydet" | "indir" | "test">(null);
  const [hata, setHata] = useState<string | null>(null);
  const girdi = useRef<HTMLInputElement>(null);
  const durum = formDurumu(m, bugun);
  const d = DURUM[durum];
  const a = m.alanlar;

  useEffect(() => {
    setSpek(m.spekKayitli ? m.alanlar.spekler : m.spekOnerisi);
    setUretim(m.kayitliTarih.uretimMetin); setSkt(m.kayitliTarih.sktMetin);
    setKaynak((m.kayitliTarih.kaynak as "gorsel" | "elle" | null) || null);
    setOcr(m.kayitliTarih.uretimMetin && m.kayitliTarih.sktMetin ? "tamam" : "yok");
    setYeniGorsel(null); setGorselKaldir(false);
  }, [m.spekKayitli, m.alanlar.spekler, m.spekOnerisi, m.kayitliTarih.uretimMetin, m.kayitliTarih.sktMetin, m.kayitliTarih.kaynak, m.gorselYolu]);
  useEffect(() => {
    let iptal = false;
    if (yeniGorsel) {
      const u = URL.createObjectURL(yeniGorsel);
      setOnizleme(u);
      return () => { URL.revokeObjectURL(u); };
    }
    if (m.gorselYolu && !gorselKaldir) gorselAdresi(m.gorselYolu).then((u) => { if (!iptal) setOnizleme(u); });
    else setOnizleme(null);
    return () => { iptal = true; };
  }, [yeniGorsel, m.gorselYolu, gorselKaldir]);

  /** Cuval gorselinden tarihleri oku (ucretsiz, tarayicida). */
  const oku = async (kaynakBlob: Blob) => {
    setOcr("okunuyor"); setOcrMesaj("OCR hazırlanıyor…"); setHata(null);
    try {
      const { cuvalTarihleriniOku } = await import("@/lib/cuval-ocr");
      const { tarihler } = await cuvalTarihleriniOku(kaynakBlob, setOcrMesaj);
      setUretim(tarihler.uretim?.metin || ""); setSkt(tarihler.skt?.metin || "");
      setKaynak("gorsel");
      const tam = !!(tarihler.uretim && tarihler.skt);
      setOcr(tam ? "tamam" : "eksik");
      setElleAcik(!tam);
    } catch (e) {
      setOcr("hata"); setElleAcik(true);
      setOcrMesaj(e instanceof Error ? e.message : "Görsel okunamadı.");
    }
  };
  const gorselSec = (f: File) => { setYeniGorsel(f); setGorselKaldir(false); oku(f); };
  const kayitliGorseliOku = async () => {
    if (!m.gorselYolu) return;
    const b = await gorselBlob(m.gorselYolu);
    if (b) oku(b); else { setOcr("hata"); setOcrMesaj("Kayıtlı görsel açılamadı."); }
  };

  const ut = uretim.trim() ? elleTarih(uretim, true) : null;
  const st = skt.trim() ? elleTarih(skt, false) : null;
  const tarihHatasi = (uretim.trim() && !ut) || (skt.trim() && !st)
    ? "Tarih anlaşılamadı. Örnek: NOVEMBER 2026 ya da 12.11.2026"
    : ut && st && st.yil * 12 + st.ay <= ut.yil * 12 + ut.ay ? "SKT üretim tarihinden sonra olmalı." : null;
  const spekDegisti = spekTemizle(spek) !== (m.spekKayitli ? m.alanlar.spekler : "");
  const tarihDegisti = (ut?.metin || "") !== kt.uretimMetin || (st?.metin || "") !== kt.sktMetin;
  const degisti = spekDegisti || tarihDegisti || !!yeniGorsel || gorselKaldir;
  const tamTarih = ut?.tur === "gun" || st?.tur === "gun";

  const kaydet = async () => {
    if (!degisti || tarihHatasi || ocr === "okunuyor") return;
    if (!spekTemizle(spek)) { setHata("Ürün spekleri boş olamaz."); return; }
    setMesgul("kaydet"); setHata(null);
    let yuklenen: { yol: string; ad: string } | null = null;
    try {
      if (yeniGorsel) yuklenen = await gorselYukle(companyId, m.anahtar, yeniGorsel);
      const dosya = await formKaydet({
        booking: m.bookingNo, spekler: spekTemizle(spek),
        uretimMetin: ut?.metin || null, sktMetin: st?.metin || null,
        uretimIso: ut?.tur === "gun" ? ut.iso : null, sktIso: st?.tur === "gun" ? st.iso : null,
        tarihKaynagi: ut || st ? kaynak || "elle" : null,
        gorsel: yuklenen, gorselKaldir: gorselKaldir && !yuklenen,
      });
      if (m.gorselYolu && (yuklenen || gorselKaldir)) await gorselSil(m.gorselYolu).catch(() => undefined);
      onDegisti(`${a.firma} · ${m.bookingNo}: form kaydedildi.${dosya ? ` Çuvaldaki tam tarih ${m.dosyaNo || "dosyanın"} Ek Bilgiler kartına da yazıldı.` : ""}`);
    } catch (e) {
      if (yuklenen) await gorselSil(yuklenen.yol).catch(() => undefined);
      setHata(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally { setMesgul(null); }
  };
  const indir = async () => {
    setMesgul("indir"); setHata(null);
    try { await formExcelIndir(m); } catch (e) { setHata(e instanceof Error ? e.message : "Excel oluşturulamadı."); } finally { setMesgul(null); }
  };
  const test = async () => {
    setMesgul("test"); setHata(null);
    try { const alici = await testFormuGonder(m.bookingNo); onDegisti(`${a.firma} · ${m.bookingNo}: [TEST] form ${alici} adresine gönderildi.`); }
    catch (e) { setHata(e instanceof Error ? e.message : "Test gönderilemedi."); } finally { setMesgul(null); }
  };

  const bilgi = (etiket: string, deger: string) => (
    <div className="min-w-0"><p className="text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className={`text-xs truncate ${deger ? "text-white" : "text-red-300"}`} title={deger}>{deger || "girilmedi"}</p></div>
  );
  const girdiStil = { borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG };
  const gorselVar = !!onizleme;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} data-testid="siparis-formu" data-booking={m.bookingNo} data-durum={durum}>
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{a.firma || "Firma girilmedi"}</p>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Booking <span className="font-mono text-slate-300">{m.bookingNo}</span> · {a.adet || "—"} · {a.cuvalAdi || "çuval adı yok"}
            {m.dosyaNo && m.dosyaId ? <> · <Link href={`/dosya/${m.dosyaId}`} className="hover:underline" style={{ color: ACCENT }}>{m.dosyaNo}</Link></> : " · dosya açılmadı"}
          </p>
        </div>
        <span className="text-[11px] font-medium rounded-full px-2.5 py-1" style={{ color: d.renk, backgroundColor: d.zemin }}>{d.etiket(m, bugun)}</span>
        {m.test?.zaman && <span className="text-[11px] rounded-full px-2.5 py-1 inline-flex items-center gap-1" style={{ color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}><Mail size={11} /> Test gönderildi</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 mb-3">
        {bilgi("Boş ekipman / Yükleme", `${trTarih(m.ekipmanTarihi)}${a.bosEkipman ? ` · ${a.bosEkipman}` : ""}${a.planlananYukleme ? ` · yükleme ${a.planlananYukleme}` : ""}`)}
        {bilgi("Gemi / Acenta", [a.gemi, a.acente].filter(Boolean).join(" · "))}
        {bilgi("Liman", [a.yuklemeLimani, a.varisLimani].filter(Boolean).join(" → "))}
        {bilgi("Ürün", a.urunTipi)}
        {bilgi("Ambalaj / Tonaj", [a.ambalajTipi, a.tonaj].filter(Boolean).join(" · "))}
        {bilgi("Proforma / Temsilci", [a.proformaNo, a.temsilci].filter(Boolean).join(" · "))}
      </div>

      <div className="grid gap-4 pt-3 border-t md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ borderColor: CARD_BORDER }}>
        {/* 1) Cuval gorseli + cuvaldan okunan tarihler */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>1 · Çuval görseli</p>
          <div className="flex items-start gap-3">
            <div className="h-24 w-24 rounded-lg border overflow-hidden flex items-center justify-center shrink-0" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {onizleme ? <img src={onizleme} alt="Çuval görseli" className="h-full w-full object-contain" /> : <ImagePlus size={22} style={{ color: TEXT_MUTED }} />}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => girdi.current?.click()} disabled={!!mesgul || ocr === "okunuyor"}
                  className="h-8 px-3 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04] disabled:opacity-50 inline-flex items-center gap-1.5" style={{ borderColor: CARD_BORDER }}>
                  <ImagePlus size={13} style={{ color: ACCENT }} /> {gorselVar ? "Görseli değiştir" : "Çuval görseli ekle"}
                </button>
                {gorselVar && !yeniGorsel && m.gorselYolu && ocr !== "okunuyor" && (
                  <button type="button" onClick={kayitliGorseliOku} disabled={!!mesgul}
                    className="h-8 px-3 rounded-lg border text-xs text-white hover:bg-white/[0.04] disabled:opacity-50 inline-flex items-center gap-1.5" style={{ borderColor: CARD_BORDER }} data-testid="cuvaldan-oku">
                    <ScanText size={13} style={{ color: ACCENT }} /> Tarihleri çuvaldan oku
                  </button>
                )}
                {gorselVar && (
                  <button type="button" onClick={() => { setYeniGorsel(null); setGorselKaldir(!!m.gorselYolu); }} disabled={!!mesgul || ocr === "okunuyor"}
                    className="h-8 px-2 text-[11px] inline-flex items-center gap-1 hover:text-red-300 disabled:opacity-50" style={{ color: TEXT_MUTED }}>
                    <Trash2 size={11} /> Kaldır
                  </button>
                )}
              </div>
              <input ref={girdi} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Çuval görseli"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) gorselSec(f); e.target.value = ""; }} />
              {/* Okunan tarihler */}
              {ocr === "okunuyor" ? (
                <p className="text-xs inline-flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><Loader2 size={12} className="animate-spin" /> {ocrMesaj}</p>
              ) : ut || st ? (
                <div className="text-xs rounded-lg border px-2.5 py-1.5" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.06)" }} data-testid="okunan-tarihler">
                  <span style={{ color: TEXT_MUTED }}>{kaynak === "elle" ? "Elle girilen" : "Çuvaldan okunan"}: </span>
                  <span className="text-white">Üretim <b>{ut?.metin || "—"}</b> · SKT <b>{st?.metin || "—"}</b></span>
                  <span className="block text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
                    {tamTarih ? "Tam tarih: kaydedince dosyanın Ek Bilgiler tarihleri de güncellenir." : "Ay-yıl: formda böyle yazılır, dosyanın Ek Bilgiler tarihleri değişmez."}
                  </span>
                </div>
              ) : gorselVar && ocr !== "yok" ? (
                <p className="text-xs text-amber-300">Görselde üretim / son kullanma tarihi bulunamadı.</p>
              ) : null}
              {ocr === "hata" && ocrMesaj && <p className="text-[11px] text-red-300">{ocrMesaj}</p>}
              {gorselVar && ocr !== "okunuyor" && (
                elleAcik ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <input value={uretim} onChange={(e) => { setUretim(e.target.value.toUpperCase()); setKaynak("elle"); }} placeholder="Üretim: NOVEMBER 2026"
                      className="h-8 w-40 rounded-lg border px-2 text-xs text-white" style={girdiStil} aria-label="Üretim tarihi (elle)" />
                    <input value={skt} onChange={(e) => { setSkt(e.target.value.toUpperCase()); setKaynak("elle"); }} placeholder="SKT: NOVEMBER 2027"
                      className="h-8 w-40 rounded-lg border px-2 text-xs text-white" style={girdiStil} aria-label="Son kullanma tarihi (elle)" />
                  </div>
                ) : (
                  <button type="button" onClick={() => setElleAcik(true)} className="text-[11px] hover:underline" style={{ color: TEXT_MUTED }}>Okunan tarih yanlışsa elle düzelt</button>
                )
              )}
            </div>
          </div>
        </div>

        {/* 2) Urun spekleri (elle) */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>2 · Ürün spekleri {!m.spekKayitli && <span className="normal-case font-normal text-amber-300">(öneri, kontrol edip kaydedin)</span>}</p>
          <textarea value={spek} onChange={(e) => setSpek(e.target.value)} rows={4} aria-label="Ürün spekleri"
            className="w-full rounded-lg border px-2.5 py-2 text-sm text-white resize-y" style={girdiStil} placeholder={"Protein min 13%\nGluten min 30%"} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" onClick={kaydet} disabled={!degisti || !!tarihHatasi || !!mesgul || ocr === "okunuyor"}
          className="h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5" style={{ backgroundColor: ACCENT }} data-testid="form-kaydet">
          {mesgul === "kaydet" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
        </button>
        {(tarihHatasi || hata || m.girisEksikleri.length > 0) && (
          <p className={`text-[11px] inline-flex items-start gap-1 ${tarihHatasi || hata ? "text-red-300" : "text-amber-300"}`}>
            <AlertTriangle size={12} className="mt-px shrink-0" />
            {tarihHatasi || hata || `Eksik: ${m.girisEksikleri.join(", ")}. Gönderim günü tamamlanmazsa form eksikler işaretlenerek gider ve temsilciye uyarı gönderilir.`}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={indir} disabled={!!mesgul || degisti} title={degisti ? "Önce kaydedin" : "Üretime gidecek Excel'i indir"}
            className="h-9 px-3 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04] disabled:opacity-40 inline-flex items-center gap-1.5" style={{ borderColor: CARD_BORDER }}>
            {mesgul === "indir" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Excel
          </button>
          <button type="button" onClick={test} disabled={!!mesgul || degisti} title={degisti ? "Önce kaydedin" : "[TEST] formu test adresine gönder"}
            className="h-9 px-3 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04] disabled:opacity-40 inline-flex items-center gap-1.5" style={{ borderColor: CARD_BORDER }}>
            {mesgul === "test" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test gönder
          </button>
        </div>
      </div>
    </div>
  );
}

export function SiparisFormlari() {
  const { companyId } = useAuth();
  const [liste, setListe] = useState<FormModeli[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [gecmis, setGecmis] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const bugun = trBugun();

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try { setListe(await siparisFormlariOku()); setHata(null); }
    catch (e) { setHata(e instanceof Error ? e.message : "Sipariş formları okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  // Varsayilan: ekipman gunu gelmemis + ekipman gunu gecmis ama gemisi kalkmamis ve formu gitmemis yuklemeler
  const gorunen = useMemo(() => (liste || []).filter((m) => gecmis || !m.ekipmanTarihi || m.ekipmanTarihi >= bugun
    || (!m.gonderim?.zaman && !!m.etd && m.etd >= bugun)), [liste, gecmis, bugun]);
  const eksikSayisi = gorunen.filter((m) => !m.gonderim?.zaman && m.girisEksikleri.length > 0).length;

  return (
    <div>
      <div className="rounded-lg border px-3 py-2.5 mb-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
        <FileSpreadsheet size={14} style={{ color: ACCENT }} />
        <span className="flex-1 min-w-[240px]">
          Yükleme planındaki her booking için <b className="text-white">Sipariş Bildirim Formu</b>, boş ekipman alımından <b className="text-white">1 gün önce 08:00</b>&apos;de üretime gider.
          Burada yalnız <b className="text-white">çuval görseli</b> eklenir ve <b className="text-white">ürün spekleri</b> girilir; üretim / SKT çuvaldan otomatik okunur. Alıcı ve test modu: Ayarlar &gt; Rapor Alıcıları.
        </span>
        {eksikSayisi > 0 && <span className="text-amber-300 font-medium">{eksikSayisi} formda eksik var</span>}
        <button type="button" onClick={() => setGecmis((g) => !g)} className="h-7 px-2.5 rounded-full text-[11px]"
          style={gecmis ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Son 10 günü de göster</button>
        <button type="button" onClick={yukle} disabled={yukleniyor} className="h-7 w-7 inline-flex items-center justify-center rounded-md border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }} aria-label="Yenile">
          <RefreshCw size={13} className={yukleniyor ? "animate-spin" : ""} />
        </button>
      </div>
      {bilgi && (
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }} role="status">
          <CheckCircle2 size={15} className="shrink-0" /> <span>{bilgi}</span>
        </div>
      )}
      {hata && <p className="text-sm text-red-300 mb-3">{hata}</p>}
      {liste === null && !hata ? (
        <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: TEXT_MUTED }}><Loader2 size={16} className="animate-spin" /> Yükleniyor…</div>
      ) : gorunen.length ? (
        <div className="space-y-3">
          {gorunen.map((m) => (
            <FormKarti key={m.anahtar} m={m} bugun={bugun} companyId={companyId || ""} onDegisti={(mesaj) => { setBilgi(mesaj); yukle(); }} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<FileSpreadsheet size={40} />} title="Yaklaşan yükleme yok" description="Yükleme planında boş ekipman tarihi önümüzdeki 45 gün içinde olan booking bulunmuyor." />
      )}
    </div>
  );
}
