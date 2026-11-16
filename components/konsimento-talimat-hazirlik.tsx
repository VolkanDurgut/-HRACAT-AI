"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Download, Pencil, Loader2, AlertTriangle, Globe2, History, Plus, X, Save, FileCog } from "lucide-react";
import { supabase, yazmaHatasi, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG, CARD_BG } from "@/lib/theme";
import { talimatModeli, talimatAyari, dosyaNotifyListesi, BL_TIPLERI, VARSAYILAN_MAL_EN, type TalimatAyari } from "@/lib/konsimento/talimat";
import { tarafGecmisiGetir, type TarafGecmisi } from "@/lib/konsimento/taraf-gecmisi";
import { KONSIMENTO_SABLON_ADI, type KonsimentoSablonu } from "@/supabase/functions/_shared/konsimento-sablon";

/**
 * KONSIMENTO TALIMATI HAZIRLAMA (06.11.2026). Kullanici: "Butun konteynerler alindiginda konsimento
 * talimati otomatik olarak olusturulacak ... Talimat Gor ile acilabilecek ve indirilebilecek (ic
 * piyasadaki irsaliye gibi)." Talimat sistem verisinden UCRETSIZ uretilir (lib/konsimento/talimat.ts);
 * sablon rezervasyondaki acenteden (Akkon / standart; MSC = web sitesi). Sistemde olmayan taraflar
 * (consignee, notify) ve tercihler (ON BEHALF OF, mal tanimi, BL tipi) burada; yeni dosyada ayni
 * musterinin bir onceki sevkiyatindan gelir, gecmis secenekler musteri adi altinda listelenir.
 */
type Props = {
  dosya: Dosya; rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[];
  companyId: string; hazir: boolean; onRefresh: () => void;
};

export function konsimentoGumrukMusaviri(companyId: string): Promise<string | null> {
  return Promise.resolve(supabase.from("companies").select("konsimento_gumruk_musaviri").eq("id", companyId).maybeSingle())
    .then((r) => ((r.data as { konsimento_gumruk_musaviri?: string | null } | null)?.konsimento_gumruk_musaviri ?? null), () => null);
}

const kaynakEtiketi = (hamVeri: Record<string, unknown> | null): string | null => {
  const k = (hamVeri as { consignee_kaynak?: string; taraf_kaynagi?: string } | null);
  if (k?.consignee_kaynak === "onceki_sevkiyat") return `Önceki sevkiyattan (${k.taraf_kaynagi || "-"})`;
  if (k?.consignee_kaynak === "manuel") return "Elle girildi";
  return null;
};

export default function KonsimentoTalimatHazirlik({ dosya, rezervasyonlar, konteynerler, companyId, hazir, onRefresh }: Props) {
  const { showToast } = useToast();
  const [musavir, setMusavir] = useState<string | null>(null);
  const [duzen, setDuzen] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  useEffect(() => { konsimentoGumrukMusaviri(companyId).then(setMusavir); }, [companyId]);

  const model = useMemo(() => talimatModeli({ dosya, rezervasyonlar, konteynerler, gumrukMusaviri: musavir }), [dosya, rezervasyonlar, konteynerler, musavir]);
  const msc = model.sablon === "msc_web";
  const kaynak = kaynakEtiketi(dosya.ham_veri);

  const indir = async () => {
    setIndiriliyor(true);
    try {
      const { talimatPdf } = await import("@/lib/konsimento/talimat-pdf");
      const blob = talimatPdf(model);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = model.dosyaAdi; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      showToast(`Talimat oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally { setIndiriliyor(false); }
  };

  return (
    <div className="mb-3 rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-testid="konsimento-hazirlik">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: CARD_BORDER }}>
        <FileCog size={14} style={{ color: ACCENT }} />
        <span className="text-xs font-semibold text-white">Talimat</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#6EE7B7" }} data-testid="konsimento-sablon">
          {KONSIMENTO_SABLON_ADI[model.sablon]}
        </span>
        {model.sablonVarsayilan && (
          <span className="text-[10px] text-amber-400" title={model.sablonNotu}>· acente tanıtılmadı, varsayılan form</span>
        )}
        {!msc && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button onClick={() => setDuzen((x) => !x)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="konsimento-taraf-duzenle">
              <Pencil size={11} /> Taraflar ve tercihler
            </button>
            {hazir ? (
              <>
                <Link href={`/belge/konsimento?d=${dosya.id}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white hover:opacity-90" style={{ backgroundColor: ACCENT }} data-testid="konsimento-talimat-gor">
                  <Eye size={12} /> Talimatı Gör
                </Link>
                <button onClick={indir} disabled={indiriliyor} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }} data-testid="konsimento-talimat-indir">
                  {indiriliyor ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} İndir
                </button>
              </>
            ) : (
              <span className="text-[11px]" style={{ color: TEXT_MUTED }}>Tüm konteynerler girilince oluşturulur</span>
            )}
          </div>
        )}
      </div>

      {msc ? (
        <div className="flex items-start gap-2 px-3 py-2.5 text-xs" style={{ color: TEXT_MUTED }} data-testid="konsimento-msc">
          <Globe2 size={14} className="text-sky-300 shrink-0 mt-0.5" />
          <span>MSC talimatı <span className="text-white">MSC web sitesinden</span> girilir; sistem talimat oluşturmaz. Tüm konteynerler girildiğinde yalnızca hatırlatma gönderilir.</span>
        </div>
      ) : (
        <div className="px-3 py-2.5 grid gap-2 sm:grid-cols-2 text-xs">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Consignee {kaynak && <span className="normal-case tracking-normal text-sky-300">· {kaynak}</span>}</p>
            <p className="whitespace-pre-line text-white line-clamp-3" data-testid="konsimento-consignee">{model.consignee || <span className="text-amber-400">Girilmedi</span>}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Notify</p>
            {model.notify.length ? model.notify.map((n, i) => <p key={i} className="whitespace-pre-line text-white line-clamp-2">{n}</p>)
              : <p className="text-amber-400">Girilmedi</p>}
          </div>
          {hazir && model.eksikler.length > 0 && (
            <p className="sm:col-span-2 inline-flex items-center gap-1.5 text-amber-400" data-testid="konsimento-eksik">
              <AlertTriangle size={12} /> Talimatta eksik: {model.eksikler.join(", ")}
            </p>
          )}
        </div>
      )}

      {duzen && !msc && (
        <TarafDuzenle dosya={dosya} companyId={companyId} sablon={model.sablon} onKapat={() => setDuzen(false)} onKaydedildi={() => { setDuzen(false); onRefresh(); }} />
      )}
    </div>
  );
}

/** Consignee / notify + talimat tercihleri. Gecmis secenekler musteri adi altinda (en yeni once). */
function TarafDuzenle({ dosya, companyId, sablon, onKapat, onKaydedildi }: { dosya: Dosya; companyId: string; sablon: KonsimentoSablonu; onKapat: () => void; onKaydedildi: () => void }) {
  const { showToast } = useToast();
  const ayar = talimatAyari(dosya.ham_veri);
  const [gecmis, setGecmis] = useState<TarafGecmisi>({ consigneeler: [], notifyler: [] });
  const [consignee, setConsignee] = useState(dosya.consignee || "");
  const [notify, setNotify] = useState<string[]>(dosyaNotifyListesi(dosya.ham_veri));
  const [yeniNotify, setYeniNotify] = useState("");
  const [shipperEk, setShipperEk] = useState(ayar.shipper_ek || "");
  const [malEn, setMalEn] = useState(ayar.mal_en || "");
  const [blTipi, setBlTipi] = useState(ayar.bl_tipi || "");
  const [blOrijinal, setBlOrijinal] = useState(String(ayar.bl_orijinal ?? ""));
  const [blKopya, setBlKopya] = useState(String(ayar.bl_kopya ?? ""));
  const [ozelIbare, setOzelIbare] = useState(ayar.ozel_ibare || "");
  const [sablonSecim, setSablonSecim] = useState<string>(ayar.sablon || "");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const getir = useCallback(() => { tarafGecmisiGetir(companyId, dosya.alici_firma, dosya.id).then(setGecmis); }, [companyId, dosya.alici_firma, dosya.id]);
  useEffect(() => { getir(); }, [getir]);

  const kaydet = async () => {
    setKaydediliyor(true);
    const yeniAyar: TalimatAyari = {
      sablon: (sablonSecim || null) as KonsimentoSablonu | null,
      shipper_ek: shipperEk.trim() || null, mal_en: malEn.trim() || null, bl_tipi: blTipi || null,
      bl_orijinal: Number(blOrijinal) || null, bl_kopya: Number(blKopya) || null, ozel_ibare: ozelIbare.trim() || null,
    };
    const tumNotify = [...notify, ...(yeniNotify.trim() ? [yeniNotify.trim()] : [])];
    const eskiKaynak = (dosya.ham_veri as { consignee_kaynak?: string } | null)?.consignee_kaynak ?? null;
    const consigneeDegisti = consignee.trim() !== (dosya.consignee || "").trim();
    const { data, error } = await supabase.from("ihracat_dosyalari").update({
      consignee: consignee.trim() || null,
      ham_veri: {
        ...((dosya.ham_veri as Record<string, unknown>) || {}),
        notify: tumNotify,
        consignee_kaynak: consignee.trim() ? (consigneeDegisti ? "manuel" : eskiKaynak) : null,
        konsimento_talimati: yeniAyar,
      },
    }).eq("id", dosya.id).eq("company_id", companyId).select("id");
    setKaydediliyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) { showToast(`Kaydedilemedi: ${hata}`, "error"); return; }
    showToast("Talimat bilgileri kaydedildi.", "success");
    onKaydedildi();
  };

  const girdi = "w-full px-2.5 py-1.5 border rounded-lg text-xs text-white";
  const stil = { borderColor: CARD_BORDER, backgroundColor: CARD_BG };
  const etiket = (t: string) => <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>{t}</label>;

  return (
    <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: CARD_BORDER }} data-testid="konsimento-taraf-formu">
      <div>
        {etiket("Consignee (alıcı)")}
        {gecmis.consigneeler.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5" data-testid="konsimento-consignee-gecmis">
            {gecmis.consigneeler.slice(0, 6).map((c) => (
              <button key={c.metin} type="button" onClick={() => setConsignee(c.metin)} title={c.metin}
                className={`inline-flex items-center gap-1 max-w-[260px] px-2 py-1 rounded-md border text-[11px] ${consignee.trim() === c.metin ? "text-emerald-300 border-emerald-500/50" : "hover:bg-white/5"}`}
                style={consignee.trim() === c.metin ? {} : { borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                <History size={10} className="shrink-0" /><span className="truncate">{c.metin.split("\n")[0]}</span><span className="shrink-0 opacity-60">· {c.dosyaNo}</span>
              </button>
            ))}
          </div>
        )}
        <textarea value={consignee} onChange={(e) => setConsignee(e.target.value)} rows={3} className={`${girdi} resize-y`} style={stil} placeholder={"FİRMA ADI\nAdres satırları, telefon / e-posta"} data-testid="konsimento-consignee-girdi" />
      </div>

      <div>
        {etiket("Notify (ihbar)")}
        {notify.map((n, i) => (
          <div key={i} className="flex items-start gap-2 mb-1.5 p-2 rounded-md border" style={{ borderColor: CARD_BORDER }}>
            <p className="flex-1 whitespace-pre-line text-xs text-white">{n}</p>
            <button type="button" onClick={() => setNotify(notify.filter((_, j) => j !== i))} className="hover:text-white" style={{ color: TEXT_MUTED }} title="Kaldır"><X size={13} /></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {consignee.trim() && !notify.includes(consignee.trim()) && (
            <button type="button" onClick={() => setNotify([...notify, consignee.trim()])} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }} data-testid="konsimento-notify-consignee">
              <Plus size={10} /> Consignee ile aynı
            </button>
          )}
          {gecmis.notifyler.filter((g) => !notify.includes(g.metin)).slice(0, 6).map((g) => (
            <button key={g.metin} type="button" onClick={() => setNotify([...notify, g.metin])} title={g.metin}
              className="inline-flex items-center gap-1 max-w-[260px] px-2 py-1 rounded-md border text-[11px] hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
              <History size={10} className="shrink-0" /><span className="truncate">{g.metin.split("\n")[0]}</span><span className="shrink-0 opacity-60">· {g.dosyaNo}</span>
            </button>
          ))}
        </div>
        <textarea value={yeniNotify} onChange={(e) => setYeniNotify(e.target.value)} rows={2} className={`${girdi} resize-y`} style={stil} placeholder="Yeni notify ekle (kaydedince listeye eklenir)" data-testid="konsimento-notify-girdi" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>{etiket("Shipper ek satırı")}<input value={shipperEk} onChange={(e) => setShipperEk(e.target.value)} className={girdi} style={stil} placeholder="ON BEHALF OF ..." data-testid="konsimento-shipper-ek" /></div>
        <div title="Menşe Şahadetnamesi ve Phytosanitary belgelerinde de bu ad yazılır (16.11.2026)">{etiket("Mal tanımı (EN) · BL, Menşe, Phyto")}<input value={malEn} onChange={(e) => setMalEn(e.target.value)} className={girdi} style={stil} placeholder={VARSAYILAN_MAL_EN} /></div>
        <div>{etiket("Konşimento tipi")}
          <select value={blTipi} onChange={(e) => setBlTipi(e.target.value)} className={girdi} style={stil}>
            <option value="">BILL OF LADING (varsayılan)</option>
            {BL_TIPLERI.filter((t) => t !== "BILL OF LADING").map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>{etiket("Talimat formu")}
          <select value={sablonSecim} onChange={(e) => setSablonSecim(e.target.value)} className={girdi} style={stil} data-testid="konsimento-sablon-secim">
            <option value="">Acenteye göre (otomatik)</option>
            {(["standart", "akkon", "msc_web"] as KonsimentoSablonu[]).map((s) => <option key={s} value={s}>{KONSIMENTO_SABLON_ADI[s]}</option>)}
          </select>
        </div>
        {(sablon === "akkon" || sablonSecim === "akkon") && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>{etiket("Orijinal")}<input value={blOrijinal} onChange={(e) => setBlOrijinal(e.target.value.replace(/\D/g, ""))} className={girdi} style={stil} placeholder="3" /></div>
              <div>{etiket("Kopya")}<input value={blKopya} onChange={(e) => setBlKopya(e.target.value.replace(/\D/g, ""))} className={girdi} style={stil} placeholder="3" /></div>
            </div>
            <div>{etiket("Özel ibareler")}<input value={ozelIbare} onChange={(e) => setOzelIbare(e.target.value)} className={girdi} style={stil} /></div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onKapat} className="px-3 py-1.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
        <button type="button" onClick={kaydet} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }} data-testid="konsimento-taraf-kaydet">
          {kaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Kaydet
        </button>
      </div>
    </div>
  );
}
