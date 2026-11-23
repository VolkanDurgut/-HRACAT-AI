"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, CheckSquare, ClipboardCheck, FileSpreadsheet, Loader2, Lock, Send, Square } from "lucide-react";
import { formlariGonder, gonderildiIsaretle, secimBilgisi, type SecimBilgisi, type SecimSonucu } from "@/lib/siparis-formu-secim-api";
import { ACCENT, CARD_BG, CARD_BORDER, PAGE_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * SIPARIS BILDIRIM FORMU - LOJISTIK SECIM SAYFASI (23.11.2026). GIRISSIZ (sabah mailindeki token, 3 gun).
 * Kullanici: "Onayi ve rezervasyonu alinmis yuklemeler Suleyman Bey'e mail gitse; Suleyman Bey oradan siparis bildirim formu
 * gonderilmesi gerekenleri secse. Birden fazla ayni anda secip gonder dediginde alici uretim@, CC bbt / export / sales / operation."
 * Liste her acilista GUNCEL hesaplanir (edge: gonderilen / isaretlenen / ilk konteyneri tartilan yukleme listeden cikar).
 * - Yalniz bilgileri tamam ("Hazir") formlar secilebilir; eksikler (cuval gorseli / spek / uretim / SKT) gosterilir.
 * - "Uretime gonder": secilenlerin formu (Excel + cuval gorseli) tek tek gider; sonuc satir satir yazilir.
 * - "Zaten gonderildi": elle (Excel indirip) gonderilmis formlar mail atmadan kapatilir (Siparisler'de "Kapatildi").
 * - Test modunda (lojistik canli degil) formlar YALNIZ test adresine gider, isaret kaydedilmez; sayfanin ustunde yazar.
 */

/** 23.11.2026 (kullanici: "Urun speklerini lojistik bilemez; export onaylayacak"): spek eksigi export onayi olarak yazilir. */
const eksikMetni = (e: string[]) => {
  const spek = e.includes("Ürün spekleri");
  const diger = e.filter((x) => x !== "Ürün spekleri");
  return [spek ? "Spek: export onayı bekleniyor" : "", diger.length ? `Eksik: ${diger.join(", ")}` : ""].filter(Boolean).join(" · ");
};
const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "-");
const saat = (t: string) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const kart = "rounded-xl border";
const kartStil = { backgroundColor: CARD_BG, borderColor: CARD_BORDER };

export default function SiparisFormuSecimSayfasi() {
  const { token } = useParams<{ token: string }>();
  const [bilgi, setBilgi] = useState<SecimBilgisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [isleniyor, setIsleniyor] = useState<null | "gonder" | "isaretle">(null);
  const [onay, setOnay] = useState<null | "gonder" | "isaretle">(null);
  const [sonuc, setSonuc] = useState<{ baslik: string; satirlar: SecimSonucu[]; test: boolean } | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const c = await secimBilgisi(String(token || ""));
    if (c.ok) { setBilgi(c.veri); setHata(null); } else setHata(c.hata);
    setYukleniyor(false);
  }, [token]);
  useEffect(() => { void yukle(); }, [yukle]);

  const satirlar = bilgi?.satirlar || [];
  const hazir = useMemo(() => satirlar.filter((s) => s.hazir), [satirlar]);
  const ad = useMemo(() => new Map(satirlar.map((s) => [s.anahtar, `${s.firma} · ${s.liman} · ${s.adet}`])), [satirlar]);
  const seciliListe = useMemo(() => satirlar.filter((s) => secili.has(s.anahtar)), [satirlar, secili]);
  const tumuSecili = hazir.length > 0 && hazir.every((s) => secili.has(s.anahtar));

  const degistir = (a: string) => setSecili((x) => { const y = new Set(x); if (y.has(a)) y.delete(a); else y.add(a); return y; });
  const tumunu = () => setSecili(tumuSecili ? new Set() : new Set(hazir.map((s) => s.anahtar)));

  const calistir = async (tur: "gonder" | "isaretle") => {
    const liste = seciliListe.map((s) => s.anahtar);
    if (!liste.length) return;
    setOnay(null); setIsleniyor(tur); setSonuc(null);
    const c = tur === "gonder" ? await formlariGonder(String(token), liste) : await gonderildiIsaretle(String(token), liste);
    setIsleniyor(null);
    if (!c.ok) { setSonuc({ baslik: c.hata, satirlar: [], test: !!bilgi?.test }); return; }
    setSonuc({ baslik: tur === "gonder" ? "Gönderim sonucu" : "İşaretleme sonucu", satirlar: c.veri.sonuclar, test: c.veri.test });
    setSecili(new Set());
    await yukle();
  };

  if (yukleniyor && !bilgi) {
    return <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: PAGE_BG }}><Loader2 className="animate-spin" size={22} style={{ color: ACCENT }} /></div>;
  }
  if (hata && !bilgi) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-white" style={{ backgroundColor: PAGE_BG }}>
        <div className={`${kart} max-w-md w-full p-6 text-center`} style={kartStil}>
          <Lock className="mx-auto mb-3" size={26} style={{ color: TEXT_MUTED }} />
          <p className="text-sm">{hata}</p>
        </div>
      </div>
    );
  }
  if (!bilgi) return null;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <header className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: CARD_BORDER }}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>UNEX-AI · Lojistik</div>
            <h1 className="text-lg sm:text-xl font-semibold mt-1">Sipariş bildirim formu bekleyen yüklemeler</h1>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
              Rezervasyonu alınmış, yüklemesi başlamamış ve formu üretime gitmemiş yüklemeler · {trTarih(bilgi.tarih)}
            </p>
          </div>
          <FileSpreadsheet size={26} style={{ color: ACCENT }} className="shrink-0" />
        </header>

        {bilgi.test && (
          <div className="mt-4 rounded-lg border px-3 py-2 text-xs flex items-start gap-2" style={{ borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.08)", color: "#FCD34D" }} data-testid="test-seridi">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span><b>TEST</b> · Seçilen formlar yalnızca test adresine gider ({bilgi.alicilar.join(", ") || "tanımlı değil"}); “Zaten gönderildi” işareti kaydedilmez.</span>
          </div>
        )}
        {!bilgi.test && (
          <p className="mt-4 text-xs" style={{ color: TEXT_MUTED }}>
            Form gidecek: <span className="text-white">{bilgi.alicilar.join(", ")}</span>{bilgi.cc.length ? <> · CC: <span className="text-white">{bilgi.cc.join(", ")}</span></> : null}
          </p>
        )}

        {sonuc && (
          <div className={`${kart} mt-4 p-3`} style={kartStil} data-testid="sonuc">
            <div className="text-sm font-semibold">{sonuc.baslik}{sonuc.test && sonuc.satirlar.length ? " (test)" : ""}</div>
            <ul className="mt-2 space-y-1">
              {sonuc.satirlar.map((s) => (
                <li key={s.booking} className="text-xs flex items-start gap-2">
                  {s.gonderildi || s.isaretlendi ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />}
                  <span><span className="text-white">{ad.get(s.booking) || s.booking}</span> — {s.gonderildi ? (s.test ? "test adresine gönderildi" : "üretime gönderildi") : s.isaretlendi ? "gönderildi olarak işaretlendi" : s.atlandi}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={tumunu} disabled={!hazir.length || !!isleniyor}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: CARD_BORDER }}>
            {tumuSecili ? <CheckSquare size={14} /> : <Square size={14} />} Hazır olanların tümü ({hazir.length})
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setOnay("isaretle")} disabled={!seciliListe.length || !!isleniyor}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-40" style={{ borderColor: CARD_BORDER }} data-testid="isaretle">
            {isleniyor === "isaretle" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Zaten gönderildi
          </button>
          <button type="button" onClick={() => setOnay("gonder")} disabled={!seciliListe.length || !!isleniyor}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }} data-testid="gonder">
            {isleniyor === "gonder" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Seçilenleri üretime gönder ({seciliListe.length})
          </button>
        </div>

        {onay && (
          <div className={`${kart} mt-3 p-3 text-xs`} style={{ ...kartStil, borderColor: "rgba(16,185,129,0.45)" }} data-testid="onay">
            <p className="text-white">
              {onay === "gonder"
                ? <>{seciliListe.length} yüklemenin formu {bilgi.test ? <b>test adresine</b> : <><b>{bilgi.alicilar.join(", ")}</b>{bilgi.cc.length ? ` (CC: ${bilgi.cc.join(", ")})` : ""}</>} gönderilecek. Onaylıyor musunuz?</>
                : <>{seciliListe.length} yükleme mail gönderilmeden “gönderildi” olarak işaretlenecek{bilgi.test ? " (test: kaydedilmez)" : ""}. Onaylıyor musunuz?</>}
            </p>
            <ul className="mt-2 list-disc pl-5" style={{ color: TEXT_MUTED }}>{seciliListe.map((s) => <li key={s.anahtar}>{s.firma} · {s.liman} · {s.adet} · ekipman {trTarih(s.ekipman)}</li>)}</ul>
            <div className="mt-3 flex gap-2 justify-end">
              <button type="button" onClick={() => setOnay(null)} className="rounded-lg border px-3 py-1.5" style={{ borderColor: CARD_BORDER }}>Vazgeç</button>
              <button type="button" onClick={() => void calistir(onay)} className="rounded-lg px-3 py-1.5 font-semibold text-white" style={{ backgroundColor: ACCENT }}>Onayla</button>
            </div>
          </div>
        )}

        <div className={`${kart} mt-3 overflow-hidden`} style={kartStil}>
          {!satirlar.length && <p className="p-6 text-sm text-center" style={{ color: TEXT_MUTED }}>Formu bekleyen yükleme kalmadı.</p>}
          <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
            {satirlar.map((s) => {
              const sec = secili.has(s.anahtar);
              return (
                <li key={s.anahtar} className="px-3 py-3 flex items-start gap-3" style={{ borderColor: CARD_BORDER }} data-secim-satir={s.hazir ? "hazir" : "eksik"}>
                  <button type="button" onClick={() => s.hazir && degistir(s.anahtar)} disabled={!s.hazir || !!isleniyor} aria-label="Seç"
                    className="mt-0.5 shrink-0 disabled:opacity-30" title={s.hazir ? "Seç" : eksikMetni(s.eksikler)}>
                    {sec ? <CheckSquare size={18} style={{ color: ACCENT }} /> : <Square size={18} style={{ color: TEXT_MUTED }} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-white truncate">{s.firma}</span>
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>{s.liman} · {s.adet}{s.urun ? ` · ${s.urun}` : ""}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px]" style={{ color: TEXT_MUTED }}>
                      <span>Boş ekipman: <span className="text-white">{trTarih(s.ekipman)}</span></span>
                      <span>ETD: <span className="text-white">{trTarih(s.etd)}</span></span>
                      <span className="truncate">Booking: <span className="text-white">{s.booking}</span></span>
                      {s.gemi && <span className="truncate">Gemi: <span className="text-white">{s.gemi}</span></span>}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${s.hazir ? "text-emerald-300" : "text-amber-300"}`}
                    style={{ backgroundColor: s.hazir ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)" }} title={s.hazir ? "" : "Siparişler › Sipariş Formları'nda tamamlanır"}>
                    {s.hazir ? "Hazır" : eksikMetni(s.eksikler)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {bilgi.islenen.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: TEXT_MUTED }}>Bu listeden işlenenler</div>
            <ul className={`${kart} divide-y`} style={kartStil}>
              {bilgi.islenen.map((g, i) => (
                <li key={`${g.booking}-${i}`} className="px-3 py-2 text-xs flex justify-between gap-2" style={{ borderColor: CARD_BORDER }}>
                  <span className="text-white">{g.booking}</span>
                  <span style={{ color: TEXT_MUTED }}>{g.durum === "gonderildi" ? "Üretime gönderildi" : g.durum === "test" ? "Test adresine gönderildi" : "Gönderildi olarak işaretlendi"} · {saat(g.zaman)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-6 text-[11px] text-center" style={{ color: TEXT_MUTED }}>Kaynak: Yükleme Planı · ilk konteyneri tartılan yükleme listeden çıkar · bağlantı 3 gün geçerlidir.</p>
      </div>
    </div>
  );
}
