"use client";

import React, { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { X, Loader2, Paperclip, Send, CheckCircle2, AlertTriangle, Lightbulb, Frown, Trash2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type GeriBildirimTuru = "sorun" | "oneri" | "sikayet";

const TUR_SECENEKLERI: { deger: GeriBildirimTuru; etiket: string; icon: React.ReactNode; renk: string }[] = [
  { deger: "sorun", etiket: "Sorun", icon: <AlertTriangle size={15} />, renk: "#F59E0B" },
  { deger: "oneri", etiket: "Öneri", icon: <Lightbulb size={15} />, renk: "#10B981" },
  { deger: "sikayet", etiket: "Şikayet", icon: <Frown size={15} />, renk: "#DC2626" },
];

const MAKS_DOSYA_BOYUTU = 8 * 1024 * 1024; // 8 MB

export default function DestekWidget() {
  const { user, companyId } = useAuth();
  const [acik, setAcik] = useState(false);
  const [tur, setTur] = useState<GeriBildirimTuru>("sorun");
  const [mesaj, setMesaj] = useState("");
  const [dosya, setDosya] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderildi, setGonderildi] = useState(false);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  const panelKapat = () => {
    setAcik(false);
    // Panel kapandiktan sonra bir sonraki acilista temiz form gorunsun
    setTimeout(() => {
      setTur("sorun");
      setMesaj("");
      setDosya(null);
      setHata(null);
      setGonderildi(false);
    }, 300);
  };

  const dosyaSec = (e: React.ChangeEvent<HTMLInputElement>) => {
    const secilen = e.target.files?.[0];
    if (!secilen) return;
    if (secilen.size > MAKS_DOSYA_BOYUTU) {
      setHata("Dosya boyutu 8 MB'ı geçemez.");
      e.target.value = "";
      return;
    }
    setHata(null);
    setDosya(secilen);
  };

  const gonder = async () => {
    const metin = mesaj.trim();
    if (!metin) {
      setHata("Lütfen mesajınızı yazın.");
      return;
    }
    if (!user || !companyId) return;

    setGonderiliyor(true);
    setHata(null);
    try {
      let ekDosyaYolu: string | null = null;
      let ekDosyaAdi: string | null = null;

      if (dosya) {
        const guvenliAd = dosya.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
          .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const yol = `${companyId}/${user.id}/${Date.now()}_${guvenliAd}`;
        const { error: yuklemeHatasi } = await supabase.storage.from("geri-bildirim-ekleri").upload(yol, dosya);
        if (yuklemeHatasi) throw new Error(`Dosya yüklenemedi: ${yuklemeHatasi.message}`);
        ekDosyaYolu = yol;
        ekDosyaAdi = dosya.name;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/geri-bildirim-gonder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tur, mesaj: metin, ek_dosya_yolu: ekDosyaYolu, ek_dosya_adi: ekDosyaAdi }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bildiriminiz gönderilemedi.");

      setGonderildi(true);
    } catch (e: any) {
      setHata(e?.message || "Bir sorun oluştu, lütfen tekrar deneyin.");
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
          className="fixed bottom-5 right-5 z-[70] w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-fade-in"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/images/VolkanDurgut.webp" alt="Volkan Durgut" className="w-9 h-9 rounded-full object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">Volkan Durgut</p>
                <p className="text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" /> Sorun / Öneri / Şikayet
                </p>
              </div>
            </div>
            <button onClick={panelKapat} className="p-1 hover:text-white transition-colors shrink-0" style={{ color: TEXT_MUTED }}>
              <X size={18} />
            </button>
          </div>

          {gonderildi ? (
            <div className="flex flex-col items-center text-center px-6 py-8 gap-3">
              <img
                src="/images/VolkanDurgut.webp"
                alt="Volkan Durgut"
                className="w-16 h-16 rounded-full object-cover"
                style={{ border: `2px solid ${ACCENT}` }}
              />
              <CheckCircle2 size={26} style={{ color: ACCENT }} />
              <p className="text-sm text-white font-medium leading-relaxed">
                Mesajınız bana ulaştı, teşekkür ederim.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                En kısa sürede inceleyip dönüş yapacağım.
                <br />— Volkan Durgut
              </p>
              <button
                onClick={panelKapat}
                className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Kapat
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: TEXT_MUTED }}>Bildirim türü</p>
                <div className="flex gap-1.5">
                  {TUR_SECENEKLERI.map((s) => (
                    <button
                      key={s.deger}
                      onClick={() => setTur(s.deger)}
                      className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-medium border transition-colors"
                      style={{
                        borderColor: tur === s.deger ? s.renk : CARD_BORDER,
                        backgroundColor: tur === s.deger ? `${s.renk}1A` : "transparent",
                        color: tur === s.deger ? s.renk : TEXT_MUTED,
                      }}
                    >
                      {s.icon}
                      {s.etiket}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: TEXT_MUTED }}>Mesajınız</p>
                <textarea
                  value={mesaj}
                  onChange={(e) => setMesaj(e.target.value)}
                  placeholder="Karşılaştığınız sorunu, önerinizi ya da şikayetinizi buraya yazın..."
                  rows={5}
                  maxLength={5000}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-slate-500 outline-none resize-none"
                  style={{ backgroundColor: "#0F131A", border: `1px solid ${CARD_BORDER}` }}
                />
              </div>

              <div>
                {dosya ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
                    <Paperclip size={15} className="shrink-0" style={{ color: ACCENT }} />
                    <span className="truncate flex-1 text-xs text-white">{dosya.name}</span>
                    <button
                      onClick={() => { setDosya(null); if (dosyaInputRef.current) dosyaInputRef.current.value = ""; }}
                      className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                      style={{ color: TEXT_MUTED }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: CARD_BORDER }}
                  >
                    <Paperclip size={15} style={{ color: TEXT_MUTED }} />
                    <span className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Ekran görüntüsü / dosya ekle</span>
                    <input ref={dosyaInputRef} type="file" onChange={dosyaSec} className="hidden" accept="image/*,.pdf" />
                  </label>
                )}
              </div>

              {hata && <p className="text-xs" style={{ color: "#DC2626" }}>{hata}</p>}
            </div>
          )}

          {!gonderildi && (
            <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: CARD_BORDER }}>
              <button
                onClick={gonder}
                disabled={gonderiliyor || !mesaj.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: ACCENT }}
              >
                {gonderiliyor ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}