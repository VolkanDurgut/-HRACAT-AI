"use client";
/**
 * ANA PANEL > GUNLUK YUKLEME HEDEFI (23.11.2026). Hesap: lib/panel/gunluk-yukleme.ts (talimat cut-off'una kadar bos alim,
 * beyanname cut-off'undan bir onceki is gunune kadar yukleme; is gunleri ve kapasite gecmis tartim gunlerinden).
 *  - Bugun: yuklenen / hedef (DBA tartimi bugun olanlar otomatik sayilir) + alinmasi gereken bos.
 *  - Gereken gunluk hiz, gecmis kapasiteyle (ortalama / %75 / en yuksek) karsilastirilir: asarsa kart sari / kirmizi.
 *  - Onumuzdeki is gunleri: her gun yukle / bos al; gune tiklayinca hangi musteriden kac konteyner.
 * Hicbir kaydi degistirmez.
 */
import React, { useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, Container, Truck } from "lucide-react";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { gunEtiketi, type Kapasite, type YuklemePlani } from "@/lib/panel/gunluk-yukleme";

const RISK = {
  normal: { renk: "#6EE7B7", kenar: "rgba(16,185,129,0.35)", metin: "Kapasite içinde" },
  bilinmiyor: { renk: "#C9D1DC", kenar: CARD_BORDER, metin: "Geçmiş veri az" },
  yuksek: { renk: "#FCD34D", kenar: "rgba(245,158,11,0.5)", metin: "Ortalamanın üstünde" },
  asiyor: { renk: "#FCA5A5", kenar: "rgba(248,113,113,0.55)", metin: "En yüksek günü aşıyor" },
} as const;

const sayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function GunlukYuklemeKarti({ plan, kapasite, etiket }: { plan: YuklemePlani; kapasite: Kapasite | null; etiket: (anahtar: string) => string }) {
  const [acikGun, setAcikGun] = useState<string | null>(null);
  if (plan.gunler.length === 0 && plan.bugunYuklenen === 0) return null;
  const r = RISK[plan.risk];
  const oran = plan.bugunHedef > 0 ? Math.min(100, Math.round((plan.bugunYuklenen / plan.bugunHedef) * 100)) : 0;
  const gunler = plan.gunler.slice(0, 6);
  const secili = gunler.find((g) => g.tarih === acikGun) || null;
  // Bugun alinacak boslar: talimat cut-off'u bugunse saatiyle (talimat icin rezervasyon kadar konteyner numarasi gerekir)
  const bugunAlimlar = Object.entries(plan.ozetler).filter(([, o]) => o.bugunAl > 0)
    .map(([anahtar, o]) => ({ anahtar, al: o.bugunAl, saat: o.alimSonSaat || null }))
    .sort((a, b) => (a.saat || "99").localeCompare(b.saat || "99"));

  return (
    <div className="rounded-xl border mb-4 animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: r.kenar }} data-testid="gunluk-yukleme" data-risk={plan.risk}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3">
        <div className="min-w-[220px]">
          <p className="text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 text-white">
            <Container size={13} style={{ color: r.renk }} /> Günlük yükleme hedefi
          </p>
          {plan.isGunuMu ? (
            <>
              <p className="mt-1 text-white">
                <span className="text-2xl font-bold tabular-nums">{plan.bugunYuklenen}</span>
                <span className="text-sm" style={{ color: TEXT_MUTED }}> / {plan.bugunHedef} bugün yüklendi</span>
              </p>
              <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="h-full rounded-full" style={{ width: `${oran}%`, backgroundColor: r.renk }} />
              </div>
              {/* 23.11.2026: en az = yapilmazsa beyanname cut-off'u kacar (saat bazli); hedef = onerilen (dengeli) */}
              <p className={`mt-1.5 text-[11px] font-semibold ${plan.bugunEnAz > 0 ? "text-red-300" : "text-emerald-300"}`} data-testid="gunluk-en-az">
                {plan.bugunEnAz > 0 ? `En az ${plan.bugunEnAz} daha zorunlu (yapılmazsa cut-off kaçar)` : "Bugün zorunlu yükleme kalmadı"}
              </p>
              <p className="mt-1 text-[11px] inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                <Truck size={12} /> Bugün alınması gereken boş: <b className="text-white">{plan.bugunAl}</b>
              </p>
              {bugunAlimlar.length > 0 && (
                <ul className="mt-0.5 text-[10.5px] space-y-0.5" style={{ color: TEXT_MUTED }}>
                  {bugunAlimlar.map((x) => (
                    <li key={x.anahtar}><span className="text-white">{etiket(x.anahtar)}</span> · {x.al} boş{x.saat ? <b className="text-amber-300"> · son {x.saat}</b> : null}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm" style={{ color: TEXT_MUTED }}>Bugün yükleme günü değil; plan {gunler[0] ? gunEtiketi(gunler[0].tarih) : "—"} başlıyor.</p>
          )}
        </div>

        <div className="min-w-[200px]">
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Gereken hız</p>
          <p className="text-white"><span className="text-xl font-bold tabular-nums">{plan.gerekenHiz}</span><span className="text-sm" style={{ color: TEXT_MUTED }}> konteyner / gün</span></p>
          <p className="text-[11px] font-semibold" style={{ color: r.renk }}>{r.metin}</p>
          {kapasite && kapasite.gunSayisi > 0 && (
            <p className="text-[10.5px] mt-0.5" style={{ color: TEXT_MUTED }} title={`Son ${kapasite.gunSayisi} yükleme günü (DBA tartım günleri)`}>
              Geçmiş: ort. {sayi(kapasite.ortalama)} · çoğu gün ≤ {kapasite.p75} · en yüksek {kapasite.max}
            </p>
          )}
        </div>

        <div className="flex-1 min-w-[280px]">
          <p className="text-[11px] inline-flex items-center gap-1 mb-1" style={{ color: TEXT_MUTED }}><CalendarClock size={12} /> Önümüzdeki günler (yükle · boş al)</p>
          <div className="flex flex-wrap gap-1.5">
            {gunler.map((g) => {
              const acik = acikGun === g.tarih;
              return (
                <button key={g.tarih} type="button" onClick={() => setAcikGun(acik ? null : g.tarih)} aria-expanded={acik} data-gun={g.tarih}
                  className="px-2.5 py-1.5 rounded-lg border text-left transition-colors hover:bg-white/[0.04]"
                  style={{ borderColor: acik ? r.renk : CARD_BORDER, backgroundColor: g.tarih === plan.bugun ? ROW_HEADER_BG : undefined }}>
                  <span className="block text-[10.5px] font-semibold" style={{ color: TEXT_MUTED }}>{g.tarih === plan.bugun ? "Bugün" : gunEtiketi(g.tarih)}</span>
                  <span className="block text-sm text-white tabular-nums"><b>{g.yukle}</b><span className="text-[11px]" style={{ color: TEXT_MUTED }}> · {g.al} boş</span></span>
                  {g.dolumSaat > 0 && <span className="block text-[10px] tabular-nums" style={{ color: TEXT_MUTED }} title="Dolum: 50 kg ~1,5 sa, 25 kg ~3,5 sa / konteyner">≈ {sayi(g.dolumSaat)} sa dolum</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {secili && (
        <div className="px-4 py-2.5 border-t text-[12px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-testid="gunluk-yukleme-detay">
          <p className="text-[11px] font-semibold mb-1 inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
            {acikGun ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {gunEtiketi(secili.tarih)} · {secili.yukle} yükle · {secili.al} boş al · ≈ {sayi(secili.dolumSaat)} sa dolum
          </p>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {secili.isler.map((x) => (
              <li key={x.anahtar} className="flex justify-between gap-3">
                <span className="truncate text-white" title={x.etiket}>{x.etiket}{plan.takipsiz.includes(x.anahtar) ? " (dosya açılmadı)" : ""}</span>
                <span className="whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }}>{x.yukle > 0 ? `${x.yukle} yükle` : ""}{x.yukle > 0 && x.al > 0 ? " · " : ""}{x.al > 0 ? `${x.al} boş al` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(plan.gecikenler.length > 0 || plan.takipsiz.length > 0 || plan.plansiz.length > 0 || plan.ardiyeRiskleri.length > 0) && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ borderColor: CARD_BORDER }}>
          {plan.gecikenler.length > 0 && (
            <span className="inline-flex items-center gap-1 text-red-300" title={plan.gecikenler.map(etiket).join(", ")}>
              <AlertTriangle size={12} /> {plan.gecikenler.length} sevkiyatın hedef günü geçti / cut-off günü: {plan.gecikenler.map(etiket).slice(0, 3).join(", ")}{plan.gecikenler.length > 3 ? "…" : ""}
            </span>
          )}
          {plan.ardiyeRiskleri.length > 0 && (
            <span className="text-amber-300" title={plan.ardiyeRiskleri.map(etiket).join(", ")}>
              {plan.ardiyeRiskleri.length} sevkiyat ardiyesiz giriş tarihinden önce limana girmek zorunda: {plan.ardiyeRiskleri.map(etiket).slice(0, 3).join(", ")}
            </span>
          )}
          {plan.takipsiz.length > 0 && (
            <span className="text-amber-300" title={plan.takipsiz.map(etiket).join(", ")}>
              {plan.takipsiz.length} booking&apos;in dosyası açılmadı: alınan / dolu takip edilemiyor, tamamı kalan sayıldı.
            </span>
          )}
          {plan.plansiz.length > 0 && (
            <span style={{ color: TEXT_MUTED }} title={plan.plansiz.map(etiket).join(", ")}>
              {plan.plansiz.length} sevkiyatın beyanname cut-off&apos;u yok; plana alınmadı.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Liste satirinda kisa gorev: "Bugün: 1 boş al · 2 yükle" / "son gün geçti". */
export function GunlukGorev({ bugunYukle, bugunAl, hedefGun, gecikme, alimSonSaat = null }: { bugunYukle: number; bugunAl: number; hedefGun: string; gecikme: boolean; alimSonSaat?: string | null }) {
  if (bugunYukle === 0 && bugunAl === 0 && !gecikme) return <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>Hedef: {gunEtiketi(hedefGun)}</p>;
  const parca = [bugunAl > 0 ? `${bugunAl} boş al${alimSonSaat ? ` (son ${alimSonSaat})` : ""}` : null, bugunYukle > 0 ? `${bugunYukle} yükle` : null].filter(Boolean).join(" · ");
  return (
    <p className={`text-[10.5px] mt-0.5 font-semibold whitespace-nowrap ${gecikme ? "text-red-300" : "text-emerald-300"}`} data-gunluk-gorev>
      {parca ? `Bugün: ${parca}` : "Hedef günü geçti"}
    </p>
  );
}
