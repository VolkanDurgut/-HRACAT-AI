"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, History, Info, Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  AcilEtiketi, B, BelgeSayfasi, BilgiAlani, DurumEtiketi, Panel, TestSeridi,
  dugmeAna, dugmeIkincil, girdiSinifi, girdiStil, tdSinifi, thSinifi,
} from "@/components/satin-alma-belge";
import { satinAlmaCagir, miktarOku } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import {
  BIRIMLER, KATEGORILER, adSoyadDuzelt, adSoyadGecerli, listeOzeti, miktarBirim, miktarYaz, saTarih, urunEslesme, urunNorm,
  type Birim, type Kategori, type SaKalem, type SaListe, type SaUrun,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * Departman SATIN ALMA TALEP FORMU (26.10.2026; kurumsal yeniden tasarim 27.10.2026)
 * GIRISSIZ, departmana ozel kalici baglanti. Departmanin ORTAK taslak formu: ayni
 * departmandan birden fazla kisi farkli zamanlarda kalem ekleyebilir. "Formu gonder"
 * -> SA-YYYY-NNNN numarasi, execution@ + bbt@'ye e-posta (TEST departmaninda SADECE
 * test adresine); Burak Bey kalem bazinda onaylar / reddeder, sonuc "Gonderilen
 * talep formlari"nda gorunur. Veritabanina dogrudan erisim YOK (edge function
 * "satin-alma", lib/satin-alma/api.ts).
 * 28.10.2026: urun adi yazilirken "Daha once siparis verilen urunler" onerilir (secilince
 * kategori + birim dolar); ayni formda ayni urun ikinci satir olarak eklenmez ("Mevcut
 * kalemi X yap" ile miktar artirilir; sunucu da engeller); urun departmanin baska bir
 * formunda onay bekliyorsa ya da son 30 gunde onaylandiysa bilgi notu gosterilir.
 */

type OnayliAlim = Pick<SaKalem, "id" | "kategori" | "urun" | "miktar" | "birim" | "talep_eden"> & { liste_no: string; karar_zamani: string };
type Bilgi = { departman: string; test?: boolean; sirket: string | null; taslak: SaListe | null; gecmis: SaListe[]; onaylananlar?: OnayliAlim[] };

// 27.10.2026: ad tarayicida HATIRLANMAZ (kullanici: "her departman isim belirtmeli,
// Volkan Durgut olarak gelmemeli"). Eski surumun kaydettigi deger ilk acilista silinir.
const ESKI_AD_ANAHTARI = "sa-talep-ad";
const ALIM_SAYFA = 15;

type Form = { kategori: Kategori | ""; urun: string; miktar: string; birim: Birim; aciliyet: "normal" | "acil"; aciklama: string };
const BOS_FORM: Form = { kategori: "", urun: "", miktar: "", birim: "adet", aciliyet: "normal", aciklama: "" };

const OTUZ_GUN_MS = 30 * 24 * 60 * 60 * 1000;

/** Yazilan urun icin form ici / gecmis kontrolu (urunEslesme: "ayni" ya da "benzer"). */
type UrunKontrolu = {
  mukerrer: SaKalem | null;
  benzer: SaKalem[];
  bekleyen: { liste_no: string | null; kalem: SaKalem }[];
  onaylanan: OnayliAlim[];
};
function urunKontrolu(urun: string, bilgi: Bilgi | null): UrunKontrolu | null {
  if (!bilgi || urunNorm(urun).length < 2) return null;
  let mukerrer: SaKalem | null = null;
  const benzer: SaKalem[] = [];
  for (const k of bilgi.taslak?.kalemler ?? []) {
    const e = urunEslesme(urun, k.urun);
    if (e === "ayni" && !mukerrer) mukerrer = k;
    else if (e) benzer.push(k);
  }
  const bekleyen = bilgi.gecmis.filter((l) => l.durum === "bekliyor")
    .flatMap((l) => l.kalemler.filter((k) => urunEslesme(urun, k.urun)).map((kalem) => ({ liste_no: l.liste_no, kalem })));
  const sinir = Date.now() - OTUZ_GUN_MS;
  const onaylanan = (bilgi.onaylananlar ?? []).filter((a) => new Date(a.karar_zamani).getTime() >= sinir && urunEslesme(urun, a.urun));
  return mukerrer || benzer.length || bekleyen.length || onaylanan.length ? { mukerrer, benzer, bekleyen, onaylanan } : null;
}

const bugun = () => new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });

export default function TalepSayfasi({ params }: { params: { token: string } }) {
  const [bilgi, setBilgi] = useState<Bilgi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [sayfaHatasi, setSayfaHatasi] = useState<string | null>(null);

  const [ad, setAd] = useState("");
  const [gonderen, setGonderen] = useState("");
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
  const [urunler, setUrunler] = useState<SaUrun[]>([]);
  const [birlesiyor, setBirlesiyor] = useState(false);
  const [formBilgisi, setFormBilgisi] = useState<string | null>(null);

  useEffect(() => { try { window.localStorage.removeItem(ESKI_AD_ANAHTARI); } catch { /* yoksay */ } }, []);

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

  // Daha once siparis verilen urunler (oneri listesi). Hata sessiz: form oneri olmadan da calisir.
  const urunleriGetir = useCallback(async () => {
    if (!tokenBicimiGecerli(params.token)) return;
    const r = await satinAlmaCagir<{ urunler: SaUrun[] }>({ islem: "urunler", token: params.token });
    if (r.ok && Array.isArray(r.veri.urunler)) setUrunler(r.veri.urunler);
  }, [params.token]);
  useEffect(() => { urunleriGetir(); }, [urunleriGetir]);

  const kontrol = useMemo(() => urunKontrolu(form.urun, bilgi), [form.urun, bilgi]);

  const alan = <K extends keyof Form>(k: K, v: Form[K]) => { setFormBilgisi(null); setForm((f) => ({ ...f, [k]: v })); };

  // Oneriden secim: ad + kategori + birim dolar, imlec miktara gecer
  const urunSec = (u: SaUrun) => {
    setFormBilgisi(null);
    setForm((f) => ({
      ...f, urun: u.ad,
      kategori: u.kategori in KATEGORILER ? u.kategori : f.kategori,
      birim: u.birim in BIRIMLER ? u.birim : f.birim,
    }));
    setTimeout(() => document.getElementById("sa-miktar")?.focus(), 0);
  };

  // Mukerrer: yeni satir yerine mevcut kalemin miktari artirilir
  const birlestir = async (mevcut: SaKalem, eklenecek: number) => {
    setFormHatasi(null);
    const toplam = Math.round((Number(mevcut.miktar) + eklenecek) * 100) / 100;
    if (toplam > 1_000_000) { setFormHatasi("Toplam miktar çok büyük."); return; }
    setBirlesiyor(true);
    const r = await satinAlmaCagir({ islem: "kalem_miktar", token: params.token, kalem_id: mevcut.id, miktar: toplam, acil: form.aciliyet === "acil" });
    setBirlesiyor(false);
    if (!r.ok) { setFormHatasi(r.hata); getir(true); return; }
    setForm((f) => ({ ...BOS_FORM, kategori: f.kategori, birim: f.birim }));
    setFormBilgisi(`${mevcut.urun}: miktar ${miktarBirim({ miktar: toplam, birim: mevcut.birim })} olarak güncellendi.`);
    getir(true);
    setTimeout(() => document.getElementById("sa-urun")?.focus(), 0);
  };

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormHatasi(null);
    setFormBilgisi(null);
    setGonderimSonucu(null);
    const miktar = miktarOku(form.miktar);
    // Ayni formda ayni urun: eklenmez, uyari kutusundaki "Mevcut kalemi ... yap" kullanilir
    // (uyari kutusu zaten acik; dugme varsa odak oraya, yoksa miktar / birim alanina)
    if (kontrol?.mukerrer) {
      (document.getElementById("sa-birlestir") ?? document.getElementById(miktar === null ? "sa-miktar" : "sa-birim"))?.focus();
      return;
    }
    if (!adSoyadGecerli(ad)) { document.getElementById("sa-ad")?.focus(); return setFormHatasi("Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz)."); }
    if (!form.kategori) return setFormHatasi("Kategori seçin.");
    if (form.urun.trim().length < 2) return setFormHatasi("Ürün / hizmet tanımını yazın.");
    if (miktar === null) return setFormHatasi("Miktarı sayı olarak yazın (ör. 5 ya da 2,5).");
    setEkleniyor(true);
    const r = await satinAlmaCagir<{ id: string }>({
      islem: "kalem_ekle", token: params.token,
      kalem: { kategori: form.kategori, urun: form.urun.trim(), miktar, birim: form.birim, aciliyet: form.aciliyet, aciklama: form.aciklama.trim(), talep_eden: adSoyadDuzelt(ad) },
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
    if (!adSoyadGecerli(gonderen)) { setListeHatasi("Formu gönderen kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz)."); document.getElementById("sa-gonderen")?.focus(); return; }
    setGonderiliyor(true);
    const r = await satinAlmaCagir<{ liste_no: string; mail: string; test?: boolean }>({ islem: "gonder", token: params.token, gonderen: adSoyadDuzelt(gonderen) });
    setGonderiliyor(false);
    setGonderOnay(false);
    if (!r.ok) { setListeHatasi(r.hata); getir(true); return; }
    setGonderimSonucu(r.veri);
    getir(true);
    urunleriGetir();
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
        </Panel>

        {gonderimSonucu && (
          <div className="border rounded-[4px] px-4 py-3 flex items-start gap-2.5 text-sm" role="status" style={{ backgroundColor: B.yesilZemin, borderColor: "#B5D9C4" }}>
            <CheckCircle2 size={17} className="shrink-0 mt-0.5" style={{ color: B.yesil }} />
            <div>
              <p className="font-semibold" style={{ color: B.yesil }}>{gonderimSonucu.liste_no} numaralı talep formu gönderildi.</p>
              <p className="mt-0.5" style={{ color: B.metin }}>
                {gonderimSonucu.mail === "gonderildi"
                  ? (gonderimSonucu.test ? "Test modu: e-posta yalnızca test adresine gönderildi." : "Form onaya iletildi. Sonucu aşağıdaki “Gönderilen talep formları” tablosundan takip edebilirsiniz.")
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
                <input id="sa-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} autoComplete="off"
                  placeholder="Ad Soyad" className={girdiSinifi} style={girdiStil} />
              </Etiket>
              <Etiket metin="Kategori" htmlFor="sa-kategori" className="col-span-2 sm:col-span-3">
                <select id="sa-kategori" value={form.kategori} onChange={(e) => alan("kategori", e.target.value as Kategori)} className={girdiSinifi} style={girdiStil}>
                  <option value="">Seçiniz</option>
                  {(Object.keys(KATEGORILER) as Kategori[]).map((k) => <option key={k} value={k}>{KATEGORILER[k]}</option>)}
                </select>
              </Etiket>
              <Etiket metin="Ürün / hizmet tanımı" htmlFor="sa-urun" className="col-span-2 sm:col-span-6">
                <UrunGirdisi deger={form.urun} onDegis={(v) => alan("urun", v)} onSec={urunSec} urunler={urunler} />
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
            {kontrol && <KontrolNotlari kontrol={kontrol} miktar={miktarOku(form.miktar)} birim={form.birim} birlesiyor={birlesiyor} onBirlestir={birlestir} />}
            {formHatasi && <p className="mt-2.5 text-[13px] font-medium" role="alert" style={{ color: B.kirmizi }}>{formHatasi}</p>}
            {formBilgisi && <p className="mt-2.5 text-[13px] font-medium flex items-center gap-1.5" role="status" style={{ color: B.yesil }}><CheckCircle2 size={14} /> {formBilgisi}</p>}
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
                <div className="flex justify-end">
                  <button onClick={() => { setListeHatasi(null); setGonderen(adSoyadGecerli(ad) ? adSoyadDuzelt(ad) : ""); setGonderOnay(true); }} className={`${dugmeAna} w-full sm:w-auto`} style={{ backgroundColor: B.lacivert }}>
                    <Send size={14} /> Formu onaya gönder
                  </button>
                </div>
              ) : (
                <div className="border rounded-[4px] p-3.5 sm:p-4" style={{ borderColor: B.cizgi, backgroundColor: B.baslikZemin }}>
                  <p className="text-sm font-semibold">Talep formu onaya gönderilsin mi?</p>
                  <p className="text-[13px] mt-1" style={{ color: B.soluk }}>
                    {taslakOzet.toplam} kalem satın alma onayına gönderilecek.{bilgi.test ? " (Test modu: e-posta yalnızca test adresine gider.)" : ""} Gönderilen forma kalem eklenemez ya da silinemez; yeni kalemler yeni bir forma girer.
                  </p>
                  <label htmlFor="sa-gonderen" className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] mt-3 mb-1" style={{ color: B.soluk }}>Gönderen (ad soyad)</label>
                  <input id="sa-gonderen" value={gonderen} onChange={(e) => setGonderen(e.target.value)} maxLength={80} autoComplete="off"
                    placeholder="Ad Soyad" className={`${girdiSinifi} sm:max-w-xs`} style={girdiStil} />
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
            sag={<span className="text-xs" style={{ color: B.soluk }}>{alimlar.length} kalem</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: B.cizgi, color: B.soluk }}>
                    <th className={thSinifi}>Onay</th>
                    <th className={thSinifi}>Fiş no</th>
                    <th className={thSinifi}>Ürün / hizmet</th>
                    <th className={`${thSinifi} text-right`}>Miktar</th>
                    <th className={thSinifi}>Talep eden</th>
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

/**
 * Urun adi girisi + "Daha once siparis verilen urunler" onerisi (28.10.2026).
 * Erisilebilir combobox: yon tuslari / Enter / Esc; fareyle tiklama. Serbest yazim
 * her zaman serbest (oneri zorunlu degil).
 */
function UrunGirdisi({ deger, onDegis, onSec, urunler }: {
  deger: string; onDegis: (v: string) => void; onSec: (u: SaUrun) => void; urunler: SaUrun[];
}) {
  const [acik, setAcik] = useState(false);
  const [etkin, setEtkin] = useState(-1);
  const listeRef = useRef<HTMLUListElement>(null);
  const anahtarli = useMemo(() => urunler.map((u) => ({ u, kelimeler: urunNorm(u.ad).split(" ") })), [urunler]);
  const oneriler = useMemo(() => {
    const q = urunNorm(deger);
    if (q.length < 2) return [];
    const parcalar = q.split(" ");
    const uyan = anahtarli.filter((x) => parcalar.every((p) => x.kelimeler.some((w) => w.startsWith(p))));
    // Adin basi eslesenler once; sonra kullanim sirasi (sunucudan gelen sira korunur)
    const bas = uyan.filter((x) => urunNorm(x.u.ad).startsWith(q));
    const diger = uyan.filter((x) => !urunNorm(x.u.ad).startsWith(q));
    return [...bas, ...diger].slice(0, 8).map((x) => x.u);
  }, [deger, anahtarli]);
  const gorunur = acik && oneriler.length > 0;

  const sec = (u: SaUrun) => { onSec(u); setAcik(false); setEtkin(-1); };
  const tus = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!gorunur) { if (e.key === "ArrowDown" && oneriler.length) { setAcik(true); setEtkin(0); e.preventDefault(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setEtkin((i) => (i + 1) % oneriler.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setEtkin((i) => (i <= 0 ? oneriler.length - 1 : i - 1)); }
    else if (e.key === "Enter" && etkin >= 0) { e.preventDefault(); sec(oneriler[etkin]); }
    else if (e.key === "Escape") { setAcik(false); setEtkin(-1); }
  };
  useEffect(() => {
    if (etkin >= 0) listeRef.current?.querySelector<HTMLElement>(`[data-i="${etkin}"]`)?.scrollIntoView({ block: "nearest" });
  }, [etkin]);

  return (
    <div className="relative">
      <input id="sa-urun" value={deger} maxLength={200} autoComplete="off"
        role="combobox" aria-expanded={gorunur} aria-controls="sa-urun-oneri" aria-autocomplete="list"
        aria-activedescendant={gorunur && etkin >= 0 ? `sa-urun-oneri-${etkin}` : undefined}
        onChange={(e) => { onDegis(e.target.value); setAcik(true); setEtkin(-1); }}
        onFocus={() => setAcik(true)} onBlur={() => setTimeout(() => setAcik(false), 120)} onKeyDown={tus}
        placeholder="Ör. A4 fotokopi kağıdı 80 gr" className={girdiSinifi} style={girdiStil} />
      {gorunur && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 border rounded-[3px] bg-white shadow-lg overflow-hidden" style={{ borderColor: B.cizgi }}>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] flex items-center gap-1.5" style={{ color: B.soluk }}>
            <History size={11} /> Daha önce sipariş verilen ürünler
          </p>
          <ul id="sa-urun-oneri" ref={listeRef} role="listbox" aria-label="Daha önce sipariş verilen ürünler" className="max-h-64 overflow-y-auto pb-1">
            {oneriler.map((u, i) => (
              <li key={u.ad} id={`sa-urun-oneri-${i}`} data-i={i} role="option" aria-selected={i === etkin}
                onMouseDown={(e) => { e.preventDefault(); sec(u); }} onMouseEnter={() => setEtkin(i)}
                className="px-3 py-1.5 cursor-pointer" style={i === etkin ? { backgroundColor: "#EEF1F8" } : undefined}>
                <span className="block text-sm font-medium break-words" style={{ color: B.metin }}>{u.ad}</span>
                <span className="block text-[11px]" style={{ color: B.soluk }}>
                  {KATEGORILER[u.kategori] ?? u.kategori} · {BIRIMLER[u.birim] ?? u.birim} · {u.kullanim} kez talep edildi
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Yazilan urun icin uyari / bilgi notlari (mukerrer, onay bekleyen, son 30 gun). */
function KontrolNotlari({ kontrol, miktar, birim, birlesiyor, onBirlestir }: {
  kontrol: UrunKontrolu; miktar: number | null; birim: Birim; birlesiyor: boolean;
  onBirlestir: (mevcut: SaKalem, eklenecek: number) => void;
}) {
  const m = kontrol.mukerrer;
  const kalemMetni = (k: Pick<SaKalem, "urun" | "miktar" | "birim">) => `${k.urun} · ${miktarBirim(k)}`;
  return (
    <div className="mt-3 space-y-1.5" aria-live="polite">
      {m && (
        <div className="border-l-[3px] rounded-[3px] px-3 py-2.5 text-[13px]" style={{ borderColor: B.turuncu, backgroundColor: B.turuncuZemin }}>
          <p className="font-semibold flex items-start gap-1.5" style={{ color: B.turuncu }}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Bu ürün formda zaten var: {kalemMetni(m)} ({m.talep_eden})
          </p>
          <p className="mt-0.5 sm:ml-5" style={{ color: B.metin }}>Aynı ürün ikinci satır olarak eklenmez; mevcut kalemin miktarını artırın.</p>
          <div className="mt-2 sm:ml-5">
            {miktar === null ? (
              <p className="text-xs" style={{ color: B.soluk }}>Eklemek istediğiniz miktarı yazın; mevcut kaleme eklenir.</p>
            ) : m.birim !== birim ? (
              <p className="text-xs" style={{ color: B.soluk }}>Birim farklı (mevcut kalem: {BIRIMLER[m.birim] ?? m.birim}). Birimi aynı seçin ya da mevcut kalemi silip toplam miktarla yeniden ekleyin.</p>
            ) : (
              <button id="sa-birlestir" type="button" onClick={() => onBirlestir(m, miktar)} disabled={birlesiyor}
                className={`${dugmeAna} h-8 text-[13px]`} style={{ backgroundColor: B.turuncu }}>
                {birlesiyor ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Mevcut kalemi {miktarBirim({ miktar: Math.round((Number(m.miktar) + miktar) * 100) / 100, birim: m.birim })} yap
              </button>
            )}
          </div>
        </div>
      )}
      {kontrol.benzer.slice(0, 2).map((k) => (
        <BilgiNotu key={`b-${k.id}`} ikon={<Info size={13} />}>Formda benzer kalem var: <b>{kalemMetni(k)}</b> ({k.talep_eden})</BilgiNotu>
      ))}
      {kontrol.bekleyen.slice(0, 2).map((x) => (
        <BilgiNotu key={`p-${x.kalem.id}`} ikon={<Info size={13} />}>
          <b>{x.liste_no}</b> numaralı formunuzda onay bekliyor: <b>{kalemMetni(x.kalem)}</b>
        </BilgiNotu>
      ))}
      {kontrol.onaylanan.slice(0, 2).map((a) => (
        <BilgiNotu key={`o-${a.id}`} ikon={<History size={13} />}>
          {saTarih(a.karar_zamani).slice(0, 10)} tarihinde departmanınıza onaylandı: <b>{kalemMetni(a)}</b> <span style={{ color: B.soluk }}>({a.liste_no})</span>
        </BilgiNotu>
      ))}
      {(kontrol.benzer.length > 2 || kontrol.bekleyen.length > 2 || kontrol.onaylanan.length > 2) && (
        <p className="text-xs pl-3" style={{ color: B.soluk }}>Ve {Math.max(0, kontrol.benzer.length - 2) + Math.max(0, kontrol.bekleyen.length - 2) + Math.max(0, kontrol.onaylanan.length - 2)} kayıt daha.</p>
      )}
    </div>
  );
}

function BilgiNotu({ ikon, children }: { ikon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="border-l-[3px] rounded-[3px] px-3 py-2 text-[13px] flex items-start gap-1.5 break-words" style={{ borderColor: B.lacivert2, backgroundColor: "#F1F3F9", color: B.metin }}>
      <span className="shrink-0 mt-0.5" style={{ color: B.lacivert2 }}>{ikon}</span><span className="min-w-0">{children}</span>
    </p>
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
  if (k.karar === "onaylandi") return <DurumEtiketi renk={B.yesil}>Onaylandı</DurumEtiketi>;
  if (k.karar === "reddedildi") return <DurumEtiketi renk={B.kirmizi}>Reddedildi</DurumEtiketi>;
  return <DurumEtiketi renk={B.turuncu}>Bekliyor</DurumEtiketi>;
}

function FormDurumu({ l }: { l: SaListe }) {
  const o = listeOzeti(l);
  if (l.durum === "bekliyor") return <DurumEtiketi renk={B.turuncu}>Onay bekliyor</DurumEtiketi>;
  if (!o.onay) return <DurumEtiketi renk={B.kirmizi}>Reddedildi</DurumEtiketi>;
  return <DurumEtiketi renk={B.yesil}>Onaylandı · {o.onay}/{o.toplam}</DurumEtiketi>;
}
