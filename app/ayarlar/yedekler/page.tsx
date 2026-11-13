"use client";

/**
 * Ayarlar > Yedekler (13.11.2026). Kullanici karari: gece yedegi "Ek yerine giris gerektiren link" ile gelsin (zip ekli
 * mail sirket posta sunucusunda karantinaya takiliyordu). Maildeki "Yedegi indir" dugmesi buraya getirir.
 * Liste: son 60 gece (durum, kayit / tablo, boyut, indirme sayisi). "Indir": 2 dakikalik imzali link (edge yedek-indir),
 * her indirme kaydedilir. Yalniz super admin (AppShell + sayfa + veritabani).
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FlaskConical, Loader2, RefreshCw, XCircle } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { mbYaz, yedekIndirmeLinki, yedekListesi, type YedekSatiri } from "@/lib/yedekler";

const SEFTALI = "#F4A07C";
const tarihSaat = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const sayi = (n: number | null) => (n === null ? "—" : n.toLocaleString("tr-TR"));

const DURUM: Record<YedekSatiri["durum"], { ad: string; renk: string; zemin: string; ikon: React.ReactNode }> = {
  basarili: { ad: "Başarılı", renk: "#6EE7B7", zemin: "rgba(16,185,129,0.15)", ikon: <CheckCircle2 size={12} /> },
  uyarili: { ad: "Uyarılı", renk: "#FCD34D", zemin: "rgba(245,158,11,0.12)", ikon: <AlertTriangle size={12} /> },
  hatali: { ad: "Hatalı", renk: "#FCA5A5", zemin: "rgba(239,68,68,0.12)", ikon: <XCircle size={12} /> },
  test: { ad: "Test", renk: "#CBD5E1", zemin: "rgba(148,163,184,0.12)", ikon: <FlaskConical size={12} /> },
};

export default function YedeklerPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [liste, setListe] = useState<YedekSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [indiriliyor, setIndiriliyor] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !isSuperAdmin) router.replace("/panel"); }, [authLoading, isSuperAdmin, router]);

  const getir = useCallback(async () => {
    try { setListe(await yedekListesi()); setHata(null); }
    catch (e) { setHata(`Yedek listesi okunamadı: ${e instanceof Error ? e.message : String(e)}`); }
    setYukleniyor(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) getir(); }, [isSuperAdmin, getir]);

  const indir = async (y: YedekSatiri) => {
    setIndiriliyor(y.id);
    try {
      const { url, dosya } = await yedekIndirmeLinki(y.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = dosya;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`${dosya} indiriliyor.`, "success");
      getir();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
    setIndiriliyor(null);
  };

  if (authLoading || (isSuperAdmin && yukleniyor)) return <AppShell><SayfaYukleniyor /></AppShell>;
  if (!isSuperAdmin) return <AppShell><div /></AppShell>;

  const son = liste.find((y) => y.durum !== "test");
  const th = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide";

  return (
    <AppShell>
      <SayfaBasligi ikon={<DatabaseBackup size={20} />} baslik="Veri Yedekleri"
        aciklama="Her gece 03:00'te alınan tam veri yedeği. Güvenlik için mail eki olarak gönderilmez; buradan indirilir (yalnız yetkili yöneticiler, her indirme kaydedilir)."
        sag={<button type="button" onClick={() => { setYukleniyor(true); getir(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}><RefreshCw size={13} /> Yenile</button>} />
      {hata && <p className="mb-3 text-sm text-red-400" role="alert">{hata}</p>}

      {son && (
        <div className="mb-3 rounded-xl border p-3 flex flex-wrap items-center gap-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, borderLeft: `4px solid ${SEFTALI}` }} data-testid="son-yedek">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Son gece yedeği</p>
            <p className="text-sm font-semibold text-white">{tarihSaat(son.created_at)} · {DURUM[son.durum].ad}</p>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>{sayi(son.toplam_kayit)} kayıt · {sayi(son.tablo_sayisi)} tablo · {mbYaz(son.dosya_bayt)}</p>
          </div>
          <button type="button" onClick={() => indir(son)} disabled={!son.dosya_var || !!indiriliyor} data-testid="son-indir"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-transform active:scale-95" style={{ backgroundColor: ACCENT }}
            title={son.dosya_var ? "Zip dosyasını indir" : "Bu gecenin dosyası depoda yok"}>
            {indiriliyor === son.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Yedeği indir
          </button>
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <table className="w-full text-sm" data-testid="yedek-tablosu">
          <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
            <tr>
              <th className={th}>Tarih</th><th className={th}>Durum</th><th className={`${th} text-right`}>Kayıt</th>
              <th className={`${th} text-right`}>Tablo</th><th className={`${th} text-right`}>Dosya</th><th className={th}>İndirme</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-xs" style={{ color: TEXT_MUTED }}>Henüz yedek kaydı yok.</td></tr>}
            {liste.map((y) => {
              const d = DURUM[y.durum];
              return (
                <tr key={y.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{tarihSaat(y.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: d.renk, backgroundColor: d.zemin }} title={y.hata || undefined}>{d.ikon}{d.ad}{y.uyari_sayisi ? ` · ${y.uyari_sayisi} uyarı` : ""}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#CBD5E1" }}>{sayi(y.toplam_kayit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#CBD5E1" }}>{sayi(y.tablo_sayisi)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: y.dosya_var ? "#CBD5E1" : TEXT_MUTED }}>{y.dosya_var ? mbYaz(y.dosya_bayt) : "depoda yok"}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{y.indirme_sayisi ? `${y.indirme_sayisi} kez · son ${tarihSaat(y.son_indirme!)}` : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {y.dosya_var && (
                      <button type="button" onClick={() => indir(y)} disabled={!!indiriliyor} data-testid="yedek-indir"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: "#E6F4EE" }}>
                        {indiriliyor === y.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} İndir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED }}>
        Zip dosyaları 30 gün saklanır; kayıtlar kalır. PDF belgeleri yedekte yer almaz (dosya deposunda durur, yedekte tam listesi vardır). Geri yükleme: docs/felaket-kurtarma.md.
      </p>
    </AppShell>
  );
}
