"use client";

// ============================================================================
// SIFRE YENILEME SAYFASI (talep: 01.10.2026)
// ============================================================================
// Giris ekranindaki "Sifremi unuttum" akisi (app/page.tsx ->
// resetPasswordForEmail) kullaniciya bu sayfaya yonlenen bir e-posta linki
// gonderir. Daha once bu sayfa yoktu ve link 404'e dusuyordu.
//
// Nasil calisir: Supabase istemcisi (implicit flow, detectSessionInUrl) linkin
// URL hash'indeki (#access_token=...&type=recovery) token'i kendiliginden
// okuyup gecici bir oturum acar. getSession() bu islem BITENE kadar bekler,
// yani sayfa acildiginda oturum varsa link gecerlidir. Kullanici yeni sifresini
// girer -> updateUser({ password }) -> TUM oturumlar kapatilir (signOut) ->
// yeni sifreyle giris yapmasi istenir.
//
// Supabase Dashboard notu: Authentication -> URL Configuration -> Redirect
// URLs listesinde "https://ihracatasistanim.com/sifre-yenile" (veya "/**")
// olmali; yoksa Supabase linki bu sayfa yerine Site URL'e yonlendirir.
// ============================================================================

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Anchor, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

type Durum = "kontrol" | "form" | "gecersiz" | "tamamlandi";

const MIN_SIFRE_UZUNLUGU = 8;

/** Linkin URL'inde Supabase'in dondurdugu hata (orn. suresi dolmus link:
 * #error=access_denied&error_code=otp_expired) var mi? Supabase istemcisi hash'i
 * kisa sure sonra temizleyebildigi icin sayfa acilir acilmaz okunur. */
function urlHatasiVarMi(): boolean {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return !!(hash.get("error") || hash.get("error_code") || query.get("error") || query.get("error_code"));
}

/** Supabase'in Ingilizce hata mesajlarini kullaniciya anlasilir Turkceye cevirir. */
function hataMesajiCevir(kod: string | undefined, mesaj: string): string {
  if (kod === "same_password") return "Yeni şifreniz eski şifrenizle aynı olamaz.";
  if (kod === "weak_password") return "Şifre çok zayıf. Daha uzun ve harf/rakam içeren bir şifre deneyin.";
  if (kod === "session_not_found" || kod === "session_expired") {
    return "Oturumun süresi doldu. Lütfen giriş ekranından yeni bir sıfırlama bağlantısı isteyin.";
  }
  return `Şifre güncellenemedi: ${mesaj}`;
}

export default function SifreYenilePage() {
  const router = useRouter();
  const [durum, setDurum] = useState<Durum>("kontrol");
  const [sifre, setSifre] = useState("");
  const [sifreTekrar, setSifreTekrar] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    const linkHatali = urlHatasiVarMi();
    // getSession(), Supabase istemcisinin URL'deki kurtarma token'ini isleyip
    // oturumu kaydetmesini (initialize) bekledikten sonra doner.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (iptal) return;
      setDurum(!linkHatali && session ? "form" : "gecersiz");
    });
    return () => { iptal = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    if (sifre.length < MIN_SIFRE_UZUNLUGU) {
      setHata(`Şifre en az ${MIN_SIFRE_UZUNLUGU} karakter olmalıdır.`);
      return;
    }
    if (sifre !== sifreTekrar) {
      setHata("Şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setKaydediliyor(true);
    const { error } = await supabase.auth.updateUser({ password: sifre });
    if (error) {
      setHata(hataMesajiCevir((error as any).code, error.message));
      setKaydediliyor(false);
      return;
    }
    // Sifre degisti: guvenlik icin tum cihazlardaki oturumlar kapatilir,
    // kullanici yeni sifresiyle giris yapar.
    await supabase.auth.signOut();
    setKaydediliyor(false);
    setDurum("tamamlandi");
  };

  const girisEkraninaDon = () => router.replace("/");

  const inputClass =
    "w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 px-8 py-10">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center text-white shadow-sm">
            <Anchor size={16} />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">İhracat AI</span>
        </div>

        {durum === "kontrol" && (
          <div className="flex flex-col items-center py-8 text-sm text-slate-500 gap-3">
            <Loader2 size={28} className="animate-spin text-emerald-500" />
            Bağlantı doğrulanıyor...
          </div>
        )}

        {durum === "gecersiz" && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Bağlantı geçersiz</h1>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Bu şifre sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Giriş ekranındaki
              &quot;Şifremi unuttum&quot; bölümünden yeni bir bağlantı isteyebilirsiniz.
            </p>
            <button
              type="button"
              onClick={girisEkraninaDon}
              className="w-full py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-emerald-600 bg-emerald-500 inline-flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} /> Giriş Ekranına Dön
            </button>
          </div>
        )}

        {durum === "form" && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Yeni Şifre Belirleyin</h1>
            <p className="text-sm text-slate-500 mb-6">
              Hesabınız için yeni bir şifre girin (en az {MIN_SIFRE_UZUNLUGU} karakter).
            </p>
            {hata && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600 font-medium">{hata}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Yeni Şifre</label>
                <input
                  type="password"
                  value={sifre}
                  onChange={(e) => setSifre(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  value={sifreTekrar}
                  onChange={(e) => setSifreTekrar(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={kaydediliyor || !sifre || !sifreTekrar}
                className="w-full mt-2 py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-emerald-600 bg-emerald-500 flex justify-center disabled:opacity-60"
              >
                {kaydediliyor ? <Loader2 size={18} className="animate-spin" /> : "Şifreyi Güncelle"}
              </button>
            </form>
          </div>
        )}

        {durum === "tamamlandi" && (
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Şifreniz güncellendi</h1>
            <p className="text-sm text-slate-500 mb-6">Yeni şifrenizle giriş yapabilirsiniz.</p>
            <button
              type="button"
              onClick={girisEkraninaDon}
              className="w-full py-2.5 rounded-md text-white font-medium text-sm transition-colors hover:bg-emerald-600 bg-emerald-500"
            >
              Giriş Ekranına Git
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
