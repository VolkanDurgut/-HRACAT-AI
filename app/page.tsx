"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { Loader2, Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { PAGE_BG, CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * Giris ekrani (kullanici karari 01.10.2026): Uygulamayi SADECE Unex Gida
 * kullaniyor, kayit KAPALI. Eskiden burada herkese acik bir pazarlama sayfasi
 * vardi ("Start your project" butonlari, Fiyatlandirma/Kariyer menuleri, 20
 * olu link, ornek musteri yorumu). Artik dogrudan uygulamanin koyu temasinda,
 * sade kurumsal bir giris ekrani acilir.
 *
 * Kayit formu ve "Sifremi unuttum" akisi BILEREK YOK (01.10.2026): kullanicilar
 * Supabase Dashboard'dan manuel eklenir, sifre sifirlama yonetici isidir.
 */
export default function GirisSayfasi() {
  const { user, loading, yetkiler, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Girisli kullanici, erisebildigi ILK sayfaya gider (ör. sadece kantar
    // yetkisi olan -> /kantar). Hic sayfa yetkisi yoksa /dashboard'a gider ve
    // orada AppShell "Erisim yetkiniz yok" ekranini gosterir - dongu olusmaz.
    if (!loading && user) router.replace(ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri) || "/dashboard");
  }, [user, loading, yetkiler, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsProcessing(true);
    const { error } = await signIn(email, password);
    if (error) {
      setAuthError("Giriş bilgileri hatalı. Lütfen e-posta ve şifrenizi kontrol edin.");
      setIsProcessing(false);
    } else {
      router.push("/dashboard");
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  const inputClass =
    "w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ backgroundColor: PAGE_BG }}>
      <div className="w-full max-w-[400px]">
        {/* Marka */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="Unex" className="w-11 h-11 object-contain" />
          <div>
            <p className="text-lg font-semibold leading-tight text-white">İhracat AI</p>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Unex Gıda · İhracat Operasyon Paneli</p>
          </div>
        </div>

        {/* Giris karti */}
        <div className="rounded-xl border p-6 sm:p-8 shadow-2xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <h1 className="text-xl font-bold text-white">Giriş Yap</h1>
          <p className="text-sm mt-1 mb-6" style={{ color: TEXT_MUTED }}>Kurumsal e-posta adresiniz ve şifrenizle oturum açın.</p>

          {authError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm text-red-300" style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)" }}>
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium mb-1.5" style={{ color: TEXT_MUTED }}>E-posta</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ad.soyad@unex.com.tr"
                  className={inputClass}
                  style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium mb-1.5" style={{ color: TEXT_MUTED }}>Şifre</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={inputClass}
                  style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isProcessing || !email || !password}
              className="w-full h-10 mt-2 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : "Giriş Yap"}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
            <ShieldCheck size={15} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
            <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
              Hesaplar yönetici tarafından oluşturulur. Erişim veya şifre sıfırlama için yöneticinizle iletişime geçin.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px]" style={{ color: "#4A5262" }}>© {new Date().getFullYear()} Unex Gıda · İhracat AI</p>
      </div>
    </main>
  );
}
