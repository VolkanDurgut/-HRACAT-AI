import React from "react";

/**
 * Girissiz, musteriye / lojistige acik sayfalarin ortak kurumsal cercevesi
 * (12.10.2026): acik zemin, lacivert ust bant + seftali serit, Unex logosu.
 * Uygulama ici koyu temadan bilerek farkli: fiyat formu PDF'i ile ayni dil.
 */
export const GENEL = {
  zemin: "#F4F3EF",
  lacivert: "#1B2352",
  lacivert2: "#283474",
  seftali: "#F4A07C",
  metin: "#1B2352",
  soluk: "#5B6380",
  cizgi: "#E3E1DA",
  kart: "#FFFFFF",
  yesil: "#1F7A52",
  turuncu: "#B5552B",
};

export function GenelSayfaCerceve({ ust, children }: { ust: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: GENEL.zemin, color: GENEL.metin }}>
      <header style={{ backgroundColor: GENEL.lacivert, borderBottom: `4px solid ${GENEL.seftali}` }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <span className="rounded-xl bg-white p-1.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Unex Gıda" width={40} height={40} className="w-10 h-10 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.25em]" style={{ color: GENEL.seftali }}>UNEX GIDA</p>
            <p className="text-lg font-semibold text-white leading-tight truncate">{ust}</p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <footer className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 text-xs leading-relaxed" style={{ color: GENEL.soluk }}>
        <p className="font-semibold" style={{ color: GENEL.metin }}>Unex Gıda San. ve Tic. Ltd. Şti.</p>
        <p>İstiklal Mah. Cemal Ünlü Saraç Cad. No:20, Süleymanpaşa / Tekirdağ · www.unex.com.tr</p>
        <p>Satış: Burak Tuncay · 0541 339 60 04</p>
      </footer>
    </div>
  );
}

export function GenelKart({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${className}`} style={{ backgroundColor: GENEL.kart, borderColor: GENEL.cizgi }}>
      {children}
    </section>
  );
}
