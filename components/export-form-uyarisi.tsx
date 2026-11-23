"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useGecisliYonlendirme } from "@/components/sayfa-gecisi";
import { exportBekleyenleriOku, type ExportBekleyen } from "@/lib/siparis-formu";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Uygulama ici EXPORT GIRISI UYARISI (23.11.2026). Kullanici: "Her gun Harun Bey'e spek ve girilmesi gereken urun gorselleri
 * mail olarak gider. Harun Bey'in ekraninda yaptigi giris ID var; bildirim olarak da gozukebilir."
 * Yalniz Ayarlar > Rapor Alicilari 'siparis_formu_spek' alicisi olan kullanicida (kurulum: export@) gorunur; liste edge
 * siparis-formu {"islem": "export_bekleyen"} (sabah maili ile AYNI liste: _shared/siparis-formu-spek.ts).
 * Masaustu bildirimi (izin verildiyse) gunde bir kez; liste 10 dakikada bir ve sayfa degisiminde yenilenir.
 * Siparisler sayfasinda bant gizlenir (Siparis Formlari sekmesi orada; sayfadan cikinca liste yenilenir).
 */
const YENILE_MS = 10 * 60_000;
const BILDIRIM_ANAHTARI = "unex-export-form-bildirim";
const trBugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "-");

export default function ExportFormUyarisi() {
  const { user } = useAuth();
  const pathname = usePathname();
  const gecisliGit = useGecisliYonlendirme();
  const [veri, setVeri] = useState<ExportBekleyen>({ hedef: false, satirlar: [] });
  const [acik, setAcik] = useState(false);

  const yukle = useCallback(async () => {
    if (!user) return;
    setVeri(await exportBekleyenleriOku());
  }, [user]);

  useEffect(() => { yukle(); }, [yukle, pathname]);
  useEffect(() => {
    const z = window.setInterval(yukle, YENILE_MS);
    return () => window.clearInterval(z);
  }, [yukle]);

  const sayi = veri.satirlar.length;
  const acil = veri.satirlar.filter((s) => s.acil).length;

  // Masaustu bildirimi: gunde bir kez (izin varsa; yoksa yalniz bant)
  useEffect(() => {
    if (!veri.hedef || !sayi || typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const bugun = trBugun();
      if (window.localStorage.getItem(BILDIRIM_ANAHTARI) === bugun) return;
      if (Notification.permission !== "granted") return;
      new Notification("UNEX-AI · Sipariş bildirim formu", {
        body: `${sayi} yüklemede ürün speki / çuval görseli bekleniyor${acil ? ` (${acil} acil)` : ""}.`,
      });
      window.localStorage.setItem(BILDIRIM_ANAHTARI, bugun);
    } catch { /* bildirim / depolama kullanilamiyor: bant yeterli */ }
  }, [veri.hedef, sayi, acil]);

  if (!veri.hedef || !sayi || pathname === "/siparisler") return null;
  const renk = acil ? "#F87171" : "#FBBF24";

  return (
    <section className="mb-4 rounded-xl border overflow-hidden animate-fade-in" style={{ backgroundColor: CARD_BG, borderColor: acil ? "rgba(248,113,113,0.35)" : "rgba(251,191,36,0.35)" }}
      aria-label="Sipariş bildirim formu girişleri" data-testid="export-form-uyarisi">
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: `linear-gradient(90deg, ${acil ? "rgba(248,113,113,0.10)" : "rgba(251,191,36,0.10)"}, transparent 60%)` }}>
        <span className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ backgroundColor: acil ? "rgba(248,113,113,0.14)" : "rgba(251,191,36,0.14)" }}>
          <FileSpreadsheet size={14} style={{ color: renk }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Sipariş bildirim formu · ürün speki ve çuval görseli bekleniyor</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            {sayi} yükleme{acil ? <span style={{ color: "#F87171" }}> · {acil} acil (boş ekipmana 2 gün ve daha az)</span> : null} · girip kaydettikten sonra Üretime gönder
          </p>
        </div>
        <button type="button" onClick={() => setAcik((x) => !x)} className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/5" style={{ color: TEXT_MUTED }} title={acik ? "Daralt" : "Listeyi göster"}>
          {acik ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        <button type="button" onClick={() => gecisliGit("/siparisler?sekme=formlar")}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap" style={{ backgroundColor: ACCENT }}>
          Sipariş Formları <ArrowRight size={12} />
        </button>
      </div>
      {acik && (
        <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
          {veri.satirlar.map((s) => (
            <li key={s.anahtar} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs" style={{ borderColor: CARD_BORDER }}>
              <span className="font-semibold text-white min-w-0 flex-1 truncate">{s.acil ? <span style={{ color: "#F87171" }}>ACİL · </span> : null}{s.firma}
                <span className="font-normal" style={{ color: TEXT_MUTED }}> · {s.liman} · {s.adet}</span></span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: s.acil ? "#F87171" : TEXT_MUTED }}>Ekipman {trTarih(s.ekipman)}</span>
              <span className="whitespace-nowrap text-amber-300">{s.eksikler.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
