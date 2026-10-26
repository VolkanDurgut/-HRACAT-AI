"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, Plus, RefreshCw, Send, Trash2, XCircle } from "lucide-react";
import { GENEL, GenelKart, GenelSayfaCerceve } from "@/components/genel-sayfa-cerceve";
import { satinAlmaCagir, miktarOku } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import {
  BIRIMLER, KATEGORILER, listeOzeti, miktarBirim, saTarih,
  type Birim, type Kategori, type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * Departman satin alma talebi (26.10.2026) - GIRISSIZ, departmana ozel kalici baglanti.
 * Departmanin ORTAK taslak listesi: ayni departmandan birden fazla kisi farkli
 * zamanlarda kalem ekleyebilir. "Listeyi gonder" -> SA-YYYY-NNNN numarasi,
 * execution@ + bbt@'ye e-posta; Burak Bey kalem bazinda onaylar / reddeder,
 * sonuc "Gonderilen listeler"de gorunur. Veritabanina dogrudan erisim YOK
 * (edge function "satin-alma", lib/satin-alma/api.ts).
 */

type Bilgi = { departman: string; sirket: string | null; taslak: SaListe | null; gecmis: SaListe[] };

const AD_ANAHTAR = "sa-talep-ad";

type Form = { kategori: Kategori | ""; urun: string; miktar: string; birim: Birim; aciliyet: "normal" | "acil"; aciklama: string };
const BOS_FORM: Form = { kategori: "", urun: "", miktar: "", birim: "adet", aciliyet: "normal", aciklama: "" };

const girdiSinifi = "w-full px-3 py-2.5 rounded-lg border text-base bg-white focus:outline-none focus:ring-2";
const girdiStil = { borderColor: GENEL.cizgi, color: GENEL.metin } as React.CSSProperties;

export default function TalepSayfasi({ params }: { params: { token: string } }) {
  const [bilgi, setBilgi] = useState<Bilgi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [sayfaHatasi, setSayfaHatasi] = useState<string | null>(null);

  const [ad, setAd] = useState("");
  const [form, setForm] = useState<Form>(BOS_FORM);
  const [formHatasi, setFormHatasi] = useState<string | null>(null);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [siliniyor, setSiliniyor] = useState<string | null>(null);
  const [listeHatasi, setListeHatasi] = useState<string | null>(null);

  const [gonderOnay, setGonderOnay] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderimSonucu, setGonderimSonucu] = useState<{ liste_no: string; mail: string } | null>(null);
  const [acikGecmis, setAcikGecmis] = useState<string | null>(null);

  useEffect(() => { try { setAd(window.localStorage.getItem(AD_ANAHTAR) || ""); } catch { /* yoksay */ } }, []);

  const getir = useCallback(async (sessiz = false) => {
    if (!tokenBicimiGecerli(params.token)) { setSayfaHatasi("Bağlantı geçersiz. Lütfen size iletilen bağlantıyı kullanın."); setYukleniyor(false); return; }
    if (sessiz) setYenileniyor(true);
    const r = await satinAlmaCagir<Bilgi>({ islem: "bilgi", token: params.token });
    if (r.ok) { setBilgi(r.veri); setSayfaHatasi(null); }
    else if (!sessiz || r.durum === 404) { setBilgi(null); setSayfaHatasi(r.hata); }
    setYukleniyor(false);
    setYenileniyor(false);
  }, [params.token]);
  useEffect(() => { getir(); }, [getir]);

  const adKaydet = (deger: string) => { try { if (deger.trim()) window.localStorage.setItem(AD_ANAHTAR, deger.trim()); } catch { /* yoksay */ } };
  const alan = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormHatasi(null);
    setGonderimSonucu(null);
    const miktar = miktarOku(form.miktar);
    if (ad.trim().length < 2) return setFormHatasi("Adınızı ve soyadınızı yazın.");
    if (!form.kategori) return setFormHatasi("Kategori seçin.");
    if (form.urun.trim().length < 2) return setFormHatasi("Ürünü yazın.");
    if (miktar === null) return setFormHatasi("Miktarı sayı olarak yazın (ör. 5 ya da 2,5).");
    setEkleniyor(true);
    adKaydet(ad);
    const r = await satinAlmaCagir<{ id: string }>({
      islem: "kalem_ekle", token: params.token,
      kalem: { kategori: form.kategori, urun: form.urun.trim(), miktar, birim: form.birim, aciliyet: form.aciliyet, aciklama: form.aciklama.trim(), talep_eden: ad.trim() },
    });
    setEkleniyor(false);
    if (!r.ok) { setFormHatasi(r.hata); return; }
    // Kategori + birim ayni kalir (art arda benzer kalemler hizli girilsin)
    setForm((f) => ({ ...BOS_FORM, kategori: f.kategori, birim: f.birim }));
    getir(true);
  };

  const sil = async (id: string) => {
    setListeHatasi(null);
    setSiliniyor(id);
    const r = await satinAlmaCagir({ islem: "kalem_sil", token: params.token, kalem_id: id });
    setSiliniyor(null);
    setSilinecek(null);
    if (!r.ok) setListeHatasi(r.hata);
    getir(true);
  };

  const gonder = async () => {
    setListeHatasi(null);
    if (ad.trim().length < 2) { setListeHatasi("Gönderen olarak adınızı ve soyadınızı yazın (Kalem ekle bölümündeki “Adınız soyadınız” alanı)."); setGonderOnay(false); return; }
    setGonderiliyor(true);
    adKaydet(ad);
    const r = await satinAlmaCagir<{ liste_no: string; mail: string }>({ islem: "gonder", token: params.token, gonderen: ad.trim() });
    setGonderiliyor(false);
    setGonderOnay(false);
    if (!r.ok) { setListeHatasi(r.hata); getir(true); return; }
    setGonderimSonucu(r.veri);
    getir(true);
  };

  if (yukleniyor) {
    return <GenelSayfaCerceve ust="Satın Alma Talebi" satisSatiri={false}><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={28} style={{ color: GENEL.lacivert2 }} /></div></GenelSayfaCerceve>;
  }
  if (!bilgi) {
    return (
      <GenelSayfaCerceve ust="Satın Alma Talebi" satisSatiri={false}>
        <GenelKart>
          <p className="font-semibold flex items-center gap-2"><AlertTriangle size={18} style={{ color: GENEL.turuncu }} /> {sayfaHatasi}</p>
          <p className="text-sm mt-2" style={{ color: GENEL.soluk }}>Bağlantı yenilenmiş olabilir. Güncel bağlantı için yöneticinize başvurun.</p>
        </GenelKart>
      </GenelSayfaCerceve>
    );
  }

  const taslakKalemleri = bilgi.taslak?.kalemler ?? [];
  const taslakOzet = listeOzeti({ kalemler: taslakKalemleri });

  return (
    <GenelSayfaCerceve ust="Satın Alma Talebi" satisSatiri={false}>
      <div className="space-y-4">
        {/* Departman */}
        <GenelKart>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider" style={{ color: GENEL.soluk }}>DEPARTMAN</p>
              <p className="text-2xl font-bold leading-tight break-words">{bilgi.departman}</p>
            </div>
            <button onClick={() => getir(true)} disabled={yenileniyor} aria-label="Yenile"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-60" style={{ borderColor: GENEL.cizgi }}>
              <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
            </button>
          </div>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: GENEL.soluk }}>
            Bu, departmanınızın <b style={{ color: GENEL.metin }}>ortak ihtiyaç listesidir</b>. Departmandan herkes kalem ekleyebilir.
            Liste hazır olduğunda <b style={{ color: GENEL.metin }}>Listeyi gönder</b> deyin; satın alma birimine ve Burak Bey&apos;e e-postayla iletilir.
          </p>
        </GenelKart>

        {gonderimSonucu && (
          <div className="rounded-2xl border px-5 py-4 flex items-start gap-3" role="status"
            style={{ backgroundColor: "#E3F2EA", borderColor: "#B7DCC6", color: GENEL.yesil }}>
            <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">{gonderimSonucu.liste_no} numaralı liste gönderildi.</p>
              <p className="mt-0.5" style={{ color: GENEL.metin }}>
                {gonderimSonucu.mail === "gonderildi"
                  ? "Satın alma birimine ve Burak Bey'e e-posta gitti. Sonucu aşağıdaki “Gönderilen listeler” bölümünden takip edebilirsiniz."
                  : "Liste kaydedildi ve yönetici ekranında görünüyor; ancak e-posta şu an gönderilemedi. Ayrıca bir şey yapmanıza gerek yok."}
              </p>
            </div>
          </div>
        )}

        {/* Kalem ekle */}
        <GenelKart>
          <p className="text-base font-bold mb-4 flex items-center gap-2"><Plus size={18} style={{ color: GENEL.lacivert2 }} /> Kalem ekle</p>
          <form onSubmit={ekle} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
            <Etiket metin="Adınız soyadınız" htmlFor="sa-ad" className="sm:col-span-2">
              <input id="sa-ad" value={ad} onChange={(e) => setAd(e.target.value)} onBlur={() => adKaydet(ad)} maxLength={80} autoComplete="name"
                placeholder="Ör. Ayşe Yılmaz" className={girdiSinifi} style={girdiStil} />
            </Etiket>
            <Etiket metin="Kategori" htmlFor="sa-kategori">
              <select id="sa-kategori" value={form.kategori} onChange={(e) => alan("kategori", e.target.value as Kategori)} className={girdiSinifi} style={girdiStil}>
                <option value="">Seçiniz…</option>
                {(Object.keys(KATEGORILER) as Kategori[]).map((k) => <option key={k} value={k}>{KATEGORILER[k]}</option>)}
              </select>
            </Etiket>
            <Etiket metin="Aciliyet" htmlFor="sa-aciliyet-normal">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Aciliyet">
                {(["normal", "acil"] as const).map((a) => {
                  const secili = form.aciliyet === a;
                  return (
                    <button key={a} id={`sa-aciliyet-${a}`} type="button" role="radio" aria-checked={secili} onClick={() => alan("aciliyet", a)}
                      className="px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                      style={secili
                        ? (a === "acil" ? { backgroundColor: "#FDECEC", borderColor: "#E8A3A3", color: "#B42318" } : { backgroundColor: "#E8EAF4", borderColor: GENEL.lacivert2, color: GENEL.lacivert2 })
                        : { borderColor: GENEL.cizgi, color: GENEL.soluk, backgroundColor: "#fff" }}>
                      {a === "acil" ? "Acil" : "Normal"}
                    </button>
                  );
                })}
              </div>
            </Etiket>
            <Etiket metin="Ürün ve detayı" htmlFor="sa-urun" className="sm:col-span-2">
              <input id="sa-urun" value={form.urun} onChange={(e) => alan("urun", e.target.value)} maxLength={200}
                placeholder="Ör. A4 fotokopi kağıdı 80 gr, geniş mavi klasör…" className={girdiSinifi} style={girdiStil} />
            </Etiket>
            <Etiket metin="Miktar" htmlFor="sa-miktar">
              <input id="sa-miktar" value={form.miktar} onChange={(e) => alan("miktar", e.target.value)} inputMode="decimal"
                placeholder="Ör. 5" className={girdiSinifi} style={girdiStil} />
            </Etiket>
            <Etiket metin="Birim" htmlFor="sa-birim">
              <select id="sa-birim" value={form.birim} onChange={(e) => alan("birim", e.target.value as Birim)} className={girdiSinifi} style={girdiStil}>
                {(Object.keys(BIRIMLER) as Birim[]).map((b) => <option key={b} value={b}>{BIRIMLER[b]}</option>)}
              </select>
            </Etiket>
            <Etiket metin="Kullanım amacı / not (isteğe bağlı)" htmlFor="sa-not" className="sm:col-span-2">
              <textarea id="sa-not" value={form.aciklama} onChange={(e) => alan("aciklama", e.target.value)} rows={2} maxLength={500}
                placeholder="Marka, renk, ölçü ya da kullanım yeri gibi ek bilgi" className={girdiSinifi} style={girdiStil} />
            </Etiket>
            {formHatasi && <p className="sm:col-span-2 text-sm font-medium" role="alert" style={{ color: "#B42318" }}>{formHatasi}</p>}
            <div className="sm:col-span-2">
              <button type="submit" disabled={ekleniyor}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-base font-bold text-white disabled:opacity-60" style={{ backgroundColor: GENEL.lacivert2 }}>
                {ekleniyor ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Listeye ekle
              </button>
            </div>
          </form>
        </GenelKart>

        {/* Taslak liste */}
        <GenelKart>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-base font-bold">Hazırlanan liste</p>
            <p className="text-sm" style={{ color: GENEL.soluk }}>
              {taslakOzet.toplam} kalem{taslakOzet.acil ? <> · <span style={{ color: "#B42318", fontWeight: 600 }}>{taslakOzet.acil} acil</span></> : null}
            </p>
          </div>
          {taslakKalemleri.length === 0 ? (
            <p className="text-sm py-6 text-center rounded-xl border border-dashed" style={{ color: GENEL.soluk, borderColor: GENEL.cizgi }}>
              Henüz kalem yok. Yukarıdan ilk kalemi ekleyin.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: GENEL.cizgi }}>
              {taslakKalemleri.map((k) => (
                <li key={k.id} className="py-3 flex items-start gap-3" style={{ borderColor: GENEL.cizgi }}>
                  <KalemOzeti k={k} />
                  <div className="shrink-0">
                    {silinecek === k.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setSilinecek(null)} className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: GENEL.cizgi }}>Vazgeç</button>
                        <button onClick={() => sil(k.id)} disabled={siliniyor === k.id} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ backgroundColor: "#B42318" }}>
                          {siliniyor === k.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Sil
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setSilinecek(k.id)} aria-label={`${k.urun} kalemini sil`} className="p-2 rounded-lg hover:bg-black/5" style={{ color: GENEL.soluk }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {listeHatasi && <p className="mt-3 text-sm font-medium" role="alert" style={{ color: "#B42318" }}>{listeHatasi}</p>}
          {taslakKalemleri.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: GENEL.cizgi }}>
              {!gonderOnay ? (
                <button onClick={() => { setListeHatasi(null); setGonderOnay(true); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-bold text-white" style={{ backgroundColor: GENEL.yesil }}>
                  <Send size={18} /> Listeyi gönder ({taslakOzet.toplam} kalem)
                </button>
              ) : (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: GENEL.cizgi, backgroundColor: "#FAFAF7" }}>
                  <p className="font-semibold">Liste gönderilsin mi?</p>
                  <p className="text-sm" style={{ color: GENEL.soluk }}>
                    {taslakOzet.toplam} kalem satın alma birimine ve Burak Bey&apos;e e-postayla iletilecek. Gönderdikten sonra bu listeye kalem eklenemez ya da silinemez; yeni kalemler yeni bir listeye girer.
                  </p>
                  <p className="text-sm">Gönderen: <b>{ad.trim() || "—"}</b></p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setGonderOnay(false)} disabled={gonderiliyor} className="px-4 py-3 rounded-xl border font-semibold disabled:opacity-60" style={{ borderColor: GENEL.cizgi }}>Vazgeç</button>
                    <button onClick={gonder} disabled={gonderiliyor} className="px-4 py-3 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: GENEL.yesil }}>
                      {gonderiliyor ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Evet, gönder
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </GenelKart>

        {/* Gonderilen listeler */}
        <GenelKart>
          <p className="text-base font-bold mb-3">Gönderilen listeler</p>
          {bilgi.gecmis.length === 0 ? (
            <p className="text-sm" style={{ color: GENEL.soluk }}>Henüz gönderilmiş liste yok.</p>
          ) : (
            <ul className="space-y-2">
              {bilgi.gecmis.map((l) => {
                const o = listeOzeti(l);
                const acik = acikGecmis === l.id;
                return (
                  <li key={l.id} className="rounded-xl border" style={{ borderColor: GENEL.cizgi }}>
                    <button onClick={() => setAcikGecmis(acik ? null : l.id)} aria-expanded={acik}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{l.liste_no}</p>
                        <p className="text-xs mt-0.5" style={{ color: GENEL.soluk }}>{saTarih(l.gonderim_zamani)} · {l.gonderen_ad} · {o.toplam} kalem</p>
                      </div>
                      <DurumRozeti l={l} />
                      <ChevronDown size={16} className={`shrink-0 transition-transform ${acik ? "rotate-180" : ""}`} style={{ color: GENEL.soluk }} />
                    </button>
                    {acik && (
                      <div className="px-4 pb-4">
                        {l.durum === "sonuclandi" && (
                          <p className="text-xs mb-2" style={{ color: GENEL.soluk }}>
                            Karar: {saTarih(l.karar_zamani)}{l.karar_notu ? <> · Not: <span style={{ color: GENEL.metin }}>{l.karar_notu}</span></> : null}
                          </p>
                        )}
                        <ul className="divide-y border-t" style={{ borderColor: GENEL.cizgi }}>
                          {l.kalemler.map((k) => (
                            <li key={k.id} className="py-2.5 flex items-start gap-3" style={{ borderColor: GENEL.cizgi }}>
                              <KalemOzeti k={k} />
                              {l.durum === "sonuclandi" && <KararRozeti karar={k.karar} />}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </GenelKart>
      </div>
    </GenelSayfaCerceve>
  );
}

function Etiket({ metin, htmlFor, className = "", children }: { metin: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold mb-1" style={{ color: GENEL.soluk }}>{metin}</label>
      {children}
    </div>
  );
}

function KalemOzeti({ k }: { k: SaKalem }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GENEL.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</p>
      <p className="font-semibold break-words">
        {k.urun}
        {k.aciliyet === "acil" && <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FDECEC", color: "#B42318" }}>ACİL</span>}
      </p>
      <p className="text-sm" style={{ color: GENEL.metin }}><b>{miktarBirim(k)}</b> <span style={{ color: GENEL.soluk }}>· {k.talep_eden}</span></p>
      {k.aciklama && <p className="text-sm mt-0.5 break-words" style={{ color: GENEL.soluk }}>{k.aciklama}</p>}
      {k.karar === "reddedildi" && k.red_nedeni && <p className="text-sm mt-0.5" style={{ color: "#B42318" }}>Red nedeni: {k.red_nedeni}</p>}
    </div>
  );
}

function DurumRozeti({ l }: { l: SaListe }) {
  const o = listeOzeti(l);
  if (l.durum === "bekliyor") {
    return <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: "#FDF1E7", color: GENEL.turuncu }}><Clock size={12} /> Onay bekliyor</span>;
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: "#E3F2EA", color: GENEL.yesil }}>
      <CheckCircle2 size={12} /> {o.onay} onay{o.red ? ` · ${o.red} red` : ""}
    </span>
  );
}

function KararRozeti({ karar }: { karar: SaKalem["karar"] }) {
  if (karar === "onaylandi") return <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold" style={{ color: GENEL.yesil }}><CheckCircle2 size={14} /> Onaylandı</span>;
  if (karar === "reddedildi") return <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold" style={{ color: "#B42318" }}><XCircle size={14} /> Reddedildi</span>;
  return null;
}
