"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  AcilEtiketi, B, BelgeSayfasi, BilgiAlani, DurumEtiketi, Panel, TestSeridi,
  dugmeAna, dugmeIkincil, girdiSinifi, girdiStil, tdSinifi, thSinifi,
} from "@/components/satin-alma-belge";
import { satinAlmaCagir, miktarOku } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import {
  BIRIMLER, KATEGORILER, listeOzeti, miktarYaz, saTarih,
  type Birim, type Kategori, type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * Departman SATIN ALMA TALEP FORMU (26.10.2026; kurumsal yeniden tasarim 27.10.2026)
 * GIRISSIZ, departmana ozel kalici baglanti. Departmanin ORTAK taslak formu: ayni
 * departmandan birden fazla kisi farkli zamanlarda kalem ekleyebilir. "Formu gonder"
 * -> SA-YYYY-NNNN numarasi, execution@ + bbt@'ye e-posta (TEST departmaninda SADECE
 * test adresine); Burak Bey kalem bazinda onaylar / reddeder, sonuc "Gonderilen
 * talep formlari"nda gorunur. Veritabanina dogrudan erisim YOK (edge function
 * "satin-alma", lib/satin-alma/api.ts).
 */

type OnayliAlim = Pick<SaKalem, "id" | "kategori" | "urun" | "miktar" | "birim" | "talep_eden" | "alindi" | "alinma_zamani"> & { liste_no: string; karar_zamani: string };
type Bilgi = { departman: string; test?: boolean; sirket: string | null; taslak: SaListe | null; gecmis: SaListe[]; onaylananlar?: OnayliAlim[] };

const AD_ANAHTAR = "sa-talep-ad";
const ALIM_SAYFA = 15;

type Form = { kategori: Kategori | ""; urun: string; miktar: string; birim: Birim; aciliyet: "normal" | "acil"; aciklama: string };
const BOS_FORM: Form = { kategori: "", urun: "", miktar: "", birim: "adet", aciliyet: "normal", aciklama: "" };

const bugun = () => new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });

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
  const [gonderimSonucu, setGonderimSonucu] = useState<{ liste_no: string; mail: string; test?: boolean } | null>(null);
  const [acikGecmis, setAcikGecmis] = useState<string | null>(null);
  const [alimSayisi, setAlimSayisi] = useState(ALIM_SAYFA);

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
    if (ad.trim().length < 2) return setFormHatasi("Talep eden kişinin adını ve soyadını yazın.");
    if (!form.kategori) return setFormHatasi("Kategori seçin.");
    if (form.urun.trim().length < 2) return setFormHatasi("Ürün / hizmet tanımını yazın.");
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
    setTimeout(() => document.getElementById("sa-urun")?.focus(), 0);
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
    if (ad.trim().length < 2) { setListeHatasi("Gönderen olarak adınızı ve soyadınızı “Talep eden” alanına yazın."); setGonderOnay(false); return; }
    setGonderiliyor(true);
    adKaydet(ad);
    const r = await satinAlmaCagir<{ liste_no: string; mail: string; test?: boolean }>({ islem: "gonder", token: params.token, gonderen: ad.trim() });
    setGonderiliyor(false);
    setGonderOnay(false);
    if (!r.ok) { setListeHatasi(r.hata); getir(true); return; }
    setGonderimSonucu(r.veri);
    getir(true);
  };

  if (yukleniyor) {
    return <BelgeSayfasi modul="Satın Alma Talep Formu"><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={24} style={{ color: B.lacivert2 }} /></div></BelgeSayfasi>;
  }
  if (!bilgi) {
    return (
      <BelgeSayfasi modul="Satın Alma Talep Formu">
        <Panel>
          <p className="font-semibold flex items-center gap-2 text-sm"><AlertTriangle size={16} style={{ color: B.turuncu }} /> {sayfaHatasi}</p>
          <p className="text-sm mt-1.5" style={{ color: B.soluk }}>Bağlantı yenilenmiş ya da departman kaldırılmış olabilir. Güncel bağlantı için yöneticinize başvurun.</p>
        </Panel>
      </BelgeSayfasi>
    );
  }

  const taslakKalemleri = bilgi.taslak?.kalemler ?? [];
  const taslakOzet = listeOzeti({ kalemler: taslakKalemleri });
  const sonGonderim = bilgi.gecmis[0];
  const bekleyen = bilgi.gecmis.filter((l) => l.durum === "bekliyor").length;
  const alicilar = bilgi.test ? "yalnızca test adresine (mesensei282@gmail.com)" : "satın alma birimine (execution@) ve Burak Bey'e (bbt@)";
  const alimlar = bilgi.onaylananlar ?? [];

  return (
    <BelgeSayfasi modul="Satın Alma Talep Formu">
      <div className="space-y-4">
        {bilgi.test && <TestSeridi>Bu departmanın formları ve onay sonuçları yalnızca test adresine e-postalanır; gerçek alıcılara gitmez.</TestSeridi>}

        {/* Belge basligi */}
        <Panel govdeSinifi="p-0">
          <div className="px-4 sm:px-6 pt-5 pb-4 flex flex-wrap items-start justify-between gap-4 border-b" style={{ borderColor: B.cizgiAcik }}>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: B.soluk }}>{bilgi.sirket || "Unex Gıda"}</p>
              <h1 className="text-xl sm:text-[22px] font-bold tracking-tight mt-0.5" style={{ color: B.lacivert }}>Satın Alma Talep Formu</h1>
            </div>
            <button onClick={() => getir(true)} disabled={yenileniyor} className={dugmeIkincil} style={{ borderColor: B.cizgi }}>
              <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
            </button>
          </div>
          <div className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            <BilgiAlani etiket="Talep eden departman">{bilgi.departman}</BilgiAlani>
            <BilgiAlani etiket="Form tarihi">{bugun()}</BilgiAlani>
            <BilgiAlani etiket="Form durumu">
              {taslakOzet.toplam ? <DurumEtiketi renk={B.turuncu}>Hazırlanıyor · {taslakOzet.toplam} kalem</DurumEtiketi> : <span style={{ color: B.soluk }} className="font-medium">Boş</span>}
            </BilgiAlani>
            <BilgiAlani etiket="Son gönderim">
              {sonGonderim ? <span>{sonGonderim.liste_no} <span className="font-normal" style={{ color: B.soluk }}>· {saTarih(sonGonderim.gonderim_zamani).slice(0, 10)}</span></span> : <span style={{ color: B.soluk }} className="font-medium">—</span>}
            </BilgiAlani>
          </div>
          <div className="px-4 sm:px-6 py-2.5 border-t text-xs leading-relaxed" style={{ borderColor: B.cizgiAcik, backgroundColor: B.baslikZemin, color: B.soluk }}>
            Süreç: <b style={{ color: B.metin }}>1.</b> Departman kalemleri ekler ve formu gönderir
            <span className="mx-1.5">→</span><b style={{ color: B.metin }}>2.</b> Satın alma onayı (kalem bazında onay / red)
            <span className="mx-1.5">→</span><b style={{ color: B.metin }}>3.</b> Onaylı satın alma fişi departmana iletilir.
            {bekleyen > 0 && <span className="block sm:inline sm:ml-2 font-semibold" style={{ color: B.turuncu }}>{bekleyen} form onay bekliyor.</span>}
          </div>
        </Panel>

        {gonderimSonucu && (
          <div className="border rounded-[4px] px-4 py-3 flex items-start gap-2.5 text-sm" role="status" style={{ backgroundColor: B.yesilZemin, borderColor: "#B5D9C4" }}>
            <CheckCircle2 size={17} className="shrink-0 mt-0.5" style={{ color: B.yesil }} />
            <div>
              <p className="font-semibold" style={{ color: B.yesil }}>{gonderimSonucu.liste_no} numaralı talep formu gönderildi.</p>
              <p className="mt-0.5" style={{ color: B.metin }}>
                {gonderimSonucu.mail === "gonderildi"
                  ? (gonderimSonucu.test ? "Test modu: e-posta yalnızca test adresine gönderildi." : "Satın alma birimine ve Burak Bey'e e-posta ile iletildi. Sonucu aşağıdaki “Gönderilen talep formları” tablosundan takip edebilirsiniz.")
                  : "Form kaydedildi ve onay ekranında görünüyor; e-posta şu an gönderilemedi. Ayrıca bir işlem yapmanıza gerek yok."}
              </p>
            </div>
          </div>
        )}

        {/* Talep kalemleri */}
        <Panel baslik="Talep kalemleri" govdeSinifi="p-0"
          sag={<span className="text-xs" style={{ color: B.soluk }}>{taslakOzet.toplam} kalem{taslakOzet.acil ? <> · <b style={{ color: B.kirmizi }}>{taslakOzet.acil} acil</b></> : null}</span>}>
          {/* Yeni kalem girisi */}
          <form onSubmit={ekle} noValidate className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: B.cizgi, backgroundColor: "#FAFBFC" }}>
            <div className="grid grid-cols-2 sm:grid-cols-12 gap-x-3 gap-y-3">
              <Etiket metin="Talep eden (ad soyad)" htmlFor="sa-ad" className="col-span-2 sm:col-span-3">
                <input id="sa-ad" value={ad} onChange={(e) => setAd(e.target.value)} onBlur={() => adKaydet(ad)} maxLength={80} autoComplete="name"
                  placeholder="Ad Soyad" className={girdiSinifi} style={girdiStil} />
              </Etiket>
              <Etiket metin="Kategori" htmlFor="sa-kategori" className="col-span-2 sm:col-span-3">
                <select id="sa-kategori" value={form.kategori} onChange={(e) => alan("kategori", e.target.value as Kategori)} className={girdiSinifi} style={girdiStil}>
                  <option value="">Seçiniz</option>
                  {(Object.keys(KATEGORILER) as Kategori[]).map((k) => <option key={k} value={k}>{KATEGORILER[k]}</option>)}
                </select>
              </Etiket>
              <Etiket metin="Ürün / hizmet tanımı" htmlFor="sa-urun" className="col-span-2 sm:col-span-6">
                <input id="sa-urun" value={form.urun} onChange={(e) => alan("urun", e.target.value)} maxLength={200}
                  placeholder="Ör. A4 fotokopi kağıdı 80 gr" className={girdiSinifi} style={girdiStil} />
              </Etiket>
              <Etiket metin="Miktar" htmlFor="sa-miktar" className="col-span-1 sm:col-span-2">
                <input id="sa-miktar" value={form.miktar} onChange={(e) => alan("miktar", e.target.value)} inputMode="decimal"
                  placeholder="0" className={`${girdiSinifi} text-right tabular-nums`} style={girdiStil} />
              </Etiket>
              <Etiket metin="Birim" htmlFor="sa-birim" className="col-span-1 sm:col-span-2">
                <select id="sa-birim" value={form.birim} onChange={(e) => alan("birim", e.target.value as Birim)} className={girdiSinifi} style={girdiStil}>
                  {(Object.keys(BIRIMLER) as Birim[]).map((b) => <option key={b} value={b}>{BIRIMLER[b]}</option>)}
                </select>
              </Etiket>
              <Etiket metin="Öncelik" htmlFor="sa-aciliyet" className="col-span-2 sm:col-span-2">
                <select id="sa-aciliyet" value={form.aciliyet} onChange={(e) => alan("aciliyet", e.target.value as Form["aciliyet"])} className={girdiSinifi}
                  style={{ ...girdiStil, ...(form.aciliyet === "acil" ? { color: B.kirmizi, fontWeight: 600 } : {}) }}>
                  <option value="normal">Normal</option>
                  <option value="acil">Acil</option>
                </select>
              </Etiket>
              <Etiket metin="Açıklama / kullanım amacı (isteğe bağlı)" htmlFor="sa-not" className="col-span-2 sm:col-span-4">
                <input id="sa-not" value={form.aciklama} onChange={(e) => alan("aciklama", e.target.value)} maxLength={500}
                  placeholder="Marka, ölçü, renk, kullanım yeri" className={girdiSinifi} style={girdiStil} />
              </Etiket>
              <div className="col-span-2 sm:col-span-2 flex items-end">
                <button type="submit" disabled={ekleniyor} className={`${dugmeAna} w-full`} style={{ backgroundColor: B.lacivert2 }}>
                  {ekleniyor ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Kalem ekle
                </button>
              </div>
            </div>
            {formHatasi && <p className="mt-2.5 text-[13px] font-medium" role="alert" style={{ color: B.kirmizi }}>{formHatasi}</p>}
          </form>

          {/* Eklenen kalemler */}
          {taslakKalemleri.length === 0 ? (
            <p className="text-sm px-5 py-8 text-center" style={{ color: B.soluk }}>Formda henüz kalem yok. Yukarıdaki satırdan ilk kalemi ekleyin.</p>
          ) : (
            <KalemTablosu kalemler={taslakKalemleri} sonIslem={(k) => (
              silinecek === k.id ? (
                <span className="inline-flex items-center gap-1">
                  <button onClick={() => setSilinecek(null)} className="h-7 px-2 rounded-[3px] border text-xs font-medium bg-white" style={{ borderColor: B.cizgi }}>Vazgeç</button>
                  <button onClick={() => sil(k.id)} disabled={siliniyor === k.id} className="h-7 px-2 rounded-[3px] text-xs font-semibold text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ backgroundColor: B.kirmizi }}>
                    {siliniyor === k.id ? <Loader2 size={12} className="animate-spin" /> : null} Sil
                  </button>
                </span>
              ) : (
                <button onClick={() => setSilinecek(k.id)} aria-label={`${k.urun} kalemini sil`} title="Kalemi sil" className="p-1.5 rounded-[3px] hover:bg-[#FDF0EF]" style={{ color: "#8C93A6" }}>
                  <Trash2 size={14} />
                </button>
              )
            )} />
          )}

          {listeHatasi && <p className="px-4 sm:px-5 pt-3 text-[13px] font-medium" role="alert" style={{ color: B.kirmizi }}>{listeHatasi}</p>}

          {/* Gonderim */}
          {taslakKalemleri.length > 0 && (
            <div className="px-4 sm:px-5 py-3.5 border-t" style={{ borderColor: B.cizgi }}>
              {!gonderOnay ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: B.soluk }}>Form gönderildiğinde talep numarası verilir ve {alicilar} e-posta ile iletilir.</p>
                  <button onClick={() => { setListeHatasi(null); setGonderOnay(true); }} className={`${dugmeAna} w-full sm:w-auto`} style={{ backgroundColor: B.lacivert }}>
                    <Send size={14} /> Formu onaya gönder
                  </button>
                </div>
              ) : (
                <div className="border rounded-[4px] p-3.5 sm:p-4" style={{ borderColor: B.cizgi, backgroundColor: B.baslikZemin }}>
                  <p className="text-sm font-semibold">Talep formu onaya gönderilsin mi?</p>
                  <p className="text-[13px] mt-1" style={{ color: B.soluk }}>
                    {taslakOzet.toplam} kalem {alicilar} iletilecek. Gönderilen forma kalem eklenemez ya da silinemez; yeni kalemler yeni bir forma girer.
                  </p>
                  <p className="text-[13px] mt-1.5">Gönderen: <b>{ad.trim() || "—"}</b></p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button onClick={() => setGonderOnay(false)} disabled={gonderiliyor} className={dugmeIkincil} style={{ borderColor: B.cizgi }}>Vazgeç</button>
                    <button onClick={gonder} disabled={gonderiliyor} className={dugmeAna} style={{ backgroundColor: B.lacivert }}>
                      {gonderiliyor ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gönder
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Gonderilen formlar */}
        <Panel baslik="Gönderilen talep formları" govdeSinifi="p-0" sag={bilgi.gecmis.length ? <span className="text-xs" style={{ color: B.soluk }}>Son {bilgi.gecmis.length} form</span> : undefined}>
          {bilgi.gecmis.length === 0 ? (
            <p className="text-sm px-5 py-6" style={{ color: B.soluk }}>Henüz gönderilmiş form yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: B.cizgi, color: B.soluk }}>
                    <th className={`${thSinifi} w-8`} aria-label="Ayrıntı" />
                    <th className={thSinifi}>Talep no</th>
                    <th className={thSinifi}>Gönderim</th>
                    <th className={thSinifi}>Gönderen</th>
                    <th className={`${thSinifi} text-right`}>Kalem</th>
                    <th className={thSinifi}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {bilgi.gecmis.map((l) => {
                    const o = listeOzeti(l);
                    const acik = acikGecmis === l.id;
                    return (
                      <React.Fragment key={l.id}>
                        <tr className="border-b cursor-pointer hover:bg-[#F8F9FB]" style={{ borderColor: B.cizgiAcik }} onClick={() => setAcikGecmis(acik ? null : l.id)}>
                          <td className={`${tdSinifi} pr-0`}>
                            <button aria-expanded={acik} aria-label={`${l.liste_no} ayrıntısı`} className="align-middle" style={{ color: B.soluk }}>
                              {acik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                          </td>
                          <td className={`${tdSinifi} font-mono font-semibold whitespace-nowrap`}>{l.liste_no}</td>
                          <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{saTarih(l.gonderim_zamani)}</td>
                          <td className={tdSinifi}>{l.gonderen_ad}</td>
                          <td className={`${tdSinifi} text-right tabular-nums`}>{o.toplam}</td>
                          <td className={tdSinifi}><FormDurumu l={l} /></td>
                        </tr>
                        {acik && (
                          <tr className="border-b" style={{ borderColor: B.cizgi }}>
                            <td colSpan={6} className="p-0" style={{ backgroundColor: "#FAFBFC" }}>
                              {l.durum === "sonuclandi" && (
                                <p className="px-4 sm:px-5 pt-3 text-xs" style={{ color: B.soluk }}>
                                  Karar: {saTarih(l.karar_zamani)}{l.karar_notu ? <> · Not: <span style={{ color: B.metin }}>{l.karar_notu}</span></> : null}
                                </p>
                              )}
                              <div className="px-2 sm:px-3 pb-3 pt-2">
                                <KalemTablosu kalemler={l.kalemler} karar={l.durum === "sonuclandi"} sikistir />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Onaylanan alimlar (departman gecmisi) */}
        {alimlar.length > 0 && (
          <Panel baslik="Onaylanan alımlar" govdeSinifi="p-0"
            sag={<span className="text-xs" style={{ color: B.soluk }}>{alimlar.length} kalem · {alimlar.filter((a) => a.alindi).length} teslim alındı</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: B.cizgi, color: B.soluk }}>
                    <th className={thSinifi}>Onay</th>
                    <th className={thSinifi}>Fiş no</th>
                    <th className={thSinifi}>Ürün / hizmet</th>
                    <th className={`${thSinifi} text-right`}>Miktar</th>
                    <th className={thSinifi}>Talep eden</th>
                    <th className={thSinifi}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {alimlar.slice(0, alimSayisi).map((a) => (
                    <tr key={a.id} className="border-b last:border-0" style={{ borderColor: B.cizgiAcik }}>
                      <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{saTarih(a.karar_zamani).slice(0, 10)}</td>
                      <td className={`${tdSinifi} font-mono whitespace-nowrap`} style={{ color: B.soluk }}>{a.liste_no}</td>
                      <td className={tdSinifi}><span className="font-medium">{a.urun}</span><span className="block text-[11px]" style={{ color: B.soluk }}>{KATEGORILER[a.kategori] ?? a.kategori}</span></td>
                      <td className={`${tdSinifi} text-right whitespace-nowrap tabular-nums font-semibold`}>{miktarYaz(a.miktar)} <span className="font-normal" style={{ color: B.soluk }}>{BIRIMLER[a.birim] ?? a.birim}</span></td>
                      <td className={`${tdSinifi} whitespace-nowrap`}>{a.talep_eden}</td>
                      <td className={tdSinifi}>{a.alindi ? <DurumEtiketi renk={B.yesil}>Teslim alındı</DurumEtiketi> : <DurumEtiketi renk={B.turuncu}>Alınacak</DurumEtiketi>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {alimlar.length > alimSayisi && (
              <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: B.cizgi }}>
                <button onClick={() => setAlimSayisi((n) => n + 50)} className="text-xs font-semibold hover:underline" style={{ color: B.lacivert2 }}>
                  Daha fazla göster ({alimlar.length - alimSayisi} kalem)
                </button>
              </div>
            )}
          </Panel>
        )}
      </div>
    </BelgeSayfasi>
  );
}

function Etiket({ metin, htmlFor, className = "", children }: { metin: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] mb-1 truncate" style={{ color: B.soluk }}>{metin}</label>
      {children}
    </div>
  );
}

/** Kalem tablosu (masaustu) / satir listesi (mobil). */
function KalemTablosu({ kalemler, karar = false, sikistir = false, sonIslem }: {
  kalemler: SaKalem[]; karar?: boolean; sikistir?: boolean; sonIslem?: (k: SaKalem) => React.ReactNode;
}) {
  return (
    <>
      <div className="hidden sm:block overflow-x-auto">
        <table className={`w-full ${sikistir ? "border rounded-[3px]" : ""}`} style={sikistir ? { borderColor: B.cizgiAcik, backgroundColor: "#fff" } : undefined}>
          <thead>
            <tr className="border-b" style={{ borderColor: B.cizgi, color: B.soluk, backgroundColor: sikistir ? B.baslikZemin : undefined }}>
              <th className={`${thSinifi} w-10 text-right`}>#</th>
              <th className={thSinifi}>Kategori</th>
              <th className={thSinifi}>Ürün / hizmet</th>
              <th className={`${thSinifi} text-right`}>Miktar</th>
              <th className={thSinifi}>Birim</th>
              <th className={thSinifi}>Öncelik</th>
              <th className={thSinifi}>Talep eden</th>
              {karar && <th className={thSinifi}>Karar</th>}
              {sonIslem && <th className={`${thSinifi} w-10`} aria-label="İşlem" />}
            </tr>
          </thead>
          <tbody>
            {kalemler.map((k, i) => (
              <tr key={k.id} className="border-b last:border-0" style={{ borderColor: B.cizgiAcik }}>
                <td className={`${tdSinifi} text-right tabular-nums`} style={{ color: B.soluk }}>{i + 1}</td>
                <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</td>
                <td className={tdSinifi}>
                  <span className="font-medium break-words">{k.urun}</span>
                  {k.aciklama && <span className="block text-xs mt-0.5 break-words" style={{ color: B.soluk }}>{k.aciklama}</span>}
                  {karar && k.karar === "reddedildi" && k.red_nedeni && <span className="block text-xs mt-0.5" style={{ color: B.kirmizi }}>Red nedeni: {k.red_nedeni}</span>}
                </td>
                <td className={`${tdSinifi} text-right tabular-nums font-semibold whitespace-nowrap`}>{miktarYaz(k.miktar)}</td>
                <td className={`${tdSinifi} whitespace-nowrap`}>{BIRIMLER[k.birim] ?? k.birim}</td>
                <td className={tdSinifi}>{k.aciliyet === "acil" ? <AcilEtiketi /> : <span style={{ color: B.soluk }}>Normal</span>}</td>
                <td className={`${tdSinifi} whitespace-nowrap`}>{k.talep_eden}</td>
                {karar && <td className={tdSinifi}><KalemKarari k={k} /></td>}
                {sonIslem && <td className={`${tdSinifi} py-1.5 text-right whitespace-nowrap`}>{sonIslem(k)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="sm:hidden divide-y" style={{ borderColor: B.cizgiAcik }}>
        {kalemler.map((k, i) => (
          <li key={k.id} className="px-4 py-3 flex items-start gap-3" style={{ borderColor: B.cizgiAcik }}>
            <span className="text-xs tabular-nums w-4 text-right pt-0.5" style={{ color: B.soluk }}>{i + 1}</span>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-medium break-words">{k.urun} {k.aciliyet === "acil" && <AcilEtiketi />}</p>
              <p className="mt-0.5" style={{ color: B.soluk }}>
                <b className="tabular-nums" style={{ color: B.metin }}>{miktarYaz(k.miktar)} {BIRIMLER[k.birim] ?? k.birim}</b> · {KATEGORILER[k.kategori] ?? k.kategori} · {k.talep_eden}
              </p>
              {k.aciklama && <p className="text-xs mt-0.5 break-words" style={{ color: B.soluk }}>{k.aciklama}</p>}
              {karar && <div className="mt-1"><KalemKarari k={k} /></div>}
              {karar && k.karar === "reddedildi" && k.red_nedeni && <p className="text-xs mt-0.5" style={{ color: B.kirmizi }}>Red nedeni: {k.red_nedeni}</p>}
            </div>
            {sonIslem && <div className="shrink-0">{sonIslem(k)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

function KalemKarari({ k }: { k: SaKalem }) {
  if (k.karar === "onaylandi") return <DurumEtiketi renk={B.yesil}>{k.alindi ? "Teslim alındı" : "Onaylandı"}</DurumEtiketi>;
  if (k.karar === "reddedildi") return <DurumEtiketi renk={B.kirmizi}>Reddedildi</DurumEtiketi>;
  return <DurumEtiketi renk={B.turuncu}>Bekliyor</DurumEtiketi>;
}

function FormDurumu({ l }: { l: SaListe }) {
  const o = listeOzeti(l);
  if (l.durum === "bekliyor") return <DurumEtiketi renk={B.turuncu}>Onay bekliyor</DurumEtiketi>;
  if (!o.onay) return <DurumEtiketi renk={B.kirmizi}>Reddedildi</DurumEtiketi>;
  if (l.cek_durumu === "tamamlandi") return <DurumEtiketi renk={B.yesil}>Tamamlandı · tümü teslim alındı</DurumEtiketi>;
  return <DurumEtiketi renk={B.yesil}>Onaylandı · {o.onay}/{o.toplam}{o.alinan ? ` · ${o.alinan} teslim alındı` : ""}</DurumEtiketi>;
}
