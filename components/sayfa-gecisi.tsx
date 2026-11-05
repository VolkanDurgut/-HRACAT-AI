"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * SAYFA GECISI (06.11.2026). Kullanici: "Kullanim kilavuzundaki logolu gecis butun sayfa gecislerinde
 * kullanilmali; Ana Panel detay butonlari da o sekilde gecmeli. Sekmeler arasi gecis oldugu gibi
 * kalabilir. Gecise uygun yazi animasyonu; chat animasyonunu bozmayalim; profesyonel olmali."
 *
 * - Kok layout'ta bir kez durur (sayfalar degisse de yasar). Iki faz, kilavuzdaki portalin sade hali:
 *   "cikis"  : sayfa kararir, halka toplanir, Unex logosu belirir, alta gidilen sayfanin adi
 *              harf harf yazilir (imlecli).
 *   "giris"  : yeni sayfa hazir olunca logo buyuyup kaybolur, halka acilir, perde kalkar.
 * - Tetik: (1) sayfa ici <a href> tiklamasi (Next Link dahil; yakalama asamasinda yalniz gozlenir,
 *   tiklama ENGELLENMEZ), (2) programatik gecis icin useGecisliYonlendirme(). YALNIZ yol (pathname)
 *   degisince: ayni sayfadaki sekme / sorgu degisimi (dosya sekmeleri ?tab=) gecis YAPMAZ.
 * - Geri / ileri tusu, yeni sekme, ctrl/cmd tiklama, indirme, dis baglanti: gecis yok.
 * - "Hareketi azalt" acikken yalniz kisa bir solma.
 * - Siniflar "sg-" onekli; mevcut yazi / sohbet animasyonlarina (yazi-imlec, yazi-nokta, evrak-ai-*)
 *   DOKUNULMAZ. Perde tiklamayi engellemez (pointer-events: none) ve en fazla ~2,6 sn kalir.
 */

export const SAYFA_GECISI_OLAYI = "ihracatai:sayfa-gecisi";

const CIKIS_MS = 420;   // perde + logo gelis (en az bu kadar beklenir)
const GIRIS_MS = 560;   // logo gecis + perde kalkis
const EMNIYET_MS = 2600; // yol hic degismezse perde kendiliginden kalkar

/** Gidilecek yolun okunur adi (yazi animasyonu). Uzun eslesme once. */
const SAYFA_ADLARI: [string, string][] = [
  ["/ic-piyasa/alis", "İç Piyasa Alış"],
  ["/ic-piyasa/rapor", "İç Piyasa Raporu"],
  ["/ic-piyasa/bildirimler", "İç Piyasa Bildirimleri"],
  ["/ic-piyasa/musteriler", "İç Piyasa Müşterileri"],
  ["/ic-piyasa", "İç Piyasa"],
  ["/ayarlar/yetkilendirme", "Yetkilendirme"],
  ["/ayarlar", "Ayarlar"],
  ["/analiz", "Kontrol Merkezi"],
  ["/panel", "Ana Panel"],
  ["/proformalar", "Proforma Oluştur"],
  ["/yeni-dosya", "Proforma Yükle"],
  ["/ihracatlar", "İhracatlar"],
  ["/draft-onay", "İhracat Evrakları"],
  ["/diib", "DİİB Takibi"],
  ["/etd-eta", "ETD / ETA"],
  ["/kantar", "Kantar Paneli"],
  ["/satin-alma", "Satın Alma"],
  ["/kilavuz", "Kullanım Kılavuzu"],
  ["/dosya/", "Dosya Detayı"],
  ["/belge/irsaliye", "İrsaliye"],
];
export function sayfaAdi(yol: string): string {
  return SAYFA_ADLARI.find(([p]) => yol === p || yol.startsWith(p.endsWith("/") ? p : `${p}/`) || yol.startsWith(p + "?"))?.[1] ?? "İhracat AI";
}

const yolKismi = (href: string) => href.split("#")[0].split("?")[0];

/** Programatik gecis oncesi cagrilir (router.push'tan once). Ayni yolsa bir sey yapmaz. */
export function sayfaGecisiBaslat(hedef: string) {
  if (typeof window === "undefined") return;
  if (yolKismi(hedef) === window.location.pathname) return;
  window.dispatchEvent(new CustomEvent(SAYFA_GECISI_OLAYI, { detail: hedef }));
}

/** router.push yerine: logolu gecisle yonlendirir. */
export function useGecisliYonlendirme() {
  const router = useRouter();
  return useCallback((hedef: string) => { sayfaGecisiBaslat(hedef); router.push(hedef); }, [router]);
}

type Faz = "cikis" | "giris" | null;

export default function SayfaGecisi() {
  const pathname = usePathname() || "";
  const [faz, setFaz] = useState<Faz>(null);
  const [ad, setAd] = useState("");
  const [yazilan, setYazilan] = useState(0);
  const [azalt, setAzalt] = useState(false);
  const bas = useRef<{ zaman: number; yol: string } | null>(null);
  const zamanlayicilar = useRef<ReturnType<typeof setTimeout>[]>([]);
  const yazici = useRef<ReturnType<typeof setInterval> | null>(null);

  const temizle = () => {
    zamanlayicilar.current.forEach(clearTimeout); zamanlayicilar.current = [];
    if (yazici.current) { clearInterval(yazici.current); yazici.current = null; }
  };
  const bitir = useCallback(() => { temizle(); bas.current = null; setFaz(null); }, []);

  useEffect(() => {
    try { setAzalt(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* yok */ }
  }, []);

  const baslat = useCallback((hedef: string) => {
    temizle();
    const isim = sayfaAdi(yolKismi(hedef));
    bas.current = { zaman: Date.now(), yol: window.location.pathname };
    setAd(isim); setYazilan(0); setFaz("cikis");
    // Yazi: ~24 ms / harf, en fazla CIKIS suresi icinde biter
    const adim = Math.max(14, Math.min(28, Math.floor(CIKIS_MS / Math.max(1, isim.length))));
    let i = 0;
    yazici.current = setInterval(() => {
      i += 1; setYazilan(i);
      if (i >= isim.length && yazici.current) { clearInterval(yazici.current); yazici.current = null; }
    }, adim);
    zamanlayicilar.current.push(setTimeout(bitir, EMNIYET_MS));
  }, [bitir]);

  // (1) Sayfa ici baglanti tiklamalari (yakalama asamasi; yalniz gozlenir)
  useEffect(() => {
    const tik = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target && a.target !== "_self" || a.hasAttribute("download") || a.dataset.gecisYok !== undefined) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      baslat(url.pathname + url.search);
    };
    const ozel = (e: Event) => { const h = (e as CustomEvent<string>).detail; if (typeof h === "string") baslat(h); };
    document.addEventListener("click", tik, true);
    window.addEventListener(SAYFA_GECISI_OLAYI, ozel);
    return () => { document.removeEventListener("click", tik, true); window.removeEventListener(SAYFA_GECISI_OLAYI, ozel); };
  }, [baslat]);

  // (2) Yol degisti: cikis en az CIKIS_MS surdukten sonra giris fazi
  useEffect(() => {
    const b = bas.current;
    if (!b || pathname === b.yol) return;
    const kalan = Math.max(0, CIKIS_MS - (Date.now() - b.zaman));
    zamanlayicilar.current.push(setTimeout(() => {
      if (yazici.current) { clearInterval(yazici.current); yazici.current = null; }
      setYazilan(Number.MAX_SAFE_INTEGER);
      setFaz("giris");
      zamanlayicilar.current.push(setTimeout(bitir, GIRIS_MS));
    }, kalan));
  }, [pathname, bitir]);

  useEffect(() => () => temizle(), []);

  if (!faz) return null;
  const gorunen = ad.slice(0, yazilan);
  return (
    <div className={`sg-perde ${faz === "cikis" ? "sg-perde-gel" : "sg-perde-git"} ${azalt ? "sg-azalt" : ""}`} aria-hidden data-testid="sayfa-gecisi" data-faz={faz}>
      <div className="sg-merkez">
        <span className={`sg-halka ${faz === "cikis" ? "sg-halka-topla" : "sg-halka-ac"}`} />
        {faz === "giris" && <span className="sg-halka sg-halka-ac sg-halka-2" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="" className={`sg-logo ${faz === "cikis" ? "sg-logo-gel" : "sg-logo-gec"}`} />
      </div>
      <div className={`sg-yazi ${faz === "giris" ? "sg-yazi-git" : ""}`}>
        <p className="sg-ust">İhracat AI</p>
        <p className="sg-ad" data-testid="sayfa-gecisi-ad">{gorunen}{faz === "cikis" && <span className="sg-imlec" />}</p>
      </div>
      <style>{`
.sg-perde { position: fixed; inset: 0; z-index: 95; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(60% 50% at 50% 45%, rgba(16,185,129,.10), transparent 70%), rgba(10,14,20,.94); backdrop-filter: blur(3px); }
.sg-perde-gel { animation: sg-perde-gel 200ms ease-out both; }
.sg-perde-git { animation: sg-perde-git ${GIRIS_MS}ms cubic-bezier(.4,0,.2,1) both; }
@keyframes sg-perde-gel { from { opacity: 0; } to { opacity: 1; } }
@keyframes sg-perde-git { 0%, 35% { opacity: 1; } to { opacity: 0; } }
.sg-merkez { position: relative; width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; }
.sg-logo { position: absolute; width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 0 28px rgba(16,185,129,.45)); }
.sg-logo-gel { animation: sg-logo-gel ${CIKIS_MS}ms cubic-bezier(.25,.75,.3,1) both; }
.sg-logo-gec { animation: sg-logo-gec ${GIRIS_MS}ms cubic-bezier(.6,0,.9,.45) both; }
@keyframes sg-logo-gel { from { transform: scale(.2) rotate(-24deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes sg-logo-gec { from { transform: scale(1); opacity: 1; } 30% { opacity: 1; } to { transform: scale(9); opacity: 0; } }
.sg-halka { position: absolute; width: 124px; height: 124px; border-radius: 9999px; border: 1.5px solid rgba(16,185,129,.85);
  box-shadow: 0 0 30px rgba(16,185,129,.45), inset 0 0 22px rgba(16,185,129,.25); }
.sg-halka-topla { animation: sg-halka-topla ${CIKIS_MS}ms ease-out both; }
.sg-halka-ac { animation: sg-halka-ac ${GIRIS_MS}ms cubic-bezier(.2,.7,.3,1) both; }
.sg-halka-2 { animation-delay: 90ms; border-color: rgba(56,189,248,.8); box-shadow: 0 0 30px rgba(56,189,248,.4); }
@keyframes sg-halka-topla { from { transform: scale(2.6); opacity: 0; } to { transform: scale(1); opacity: .9; } }
@keyframes sg-halka-ac { from { transform: scale(1); opacity: .9; } to { transform: scale(11); opacity: 0; } }
.sg-yazi { margin-top: 18px; text-align: center; min-height: 46px; }
.sg-yazi-git { animation: sg-yazi-git 260ms ease-in both; }
@keyframes sg-yazi-git { to { opacity: 0; transform: translateY(-6px); } }
.sg-ust { font-size: 10px; letter-spacing: .32em; text-transform: uppercase; color: #6EE7B7; font-weight: 700; margin: 0; }
.sg-ad { margin: 6px 0 0; font-size: 18px; font-weight: 600; color: #fff; letter-spacing: .01em; white-space: nowrap; }
.sg-imlec { display: inline-block; width: 2px; height: 1em; margin-left: 3px; vertical-align: -0.12em; background: #6EE7B7; animation: sg-imlec .7s steps(1) infinite; }
@keyframes sg-imlec { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.sg-azalt, .sg-azalt * { animation-duration: 1ms !important; animation-delay: 0ms !important; }
.sg-azalt.sg-perde-git { animation: sg-perde-git 240ms linear both !important; }
`}</style>
    </div>
  );
}
