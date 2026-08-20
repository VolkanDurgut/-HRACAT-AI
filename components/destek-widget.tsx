"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { X, Send, Loader2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Mesaj = {
  id: string;
  gonderen: "kullanici" | "asistan";
  mesaj: string;
};

const ALTI_SAAT_MS = 6 * 60 * 60 * 1000;

/** Önce Supabase'deki gerçek "full_name" bilgisini kullanır, yoksa e-postadan türetir. Backend'deki (destek-asistan) isimTuret ile birebir aynı mantık. */
function isimTuret(email: string | undefined | null, fullName?: string | null): string {
  if (fullName && fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  if (!email) return "";
  const yerel = email.split("@")[0] || "";
  const ilkParca = yerel.split(/[._-]/)[0] || yerel;
  if (!ilkParca) return "";
  return ilkParca.charAt(0).toLocaleUpperCase("tr-TR") + ilkParca.slice(1).toLocaleLowerCase("tr-TR");
}

export default function DestekWidget() {
  const { user, companyId } = useAuth();
  const [acik, setAcik] = useState(false);
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yukluGecmis, setYukluGecmis] = useState(false);
  const [yaziyor, setYaziyor] = useState(false);
  const [girdi, setGirdi] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isim = isimTuret(user?.email, (user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name);

  useEffect(() => {
    if (acik && !yukluGecmis && user && companyId) {
      gecmisiYukle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mesajlar, yaziyor]);

  const gecikme = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const gecmisiYukle = async () => {
    if (!user || !companyId) return;
    setYukleniyor(true);
    const { data } = await supabase
      .from("destek_mesajlari")
      .select("id, gonderen, mesaj, created_at")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(100);

    const kayitlar = data || [];
    setMesajlar(kayitlar.map((k: any) => ({ id: k.id, gonderen: k.gonderen, mesaj: k.mesaj })));
    setYukleniyor(false);
    setYukluGecmis(true);

    const sonKayit = kayitlar[kayitlar.length - 1];
    const yeniOturum = !sonKayit || Date.now() - new Date(sonKayit.created_at).getTime() > ALTI_SAAT_MS;
    if (yeniOturum) {
      karsilamaOynat();
    }
  };

  const karsilamaOynat = async () => {
    if (!user || !companyId) return;
    const hitap = isim ? `${isim} Bey, ` : "";

    setYaziyor(true);
    await gecikme(900);
    const mesaj1 = `Teşekkürler ${hitap}söylediklerinizi anladık. Harekete geçiyoruz.`;
    setYaziyor(false);
    setMesajlar((prev) => [...prev, { id: `karsilama-1-${Date.now()}`, gonderen: "asistan", mesaj: mesaj1 }]);
    supabase.from("destek_mesajlari").insert({ company_id: companyId, user_id: user.id, gonderen: "asistan", mesaj: mesaj1 });

    await gecikme(700);
    setYaziyor(true);
    await gecikme(1300);
    const mesaj2 = `Buyurun ${isim ? isim + " Bey, " : ""}size nasıl yardımcı olabilirim?`;
    setYaziyor(false);
    setMesajlar((prev) => [...prev, { id: `karsilama-2-${Date.now()}`, gonderen: "asistan", mesaj: mesaj2 }]);
    supabase.from("destek_mesajlari").insert({ company_id: companyId, user_id: user.id, gonderen: "asistan", mesaj: mesaj2 });
  };

  const gonder = async () => {
    const metin = girdi.trim();
    if (!metin || gonderiliyor) return;
    setGirdi("");
    setMesajlar((prev) => [...prev, { id: `yerel-${Date.now()}`, gonderen: "kullanici", mesaj: metin }]);
    setGonderiliyor(true);
    setYaziyor(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/destek-asistan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mesaj: metin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bir sorun oluştu.");
      setYaziyor(false);
      setMesajlar((prev) => [...prev, { id: `cevap-${Date.now()}`, gonderen: "asistan", mesaj: data.cevap }]);
    } catch {
      setYaziyor(false);
      setMesajlar((prev) => [
        ...prev,
        { id: `hata-${Date.now()}`, gonderen: "asistan", mesaj: "Şu anda mesajınızı iletemedim, lütfen birazdan tekrar deneyin." },
      ]);
    } finally {
      setGonderiliyor(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {!acik && (
        <button
          onClick={() => setAcik(true)}
          className="fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full shadow-xl border transition-transform hover:scale-105"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, boxShadow: `0 6px 24px -4px ${ACCENT}66` }}
        >
          <span className="relative shrink-0 w-10 h-10">
            <img
              src="/images/VolkanDurgut.webp"
              alt="Volkan Durgut"
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: `2px solid ${ACCENT}` }}
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full animate-ping" style={{ backgroundColor: "#22c55e", opacity: 0.75 }} />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2" style={{ backgroundColor: "#22c55e", borderColor: CARD_BG }} />
          </span>
          <span className="text-sm font-semibold text-white whitespace-nowrap">Sorun Bildir</span>
        </button>
      )}

      {acik && (
        <div
          className="fixed bottom-5 right-5 z-[70] w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-fade-in"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/images/VolkanDurgut.webp" alt="Volkan Durgut" className="w-9 h-9 rounded-full object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">Volkan Durgut</p>
                <p className="text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" /> Destek
                </p>
              </div>
            </div>
            <button onClick={() => setAcik(false)} className="p-1 hover:text-white transition-colors shrink-0" style={{ color: TEXT_MUTED }}>
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {yukleniyor ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={20} className="animate-spin" style={{ color: ACCENT }} />
              </div>
            ) : (
              <>
                {mesajlar.length === 0 && (
                  <p className="text-xs text-center mt-4" style={{ color: TEXT_MUTED }}>
                    Bir mesaj yazarak destek sohbetini başlatabilirsiniz.
                  </p>
                )}
                {mesajlar.map((m) => (
                  <div key={m.id} className={`flex items-end gap-2 ${m.gonderen === "kullanici" ? "justify-end" : "justify-start"}`}>
                    {m.gonderen === "asistan" && (
                      <img src="/images/VolkanDurgut.webp" alt="Volkan Durgut" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    )}
                    <div
                      className="max-w-[76%] px-3 py-2 rounded-2xl text-sm leading-relaxed text-white break-words"
                      style={{ backgroundColor: m.gonderen === "kullanici" ? ACCENT : CARD_BORDER }}
                    >
                      {m.mesaj}
                    </div>
                  </div>
                ))}
                {yaziyor && (
                  <div className="flex items-end gap-2 justify-start">
                    <img src="/images/VolkanDurgut.webp" alt="Volkan Durgut" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    <div className="px-3 py-2 rounded-2xl text-xs flex items-center gap-1.5" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}>
                      <span>Volkan Durgut yazıyor</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-3 border-t shrink-0" style={{ borderColor: CARD_BORDER }}>
            <input
              type="text"
              value={girdi}
              onChange={(e) => setGirdi(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") gonder();
              }}
              placeholder="Mesajınızı yazın..."
              disabled={gonderiliyor}
              className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-50"
              style={{ backgroundColor: "#0F131A", border: `1px solid ${CARD_BORDER}` }}
            />
            <button
              onClick={gonder}
              disabled={gonderiliyor || !girdi.trim()}
              className="p-2 rounded-lg text-white transition-opacity disabled:opacity-40 shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              {gonderiliyor ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}