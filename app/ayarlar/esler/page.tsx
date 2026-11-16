"use client";

/**
 * Ayarlar > Liman ve Firma Eşleri (16.11.2026, kullanıcı onayı: "Liman ve firma eşleştirmeleri tek bir tabloda tutulursa
 * bir ekrandan yeni eşleştirme eklenir ve her yer aynı anda düzelir"). Aynı limanın / firmanın farklı yazımları tek ada
 * bağlanır; sipariş ↔ yükleme planı eşleşmesi, navlun tablosu / raporu ve Kontrol Merkezi bu sözlüğü kullanır.
 * Kayıtlar değişmez (yalnız eşleşme anahtarı). Evrak kontrolleri bilerek bağlı değil. Yalnız süper admin (Ayarlar).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Anchor, Building2, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { adEsiKaydet, adEsiSil, adEsleriOku, esGruplari, type AdEsiKaydi, type AdEsiTuru } from "@/lib/ad-esleri";

const ORNEK: Record<AdEsiTuru, { yazim: string; dogru: string }> = {
  liman: { yazim: "örn. DAR SALAAM", dogru: "örn. DAR ES SALAAM" },
  firma: { yazim: "örn. COOL LINK& MARKETING PTE LTD", dogru: "örn. COOL LINK" },
};

export default function AdEsleriPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [liste, setListe] = useState<AdEsiKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [tur, setTur] = useState<AdEsiTuru>("liman");
  const [yazim, setYazim] = useState("");
  const [dogru, setDogru] = useState("");
  const [mesgul, setMesgul] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !isSuperAdmin) router.replace("/panel"); }, [authLoading, isSuperAdmin, router]);

  const getir = useCallback(async () => {
    try { setListe(await adEsleriOku()); setHata(null); }
    catch (e) { setHata(`Eşler okunamadı: ${e instanceof Error ? e.message : String(e)}`); }
    setYukleniyor(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) getir(); }, [isSuperAdmin, getir]);

  const gruplar = useMemo(() => esGruplari(liste, tur), [liste, tur]);
  const sayilar = useMemo(() => ({ liman: liste.filter((e) => e.tur === "liman").length, firma: liste.filter((e) => e.tur === "firma").length }), [liste]);

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yazim.trim() || !dogru.trim()) { showToast("İki adı da girin.", "error"); return; }
    setMesgul("ekle");
    try {
      await adEsiKaydet(tur, yazim.trim(), dogru.trim());
      showToast(`"${yazim.trim()}" artık "${dogru.trim()}" sayılıyor.`, "success");
      setYazim(""); setDogru("");
      await getir();
    } catch (er) { showToast(er instanceof Error ? er.message : "Kaydedilemedi.", "error"); }
    setMesgul(null);
  };
  const sil = async (k: AdEsiKaydi) => {
    setMesgul(k.id);
    try { await adEsiSil(k.id); showToast(`"${k.kaynak_ad}" eşi kaldırıldı.`, "success"); await getir(); }
    catch (er) { showToast(er instanceof Error ? er.message : "Silinemedi.", "error"); }
    setMesgul(null);
  };

  if (authLoading || (isSuperAdmin && yukleniyor)) return <AppShell><SayfaYukleniyor /></AppShell>;
  if (!isSuperAdmin) return null;

  const girdi = "h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white placeholder:text-slate-500";
  return (
    <AppShell>
      <SayfaBasligi ikon={<Link2 size={20} />} baslik="Liman ve Firma Eşleri"
        aciklama="Aynı limanın ya da firmanın farklı yazımlarını tek ada bağlayın. Sipariş–yükleme planı eşleşmesi, navlun tablosu ve raporu ile Kontrol Merkezi bu listeyi kullanır; kayıtlarınız değişmez." />
      {hata && <p className="mb-3 text-sm text-red-400" role="alert">{hata}</p>}

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Eş türü">
        {(["liman", "firma"] as AdEsiTuru[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tur === t} onClick={() => setTur(t)} data-testid={`es-sekme-${t}`}
            className="h-9 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors"
            style={{ borderColor: tur === t ? ACCENT : CARD_BORDER, backgroundColor: tur === t ? "rgba(16,185,129,0.12)" : CARD_BG, color: tur === t ? "#FFFFFF" : TEXT_MUTED }}>
            {t === "liman" ? <Anchor size={14} /> : <Building2 size={14} />}
            {t === "liman" ? "Limanlar" : "Firmalar"} <span className="tabular-nums text-xs" style={{ color: TEXT_MUTED }}>{sayilar[t]}</span>
          </button>
        ))}
      </div>

      <form onSubmit={ekle} className="rounded-xl border p-4 mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="es-formu">
        <label className="block text-xs" style={{ color: TEXT_MUTED }}>Farklı yazım
          <input value={yazim} onChange={(e) => setYazim(e.target.value)} placeholder={ORNEK[tur].yazim} aria-label="Farklı yazım" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="block text-xs" style={{ color: TEXT_MUTED }}>Doğru ad
          <input value={dogru} onChange={(e) => setDogru(e.target.value)} placeholder={ORNEK[tur].dogru} aria-label="Doğru ad" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <button type="submit" disabled={mesgul === "ekle"} className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
          {mesgul === "ekle" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Eş ekle
        </button>
        <p className="md:col-span-3 text-[11px]" style={{ color: TEXT_MUTED }}>
          {tur === "liman"
            ? "Liman adları karşılaştırılırken büyük/küçük harf, Türkçe karakter ve “PORT”, “LİMANI”, ülke adı zaten yok sayılır; buraya yalnız gerçekten farklı yazılanları ekleyin."
            : "Firma adları karşılaştırılırken boşluk, noktalama ve Türkçe karakter zaten yok sayılır; kısa / uzun unvan gibi farklı yazımları ekleyin."}
        </p>
      </form>

      <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="es-listesi">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ backgroundColor: ROW_HEADER_BG }}>
          {tur === "liman" ? "Liman eşleri" : "Firma eşleri"}
        </div>
        {gruplar.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: TEXT_MUTED }}>Henüz eş yok.</p>
        ) : gruplar.map((g) => (
          <div key={g.hedef} className="px-4 py-3 border-t flex flex-wrap items-center gap-2" style={{ borderColor: CARD_BORDER }} data-testid="es-grubu">
            <span className="text-sm font-semibold text-white min-w-[160px]">{g.hedefAd}</span>
            <span className="text-xs" style={{ color: TEXT_MUTED }}>←</span>
            {g.esler.map((k) => (
              <span key={k.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border text-xs" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}
                title={k.ekleyen ? `Ekleyen: ${k.ekleyen}` : undefined}>
                {k.kaynak_ad}
                <button type="button" onClick={() => sil(k)} disabled={mesgul === k.id} aria-label={`${k.kaynak_ad} eşini kaldır`}
                  className="p-1 rounded-full hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40" style={{ color: TEXT_MUTED }}>
                  {mesgul === k.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              </span>
            ))}
          </div>
        ))}
      </section>
    </AppShell>
  );
}
