import React from "react";

/**
 * Satin alma girissiz sayfalarinin (talep formu /talep/[token], onayli satin alma
 * fisi /cek/[token]) ortak KURUMSAL BELGE dili (27.10.2026).
 * Kullanici: "Daha profesyonel b2b olmalı." -> ERP formu gorunumu: ince cizgiler,
 * 4px koseler, tablo duzeni, kucuk ve duzenli tipografi; buyuk yuvarlak kart /
 * hap dugme YOK. Diger girissiz sayfalar (takip, cikis) GenelSayfaCerceve'yi
 * kullanmaya devam eder; bu dosya SADECE satin alma sayfalarina aittir.
 */
export const B = {
  zemin: "#EEF0F3",
  kagit: "#FFFFFF",
  cizgi: "#D5D9E0",
  cizgiAcik: "#E6E8EC",
  baslikZemin: "#F5F6F8",
  metin: "#161B2E",
  soluk: "#5B6275",
  lacivert: "#1B2352",
  lacivert2: "#283474",
  seftali: "#F4A07C",
  kirmizi: "#B42318",
  kirmiziZemin: "#FDF0EF",
  yesil: "#17704A",
  yesilZemin: "#EDF7F1",
  turuncu: "#A85216",
  turuncuZemin: "#FDF4EC",
  testZemin: "#FFF8E6",
  testCizgi: "#EBCB80",
  testMetin: "#7A5200",
};

export const girdiSinifi = "w-full h-9 px-2.5 rounded-[3px] border text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#283474]/25 focus:border-[#283474]";
export const girdiStil = { borderColor: "#C5CBD5", color: B.metin } as React.CSSProperties;
export const dugmeAna = "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[3px] text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110";
export const dugmeIkincil = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[3px] border text-sm font-medium bg-white hover:bg-[#F5F6F8] disabled:opacity-50";

/** Ince ust bant: logo + sirket + modul adi. Yazdirmada gizli. */
export function BelgeUstBandi({ modul }: { modul: string }) {
  return (
    <header className="print:hidden" style={{ backgroundColor: B.lacivert, borderBottom: `3px solid ${B.seftali}` }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
        <span className="bg-white rounded-[3px] p-0.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="Unex Gıda" width={28} height={28} className="w-7 h-7 object-contain" />
        </span>
        <p className="text-sm text-white font-semibold tracking-wide truncate">UNEX GIDA <span className="font-normal opacity-60 mx-1.5">|</span> <span className="font-normal">{modul}</span></p>
        <span className="ml-auto text-[11px] uppercase tracking-[0.18em] hidden sm:block" style={{ color: "#AEB4CC" }}>Şirket içi</span>
      </div>
    </header>
  );
}

export function BelgeSayfasi({ modul, children }: { modul: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full satin-alma-belge" style={{ backgroundColor: B.zemin, color: B.metin }}>
      <BelgeUstBandi modul={modul} />
      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 print:p-0 print:max-w-none">{children}</main>
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 text-[11px] leading-relaxed print:hidden" style={{ color: B.soluk }}>
        Unex Gıda San. ve Tic. Ltd. Şti. · İstiklal Mah. Cemal Ünlü Saraç Cad. No:20, Süleymanpaşa / Tekirdağ · www.unex.com.tr
      </footer>
    </div>
  );
}

/** Beyaz, ince cizgili panel. baslik verilirse ust seritte gosterilir. */
export function Panel({ baslik, sag, children, className = "", govdeSinifi = "p-4 sm:p-5" }: {
  baslik?: React.ReactNode; sag?: React.ReactNode; children: React.ReactNode; className?: string; govdeSinifi?: string;
}) {
  return (
    <section className={`border rounded-[4px] ${className}`} style={{ backgroundColor: B.kagit, borderColor: B.cizgi }}>
      {baslik !== undefined && (
        <div className="px-4 sm:px-5 h-11 flex items-center justify-between gap-3 border-b" style={{ borderColor: B.cizgi, backgroundColor: B.baslikZemin }}>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] truncate" style={{ color: B.lacivert }}>{baslik}</h2>
          {sag}
        </div>
      )}
      <div className={govdeSinifi}>{children}</div>
    </section>
  );
}

/** Etiket + deger (belge ust bilgisi). */
export function BilgiAlani({ etiket, children, className = "" }: { etiket: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: B.soluk }}>{etiket}</p>
      <div className="text-sm font-semibold mt-0.5 break-words">{children}</div>
    </div>
  );
}

/** Kucuk durum etiketi: nokta + metin (hap / renkli zemin yok). */
export function DurumEtiketi({ renk, children }: { renk: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: renk }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: renk }} />
      {children}
    </span>
  );
}

export function AcilEtiketi() {
  return <span className="inline-block text-[10px] font-bold tracking-wide px-1 py-px rounded-[2px] border align-middle" style={{ color: B.kirmizi, borderColor: "#E9B4AE", backgroundColor: B.kirmiziZemin }}>ACİL</span>;
}

export function TestSeridi({ children }: { children: React.ReactNode }) {
  return (
    <div className="border rounded-[4px] px-4 py-2.5 text-[13px] font-medium" role="note"
      style={{ backgroundColor: B.testZemin, borderColor: B.testCizgi, color: B.testMetin }}>
      <b className="tracking-wide mr-1.5">TEST MODU</b>{children}
    </div>
  );
}

export const thSinifi = "px-3 h-9 text-[10.5px] font-bold uppercase tracking-[0.07em] text-left whitespace-nowrap";
export const tdSinifi = "px-3 py-2.5 text-[13px] align-top";
