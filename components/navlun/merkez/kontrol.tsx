"use client";
/**
 * Navlun Merkezi > Kontrol (24.11.2026, kullanici onayi). Elle bakilmasi gereken her sey tek listede; her kalemde tek
 * tikla sonuclanan islemler (navlun_kontrol_isle RPC, iz birakir):
 *   Duzelt ve Kaydet  - okunamayan / teklif olabilecek mail: tutari girip teklif olarak kaydet
 *   Olduğu Gibi Onayla - yalniz tutmayan gerceklesen navlun; gerekce zorunlu
 *   Yoksay            - kalem listeden kalkar
 *   Kural olarak ogret - acente hafizasi: lokal dahil / haric + tutar (acentenin tum teklifleri yeniden hesaplanir)
 * 48 saati gecen kalem kirmizi isaretlenir ve listenin basina gelir.
 */
import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { acenteAnahtari } from "@/lib/navlun/karsilastirma";
import { GECIKME_SAAT, KONTROL_ADI, yasYaz, type KontrolKalemi, type KontrolTuru } from "@/lib/navlun/merkez";
import { kontrolIsle } from "@/lib/navlun/merkez-veri";
import { Bos, GIRDI, gunYaz, Kart, Rozet, tutarYaz, zamanYaz } from "@/components/navlun/merkez/ortak";

type Sonuc = (yenidenHesap: boolean) => void;

const sayiOku = (s: string) => Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

function Dugme({ children, onClick, bekle, ana, testId }: { children: React.ReactNode; onClick: () => void; bekle: boolean; ana?: boolean; testId?: string }) {
  return (
    <button type="button" disabled={bekle} onClick={onClick} data-testid={testId}
      className={`h-8 px-3 rounded-lg text-sm disabled:opacity-60 ${ana ? "font-medium text-white" : "border"}`}
      style={ana ? { backgroundColor: ACCENT } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>{children}</button>
  );
}

function useIslem(onBitti: Sonuc) {
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const calistir = async (f: () => Promise<boolean>) => {
    setHata(null); setBekle(true);
    try { onBitti(await f()); } catch (e) { setHata(e instanceof Error ? e.message : "İşlem yapılamadı."); } finally { setBekle(false); }
  };
  return { bekle, hata, setHata, calistir };
}

/** Okunamayan / teklif olabilecek mail: Duzelt ve Kaydet + Yoksay */
function MailIslemi({ k, onBitti }: { k: KontrolKalemi; onBitti: Sonuc }) {
  const bilinmeyen = k.tur === "aday" && !k.aday?.acente;
  const [tutar, setTutar] = useState("");
  const [ekipman, setEkipman] = useState("20DC");
  const [armator, setArmator] = useState("");
  const [acente, setAcente] = useState(() => { const e = (k.aday?.alan || "").split(".")[0] || ""; return e ? e.charAt(0).toUpperCase() + e.slice(1) : ""; });
  const [acik, setAcik] = useState(false);
  const { bekle, hata, setHata, calistir } = useIslem(onBitti);
  const metin = k.okunamayan?.ozet || k.aday?.metin || "";
  const kaydet = () => {
    const n = sayiOku(tutar);
    if (!(n > 0 && n < 100000)) { setHata("Geçerli bir tutar girin."); return; }
    if (bilinmeyen && !acente.trim()) { setHata("Acente adını girin."); return; }
    calistir(() => kontrolIsle("mesaj", k.hedefId, "duzelt", { tutar: n, ekipman, armator: armator.trim() || null, acente: bilinmeyen ? acente.trim() : null }));
  };
  return (
    <>
      {metin && <button type="button" onClick={() => setAcik(!acik)} className="mt-1 text-xs underline" style={{ color: TEXT_MUTED }}>{acik ? "metni gizle" : "mail metni"}</button>}
      {acik && <pre className="mt-2 text-xs whitespace-pre-wrap rounded-lg p-2 max-h-48 overflow-auto" style={{ backgroundColor: ROW_HEADER_BG, color: "#C9D1DC" }}>{metin}</pre>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {bilinmeyen && <input value={acente} onChange={(e) => setAcente(e.target.value)} placeholder="Acente adı" aria-label="Acente adı" className={`${GIRDI} w-36`} style={{ borderColor: CARD_BORDER }} />}
        <input value={tutar} onChange={(e) => setTutar(e.target.value)} inputMode="decimal" placeholder="Navlun (USD)" aria-label="Navlun tutarı" className={`${GIRDI} w-32`} style={{ borderColor: CARD_BORDER }} />
        <select value={ekipman} onChange={(e) => setEkipman(e.target.value)} aria-label="Ekipman" className="h-8 rounded-lg border px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
          <option value="20DC">20&apos;DC</option><option value="40DC">40&apos;DC</option><option value="40HC">40&apos;HC</option>
        </select>
        <input value={armator} onChange={(e) => setArmator(e.target.value)} placeholder="Armatör (isteğe bağlı)" aria-label="Armatör" className={`${GIRDI} w-44`} style={{ borderColor: CARD_BORDER }} />
        <Dugme ana bekle={bekle} onClick={kaydet} testId="kontrol-duzelt">Düzelt ve Kaydet</Dugme>
        <Dugme bekle={bekle} onClick={() => calistir(() => kontrolIsle("mesaj", k.hedefId, "yoksay"))} testId="kontrol-yoksay">Yoksay (teklif değil)</Dugme>
        {hata && <span className="text-xs" style={{ color: "#FCA5A5" }}>{hata}</span>}
      </div>
    </>
  );
}

/** Lokal celiskisi / lokali belirsiz acente: Kural olarak ogret + Yoksay */
function OgretIslemi({ k, onBitti }: { k: KontrolKalemi; onBitti: Sonuc }) {
  const ornek = k.teklif ?? k.teklifler?.[0];
  const [lokal, setLokal] = useState<"dahil" | "haric" | "">(k.tur === "celiski" ? "haric" : ornek?.lokal_durum === "haric" ? "haric" : "");
  const [l20, setL20] = useState(k.tur === "celiski" && k.teklif?.lokal ? String(k.teklif.lokal) : "");
  const [l40, setL40] = useState("");
  const [gerekce, setGerekce] = useState("");
  const [liste, setListe] = useState(false);
  const { bekle, hata, setHata, calistir } = useIslem(onBitti);
  const anahtar = acenteAnahtari(k.acente);
  const ogret = () => {
    if (!anahtar) { setHata("Acente bilinmiyor."); return; }
    if (!lokal) { setHata("Lokal dahil mi hariç mi seçin."); return; }
    const n20 = l20.trim() ? sayiOku(l20) : null, n40 = l40.trim() ? sayiOku(l40) : null;
    if (lokal === "haric" && !(n20 && n20 > 0 && n20 < 10000)) { setHata("20'lik lokal tutarını girin (USD, KDV hariç)."); return; }
    if (n40 !== null && !(n40 > 0 && n40 < 10000)) { setHata("40'lık lokal tutarı geçersiz."); return; }
    calistir(() => kontrolIsle(k.hedefTur, k.hedefId, "ogret", { acente_anahtar: anahtar, acente_ad: k.acente, lokal, lokal_20: lokal === "haric" ? n20 : null, lokal_40: lokal === "haric" ? n40 : null }, gerekce));
  };
  return (
    <>
      {k.teklifler && k.teklifler.length > 0 && (
        <>
          <button type="button" onClick={() => setListe(!liste)} className="mt-1 text-xs underline" style={{ color: TEXT_MUTED }}>{liste ? "teklifleri gizle" : `teklifleri göster (${k.teklifler.length})`}</button>
          {liste && (
            <ul className="mt-2 text-xs space-y-0.5 rounded-lg p-2" style={{ backgroundColor: ROW_HEADER_BG, color: "#C9D1DC" }}>
              {k.teklifler.map((t) => <li key={t.teklif_id}>{gunYaz(t.tarih)} · {t.liman || t.liman_anahtar} · {t.ekipman || "20DC"} {tutarYaz(t.tutar, t.para)} · {t.metin}</li>)}
            </ul>
          )}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{k.acente} fiyatlarında çıkış lokali:</span>
        {(["dahil", "haric"] as const).map((x) => (
          <label key={x} className="inline-flex items-center gap-1 text-sm text-white cursor-pointer">
            <input type="radio" name={`lokal-${k.anahtar}`} checked={lokal === x} onChange={() => setLokal(x)} /> {x === "dahil" ? "dahil" : "hariç"}
          </label>
        ))}
        {lokal === "haric" && (
          <>
            <input value={l20} onChange={(e) => setL20(e.target.value)} inputMode="decimal" placeholder="Lokal 20' (USD)" aria-label="20'lik lokal" className={`${GIRDI} w-32`} style={{ borderColor: CARD_BORDER }} />
            <input value={l40} onChange={(e) => setL40(e.target.value)} inputMode="decimal" placeholder="Lokal 40' (isteğe bağlı)" aria-label="40'lık lokal" className={`${GIRDI} w-40`} style={{ borderColor: CARD_BORDER }} />
          </>
        )}
        <input value={gerekce} onChange={(e) => setGerekce(e.target.value)} maxLength={300} placeholder="Dayanak (isteğe bağlı, ör. acente teyidi)" aria-label="Dayanak" className={`${GIRDI} w-64`} style={{ borderColor: CARD_BORDER }} />
        <Dugme ana bekle={bekle} onClick={ogret} testId="kontrol-ogret">Kural olarak öğret</Dugme>
        <Dugme bekle={bekle} onClick={() => calistir(() => kontrolIsle(k.hedefTur, k.hedefId, "yoksay", { acente_ad: k.acente }))} testId="kontrol-yoksay">Yoksay</Dugme>
        {hata && <span className="text-xs" style={{ color: "#FCA5A5" }}>{hata}</span>}
      </div>
    </>
  );
}

/** Tutmayan gerceklesen navlun: Olduğu Gibi Onayla (gerekce zorunlu) + Yoksay */
function OnayIslemi({ k, onBitti }: { k: KontrolKalemi; onBitti: Sonuc }) {
  const [gerekce, setGerekce] = useState("");
  const { bekle, hata, setHata, calistir } = useIslem(onBitti);
  const g = k.gerceklesen;
  return (
    <>
      {g && (
        <p className="mt-1 text-xs" style={{ color: "#C9D1DC" }}>
          Gerçekleşen <b className="text-white">{tutarYaz(g.gercek, g.para)}</b> · son teklif {g.teklif_tutar == null ? "—" : tutarYaz(g.teklif_tutar, g.teklif_para || "USD")}
          {g.teklif_tarih ? ` (${gunYaz(g.teklif_tarih)})` : ""}{g.fark != null ? ` · fark ${tutarYaz(g.fark)}` : ""} · kalkış {gunYaz(g.etd)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={gerekce} onChange={(e) => setGerekce(e.target.value)} maxLength={300} placeholder="Gerekçe (zorunlu, ör. pazarlıkla düştü)" aria-label="Gerekçe" className={`${GIRDI} w-72`} style={{ borderColor: CARD_BORDER }} />
        <Dugme ana bekle={bekle} testId="kontrol-onayla" onClick={() => { if (gerekce.trim().length < 5) { setHata("Onay için gerekçe yazın."); return; } calistir(() => kontrolIsle("gerceklesen", k.hedefId, "onayla", {}, gerekce)); }}>Olduğu Gibi Onayla</Dugme>
        <Dugme bekle={bekle} onClick={() => calistir(() => kontrolIsle("gerceklesen", k.hedefId, "yoksay", {}, gerekce))} testId="kontrol-yoksay">Yoksay</Dugme>
        {hata && <span className="text-xs" style={{ color: "#FCA5A5" }}>{hata}</span>}
      </div>
    </>
  );
}

const TUR_RENGI: Record<KontrolTuru, "sari" | "mavi" | "kirmizi" | "mor"> = { okunamayan: "sari", aday: "mavi", celiski: "kirmizi", lokal_belirsiz: "mor", tutmayan: "kirmizi" };

function KontrolSatiri({ k, onBitti }: { k: KontrolKalemi; onBitti: Sonuc }) {
  return (
    <div className="px-4 py-3 border-t first:border-t-0" style={{ borderColor: CARD_BORDER }} data-testid="kontrol-kalemi" data-tur={k.tur}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Rozet metin={KONTROL_ADI[k.tur]} renk={TUR_RENGI[k.tur]} />
        <span className="text-white font-medium">{k.liman || "Liman ?"}</span>
        <span style={{ color: "#C9D1DC" }}>{k.acente || "—"}</span>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{zamanYaz(k.tarih)}</span>
        <span className={`ml-auto inline-flex items-center gap-1 text-xs ${k.gecikti ? "font-semibold" : ""}`} style={{ color: k.gecikti ? "#FCA5A5" : TEXT_MUTED }}
          title={k.gecikti ? `${GECIKME_SAAT} saati geçti` : undefined} data-gecikti={k.gecikti || undefined}>
          <Clock size={12} /> {yasYaz(k.yasSaat)}
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: k.tur === "celiski" || k.tur === "tutmayan" ? "#FCA5A5" : "#FCD34D" }}>{k.aciklama}</p>
      {k.tur === "okunamayan" || k.tur === "aday" ? <MailIslemi k={k} onBitti={onBitti} />
        : k.tur === "tutmayan" ? <OnayIslemi k={k} onBitti={onBitti} />
        : <OgretIslemi k={k} onBitti={onBitti} />}
    </div>
  );
}

export function KontrolSekmesi({ kalemler, onDegisti }: { kalemler: KontrolKalemi[]; onDegisti: (yenidenHesap: boolean) => void }) {
  const [filtre, setFiltre] = useState<KontrolTuru | "hepsi">("hepsi");
  const sayilar = useMemo(() => {
    const s: Partial<Record<KontrolTuru, number>> = {};
    kalemler.forEach((k) => { s[k.tur] = (s[k.tur] || 0) + 1; });
    return s;
  }, [kalemler]);
  const gorunen = filtre === "hepsi" ? kalemler : kalemler.filter((k) => k.tur === filtre);
  const geciken = kalemler.filter((k) => k.gecikti).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["hepsi", "okunamayan", "aday", "celiski", "lokal_belirsiz", "tutmayan"] as const).map((t) => {
          const n = t === "hepsi" ? kalemler.length : sayilar[t] || 0;
          if (t !== "hepsi" && !n) return null;
          const secili = filtre === t;
          return (
            <button key={t} type="button" onClick={() => setFiltre(t)} className="h-8 px-3 rounded-lg border text-xs"
              style={{ borderColor: secili ? ACCENT : CARD_BORDER, color: secili ? "#FFFFFF" : TEXT_MUTED }}>
              {t === "hepsi" ? "Tümü" : KONTROL_ADI[t]} ({n})
            </button>
          );
        })}
        {geciken > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#FCA5A5" }} data-testid="kontrol-geciken">
            <AlertTriangle size={13} /> {geciken} kalem {GECIKME_SAAT} saati geçti
          </span>
        )}
      </div>
      <Kart testId="merkez-kontrol">
        {gorunen.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center gap-2 text-sm" style={{ color: TEXT_MUTED }}>
            {kalemler.length === 0 ? <><CheckCircle2 size={22} style={{ color: ACCENT }} /> Kontrol bekleyen bir şey yok.</> : <Bos metin="Bu türde kalem yok." />}
          </div>
        ) : gorunen.map((k) => <KontrolSatiri key={k.anahtar} k={k} onBitti={onDegisti} />)}
      </Kart>
    </div>
  );
}
