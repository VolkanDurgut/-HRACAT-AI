"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Check, CreditCard, Building, Lock, Loader2, User, ArrowRight } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [faturaTipi, setFaturaTipi] = useState<"bireysel" | "kurumsal">("kurumsal");
  
  const [form, setForm] = useState({
    // Ortak
    adres: "",
    kartIsim: "",
    kartNo: "",
    skt: "",
    cvc: "",
    // Kurumsal
    unvan: "",
    vergiDairesi: "",
    vkn: "",
    // Bireysel
    adSoyad: "",
    tckn: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Backend'e form verilerini ve fatura tipini gönderiyoruz
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, faturaTipi }),
      });

      const data = await response.json();

      if (data.success) {
        alert("Harika! " + data.message);
        router.push("/dashboard"); // Başarılıysa panele yönlendir
      } else {
        alert("Ödeme Hatası: " + data.message);
        setLoading(false); // Hata varsa butonu tekrar aktif et
      }
    } catch (error) {
      alert("Sunucuya ulaşılamadı, lütfen bağlantınızı kontrol edin.");
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col md:flex-row font-sans selection:bg-emerald-200 overflow-hidden">
      
      {/* SOL TARAF - SİPARİŞ ÖZETİ */}
      <div className="w-full md:w-[40%] bg-[#1B2B4B] text-white p-8 md:p-12 flex flex-col justify-between relative overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col h-full justify-center max-w-sm mx-auto w-full">
          <div className="flex items-center gap-2 mb-10">
            <ShieldCheck size={26} className="text-emerald-400" />
            <span className="text-lg font-bold tracking-tight">İhracat AI</span>
          </div>

          <h2 className="text-3xl font-bold mb-2">Başlangıç Planı</h2>
          <p className="text-slate-400 text-sm mb-8">İhracat süreçlerinizi dijitalleştirin ve operasyonel hızınızı artırın.</p>

          <div className="bg-white/10 rounded-xl p-5 mb-8 border border-white/10 backdrop-blur-sm">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-4xl font-extrabold">25 $</span>
              <span className="text-slate-300 font-medium">/ ay</span>
            </div>
            <p className="text-emerald-400 font-medium text-[13px] mt-2">Bugün ödeyeceğiniz tutar: 0,00 ₺</p>
          </div>

          <ul className="space-y-4 mb-10">
            {[
              "14 Gün Ücretsiz Deneme Süresi",
              "Gelişmiş Rezervasyon Takibi",
              "AI Destekli Evrak Analizi (Aylık 50 Dosya)",
              "Otomatik İhracat Evrakı Oluşturma",
              "Kantar ve Konteyner Yönetimi"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-300 text-sm leading-snug">{feature}</span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-slate-500 leading-relaxed mt-auto border-t border-white/10 pt-4">
            14 günlük deneme süreniz boyunca kartınızdan hiçbir ücret çekilmeyecektir. 
            Deneme süresi bitiminde aylık aboneliğiniz otomatik olarak başlayacaktır. 
            İstediğiniz zaman iptal edebilirsiniz.
          </p>
        </div>
      </div>

      {/* SAĞ TARAF - FORM */}
      <div className="w-full md:w-[60%] bg-white p-6 md:p-12 overflow-y-auto flex items-center justify-center" style={{ scrollbarWidth: "thin" }}>
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Aboneliğinizi Başlatın</h1>
          <p className="text-slate-500 text-sm mb-6">Lütfen fatura ve ödeme bilgilerinizi eksiksiz doldurun.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* FATURA BİLGİLERİ */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2 mb-4">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  {faturaTipi === "kurumsal" ? <Building size={16} className="text-slate-400" /> : <User size={16} className="text-slate-400" />}
                  Fatura Bilgileri
                </h3>
                
                {/* FATURA TİPİ SEÇİCİ */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button type="button" onClick={() => setFaturaTipi("kurumsal")} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${faturaTipi === "kurumsal" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    Kurumsal
                  </button>
                  <button type="button" onClick={() => setFaturaTipi("bireysel")} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${faturaTipi === "bireysel" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    Bireysel
                  </button>
                </div>
              </div>

              {/* DİNAMİK FORM ALANLARI */}
              {faturaTipi === "kurumsal" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Şirket Ünvanı</label>
                    <input required type="text" name="unvan" value={form.unvan} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none" placeholder="Örn: Unex Gıda San. ve Tic. Ltd. Şti." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Vergi Dairesi</label>
                      <input required type="text" name="vergiDairesi" value={form.vergiDairesi} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Vergi No (VKN)</label>
                      <input required type="text" name="vkn" value={form.vkn} onChange={handleInputChange} maxLength={10} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none font-mono" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Ad Soyad</label>
                    <input required type="text" name="adSoyad" value={form.adSoyad} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none" placeholder="Kimlikteki adınız ve soyadınız" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">TC Kimlik No</label>
                    <input required type="text" name="tckn" value={form.tckn} onChange={handleInputChange} maxLength={11} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none font-mono" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fatura Adresi</label>
                <textarea required name="adres" value={form.adres} onChange={handleInputChange} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none resize-none" placeholder="Açık adres giriniz..."></textarea>
              </div>
            </div>

            {/* ÖDEME BİLGİLERİ */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2 mb-4 mt-6">
                <CreditCard size={16} className="text-slate-400" />
                <h3 className="font-semibold text-slate-700">Kart Bilgileri</h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Kart Üzerindeki İsim</label>
                <input required type="text" name="kartIsim" value={form.kartIsim} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Kart Numarası</label>
                <input required type="text" name="kartNo" value={form.kartNo} onChange={handleInputChange} maxLength={19} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none font-mono tracking-widest" placeholder="0000 0000 0000 0000" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Son Kullanma (AA/YY)</label>
                  <input required type="text" name="skt" value={form.skt} onChange={handleInputChange} maxLength={5} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none font-mono" placeholder="12/26" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">CVC</label>
                  <input required type="text" name="cvc" value={form.cvc} onChange={handleInputChange} maxLength={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 outline-none font-mono" placeholder="***" />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-medium py-3 px-4 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-70 mt-4">
              {loading ? <Loader2 size={18} className="animate-spin" /> : (
                <>
                  <Lock size={15} /> Ücretsiz Denemeyi Başlat <ArrowRight size={15} />
                </>
              )}
            </button>
            
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 mt-3">
              <ShieldCheck size={13} />
              <span>256-bit SSL sertifikası ile güvenli ödeme. (İyzico Altyapısı)</span>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}