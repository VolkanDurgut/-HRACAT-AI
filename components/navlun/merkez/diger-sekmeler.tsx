"use client";
/**
 * Navlun Merkezi > Gerceklesen, Acenteler, Islem kaydi (24.11.2026). Hepsi ekranin TEK okumasindan beslenir (salt okunur;
 * duzeltme Kontrol sekmesinden).
 */
import React, { useMemo, useState } from "react";
import { ACCENT, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { acenteAnahtari } from "@/lib/navlun/karsilastirma";
import { kapatildiMi, type AcenteHafiza, type DegerlendirmeSatiri, type GerceklesenDurumu, type GerceklesenSatiri, type KontrolIslemi } from "@/lib/navlun/merkez";
import { Bos, GERCEKLESEN_ROZETI, gunYaz, Kart, Rozet, tutarYaz, zamanYaz } from "@/components/navlun/merkez/ortak";

const BASLIK = "text-left font-medium px-3 py-2 whitespace-nowrap";

export function GerceklesenSekmesi({ satirlar, islemler }: { satirlar: GerceklesenSatiri[]; islemler: KontrolIslemi[] }) {
  const [filtre, setFiltre] = useState<GerceklesenDurumu | "hepsi">("hepsi");
  const sayilar = useMemo(() => {
    const s: Partial<Record<GerceklesenDurumu, number>> = {};
    satirlar.forEach((x) => { s[x.durum] = (s[x.durum] || 0) + 1; });
    return s;
  }, [satirlar]);
  const gorunen = filtre === "hepsi" ? satirlar : satirlar.filter((x) => x.durum === filtre);
  return (
    <div>
      <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
        Yükleme planındaki konteyner başı navlun, aynı acentenin aynı limana rezervasyon tarihinden önce verdiği teklifle karşılaştırılır.
        Para birimi farklıysa rezervasyon gününün kuru kullanılır. FOB dosyalar kontrol dışıdır.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {(["hepsi", "tutmuyor", "tutuyor", "eski_teklifle_tutuyor", "teklif_yok", "eksik", "fob"] as const).map((t) => {
          const n = t === "hepsi" ? satirlar.length : sayilar[t] || 0;
          if (t !== "hepsi" && !n) return null;
          const secili = filtre === t;
          return (
            <button key={t} type="button" onClick={() => setFiltre(t)} className="h-8 px-3 rounded-lg border text-xs"
              style={{ borderColor: secili ? ACCENT : CARD_BORDER, color: secili ? "#FFFFFF" : TEXT_MUTED }}>
              {t === "hepsi" ? "Tümü" : GERCEKLESEN_ROZETI[t][0]} ({n})
            </button>
          );
        })}
      </div>
      <Kart testId="merkez-gerceklesen">
        {gorunen.length === 0 ? <Bos metin="Kayıt yok." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                {["Kalkış", "Liman", "Acente", "Gerçekleşen", "Teklif", "Fark", "Durum", "Açıklama"].map((b) => <th key={b} className={BASLIK}>{b}</th>)}
              </tr></thead>
              <tbody>
                {gorunen.map((g) => {
                  const [ad, renk] = GERCEKLESEN_ROZETI[g.durum];
                  const onay = g.durum === "tutmuyor" ? kapatildiMi(islemler, "gerceklesen", g.sevkiyat_id) : null;
                  return (
                    <tr key={g.sevkiyat_id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{gunYaz(g.etd)}</td>
                      <td className="px-3 py-2 text-white">{g.liman_anahtar || "—"}</td>
                      <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{g.acente || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-white whitespace-nowrap">{tutarYaz(g.gercek, g.para)}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "#C9D1DC" }}>
                        {g.teklif_tutar == null ? "—" : tutarYaz(g.teklif_tutar, g.teklif_para || "USD")}
                        {g.teklif_tarih && <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{gunYaz(g.teklif_tarih)}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: g.fark && Math.abs(g.fark) > 5 ? "#FCA5A5" : "#C9D1DC" }}>{g.fark == null ? "—" : tutarYaz(g.fark)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Rozet metin={ad} renk={renk} />
                        {onay && <span className="ml-1"><Rozet metin={onay.islem === "onayla" ? "onaylandı" : "yoksayıldı"} renk="gri" title={onay.gerekce || undefined} /></span>}
                      </td>
                      <td className="px-3 py-2" style={{ color: TEXT_MUTED }}>{g.aciklama || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
    </div>
  );
}

export function AcentelerSekmesi({ hafiza, degerlendirme }: { hafiza: AcenteHafiza[]; degerlendirme: DegerlendirmeSatiri[] }) {
  const satirlar = useMemo(() => {
    const m = new Map<string, { ad: string; teklif: number; enIyi: number; belirsiz: number; sonTarih: string }>();
    degerlendirme.forEach((t) => {
      const a = acenteAnahtari(t.acente);
      if (!a) return;
      const x = m.get(a) ?? { ad: t.acente as string, teklif: 0, enIyi: 0, belirsiz: 0, sonTarih: "" };
      x.teklif++; if (t.en_iyi) x.enIyi++; if (t.durum === "eksik") x.belirsiz++;
      if (t.tarih > x.sonTarih) x.sonTarih = t.tarih;
      m.set(a, x);
    });
    const h = new Map(hafiza.map((x) => [x.acente_anahtar, x]));
    const anahtarlar = Array.from(new Set([...Array.from(m.keys()), ...hafiza.map((x) => x.acente_anahtar)]));
    return anahtarlar.map((a) => ({ a, s: m.get(a) ?? null, h: h.get(a) ?? null }))
      .sort((x, y) => (y.s?.teklif || 0) - (x.s?.teklif || 0) || (x.s?.ad || x.h?.acente_ad || x.a).localeCompare(y.s?.ad || y.h?.acente_ad || y.a, "tr"));
  }, [hafiza, degerlendirme]);
  return (
    <div>
      <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
        Teklif metni lokali yazmıyorsa acente hafızası uygulanır; hafızada da yoksa yükleme planındaki rezervasyonlardan öğrenilir.
        Lokali belirsiz acentenin teklifi en iyi seçilmez. Hafıza Kontrol sekmesindeki &quot;Kural olarak öğret&quot; ile güncellenir.
      </p>
      <Kart testId="merkez-acenteler">
        {satirlar.length === 0 ? <Bos metin="Acente yok." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                {["Acente", "Çıkış lokali", "Ek (kont.)", "Teklif (150 gün)", "En iyi", "Lokal belirsiz", "Dayanak"].map((b) => <th key={b} className={BASLIK}>{b}</th>)}
              </tr></thead>
              <tbody>
                {satirlar.map(({ a, s, h }) => (
                  <tr key={a} className="border-t" style={{ borderColor: CARD_BORDER }} data-acente={a}>
                    <td className="px-3 py-2 text-white whitespace-nowrap">{s?.ad || h?.acente_ad || a}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {!h || h.lokal === "bilinmiyor" ? <Rozet metin="hafızada yok" renk="gri" />
                        : h.lokal === "dahil" ? <Rozet metin="dahil" renk="yesil" />
                        : <Rozet metin={`hariç${h.lokal_20 ? ` · ${tutarYaz(h.lokal_20)}` : ""}${h.lokal_40 ? ` / ${tutarYaz(h.lokal_40)}` : ""}`} renk="mavi" />}
                      {h && h.kaynak === "elle" && <span className="ml-1"><Rozet metin="elle" renk="mor" /></span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "#C9D1DC" }}>{h && h.ek_kont > 0 ? tutarYaz(h.ek_kont) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "#C9D1DC" }}>{s?.teklif || 0}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "#C9D1DC" }}>{s?.enIyi || 0}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: s?.belirsiz ? "#FCD34D" : "#C9D1DC" }}>{s?.belirsiz || 0}</td>
                    <td className="px-3 py-2" style={{ color: TEXT_MUTED }}>{h?.kanit || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
    </div>
  );
}

const ISLEM_ADI: Record<KontrolIslemi["islem"], string> = { duzelt: "Düzeltildi", onayla: "Olduğu gibi onaylandı", yoksay: "Yoksayıldı", ogret: "Kural öğretildi" };
const HEDEF_ADI: Record<KontrolIslemi["hedef_tur"], string> = { mesaj: "Mail", teklif: "Teklif", acente: "Acente", gerceklesen: "Gerçekleşen navlun" };

function ozet(i: KontrolIslemi): string {
  const s = i.sonraki || {};
  if (i.islem === "duzelt") return `${s.tutar ?? "?"} USD · ${s.ekipman ?? "20DC"}${s.acente ? ` · ${s.acente}` : ""}`;
  if (i.islem === "ogret") return `${s.acente_anahtar ?? ""}: lokal ${s.lokal === "dahil" ? "dahil" : `hariç${s.lokal_20 ? ` ${s.lokal_20}` : ""}${s.lokal_40 ? ` / ${s.lokal_40}` : ""}`}`;
  const o = i.onceki || {};
  if (i.hedef_tur === "gerceklesen") return `gerçekleşen ${o.gercek ?? "?"} ${o.para ?? ""}, teklif ${o.teklif_tutar ?? "?"} ${o.teklif_para ?? ""}`;
  if (i.hedef_tur === "mesaj") return `${o.liman ?? ""} ${o.acente ?? ""}`.trim();
  return i.hedef_tur === "acente" ? i.hedef_id : "";
}

export function IslemKaydiSekmesi({ islemler }: { islemler: KontrolIslemi[] }) {
  return (
    <Kart testId="merkez-islem-kaydi">
      {islemler.length === 0 ? <Bos metin="Henüz kontrol işlemi yapılmadı." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              {["Zaman", "İşlem", "Kayıt", "Ayrıntı", "Gerekçe", "Yapan"].map((b) => <th key={b} className={BASLIK}>{b}</th>)}
            </tr></thead>
            <tbody>
              {islemler.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{zamanYaz(i.zaman)}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{ISLEM_ADI[i.islem]}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{HEDEF_ADI[i.hedef_tur]}</td>
                  <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{ozet(i)}</td>
                  <td className="px-3 py-2" style={{ color: TEXT_MUTED }}>{i.gerekce || ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{i.kullanici_eposta || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Kart>
  );
}
