"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { 
  Anchor, BrainCircuit, FileText, Clock, 
  Loader2, Mail, Lock, ShieldCheck,
  Building2, ArrowLeft, Github, Twitter, Quote
} from "lucide-react";

// ==========================================
// 1. KISIM: GİRİŞ VE KAYIT EKRANI BİLEŞENİ
// ==========================================
const AuthScreen = ({ 
  initialMode, 
  onBack 
}: { 
  initialMode: "login" | "register", 
  onBack: () => void 
}) => {
  const { signIn } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kurumsalAd, setKurumsalAd] = useState("");
  const [kurumsalFirma, setKurumsalFirma] = useState("");
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loginMode, setLoginMode] = useState<"personel" | "kurumsal">("personel");
  const [authType, setAuthType] = useState<"login" | "register">(initialMode);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tip hatasını çözmek için "info" parametresi "success" olarak güncellendi.
    showToast("Kayıt ve 14 Günlük Deneme için Ödeme altyapısına yönlendiriliyorsunuz...", "success");
  };

  const handleKurumsalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      showToast("Talebiniz alındı! Ekibimiz yerel kurulum ve detaylar için en kısa sürede sizinle iletişime geçecektir.", "success");
      setKurumsalAd(""); setKurumsalFirma(""); setEmail("");
    }, 1500);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setAuthError("Lütfen kayıtlı e-posta adresinizi girin."); return; }
    setAuthError(null); setIsProcessing(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/sifre-yenile`,
    });
    setIsProcessing(false);
    if (error) { setAuthError(error.message); } 
    else { showToast("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.", "success"); setIsForgotPassword(false); }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full bg-slate-50 font-sans animate-in fade-in duration-500">
      <button type="button" onClick={onBack} className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white text-sm font-medium hover:bg-white/20 transition-colors">
        <ArrowLeft size={16} /> Ana Sayfaya Dön
      </button>

      {/* Auth - Sol Taraf (Dark) */}
      <div className="relative hidden md:flex flex-1 bg-[#1C1C1C] overflow-hidden flex-col justify-between p-12 lg:p-20 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-500 text-white shadow-xl"><Anchor size={20} /></div>
          <span className="text-xl font-bold tracking-tight">İhracat AI</span>
        </div>
        <div className="relative z-10 max-w-lg my-auto">
          <h2 className="text-4xl font-extrabold leading-[1.2] mb-6 tracking-tight">
            Operasyonlarınızı <span className="text-emerald-400">Yapay Zeka</span> ile Ölçeklendirin.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Binlerce ihracatçı manuel veri girişini bıraktı. Siz de aramıza katılın ve zamanınızı büyümeye ayırın.
          </p>
        </div>
      </div>

      {/* Auth - Sağ Taraf (Form) */}
      <div className="w-full md:w-[500px] bg-white flex flex-col justify-center px-8 md:px-14 py-12 shadow-2xl z-20 overflow-y-auto">
        {!isForgotPassword && (
          <div className="flex p-1 bg-slate-100 rounded-lg mb-8">
            <button type="button" onClick={() => { setLoginMode("personel"); setAuthType("login"); setAuthError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${loginMode === "personel" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              Bireysel
            </button>
            <button type="button" onClick={() => { setLoginMode("kurumsal"); setAuthError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${loginMode === "kurumsal" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              Kurumsal (Lokal Kurulum)
            </button>
          </div>
        )}

        {isForgotPassword ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button type="button" onClick={() => setIsForgotPassword(false)} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-6"><ArrowLeft size={16} /> Geri Dön</button>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Şifremi Unuttum</h2>
            <p className="text-sm text-slate-500 mb-6">Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderelim.</p>
            {authError && <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600 font-medium">{authError}</div>}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">E-posta Adresi</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              <button type="submit" disabled={isProcessing || !email} className="w-full py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-emerald-600 bg-emerald-500 flex justify-center">
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : "Bağlantı Gönder"}
              </button>
            </form>
          </div>
        ) : loginMode === "kurumsal" ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Kurumsal & Özel Altyapı</h2>
            <p className="text-sm text-slate-500 mb-6">Kendi sunucularınızda lokal kurulum ve API entegrasyonu çözümleri için bizimle iletişime geçin.</p>
            <form onSubmit={handleKurumsalRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad</label>
                <input type="text" value={kurumsalAd} onChange={(e) => setKurumsalAd(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Firma Adı</label>
                <input type="text" value={kurumsalFirma} onChange={(e) => setKurumsalFirma(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">İş E-postası</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
              </div>
              <button type="submit" disabled={isProcessing} className="w-full mt-2 py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-slate-800 bg-slate-900 flex justify-center">
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : "Bizimle İletişime Geçin"}
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {authType === "login" ? "Tekrar Hoş Geldiniz" : "Ücretsiz Başlayın"}
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              {authType === "login" ? "Hesabınıza erişmek için giriş yapın." : "Şu anda yeni kayıtlar davetle açılıyor."}
            </p>
            {authError && <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600 font-medium">{authError}</div>}

            {authType === "login" ? (
              <>
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">E-posta</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-slate-700">Şifre</label>
                      <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs text-slate-500 hover:text-emerald-600 transition-colors">Şifremi unuttum?</button>
                    </div>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                  </div>
                  <button type="submit" disabled={isProcessing || !email || !password} className="w-full mt-2 py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-emerald-600 bg-emerald-500 flex justify-center disabled:opacity-60">
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : "Giriş Yap"}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-600">
                  Hesabınız yok mu? <button type="button" onClick={() => { setAuthType("register"); setAuthError(null); }} className="font-medium text-emerald-600 hover:underline">Kayıt Olun</button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-600 leading-relaxed">
                  Şu anda yeni kayıtlar yalnızca davetle açılıyor. Erişim talebiniz için lütfen bizimle iletişime geçin.
                </div>
                <div className="mt-4 text-center text-sm text-slate-600">
                  Zaten hesabınız var mı? <button type="button" onClick={() => { setAuthType("login"); setAuthError(null); }} className="font-medium text-emerald-600 hover:underline">Giriş Yapın</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


// ==========================================
// 2. KISIM: ANA AÇILIŞ SAYFASI (LANDING PAGE)
// ==========================================
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [currentView, setCurrentView] = useState<"landing" | "auth">("landing");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  const goToAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setCurrentView("auth");
  };

  if (currentView === "auth") {
    return <AuthScreen initialMode={authMode} onBack={() => setCurrentView("landing")} />;
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-white font-sans text-slate-900 selection:bg-emerald-200">
      
      {/* ÜST NAVBAR */}
      <nav className="fixed top-0 w-full h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 z-50 flex items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center text-white shadow-sm">
              <Anchor size={16} />
            </div>
            <span className="font-bold text-lg tracking-tight">İhracat AI</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
            <a href="#" className="hover:text-slate-900 transition-colors">Özellikler</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Çözümler</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Fiyatlandırma</a>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {/* Supabase tarzı hayalet (ghost) Sign In butonu */}
          <button onClick={() => goToAuth("login")} className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Sign in
          </button>
          
          {/* Supabase tarzı ana (primary) Start your project butonu */}
          <button onClick={() => goToAuth("register")} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white transition-all bg-[#24b47e] border border-[#24b47e] rounded-md shadow-sm hover:bg-[#1e9d6d] hover:border-[#1e9d6d]">
            Start your project
          </button>
        </div>
      </nav>

      {/* HERO BÖLÜMÜ */}
      <section className="pt-32 pb-20 px-6 text-center max-w-5xl mx-auto flex flex-col items-center">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]">
          Bugün dijitalleşin.<br />
          <span className="text-emerald-500">Global ölçekte büyüyün.</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          İhracat operasyonlarınıza yapay zeka ile başlayın. AI destekli belge okuma, %100 uyumlu evrak üretimi, akıllı cut-off takibi ve navlun yönetimi ekleyin.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 w-full mt-2">
          {/* Supabase tarzı ana aksiyon butonu */}
          <button onClick={() => goToAuth("login")} className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-all bg-[#24b47e] border border-[#24b47e] rounded-md shadow-sm hover:bg-[#1e9d6d] hover:border-[#1e9d6d]">
            Start your project
          </button>
          
          {/* Supabase tarzı ikincil aksiyon butonu */}
          <button onClick={() => goToAuth("register")} className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium transition-all bg-white border rounded-md shadow-sm text-slate-700 border-slate-300 hover:bg-slate-50">
            Request a demo
          </button>
        </div>
      </section>

      {/* ÖZELLİKLER (SUPABASE TARZI BENTO GRID) */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Kart 1: Veritabanı / Evrak Üretimi */}
            <div className="col-span-1 p-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={18} className="text-slate-700" />
                <h3 className="font-bold text-slate-900">Sıfır Hata Evraklar</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Her projeye tam entegre evrak üreticisi. Commercial Invoice, Packing List ve sertifikalarınızı saniyeler içinde PDF'e dönüştürün.
              </p>
            </div>

            {/* Kart 2: Auth / AI Analiz */}
            <div className="col-span-1 p-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit size={18} className="text-slate-700" />
                <h3 className="font-bold text-slate-900">Yapay Zeka Analizi</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Manuel veri girişini bırakın. Gemi evrakları, proforma ve talimatlarınızı yapay zeka entegrasyonu ile otomatik okutun.
              </p>
            </div>

            {/* Kart 3: Realtime / Cut-off */}
            <div className="col-span-1 p-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} className="text-slate-700" />
                <h3 className="font-bold text-slate-900">Gerçek Zamanlı Takip</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Gemi kalkış, ETA, ETD ve beyanname sürelerini gerçek zamanlı takip edin. Gecikmeleri anında fark edin.
              </p>
            </div>

            {/* Kart 4: API / Kurumsal Ağ */}
            <div className="col-span-1 p-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-slate-700" />
                <h3 className="font-bold text-slate-900">Acente API'leri</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Farklı acentelerden navlun tekliflerini tek merkezde toplayın. Anında kullanıma hazır operasyonel paneller.
              </p>
            </div>

          </div>

          <div className="mt-16 text-center">
            <p className="text-lg text-slate-600 font-medium">
              Birini veya hepsini kullanın. İhracat operasyonlarında sınıfının en iyisi.<br/>
              <span className="text-slate-900 font-bold">Tek platform olarak entegre.</span>
            </p>
          </div>
        </div>
      </section>

      {/* DASHBOARD MOCKUP / ÜRETKEN KALIN BÖLÜMÜ */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Üretken kalın ve tüm süreci yönetin</h2>
          <p className="text-slate-500 mb-12">tek bir ekrandan ayrılmadan.</p>
          
          <div className="w-full aspect-[16/9] md:aspect-[21/9] rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col text-left">
            <div className="h-10 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
              <div className="ml-4 px-3 py-1 bg-white rounded border border-slate-200 text-xs text-slate-400 font-mono shadow-sm">app.ihracat-ai.com/dashboard</div>
            </div>
            <div className="flex-1 p-8 flex gap-6">
              <div className="w-48 h-full bg-slate-50 rounded border border-slate-100 hidden md:block"></div>
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="h-20 flex-1 bg-slate-50 border border-slate-100 rounded"></div>
                  <div className="h-20 flex-1 bg-emerald-50 border border-emerald-100 rounded"></div>
                  <div className="h-20 flex-1 bg-slate-50 border border-slate-100 rounded"></div>
                </div>
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded p-6">
                  <div className="w-1/4 h-3 bg-slate-200 rounded mb-6"></div>
                  <div className="w-full h-8 bg-white border border-slate-100 rounded mb-2"></div>
                  <div className="w-full h-8 bg-white border border-slate-100 rounded mb-2"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MÜŞTERİ HİKAYELERİ */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center tracking-tight">
            Sektör liderleri İhracat AI ile nasıl büyüyor?
          </h2>
          <div className="p-8 md:p-12 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-emerald-500/30 transition-colors">
            <Quote className="text-slate-200 w-10 h-10 mb-6" />
            <p className="text-xl md:text-2xl font-medium text-slate-800 leading-relaxed mb-8">
              "Alternatiflere baktık ve İhracat AI'ı seçtik çünkü inanılmaz basit ve tüm sevkiyat sürecimizi kapsıyor. Operasyon süremizi %80 kısalttı ve sıfır hata ile çalışmamızı sağladı."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                VD
              </div>
              <div>
                <div className="font-bold text-slate-900">Volkan Durgut</div>
                <div className="text-sm text-slate-500">İhracat Operasyon</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ALT CTA BÖLÜMÜ */}
      <section className="py-24 bg-[#1C1C1C] text-center px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">İlk günden itibaren endüstri standardıDoc güvenlik.</h2>
          <p className="text-slate-400 text-lg mb-10">
            Kullanıcı verileriniz şifrelenmiş sunucularda barınır. Sadece yetkili personelleriniz verilere erişebilir. Daima kontroldesiniz.
          </p>
          <div className="flex items-center justify-center">
            <button onClick={() => goToAuth("login")} className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-all bg-[#24b47e] border border-[#24b47e] rounded-md shadow-sm hover:bg-[#1e9d6d] hover:border-[#1e9d6d]">
              Start your project
            </button>
          </div>
        </div>
      </section>

      {/* DEVASE SUPABASE TARZI FOOTER */}
      <footer className="bg-white border-t border-slate-200 pt-16 pb-8 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 mb-16">
          
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Anchor size={20} className="text-emerald-500" />
              <span className="font-bold text-xl text-slate-900 tracking-tight">İhracat AI</span>
            </div>
            <div className="flex gap-4 text-slate-400 mb-8">
              <Github className="w-5 h-5 hover:text-slate-900 cursor-pointer transition-colors" />
              <Twitter className="w-5 h-5 hover:text-slate-900 cursor-pointer transition-colors" />
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-4">Ürün</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Fiyatlandırma</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Yapay Zeka Analizi</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Evrak Üretici</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Cut-Off Takibi</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Acente & Navlun</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-4">Çözümler</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-emerald-600 transition-colors">KOBİ'ler</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Kurumsal İhracatçılar</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Lojistik Acenteleri</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Gümrük Müşavirleri</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-4">Kaynaklar</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Dokümantasyon</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Müşteri Hikayeleri</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Sistem Durumu</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-4">Şirket</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Hakkımızda</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Kariyer</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Gizlilik Politikası</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">Kullanım Şartları</a></li>
              <li><a href="mailto:export@unex.com.tr" className="hover:text-emerald-600 transition-colors">Bize Ulaşın</a></li>
            </ul>
          </div>

        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">© 2026 İhracat AI Inc.</p>
        </div>
      </footer>

    </div>
  );
}