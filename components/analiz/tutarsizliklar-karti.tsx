"use client";

/**
 * Kontrol Merkezi > Veri Tutarsızlıkları (16.11.2026). Kullanıcı onayı: "Sistem her gün kendisi bulur ve listeler ...
 * Hiçbir veriyi değiştirmez, sadece gösterir." Plan / rezervasyon ETD farkı, iki numarayla girilmiş sipariş, navlunu
 * bilinmeyen booking, 7+ gündür booking bekleyen sipariş, yükleme planı / sipariş listesi / navlun okumasının tazeliği,
 * yükleme planında ETD değişimi (bilgi).
 *
 * 16.11.2026 gece sadeleştirme (kullanıcı: "sadece hata olduğunda görünür / açılır-kapanır bildirim çubuğu"):
 *  - Kalem yoksa HİÇ görünmez (kontrol hatası da sessiz değil: tek satır uyarı).
 *  - Tek satır çubuk: toplam + türlere göre sayılar; tıklayınca ayrıntı açılır. Açık/kapalı tercihi tarayıcıda saklanır;
 *    "yüksek" önemli kalem varsa ilk açılışta açık gelir.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { TUR_BASLIGI, tutarsizlikGruplari, tutarsizliklariOku, type TutarsizlikOzeti } from "@/lib/veri-tutarsizliklari";

const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const GOSTER = 4;
/** 16.11.2026: ETD farki / ETD degisti kalemleri dosya sayfasi yerine Ana Panel'de satiri vurgulayarak acilir
 *  (/panel?dosya=<id>; dosya kapaliysa Ana Panel eskisi gibi dosya sayfasina yonlendirir). */
const hedefBaglanti = (tur: string, baglanti: string | null) =>
  baglanti && (tur === "etd_farki" || tur === "etd_degisti") && baglanti.startsWith("/dosya/") ? `/panel?dosya=${encodeURIComponent(baglanti.slice(7))}` : baglanti;
const ACIK_ANAHTARI = "kontrol-merkezi:tutarsizlik-acik";

function tercihOku(): boolean | null {
  try { const v = window.localStorage.getItem(ACIK_ANAHTARI); return v === null ? null : v === "1"; } catch { return null; }
}
function tercihYaz(acik: boolean) {
  try { window.localStorage.setItem(ACIK_ANAHTARI, acik ? "1" : "0"); } catch { /* tarayici depolamasi kapali olabilir */ }
}

export function TutarsizliklarKarti({ className = "" }: { className?: string }) {
  const [veri, setVeri] = useState<TutarsizlikOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acikGrup, setAcikGrup] = useState<Record<string, boolean>>({});
  const [acik, setAcik] = useState<boolean | null>(null);

  useEffect(() => {
    let iptal = false;
    tutarsizliklariOku().then((v) => {
      if (iptal) return;
      setVeri(v);
      const t = tercihOku();
      setAcik(t !== null ? t : v.kalemler.some((k) => k.onem === "yuksek"));
    }).catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Okunamadı."); });
    return () => { iptal = true; };
  }, []);

  if (hata) {
    return (
      <div className={`rounded-xl border px-4 py-2.5 text-xs flex items-center gap-2 ${className}`} style={{ borderColor: "rgba(248,113,113,0.3)", backgroundColor: "rgba(248,113,113,0.06)", color: "#FCA5A5" }}>
        <ShieldAlert size={14} /> Veri tutarsızlık kontrolü yapılamadı: {hata}
      </div>
    );
  }
  if (!veri || veri.kalemler.length === 0) return null;

  const gruplar = tutarsizlikGruplari(veri.kalemler);
  const yuksek = veri.kalemler.filter((k) => k.onem === "yuksek").length;
  const yalnizBilgi = veri.kalemler.every((k) => k.onem === "bilgi");
  const renk = yuksek ? "#FCA5A5" : yalnizBilgi ? "#7DD3FC" : "#FCD34D";
  const zemin = yuksek ? "rgba(248,113,113,0.06)" : yalnizBilgi ? "rgba(56,189,248,0.06)" : "rgba(245,158,11,0.06)";
  const kenar = yuksek ? "rgba(248,113,113,0.3)" : yalnizBilgi ? "rgba(56,189,248,0.3)" : "rgba(245,158,11,0.3)";
  const degistir = () => { const y = !acik; setAcik(y); tercihYaz(y); };

  return (
    <section className={`rounded-xl border overflow-hidden ${className}`} style={{ borderColor: kenar, backgroundColor: CARD_BG }} data-testid="tutarsizliklar-karti">
      <button type="button" onClick={degistir} aria-expanded={!!acik}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors" style={{ backgroundColor: zemin }}>
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: renk }}>
          {yalnizBilgi ? <Info size={14} /> : <AlertTriangle size={14} />}
          Veri Tutarsızlıkları · {veri.kalemler.length} kalem
        </span>
        <span className="flex flex-wrap gap-1.5">
          {gruplar.map((g) => {
            const y = g.kalemler.some((k) => k.onem === "yuksek");
            const b = g.kalemler.every((k) => k.onem === "bilgi");
            return (
              <span key={g.tur} className="rounded-full px-2 py-0.5 text-[10.5px] border"
                style={{ borderColor: CARD_BORDER, color: y ? "#FCA5A5" : b ? "#7DD3FC" : "#E2E8F0" }}>
                {TUR_BASLIGI[g.tur]} <b className="tabular-nums">{g.kalemler.length}</b>
              </span>
            );
          })}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: TEXT_MUTED }}>
          <span className="hidden md:inline">Plan {saat(veri.plan_son)} · Sipariş listesi {saat(veri.siparis_son)} · Navlun {saat(veri.navlun_son)}</span>
          {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {acik ? "Gizle" : "Ayrıntı"}
        </span>
      </button>
      {acik && (
        <div className="grid gap-px md:grid-cols-2 border-t" style={{ backgroundColor: CARD_BORDER, borderColor: CARD_BORDER }}>
          {gruplar.map((g) => {
            const hepsi = acikGrup[g.tur];
            const gorunen = hepsi ? g.kalemler : g.kalemler.slice(0, GOSTER);
            const y = g.kalemler.some((k) => k.onem === "yuksek");
            // Yalniz bilgi (ör. ETD değişti): uyarı değil, mavi gösterilir
            const bilgi = g.kalemler.every((k) => k.onem === "bilgi");
            return (
              <div key={g.tur} className="px-4 py-3" style={{ backgroundColor: CARD_BG }} data-testid={`tutarsizlik-${g.tur}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: y ? "#FCA5A5" : bilgi ? "#7DD3FC" : "#FCD34D" }}>
                  {bilgi ? <Info size={13} /> : <AlertTriangle size={13} />} {TUR_BASLIGI[g.tur]} <span className="tabular-nums" style={{ color: TEXT_MUTED }}>({g.kalemler.length})</span>
                </p>
                <ul className="space-y-1.5">
                  {gorunen.map((k, i) => {
                    const icerik = (
                      <>
                        <span className="block text-[13px] text-white leading-snug">{k.baslik}</span>
                        <span className="block text-[11px] leading-snug" style={{ color: TEXT_MUTED }}>{k.ayrinti}</span>
                      </>
                    );
                    return (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: k.onem === "yuksek" ? "#F87171" : k.onem === "bilgi" ? "#38BDF8" : "#FBBF24" }} />
                        {k.baglanti ? <Link href={hedefBaglanti(k.tur, k.baglanti)!} className="min-w-0 hover:underline decoration-white/30">{icerik}</Link> : <span className="min-w-0">{icerik}</span>}
                      </li>
                    );
                  })}
                </ul>
                {g.kalemler.length > GOSTER && (
                  <button type="button" onClick={() => setAcikGrup({ ...acikGrup, [g.tur]: !hepsi })} className="mt-2 text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                    {hepsi ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {hepsi ? "Daha az göster" : `${g.kalemler.length - GOSTER} tane daha`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
