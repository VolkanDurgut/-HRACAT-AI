"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { bugunTarihIstanbul } from "@/lib/cutoff-utils";
import { Loader2, Printer, Calendar, AlertTriangle } from "lucide-react";
import {
  gunlukRaporHesapla,
  GunlukRapor,
  RaporDosyasi,
  RaporKonteyneri,
  RaporRezervasyonu,
  SevkiyatSatiri,
  durumRozetMetni,
  ekipmanOzetMetni,
  acikMusteriSatirlari,
} from "@/supabase/functions/_shared/gunluk-rapor";

/**
 * Guncel Ihracat Raporu (yenilendi: 07.10.2026; eski adi "Gunluk Sevkiyat ve
 * Kantar Raporu").
 * Hesap TEK YERDE: supabase/functions/_shared/gunluk-rapor.ts - her sabah
 * 09:00, ogle 12:00 ve aksam 17:00 giden rapor maili (gunluk-rapor-gonder) ayni sayilari
 * kullanir. Sayfa yazdirmaya / PDF'e uygun beyaz belge olarak kalir.
 * ?tarih=YYYY-MM-DD ile belirli gun acilabilir (maildeki baglanti).
 */

// Unex logosunun renkleri (public/images/logo.png): lacivert zemin + seftali/turuncu ekmek
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
const YESIL = "#059669";
const AMBER = "#D97706";
const GRI = "#64748B";

const sayi = (n: number) => n.toLocaleString("tr-TR");

function tarihUzun(tarih: string): string {
  return new Date(`${tarih}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" });
}

function tarihKisa(tarih: string | null): string {
  if (!tarih) return "—";
  const [y, a, g] = tarih.slice(0, 10).split("-");
  return `${g}.${a}.${y}`;
}

function DurumRozeti({ s }: { s: SevkiyatSatiri }) {
  const renk = s.durum === "tamamlandi" ? YESIL : s.durum === "yukleniyor" ? AMBER : GRI;
  const zemin = s.durum === "tamamlandi" ? "#D1FAE5" : s.durum === "yukleniyor" ? "#FEF3C7" : "#F1F5F9";
  const metin = durumRozetMetni(s);
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ backgroundColor: zemin, color: renk }}>
      {metin}
    </span>
  );
}

/** Ekipman dagilimi: dolu (yesil) / ekipmani alinmis bos (amber) / alinmamis (gri). */
function EkipmanCubugu({ s }: { s: SevkiyatSatiri }) {
  const metin = ekipmanOzetMetni(s);
  if (!metin || s.konteynerAdedi <= 0) return null;
  const yuzde = (n: number) => `${(100 * n) / s.konteynerAdedi}%`;
  return (
    <div className="mt-1">
      <div className="flex h-1.5 w-32 rounded-sm overflow-hidden" title={metin}>
        {s.yuklenen > 0 && <div style={{ width: yuzde(s.yuklenen), backgroundColor: "#10B981" }} />}
        {s.dolumBekleyen > 0 && <div style={{ width: yuzde(s.dolumBekleyen), backgroundColor: "#F59E0B" }} />}
        {s.ekipmanAlinmayan > 0 && <div style={{ width: yuzde(s.ekipmanAlinmayan), backgroundColor: "#CBD5E1" }} />}
      </div>
      <p className="text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">{metin}</p>
    </div>
  );
}

function FaturaRozeti({ s }: { s: SevkiyatSatiri }) {
  if (!s.faturaKesildi) {
    return <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ backgroundColor: "#FEE2E2", color: "#B91C1C" }}>Kesilmedi</span>;
  }
  return (
    <div>
      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ backgroundColor: "#D1FAE5", color: YESIL }}>Kesildi</span>
      {(s.faturaNo || s.faturaTarihi) && (
        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
          {s.faturaNo}
          {s.faturaNo && s.faturaTarihi ? <br /> : null}
          {s.faturaTarihi ? tarihKisa(s.faturaTarihi) : null}
        </p>
      )}
    </div>
  );
}

function Baslik({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: MARKA_TURUNCU }} />
      <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: LACIVERT }}>{children}</h2>
    </div>
  );
}

export default function GunlukRaporSayfasi() {
  const { user, loading: authLoading, companyId } = useAuth();
  const router = useRouter();

  const [tarih, setTarih] = useState(bugunTarihIstanbul());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [rapor, setRapor] = useState<GunlukRapor | null>(null);
  // Tarih hizli degisirse (ornegin ?tarih= ile acilis) once baslayan ama gec
  // biten istek ekrani ezmesin: sadece EN SON istegin sonucu yazilir.
  const istekSira = useRef(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  // Maildeki baglanti: /rapor/gunluk?tarih=YYYY-MM-DD
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tarih");
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setTarih(t);
  }, []);

  const veriyiCek = useCallback(async () => {
    if (!companyId) return;
    const sira = ++istekSira.current;
    const guncelMi = () => sira === istekSira.current;
    setYukleniyor(true);
    setHata(null);

    const { data: sirket } = await supabase.from("companies").select("company_name").eq("id", companyId).maybeSingle();
    if (!guncelMi()) return;
    setCompanyName(sirket?.company_name || "");

    const { data: acikDosyalar, error: e1 } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, alici_firma, marka, fatura_dosya_url, fatura_no, fatura_tarihi, varis_limani")
      .eq("company_id", companyId)
      .or("durum.eq.Açık,durum.eq.Acik");
    const acikIdler = (acikDosyalar || []).map((d) => d.id);

    const kolonlar = "id, dosya_id, konteyner_no, muhur_no, plaka, marka, tare_kg, vgm_kg, dba_dosya_url, dba_yukleme_tarihi, dba_kontrol_sonucu";
    // Gun yuklenenler: SQL'de tarih filtresi YOK - gercek tartim tarihi DBA
    // icinden okundugu icin sirketin DBA'li tum konteynerleri cekilir ve gun
    // JS'te atanir (belge ertesi gun yuklense bile dogru gune duser).
    const [rezSonuc, acikKontSonuc, dbaKontSonuc] = await Promise.all([
      acikIdler.length
        ? supabase.from("rezervasyonlar").select("dosya_id, konteyner_adedi, booking_no, gemi_adi, gemi_kalkis_tarihi").eq("company_id", companyId).in("dosya_id", acikIdler)
        : Promise.resolve({ data: [], error: null }),
      acikIdler.length
        ? supabase.from("konteynerler").select(kolonlar).eq("company_id", companyId).in("dosya_id", acikIdler)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("konteynerler").select(kolonlar).eq("company_id", companyId).not("dba_dosya_url", "is", null),
    ]);

    if (!guncelMi()) return;
    if (e1 || rezSonuc.error || acikKontSonuc.error || dbaKontSonuc.error) {
      setHata("Rapor verisi okunamadı. Sayfayı yenileyin.");
      setYukleniyor(false);
      return;
    }

    // Kapali dosyalarda yuklenen konteynerlerin musteri/marka bilgisi
    const acikSet = new Set(acikIdler);
    const digerIdler = Array.from(new Set(((dbaKontSonuc.data || []) as RaporKonteyneri[]).map((k) => k.dosya_id).filter((id) => !acikSet.has(id))));
    let digerDosyalar: RaporDosyasi[] = [];
    if (digerIdler.length) {
      const { data } = await supabase.from("ihracat_dosyalari").select("id, dosya_no, alici_firma, marka").eq("company_id", companyId).in("id", digerIdler);
      digerDosyalar = (data || []) as RaporDosyasi[];
    }
    if (!guncelMi()) return;

    const acikKont = (acikKontSonuc.data || []) as RaporKonteyneri[];
    setRapor(
      gunlukRaporHesapla(
        tarih,
        (acikDosyalar || []) as RaporDosyasi[],
        (rezSonuc.data || []) as RaporRezervasyonu[],
        [...acikKont, ...((dbaKontSonuc.data || []) as RaporKonteyneri[])],
        digerDosyalar
      )
    );

    setYukleniyor(false);
  }, [companyId, tarih]);

  useEffect(() => {
    veriyiCek();
  }, [veriyiCek]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const bugunMu = tarih === bugunTarihIstanbul();
  const gunEtiketi = bugunMu ? "Bugün" : tarihKisa(tarih);
  const olusturmaZamani = new Date().toLocaleString("tr-TR");
  const o = rapor?.ozet;
  const tamamlananlar = rapor ? rapor.sevkiyatlar.filter((s) => s.durum === "tamamlandi") : [];
  // Ek: yuklemesi devam eden / baslamamis sevkiyatlarin sisteme eklenmis konteynerleri
  const detay = rapor ? rapor.sevkiyatlar.filter((s) => s.durum !== "tamamlandi" && s.konteynerler.length > 0) : [];

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:py-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          .rapor-sayfa { box-shadow: none !important; margin: 0 !important; max-width: none !important; min-height: 0 !important; padding: 0 !important; }
          .sayfa-boleme { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print max-w-[210mm] mx-auto mb-4 px-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-500" />
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700" />
          <button onClick={() => setTarih(bugunTarihIstanbul())} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
            Bugün
          </button>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ backgroundColor: LACIVERT }}>
          <Printer size={16} /> Yazdır / PDF Olarak Kaydet
        </button>
      </div>

      {yukleniyor ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
      ) : hata || !rapor || !o ? (
        <div className="max-w-[210mm] mx-auto bg-white rounded-lg p-6 flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle size={16} /> {hata || "Rapor oluşturulamadı."}
        </div>
      ) : (
        <div className="rapor-sayfa bg-white mx-auto shadow-lg flex flex-col" style={{ maxWidth: "210mm", minHeight: "297mm", padding: "13mm" }}>
          {/* BASLIK */}
          <div className="flex items-center justify-between border-b-4 pb-4 mb-5" style={{ borderColor: LACIVERT }}>
            <div className="flex items-center gap-3">
              <img src="/images/logo.png" alt="Logo" className="w-12 h-12 object-contain shrink-0" />
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-tight" style={{ color: LACIVERT }}>{companyName ? `${companyName} İhracat AI` : "İhracat AI"}</h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Güncel İhracat Raporu</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-800 text-sm capitalize">{tarihUzun(tarih)}</p>
              <p className="text-[11px] text-slate-400">Oluşturulma: {olusturmaZamani}</p>
            </div>
          </div>

          {/* OZET */}
          <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-2 mb-6 sayfa-boleme">
            {[
              { e: `${gunEtiketi} Yüklenen`, d: `${o.gunYuklenenKonteyner}`, a: o.gunYuklenenNetKg ? `konteyner · ${sayi(o.gunYuklenenNetKg)} kg` : "konteyner", r: LACIVERT },
              { e: "Açık Sevkiyat", d: `${o.acikSevkiyat}`, a: acikMusteriSatirlari(rapor).join("\n") || "açık sevkiyat yok", r: YESIL },
              { e: "Yüklenecek Konteyner", d: `${o.bekleyenKonteyner}`, a: "açık sevkiyatlarda kalan", r: AMBER },
            ].map((k) => (
              <div key={k.e} className="rounded border border-slate-200 px-3 py-2" style={{ borderTop: `3px solid ${k.r}` }}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k.e}</p>
                <p className="text-xl font-bold leading-tight" style={{ color: k.r }}>{k.d}</p>
                <p className="text-[11px] text-slate-600 leading-snug whitespace-pre-line">{k.a}</p>
              </div>
            ))}
          </div>

          {/* GUN YUKLENENLER */}
          <div className="mb-6">
            <Baslik>{gunEtiketi} Yüklenen Konteynerler</Baslik>
            {rapor.gunYuklenenler.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Bu tarihte yüklenen konteyner bulunmuyor.</p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: LACIVERT }}>
                    {["Saat", "Konteyner No", "Müşteri", "Marka", "Mühür No", "Plaka", "Net (kg)"].map((b, i) => (
                      <th key={b} className={`py-2 ${i === 0 ? "pl-3" : ""} pr-2 font-semibold text-white text-[10px] uppercase tracking-wide ${i === 6 ? "text-right pr-3" : "text-left"}`}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rapor.gunYuklenenler.map((k, i) => (
                    <tr key={k.id} className="border-b border-slate-100" style={i % 2 === 1 ? { backgroundColor: "#F8FAFC" } : undefined}>
                      <td className="py-1.5 pl-3 pr-2 text-slate-500 text-[12px]">{k.saat || "—"}</td>
                      <td className="py-1.5 pr-2 font-mono font-semibold text-slate-800 text-[12px]">{k.konteyner_no}</td>
                      <td className="py-1.5 pr-2 text-slate-700 text-[12px]">{k.musteri}</td>
                      <td className="py-1.5 pr-2 text-slate-700 text-[12px]">{k.marka}</td>
                      <td className="py-1.5 pr-2 text-slate-600 text-[12px]">{k.muhur_no || "-"}</td>
                      <td className="py-1.5 pr-2 text-slate-600 text-[12px]">{k.plaka || "-"}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-slate-800 text-[12px]">{k.net != null ? sayi(k.net) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={6} className="pt-2 pl-3 text-xs font-bold text-slate-600">TOPLAM — {rapor.gunYuklenenler.length} konteyner</td>
                    <td className="pt-2 pr-3 text-right text-xs font-bold text-slate-800">{o.gunYuklenenNetKg ? `${sayi(o.gunYuklenenNetKg)} kg` : ""}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>

          {/* SEVKIYAT DURUMU */}
          <div className="mb-6">
            <Baslik>Sevkiyat Durumu — Açık Dosyalar</Baslik>
            {rapor.sevkiyatlar.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Açık sevkiyat bulunmuyor.</p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: LACIVERT }}>
                    {["Müşteri", "Adet", "Marka", "Yükleme Durumu", "Fatura", "Dosya / Booking", "ETD"].map((b, i) => (
                      <th key={b} className={`py-2 ${i === 0 ? "pl-3" : ""} pr-2 font-semibold text-white text-[10px] uppercase tracking-wide ${i === 1 ? "text-center" : "text-left"}`}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rapor.sevkiyatlar.map((s, i) => (
                    <tr key={s.dosya_id} className="border-b border-slate-100 align-middle sayfa-boleme" style={i % 2 === 1 ? { backgroundColor: "#F8FAFC" } : undefined}>
                      <td className="py-1.5 pl-3 pr-2 font-semibold text-slate-900 text-[12px]">{s.musteri}</td>
                      <td className="py-1.5 pr-2 text-center font-bold text-slate-800 text-[12px] whitespace-nowrap">{s.konteynerAdedi}x</td>
                      <td className="py-1.5 pr-2 font-semibold text-slate-700 text-[12px]">{s.marka}</td>
                      <td className="py-1.5 pr-2">
                        <DurumRozeti s={s} />
                        {s.gunTamamlandi ? (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: YESIL }}>{bugunMu ? "Bugün" : "Bu tarihte"} tamamlandı</p>
                        ) : s.gunYuklenen > 0 ? (
                          <p className="text-[10px] text-slate-500 mt-0.5">{bugunMu ? "Bugün" : "Bu tarihte"} {s.gunYuklenen} konteyner yüklendi</p>
                        ) : null}
                        <EkipmanCubugu s={s} />
                      </td>
                      <td className="py-1.5 pr-2"><FaturaRozeti s={s} /></td>
                      <td className="py-1.5 pr-2 text-[11px] text-slate-500 whitespace-nowrap leading-tight">{s.dosya_no}{s.booking ? <><br />{s.booking}</> : null}</td>
                      <td className="py-1.5 pr-3 text-[11px] text-slate-500 whitespace-nowrap">{tarihKisa(s.etd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* TAMAMLANANLAR: PLAKA VE TONAJ */}
          <div className="mb-6">
            <Baslik>Yüklemesi Tamamlanan Sevkiyatlar — Plaka ve Tonaj</Baslik>
            {tamamlananlar.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Yüklemesi tamamlanan açık sevkiyat bulunmuyor.</p>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                {tamamlananlar.map((s, gi) => (
                  <div key={s.dosya_id} className={`sayfa-boleme ${gi > 0 ? "border-t border-slate-200" : ""}`}>
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5" style={{ backgroundColor: "#F1F5F9" }}>
                      <p className="text-xs text-slate-800">
                        <span className="font-bold">{s.musteri}</span> · {s.marka} · {s.konteynerAdedi}x
                        {s.varisLimani && (
                          <> · <span style={{ color: LACIVERT }}>Varış: <span className="font-bold">{s.varisLimani}</span></span></>
                        )}{" "}
                        <span className="text-slate-500 text-[11px]">({s.dosya_no})</span>
                      </p>
                      <p className="text-xs font-bold text-slate-800 whitespace-nowrap">Toplam {s.yuklenenNetKg ? `${sayi(s.yuklenenNetKg)} kg` : "-"}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2">
                      {s.konteynerler.filter((k) => k.yuklendi).map((k) => (
                        <div key={k.konteyner_no} className="flex items-center gap-3 px-3 py-1 text-xs border-b border-slate-100">
                          <span className="font-mono text-slate-600 w-28 shrink-0">{k.konteyner_no}</span>
                          <span className="font-bold text-slate-800 flex-1">{k.plaka || "-"}</span>
                          <span className="text-slate-700 whitespace-nowrap">{k.net != null ? `${sayi(k.net)} kg` : "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* EK: KONTEYNER DETAYI */}
          <div className="flex-1">
            <Baslik>Ek — Devam Eden Sevkiyatlar Konteyner Detayı</Baslik>
            {detay.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Yüklemesi devam eden sevkiyatta eklenmiş konteyner bulunmuyor.</p>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                {detay.map((g, gi) => {
                  const yuklenen = g.konteynerler.filter((k) => k.yuklendi).length;
                  return (
                    <div key={g.dosya_id} className={gi > 0 ? "border-t border-slate-200" : ""}>
                      <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: "#F1F5F9" }}>
                        <p className="text-xs text-slate-800"><span className="font-bold">{g.musteri}</span> · {g.marka} <span className="text-slate-500 text-[11px]">({g.dosya_no})</span></p>
                        <p className="text-[11px] font-semibold">
                          <span style={{ color: YESIL }}>{yuklenen}/{g.konteynerAdedi} yüklendi</span>
                          {g.konteynerAdedi > g.konteynerler.length && (
                            <>
                              <span className="text-slate-400"> · </span>
                              <span style={{ color: AMBER }}>{g.konteynerAdedi - g.konteynerler.length} konteyner henüz eklenmedi</span>
                            </>
                          )}
                        </p>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {g.konteynerler.map((k, i) => (
                            <tr key={k.konteyner_no + i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                              <td className="py-1 pl-3 font-mono font-medium text-slate-700">{k.konteyner_no}</td>
                              <td className="py-1 pr-2 text-slate-500">{k.muhur_no || "-"}</td>
                              <td className="py-1 pr-2 text-slate-500">{k.plaka || "-"}</td>
                              <td className="py-1 pr-3 text-right text-slate-600">{k.net != null ? `${sayi(k.net)} kg` : "-"}</td>
                              <td className="py-1 pr-3 text-right w-24">
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={k.yuklendi ? { backgroundColor: "#D1FAE5", color: YESIL } : { backgroundColor: "#FEF3C7", color: AMBER }}>
                                  {k.yuklendi ? "YÜKLENDİ" : "BEKLİYOR"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-8 pt-3 border-t border-slate-200 text-center">
            <p className="text-[10px] text-slate-400">{companyName || "İhracat"} — Bu rapor sistem tarafından otomatik oluşturulmuştur.</p>
          </div>
        </div>
      )}
    </div>
  );
}
