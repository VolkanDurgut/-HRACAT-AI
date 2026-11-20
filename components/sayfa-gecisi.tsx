"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SAYFA_GECISI_BITTI, SG_FAZ_OZNITELIGI, sayfaBekleyenSayisi } from "@/lib/sayfa-gecisi-olay";

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
 *   DOKUNULMAZ. Perde tiklamayi engellemez (pointer-events: none) ve en fazla ~3,5 sn kalir
 *   (yeni sayfanin verisi en fazla 2,5 sn beklenir; asagida 3. revize).
 *
 * 06.11.2026 (2. revize). Kullanici: "Gecis ile yazilarin cikisi orantili olsun, sik olsun; gecisten
 * sonra yazilar asagiya kayarak modern bir sekilde gelsin."
 * - Sayfa adi artik zamanlayiciyla degil CSS ile harf harf belirir ve TOPLAM suresi adin uzunlugundan
 *   bagimsiz olarak cikis fazina oranlidir (ilk harf 120 ms, son harf CIKIS_MS'den once biter); altindaki
 *   ince cizgi ayni surede dolar. Eskiden kisa sayfa gecisinde ad yarim kaliyordu ("Dosya Deta").
 * - Giris fazinda harfler sirayla yukari suzulup kaybolur (ani kesilme yok).
 * - Perde kalkarken sayfadaki ekrandaki yazilar (baslik, paragraf, etiket, tablo satiri, liste) ustten
 *   asagiya kayarak sirayla gelir (globals.css .sg-metin-gir). Zaten animasyonu olan ogeler,
 *   [data-sg-haric] alani ve "hareketi azalt" HARIC. Sayfa basligi alt yazisinin harf animasyonu perde
 *   arkasinda degil, perde kalkinca baslar (SAYFA_GECISI_BITTI olayi).
 */

export const SAYFA_GECISI_OLAYI = "ihracatai:sayfa-gecisi";

const CIKIS_MS = 540;   // perde + logo gelis + sayfa adi (en az bu kadar beklenir)
const GIRIS_MS = 560;   // logo gecis + perde kalkis
const BEKLEME_UST_MS = 2500; // yeni sayfanin ilk verisi icin perdenin en uzun bekleyisi (tiklamadan itibaren)
const BEKLEME_ARALIK_MS = 50;
const EMNIYET_MS = BEKLEME_UST_MS + GIRIS_MS + 400; // yol hic degismezse / takilirsa perde kendiliginden kalkar
const AD_BASLA_MS = 120; // sayfa adinin ilk harfi
const AD_YAYILMA_MS = 250; // ilk harften son harfin baslamasina (ad uzunlugundan bagimsiz)
const HARF_MS = 170;    // tek harfin belirme suresi -> son harf 120 + 250 + 170 = 540 ms'de tamam
const METIN_GIR_MS = 520; // sayfadaki yazilarin asagi kayarak gelme suresi (globals.css ile ayni)
const METIN_ARALIK_MS = 26; // yazilar arasi sira gecikmesi
const METIN_EN_GEC_MS = 460; // en son yazinin gecikmesi (uzun sayfada bekletmez)
const METIN_ADAY = "h1, h2, h3, h4, p, label, li, dt, dd, tr, figcaption, blockquote";

/** Gidilecek yolun okunur adi (yazi animasyonu). Uzun eslesme once. */
const SAYFA_ADLARI: [string, string][] = [
  ["/ic-piyasa/alis", "İç Piyasa Alış"],
  ["/ic-piyasa/rapor", "İç Piyasa Raporu"],
  ["/ic-piyasa/bildirimler", "İç Piyasa Bildirimleri"],
  ["/ic-piyasa/musteriler", "İç Piyasa Müşterileri"],
  ["/ic-piyasa", "İç Piyasa"],
  ["/ayarlar/yetkilendirme", "Yetkilendirme"],
  ["/ayarlar/yedekler", "Veri Yedekleri"],
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
  ["/belge/konsimento", "Konşimento Talimatı"],
];
export function sayfaAdi(yol: string): string {
  return SAYFA_ADLARI.find(([p]) => yol === p || yol.startsWith(p.endsWith("/") ? p : `${p}/`) || yol.startsWith(p + "?"))?.[1] ?? "UNEX-AI";
}

const yolKismi = (href: string) => href.split("#")[0].split("?")[0];

/**
 * Programatik gecis oncesi cagrilir (router.push'tan once). Ayni yolsa bir sey yapmaz.
 * ad: perdede yazilacak ad (varsayilan hedefin adi; giriste hedef yetkiye gore degisebildigi icin
 * "Hoş geldiniz" gibi genel bir ad verilir).
 */
export function sayfaGecisiBaslat(hedef: string, ad?: string) {
  if (typeof window === "undefined") return;
  if (yolKismi(hedef) === window.location.pathname) return;
  window.dispatchEvent(new CustomEvent(SAYFA_GECISI_OLAYI, { detail: ad ? { hedef, ad } : hedef }));
}

/** router.push yerine: logolu gecisle yonlendirir. */
export function useGecisliYonlendirme() {
  const router = useRouter();
  return useCallback((hedef: string) => { sayfaGecisiBaslat(hedef); router.push(hedef); }, [router]);
}

type Faz = "cikis" | "giris" | null;

/**
 * Perde kalkarken ekrandaki yazilari sirayla "asagi kayarak" getirir. Yalniz gorunen ogeler, en fazla
 * 70; ic ice secilmez (bir yazi ogesinin icindeki yazi ayrica oynamaz). Zaten bir animasyonu olan oge
 * (sohbet / yazi animasyonu / kendi gecisi) ve [data-sg-haric] alani atlanir. Sinif, animasyon bitince
 * kaldirilir (kalici transform / opacity birakmaz).
 */
const islenen = new WeakSet<Element>();
function metinleriGetir(tabanGecikme: number) {
  const main = document.querySelector("main");
  if (!main) return;
  const yukseklik = window.innerHeight;
  const secilen: HTMLElement[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>(METIN_ADAY))) {
    if (secilen.length >= 70) break;
    if (islenen.has(el) || el.closest("[data-sg-haric]") || el.parentElement?.closest(".sg-metin-gir")) continue;
    if (secilen.some((s) => s.contains(el))) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > yukseklik) continue;
    const st = getComputedStyle(el);
    if (st.animationName && st.animationName !== "none") continue;
    if (st.position === "fixed" || st.position === "sticky") continue;
    secilen.push(el);
  }
  secilen.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  secilen.forEach((el, i) => {
    islenen.add(el);
    const g = tabanGecikme + Math.min(i * METIN_ARALIK_MS, METIN_EN_GEC_MS);
    el.style.setProperty("--sg-g", `${g}ms`);
    el.classList.add("sg-metin-gir");
    // Bilerek bilesenin zamanlayicilarindan ayri: perde kalksa da (bilesen null dondurse de) temizlenir
    setTimeout(() => { el.classList.remove("sg-metin-gir"); el.style.removeProperty("--sg-g"); }, g + METIN_GIR_MS + 60);
  });
}

function htmlFaz(f: Faz) {
  const d = document.documentElement.dataset;
  if (f) d[SG_FAZ_OZNITELIGI] = f; else delete d[SG_FAZ_OZNITELIGI];
}

export default function SayfaGecisi() {
  const pathname = usePathname() || "";
  const [faz, setFaz] = useState<Faz>(null);
  const [ad, setAd] = useState("");
  const [azalt, setAzalt] = useState(false);
  const [bekliyor, setBekliyor] = useState(false); // perde, yeni sayfanin verisini bekliyor
  const bas = useRef<{ zaman: number; yol: string } | null>(null);
  const zamanlayicilar = useRef<ReturnType<typeof setTimeout>[]>([]);

  const temizle = () => { zamanlayicilar.current.forEach(clearTimeout); zamanlayicilar.current = []; };
  const bitir = useCallback(() => {
    temizle(); bas.current = null; setFaz(null); setBekliyor(false); htmlFaz(null);
    window.dispatchEvent(new Event(SAYFA_GECISI_BITTI)); // bekleyen yazi animasyonu varsa baslasin
  }, []);

  useEffect(() => {
    try { setAzalt(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* yok */ }
  }, []);

  const baslat = useCallback((hedef: string, gorunenAd?: string) => {
    temizle();
    bas.current = { zaman: Date.now(), yol: window.location.pathname };
    setAd(gorunenAd || sayfaAdi(yolKismi(hedef))); setFaz("cikis"); htmlFaz("cikis");
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
    const ozel = (e: Event) => {
      const d = (e as CustomEvent<string | { hedef: string; ad: string }>).detail;
      if (typeof d === "string") baslat(d);
      else if (d && typeof d.hedef === "string") baslat(d.hedef, d.ad);
    };
    document.addEventListener("click", tik, true);
    window.addEventListener(SAYFA_GECISI_OLAYI, ozel);
    return () => { document.removeEventListener("click", tik, true); window.removeEventListener(SAYFA_GECISI_OLAYI, ozel); };
  }, [baslat]);

  // (2) Yol degisti: cikis (sayfa adi tamamlanana kadar) en az CIKIS_MS, sonra giris fazi
  useEffect(() => {
    const b = bas.current;
    if (!b || pathname === b.yol) return;
    const kalan = Math.max(0, CIKIS_MS - (Date.now() - b.zaman));
    // 3. revize (06.11.2026): yeni sayfa ilk verisini bekliyorsa (SayfaYukleniyor) perde, veri gelene
    // kadar kalir (en fazla BEKLEME_UST_MS). Perde kalkinca ayrica yukleniyor animasyonu gorunmez.
    const girise = () => {
      if (sayfaBekleyenSayisi() > 0 && Date.now() - b.zaman < BEKLEME_UST_MS) {
        setBekliyor(true);
        zamanlayicilar.current.push(setTimeout(girise, BEKLEME_ARALIK_MS));
        return;
      }
      setBekliyor(false); setFaz("giris"); htmlFaz("giris");
      // Perde ~200 ms opak kalir: yazilar o anda gorunmez yapilir, perde acilirken asagi kayarak gelir.
      if (!azalt) {
        metinleriGetir(150);
        // Veri biraz gec gelen sayfalar icin ikinci tur (yalniz henuz islenmemis ogeler)
        zamanlayicilar.current.push(setTimeout(() => metinleriGetir(60), 300));
      }
      zamanlayicilar.current.push(setTimeout(() => window.dispatchEvent(new Event(SAYFA_GECISI_BITTI)), azalt ? 0 : 200));
      zamanlayicilar.current.push(setTimeout(bitir, GIRIS_MS));
    };
    zamanlayicilar.current.push(setTimeout(girise, kalan));
  }, [pathname, bitir, azalt]);

  useEffect(() => () => { temizle(); htmlFaz(null); }, []);

  if (!faz) return null;
  const harfler = Array.from(ad);
  const adim = harfler.length > 1 ? AD_YAYILMA_MS / (harfler.length - 1) : 0;
  return (
    <div className={`sg-perde ${faz === "cikis" ? "sg-perde-gel" : "sg-perde-git"} ${azalt ? "sg-azalt" : ""}`} aria-hidden data-testid="sayfa-gecisi" data-faz={faz}>
      <div className="sg-merkez">
        <span className={`sg-halka ${faz === "cikis" ? "sg-halka-topla" : "sg-halka-ac"}`} />
        {faz === "giris" && <span className="sg-halka sg-halka-ac sg-halka-2" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="" className={`sg-logo ${faz === "cikis" ? "sg-logo-gel" : "sg-logo-gec"}`} />
      </div>
      <div className={`sg-yazi ${faz === "giris" ? "sg-yazi-git" : ""}`}>
        <p className="sg-ust">UNEX-AI</p>
        <p className="sg-ad" data-testid="sayfa-gecisi-ad" aria-label={ad}>
          {harfler.map((h, i) => (
            <span key={i} className="sg-harf" style={{
              animationDelay: faz === "cikis" ? `${Math.round(AD_BASLA_MS + i * adim)}ms` : `${Math.min(i * 14, 160)}ms`,
              whiteSpace: h === " " ? "pre" : undefined,
            }}>{h}</span>
          ))}
        </p>
        <span className={`sg-cizgi ${bekliyor && faz === "cikis" ? "sg-cizgi-bekle" : ""}`}><span /></span>
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
.sg-logo-gel { animation: sg-logo-gel ${CIKIS_MS - 120}ms cubic-bezier(.25,.75,.3,1) both; }
.sg-logo-gec { animation: sg-logo-gec ${GIRIS_MS}ms cubic-bezier(.6,0,.9,.45) both; }
@keyframes sg-logo-gel { from { transform: scale(.2) rotate(-24deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes sg-logo-gec { from { transform: scale(1); opacity: 1; } 30% { opacity: 1; } to { transform: scale(9); opacity: 0; } }
.sg-halka { position: absolute; width: 124px; height: 124px; border-radius: 9999px; border: 1.5px solid rgba(16,185,129,.85);
  box-shadow: 0 0 30px rgba(16,185,129,.45), inset 0 0 22px rgba(16,185,129,.25); }
.sg-halka-topla { animation: sg-halka-topla ${CIKIS_MS - 120}ms ease-out both; }
.sg-halka-ac { animation: sg-halka-ac ${GIRIS_MS}ms cubic-bezier(.2,.7,.3,1) both; }
.sg-halka-2 { animation-delay: 90ms; border-color: rgba(56,189,248,.8); box-shadow: 0 0 30px rgba(56,189,248,.4); }
@keyframes sg-halka-topla { from { transform: scale(2.6); opacity: 0; } to { transform: scale(1); opacity: .9; } }
@keyframes sg-halka-ac { from { transform: scale(1); opacity: .9; } to { transform: scale(11); opacity: 0; } }
.sg-yazi { margin-top: 18px; text-align: center; min-height: 52px; display: flex; flex-direction: column; align-items: center; }
.sg-ust { font-size: 10px; letter-spacing: .32em; text-transform: uppercase; color: #6EE7B7; font-weight: 700; margin: 0;
  animation: sg-ust-gel 260ms ease-out both; }
@keyframes sg-ust-gel { from { opacity: 0; letter-spacing: .6em; } to { opacity: 1; letter-spacing: .32em; } }
.sg-ad { margin: 6px 0 0; font-size: 18px; font-weight: 600; color: #fff; letter-spacing: .01em; white-space: nowrap; }
.sg-harf { display: inline-block; animation: sg-harf-gel ${HARF_MS}ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes sg-harf-gel { from { opacity: 0; transform: translateY(-9px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
.sg-yazi-git .sg-harf { animation: sg-harf-git 220ms cubic-bezier(.4,0,1,1) both; }
@keyframes sg-harf-git { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(10px); } }
.sg-yazi-git .sg-ust { animation: sg-solus 200ms ease-in both; }
.sg-cizgi { display: block; margin-top: 9px; width: 120px; height: 2px; border-radius: 2px; background: rgba(110,231,183,.14); overflow: hidden; }
.sg-cizgi > span { display: block; height: 100%; width: 100%; transform-origin: 0 50%; border-radius: 2px;
  background: linear-gradient(90deg, rgba(16,185,129,.2), #6EE7B7); animation: sg-cizgi ${CIKIS_MS}ms cubic-bezier(.4,0,.2,1) both; }
@keyframes sg-cizgi { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.sg-yazi-git .sg-cizgi { animation: sg-solus 200ms ease-in both; }
.sg-cizgi-bekle > span { animation: sg-tara 1100ms cubic-bezier(.4,0,.2,1) infinite; background: linear-gradient(90deg, transparent, #6EE7B7 50%, transparent); }
@keyframes sg-tara { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes sg-solus { to { opacity: 0; } }
.sg-azalt, .sg-azalt * { animation-duration: 1ms !important; animation-delay: 0ms !important; }
.sg-azalt .sg-cizgi-bekle > span { animation: none !important; }
.sg-azalt.sg-perde-git { animation: sg-perde-git 240ms linear both !important; }
`}</style>
    </div>
  );
}
