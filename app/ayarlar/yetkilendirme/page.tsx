"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ConfirmDialog } from "@/components/confirm-dialog";
import AppShell from "@/components/app-shell";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Save, UserPlus, Clock, RefreshCw, Check, ChevronDown, RotateCcw } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * Yetkilendirme (super admin). 27.10.2026: kullanici listesi `yetki_kullanici_listesi`
 * RPC'sinden gelir (rol + kayit / son giris tarihi). @unex.com.tr adresleri Supabase'de
 * eklendigi an burada TUM yetkileri KAPALI olarak gorunur ("Yetki bekliyor"); diger
 * adresler "Onay bekleyen kullanicilar" bolumunde cikar ve "Unex'e ekle" ile alinir.
 * Rol (ihracat dosyasi verisini gorme) `yetki_rol_ata`, sayfa/sekme yetkileri
 * kullanici_yetkileri UPDATE (RLS: super admin + ayni sirket) ile kaydedilir.
 * 03.11.2026 (kullanici: "ekrana sigmiyor, saga kaydirmak gerekiyor; mobilde cok kotu"):
 * 17 sutunluk tablo (min 1560 px) yerine KULLANICI KARTI: ustte kullanici + rol + Kaydet /
 * Geri al, altta yetkiler kenar cubugundaki gruplarla (YETKI_GRUPLARI) sarilan dugmeler.
 * Yatay kaydirma yok. Mobilde kartlar alt alta, yetkiler "Yetkileri gor" ile acilir.
 * Kayit mantigi (rol RPC + kullanici_yetkileri UPDATE + yazmaHatasi) DEGISMEDI.
 */

type KullaniciYetki = {
  user_id: string;
  email: string;
  rol: string;
  olusturma: string | null;
  son_giris: string | null;
  sayfa_yetkileri: Record<string, boolean>;
  sekme_yetkileri: Record<string, boolean>;
};
type Bekleyen = { user_id: string; email: string; olusturma: string | null; son_giris: string | null };

// 28.10.2026: "dashboard" (eski Kontrol Merkezi) kaldirildi; Kontrol Merkezi = "analiz".
const SAYFA_ETIKETLER: Record<string, string> = {
  analiz:     "Kontrol Merkezi",
  panel:      "Ana Panel",
  yeni_dosya: "Proforma Yükle (yeni dosya)",
  ihracatlar: "İhracatlar",
  etd_eta:    "ETD/ETA",
  kantar:     "Kantar Paneli",
  ayarlar:    "Ayarlar",
  draft_onay: "İhracat Evrakları",
  ic_piyasa:  "İç Piyasa",
  proformalar: "Proforma Oluştur",
  proforma_imza: "Proforma İmzalama (Onayla ve İmzala)",
  satin_alma: "Satın Alma (talep onayı)",
  ic_alis:    "İç Piyasa Alış (tedarikçi ve alış fiyatları)",
};

const SEKME_ETIKETLER: Record<string, string> = {
  proforma:     "Proforma",
  evraklar:     "Sevkiyat Evrakları",
  rezervasyon:  "Rezervasyon",
  konteynerler: "Konteynerler",
};

/** Rol = veri erisimi. Yonetici / Ihracat / Muhasebe ihracat dosyalarinin VERISINI gorur (RLS). */
const ROLLER: { deger: string; etiket: string }[] = [
  { deger: "admin", etiket: "Yönetici" },
  { deger: "ihracat", etiket: "İhracat" },
  { deger: "muhasebe", etiket: "Muhasebe" },
  { deger: "sevkiyat", etiket: "Sevkiyat / Lojistik" },
  { deger: "kantar", etiket: "Kantar" },
  { deger: "uretim", etiket: "Üretim / Diğer" },
];
const DOSYA_GOREN_ROLLER = ["admin", "ihracat", "muhasebe"];

/** Kenar cubugu bolumleriyle ayni gruplama (components/sidebar.tsx). Her sayfa anahtari TAM bir grupta. */
const YETKI_GRUPLARI: { baslik: string; tip: "sayfa" | "sekme"; anahtarlar: string[] }[] = [
  { baslik: "İhracat", tip: "sayfa", anahtarlar: ["analiz", "panel", "proformalar", "proforma_imza", "yeni_dosya", "ihracatlar", "draft_onay"] },
  { baslik: "Operasyon", tip: "sayfa", anahtarlar: ["etd_eta", "kantar"] },
  { baslik: "Yurt İçi", tip: "sayfa", anahtarlar: ["ic_piyasa", "ic_alis"] },
  { baslik: "Şirket İçi", tip: "sayfa", anahtarlar: ["satin_alma"] },
  { baslik: "Yönetim", tip: "sayfa", anahtarlar: ["ayarlar"] },
  { baslik: "Dosya sekmeleri", tip: "sekme", anahtarlar: ["proforma", "evraklar", "rezervasyon", "konteynerler"] },
];

const tarih = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const yetkiVarMi = (k: Pick<KullaniciYetki, "sayfa_yetkileri">) => Object.values(k.sayfa_yetkileri || {}).some(Boolean);
const imza = (k: KullaniciYetki) => JSON.stringify([k.rol, Object.keys(SAYFA_ETIKETLER).map((x) => !!k.sayfa_yetkileri[x]), Object.keys(SEKME_ETIKETLER).map((x) => !!k.sekme_yetkileri[x])]);

/** Yetki dugmesi: etiket + anahtar; tum alan tiklanir (genis dokunma alani). */
function YetkiDugmesi({ value, onChange, etiket, ariaEtiket }: { value: boolean; onChange: (v: boolean) => void; etiket: string; ariaEtiket: string }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={ariaEtiket} onClick={() => onChange(!value)}
      className="w-full min-h-[38px] flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors hover:bg-white/[0.04]"
      style={{ borderColor: value ? "rgba(16,185,129,0.45)" : CARD_BORDER, backgroundColor: value ? "rgba(16,185,129,0.08)" : "transparent", color: value ? "#E6F4EE" : TEXT_MUTED }}>
      <span className="min-w-0 break-words leading-snug">{etiket}</span>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: value ? ACCENT : CARD_BORDER }} aria-hidden>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

function RolSecimi({ deger, onChange, disabled, etiket }: { deger: string; onChange: (v: string) => void; disabled?: boolean; etiket: string }) {
  return (
    <select value={deger} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={etiket}
      title={disabled ? "Kendi rolünüzü değiştiremezsiniz" : DOSYA_GOREN_ROLLER.includes(deger) ? "İhracat dosyalarının verisini görür" : "İhracat dosyalarının verisini görmez"}
      className="w-full px-2 py-1 border rounded-md text-xs text-white disabled:opacity-60" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
      {ROLLER.map((r) => <option key={r.deger} value={r.deger}>{r.etiket}</option>)}
    </select>
  );
}

export default function YetkilendirmePage() {
  const { user, companyId, isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [kullanicilar, setKullanicilar] = useState<KullaniciYetki[]>([]);
  const [kayitli, setKayitli] = useState<Record<string, string>>({}); // user_id -> son kaydedilen hal (imza)
  const [bekleyenler, setBekleyenler] = useState<Bekleyen[]>([]);
  const [bekleyenRol, setBekleyenRol] = useState<Record<string, string>>({});
  const [eklenecek, setEklenecek] = useState<Bekleyen | null>(null);
  const [ekleniyor, setEkleniyor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [orijinal, setOrijinal] = useState<Record<string, KullaniciYetki>>({}); // "Geri al" icin son kaydedilen hal
  const [acik, setAcik] = useState<Set<string>>(new Set()); // mobilde yetkileri acik kartlar

  // Bu sayfa sabit super-admin e-posta listesiyle korunur (lib/auth-context.tsx);
  // AppShell de ayni kontrolu yapar, buradaki ikinci katman (defense-in-depth).
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace("/panel");
  }, [authLoading, isSuperAdmin, router]);

  const fetchKullanicilar = useCallback(async (sessiz = false) => {
    if (!user?.id || !companyId || !isSuperAdmin) return;
    if (sessiz) setYenileniyor(true);
    const [lRes, bRes] = await Promise.all([
      supabase.rpc("yetki_kullanici_listesi"),
      supabase.rpc("yetki_bekleyen_kullanicilar"),
    ]);
    if (lRes.error) {
      setHata(`Kullanıcılar okunamadı: ${lRes.error.message}`);
    } else {
      const liste = ((lRes.data || []) as KullaniciYetki[]).map((k) => ({ ...k, sayfa_yetkileri: k.sayfa_yetkileri || {}, sekme_yetkileri: k.sekme_yetkileri || {} }));
      // Siz en ustte; sonra yetkisi henuz acilmamis (yeni) kullanicilar; sonra e-posta sirasi
      liste.sort((a, b) => {
        if (a.user_id === user.id) return -1;
        if (b.user_id === user.id) return 1;
        const ya = yetkiVarMi(a) ? 1 : 0; const yb = yetkiVarMi(b) ? 1 : 0;
        if (ya !== yb) return ya - yb;
        return (a.email || "").localeCompare(b.email || "");
      });
      setKullanicilar(liste);
      setKayitli(Object.fromEntries(liste.map((k) => [k.user_id, imza(k)])));
      setOrijinal(Object.fromEntries(liste.map((k) => [k.user_id, k])));
      setHata(null);
    }
    setBekleyenler(bRes.error ? [] : ((bRes.data || []) as Bekleyen[]));
    setLoading(false);
    setYenileniyor(false);
  }, [user?.id, companyId, isSuperAdmin]);

  useEffect(() => { fetchKullanicilar(); }, [fetchKullanicilar]);

  const degisti = useMemo(() => new Set(kullanicilar.filter((k) => kayitli[k.user_id] !== imza(k)).map((k) => k.user_id)), [kullanicilar, kayitli]);

  const guncelle = (userId: string, f: (k: KullaniciYetki) => KullaniciYetki) =>
    setKullanicilar((prev) => prev.map((k) => (k.user_id === userId ? f(k) : k)));

  const handleToggle = (userId: string, tip: "sayfa" | "sekme", key: string, value: boolean) =>
    guncelle(userId, (k) => tip === "sayfa"
      ? { ...k, sayfa_yetkileri: { ...k.sayfa_yetkileri, [key]: value } }
      : { ...k, sekme_yetkileri: { ...k.sekme_yetkileri, [key]: value } });

  const handleSave = async (userId: string) => {
    if (!companyId) return;
    const k = kullanicilar.find((x) => x.user_id === userId);
    if (!k) return;
    setSaving(userId);
    const onceki = kayitli[userId] ? JSON.parse(kayitli[userId])[0] : k.rol;
    if (k.rol !== onceki) {
      const { error } = await supabase.rpc("yetki_rol_ata", { p_user_id: userId, p_rol: k.rol });
      if (error) { showToast(`Rol kaydedilemedi: ${error.message}`, "error"); setSaving(null); return; }
    }
    // Tum anahtarlar acikca yazilir (eksik anahtar = kapali)
    const sayfa = Object.fromEntries(Object.keys(SAYFA_ETIKETLER).map((x) => [x, !!k.sayfa_yetkileri[x]]));
    const sekme = Object.fromEntries(Object.keys(SEKME_ETIKETLER).map((x) => [x, !!k.sekme_yetkileri[x]]));
    const { data, error } = await supabase
      .from("kullanici_yetkileri")
      .update({ sayfa_yetkileri: sayfa, sekme_yetkileri: sekme, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .select("id");
    // 0 satir guncellendiyse de (RLS) "kaydedildi" denmez (01.10.2026)
    const yazmaSorunu = yazmaHatasi(error, data);
    if (yazmaSorunu) showToast(`Yetkiler kaydedilemedi: ${yazmaSorunu}`, "error");
    else {
      setKayitli((s) => ({ ...s, [userId]: imza(k) }));
      setOrijinal((s) => ({ ...s, [userId]: k }));
      showToast(`${k.email}: yetkiler kaydedildi.`, "success");
    }
    setSaving(null);
  };

  const geriAl = (userId: string) => { const o = orijinal[userId]; if (o) guncelle(userId, () => o); };
  const acKapa = (userId: string) => setAcik((s) => { const y = new Set(s); if (y.has(userId)) y.delete(userId); else y.add(userId); return y; });

  const ekle = async () => {
    if (!eklenecek) return;
    setEkleniyor(true);
    const rol = bekleyenRol[eklenecek.user_id] || "uretim";
    const { error } = await supabase.rpc("yetki_kullanici_ekle", { p_user_id: eklenecek.user_id, p_rol: rol });
    setEkleniyor(false);
    if (error) { showToast(`Eklenemedi: ${error.message}`, "error"); return; }
    showToast(`${eklenecek.email} Unex'e eklendi. Yetkilerini açıp kaydedin.`, "success");
    setEklenecek(null);
    fetchKullanicilar(true);
  };

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    </AppShell>
  );

  const yeniSayisi = kullanicilar.filter((k) => !yetkiVarMi(k)).length;

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<ShieldCheck size={20} />}
        baslik="Yetkilendirme"
        aciklama="Kullanıcıların rolü, görebileceği sayfalar ve dosya sekmeleri. @unex.com.tr adresiyle eklenen kullanıcılar burada yetkileri kapalı olarak hazır görünür."
        sag={
          <button onClick={() => fetchKullanicilar(true)} disabled={yenileniyor}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
          </button>
        }
      />

      {hata && <p className="mb-4 text-sm text-red-400" role="alert">{hata}</p>}

      {/* Onay bekleyen (Unex disi adresler; kendi bos sirketinde) */}
      {bekleyenler.length > 0 && (
        <section className="mb-5 rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: "rgba(245,158,11,0.35)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(245,158,11,0.06)" }}>
            <UserPlus size={15} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Onay bekleyen kullanıcılar ({bekleyenler.length})</h2>
            <p className="text-xs ml-1 hidden sm:block" style={{ color: TEXT_MUTED }}>Unex adresi olmayan yeni kullanıcılar; eklemeden hiçbir veriye erişemez.</p>
          </div>
          <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
            {bekleyenler.map((b) => (
              <li key={b.user_id} className="px-4 py-2.5 flex flex-wrap items-center gap-3" style={{ borderColor: CARD_BORDER }}>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="text-sm text-white break-all">{b.email}</p>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Eklendi {tarih(b.olusturma)} · Son giriş {tarih(b.son_giris)}</p>
                </div>
                <div className="flex-1 sm:flex-none sm:w-44">
                  <RolSecimi deger={bekleyenRol[b.user_id] || "uretim"} onChange={(v) => setBekleyenRol((s) => ({ ...s, [b.user_id]: v }))} etiket={`${b.email} rolü`} />
                </div>
                <button onClick={() => setEklenecek(b)} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
                  <UserPlus size={12} /> Unex&apos;e ekle
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {yeniSayisi > 0 && (
        <p className="mb-3 text-xs inline-flex items-center gap-1.5 text-amber-400"><Clock size={12} /> {yeniSayisi} kullanıcının henüz hiçbir sayfa yetkisi yok; açıp kaydedin.</p>
      )}

      <div className="space-y-3">
        {kullanicilar.map((k, idx) => {
          const kirli = degisti.has(k.user_id);
          const yeni = !yetkiVarMi(k);
          const sayfaAcik = Object.keys(SAYFA_ETIKETLER).filter((x) => k.sayfa_yetkileri[x]).length;
          const sekmeAcik = Object.keys(SEKME_ETIKETLER).filter((x) => k.sekme_yetkileri[x]).length;
          const yetkiAcik = acik.has(k.user_id);
          return (
            <section key={k.user_id} data-testid="yetki-karti" aria-label={k.email}
              className={`rounded-xl border shadow-sm animate-fade-up stagger-${Math.min(idx + 1, 8)}`}
              style={{ backgroundColor: CARD_BG, borderColor: kirli ? "rgba(16,185,129,0.45)" : CARD_BORDER }}>
              {/* Ust satir: kullanici · rol · ozet · islemler */}
              <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <p className="text-sm font-semibold text-white break-all">{k.email || k.user_id}</p>
                  <p className="text-[11px] mt-0.5 flex flex-wrap items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                    {k.user_id === user?.id && <span className="text-amber-400 font-semibold">Siz</span>}
                    {yeni && <span className="font-bold px-1 py-px rounded bg-amber-500/15 text-amber-400">YETKİ BEKLİYOR</span>}
                    <span>{k.son_giris ? `Son giriş ${tarih(k.son_giris)}` : "Henüz giriş yapmadı"}</span>
                  </p>
                </div>
                <div className="w-full sm:w-48">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Rol</label>
                  <RolSecimi deger={k.rol} disabled={k.user_id === user?.id} etiket={`${k.email} rolü`}
                    onChange={(v) => guncelle(k.user_id, (x) => ({ ...x, rol: v }))} />
                  <p className={`text-[10px] mt-1 ${DOSYA_GOREN_ROLLER.includes(k.rol) ? "text-emerald-400" : ""}`} style={DOSYA_GOREN_ROLLER.includes(k.rol) ? undefined : { color: TEXT_MUTED }}>
                    {DOSYA_GOREN_ROLLER.includes(k.rol) ? "Dosyaları görür" : "Dosya verisi yok"}
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                  <span className="text-[11px] whitespace-nowrap mr-auto sm:mr-1" style={{ color: TEXT_MUTED }} data-testid="yetki-ozet">
                    Sayfa <b className="text-white">{sayfaAcik}/{Object.keys(SAYFA_ETIKETLER).length}</b> · Sekme <b className="text-white">{sekmeAcik}/{Object.keys(SEKME_ETIKETLER).length}</b>
                  </span>
                  {kirli && (
                    <button onClick={() => geriAl(k.user_id)} disabled={saving === k.user_id} title="Kaydedilmemiş değişiklikleri geri al"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                      <RotateCcw size={11} /> Geri al
                    </button>
                  )}
                  <button onClick={() => handleSave(k.user_id)} disabled={saving === k.user_id || !kirli}
                    title={kirli ? "Değişiklikleri kaydet" : "Değişiklik yok"}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 hover:opacity-90"
                    style={{ backgroundColor: ACCENT, color: "white" }}>
                    {saving === k.user_id ? <Loader2 size={11} className="animate-spin" /> : kirli ? <Save size={11} /> : <Check size={11} />}
                    {kirli ? "Kaydet" : "Kayıtlı"}
                  </button>
                </div>
                {/* Mobil: yetkileri ac / kapa */}
                <button type="button" onClick={() => acKapa(k.user_id)} aria-expanded={yetkiAcik} data-testid="yetki-gor"
                  className="sm:hidden w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/5"
                  style={{ borderColor: CARD_BORDER, color: "#E6F4EE" }}>
                  {yetkiAcik ? "Yetkileri gizle" : "Yetkileri gör"} <ChevronDown size={13} className={`transition-transform ${yetkiAcik ? "rotate-180" : ""}`} />
                </button>
              </div>
              {/* Yetkiler: gruplar; masaustunde hep acik, mobilde dugmeyle */}
              <div className={`px-4 py-3.5 space-y-3.5 ${yetkiAcik ? "block" : "hidden"} sm:block`} data-testid="yetki-govde">
                {YETKI_GRUPLARI.map((g) => (
                  <div key={g.baslik} className="grid grid-cols-1 lg:grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide lg:pt-2.5" style={{ color: TEXT_MUTED }}>{g.baslik}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                      {g.anahtarlar.map((key) => {
                        const etiketler = g.tip === "sayfa" ? SAYFA_ETIKETLER : SEKME_ETIKETLER;
                        const deger = g.tip === "sayfa" ? !!k.sayfa_yetkileri[key] : !!k.sekme_yetkileri[key];
                        return (
                          <YetkiDugmesi key={key} value={deger} etiket={etiketler[key]}
                            ariaEtiket={g.tip === "sayfa" ? `${k.email} · ${etiketler[key]}` : `${k.email} · ${etiketler[key]} sekmesi`}
                            onChange={(v) => handleToggle(k.user_id, g.tip, key, v)} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={eklenecek !== null}
        onOpenChange={(a) => { if (!a && !ekleniyor) setEklenecek(null); }}
        title={`${eklenecek?.email || ""} Unex'e eklensin mi?`}
        description={`Kullanıcı Unex Gıda'ya "${ROLLER.find((r) => r.deger === (bekleyenRol[eklenecek?.user_id || ""] || "uretim"))?.etiket}" rolüyle bağlanır. Tüm sayfa yetkileri kapalı başlar; kullanıcının kartında açıp kaydetmeniz gerekir.`}
        confirmLabel="Evet, ekle" cancelLabel="Vazgeç"
        onConfirm={ekle} loading={ekleniyor} loadingLabel="Ekleniyor..."
      />
    </AppShell>
  );
}
