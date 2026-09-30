"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, isDosyaAcik } from "@/lib/supabase";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import DraftOnayKarti from "@/components/draft-onay-karti";
import {
  checkCommercialInvoiceReadiness,
  checkPackingListReadiness,
  checkCertificateOfOriginReadiness,
  checkPhytosanitaryCertificateReadiness,
  checkHealthCertificateReadiness,
} from "@/lib/document-readiness";
import { Loader2, FileCheck2 } from "lucide-react";
import { TEXT_MUTED, CARD_BG, CARD_BORDER, ROW_HEADER_BG } from "@/lib/theme";

type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

/**
 * "Draft hazır" tanımı: Taslak Onay Paketi'yle (bkz. taslak-onay-butonu.tsx)
 * BIREBIR AYNI kriter - Commercial Invoice + Packing List + Draft BL +
 * Certificate of Origin + Phytosanitary + Health Certificate hepsi tam olmalı.
 * Tutarlılık icin aynı readiness fonksiyonları kullanılır.
 */
function tamEvrakSetiHazirMi(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[]): boolean {
  const draftBlUrl = (dosya as any).draft_bl_dosya_url as string | null;
  if (!draftBlUrl) return false;
  return (
    checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkPackingListReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkCertificateOfOriginReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkPhytosanitaryCertificateReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkHealthCertificateReadiness(dosya, rezervasyonlar, konteynerler).hazir
  );
}

/**
 * En acil aksiyon gerektiren dosyalar EN USTTE: once suresi dolmus (48s+
 * yanitsiz) ve revize istenmis dosyalar, sonra bekleyenler, sonra gonderime
 * hazir olanlar, sonra musteri yanitini bekleyenler (sari), musteri onayi
 * gelmis olanlar (yesil) en sonda - onlarda artik aktif takip gerekmiyor.
 */
function siraDegeri(d: DosyaWithRelations): number {
  const mailGonderildiTarihi = (d as any).draft_mail_gonderildi_tarihi as string | null;
  const musteriOnayiAlindi = !!(d as any).draft_musteri_onayi_alindi;
  const revizeIstendi = !!(d as any).draft_revize_istendi;
  const mailGonderildi = !!(d as any).draft_mail_gonderildi;
  const sureDoldu =
    mailGonderildi && !musteriOnayiAlindi && !revizeIstendi && !!mailGonderildiTarihi &&
    Date.now() - new Date(mailGonderildiTarihi).getTime() > 48 * 60 * 60 * 1000;

  if (musteriOnayiAlindi) return 5;
  if (mailGonderildi) return sureDoldu ? 0 : 4;
  if (revizeIstendi) return 0;
  if ((d as any).draft_onaylandi) return 1;
  return 0;
}

export default function DraftOnayPage() {
  const { user, companyId } = useAuth();
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDosyalar = useCallback(async () => {
    if (!user?.id || !companyId) return;
    setLoading(true);

    // Kullanici karari (28.09.2026): Draft Onay sayfasinda SADECE ACIK
    // dosyalar gosterilir - Kapali dosyalar (draft evraklari daha once
    // tamamlanmis olsa bile) artik bu listede yer almaz. Durum kontrolu
    // asagida isDosyaAcik() ile yapiliyor (hem "Açık" hem eski "Acik" ASCII
    // yazimini taniyan, projede zaten var olan ortak fonksiyon).
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId)
      .not("draft_bl_dosya_url", "is", null)
      .order("olusturma_tarihi", { ascending: false })
      .returns<Dosya[]>();

    if (!dosyaData || dosyaData.length === 0) {
      setDosyalar([]);
      setLoading(false);
      return;
    }

    const dosyaIds = dosyaData.map((d) => d.id);
    const [rezRes, kontRes] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId),
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId),
    ]);

    const rezMap: Record<string, Rezervasyon[]> = {};
    (rezRes.data || []).forEach((r: Rezervasyon) => {
      if (!rezMap[r.dosya_id]) rezMap[r.dosya_id] = [];
      rezMap[r.dosya_id].push(r);
    });
    const kontMap: Record<string, Konteyner[]> = {};
    (kontRes.data || []).forEach((k: Konteyner) => {
      if (!kontMap[k.dosya_id]) kontMap[k.dosya_id] = [];
      kontMap[k.dosya_id].push(k);
    });

    const zenginlesmis: DosyaWithRelations[] = dosyaData.map((d) => ({
      ...d,
      rezervasyonlar: rezMap[d.id] || [],
      konteynerler: kontMap[d.id] || [],
    }));

    const hazirOlanlar = zenginlesmis.filter(
      (d) => isDosyaAcik(d) && tamEvrakSetiHazirMi(d, d.rezervasyonlar, d.konteynerler)
    );
    hazirOlanlar.sort((a, b) => siraDegeri(a) - siraDegeri(b));

    setDosyalar(hazirOlanlar);
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => {
    fetchDosyalar();
  }, [fetchDosyalar]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCheck2 size={20} /> Draft Onay Gönderim
          </h1>
          <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
            Sevkiyat evrakları (Commercial Invoice, Packing List, Draft BL, Certificate of Origin,
            Phytosanitary, Health Certificate) tam ve hazır olan dosyalar burada listelenir.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center" style={{ color: TEXT_MUTED }}>
            <Loader2 size={18} className="animate-spin" /> Yükleniyor...
          </div>
        ) : dosyalar.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 size={40} />}
            title="Henüz hazır dosya yok"
            description="Tüm sevkiyat evrakları tamamlandığında dosyalar burada onaya çıkacak."
          />
        ) : (
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Dosya No</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Proforma No</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Booking No</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>İlgili Evraklar</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Durum</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Gemi Kalkış</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>ETA</th>
                    <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody>
                  {dosyalar.map((d) => (
                    <DraftOnayKarti
                      key={d.id}
                      dosya={d}
                      rezervasyonlar={d.rezervasyonlar}
                      konteynerler={d.konteynerler}
                      companyId={companyId!}
                      onRefresh={fetchDosyalar}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}