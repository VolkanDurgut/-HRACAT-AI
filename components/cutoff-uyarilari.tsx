"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BellRing, BellPlus, ChevronDown, ChevronUp, Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useSimdi } from "@/lib/use-simdi";
import { cutoffZamanMs, formatCutoffTarih, formatCutoffSaat, formatKalanSure, CUTOFF_UYARI_ESIGI_MS } from "@/lib/cutoff-utils";
import { buildDraftHatirlatmaMailtoUrl } from "@/lib/draft-onay-mail";
import { draftYanitSonuMs, formatIstanbulTarihSaat } from "@/lib/draft-onay-sure";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Uygulama geneli SURE UYARISI (talep: 01.10.2026): cut-off'lar + Draft Onay
 * 48 saatlik musteri yanit suresi (ayni 10 saat esigi, ayni bildirim yolu).
 *
 * Acik dosyalarin TUM rezervasyonlarindaki Talimat / Beyanname cut-off'larindan
 * son 10 saate girmis (ve henuz gecmemis) olanlari her sayfanin ustunde
 * listeler. Her cut-off icin BIR KEZ masaustu bildirimi (izin verildiyse) +
 * uygulama ici uyari cikar; tekrar gosterilmemesi icin localStorage'da
 * isaretlenir (anahtar cut-off degerini de icerir: cut-off kaydirilirsa yeni
 * deger icin tekrar bildirilir).
 *
 * Musteri draft onayi henuz alinmamissa "Hatirlatma maili" ile, Draft Onay
 * mailiyle ayni alici + CC listesine hazir bir hatirlatma taslagi acilir.
 *
 * SINIR: Bu bir tarayici ozelligidir - bildirim icin uygulamanin bir sekmede
 * acik olmasi gerekir. Veri 5 dakikada bir, sayfa degisiminde ve sekmeye
 * donuldugunde yenilenir; geri sayim saniye saniye istemci tarafinda isler.
 */

type DosyaOzet = {
  id: string;
  dosya_no: string;
  proforma_no: string | null;
  alici_firma: string | null;
  alici_email: string | null;
  draft_mail_gonderildi: boolean | null;
  draft_mail_gonderildi_tarihi: string | null;
  draft_musteri_onayi_alindi: boolean | null;
  draft_revize_istendi: boolean | null;
};

type RezOzet = {
  id: string;
  dosya_id: string;
  booking_no: string | null;
  talimat_cutoff: string | null;
  beyanname_cutoff: string | null;
};

/**
 * Talimat / Beyanname: rezervasyondaki cut-off (deger = ham cut-off metni).
 * Draft: 48 saatlik musteri draft onay suresi (talep: 01.10.2026) - deger yok,
 * bitis ani lib/draft-onay-sure.ts'den gelir; rez booking no icin ilk
 * rezervasyondur (olmayabilir).
 */
type CutoffKalemi = {
  anahtar: string;
  tur: "Talimat" | "Beyanname" | "Draft";
  deger: string | null;
  hedefMs: number;
  dosya: DosyaOzet;
  rez: RezOzet | null;
};

function kalemEtiketi(k: CutoffKalemi): string {
  return k.tur === "Draft" ? "Draft Onay 48s" : `${k.tur} C/O`;
}

/** Kalemin bitis ani, Turkiye saatiyle { tarih, saat }. */
function kalemZamani(k: CutoffKalemi): { tarih: string; saat: string } {
  if (k.tur !== "Draft" && k.deger) return { tarih: formatCutoffTarih(k.deger), saat: formatCutoffSaat(k.deger) };
  const [tarih, saat] = formatIstanbulTarihSaat(k.hedefMs).split(" ");
  return { tarih, saat };
}

const YENILEME_MS = 5 * 60 * 1000;
const BILDIRIM_DEPO_ANAHTARI = "cutoff-bildirimleri-v1";
const DARALT_DEPO_ANAHTARI = "cutoff-uyari-daraltildi";
const BILDIRIM_SAKLAMA_MS = 7 * 24 * 60 * 60 * 1000;

function gosterilenleriOku(): Record<string, number> {
  try {
    const ham = window.localStorage.getItem(BILDIRIM_DEPO_ANAHTARI);
    return ham ? (JSON.parse(ham) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function gosterilenleriYaz(kayit: Record<string, number>) {
  try {
    const sinir = Date.now() - BILDIRIM_SAKLAMA_MS;
    const temiz: Record<string, number> = {};
    Object.entries(kayit).forEach(([k, t]) => { if (t > sinir) temiz[k] = t; });
    window.localStorage.setItem(BILDIRIM_DEPO_ANAHTARI, JSON.stringify(temiz));
  } catch {
    /* depolama kapali - en kotu ihtimalle bildirim tekrar gosterilir */
  }
}

function bildirimDestekleniyor(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Masaustu bildirim izni butonu - izin henuz sorulmadiysa gorunur. */
export function BildirimIzniButonu() {
  const [izin, setIzin] = useState<NotificationPermission | "yok">("yok");
  useEffect(() => {
    if (bildirimDestekleniyor()) setIzin(Notification.permission);
  }, []);
  if (izin !== "default") return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const sonuc = await Notification.requestPermission();
          setIzin(sonuc);
        } catch {
          setIzin("denied");
        }
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:border-slate-500 whitespace-nowrap"
      style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: CARD_BG }}
      title="Cut-off'a 10 saat kala masaüstü bildirimi almak için izin verin"
    >
      <BellPlus size={13} /> Cut-off bildirimlerini aç
    </button>
  );
}

export default function CutoffUyarilari() {
  const { user, companyId, yetkiler } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const simdi = useSimdi();

  const [dosyalar, setDosyalar] = useState<DosyaOzet[]>([]);
  const [rezler, setRezler] = useState<RezOzet[]>([]);
  const [daraltildi, setDaraltildi] = useState(false);
  const istekNo = useRef(0);

  const yetkili = !!(yetkiler.sayfa_yetkileri.panel || yetkiler.sayfa_yetkileri.draft_onay);

  useEffect(() => {
    try { setDaraltildi(window.sessionStorage.getItem(DARALT_DEPO_ANAHTARI) === "1"); } catch { /* yok say */ }
  }, []);

  const verileriGetir = useCallback(async () => {
    if (!user?.id || !companyId || !yetkili) return;
    const no = ++istekNo.current;
    const { data: dData, error: dHata } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, proforma_no, alici_firma, alici_email:ham_veri->>alici_email, draft_mail_gonderildi, draft_mail_gonderildi_tarihi, draft_musteri_onayi_alindi, draft_revize_istendi")
      .eq("company_id", companyId)
      .or("durum.eq.Açık,durum.eq.Acik")
      .returns<DosyaOzet[]>();
    if (dHata || !dData) return; // gecici hata: eldeki liste korunur, sonraki turda tekrar denenir
    const ids = dData.map((d) => d.id);
    let rData: RezOzet[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from("rezervasyonlar")
        .select("id, dosya_id, booking_no, talimat_cutoff, beyanname_cutoff")
        .in("dosya_id", ids)
        .eq("company_id", companyId)
        .returns<RezOzet[]>();
      if (error) return;
      rData = data || [];
    }
    if (no !== istekNo.current) return; // daha yeni bir istek baslamis
    setDosyalar(dData);
    setRezler(rData);
  }, [user?.id, companyId, yetkili]);

  // Ilk yukleme + sayfa degisimi + periyodik + sekmeye donus
  useEffect(() => { verileriGetir(); }, [verileriGetir, pathname]);
  useEffect(() => {
    const zamanlayici = setInterval(verileriGetir, YENILEME_MS);
    const gorunurluk = () => { if (document.visibilityState === "visible") verileriGetir(); };
    document.addEventListener("visibilitychange", gorunurluk);
    return () => { clearInterval(zamanlayici); document.removeEventListener("visibilitychange", gorunurluk); };
  }, [verileriGetir]);

  // Son 10 saate girmis, henuz gecmemis cut-off'lar ve draft onay sureleri (en yakin once)
  const kalemler = useMemo<CutoffKalemi[]>(() => {
    const dosyaMap = new Map(dosyalar.map((d) => [d.id, d]));
    const liste: CutoffKalemi[] = [];
    rezler.forEach((rez) => {
      const dosya = dosyaMap.get(rez.dosya_id);
      if (!dosya) return;
      ([["Talimat", rez.talimat_cutoff], ["Beyanname", rez.beyanname_cutoff]] as const).forEach(([tur, deger]) => {
        if (!deger) return;
        const hedefMs = cutoffZamanMs(deger);
        if (hedefMs === null) return;
        const kalan = hedefMs - simdi;
        if (kalan > 0 && kalan <= CUTOFF_UYARI_ESIGI_MS) {
          liste.push({ anahtar: `${rez.id}:${tur}:${deger}`, tur, deger, hedefMs, dosya, rez });
        }
      });
    });
    // Draft onay: musteriye gonderildi, onay/revize yok, 48 saatin son 10 saati.
    // Anahtar gonderim anini icerir: revize sonrasi yeniden gonderilirse yeni
    // sure icin tekrar bildirilir.
    dosyalar.forEach((dosya) => {
      const hedefMs = draftYanitSonuMs(dosya);
      if (hedefMs === null) return;
      const kalan = hedefMs - simdi;
      if (kalan > 0 && kalan <= CUTOFF_UYARI_ESIGI_MS) {
        const rez = rezler.find((r) => r.dosya_id === dosya.id) || null;
        liste.push({ anahtar: `draft:${dosya.id}:${dosya.draft_mail_gonderildi_tarihi}`, tur: "Draft", deger: null, hedefMs, dosya, rez });
      }
    });
    return liste.sort((a, b) => a.hedefMs - b.hedefMs);
  }, [dosyalar, rezler, simdi]);

  // Yeni giren her cut-off icin bir kez bildir
  const anahtarDizisi = kalemler.map((k) => k.anahtar).join("|");
  useEffect(() => {
    if (kalemler.length === 0) return;
    const gosterilenler = gosterilenleriOku();
    const yeniler = kalemler.filter((k) => !gosterilenler[k.anahtar]);
    if (yeniler.length === 0) return;
    yeniler.forEach((k) => {
      gosterilenler[k.anahtar] = Date.now();
      const z = kalemZamani(k);
      const draft = k.tur === "Draft";
      const baslik = draft ? "Draft onay süresi doluyor" : `${k.tur} cut-off yaklaşıyor`;
      const govde =
        `${k.dosya.proforma_no || k.dosya.dosya_no} · ${k.dosya.alici_firma || ""}\n` +
        (draft
          ? `Müşteri onayı gelmedi · 48s süre ${z.tarih} ${z.saat} · kalan ${formatKalanSure(k.hedefMs - Date.now())}`
          : `Cut-off: ${z.tarih} ${z.saat} · kalan ${formatKalanSure(k.hedefMs - Date.now())}`);
      const hedefSayfa = draft ? "/draft-onay" : `/dosya/${k.dosya.id}`;
      if (bildirimDestekleniyor() && Notification.permission === "granted") {
        try {
          const n = new Notification(baslik, { body: govde, tag: k.anahtar });
          n.onclick = () => { window.focus(); router.push(hedefSayfa); n.close(); };
        } catch { /* bazi tarayicilar (mobil) yapici ile bildirime izin vermez */ }
      }
    });
    gosterilenleriYaz(gosterilenler);
    showToast(
      yeniler.length === 1
        ? `${yeniler[0].tur === "Draft" ? "Draft onay süresine" : `${yeniler[0].tur} cut-off'a`} 10 saatten az kaldı: ${yeniler[0].dosya.proforma_no || yeniler[0].dosya.dosya_no}`
        : `${yeniler.length} süre uyarısı: 10 saatten az kaldı`,
      "error"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtarDizisi]);

  if (!yetkili || kalemler.length === 0) return null;

  const draftSayisi = kalemler.filter((k) => k.tur === "Draft").length;
  const cutoffSayisi = kalemler.length - draftSayisi;

  const daraltDegistir = () => {
    const yeni = !daraltildi;
    setDaraltildi(yeni);
    try { window.sessionStorage.setItem(DARALT_DEPO_ANAHTARI, yeni ? "1" : "0"); } catch { /* yok say */ }
  };

  return (
    <section
      className="mb-4 rounded-xl border overflow-hidden animate-fade-in"
      style={{ backgroundColor: CARD_BG, borderColor: "rgba(248,113,113,0.35)" }}
      aria-label="Süre uyarıları"
      data-testid="cutoff-uyarilari"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ borderColor: CARD_BORDER, background: "linear-gradient(90deg, rgba(248,113,113,0.10), transparent 60%)" }}>
        <span className="relative flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ backgroundColor: "rgba(248,113,113,0.14)" }}>
          <BellRing size={14} className="text-red-400" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-400 animate-ping" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">{draftSayisi > 0 && cutoffSayisi === 0 ? "Draft onay uyarısı" : draftSayisi > 0 ? "Süre uyarısı" : "Cut-off uyarısı"}</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            {[cutoffSayisi > 0 ? `${cutoffSayisi} cut-off` : null, draftSayisi > 0 ? `${draftSayisi} draft onayı` : null].filter(Boolean).join(" · ")} için 10 saatten az kaldı
          </p>
        </div>
        <button
          type="button"
          onClick={daraltDegistir}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: TEXT_MUTED }}
          title={daraltildi ? "Genişlet" : "Daralt"}
        >
          {daraltildi ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {!daraltildi && (
        <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
          {kalemler.map((k) => {
            const kalan = k.hedefMs - simdi;
            const draft = k.tur === "Draft";
            const onayAlindi = !!k.dosya.draft_musteri_onayi_alindi;
            const z = kalemZamani(k);
            const mailto = buildDraftHatirlatmaMailtoUrl({
              proformaNo: k.dosya.proforma_no,
              bookingNo: k.rez?.booking_no || null,
              aliciEmail: k.dosya.alici_email,
              talimatCutoff: k.rez?.talimat_cutoff || null,
              beyannameCutoff: k.rez?.beyanname_cutoff || null,
              // Draft kaleminde mail 48 saat suresini ve "deemed approved" kuralini hatirlatir
              yanitSonuMs: draft ? k.hedefMs : null,
            });
            return (
              <li key={k.anahtar} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" style={{ borderColor: CARD_BORDER }}>
                <div className="flex items-center gap-2 min-w-[150px]">
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap" style={{ color: "#F87171", borderColor: "rgba(248,113,113,0.35)" }}>
                    {kalemEtiketi(k)}
                  </span>
                  <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                    {z.tarih} · <span className="text-slate-300 font-medium">{z.saat}</span>
                  </span>
                </div>

                <div className="min-w-0 flex-1 basis-[200px]">
                  <p className="text-xs font-semibold truncate" style={{ color: ACCENT }}>
                    {k.dosya.proforma_no || k.dosya.dosya_no}
                    <span className="font-normal text-white"> · {k.dosya.alici_firma || "—"}</span>
                  </p>
                  <p className="text-[10px] font-mono truncate" style={{ color: TEXT_MUTED }}>{k.rez?.booking_no || "Booking no yok"}</p>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: "#F87171", backgroundColor: "rgba(248,113,113,0.10)", borderColor: "rgba(248,113,113,0.40)" }}>
                  {formatKalanSure(kalan)}
                </span>

                <div className="flex items-center gap-1.5 ml-auto">
                  {onayAlindi ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 whitespace-nowrap">
                      <CheckCircle2 size={13} /> Müşteri onayı alındı
                    </span>
                  ) : (
                    <>
                      <span className="hidden lg:inline text-[10px] whitespace-nowrap" style={{ color: k.dosya.draft_mail_gonderildi ? "#FBBF24" : TEXT_MUTED }}>
                        {k.dosya.draft_mail_gonderildi ? "Müşteri onayı bekleniyor" : "Draft gönderildi işaretli değil"}
                      </span>
                      <a
                        href={mailto}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:bg-white/5 whitespace-nowrap text-white"
                        style={{ borderColor: CARD_BORDER }}
                        title={k.dosya.alici_email ? `Hatırlatma maili: ${k.dosya.alici_email}` : "Müşteri e-postası dosyada kayıtlı değil - alıcıyı mailde elle girin"}
                      >
                        <Mail size={12} /> Hatırlatma maili
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(draft ? "/draft-onay" : `/dosya/${k.dosya.id}`)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {draft ? "Draft Onay" : "Dosya"} <ArrowRight size={12} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
