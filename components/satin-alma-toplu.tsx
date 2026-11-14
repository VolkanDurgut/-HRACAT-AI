"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";
import { B, dugmeAna, dugmeIkincil, girdiSinifi, girdiStil, thSinifi } from "@/components/satin-alma-belge";
import { miktarOku } from "@/lib/satin-alma/api";
import type { ExcelSatiri } from "@/lib/satin-alma/excel";
import {
  BIRIMLER, KATEGORILER, kalemAnahtari, miktarYaz, saTarih, tedarikciDuzelt, urunNorm,
  type Birim, type Kategori, type SaKalem, type SaUrun,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * Talep formu HIZLI LISTE paneli (31.10.2026)
 * Kullanici: "Her hafta persembe siparis veriliyor (Excel)" + "URUNLER HER SEFERINDE
 * KENDINI OTOMATIK KAYIT ETSIN ... Bir sure sonra secerek ilerleyebilmeliyiz."
 * Uc kaynak, tek onizleme tablosu:
 *  - katalog : daha once siparis verilen urunler (form gonderilince otomatik kaydolur)
 *  - kopya   : departmanin son gonderdigi form (reddedilenler secili GELMEZ)
 *  - excel   : yuklenen alisveris listesi (supheli satir isaretli, sessizce atlanmaz)
 * Satirlar duzenlenebilir; formda zaten olan urun ("Formda var") ve listede tekrar eden
 * urun secilemez. Ekleme sunucuda TEK islemde (kalemler_ekle): gecersiz satir hepsini
 * geri alir, formda olan atlanir ve raporlanir.
 */

export type TopluKaynak = "katalog" | "kopya" | "excel";

export type TopluSatir = {
  anahtar: string;
  secili: boolean;
  urun: string;
  kategori: Kategori | "";
  miktar: string;
  birim: Birim | "";
  tedarikci: string;
  aciklama: string;
  aciliyet: "normal" | "acil";
  /** Bilgi (degistirilemez): kaynak satirdaki ipucu */
  bilgi: string;
  /** Excel / kopya kaynakli sorun (kullanici duzeltince kalkar) */
  sorun: string | null;
  /** Hesaplanan engel ("Formda var", "Listede tekrar") */
  engel?: string | null;
  depKullanim?: number;
};

const sayiYaz = (m: number | string | null | undefined) => (m == null || m === "" ? "" : miktarYaz(m));

export function katalogSatirlari(urunler: SaUrun[]): TopluSatir[] {
  return urunler.map((u, i) => {
    const birim = (u.dep_son_birim && u.dep_son_birim in BIRIMLER ? u.dep_son_birim : u.birim in BIRIMLER ? u.birim : "") as Birim | "";
    const bilgi = u.dep_kullanim
      ? `Departmanınız ${u.dep_kullanim} kez aldı${u.dep_son ? ` · son ${saTarih(u.dep_son).slice(0, 10)}` : ""}`
      : `${u.kullanim} kez talep edildi (diğer departmanlar)`;
    return {
      anahtar: `k${i}`, secili: false, urun: u.ad, kategori: u.kategori in KATEGORILER ? u.kategori : "",
      miktar: sayiYaz(u.dep_son_miktar ?? u.son_miktar), birim, tedarikci: u.tedarikci || "", aciklama: "", aciliyet: "normal",
      bilgi, sorun: null, depKullanim: u.dep_kullanim || 0,
    };
  });
}

export function kopyaSatirlari(kalemler: SaKalem[]): TopluSatir[] {
  return kalemler.map((k, i) => ({
    anahtar: `c${i}`, secili: k.karar !== "reddedildi", urun: k.urun, kategori: k.kategori, miktar: sayiYaz(k.miktar),
    birim: k.birim, tedarikci: k.tedarikci || "", aciklama: k.aciklama || "", aciliyet: "normal",
    bilgi: k.karar === "reddedildi" ? `Geçen sefer reddedildi${k.red_nedeni ? `: ${k.red_nedeni}` : ""}` : k.karar === "onaylandi" ? "Geçen sefer onaylandı" : "Onay bekliyor",
    sorun: null,
  }));
}

export function excelSatirlari(satirlar: ExcelSatiri[]): TopluSatir[] {
  return satirlar.map((x) => ({
    anahtar: `e${x.hucre || x.sira}`, secili: true, urun: x.urun, kategori: x.kategori, miktar: x.miktar == null ? "" : miktarYaz(x.miktar),
    birim: x.birim ?? "", tedarikci: x.tedarikci || "", aciklama: x.aciklama, aciliyet: "normal",
    bilgi: `Excel ${x.hucre ? `hücre ${x.hucre}` : `satır ${x.sira}`}${x.blok ? ` · ${x.blok} bloğu` : ""}${x.kategoriHam ? ` · ${x.kategoriHam}` : ""}`, sorun: x.sorun,
  }));
}

/** Formda zaten olan ve listede daha once gecen kalemleri isaretler.
 * 14.11.2026: anahtar URUN + TEDARIKCI (ayni urun farkli tedarikciden ayri satir olabilir). */
export type FormdakiKalem = { urun: string; tedarikci?: string | null };
export function engelleriIsaretle(satirlar: TopluSatir[], formdakiler: FormdakiKalem[]): TopluSatir[] {
  const form = new Set(formdakiler.filter((f) => urunNorm(f.urun)).map((f) => kalemAnahtari(f.urun, f.tedarikci)));
  const gorulen = new Set<string>();
  return satirlar.map((s) => {
    const dolu = !!urunNorm(s.urun);
    const n = kalemAnahtari(s.urun, s.tedarikci);
    let engel: string | null = null;
    if (dolu && form.has(n)) engel = s.tedarikci.trim() ? "Bu tedarikçiden formda var" : "Formda var";
    else if (dolu && gorulen.has(n)) engel = "Listede tekrar";
    if (dolu && !engel) gorulen.add(n);
    return { ...s, engel, secili: engel ? false : s.secili };
  });
}

/** Satirin eklenmeye hazir olup olmadigi; hazir degilse neden. */
export function satirEksigi(s: TopluSatir): string | null {
  if (s.engel) return s.engel;
  if (s.urun.trim().length < 2) return "Ürün adı yok";
  if (!s.kategori) return "Kategori seçin";
  if (miktarOku(s.miktar) === null) return "Miktar geçersiz";
  if (!s.birim) return "Birim seçin";
  return null;
}

export type TopluSonuc = { eklenen: number; atlanan: { sira: number; urun: string; neden: string }[] };

const BASLIK: Record<TopluKaynak, string> = {
  katalog: "Katalogdan seç",
  kopya: "Geçen listeyi kopyala",
  excel: "Excel'den yükle",
};

export function TopluEklemePaneli({ kaynak, altBaslik, ilkSatirlar, formdakiler, uyarilar, ekleniyor, hata, onEkle, onKapat }: {
  kaynak: TopluKaynak; altBaslik?: string; ilkSatirlar: TopluSatir[]; formdakiler: FormdakiKalem[]; uyarilar?: string[];
  ekleniyor: boolean; hata: string | null;
  onEkle: (satirlar: TopluSatir[]) => void; onKapat: () => void;
}) {
  const [satirlar, setSatirlar] = useState<TopluSatir[]>(() => engelleriIsaretle(ilkSatirlar, formdakiler));
  const [arama, setArama] = useState("");
  const [tedarikciFiltre, setTedarikciFiltre] = useState("");
  const [yalnizDep, setYalnizDep] = useState(kaynak === "katalog" && ilkSatirlar.some((s) => (s.depKullanim || 0) > 0));

  const guncelle = (anahtar: string, alanlar: Partial<TopluSatir>) => setSatirlar((liste) => {
    const yeni = liste.map((s) => (s.anahtar === anahtar ? { ...s, ...alanlar, ...(alanlar.urun !== undefined || alanlar.miktar !== undefined || alanlar.birim !== undefined ? { sorun: null } : {}) } : s));
    // Urun adi ya da tedarikci degisirse engeller yeniden hesaplanir (secim korunur;
    // engeli kalkan satir kendiliginden secilmez)
    if (alanlar.urun === undefined && alanlar.tedarikci === undefined) return yeni;
    const secimler = new Map(yeni.map((s) => [s.anahtar, s.secili]));
    return engelleriIsaretle(yeni, formdakiler).map((s) => ({ ...s, secili: s.engel ? false : secimler.get(s.anahtar) ?? s.secili }));
  });

  const tedarikciler = useMemo(() => Array.from(new Set(satirlar.map((s) => tedarikciDuzelt(s.tedarikci)).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "tr")), [satirlar]);
  const q = urunNorm(arama);
  const gorunen = satirlar.filter((s) =>
    (!q || urunNorm(s.urun).includes(q)) &&
    (!tedarikciFiltre || (tedarikciFiltre === "-" ? !tedarikciDuzelt(s.tedarikci) : tedarikciDuzelt(s.tedarikci) === tedarikciFiltre)) &&
    (!yalnizDep || (s.depKullanim || 0) > 0));
  const secililer = satirlar.filter((s) => s.secili);
  const eksikli = secililer.filter((s) => satirEksigi(s));
  const sorunlu = satirlar.filter((s) => !s.engel && (s.sorun || (s.secili && satirEksigi(s)))).length;
  const gorunenSecilebilir = gorunen.filter((s) => !s.engel);
  const hepsiSecili = gorunenSecilebilir.length > 0 && gorunenSecilebilir.every((s) => s.secili);
  const tumunuSec = (v: boolean) => {
    const anahtarlar = new Set(gorunenSecilebilir.map((s) => s.anahtar));
    setSatirlar((l) => l.map((s) => (anahtarlar.has(s.anahtar) ? { ...s, secili: v } : s)));
  };

  return (
    <div className="border rounded-[4px] mx-4 sm:mx-5 my-4" style={{ borderColor: B.lacivert2, backgroundColor: "#fff" }} data-testid="toplu-panel">
      <div className="px-3.5 sm:px-4 py-3 border-b flex flex-wrap items-start justify-between gap-2" style={{ borderColor: B.cizgi, backgroundColor: "#F1F3F9" }}>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: B.lacivert }}>{BASLIK[kaynak]}</p>
          <p className="text-xs mt-0.5" style={{ color: B.soluk }}>
            {altBaslik ? `${altBaslik} · ` : ""}{satirlar.length} kalem · seçilenleri kontrol edip forma ekleyin; miktar, birim ve tedarikçi düzenlenebilir.
          </p>
        </div>
        <button onClick={onKapat} aria-label="Paneli kapat" className="p-1.5 rounded-[3px] hover:bg-white" style={{ color: B.soluk }}><X size={16} /></button>
      </div>

      {(uyarilar?.length || sorunlu > 0) ? (
        <div className="px-3.5 sm:px-4 pt-3 space-y-1">
          {uyarilar?.map((u) => <p key={u} className="text-[12.5px] flex items-start gap-1.5" style={{ color: B.turuncu }}><AlertTriangle size={13} className="shrink-0 mt-0.5" />{u}</p>)}
          {sorunlu > 0 && (
            <p className="text-[12.5px] flex items-start gap-1.5" style={{ color: B.turuncu }} data-testid="toplu-sorunlu">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {sorunlu} satırda düzeltme gerekiyor (turuncu). Düzeltin ya da seçimi kaldırın.
            </p>
          )}
        </div>
      ) : null}

      {/* Filtreler */}
      <div className="px-3.5 sm:px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: B.soluk }} />
          <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Ürün ara" aria-label="Ürün ara" className={`${girdiSinifi} pl-8`} style={girdiStil} />
        </div>
        {tedarikciler.length > 0 && (
          <select value={tedarikciFiltre} onChange={(e) => setTedarikciFiltre(e.target.value)} aria-label="Tedarikçi filtresi" className={`${girdiSinifi} w-auto`} style={girdiStil}>
            <option value="">Tüm tedarikçiler</option>
            {tedarikciler.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="-">Tedarikçi belirtilmemiş</option>
          </select>
        )}
        {kaynak === "katalog" && (
          <label className="inline-flex items-center gap-1.5 text-[13px] cursor-pointer select-none">
            <input type="checkbox" checked={yalnizDep} onChange={(e) => setYalnizDep(e.target.checked)} className="w-4 h-4" />
            Yalnız departmanımızın aldıkları
          </label>
        )}
        <span className="text-xs ml-auto" style={{ color: B.soluk }}>{gorunen.length} / {satirlar.length} gösteriliyor</span>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto border-t" style={{ borderColor: B.cizgi }}>
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b" style={{ borderColor: B.cizgi, color: B.soluk, backgroundColor: B.baslikZemin }}>
              <th className={`${thSinifi} w-9`}>
                <input type="checkbox" checked={hepsiSecili} onChange={(e) => tumunuSec(e.target.checked)} aria-label="Görünenlerin tümünü seç" className="w-4 h-4 align-middle" />
              </th>
              <th className={thSinifi}>Ürün / hizmet</th>
              <th className={`${thSinifi} w-40`}>Kategori</th>
              <th className={`${thSinifi} w-24 text-right`}>Miktar</th>
              <th className={`${thSinifi} w-28`}>Birim</th>
              <th className={`${thSinifi} w-40`}>Tedarikçi</th>
            </tr>
          </thead>
          <tbody>
            {gorunen.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: B.soluk }}>Gösterilecek kalem yok.</td></tr>
            )}
            {gorunen.map((s) => {
              const eksik = s.engel ? null : s.sorun || (s.secili ? satirEksigi(s) : null);
              return (
                <tr key={s.anahtar} className="border-b last:border-0 align-top" data-testid="toplu-satir"
                  style={{ borderColor: B.cizgiAcik, backgroundColor: s.engel ? "#F7F8FA" : eksik ? B.turuncuZemin : s.secili ? "#F7F9FE" : undefined }}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={s.secili} disabled={!!s.engel} onChange={(e) => guncelle(s.anahtar, { secili: e.target.checked })}
                      aria-label={`${s.urun} seç`} className="w-4 h-4 mt-2" />
                  </td>
                  <td className="px-3 py-2 min-w-[200px]">
                    <input value={s.urun} onChange={(e) => guncelle(s.anahtar, { urun: e.target.value })} maxLength={200} aria-label="Ürün adı"
                      className={`${girdiSinifi} h-8`} style={{ ...girdiStil, opacity: s.engel ? 0.6 : 1 }} />
                    <p className="text-[11px] mt-1 break-words" style={{ color: B.soluk }}>
                      {s.engel ? <b style={{ color: B.soluk }}>{s.engel}</b> : eksik ? <b style={{ color: B.turuncu }}>{eksik}</b> : s.bilgi}
                      {s.engel || eksik ? <> · {s.bilgi}</> : null}
                      {s.aciklama ? <> · Not: {s.aciklama}</> : null}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <select value={s.kategori} onChange={(e) => guncelle(s.anahtar, { kategori: e.target.value as Kategori })} aria-label="Kategori" className={`${girdiSinifi} h-8`} style={girdiStil}>
                      <option value="">Seçiniz</option>
                      {(Object.keys(KATEGORILER) as Kategori[]).map((k) => <option key={k} value={k}>{KATEGORILER[k]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={s.miktar} onChange={(e) => guncelle(s.anahtar, { miktar: e.target.value })} inputMode="decimal" aria-label="Miktar"
                      className={`${girdiSinifi} h-8 text-right tabular-nums`} style={girdiStil} />
                  </td>
                  <td className="px-3 py-2">
                    <select value={s.birim} onChange={(e) => guncelle(s.anahtar, { birim: e.target.value as Birim })} aria-label="Birim" className={`${girdiSinifi} h-8`} style={girdiStil}>
                      <option value="">Seçiniz</option>
                      {(Object.keys(BIRIMLER) as Birim[]).map((b) => <option key={b} value={b}>{BIRIMLER[b]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={s.tedarikci} onChange={(e) => guncelle(s.anahtar, { tedarikci: e.target.value })} maxLength={80} aria-label="Tedarikçi"
                      list="sa-tedarikciler" placeholder="İsteğe bağlı" className={`${girdiSinifi} h-8`} style={girdiStil} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3.5 sm:px-4 py-3 border-t flex flex-wrap items-center justify-end gap-2" style={{ borderColor: B.cizgi }}>
        {hata && <p className="mr-auto text-[13px] font-medium" role="alert" style={{ color: B.kirmizi }}>{hata}</p>}
        {!hata && eksikli.length > 0 && <p className="mr-auto text-[12.5px]" style={{ color: B.turuncu }}>Seçili {eksikli.length} satır eksik; eklemeden önce düzeltin.</p>}
        <button onClick={onKapat} className={dugmeIkincil} style={{ borderColor: B.cizgi }}>Vazgeç</button>
        <button onClick={() => onEkle(secililer)} disabled={ekleniyor || secililer.length === 0 || eksikli.length > 0}
          className={dugmeAna} style={{ backgroundColor: B.lacivert2 }} data-testid="toplu-ekle">
          {ekleniyor ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Seçilenleri forma ekle ({secililer.length})
        </button>
      </div>
    </div>
  );
}

export function TopluSonucNotu({ sonuc }: { sonuc: TopluSonuc }) {
  return (
    <div className="mx-4 sm:mx-5 mt-3 border-l-[3px] rounded-[3px] px-3 py-2 text-[13px]" role="status" data-testid="toplu-sonuc"
      style={{ borderColor: B.yesil, backgroundColor: B.yesilZemin }}>
      <p className="font-semibold flex items-center gap-1.5" style={{ color: B.yesil }}><CheckCircle2 size={14} /> {sonuc.eklenen} kalem forma eklendi.</p>
      {sonuc.atlanan.length > 0 && (
        <p className="mt-0.5" style={{ color: B.metin }}>
          Atlanan {sonuc.atlanan.length}: {sonuc.atlanan.slice(0, 6).map((a) => `${a.urun} (${a.neden.toLocaleLowerCase("tr-TR")})`).join(", ")}{sonuc.atlanan.length > 6 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
