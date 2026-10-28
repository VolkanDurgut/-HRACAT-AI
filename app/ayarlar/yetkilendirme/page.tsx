"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ConfirmDialog } from "@/components/confirm-dialog";
import AppShell from "@/components/app-shell";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Save, UserPlus, Clock, RefreshCw } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * Yetkilendirme (super admin). 27.10.2026: kullanici listesi `yetki_kullanici_listesi`
 * RPC'sinden gelir (rol + kayit / son giris tarihi). @unex.com.tr adresleri Supabase'de
 * eklendigi an burada TUM yetkileri KAPALI olarak gorunur ("Yetki bekliyor"); diger
 * adresler "Onay bekleyen kullanicilar" bolumunde cikar ve "Unex'e ekle" ile alinir.
 * Rol (ihracat dosyasi verisini gorme) `yetki_rol_ata`, sayfa/sekme yetkileri
 * kullanici_yetkileri UPDATE (RLS: super admin + ayni sirket) ile kaydedilir.
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
  draft_onay: "Draft Onay",
  ic_piyasa:  "İç Piyasa",
  proformalar: "Proformalar",
  proforma_imza: "Proforma İmzalama (Onayla ve İmzala)",
  satin_alma: "Satın Alma (talep onayı)",
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

const tarih = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const yetkiVarMi = (k: Pick<KullaniciYetki, "sayfa_yetkileri">) => Object.values(k.sayfa_yetkileri || {}).some(Boolean);
const imza = (k: KullaniciYetki) => JSON.stringify([k.rol, Object.keys(SAYFA_ETIKETLER).map((x) => !!k.sayfa_yetkileri[x]), Object.keys(SEKME_ETIKETLER).map((x) => !!k.sekme_yetkileri[x])]);

function Toggle({ value, onChange, etiket }: { value: boolean; onChange: (v: boolean) => void; etiket: string }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={etiket}
      onClick={() => onChange(!value)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
      style={{ backgroundColor: value ? ACCENT : CARD_BORDER }}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-1"}`} />
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
      showToast(`${k.email}: yetkiler kaydedildi.`, "success");
    }
    setSaving(null);
  };

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
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{b.email}</p>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Eklendi {tarih(b.olusturma)} · Son giriş {tarih(b.son_giris)}</p>
                </div>
                <div className="w-44">
                  <RolSecimi deger={bekleyenRol[b.user_id] || "uretim"} onChange={(v) => setBekleyenRol((s) => ({ ...s, [b.user_id]: v }))} etiket={`${b.email} rolü`} />
                </div>
                <button onClick={() => setEklenecek(b)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
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

      <div className="rounded-xl border shadow-sm overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1560px] text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <th className="text-left px-4 py-3 text-xs font-semibold min-w-[220px] sticky left-0 z-10" style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>Kullanıcı</th>
                <th className="text-left px-3 py-3 text-xs font-semibold border-l min-w-[160px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Rol</th>
                <th className="px-2 py-3 text-center text-xs font-semibold border-l" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} colSpan={Object.keys(SAYFA_ETIKETLER).length}>
                  Sayfa Erişimi
                </th>
                <th className="px-2 py-3 text-center text-xs font-semibold border-l" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} colSpan={Object.keys(SEKME_ETIKETLER).length}>
                  Sekme Erişimi
                </th>
                <th className="px-4 py-3 w-20 border-l" style={{ borderColor: CARD_BORDER }}></th>
              </tr>
              <tr className="border-b" style={{ borderColor: CARD_BORDER }}>
                <th className="sticky left-0 z-10" style={{ backgroundColor: CARD_BG }}></th>
                <th className="px-3 py-2 text-left text-[10px] font-medium border-l" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Dosya verisi</th>
                {Object.values(SAYFA_ETIKETLER).map((label, i) => (
                  <th key={i} className={`px-2 py-2 text-center text-[10px] font-medium ${i === 0 ? "border-l" : ""}`} style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    {label}
                  </th>
                ))}
                {Object.values(SEKME_ETIKETLER).map((label, i) => (
                  <th key={i} className="px-2 py-2 text-center text-[10px] font-medium border-l" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    {label}
                  </th>
                ))}
                <th className="border-l" style={{ borderColor: CARD_BORDER }}></th>
              </tr>
            </thead>
            <tbody>
              {kullanicilar.map((k, idx) => {
                const kirli = degisti.has(k.user_id);
                const yeni = !yetkiVarMi(k);
                return (
                  <tr key={k.user_id} className={`border-b last:border-0 hover:bg-white/[0.03] animate-fade-up stagger-${Math.min(idx + 1, 8)}`}
                    style={{ borderColor: CARD_BORDER, backgroundColor: kirli ? "rgba(16,185,129,0.04)" : undefined }}>
                    <td className="px-4 py-3 sticky left-0 z-10" style={{ backgroundColor: CARD_BG }}>
                      <p className="text-xs font-medium text-white truncate max-w-[200px]" title={k.email}>{k.email || k.user_id}</p>
                      <p className="text-[10px] mt-0.5 flex flex-wrap items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                        {k.user_id === user?.id && <span className="text-amber-400 font-semibold">Siz</span>}
                        {yeni && <span className="font-bold px-1 py-px rounded bg-amber-500/15 text-amber-400">YETKİ BEKLİYOR</span>}
                        <span>{k.son_giris ? `Son giriş ${tarih(k.son_giris)}` : "Henüz giriş yapmadı"}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3 border-l" style={{ borderColor: CARD_BORDER }}>
                      <RolSecimi deger={k.rol} disabled={k.user_id === user?.id} etiket={`${k.email} rolü`}
                        onChange={(v) => guncelle(k.user_id, (x) => ({ ...x, rol: v }))} />
                      <p className={`text-[10px] mt-1 ${DOSYA_GOREN_ROLLER.includes(k.rol) ? "text-emerald-400" : ""}`} style={DOSYA_GOREN_ROLLER.includes(k.rol) ? undefined : { color: TEXT_MUTED }}>
                        {DOSYA_GOREN_ROLLER.includes(k.rol) ? "Dosyaları görür" : "Dosya verisi yok"}
                      </p>
                    </td>
                    {Object.keys(SAYFA_ETIKETLER).map((key, i) => (
                      <td key={key} className={`px-2 py-3 text-center ${i === 0 ? "border-l" : ""}`} style={{ borderColor: CARD_BORDER }}>
                        <div className="flex justify-center">
                          <Toggle value={!!k.sayfa_yetkileri[key]} etiket={`${k.email} · ${SAYFA_ETIKETLER[key]}`}
                            onChange={(v) => handleToggle(k.user_id, "sayfa", key, v)} />
                        </div>
                      </td>
                    ))}
                    {Object.keys(SEKME_ETIKETLER).map((key) => (
                      <td key={key} className="px-2 py-3 text-center border-l" style={{ borderColor: CARD_BORDER }}>
                        <div className="flex justify-center">
                          <Toggle value={!!k.sekme_yetkileri[key]} etiket={`${k.email} · ${SEKME_ETIKETLER[key]} sekmesi`}
                            onChange={(v) => handleToggle(k.user_id, "sekme", key, v)} />
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-3 border-l" style={{ borderColor: CARD_BORDER }}>
                      <button
                        onClick={() => handleSave(k.user_id)}
                        disabled={saving === k.user_id || !kirli}
                        title={kirli ? "Değişiklikleri kaydet" : "Değişiklik yok"}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 hover:opacity-90"
                        style={{ backgroundColor: ACCENT, color: "white" }}
                      >
                        {saving === k.user_id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        Kaydet
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={eklenecek !== null}
        onOpenChange={(a) => { if (!a && !ekleniyor) setEklenecek(null); }}
        title={`${eklenecek?.email || ""} Unex'e eklensin mi?`}
        description={`Kullanıcı Unex Gıda'ya "${ROLLER.find((r) => r.deger === (bekleyenRol[eklenecek?.user_id || ""] || "uretim"))?.etiket}" rolüyle bağlanır. Tüm sayfa yetkileri kapalı başlar; tabloda açıp kaydetmeniz gerekir.`}
        confirmLabel="Evet, ekle" cancelLabel="Vazgeç"
        onConfirm={ekle} loading={ekleniyor} loadingLabel="Ekleniyor..."
      />
    </AppShell>
  );
}
