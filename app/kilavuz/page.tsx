"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { KilavuzSunum } from "@/components/kilavuz/sunum";
import { KILAVUZ_KONULARI } from "@/lib/kilavuz/konular";
import { EKRAN_NOKTALARI } from "@/lib/kilavuz/ekran-noktalari";
import { PAGE_BG } from "@/lib/theme";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";

/**
 * UNEX GIDA · IHRACAT AI KULLANIM KILAVUZU (28.10.2026).
 * Kullanici: "kamera hareketi ile farkli bir evrene gecer gibi; ayni gecisler tum sayfalarin
 * arasinda; evrenden evrene, logo temali; konulu olmali."
 * Sunum bileseni: components/kilavuz/sunum.tsx (10.11.2026'da ayrildi; PAZAR Satis Rehberi de kullanir).
 * Oturum gerekir; sayfa yetkisi gerekmez (AppShell kullanmaz, Kantar Paneli gibi kendi kapisi).
 * Ekran goruntuleri KURGUSAL veriyle cekildi (public/kilavuz).
 */
export default function KilavuzSayfasi() {
  const { user, loading, yetkiler } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  const cikisHedefi = useMemo(() => ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri) || "/panel", [yetkiler]);

  if (loading || !user) {
    return (
      <SayfaYukleniyor className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }} />
    );
  }

  return (
    <KilavuzSunum
      konular={KILAVUZ_KONULARI}
      noktalar={EKRAN_NOKTALARI}
      baslik="Kullanım Kılavuzu"
      konumAnahtari="kilavuz-konum"
      cikis={{ href: cikisHedefi, etiket: "Uygulamaya Dön" }}
      yetkiliMi={(k) => !k.yetki || !!yetkiler.sayfa_yetkileri[k.yetki]}
      kapak={{
        aciklama: <>Bir ihracatın proformadan denize yolculuğu. {KILAVUZ_KONULARI.length} evren, her biri uygulamanın bir bölümü.
          Kamera sizi ekranların içine götürür; her adımda neye bakacağınızı gösterir.</>,
        alt: "Yaklaşık 5 dakika · ← → tuşlarıyla ya da kaydırarak ilerleyin",
      }}
      son={{
        baslik: "Artık bütün evrenleri tanıyorsunuz",
        metin: <>Takıldığınız bir yer olursa sağ alttaki <span className="text-white font-medium">Sorun Bildir</span>&apos;e yazın.
          Kılavuza istediğiniz an sol menünün altındaki <span className="text-white font-medium">Kullanım Kılavuzu</span>&apos;ndan dönebilirsiniz.</>,
      }}
    />
  );
}
