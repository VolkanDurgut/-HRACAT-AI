"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { sayfaBeklemeEkle, sayfaGecisiSuruyor } from "@/lib/sayfa-gecisi-olay";

/**
 * SAYFA YUKLENIYOR (06.11.2026). Kullanici: "Unex gecisinden sonra gelen loader animasyonu kaldirilsin."
 *
 * Sayfalarin ilk veri yuklemesindeki tam sayfa donen simge / iskelet yerine kullanilir:
 * - Yukleme surerken gecis perdesine "bekle" der (lib/sayfa-gecisi-olay.ts): perde, veri gelene kadar
 *   (en fazla ~2,5 sn) ekranda kalir ve sayfa DOLU acilir. Yukleniyor animasyonu hic gorunmez.
 * - Perde yoksa (sayfa yenileme, dogrudan adres) ya da veri 2,5 sn'yi de asarsa, animasyon ancak
 *   perde kalktiktan ve GECIKME_MS gectikten sonra, yumusakca belirir: hizli yuklemede hic gorunmez,
 *   yavas baglantida kullanici bos ekrana bakmaz.
 * - Butonlardaki kucuk islem simgelerine (Kaydet, Gonder...) DOKUNULMAZ; yalniz sayfa acilis yuklemesi.
 */
const GECIKME_MS = 450;

/** aktif iken perdeyi bekletir; yukleme animasyonunun gosterilip gosterilmeyecegini dondurur. */
export function useSayfaYukleniyor(aktif: boolean): boolean {
  const [goster, setGoster] = useState(false);
  useEffect(() => {
    if (!aktif) { setGoster(false); return; }
    const birak = sayfaBeklemeEkle();
    const bas = Date.now();
    let serbest = bas; // perdenin en son goruldugu an (perde hic yoksa acilis ani)
    const t = setInterval(() => {
      const simdi = Date.now();
      if (sayfaGecisiSuruyor()) { serbest = simdi; return; }
      // Perde yoksa acilistan, perde vardiysa perde kalktiktan GECIKME_MS sonra
      if (simdi - serbest >= GECIKME_MS) {
        setGoster(true);
        clearInterval(t);
      }
    }, 80);
    return () => { clearInterval(t); birak(); };
  }, [aktif]);
  return aktif && goster;
}

type Props = {
  /** Kapsayici sinifi (eski donen simgenin kapsayicisiyla ayni yerlesim). */
  className?: string;
  style?: React.CSSProperties;
  boyut?: number;
  renk?: string;
  /** Simgenin yaninda yazi (ornek "Yukleniyor..."). */
  yazi?: string;
};

/** Sayfa acilis yuklemesi: perde arkasinda bekler, gerekirse gecikmeli ve sade gorunur. */
export default function SayfaYukleniyor({ className = "flex items-center justify-center py-20", style, boyut = 28, renk = "#10B981", yazi }: Props) {
  const goster = useSayfaYukleniyor(true);
  return (
    <div className={className} style={style} data-testid="sayfa-yukleniyor" aria-busy="true">
      {goster && (
        <span className="sy-gel inline-flex items-center gap-2" style={{ color: "#94A3B8" }} role="status" aria-label="Yükleniyor">
          <Loader2 size={boyut} className="animate-spin" style={{ color: renk }} />
          {yazi && <span className="text-sm">{yazi}</span>}
          <style>{`.sy-gel { animation: sy-gel 320ms ease-out both; } @keyframes sy-gel { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sy-gel { animation: none; } }`}</style>
        </span>
      )}
    </div>
  );
}
