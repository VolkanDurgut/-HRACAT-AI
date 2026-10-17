"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { History, Loader2, X, Check, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { bankaBul } from "@/lib/bankalar";
import { musteriAdaylari, urunAdaylari, unvanAnahtari, type GecmisDosya, type MusteriAdayi, type UrunAdayi } from "@/lib/proforma/gecmis";
import { BOS_MUSTERI, kodTemizle, musteriKaydiHazirla, proformaHataMesaji, urunKaydiHazirla, type IhracatMusteri, type IhracatUrun, type MusteriKaydi } from "@/lib/proforma/kayit";

/**
 * GECMISTEN AKTAR (17.10.2026): mevcut ihracat dosyalarindan musteri karti /
 * urun adaylari. HICBIR SEY OTOMATIK KAYDEDILMEZ - kullanici her adayi gorur,
 * isaretler (alici kodunu degistirebilir), "Secilenleri Ekle" ile TEK insert.
 * Zaten kartı olan alici (ayni unvan) / ayni urun listede cikmaz.
 * ihracat_dosyalari sadece OKUNUR.
 */

const DOSYA_ALANLARI =
  "alici_firma, alici_adresi, ham_veri, varis_limani, teslim_sekli, banka, odeme_sekli, sevkiyat_evraklari, proforma_no, para_birimi, urun_detaylari, olusturma_tarihi";

type Props =
  | { tur: "musteri"; companyId: string; mevcut: IhracatMusteri[]; kapat: () => void; eklendi: () => void }
  | { tur: "urun"; companyId: string; mevcut: IhracatUrun[]; kapat: () => void; eklendi: () => void };

const adayKaydi = (a: MusteriAdayi) =>
  musteriKaydiHazirla({
    ...BOS_MUSTERI,
    kod: a.kod, unvan: a.unvan, adres: a.adres || "", ilgili_kisi: a.ilgili_kisi || "", eposta: a.eposta || "",
    teslim_sekli: a.teslim_sekli || "", varis_limani: a.varis_limani || "", teslim_ifadesi: a.teslim_ifadesi || "",
    banka: a.banka || "", para_birimi: a.para_birimi, odeme_sekli: a.odeme_sekli || "", sevkiyat_metni: a.sevkiyat_metni || "",
    ozelEvrak: !!a.evraklar?.length, evraklar: a.evraklar || [], notlar: "", aktif: true,
  });

const anahtar = (x: MusteriAdayi | UrunAdayi) => ("unvan" in x ? unvanAnahtari(x.unvan) : x.ad.toLocaleUpperCase("en-US"));

export function GecmistenAktar(props: Props) {
  const { tur, companyId, kapat, eklendi } = props;
  const mevcut: (IhracatMusteri | IhracatUrun)[] = props.mevcut;
  const { showToast } = useToast();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [dosyalar, setDosyalar] = useState<GecmisDosya[]>([]);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [kodlar, setKodlar] = useState<Record<string, string>>({});
  const [acik, setAcik] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const { data, error } = await supabase.from("ihracat_dosyalari").select(DOSYA_ALANLARI).eq("company_id", companyId).order("olusturma_tarihi", { ascending: false }).limit(2000);
      if (iptal) return;
      if (error) { setOkumaHatasi(error.message); setYukleniyor(false); return; }
      setDosyalar((data || []) as GecmisDosya[]);
      setYukleniyor(false);
    })();
    return () => { iptal = true; };
  }, [companyId]);

  // ---- Musteri adaylari: kartı olan unvanlar cikarilir; mevcut kodlar dolu sayilir
  const musteriListesi = useMemo(() => {
    if (tur !== "musteri") return [] as MusteriAdayi[];
    const kartlar = mevcut as IhracatMusteri[];
    const kartliUnvan = new Set(kartlar.map((m) => unvanAnahtari(m.unvan)));
    return musteriAdaylari(dosyalar.filter((d) => !kartliUnvan.has(unvanAnahtari(d.alici_firma))), kartlar.map((m) => m.kod));
  }, [tur, dosyalar, mevcut]);

  const urunListesi = useMemo(() => {
    if (tur !== "urun") return [] as UrunAdayi[];
    const mevcutAd = new Set((mevcut as IhracatUrun[]).map((u) => u.ad.toLocaleUpperCase("en-US").replace(/\s+/g, " ").trim()));
    return urunAdaylari(dosyalar).filter((u) => !mevcutAd.has(u.ad.toLocaleUpperCase("en-US")));
  }, [tur, dosyalar, mevcut]);

  // Ilk yuklemede: kodlar doldurulur, hicbiri secili GELMEZ (kullanici bilincli secer)
  useEffect(() => {
    if (tur === "musteri") setKodlar(Object.fromEntries(musteriListesi.map((a) => [unvanAnahtari(a.unvan), a.kod])));
  }, [tur, musteriListesi]);

  const liste: (MusteriAdayi | UrunAdayi)[] = tur === "musteri" ? musteriListesi : urunListesi;

  // Secili musterilerin kodlari: gecerli + birbirleriyle ve mevcut kartlarla cakismasin
  const kodSorunu = useMemo(() => {
    if (tur !== "musteri") return {} as Record<string, string>;
    const dolu = new Set((mevcut as IhracatMusteri[]).map((m) => m.kod));
    const sorun: Record<string, string> = {};
    const gorulen = new Map<string, string>();
    for (const a of musteriListesi) {
      const k = anahtar(a);
      if (!secili.has(k)) continue;
      const kod = kodlar[k] || "";
      if (!/^[A-Z]{2,6}$/.test(kod)) { sorun[k] = "2-6 harf"; continue; }
      if (dolu.has(kod)) { sorun[k] = "Kayıtlı kartta var"; continue; }
      const once = gorulen.get(kod);
      if (once) { sorun[k] = "Seçimde tekrar"; sorun[once] = "Seçimde tekrar"; continue; }
      gorulen.set(kod, k);
    }
    return sorun;
  }, [tur, musteriListesi, secili, kodlar, mevcut]);

  const degistir = (k: string) => setSecili((s) => { const y = new Set(s); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  const tumunuSec = () => setSecili((s) => (s.size === liste.length ? new Set() : new Set(liste.map(anahtar))));

  const ekle = async () => {
    if (secili.size === 0) return;
    if (tur === "musteri") {
      if (Object.keys(kodSorunu).length) { showToast("İşaretli satırlarda alıcı kodu sorunu var. Kodları düzeltin.", "error"); return; }
      const kayitlar: (MusteriKaydi & { company_id: string })[] = [];
      for (const a of musteriListesi) {
        const k = anahtar(a);
        if (!secili.has(k)) continue;
        const r = adayKaydi({ ...a, kod: kodlar[k] || a.kod });
        if ("hata" in r) { showToast(`${a.unvan}: ${r.hata}`, "error"); return; }
        kayitlar.push({ ...r.kayit, company_id: companyId });
      }
      setKaydediliyor(true);
      const { data, error } = await supabase.from("ihracat_musterileri").insert(kayitlar).select("id");
      setKaydediliyor(false);
      const hata = yazmaHatasi(error, data);
      if (hata) { showToast(`Eklenemedi: ${proformaHataMesaji({ message: hata })}`, "error"); return; }
      showToast(`${kayitlar.length} müşteri kartı eklendi.`, "success");
    } else {
      const mevcutSira = Math.max(0, ...(mevcut as IhracatUrun[]).map((u) => u.sira || 0));
      const kayitlar: { ad: string; varsayilan_ambalaj_kg: number; sira: number; company_id: string }[] = [];
      let i = 0;
      for (const u of urunListesi) {
        if (!secili.has(anahtar(u))) continue;
        const r = urunKaydiHazirla(u.ad, u.varsayilan_ambalaj_kg);
        if ("hata" in r) { showToast(`${u.ad}: ${r.hata}`, "error"); return; }
        i += 1;
        kayitlar.push({ ...r.kayit, sira: mevcutSira + i * 10, company_id: companyId });
      }
      setKaydediliyor(true);
      const { data, error } = await supabase.from("ihracat_urunleri").insert(kayitlar).select("id");
      setKaydediliyor(false);
      const hata = yazmaHatasi(error, data);
      if (hata) { showToast(`Eklenemedi: ${proformaHataMesaji({ message: hata })}`, "error"); return; }
      showToast(`${kayitlar.length} ürün eklendi.`, "success");
    }
    eklendi();
    kapat();
  };

  const baslik = tur === "musteri" ? "Geçmiş Dosyalardan Müşteri Aktar" : "Geçmiş Dosyalardan Ürün Aktar";

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="gecmis-aktar-baslik">
      <div className="w-full max-w-4xl rounded-2xl border shadow-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="gecmis-aktar-baslik" className="text-base font-semibold text-white flex items-center gap-2"><History size={16} style={{ color: ACCENT }} /> {baslik}</h2>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
              {tur === "musteri"
                ? "Her alıcı için EN SON dosyanın bilgileri alınır. Kod, proforma numarasından okunur (UNEX + KOD + tarih). Kartı olan alıcılar listede çıkmaz. Sadece işaretledikleriniz eklenir; ekledikten sonra kartı düzenleyebilirsiniz."
                : "Ürün adları marka kısmı ayrılarak alınır (marka proformada her satırda ayrı seçilir). Kütüphanede olanlar listede çıkmaz. Sadece işaretledikleriniz eklenir."}
            </p>
          </div>
          <button onClick={() => !kaydediliyor && kapat()} className="p-1.5 rounded hover:bg-white/5 shrink-0" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: ACCENT }} /></div>
          ) : okumaHatasi ? (
            <div className="m-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
              <AlertCircle size={16} /> Dosyalar okunamadı: {okumaHatasi}
            </div>
          ) : liste.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm" style={{ color: TEXT_MUTED }}>
              {tur === "musteri" ? "Aktarılacak yeni alıcı yok; geçmiş dosyalardaki tüm alıcıların kartı mevcut." : "Aktarılacak yeni ürün yok."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                    <th className="px-4 py-2.5 w-10">
                      <input type="checkbox" checked={secili.size === liste.length && liste.length > 0} onChange={tumunuSec} className="accent-emerald-500" aria-label="Tümünü seç" />
                    </th>
                    {(tur === "musteri" ? ["Kod", "Alıcı", "Teslim / Banka", "Dosya", ""] : ["Ürün adı", "Ambalaj", "Kullanım"]).map((b, i) => (
                      <th key={i} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tur === "musteri"
                    ? musteriListesi.map((a) => {
                        const k = anahtar(a);
                        const isaretli = secili.has(k);
                        const sorun = kodSorunu[k];
                        const ac = acik === k;
                        return (
                          <React.Fragment key={k}>
                            <tr className="border-t align-top" style={{ borderColor: CARD_BORDER, backgroundColor: isaretli ? "rgba(16,185,129,0.06)" : undefined }}>
                              <td className="px-4 py-3"><input type="checkbox" checked={isaretli} onChange={() => degistir(k)} className="accent-emerald-500" aria-label={`${a.unvan} seç`} /></td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <input
                                  value={kodlar[k] ?? a.kod}
                                  onChange={(e) => setKodlar((s) => ({ ...s, [k]: kodTemizle(e.target.value) }))}
                                  className="w-20 px-2 py-1 rounded border text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                  style={{ backgroundColor: "#0F131A", borderColor: sorun ? "#B91C1C" : CARD_BORDER }}
                                  aria-label={`${a.unvan} alıcı kodu`}
                                />
                                <p className="text-[10px] mt-1" style={{ color: sorun ? "#FCA5A5" : TEXT_MUTED }}>{sorun || (a.kodKaynagi === "proforma" ? "proforma no'dan" : "öneri")}</p>
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-white">{a.unvan}</p>
                                <p className="text-xs mt-0.5 line-clamp-1" style={{ color: TEXT_MUTED }}>{a.adres || "Adres yok"}</p>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: TEXT_MUTED }}>
                                <p className="text-white">{a.teslim_ifadesi || "-"}</p>
                                <p>{a.banka ? bankaBul(a.banka)?.goruntulenenAd : "Banka yok"} · {a.para_birimi}</p>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: TEXT_MUTED }}>
                                <p className="text-white">{a.dosyaSayisi} dosya</p>
                                <p className="font-mono">{a.sonProforma || "-"}</p>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button onClick={() => setAcik(ac ? null : k)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-expanded={ac}>
                                  {ac ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Ayrıntı
                                </button>
                              </td>
                            </tr>
                            {ac && (
                              <tr style={{ backgroundColor: "#0F131A" }}>
                                <td />
                                <td colSpan={5} className="px-3 pb-3 pt-1">
                                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                                    <Satir ad="İlgili kişi" deger={a.ilgili_kisi} />
                                    <Satir ad="Ödeme" deger={a.odeme_sekli} />
                                    <Satir ad="Sevkiyat" deger={a.sevkiyat_metni} />
                                    <Satir ad="Adres" deger={a.adres} />
                                    <Satir ad="Evraklar" deger={a.evraklar ? a.evraklar.map((e, i) => `${i + 1}. ${e}`).join("\n") : "Şablondaki varsayılan liste kullanılacak"} />
                                  </dl>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    : urunListesi.map((u) => {
                        const k = anahtar(u);
                        const isaretli = secili.has(k);
                        return (
                          <tr key={k} className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: isaretli ? "rgba(16,185,129,0.06)" : undefined }}>
                            <td className="px-4 py-3"><input type="checkbox" checked={isaretli} onChange={() => degistir(k)} className="accent-emerald-500" aria-label={`${u.ad} seç`} /></td>
                            <td className="px-3 py-2.5 text-white">{u.ad}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{u.varsayilan_ambalaj_kg} kg</td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{u.kullanim} kalem</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>{liste.length} aday · {secili.size} seçili</p>
          <div className="flex gap-2">
            <button onClick={kapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
            <button onClick={ekle} disabled={kaydediliyor || secili.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Seçilenleri Ekle ({secili.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Satir({ ad, deger }: { ad: string; deger: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{ad}</dt>
      <dd className="text-slate-200 whitespace-pre-wrap break-words">{deger || "-"}</dd>
    </div>
  );
}
