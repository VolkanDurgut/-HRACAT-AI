"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Cpu, ChevronDown, ChevronUp, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * Kantar Paneli > Otomatik DBA (20.10.2026).
 * Kantar bilgisayarindaki gorev Solas'in DBA PDF'lerini edge function
 * "dba-otomatik"e gonderir; eslesenler konteynere kendiliginden yuklenir ve
 * zaten "Tamamlanan DBA'lar" listesine duser. Bu bolum yalnizca:
 *   - gorevin durumunu (canli / deneme modu, son sinyal, bugunun sayisi),
 *   - otomatik YUKLENEMEYEN belgeleri (konteyner bekleniyor / esleşmedi /
 *     cakisma / okunamadi) gosterir; personel bunlari mevcut "DBA" dugmesiyle
 *     elle yukler ya da listeden kaldirir.
 * Veri: kantar_dba_otomasyon_durumu() / dba_otomatik_yoksay() (migration
 * 20261020100000). Cihaz tanimli degilse ya da fonksiyon yoksa HICBIR SEY
 * gostermez (ozellik kurulmadan yayina alinabilir).
 */

type Cihaz = { id: string; ad: string; canli: boolean; son_sinyal: string | null; son_surum: string | null };
type Sorun = {
  id: string; dba_belge_no: string; dosya_adi: string; durum: "beklemede" | "eslesmedi" | "cakisma" | "okunamadi";
  konteyner_no: string | null; dosya_no: string | null; mesaj: string | null; ilk_gorulme: string; tartim: string | null; plaka: string | null;
};
type Durum = { cihazlar: Cihaz[]; bugun: { yuklendi: number; eslesti: number; zaten_yuklu: number }; sorunlar: Sorun[] };

const DURUM_ETIKETI: Record<Sorun["durum"], { metin: string; sinif: string; ipucu: string }> = {
  beklemede: { metin: "Konteyner bekleniyor", sinif: "bg-amber-500/10 text-amber-400", ipucu: "Konteyner henüz açık bir dosyaya eklenmemiş. Konteyner eklendikten sonra 1–2 dakika içinde belge otomatik yüklenir; elle yüklemeye gerek yok (72 saat beklenir)." },
  eslesmedi: { metin: "Eşleşmedi", sinif: "bg-red-500/10 text-red-400", ipucu: "Belge hiçbir açık dosyadaki konteynerle eşleşmedi. Gerekirse DBA düğmesiyle elle yükleyin ya da listeden kaldırın." },
  cakisma: { metin: "Çakışma", sinif: "bg-red-500/10 text-red-400", ipucu: "Otomatik yükleme güvenli değil (konteynerde başka DBA var, konteyner birden fazla dosyada ya da belge başka konteynerde). Kontrol edip elle yükleyin." },
  okunamadi: { metin: "Okunamadı", sinif: "bg-red-500/10 text-red-400", ipucu: "PDF okunamadı veya doğrulanamadı. DBA düğmesiyle elle yükleyin." },
};

/** "1 dk önce" / "2 sa önce" / "19.10 18:42" */
function gecenSure(iso: string | null, simdi: number): string {
  if (!iso) return "hiç";
  const fark = Math.max(0, simdi - new Date(iso).getTime());
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 24 * 60) return `${Math.floor(dk / 60)} sa önce`;
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function KantarDbaOtomasyon({ yenileTetik = 0 }: { yenileTetik?: number }) {
  const { showToast } = useToast();
  const [veri, setVeri] = useState<Durum | null>(null);
  const [acik, setAcik] = useState(true);
  const [simdi, setSimdi] = useState(() => Date.now());
  const [kaldirilacak, setKaldirilacak] = useState<Sorun | null>(null);
  const [kaldiriliyor, setKaldiriliyor] = useState(false);
  const istekSira = useRef(0);

  const getir = useCallback(async () => {
    const sira = ++istekSira.current;
    const { data, error } = await supabase.rpc("kantar_dba_otomasyon_durumu");
    if (sira !== istekSira.current) return;
    // Hata (ag kesintisi / ozellik kurulmamis): eski veri kalir, yeni bir sey gosterilmez
    if (error || !data) return;
    // Beklenmeyen bicim tum Kantar Paneli'ni cokertmesin: dogrulanmayan yanit yok sayilir
    const d = data as Partial<Durum>;
    if (!Array.isArray(d.cihazlar) || !Array.isArray(d.sorunlar) || !d.bugun || typeof d.bugun !== "object") return;
    setVeri(d as Durum);
    setSimdi(Date.now());
  }, []);

  useEffect(() => { getir(); }, [getir, yenileTetik]);
  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") getir(); };
    const z = window.setInterval(yenile, 60_000);
    document.addEventListener("visibilitychange", yenile);
    window.addEventListener("online", yenile);
    return () => { window.clearInterval(z); document.removeEventListener("visibilitychange", yenile); window.removeEventListener("online", yenile); };
  }, [getir]);

  const kaldir = async () => {
    const hedef = kaldirilacak;
    if (!hedef) return;
    setKaldiriliyor(true);
    const { error } = await supabase.rpc("dba_otomatik_yoksay", { p_kayit_id: hedef.id });
    setKaldiriliyor(false);
    if (error) {
      showToast(`Kaldırılamadı: ${error.message}`, "error");
      // Onay penceresi tiklaninca kapanir (ortak ConfirmDialog); hata varsa yeniden acilir
      setKaldirilacak(hedef);
      return;
    }
    setKaldirilacak(null);
    showToast("Belge listeden kaldırıldı.", "success");
    getir();
  };

  if (!veri || veri.cihazlar.length === 0) return null;

  const sorunlar = veri.sorunlar;
  const tumuCanli = veri.cihazlar.every((c) => c.canli);

  return (
    <div className="shrink-0 rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="dba-otomasyon">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: ACCENT }}>
          <Cpu size={14} />
        </span>
        <div className="min-w-0 mr-auto">
          <p className="text-xs font-bold text-white leading-tight">Otomatik DBA</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            Bugün: {tumuCanli
              ? <><span className="font-semibold text-white">{veri.bugun.yuklendi}</span> belge otomatik yüklendi</>
              : <><span className="font-semibold text-white">{veri.bugun.eslesti}</span> belge eşleşti (deneme, yazılmadı)</>}
            {veri.bugun.zaten_yuklu > 0 && <> · {veri.bugun.zaten_yuklu} zaten yüklüydü</>}
          </p>
        </div>
        {veri.cihazlar.map((c) => {
          const dk = c.son_sinyal ? (simdi - new Date(c.son_sinyal).getTime()) / 60000 : Infinity;
          const sinyal = dk < 5
            ? { sinif: "bg-emerald-500/10 text-emerald-400", nokta: "bg-emerald-500", metin: `Bağlı · ${gecenSure(c.son_sinyal, simdi)}` }
            : dk < 30
              ? { sinif: "bg-amber-500/10 text-amber-400", nokta: "bg-amber-500", metin: `Son sinyal ${gecenSure(c.son_sinyal, simdi)}` }
              : { sinif: "bg-white/5", nokta: "bg-slate-500", metin: `Sinyal yok · son ${gecenSure(c.son_sinyal, simdi)}` };
          return (
            <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${c.canli ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"}`}
                title={c.canli ? "Eşleşen belgeler konteynere otomatik yüklenir." : "Deneme modu: belgeler okunur ve eşleştirilir ama konteynere yazılmaz. DBA'ları her zamanki gibi elle yükleyin."}>
                {c.canli ? "Canlı" : "Deneme modu"}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap ${sinyal.sinif}`}
                style={sinyal.nokta === "bg-slate-500" ? { color: TEXT_MUTED } : undefined}
                title={`${c.ad}${c.son_surum ? ` · görev sürümü ${c.son_surum}` : ""}. Kantar bilgisayarı kapalıysa sinyal gelmez; açılınca aradaki belgeler otomatik işlenir.`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sinyal.nokta}`} />{sinyal.metin}
              </span>
            </div>
          );
        })}
        {sorunlar.length > 0 && (
          <button type="button" onClick={() => setAcik((a) => !a)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
            aria-expanded={acik}>
            {sorunlar.length} belge kontrol bekliyor {acik ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {sorunlar.length > 0 && acik && (
        <div className="border-t overflow-x-auto" style={{ borderColor: CARD_BORDER }}>
          <table className="w-full text-left border-collapse">
            <thead style={{ backgroundColor: ROW_HEADER_BG }}>
              <tr>
                {["Belge / Tartım", "Konteyner", "Durum", "Açıklama", ""].map((b, i) => (
                  <th key={i} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorunlar.map((s) => {
                const e = DURUM_ETIKETI[s.durum];
                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-xs font-mono font-semibold text-white">{s.dba_belge_no}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{s.tartim ? s.tartim.slice(0, 16) : gecenSure(s.ilk_gorulme, simdi)}</div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-xs font-mono font-semibold text-white">{s.konteyner_no || "—"}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{[s.plaka, s.dosya_no].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${e.sinif}`} title={e.ipucu}>{e.metin}</span>
                    </td>
                    <td className="px-4 py-2 text-[11px] min-w-[220px] max-w-[420px]" style={{ color: TEXT_MUTED }} title={`${s.mesaj || ""}\nDosya: ${s.dosya_adi}`}>
                      <span className="line-clamp-2">{s.mesaj || "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => setKaldirilacak(s)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:text-white hover:bg-white/5"
                        style={{ color: TEXT_MUTED }} title="Listeden kaldır (bu belge artık otomatik denenmez)" aria-label={`${s.dba_belge_no} belgesini listeden kaldır`}>
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!kaldirilacak}
        onOpenChange={(o) => { if (!o) setKaldirilacak(null); }}
        title="Belge listeden kaldırılsın mı?"
        description={kaldirilacak
          ? `${kaldirilacak.dba_belge_no} numaralı DBA bu listeden kaldırılacak ve artık otomatik denenmeyecek. Konteynerlere ve belgeye hiçbir şey olmaz; gerekirse DBA düğmesiyle elle yükleyebilirsiniz.`
          : ""}
        confirmLabel="Kaldır"
        cancelLabel="Vazgeç"
        onConfirm={kaldir}
        loading={kaldiriliyor}
        loadingLabel="Kaldırılıyor..."
      />
    </div>
  );
}
