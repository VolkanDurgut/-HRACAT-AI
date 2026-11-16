"use client";

/**
 * Kontrol Merkezi > Veri Tutarsızlıkları (16.11.2026). Kullanıcı onayı: "Sistem her gün kendisi bulur ve listeler ...
 * Hiçbir veriyi değiştirmez, sadece gösterir." Plan / rezervasyon ETD farkı, iki numarayla girilmiş sipariş, navlunu
 * bilinmeyen booking, 7+ gündür booking bekleyen sipariş, yükleme planı / sipariş listesi / navlun okumasının tazeliği.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/analiz-paneli";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { TUR_BASLIGI, tutarsizlikGruplari, tutarsizliklariOku, type TutarsizlikOzeti } from "@/lib/veri-tutarsizliklari";

const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const GOSTER = 4;

export function TutarsizliklarKarti({ className = "" }: { className?: string }) {
  const [veri, setVeri] = useState<TutarsizlikOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let iptal = false;
    tutarsizliklariOku().then((v) => { if (!iptal) setVeri(v); }).catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Okunamadı."); });
    return () => { iptal = true; };
  }, []);

  const gruplar = veri ? tutarsizlikGruplari(veri.kalemler) : [];
  const toplam = veri?.kalemler.length ?? 0;
  return (
    <Panel className={className} ikon={<ShieldAlert size={12} />} baslik="Veri Tutarsızlıkları"
      sag={veri ? <>Plan {saat(veri.plan_son)} · Sipariş listesi {saat(veri.siparis_son)} · Navlun {saat(veri.navlun_son)}</> : "Kontrol ediliyor…"}
      data-testid="tutarsizliklar-karti">
      {hata ? (
        <p className="px-4 py-4 text-sm" style={{ color: "#FCA5A5" }}>Kontrol yapılamadı: {hata}</p>
      ) : !veri ? (
        <p className="px-4 py-4 text-sm" style={{ color: TEXT_MUTED }}>Kontrol ediliyor…</p>
      ) : toplam === 0 ? (
        <p className="px-4 py-4 text-sm flex items-center gap-2" style={{ color: "#6EE7B7" }}><CheckCircle2 size={15} /> Tutarsızlık yok; kaynaklar güncel.</p>
      ) : (
        <div className="grid gap-px md:grid-cols-2" style={{ backgroundColor: CARD_BORDER }}>
          {gruplar.map((g) => {
            const hepsi = acik[g.tur];
            const gorunen = hepsi ? g.kalemler : g.kalemler.slice(0, GOSTER);
            const yuksek = g.kalemler.some((k) => k.onem === "yuksek");
            return (
              <div key={g.tur} className="px-4 py-3" style={{ backgroundColor: CARD_BG }} data-testid={`tutarsizlik-${g.tur}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: yuksek ? "#FCA5A5" : "#FCD34D" }}>
                  <AlertTriangle size={13} /> {TUR_BASLIGI[g.tur]} <span className="tabular-nums" style={{ color: TEXT_MUTED }}>({g.kalemler.length})</span>
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
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: k.onem === "yuksek" ? "#F87171" : "#FBBF24" }} />
                        {k.baglanti ? <Link href={k.baglanti} className="min-w-0 hover:underline decoration-white/30">{icerik}</Link> : <span className="min-w-0">{icerik}</span>}
                      </li>
                    );
                  })}
                </ul>
                {g.kalemler.length > GOSTER && (
                  <button type="button" onClick={() => setAcik({ ...acik, [g.tur]: !hepsi })} className="mt-2 text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                    {hepsi ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {hepsi ? "Daha az göster" : `${g.kalemler.length - GOSTER} tane daha`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
