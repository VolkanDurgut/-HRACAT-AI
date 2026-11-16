"use client";
/**
 * ERP ortak kit: adresle esli sekme (16.11.2026). Kontrol Merkezi / Pazar / Siparis Listesi / Kantar'da ayni kod vardi:
 * ilk acilista ?<param>= okunur (gecersizse varsayilan), degisince adres guncellenir (varsayilan adreste yazilmaz,
 * gecmis kirletilmez). oku: parametreyi gecerli sekmeye ceviren saf fonksiyon (bilinmeyen -> null).
 */
import { useCallback, useEffect, useState } from "react";
import { adresiGuncelle, adresParametresi } from "@/lib/url-durumu";

export function useUrlSekmesi<T extends string>(oku: (v: string | null) => T | null, varsayilan: T, param = "sekme"): [T, (v: T) => void] {
  const [sekme, setSekmeDurumu] = useState<T>(varsayilan);
  // Ilk acilista bir kez (oku / param sabit fonksiyon ve deger olarak verilir)
  useEffect(() => {
    const v = oku(adresParametresi(param));
    if (v) setSekmeDurumu(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setSekme = useCallback((v: T) => {
    setSekmeDurumu(v);
    adresiGuncelle({ [param]: v === varsayilan ? null : v });
  }, [param, varsayilan]);
  return [sekme, setSekme];
}
