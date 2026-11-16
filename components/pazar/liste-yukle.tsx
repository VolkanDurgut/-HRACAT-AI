"use client";

import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { xlsxSayfalariOku } from "@/lib/xlsx-oku";
import { listeFirmalariniBirlestir, listeSayfalariniOku, type ListeFirma, type ListeOkuma } from "@/lib/pazar/liste";
import { pazarAnahtarlari, rehberListesiAktar, ulkeGosterim, type AktarmaSonucu, type PazarFirma, type PazarKisi } from "@/lib/pazar/veri";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR - "Rehber listesi yükle" (16.11.2026). Kullanici: "Safak Bey'in listesini mukerrer kayit olmayacak
 * sekilde sisteme entegre etmeliyiz." Ulke sayfali rehber Excel'i TARAYICIDA okunur (lib/pazar/liste.ts);
 * sayfa / bolum secimi + onizleme; kayit yalniz "Aktar" ile tek islemde (pazar_liste_aktar).
 * Mukerrer: ad anahtari (birlestirilmis adlar dahil) ya da ayni e-posta -> mevcut firmaya eklenir.
 * Ayni dosyayi tekrar yuklemek guvenli (not ve kisi cogalmaz).
 */

type Asama = "bos" | "okunuyor" | "onizleme" | "aktariliyor" | "bitti";
type Okunan = { dosyaAdi: string; okuma: ListeOkuma; anahtarlar: string[] };

function Kutu({ etiket, deger, renk, testId }: { etiket: string; deger: number | string; renk?: string; testId?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 min-w-0" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <p className="text-[11px] leading-tight truncate" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: renk || "#FFFFFF" }} data-deger>{deger}</p>
    </div>
  );
}

function Acilir({ baslik, adet, children, testId }: { baslik: string; adet: number; children: React.ReactNode; testId?: string }) {
  const [acik, setAcik] = useState(false);
  if (adet === 0) return null;
  return (
    <div className="rounded-lg border" style={{ borderColor: CARD_BORDER }} data-testid={testId}>
      <button type="button" onClick={() => setAcik(!acik)} aria-expanded={acik}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.03] rounded-lg">
        <span>{baslik} <span className="tabular-nums" style={{ color: TEXT_MUTED }}>({adet})</span></span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${acik ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />
      </button>
      {acik && <div className="px-3 pb-3 max-h-64 overflow-y-auto text-xs space-y-1" style={{ color: "#C9D1DC" }}>{children}</div>}
    </div>
  );
}

const grupKodu = (sayfa: string, bolum: string | null) => (bolum ? `${sayfa} › ${bolum}` : sayfa);

export function ListeYukle({ mevcutFirmalar, mevcutKisiler, onKapat, onAktarildi }: {
  mevcutFirmalar: PazarFirma[];
  mevcutKisiler: PazarKisi[];
  onKapat: () => void;
  onAktarildi: () => void;
}) {
  const { showToast } = useToast();
  const girdi = useRef<HTMLInputElement>(null);
  const [asama, setAsama] = useState<Asama>("bos");
  const [hata, setHata] = useState<string | null>(null);
  const [etiket, setEtiket] = useState("");
  const [okunan, setOkunan] = useState<Okunan | null>(null);
  const [secim, setSecim] = useState<Record<string, boolean>>({});
  const [sonuc, setSonuc] = useState<AktarmaSonucu | null>(null);

  // Sunucudaki eslestirmeyle ayni: ana anahtar + birlestirilmis adlar; yoksa ayni e-posta
  const anahtarHarita = useMemo(() => {
    const m = new Map<string, PazarFirma>();
    for (const f of mevcutFirmalar) for (const a of [f.anahtar, ...(f.ek_anahtarlar || [])]) if (a && !m.has(a)) m.set(a, f);
    for (const f of mevcutFirmalar) m.set(f.anahtar, f);
    return m;
  }, [mevcutFirmalar]);
  const firmaAlanlari = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const k of mevcutKisiler) {
      const alan = k.eposta?.toLowerCase().split("@")[1];
      if (alan) m.set(k.firma_id, new Set([...Array.from(m.get(k.firma_id) || []), alan]));
    }
    return m;
  }, [mevcutKisiler]);
  const epostaHarita = useMemo(() => {
    const id = new Map(mevcutFirmalar.map((f) => [f.id, f]));
    const m = new Map<string, PazarFirma>();
    for (const k of mevcutKisiler) {
      const f = id.get(k.firma_id);
      if (f && k.eposta && !m.has(k.eposta.toLowerCase())) m.set(k.eposta.toLowerCase(), f);
    }
    return m;
  }, [mevcutFirmalar, mevcutKisiler]);

  async function dosyaSecildi(dosya: File | undefined) {
    if (!dosya) return;
    setHata(null);
    setSonuc(null);
    setAsama("okunuyor");
    try {
      const sayfalar = await xlsxSayfalariOku(dosya);
      const okuma = listeSayfalariniOku(sayfalar);
      const anahtarlar = await pazarAnahtarlari(okuma.satirlar.map((s) => s.firma));
      setOkunan({ dosyaAdi: dosya.name, okuma, anahtarlar });
      setSecim(Object.fromEntries(okuma.gruplar.map((g) => [g.kod, g.dahil])));
      if (!etiket.trim()) setEtiket(dosya.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
      setAsama("onizleme");
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Dosya okunamadı.");
      setAsama("bos");
    } finally {
      if (girdi.current) girdi.current.value = "";
    }
  }

  const etiketTemiz = etiket.trim();
  const onizleme = useMemo(() => {
    if (!okunan) return null;
    const idx = okunan.okuma.satirlar.map((s, i) => ({ s, i })).filter(({ s }) => secim[grupKodu(s.sayfa, s.bolum)]);
    const firmalar = listeFirmalariniBirlestir(idx.map((x) => x.s), idx.map((x) => okunan.anahtarlar[x.i]), etiketTemiz || "Rehber listesi")
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    const yeni: ListeFirma[] = [];
    const mevcut: { f: ListeFirma; m: PazarFirma; yol: "ad" | "eposta" }[] = [];
    for (const f0 of firmalar) {
      let f = f0;
      let adla = anahtarHarita.get(f.anahtar);
      // Kisa / genel ad ("Negoce") sistemde BASKA ulkedeki firmayla eslesiyorsa ve ortak e-posta alani yoksa ayri firmadir:
      // ad ulkeyle ayrilir (sunucu yeni adin anahtariyla yeni kayit acar). Ortak alan varsa (ayni sirket) birlesir.
      if (adla && f.anahtar.length <= 6 && adla.ulke && f.ulke && adla.ulke !== f.ulke) {
        const alanlar = firmaAlanlari.get(adla.id) || new Set<string>();
        const ortak = f.kisiler.some((k) => k.eposta && alanlar.has(k.eposta.split("@")[1]));
        if (!ortak) { f = { ...f, ad: `${f.ad} (${ulkeGosterim(f.ulke)})`, anahtar: `${f.anahtar}~${f.ulke}` }; adla = undefined; }
      }
      const epostayla = adla ? undefined : f.kisiler.map((k) => (k.eposta && k.eposta_gecerli ? epostaHarita.get(k.eposta) : undefined)).find(Boolean);
      if (adla) mevcut.push({ f, m: adla, yol: "ad" });
      else if (epostayla) mevcut.push({ f, m: epostayla, yol: "eposta" });
      else yeni.push(f);
    }
    return {
      satir: idx.length,
      firmalar: [...yeni, ...mevcut.map((x) => x.f)].sort((a, b) => a.ad.localeCompare(b.ad, "tr")), yeni, mevcut,
      musteri: mevcut.filter((x) => x.m.durum === "musteri"),
      birlesen: firmalar.filter((f) => f.kaynaklar.length > 1),
      epostali: firmalar.filter((f) => f.kisiler.some((k) => k.eposta && k.eposta_gecerli)).length,
      kisi: firmalar.reduce((t, f) => t + f.kisiler.length, 0),
      bozuk: firmalar.flatMap((f) => f.kisiler.filter((k) => k.eposta && !k.eposta_gecerli).map((k) => ({ f, e: k.eposta! }))),
    };
  }, [okunan, secim, etiketTemiz, anahtarHarita, epostaHarita, firmaAlanlari]);

  async function aktar() {
    if (!okunan || !onizleme || !etiketTemiz) return;
    setAsama("aktariliyor");
    setHata(null);
    try {
      const s = await rehberListesiAktar(okunan.dosyaAdi, etiketTemiz, onizleme.firmalar);
      setSonuc(s);
      setAsama("bitti");
      showToast(`${s.firma} firma aktarıldı (${s.yeni_firma} yeni).`);
      onAktarildi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Aktarma tamamlanamadı.");
      setAsama("onizleme");
    }
  }

  const gruplar = okunan?.okuma.gruplar || [];
  const haricSay = gruplar.filter((g) => !secim[g.kod]).reduce((t, g) => t + g.satir, 0);

  return (
    <section className="rounded-xl border mb-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="liste-yukle">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet size={18} style={{ color: ACCENT }} className="shrink-0" />
          <h2 className="text-sm font-semibold text-white truncate">Rehber listesi yükle</h2>
        </div>
        <button type="button" onClick={onKapat} aria-label="Kapat" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: TEXT_MUTED }}>
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <input ref={girdi} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          data-testid="liste-dosya" onChange={(e) => dosyaSecildi(e.target.files?.[0])} />

        {(asama === "bos" || asama === "okunuyor") && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center" style={{ borderColor: "#2A3240" }}>
            <p className="text-sm text-white">Ülke sayfalı müşteri rehberini (Excel) seçin</p>
            <p className="text-xs mt-1 max-w-xl mx-auto" style={{ color: TEXT_MUTED }}>
              Her sayfa bir ülke (ör. &quot;Gana&quot;, &quot;Malezya&quot;). Sütunlar: Firma, Kişi, Mail, Telefon, Fax, Adres, Not.
              Sistemde zaten olan firmalar yeniden açılmaz; yeni kişiler ve notlar mevcut kayda eklenir.
              Dosya bilgisayarınızda okunur; önizlemeden sonra siz onaylayınca kaydedilir.
            </p>
            <button type="button" onClick={() => girdi.current?.click()} disabled={asama === "okunuyor"} data-testid="liste-sec"
              className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}>
              {asama === "okunuyor" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {asama === "okunuyor" ? "Okunuyor…" : "Excel seç"}
            </button>
          </div>
        )}

        {hata && (
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }} data-testid="liste-hata">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
          </div>
        )}

        {okunan && onizleme && (asama === "onizleme" || asama === "aktariliyor") && (
          <div className="space-y-4" data-testid="liste-onizleme">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px]">
                <span className="text-xs" style={{ color: TEXT_MUTED }}>Liste adı (firma kartında kaynak olarak görünür)</span>
                <input value={etiket} onChange={(e) => setEtiket(e.target.value.slice(0, 80))} placeholder="ör. Şafak Bey listesi" data-testid="liste-etiket"
                  className="mt-1 w-full h-9 px-3 rounded-lg border bg-transparent text-sm text-white placeholder:text-[#5B6576] outline-none focus:border-emerald-500/60" style={{ borderColor: CARD_BORDER }} />
              </label>
              <p className="text-sm text-white pb-2">
                <span className="font-medium">{okunan.dosyaAdi}</span>
                <span style={{ color: TEXT_MUTED }}> · {okunan.okuma.satirlar.length} satır · {haricSay} satır hariç</span>
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kutu etiket="Firma (birleştirilmiş)" deger={onizleme.firmalar.length} testId="lz-firma" />
              <Kutu etiket="Yeni potansiyel" deger={onizleme.yeni.length} renk={ACCENT} testId="lz-yeni" />
              <Kutu etiket="Mevcut kayda eklenecek" deger={onizleme.mevcut.length} testId="lz-mevcut" />
              <Kutu etiket="Müşterimizle eşleşen" deger={onizleme.musteri.length} renk="#60A5FA" testId="lz-musteri" />
              <Kutu etiket="E-postası olan firma" deger={onizleme.epostali} testId="lz-epostali" />
              <Kutu etiket="Yetkili kişi" deger={onizleme.kisi} testId="lz-kisi" />
              <Kutu etiket="Dosyada tekrar eden" deger={onizleme.birlesen.length} testId="lz-birlesen" />
              <Kutu etiket="Bozuk e-posta" deger={onizleme.bozuk.length} renk={onizleme.bozuk.length ? "#FBBF24" : undefined} testId="lz-bozuk" />
            </div>

            <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs" data-testid="liste-gruplar">
                  <thead className="sticky top-0" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                    <tr>
                      <th className="text-left font-medium px-3 py-2 w-10">Dahil</th>
                      <th className="text-left font-medium px-3 py-2">Excel sayfası / bölüm</th>
                      <th className="text-left font-medium px-3 py-2">Ülke</th>
                      <th className="text-right font-medium px-3 py-2">Satır</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruplar.map((g) => (
                      <tr key={g.kod} className="border-t" style={{ borderColor: CARD_BORDER, opacity: secim[g.kod] ? 1 : 0.6 }} data-liste-grup={g.kod}>
                        <td className="px-3 py-1.5">
                          <input type="checkbox" checked={!!secim[g.kod]} onChange={(e) => setSecim({ ...secim, [g.kod]: e.target.checked })} aria-label={`${g.kod} dahil`} disabled={asama === "aktariliyor"} />
                        </td>
                        <td className="px-3 py-1.5 text-white">
                          {g.kod}
                          {g.neden && <span className="ml-2 text-[11px]" style={{ color: "#FBBF24" }}>{g.neden}</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "#C9D1DC" }}>
                          {g.ulke ? <span className="inline-flex items-center gap-1.5"><UlkeBayrak ulke={g.ulke} /> {ulkeGosterim(g.ulke)}</span> : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{g.satir}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <Acilir baslik="Sistemde zaten olan firmalar (yeni kayıt açılmaz, mevcut kayda eklenir)" adet={onizleme.mevcut.length} testId="lc-mevcut">
                {onizleme.mevcut.map(({ f, m, yol }) => (
                  <p key={f.anahtar} data-mevcut-eslesme>
                    <span className="text-white">{f.ad}</span> <span style={{ color: TEXT_MUTED }}>→ {m.ad}{m.durum === "musteri" ? " (müşterimiz)" : ""}{yol === "eposta" ? " · aynı e-posta" : ""}</span>
                  </p>
                ))}
              </Acilir>
              <Acilir baslik="Dosyada birden çok satırda geçen firmalar (tek kayıt olur)" adet={onizleme.birlesen.length} testId="lc-birlesen">
                {onizleme.birlesen.map((f) => <p key={f.anahtar}><span className="text-white">{f.ad}</span> <span style={{ color: TEXT_MUTED }}>{f.kaynaklar.join(", ")}</span></p>)}
              </Acilir>
              <Acilir baslik="Bozuk e-postalar (kaydedilir, “düzeltilmeli” işaretlenir)" adet={onizleme.bozuk.length} testId="lc-bozuk">
                {onizleme.bozuk.map(({ f, e }, i) => <p key={`${f.anahtar}-${i}`}><span className="text-white">{f.ad}</span> <span style={{ color: "#FBBF24" }}>{e}</span></p>)}
              </Acilir>
              <Acilir baslik="Uyarılar" adet={okunan.okuma.uyarilar.length} testId="lc-uyari">
                {okunan.okuma.uyarilar.map((u, i) => <p key={i}>{u}</p>)}
              </Acilir>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {!etiketTemiz && <span className="text-xs mr-auto" style={{ color: "#FBBF24" }}>Liste adını yazın.</span>}
              <button type="button" onClick={() => { setOkunan(null); setAsama("bos"); }} disabled={asama === "aktariliyor"}
                className="h-9 px-4 rounded-lg text-sm border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
                Başka dosya
              </button>
              <button type="button" onClick={aktar} disabled={asama === "aktariliyor" || onizleme.firmalar.length === 0 || !etiketTemiz} data-testid="liste-aktar"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {asama === "aktariliyor" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {asama === "aktariliyor" ? "Aktarılıyor…" : `Aktar (${onizleme.firmalar.length} firma)`}
              </button>
            </div>
          </div>
        )}

        {asama === "bitti" && sonuc && (
          <div className="rounded-lg border px-4 py-3 space-y-1 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)" }} data-testid="liste-sonuc">
            <p className="flex items-center gap-2 text-white font-medium"><CheckCircle2 size={16} style={{ color: ACCENT }} /> Aktarma tamamlandı</p>
            <p style={{ color: "#C9D1DC" }}>
              {sonuc.firma} firma işlendi: <b className="text-white" data-sonuc-yeni>{sonuc.yeni_firma}</b> yeni potansiyel, {sonuc.guncellenen_firma} mevcut kayda eklendi
              ({sonuc.musteri_eslesen} müşterimiz). {sonuc.yeni_kisi} yeni yetkili.
            </p>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>E-postası olan yeni firmalar günlük görevlere fuar listesiyle sırayla (karışık) girer.</p>
            <div className="pt-2 flex gap-2">
              <button type="button" onClick={() => { setOkunan(null); setSonuc(null); setAsama("bos"); }} className="h-8 px-3 rounded-lg text-xs border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>Başka dosya yükle</button>
              <button type="button" onClick={onKapat} className="h-8 px-3 rounded-lg text-xs text-white" style={{ backgroundColor: ACCENT }}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
