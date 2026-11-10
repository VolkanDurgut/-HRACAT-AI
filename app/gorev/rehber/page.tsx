"use client";

import React from "react";
import { KilavuzSunum } from "@/components/kilavuz/sunum";
import { REHBER_KONULARI } from "@/lib/pazar/rehber";
import { REHBER_NOKTALARI } from "@/lib/pazar/rehber-noktalari";

/**
 * PAZAR Satis Rehberi (10.11.2026) - GIRISSIZ (satis ekibinin uygulama hesabi gerekmez; bilgilendirme mailindeki
 * "Rehberi izle" baglantisi buraya gelir). Kullanim Kilavuzu ile ayni animasyonlu evren sunumu
 * (components/kilavuz/sunum.tsx). Statik "rehber" yolu dinamik /gorev/[token]'dan once eslesir.
 */
export default function SatisRehberi() {
  return (
    <KilavuzSunum
      konular={REHBER_KONULARI}
      noktalar={REHBER_NOKTALARI}
      baslik="Satış Rehberi"
      konumAnahtari="pazar-rehber-konum"
      sayfaBaglantisi={false}
      kapak={{
        aciklama: <>Her sabah gelen &ldquo;Bugünkü müşteriniz&rdquo; mailinden müşteriye giden mesaja kadar.
          {" "}{REHBER_KONULARI.length} evren, her biri günün bir adımı. Kamera sizi ekranların içine götürür; neye basacağınızı gösterir.</>,
        alt: "Yaklaşık 3 dakika · ← → tuşlarıyla ya da kaydırarak ilerleyin",
        dugme: "Rehberi Başlat",
      }}
      son={{
        baslik: "Hazırsınız",
        metin: <>Hafta içi her sabah 09:00&apos;da gelen mailde <span className="text-white font-medium">Başla</span>&apos;ya basmanız yeterli.
          Takıldığınız bir yer olursa execution@unex.com.tr adresine yazın. Bu rehbere maildeki bağlantıdan istediğiniz an dönebilirsiniz.</>,
      }}
    />
  );
}
