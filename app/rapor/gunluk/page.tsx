"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Printer, Calendar } from "lucide-react";

type BugunYuklenen = {
  id: string;
  konteyner_no: string;
  muhur_no: string | null;
  plaka: string | null;
  net_agirlik_gercek: number | null; // VGM - Dara hesaplanmis, DB'deki sabit net_agirlik_kg DEGIL
};

type MusteriGrubu = {
  alici_firma: string;
  konteynerler: { konteyner_no: string; muhur_no: string | null; plaka: string | null; net_agirlik_gercek: number | null; yuklendi: boolean }[];
  yuklenenSayisi: number;
  bekleyenSayisi: number;
};

function bugunTarihStr() {
  const d = new Date();
  const yerelOfset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - yerelOfset).toISOString().slice(0, 10);
}

/**
 * DBA belgesinden yapay zeka ile cikarilan "DD.MM.YYYY HH:MM:SS" formatindaki
 * GERCEK tartim tarihini { gun, saat } olarak ayristirir. Bu, konteynerin
 * SISTEME NE ZAMAN YUKLENDIGINDEN (dba_yukleme_tarihi) FARKLI bir bilgidir -
 * personel belgeyi ertesi gun/gec yukleyebilir, bu durumda konteyner yanlis
 * gune dusmemesi icin belgedeki gercek tarih esas alinir. Format tanınamazsa
 * (nadir AI cikarim hatasi) null doner ve cagiran kod yukleme tarihine
 * guvenli sekilde geri doner - hicbir konteyner raporda sessizce kaybolmaz.
 */
function tartimTarihiAyristir(deger: string | null | undefined): { gun: string; saat: string } | null {
  if (!deger) return null;
  const eslesme = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[ ,T]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!eslesme) return null;
  const [, gg, aa, yyyy, ss, dd, sn] = eslesme;
  return { gun: `${yyyy}-${aa}-${gg}`, saat: `${ss}:${dd}:${sn || "00"}` };
}

/** Bir konteyner icin raporda kullanilacak "efektif gun/saat" bilgisini dondurur:
 *  once DBA belgesindeki gercek tartim tarihi denenir, o yoksa/bozuksa
 *  (Turkiye saatine cevrilmis) sistem yukleme tarihine guvenli sekilde doner. */
function efektifTartimBilgisi(dbaKontrolSonucu: any, dbaYuklemeTarihi: string | null): { gun: string; saat: string } | null {
  const aiTarihi = tartimTarihiAyristir(dbaKontrolSonucu?.tartim_tarih_saat);
  if (aiTarihi) return aiTarihi;
  if (!dbaYuklemeTarihi) return null;
  const yuklemeDate = new Date(dbaYuklemeTarihi);
  const gun = yuklemeDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const saat = yuklemeDate.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour12: false });
  return { gun, saat };
}

export default function GunlukRaporSayfasi() {
  const { user, loading: authLoading, companyId } = useAuth();
  const router = useRouter();

  const [tarih, setTarih] = useState(bugunTarihStr());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [bugunYuklenenler, setBugunYuklenenler] = useState<BugunYuklenen[]>([]);
  const [musteriGruplari, setMusteriGruplari] = useState<MusteriGrubu[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  const veriyiCek = useCallback(async () => {
    if (!companyId) return;
    setYukleniyor(true);

    const { data: sirket } = await supabase
      .from("companies").select("company_name").eq("id", companyId).maybeSingle();
    setCompanyName(sirket?.company_name || "");

    // BOLUM 1: Secili gunde GERCEKTEN tartilan (yani sevk edilen) konteynerler.
    // ONEMLI: dba_yukleme_tarihi (sisteme yukleme zamani) yerine, DBA belgesinden
    // AI ile cikarilan GERCEK tartim tarihi (dba_kontrol_sonucu.tartim_tarih_saat)
    // esas alinir - personel belgeyi ertesi gun yuklerse konteyner yanlis rapora
    // dusmesin diye SQL'de tarih filtresi UYGULANMAZ, sirkete ait TUM DBA'si
    // yuklenmis konteynerler cekilip dogru gune JS tarafinda atanir.
    const { data: bugunData } = await supabase
      .from("konteynerler")
      .select("id, konteyner_no, muhur_no, plaka, tare_kg, vgm_kg, dba_yukleme_tarihi, dba_kontrol_sonucu")
      .eq("company_id", companyId)
      .not("dba_dosya_url", "is", null);

    const buGuneAitOlanlar = (bugunData || [])
      .map((k: any) => ({ ...k, efektif: efektifTartimBilgisi(k.dba_kontrol_sonucu, k.dba_yukleme_tarihi) }))
      .filter((k) => k.efektif?.gun === tarih)
      .sort((a, b) => (a.efektif?.saat || "").localeCompare(b.efektif?.saat || ""));

    setBugunYuklenenler(
      buGuneAitOlanlar.map((k: any) => ({
        id: k.id,
        konteyner_no: k.konteyner_no,
        muhur_no: k.muhur_no,
        plaka: k.plaka,
        // ONEMLI: net_agirlik_kg alaninda sabit/teorik deger (ör. 25.000) tutuluyor,
        // gercek net agirlik degil. Raporda gercek deger gosterilmeli: VGM - Dara.
        net_agirlik_gercek:
          k.vgm_kg != null && k.tare_kg != null ? k.vgm_kg - k.tare_kg : null,
      }))
    );

    // BOLUM 2: Acik dosyalar + konteynerleri, musteri (alici_firma) bazinda gruplu
    const { data: acikDosyalar } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, alici_firma")
      .eq("company_id", companyId)
      .or("durum.eq.Açık,durum.eq.Acik");

    const dosyaIds = (acikDosyalar || []).map((d) => d.id);
    let acikKonteynerler: any[] = [];
    if (dosyaIds.length > 0) {
      const { data } = await supabase
        .from("konteynerler")
        .select("id, konteyner_no, dosya_id, dba_dosya_url, muhur_no, plaka, tare_kg, vgm_kg")
        .eq("company_id", companyId)
        .in("dosya_id", dosyaIds);
      acikKonteynerler = data || [];
    }

    const musteriMap = new Map<string, MusteriGrubu>();
    for (const dosya of acikDosyalar || []) {
      const musteriAdi = dosya.alici_firma || "Belirtilmemiş";
      const kontListesi = acikKonteynerler
        .filter((k) => k.dosya_id === dosya.id)
        .map((k) => ({
          konteyner_no: k.konteyner_no,
          muhur_no: k.muhur_no,
          plaka: k.plaka,
          // Bolum 1'deki ile ayni mantik: gercek net agirlik VGM - Dara'dan hesaplanir
          net_agirlik_gercek: k.vgm_kg != null && k.tare_kg != null ? k.vgm_kg - k.tare_kg : null,
          yuklendi: !!k.dba_dosya_url,
        }));

      if (kontListesi.length === 0) continue; // henuz hic konteyner eklenmemis dosyayi raporda gostermeye gerek yok

      if (!musteriMap.has(musteriAdi)) {
        musteriMap.set(musteriAdi, { alici_firma: musteriAdi, konteynerler: [], yuklenenSayisi: 0, bekleyenSayisi: 0 });
      }
      const grup = musteriMap.get(musteriAdi)!;
      grup.konteynerler.push(...kontListesi);
      grup.yuklenenSayisi += kontListesi.filter((k) => k.yuklendi).length;
      grup.bekleyenSayisi += kontListesi.filter((k) => !k.yuklendi).length;
    }

    setMusteriGruplari(Array.from(musteriMap.values()).sort((a, b) => a.alici_firma.localeCompare(b.alici_firma)));
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
    );  }

  const toplamYuklenen = musteriGruplari.reduce((s, g) => s + g.yuklenenSayisi, 0);
  const toplamBekleyen = musteriGruplari.reduce((s, g) => s + g.bekleyenSayisi, 0);
  const tarihGosterim = new Date(`${tarih}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "2-digit", month: "long", year: "numeric", weekday: "long",
  });
  const olusturmaZamani = new Date().toLocaleString("tr-TR");

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:py-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          .rapor-sayfa { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      {/* Ekranda gorunen, yazdirmada gizlenen kontrol cubugu */}
      <div className="no-print max-w-[210mm] mx-auto mb-4 px-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-500" />
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700"
          />
          <button
            onClick={() => setTarih(bugunTarihStr())}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            Bugün
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "#1E293B" }}
        >
          <Printer size={16} /> Yazdır / PDF Olarak Kaydet
        </button>
      </div>

      {yukleniyor ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="rapor-sayfa bg-white mx-auto shadow-lg flex flex-col" style={{ maxWidth: "210mm", minHeight: "297mm", padding: "13mm" }}>
          {/* BASLIK - logo + firma adi solda, tarih bilgisi sagda, kalin alt cizgi */}
          <div className="flex items-center justify-between border-b-4 pb-4 mb-6" style={{ borderColor: "#1E293B" }}>
            <div className="flex items-center gap-3">
              <img src="/images/logo.png" alt="Logo" className="w-12 h-12 object-contain shrink-0" />
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">{companyName || "İhracat"}</h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Günlük İhracat Kantar Raporu</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-800 text-sm capitalize">{tarihGosterim}</p>
              <p className="text-[11px] text-slate-400">Oluşturulma: {olusturmaZamani}</p>
            </div>
          </div>

          {/* BOLUM 1 */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1 h-4" style={{ backgroundColor: "#1E293B" }} />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Bugün Yüklenen Konteynerler</h2>
            </div>
            {bugunYuklenenler.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Bu tarihte yüklenen konteyner bulunmuyor.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "#1E293B" }}>
                    <th className="py-2 pl-3 pr-2 font-semibold text-left text-white text-xs uppercase tracking-wide rounded-l">Konteyner No</th>
                    <th className="py-2 pr-2 font-semibold text-left text-white text-xs uppercase tracking-wide">Mühür No</th>
                    <th className="py-2 pr-2 font-semibold text-left text-white text-xs uppercase tracking-wide">Plaka</th>
                    <th className="py-2 pr-3 font-semibold text-right text-white text-xs uppercase tracking-wide rounded-r">Net Ağırlık (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {bugunYuklenenler.map((k, idx) => (
                    <tr key={k.id} style={idx % 2 === 1 ? { backgroundColor: "#F8FAFC" } : undefined} className="border-b border-slate-100">
                      <td className="py-1.5 pl-3 pr-2 font-mono font-semibold text-slate-800">{k.konteyner_no}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{k.muhur_no || "-"}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{k.plaka || "-"}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-slate-800">
                        {k.net_agirlik_gercek != null ? k.net_agirlik_gercek.toLocaleString("tr-TR") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={3} className="pt-2 pl-3 text-xs font-bold text-slate-600">TOPLAM</td>
                    <td className="pt-2 pr-3 text-right text-xs font-bold text-slate-800">
                      {bugunYuklenenler.length} konteyner
                    </td>                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* BOLUM 2 */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1 h-4" style={{ backgroundColor: "#1E293B" }} />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Açık Dosyalar — Müşteri Bazlı Konteyner Durumu</h2>
            </div>
            {musteriGruplari.length === 0 ? (
              <p className="text-sm text-slate-400 italic pl-3">Açık dosyada henüz eklenmiş konteyner bulunmuyor.</p>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                {musteriGruplari.map((grup, gIdx) => (
                  <div key={grup.alici_firma} className={gIdx > 0 ? "border-t border-slate-200" : ""}>
                    <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: "#F1F5F9" }}>
                      <p className="text-xs font-bold text-slate-800">{grup.alici_firma}</p>
                      <p className="text-[11px] font-semibold">
                        <span style={{ color: "#059669" }}>{grup.yuklenenSayisi} yüklendi</span>
                        <span className="text-slate-400"> · </span>
                        <span style={{ color: "#D97706" }}>{grup.bekleyenSayisi} bekliyor</span>
                      </p>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-1 pl-3 text-left font-semibold text-slate-400 text-[10px] uppercase tracking-wide">Konteyner No</th>
                          <th className="py-1 pr-2 text-left font-semibold text-slate-400 text-[10px] uppercase tracking-wide">Mühür No</th>
                          <th className="py-1 pr-2 text-left font-semibold text-slate-400 text-[10px] uppercase tracking-wide">Plaka</th>
                          <th className="py-1 pr-3 text-right font-semibold text-slate-400 text-[10px] uppercase tracking-wide">Net</th>
                          <th className="py-1 pr-3 text-right font-semibold text-slate-400 text-[10px] uppercase tracking-wide w-24">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grup.konteynerler.map((k, i) => (
                          <tr key={k.konteyner_no} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                            <td className="py-1 pl-3 font-mono font-medium text-slate-700">{k.konteyner_no}</td>
                            <td className="py-1 pr-2 text-slate-500">{k.muhur_no || "-"}</td>
                            <td className="py-1 pr-2 text-slate-500">{k.plaka || "-"}</td>
                            <td className="py-1 pr-3 text-right text-slate-600">
                              {k.net_agirlik_gercek != null ? `${k.net_agirlik_gercek.toLocaleString("tr-TR")} kg` : "-"}
                            </td>
                            <td className="py-1 pr-3 text-right w-24">
                              {k.yuklendi ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: "#D1FAE5", color: "#059669" }}>YÜKLENDİ</span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>BEKLİYOR</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-5 mt-3 pt-3 border-t-2 text-sm" style={{ borderColor: "#1E293B" }}>
              <span className="font-bold text-slate-700 text-xs uppercase tracking-wide">Genel Toplam:</span>
              <span className="font-bold" style={{ color: "#059669" }}>{toplamYuklenen} Yüklendi</span>
              <span className="font-bold" style={{ color: "#D97706" }}>{toplamBekleyen} Bekliyor</span>
            </div>
          </div>

          {/* ALT BILGI */}
          <div className="mt-8 pt-3 border-t border-slate-200 text-center">
            <p className="text-[10px] text-slate-400">{companyName || "İhracat"} — Bu rapor sistem tarafından otomatik oluşturulmuştur.</p>
          </div>
        </div>
      )}
    </div>
  );
}
    