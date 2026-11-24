"use client";
/**
 * ANA PANEL > GUNLUK YUKLEME KARTI > FILO VE BUGDAY (23.11.2026 aksam). Hesap: lib/panel/filo-plani.ts
 * (veri: panel_filo_durumu). Bugun filonun dagilimi, son 14 is gunu (bosta kalan arac-gun ve tasinabilecek bugday),
 * onumuzdeki gunlerde bugdaya ayrilabilecek arac / sefer / ton ve acik alislarin (TMO / ajans) tahmini bitisi.
 * Hicbir kaydi degistirmez; fiyat gostermez.
 * 24.11.2026 sadelestirme (kullanici: "Cok karisik gozukuyor"): varsayilan TEK SATIR ozet (bugunku dagilim + bugday bitis
 * tahmini); denklem, son 14 gun, gun gun plan ve alislar "Ayrinti" ile acilir. Kantarda bekleyen arac "kantarda" sayilir.
 */
import React, { useState } from "react";
import { Truck, Wheat, AlertTriangle, ChevronDown } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { gunEtiketi } from "@/lib/panel/gunluk-yukleme";
import type { FiloPlani } from "@/lib/panel/filo-plani";

const ton = (kg: number) => Math.round(kg / 1000).toLocaleString("tr-TR");
const ondalik = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const trGun = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}` : "—");

function Parca({ etiket, plakalar, renk, testId }: { etiket: string; plakalar: string[]; renk: string; testId: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px]" style={{ borderColor: CARD_BORDER }} title={plakalar.join(", ") || "—"} data-filo={testId}>
      <span style={{ color: TEXT_MUTED }}>{etiket}</span>
      <b className="tabular-nums text-[13px]" style={{ color: renk }}>{plakalar.length}</b>
    </span>
  );
}

export function FiloBolumu({ plan }: { plan: FiloPlani }) {
  const [acik, setAcik] = useState(false);
  const kullanilmayan = new Set(plan.kullanilmayan.map((k) => k.plaka));
  const bosta = plan.bugun.bosta.filter((p) => !kullanilmayan.has(p));
  const gunler = plan.gunler.slice(0, 6);
  const enBuyukAlis = [...plan.alislar].sort((a, b) => b.kalanKg - a.kalanKg)[0];
  return (
    <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: CARD_BORDER }} data-testid="filo-bolumu">
      {/* Ozet satiri (varsayilan) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-white mr-1 whitespace-nowrap">
          <Truck size={13} style={{ color: "#FCD34D" }} /> Filo bugün ({plan.filoSayisi})
        </span>
        <Parca etiket="Konteyner" plakalar={plan.bugun.konteyner} renk="#6EE7B7" testId="konteyner" />
        <Parca etiket="Kantarda" plakalar={plan.bugun.kantarda} renk="#7DD3FC" testId="kantarda" />
        <Parca etiket="Buğday" plakalar={plan.bugun.bugday} renk="#FCD34D" testId="bugday" />
        <Parca etiket="İç satış" plakalar={plan.bugun.satis} renk="#93C5FD" testId="satis" />
        <Parca etiket="İş almadı" plakalar={bosta} renk="#C9D1DC" testId="bosta" />
        {plan.kullanilmayan.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-300 whitespace-nowrap" data-filo="kullanilmayan"
            title={plan.kullanilmayan.map((k) => `${k.plaka}: son iş ${trGun(k.sonIs)}`).join(", ") + " — 7 iş günüdür hiç iş yok (arıza / izin?)"}>
            <AlertTriangle size={12} /> {plan.kullanilmayan.map((k) => k.plaka).join(", ")} 7 iş günüdür çalışmıyor
          </span>
        )}
        {enBuyukAlis && (
          <span className={`whitespace-nowrap ${enBuyukAlis.terminiKacirir ? "text-red-300" : ""}`} style={enBuyukAlis.terminiKacirir ? undefined : { color: TEXT_MUTED }} data-filo="ozet-alis">
            · Buğday: {enBuyukAlis.tedarikci || enBuyukAlis.no} kalan <b>{ton(enBuyukAlis.kalanKg)} t</b>, bu hızla <b>{enBuyukAlis.bitis ? gunEtiketi(enBuyukAlis.bitis) : "60 iş gününde bitmiyor"}</b>
          </span>
        )}
        <button type="button" onClick={() => setAcik((a) => !a)} aria-expanded={acik} data-filo="ayrinti"
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          {acik ? "Gizle" : "Ayrıntı"} <ChevronDown size={12} className={`transition-transform ${acik ? "rotate-180" : ""}`} />
        </button>
      </div>

      {acik && (<>
      <p className="mt-2 text-[10.5px]" style={{ color: TEXT_MUTED }} title="Araç başı sefer ve sefer tonu: filonun son 75 gündeki alış teslimlerinden">
        Hesap: buğdaya ayrılabilecek araç = filo − konteyner aracı − iç satış aracı · günlük buğday = bu araç × {ondalik(plan.seferAracGun)} sefer × {ondalik(plan.seferKg / 1000)} t.
        Konteyner aracı: bilinen yükleme planı, en az son 14 iş günü ortalaması ({plan.gecmis.ortKonteynerArac} araç).
      </p>

      {/* Son 14 is gunu */}
      {plan.gecmis.gunSayisi > 0 && (
        <p className="mt-1.5" style={{ color: TEXT_MUTED }} data-filo="gecmis">
          Son {plan.gecmis.gunSayisi} iş günü: buğdaya <b className="text-white">{plan.gecmis.bugdayAracGun}</b> araç-gün ayrıldı,
          {" "}<b className={plan.gecmis.bostaAracGun > 0 ? "text-red-300" : "text-white"}>{plan.gecmis.bostaAracGun}</b> araç-gün boşta kaldı
          {plan.gecmis.olasiSefer > 0 && plan.toplamKalanKg > 0 ? <> → aynı günlerde ≈ <b className="text-amber-300">{plan.gecmis.olasiSefer} sefer / {plan.gecmis.olasiTon.toLocaleString("tr-TR")} t</b> buğday daha çekilebilirdi</> : null}.

        </p>
      )}

      {/* Onumuzdeki gunler */}
      {gunler.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}><Wheat size={12} /> Önümüzdeki günler: buğdaya ayrılabilecek araç</p>
          <div className="flex flex-wrap gap-1.5">
            {gunler.map((g) => (
              <span key={g.tarih} className="px-2 py-1 rounded-md border" style={{ borderColor: CARD_BORDER, opacity: g.tahmini ? 0.75 : 1 }} data-filo-gun={g.tarih}
                title={`${gunEtiketi(g.tarih)}: konteyner ${g.konteynerArac} araç, iç satış ${g.satisArac} araç, buğday ${g.bugdayArac} araç ≈ ${ondalik(g.bugdaySefer)} sefer${g.tahmini ? " (konteyner aracı geçmiş ortalaması)" : ""}`}>
                <span className="block text-[10.5px] font-semibold" style={{ color: TEXT_MUTED }}>{gunEtiketi(g.tarih)}{g.tahmini ? " ~" : ""}</span>
                <span className="block text-white tabular-nums"><b style={{ color: "#FCD34D" }}>{g.bugdayArac}</b> buğday · {g.konteynerArac} kont{g.satisArac > 0 ? ` · ${g.satisArac} satış` : ""}</span>
                <span className="block text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>≈ {ondalik(g.bugdaySefer)} sefer · {ondalik(g.bugdayTon)} t</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Acik alislar */}
      {plan.alislar.length > 0 && (
        <ul className="mt-2 space-y-0.5" data-filo="alislar">
          {plan.alislar.map((a) => (
            <li key={a.no} className={a.terminiKacirir ? "text-red-300" : ""} style={a.terminiKacirir ? undefined : { color: TEXT_MUTED }}>
              <span className="text-white">{a.tedarikci || "—"}</span> {a.no}: kalan <b>{ton(a.kalanKg)} t</b> (≈ {a.kalanSefer} sefer; {ton(a.gelenKg)}/{ton(a.hedefKg)} t geldi)
              {a.termin ? <> · termin {trGun(a.termin)}{a.terminGecti ? <b> geçti</b> : null}</> : null}
              {" "}· bu hızla bitiş <b>{a.bitis ? gunEtiketi(a.bitis) : "60 iş gününde bitmiyor"}</b>
              {a.sonTeslim ? <> · son teslim {trGun(a.sonTeslim)}</> : <> · hiç teslim yok</>}
            </li>
          ))}
        </ul>
      )}
      {plan.satisKalanSefer > 0 && (
        <p className="mt-1" style={{ color: TEXT_MUTED }}>İç satışta nakliyesi bizde kalan ≈ <b className="text-white">{plan.satisKalanSefer} sefer</b> önce planlandı (buğdaydan önce).</p>
      )}
      </>)}
    </div>
  );
}
