"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Building2, ExternalLink, GitMerge, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Save, Search, X } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { pazarFirmaBirlestir, pazarFirmaGuncelle, pazarKisiKaydet, ulkeGosterim, type PazarFirma, type PazarKatilim, type PazarKisi, type PazarTemas } from "@/lib/pazar/veri";
import { LISTE_DURUM_ETIKETI, type MusteriDurumu } from "@/lib/pazar/musteri";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR 3.2 - Firma karti (10.11.2026): siparis durumu / gecmisi (musteri), yetkililer (ekle / duzelt),
 * fuarlar, ulke + not duzeltme, farkli yazilmis kaydi birlestirme. Yazma yalniz RPC (pazar_* ).
 */

const tarihTR = (t: string | null) => (t ? new Date(t).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—");
const girdiSinifi = "w-full h-9 px-3 rounded-lg border bg-transparent text-sm text-white placeholder:text-[#5B6576] outline-none focus:border-emerald-500/60";

function Bolum({ baslik, children, sag }: { baslik: string; children: React.ReactNode; sag?: React.ReactNode }) {
  return (
    <section className="border-t px-5 py-4" style={{ borderColor: CARD_BORDER }}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{baslik}</h3>
        {sag}
      </div>
      {children}
    </section>
  );
}

const ASAMA: Record<PazarFirma["crm_asama"], string> = {
  yeni: "Henüz görüşülmedi", sorgulandi: "Sipariş sorgulandı · cevap bekleniyor", hatirlatma1: "1. hatırlatma gönderildi",
  hatirlatma2: "Son hatırlatma gönderildi", sessiz: "Cevap gelmedi · beklemede", cevap: "Cevap verdi", teklif: "Teklif istedi",
  siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor",
};
const TEMAS_ADI: Record<string, string> = { sorgulama: "Sipariş sorgulama", hatirlatma1: "Hatırlatma 1", hatirlatma2: "Hatırlatma 2", atla: "Atlandı", cevap: "Cevap verdi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };

type KisiForm = { kisiId: string | null; ad: string; eposta: string; telefon: string; whatsapp: string };

export function FirmaKarti({
  firma, kisiler, katilimlar, temaslar, durum, tumFirmalar, ulkeler, onKapat, onDegisti,
}: {
  firma: PazarFirma;
  kisiler: PazarKisi[];
  katilimlar: PazarKatilim[];
  temaslar: PazarTemas[];
  durum: MusteriDurumu | null;
  tumFirmalar: PazarFirma[];
  ulkeler: string[];
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const { showToast } = useToast();
  const [ulke, setUlke] = useState(firma.ulke || "");
  const [notlar, setNotlar] = useState(firma.notlar || "");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kisiForm, setKisiForm] = useState<KisiForm | null>(null);
  const [kisiHata, setKisiHata] = useState<string | null>(null);
  const [birlestirAra, setBirlestirAra] = useState("");
  const [birlestirHedef, setBirlestirHedef] = useState<PazarFirma | null>(null);
  const [birlestiriliyor, setBirlestiriliyor] = useState(false);

  useEffect(() => { setUlke(firma.ulke || ""); setNotlar(firma.notlar || ""); setKisiForm(null); setBirlestirAra(""); }, [firma.id, firma.ulke, firma.notlar]);

  const gosterilenUlke = firma.ulke || durum?.ulke || null;
  const bilgiDegisti = (ulke.trim() || "") !== (firma.ulke || "") || (notlar.trim() || "") !== (firma.notlar || "");

  const adaylar = useMemo(() => {
    const q = birlestirAra.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
    if (q.length < 2) return [];
    return tumFirmalar
      .filter((f) => f.id !== firma.id && f.ad.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").includes(q))
      .sort((a, b) => (a.durum === b.durum ? a.ad.localeCompare(b.ad, "tr") : a.durum === "musteri" ? -1 : 1))
      .slice(0, 8);
  }, [birlestirAra, tumFirmalar, firma.id]);

  async function bilgiKaydet() {
    setKaydediliyor(true);
    try {
      await pazarFirmaGuncelle(firma.id, ulke.trim() ? ulke.trim().toLocaleUpperCase("tr-TR") : null, notlar.trim() || null);
      showToast("Firma bilgileri kaydedildi.");
      onDegisti();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Kaydedilemedi.", "error");
    } finally {
      setKaydediliyor(false);
    }
  }

  async function kisiKaydet() {
    if (!kisiForm) return;
    setKisiHata(null);
    setKaydediliyor(true);
    try {
      await pazarKisiKaydet({ firmaId: firma.id, ...kisiForm });
      showToast(kisiForm.kisiId ? "Yetkili güncellendi." : "Yetkili eklendi.");
      setKisiForm(null);
      onDegisti();
    } catch (e) {
      setKisiHata(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setKaydediliyor(false);
    }
  }

  async function birlestir() {
    if (!birlestirHedef) return;
    setBirlestiriliyor(true);
    try {
      await pazarFirmaBirlestir(firma.id, birlestirHedef.id);
      showToast(`"${firma.ad}", "${birlestirHedef.ad}" kaydına birleştirildi.`);
      setBirlestirHedef(null);
      onDegisti();
      onKapat();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Birleştirilemedi.", "error");
    } finally {
      setBirlestiriliyor(false);
    }
  }

  const musteri = firma.durum === "musteri";

  return (
    <DialogPrimitive.Root open onOpenChange={(a) => { if (!a) onKapat(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-xl overflow-y-auto border-l shadow-2xl outline-none"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
          data-testid="firma-karti"
          aria-describedby={undefined}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-white leading-snug break-words" data-kart-ad>{firma.ad}</DialogPrimitive.Title>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "#C9D1DC" }}>
                <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium"
                  style={musteri ? (durum?.aktif ? { backgroundColor: "rgba(16,185,129,0.14)", color: "#6EE7B7" } : { backgroundColor: "rgba(251,191,36,0.14)", color: "#FCD34D" }) : { backgroundColor: "rgba(96,165,250,0.14)", color: "#93C5FD" }}
                  data-kart-durum>
                  {musteri ? (durum?.aktif ? "Aktif müşteri" : "Siparişsiz müşteri") : "Potansiyel"}
                </span>
                {gosterilenUlke && <span className="inline-flex items-center gap-1.5"><UlkeBayrak ulke={gosterilenUlke} /> {ulkeGosterim(gosterilenUlke)}</span>}
                {firma.alici_adi && firma.alici_adi !== firma.ad && <span style={{ color: TEXT_MUTED }}>Alıcı: {firma.alici_adi}</span>}
              </div>
            </div>
            <DialogPrimitive.Close aria-label="Kapat" className="p-1.5 rounded-lg hover:bg-white/[0.06] shrink-0" style={{ color: TEXT_MUTED }}><X size={18} /></DialogPrimitive.Close>
          </div>

          {musteri && durum && (
            <Bolum baslik="Sipariş durumu">
              <div className="space-y-2 text-sm" data-testid="kart-siparis">
                {durum.acikDosyalar.map((d) => (
                  <Link key={d.id} href={`/dosya/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }}>
                    <span className="text-white font-medium">{d.dosya_no}</span>
                    <span className="text-xs" style={{ color: "#C9D1DC" }}>{d.yuklenen}/{d.rezKonteyner} konteyner yüklendi</span>
                  </Link>
                ))}
                {durum.acikSiparisler.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER }}>
                    <span className="text-white font-medium">{s.proforma_no}</span>
                    <span className="text-xs" style={{ color: "#C9D1DC" }}>kalan {s.kalanFcl.toLocaleString("tr-TR")} FCL ({s.kalanMts.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MT)</span>
                  </div>
                ))}
                {durum.listeSiparisleri.map((s, i) => (
                  <div key={`l${i}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER }} data-liste-siparis={s.durum}>
                    <span className="text-white font-medium">{s.proforma_no}</span>
                    <span className="text-xs text-right" style={{ color: s.durum === "onay_bekliyor" ? "#FCD34D" : "#C9D1DC" }}>
                      {s.konteyner ? `${s.konteyner} kont. · ` : s.miktarMt ? `${s.miktarMt.toLocaleString("tr-TR")} MT · ` : ""}{LISTE_DURUM_ETIKETI[s.durum]}{s.booking ? ` · ${s.booking}` : ""}
                    </span>
                  </div>
                ))}
                {!durum.aktif && (
                  <p className="text-sm" style={{ color: "#FCD34D" }}>
                    Şu an siparişi yok{durum.sonSiparis ? ` · son sipariş ${tarihTR(durum.sonSiparis)} (${durum.siparissizGun} gün önce)` : ""}
                  </p>
                )}
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Toplam {durum.toplamDosya} dosya · {durum.toplamKonteyner} konteyner</p>
              </div>
            </Bolum>
          )}

          <Bolum baslik="Görüşme">
            <div className="text-sm" data-testid="kart-gorusme">
              <p style={{ color: firma.crm_asama === "yeni" ? TEXT_MUTED : "#fff" }} data-kart-asama>{ASAMA[firma.crm_asama] || firma.crm_asama}</p>
              {firma.sonraki_adim && <p className="text-xs mt-0.5" style={{ color: "#FCD34D" }}>Sonraki hatırlatma: {tarihTR(firma.sonraki_adim)}</p>}
              {firma.bekleme_bitis && !firma.sonraki_adim && <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Yeniden sıraya girer: {tarihTR(firma.bekleme_bitis)}</p>}
              {temaslar.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs" style={{ color: "#C9D1DC" }}>
                  {temaslar.slice(0, 10).map((t) => (
                    <li key={t.id}>{tarihTR(t.olusturma)} · {TEMAS_ADI[t.sonuc || t.adim] || t.adim}{t.kanal ? ` · ${t.kanal === "eposta" ? "e-posta" : "WhatsApp"}` : ""}{t.alici ? ` · ${t.alici}` : ""}{t.isleyen ? ` · ${t.isleyen}` : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          </Bolum>

          <Bolum
            baslik={`Yetkililer (${kisiler.length})`}
            sag={!kisiForm && (
              <button type="button" onClick={() => { setKisiHata(null); setKisiForm({ kisiId: null, ad: "", eposta: "", telefon: "", whatsapp: "" }); }}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-testid="kisi-ekle">
                <Plus size={13} /> Yetkili ekle
              </button>
            )}
          >
            {kisiForm && (
              <div className="rounded-lg border p-3 mb-3 space-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-testid="kisi-form">
                <input className={girdiSinifi} style={{ borderColor: CARD_BORDER }} placeholder="Ad soyad" value={kisiForm.ad} onChange={(e) => setKisiForm({ ...kisiForm, ad: e.target.value })} data-alan="ad" />
                <input className={girdiSinifi} style={{ borderColor: CARD_BORDER }} placeholder="E-posta" type="email" value={kisiForm.eposta} onChange={(e) => setKisiForm({ ...kisiForm, eposta: e.target.value })} data-alan="eposta" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={girdiSinifi} style={{ borderColor: CARD_BORDER }} placeholder="Telefon (ülke koduyla)" value={kisiForm.telefon} onChange={(e) => setKisiForm({ ...kisiForm, telefon: e.target.value })} data-alan="telefon" />
                  <input className={girdiSinifi} style={{ borderColor: CARD_BORDER }} placeholder="WhatsApp (ülke koduyla)" value={kisiForm.whatsapp} onChange={(e) => setKisiForm({ ...kisiForm, whatsapp: e.target.value })} data-alan="whatsapp" />
                </div>
                {kisiHata && <p className="text-xs" style={{ color: "#FCA5A5" }} data-testid="kisi-hata">{kisiHata}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setKisiForm(null)} className="h-8 px-3 rounded-lg text-xs border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>Vazgeç</button>
                  <button type="button" onClick={kisiKaydet} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }} data-testid="kisi-kaydet">
                    {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
                  </button>
                </div>
              </div>
            )}
            {kisiler.length === 0 && !kisiForm ? (
              <p className="text-sm" style={{ color: "#FCD34D" }}>Yetkili yok. Mail gönderebilmek için en az bir e-posta ekleyin.</p>
            ) : (
              <ul className="space-y-2">
                {kisiler.map((k) => (
                  <li key={k.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER }} data-kisi={k.eposta || k.ad || ""}>
                    <div className="min-w-0 text-xs leading-relaxed">
                      {k.ad && <p className="text-sm text-white">{k.ad}</p>}
                      {k.eposta && <p className="flex items-center gap-1 break-all" style={{ color: k.eposta_gecerli ? "#C9D1DC" : "#FBBF24" }}><Mail size={11} className="shrink-0" />{k.eposta}{!k.eposta_gecerli && " (düzeltilmeli)"}</p>}
                      {k.telefonlar.length > 0 && <p className="flex items-center gap-1" style={{ color: "#C9D1DC" }}><Phone size={11} className="shrink-0" />{k.telefonlar.map((t) => `+${t}`).join(" · ")}</p>}
                      {k.whatsapp && <p className="flex items-center gap-1" style={{ color: "#C9D1DC" }}><MessageCircle size={11} className="shrink-0" />+{k.whatsapp}</p>}
                    </div>
                    <button type="button" aria-label="Düzenle" onClick={() => { setKisiHata(null); setKisiForm({ kisiId: k.id, ad: k.ad || "", eposta: k.eposta_gecerli ? k.eposta || "" : "", telefon: k.telefonlar.join(", "), whatsapp: k.whatsapp || "" }); }}
                      className="p-1.5 rounded-md hover:bg-white/[0.06] shrink-0" style={{ color: TEXT_MUTED }} data-kisi-duzenle>
                      <Pencil size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Bolum>

          {musteri && durum && durum.dosyalar.length > 0 && (
            <Bolum baslik={`Sipariş geçmişi (${durum.dosyalar.length})`}>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                <table className="w-full text-xs" data-testid="kart-gecmis">
                  <tbody>
                    {durum.dosyalar.slice(0, 30).map((d) => (
                      <tr key={d.id} className="border-t first:border-t-0" style={{ borderColor: CARD_BORDER }}>
                        <td className="px-3 py-1.5"><Link href={`/dosya/${d.id}`} className="inline-flex items-center gap-1 text-white hover:underline">{d.dosya_no}<ExternalLink size={10} /></Link></td>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{tarihTR(d.tarih)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{d.konteyner} kont.</td>
                        <td className="px-3 py-1.5 hidden sm:table-cell" style={{ color: TEXT_MUTED }}>{d.varis || "—"}</td>
                        <td className="px-3 py-1.5" style={{ color: d.durum === "Açık" ? "#6EE7B7" : TEXT_MUTED }}>{d.durum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Bolum>
          )}

          {(katilimlar.length > 0 || (firma.kaynak === "liste" && firma.kaynak_etiket)) && (
            <Bolum baslik={katilimlar.length > 0 ? "Fuarlar" : "Kaynak"}>
              <div className="flex flex-wrap gap-1.5">
                {firma.kaynak === "liste" && firma.kaynak_etiket && (
                  <span className="inline-flex h-6 items-center px-2 rounded text-xs" style={{ backgroundColor: "rgba(167,139,250,0.14)", color: "#C4B5FD" }} data-kart-kaynak>{firma.kaynak_etiket}</span>
                )}
                {katilimlar.map((k) => <span key={k.id} className="inline-flex h-6 items-center px-2 rounded text-xs" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#C9D1DC" }}>{k.etiket}</span>)}
              </div>
            </Bolum>
          )}

          <Bolum baslik="Bilgiler">
            <div className="space-y-2">
              <label className="block text-xs" style={{ color: TEXT_MUTED }}>
                Ülke{!firma.ulke && durum?.ulke ? ` (siparişlerden: ${ulkeGosterim(durum.ulke)})` : ""}
                <input list="pazar-ulkeler" className={`${girdiSinifi} mt-1`} style={{ borderColor: CARD_BORDER }} value={ulke} onChange={(e) => setUlke(e.target.value)} placeholder="Ülke" data-alan="ulke" />
                <datalist id="pazar-ulkeler">{ulkeler.map((u) => <option key={u} value={u}>{ulkeGosterim(u)}</option>)}</datalist>
              </label>
              <label className="block text-xs" style={{ color: TEXT_MUTED }}>
                Not
                <textarea className={`${girdiSinifi} mt-1 h-20 py-2`} style={{ borderColor: CARD_BORDER }} value={notlar} onChange={(e) => setNotlar(e.target.value)} placeholder="Firma hakkında not" data-alan="not" />
              </label>
              <div className="flex justify-end">
                <button type="button" onClick={bilgiKaydet} disabled={!bilgiDegisti || kaydediliyor} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }} data-testid="bilgi-kaydet">
                  {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
                </button>
              </div>
            </div>
          </Bolum>

          <Bolum baslik="Aynı firma mı? Birleştir">
            <p className="text-xs mb-2" style={{ color: TEXT_MUTED }}>
              Bu kayıt başka bir kayıtla aynı firmaysa (adı farklı yazılmış) seçin; yetkililer ve fuarlar o kayda taşınır, bu kayıt silinir. Bu ad sonraki yüklemelerde de o firmaya eklenir.
            </p>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
              <input className={`${girdiSinifi} pl-8`} style={{ borderColor: CARD_BORDER }} placeholder="Firma adı ara (en az 2 harf)" value={birlestirAra} onChange={(e) => setBirlestirAra(e.target.value)} data-testid="birlestir-ara" />
            </div>
            {adaylar.length > 0 && (
              <ul className="mt-2 rounded-lg border divide-y" style={{ borderColor: CARD_BORDER }}>
                {adaylar.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setBirlestirHedef(a)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.03]" data-birlestir-aday={a.ad}>
                      <span className="text-white truncate">{a.ad}</span>
                      <span className="inline-flex items-center gap-1 text-xs shrink-0" style={{ color: a.durum === "musteri" ? "#6EE7B7" : TEXT_MUTED }}>
                        {a.durum === "musteri" ? <Building2 size={12} /> : null}{a.durum === "musteri" ? "Müşteri" : "Potansiyel"} <GitMerge size={12} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Bolum>

          <ConfirmDialog
            open={!!birlestirHedef}
            onOpenChange={(a) => { if (!a) setBirlestirHedef(null); }}
            title="Kayıtlar birleştirilsin mi?"
            description={birlestirHedef ? `"${firma.ad}" kaydı "${birlestirHedef.ad}" kaydına birleştirilecek. Yetkililer ve fuarlar taşınır, "${firma.ad}" kaydı silinir. Bu işlem geri alınamaz.` : ""}
            confirmLabel="Birleştir"
            onConfirm={birlestir}
            loading={birlestiriliyor}
            loadingLabel="Birleştiriliyor…"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
