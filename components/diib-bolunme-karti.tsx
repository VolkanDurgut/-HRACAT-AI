"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Split, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { sayiOku } from "@/lib/sayi-oku";
import { bolunmeOnerisi, diibBul, diibMiktari, diibOzetleri, diibSatirlari, kgOku, kgYaz, siraliBekleyenler, type BekleyenSira, type DiibBelgesi } from "@/lib/diib/hesap";
import { DIIB_BOLUNME_OLAYI, bekleyenSiraGetir, diibVerisiGetir, type DiibVerisi } from "@/lib/diib/veri";
import type { Dosya } from "@/lib/supabase";

/**
 * Dosyada DIIB durumu ve fatura bolunmesi (04.11.2026). Yuklemenin kg'i DIIB kalanini asarsa
 * "2 fatura" onerir (kalan kendi DIIB'ine, fazlasi kullanim sirasindaki sonraki DIIB'e); kullanici
 * kg'lari duzeltip kaydeder -> fatura talimatinda iki fatura bolumu + DIIB takibinde iki satir.
 * Yalniz "ihracatlar" yetkisi olana gorunur (RLS); DIIB kaydi yoksa gizli.
 */
type Parca = { diibId: string; kg: string; faturaNo: string };

export default function DiibBolunmeKarti({ dosya }: { dosya: Dosya }) {
  const { companyId, user, yetkiler } = useAuth();
  const { showToast } = useToast();
  const [veri, setVeri] = useState<DiibVerisi | null>(null);
  const [sira, setSira] = useState<Record<string, BekleyenSira>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [taslak, setTaslak] = useState<Parca[] | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const yetkili = !!yetkiler.sayfa_yetkileri.ihracatlar;

  const getir = useCallback(async () => {
    if (!companyId || !yetkili) { setYukleniyor(false); return; }
    const v = await diibVerisiGetir(companyId);
    // Faturasi kesilmemis dosyalarin sirasi (beyan cut-off / ETD): ayni DIIB'i paylasan yuklemeler sirayla dusulur
    const bekleyenIdler = v ? v.dosyalar.filter((d) => !d.fatura_no && d.durum !== "Kapalı" && d.durum !== "Kapali").map((d) => d.id) : [];
    setSira(v ? await bekleyenSiraGetir(companyId, bekleyenIdler) : {});
    setVeri(v);
    setYukleniyor(false);
  }, [companyId, yetkili]);
  useEffect(() => { getir(); }, [getir, dosya.fatura_no, dosya.diib_no]);

  const hesap = useMemo(() => {
    if (!veri || veri.belgeler.length === 0) return null;
    const sonuc = diibSatirlari(veri.belgeler, veri.kayitlar, veri.dosyalar, veri.bolunmeler);
    const ozetler = diibOzetleri(veri.belgeler, sonuc);
    // DIIB Takibi ile AYNI miktar: konteyner netleri tamsa yuklenen, degilse proforma
    const buDosya = veri.dosyalar.find((d) => d.id === dosya.id);
    const miktar = diibMiktari({ ...dosya, yuklenenKg: buDosya?.yuklenenKg ?? null });
    const kg = miktar.kg;
    const kendi = diibBul(dosya.diib_no, veri.belgeler);
    // Bu dosyanin zaten sayilmis payi (faturasi kesilmisse) kalandan dusulmez
    const kendiPayi: Record<string, number> = {};
    sonuc.satirlar.filter((s) => s.dosyaId === dosya.id).forEach((s) => { kendiPayi[s.diibId] = (kendiPayi[s.diibId] || 0) + s.miktarKg; });
    // Faturasi kesilmemis dosya: SIRALI dagilim (DIIB Takibi sayfasindaki tabloyla AYNI sonuc)
    const siraliBu = !dosya.fatura_no ? siraliBekleyenler(sonuc, ozetler, veri.bolunmeler, sira).find((x) => x.dosya.id === dosya.id) : undefined;
    const oneri = siraliBu?.oneri ?? bolunmeOnerisi(kg, kendi, ozetler, kendiPayi);
    const oncekiler = siraliBu ? siraliBu.oncekiler : [];
    const kalanOnce = siraliBu ? siraliBu.kalanOnce : null;
    const kayitli = veri.bolunmeler.filter((b) => b.dosya_id === dosya.id).sort((a, b) => a.sira - b.sira);
    const kalan = (b: DiibBelgesi | null) => b ? (ozetler.find((o) => o.belge.id === b.id)?.kalanKg ?? 0) + (kendiPayi[b.id] || 0) : 0;
    // Ayni DIIB'e yazilmis, faturasi henuz kesilmemis DIGER acik yuklemeler: hangisi once faturalanirsa kalan ondan duser
    const digerBekleyen = kendi ? sonuc.bekleyen.filter((x) => x.diib?.id === kendi.id && x.dosya.id !== dosya.id) : [];
    return { kg, kendi, oneri, kayitli, kalan, digerBekleyen, oncekiler, kalanOnce, miktar, belgeler: veri.belgeler };
  }, [veri, dosya, sira]);

  if (!yetkili || yukleniyor || !hesap) return null;
  const belgeNo = (id: string) => hesap.belgeler.find((b) => b.id === id)?.belge_no ?? "-";

  const taslakBaslat = () => {
    if (hesap.oneri.tur !== "bolunmeli") return;
    setTaslak(hesap.oneri.parcalar.map((p, i) => ({ diibId: p.diib.id, kg: String(p.kg), faturaNo: i === 0 ? (dosya.fatura_no || "") : "" })));
  };
  // Elle bolme (kalan yetse de): ornegin muhasebe/gumruk DIIB kayitlari sistemden farkliysa. 1. fatura kendi DIIB'i, 2. fatura sonraki aktif DIIB.
  const elleTaslakBaslat = () => {
    if (!hesap.kendi) return;
    const kendiId = hesap.kendi.id;
    const sonraki = [...hesap.belgeler].filter((b) => b.id !== kendiId && b.durum === "aktif").sort((a, b) => a.kullanim_sirasi - b.kullanim_sirasi)[0]
      ?? hesap.belgeler.find((b) => b.id !== kendiId);
    if (!sonraki) { showToast("Bölmek için DİİB Takibi'nde ikinci bir DİİB olmalı.", "error"); return; }
    setTaslak([{ diibId: kendiId, kg: "", faturaNo: dosya.fatura_no || "" }, { diibId: sonraki.id, kg: "", faturaNo: "" }]);
  };
  const kaydet = async () => {
    if (!taslak || !companyId) return;
    const kgler = taslak.map((p) => kgOku(p.kg));
    if (kgler.some((k) => !(k > 0))) { showToast("Her faturanın miktarını (kg) girin.", "error"); return; }
    if (new Set(taslak.map((p) => p.diibId)).size !== taslak.length) { showToast("Her fatura farklı bir DİİB'e yazılmalı.", "error"); return; }
    const toplam = Math.round(kgler.reduce((a, b) => a + b, 0) * 100) / 100;
    if (Math.abs(toplam - hesap.kg) > 0.01) { showToast(`Faturaların toplamı (${kgYaz(toplam)} kg) yüklemeye (${kgYaz(hesap.kg)} kg) eşit olmalı.`, "error"); return; }
    setKaydediliyor(true);
    const r = await supabase.from("diib_dosya_bolunmeleri").insert(taslak.map((p, i) => ({
      company_id: companyId, dosya_id: dosya.id, diib_id: p.diibId, sira: i + 1, miktar_kg: kgler[i],
      fatura_no: p.faturaNo.replace(/\s+/g, "").toUpperCase() || null, olusturan_email: user?.email?.toLowerCase() ?? null,
    }))).select("id");
    setKaydediliyor(false);
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { showToast(`Bölünme kaydedilemedi: ${sorun}`, "error"); return; }
    showToast(`${dosya.dosya_no}: ${taslak.length} faturaya bölünme kaydedildi; fatura talimatına yazılır.`, "success");
    setTaslak(null);
    window.dispatchEvent(new Event(DIIB_BOLUNME_OLAYI));
    getir();
  };
  const faturaNoKaydet = async (id: string, deger: string) => {
    const r = await supabase.from("diib_dosya_bolunmeleri").update({ fatura_no: deger.replace(/\s+/g, "").toUpperCase() || null }).eq("id", id).eq("company_id", companyId!).select("id");
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { showToast(`Fatura no kaydedilemedi: ${/duplicate|23505/.test(sorun) ? "aynı numara başka kayıtta var" : sorun}`, "error"); return; }
    showToast("Fatura no kaydedildi.", "success");
    window.dispatchEvent(new Event(DIIB_BOLUNME_OLAYI));
    getir();
  };
  const kaldir = async () => {
    setKaydediliyor(true);
    const r = await supabase.from("diib_dosya_bolunmeleri").delete().eq("dosya_id", dosya.id).eq("company_id", companyId!).select("id");
    setKaydediliyor(false);
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { showToast(`Kaldırılamadı: ${sorun}`, "error"); return; }
    setKaldirOnay(false);
    showToast("Bölünme kaldırıldı; yükleme tek fatura sayılır.", "success");
    window.dispatchEvent(new Event(DIIB_BOLUNME_OLAYI));
    getir();
  };

  const { kg, kendi, oneri, kayitli, digerBekleyen, oncekiler } = hesap;
  const taslakFormu = taslak ? (
            <div className="mt-2 space-y-2">
              {taslak.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white w-14">{i + 1}. fatura</span>
                  <select aria-label={`${i + 1}. fatura DİİB`} value={p.diibId} onChange={(e) => setTaslak(taslak.map((x, j) => j === i ? { ...x, diibId: e.target.value } : x))} className="px-2 py-1 border rounded-md text-xs text-white font-mono" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    {hesap.belgeler.map((b) => <option key={b.id} value={b.id}>{b.belge_no}</option>)}
                  </select>
                  <input aria-label={`${i + 1}. fatura kg`} inputMode="decimal" value={p.kg} onChange={(e) => {
                    const v = e.target.value;
                    // Iki parcada birini yazinca digeri yuklemenin kalanina tamamlanir (elle duzeltilebilir)
                    const diger = taslak.length === 2 && kgOku(v) > 0 && kgOku(v) < kg ? kgYaz(Math.round((kg - kgOku(v)) * 100) / 100) : null;
                    setTaslak(taslak.map((x, j) => j === i ? { ...x, kg: v } : diger !== null && taslak.length === 2 ? { ...x, kg: diger } : x));
                  }} className="w-28 px-2 py-1 border rounded-md text-xs text-white text-right" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} />
                  <span style={{ color: TEXT_MUTED }}>kg</span>
                </div>
              ))}
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Toplam {kgYaz(taslak.reduce((t, p) => t + kgOku(p.kg), 0))} / {kgYaz(kg)} kg. Kaydedince fatura talimatında ayrı faturalar yazılır, DİİB takibinde iki satır olur.</p>
              <div className="flex gap-2">
                <button onClick={kaydet} disabled={kaydediliyor} data-testid="bolunme-kaydet" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                  {kaydediliyor && <Loader2 size={12} className="animate-spin" />} Bölünmeyi kaydet
                </button>
                <button onClick={() => setTaslak(null)} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
              </div>
            </div>
  ) : null;
  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="diib-karti">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ClipboardCheck size={16} style={{ color: ACCENT }} />
        <p className="text-sm font-semibold text-white">DİİB ve fatura</p>
        <Link href="/diib" className="ml-auto text-xs hover:text-white" style={{ color: TEXT_MUTED }}>DİİB Takibi →</Link>
      </div>
      <p className="mt-1.5 text-xs" style={{ color: TEXT_MUTED }}>
        Yükleme <b className="text-white">{kgYaz(kg)} kg</b>
        {kendi ? <> · DİİB <b className="text-white font-mono">{kendi.belge_no}</b> · kalan <b className="text-white">{kgYaz(Math.max(0, hesap.kalan(kendi)))} kg</b></> : null}
      </p>
      {Math.abs(hesap.miktar.kg - hesap.miktar.proformaKg) > 0.5 && (
        <p className="mt-2 text-[11px] leading-relaxed flex gap-1.5" style={{ color: TEXT_MUTED }} data-testid="diib-yuklenen">
          <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-300" />
          <span>DİİB, konteynerlerin net ağırlığına göre <b className="text-white">{kgYaz(hesap.miktar.kg)} kg</b> ile hesaplandı (proforma {kgYaz(hesap.miktar.proformaKg)} kg). Fatura talimatındaki ürün miktarının yüklenenle aynı olduğunu kontrol edin.</span>
        </p>
      )}
      {kendi && kayitli.length < 2 && !dosya.fatura_no && digerBekleyen.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300 flex gap-1.5" data-testid="diib-diger-bekleyen">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            Bu DİİB&apos;i faturası kesilmemiş başka yükleme de kullanıyor: {digerBekleyen.map((x) => `${x.dosya.dosya_no} (${kgYaz(x.kg)} kg)`).join(", ")}.{" "}
            {oncekiler.length > 0
              ? <>Yükleme sırasına göre (talimat cut-off / ETD) önce <b>{oncekiler.join(", ")}</b> düşüldü; aşağıdaki öneri bu yüklemeden önce kalan <b>{kgYaz(Math.max(0, hesap.kalanOnce ?? 0))} kg</b> ile hesaplandı.</>
              : <>Yükleme sırasına göre (talimat cut-off / ETD) bu yükleme önce; ötekiler bundan sonra kalandan düşer.</>}
            {" "}Sıra değişirse öneri de değişir.
          </span>
        </p>
      )}

      {kayitli.length >= 2 ? (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "rgba(56,189,248,0.35)", backgroundColor: "rgba(56,189,248,0.06)" }} data-testid="bolunme-kayitli">
          <p className="text-xs font-semibold text-sky-300 flex items-center gap-1.5"><Split size={13} /> Bu yükleme {kayitli.length} faturaya bölündü</p>
          <ul className="mt-2 space-y-2">
            {kayitli.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-white">{p.sira}. fatura</span>
                <span style={{ color: TEXT_MUTED }}>· <span className="font-mono text-white">{belgeNo(p.diib_id)}</span> · {kgYaz(sayiOku(p.miktar_kg))} kg</span>
                <input defaultValue={p.fatura_no || (p.sira === 1 ? dosya.fatura_no || "" : "")} placeholder="Fatura no (kesilince)" aria-label={`${p.sira}. fatura no`}
                  onBlur={(e) => { if ((e.target.value.replace(/\s+/g, "").toUpperCase() || null) !== (p.fatura_no || null)) faturaNoKaydet(p.id, e.target.value); }}
                  className="ml-auto w-48 px-2 py-1 border rounded-md text-xs text-white font-mono" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} />
              </li>
            ))}
          </ul>
          <button onClick={() => setKaldirOnay(true)} className="mt-2 inline-flex items-center gap-1 text-[11px] hover:text-red-400" style={{ color: TEXT_MUTED }}><Trash2 size={11} /> Bölünmeyi kaldır</button>
        </div>
      ) : oneri.tur === "tek" ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5" data-testid="bolunme-tek"><CheckCircle2 size={13} /> Tek fatura yeterli.</p>
          {!taslak ? (
            <button onClick={elleTaslakBaslat} data-testid="bolunme-elle" className="mt-2 inline-flex items-center gap-1 text-[11px] hover:text-white" style={{ color: TEXT_MUTED }}>
              <Split size={11} /> Yine de iki faturaya böl (elle)
            </button>
          ) : (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>{taslakFormu}</div>
          )}
        </div>
      ) : oneri.tur === "diib_yok" ? (
        <p className="mt-3 text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> {"Dosyanın DİİB alanı tanınmadı (Ek Bilgiler > DİİB No'yu kontrol edin)."}</p>
      ) : oneri.parcalar.length === 1 && oneri.parcalar[0].diib.id !== kendi?.id && oneri.eksikKg <= 0 ? (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "rgba(251,191,36,0.4)", backgroundColor: "rgba(245,158,11,0.07)" }} data-testid="bolunme-oneri">
          <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5" data-testid="diib-degismeli"><AlertTriangle size={13} /> {kendi?.belge_no} bu yüklemeye kalmıyor: tamamı (tek fatura) <span className="font-mono">{oneri.parcalar[0].diib.belge_no}</span> DİİB&apos;ine yazılmalı.</p>
          <p className="mt-1 text-[11px]" style={{ color: TEXT_MUTED }}>Bölünme gerekmez. Faturadan önce Ek Bilgiler &gt; DİİB No alanını <b className="text-white font-mono">{oneri.parcalar[0].diib.belge_tarihi ? `${oneri.parcalar[0].diib.belge_tarihi.split("-").reverse().join(".")} TARİH ` : ""}{oneri.parcalar[0].diib.belge_no}</b> olarak değiştirin (evraklarda bu yazar).</p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "rgba(251,191,36,0.4)", backgroundColor: "rgba(245,158,11,0.07)" }} data-testid="bolunme-oneri">
          <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5"><Split size={13} /> DİİB kalanı yetmiyor: yükleme {oneri.parcalar.length} faturaya bölünmeli</p>
          {!taslak ? (
            <>
              <ul className="mt-2 text-xs space-y-0.5">
                {oneri.parcalar.map((p, i) => <li key={p.diib.id} className="text-white">{i + 1}. fatura: <b>{kgYaz(p.kg)} kg</b> · <span className="font-mono">{p.diib.belge_no}</span></li>)}
              </ul>
              {oneri.eksikKg > 0 && <p className="mt-1 text-xs text-red-400">{kgYaz(oneri.eksikKg)} kg için kalanı olan DİİB yok; DİİB Takibi&apos;nden yeni DİİB ekleyin.</p>}
              <button onClick={taslakBaslat} disabled={oneri.eksikKg > 0} data-testid="bolunme-baslat" className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                <Split size={12} /> Bölünmeyi hazırla
              </button>
            </>
          ) : taslakFormu}
        </div>
      )}
      <ConfirmDialog open={kaldirOnay} onOpenChange={(a) => { if (!a && !kaydediliyor) setKaldirOnay(false); }} title="Fatura bölünmesi kaldırılsın mı?"
        description="Yükleme yeniden tek fatura sayılır; fatura talimatındaki bölünme bölümü çıkar. Faturalar kesildiyse önce muhasebeyle kontrol edin."
        confirmLabel="Evet, kaldır" cancelLabel="Vazgeç" destructive onConfirm={kaldir} loading={kaydediliyor} loadingLabel="Kaldırılıyor..." />
    </section>
  );
}
