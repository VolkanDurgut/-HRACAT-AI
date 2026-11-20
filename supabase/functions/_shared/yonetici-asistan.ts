/**
 * YONETICI ASISTANI - saf kurallar (21.11.2026, Faz 2). Sayfa (app/asistan) ve sabah ozet maili (edge asistan-ozet)
 * AYNI kurallari kullanir. Veri: yonetici_asistani() / yonetici_asistan_veri() RPC (migration 20261121000000).
 *
 * Kullanici: "Her gun Harun Bey'den ya da Burak Bey'den on odeme bilgisi rica etmek zorunda kaldigim durumlar gibi
 * dusun; sistem sadece benim mailime gonderecek. Draft B/L'de uyusmazlik varsa operasyondaki ilgili kisiye
 * gonderebilecegim hazir bir mail alani cikacak; ben kopyalayip kendi saglayicimdan gonderecegim."
 *
 * Gorev = kaynaktan hesaplanir; kaynak duzelince kendiliginden kaybolur. "Gonderdim" isareti yalniz durumu degistirir.
 *  - draft_bl: acik dosyada uyusmayan, onaylanmamis Draft B/L kontrolu. Anahtar dosya + kontrol zamani: yeni draft
 *    yuklenip yine uyusmazsa yeni gorev acilir.
 *  - odeme: gemisi kalkmis ve odemesi girilmemis sevkiyatlar + on odemesi beklenen siparisler, TEK gorev, GUNLUK anahtar
 *    (her gunun basinda yeniden istenebilir).
 * Sistemin gonderdigi ozet mailinde booking / B/L no YOK (CLAUDE.md); kopyalanan hazir metinde dosya icin gerekli.
 */

export const YONETICI_EPOSTASI = "execution@unex.com.tr";
export const OPERASYON_EPOSTASI = "operation@unex.com.tr";
export const ODEME_SORUMLUSU = "Harun Bey";

export type DraftAlani = { alan: string; sistem: string | null; belge: string | null; not: string | null };
export type DraftKaynagi = {
  dosya_id: string; dosya_no: string | null; alici_firma: string | null; varis_limani: string | null; bl_no: string | null;
  yukleme: string | null; kontrol_tarihi: string | null; ozet: string | null; revize_istendi: boolean;
  gemi: string | null; acente: string | null; alanlar: DraftAlani[];
};
export type OdemeKaynagi = {
  rezervasyon_id: string; dosya_id: string; dosya_no: string | null; alici_firma: string | null; proforma_no: string | null;
  varis_limani: string | null; gemi: string | null; etd: string | null; gun: number | null; konteyner: number | null;
  konsimento_durumu: string | null;
};
export type OnOdemeKaynagi = {
  anahtar: string; kaynak: string | null; proforma_no: string | null; proforma_tarihi: string | null; firma: string | null;
  miktar_mt: number | null; konteyner: number | null; tutar: number | null; para_birimi: string | null; liman: string | null; gun: number | null;
};
export type Kapanan = { tur: "odeme" | "on_odeme" | "draft_bl"; baslik: string | null; ayrinti: string | null; zaman: string | null };
export type Isaret = { anahtar: string; tur: "draft_bl" | "odeme"; ozet: string | null; isleyen: string; zaman: string };
export type AsistanVerisi = {
  tarih: string; draft: DraftKaynagi[]; odeme: OdemeKaynagi[]; on_odeme: OnOdemeKaynagi[]; kapananlar: Kapanan[]; isaretler: Isaret[];
};

export type GorevTuru = "draft_bl" | "odeme";
export type Gorev = {
  anahtar: string;
  tur: GorevTuru;
  baslik: string;
  alt: string;
  kaynak: string;
  sorumlu: string;
  /** Hazir mailin onerilen alicisi; bos: yonetici kendi secer */
  alici: string;
  konu: string;
  metin: string;
  /** Kaynak kayda git (uygulama ici yol) */
  baglanti: string;
  durum: "acik" | "gonderildi";
  isaret: Isaret | null;
  /** Ozet satiri (mail ve liste): booking / B/L no icermez */
  ozetSatiri: string;
  adet: number;
};

const dizi = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const yazi = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const sayi = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** RPC cevabini guvenli bicime getirir (eksik alan / bozuk tip sayfayi dusurmez). */
export function asistanVerisiNormalize(ham: unknown): AsistanVerisi {
  const h = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  return {
    tarih: String(h.tarih || "").slice(0, 10),
    draft: dizi<Record<string, unknown>>(h.draft).map((d) => ({
      dosya_id: String(d.dosya_id || ""), dosya_no: yazi(d.dosya_no), alici_firma: yazi(d.alici_firma), varis_limani: yazi(d.varis_limani),
      bl_no: yazi(d.bl_no), yukleme: yazi(d.yukleme), kontrol_tarihi: yazi(d.kontrol_tarihi), ozet: yazi(d.ozet),
      revize_istendi: d.revize_istendi === true, gemi: yazi(d.gemi), acente: yazi(d.acente),
      alanlar: dizi<Record<string, unknown>>(d.alanlar).map((a) => ({ alan: String(a.alan || "-"), sistem: yazi(a.sistem), belge: yazi(a.belge), not: yazi(a.not) })),
    })).filter((d) => d.dosya_id),
    odeme: dizi<Record<string, unknown>>(h.odeme).map((o) => ({
      rezervasyon_id: String(o.rezervasyon_id || ""), dosya_id: String(o.dosya_id || ""), dosya_no: yazi(o.dosya_no), alici_firma: yazi(o.alici_firma),
      proforma_no: yazi(o.proforma_no), varis_limani: yazi(o.varis_limani), gemi: yazi(o.gemi), etd: yazi(o.etd), gun: sayi(o.gun),
      konteyner: sayi(o.konteyner), konsimento_durumu: yazi(o.konsimento_durumu),
    })).filter((o) => o.rezervasyon_id),
    on_odeme: dizi<Record<string, unknown>>(h.on_odeme).map((s) => ({
      anahtar: String(s.anahtar || ""), kaynak: yazi(s.kaynak), proforma_no: yazi(s.proforma_no), proforma_tarihi: yazi(s.proforma_tarihi),
      firma: yazi(s.firma), miktar_mt: sayi(s.miktar_mt), konteyner: sayi(s.konteyner), tutar: sayi(s.tutar), para_birimi: yazi(s.para_birimi),
      liman: yazi(s.liman), gun: sayi(s.gun),
    })).filter((s) => s.anahtar),
    kapananlar: dizi<Record<string, unknown>>(h.kapananlar).map((k) => ({
      tur: (k.tur === "on_odeme" || k.tur === "draft_bl" ? k.tur : "odeme") as Kapanan["tur"], baslik: yazi(k.baslik), ayrinti: yazi(k.ayrinti), zaman: yazi(k.zaman),
    })),
    isaretler: dizi<Record<string, unknown>>(h.isaretler).map((i) => ({
      anahtar: String(i.anahtar || ""), tur: (i.tur === "odeme" ? "odeme" : "draft_bl") as GorevTuru, ozet: yazi(i.ozet), isleyen: String(i.isleyen || ""), zaman: String(i.zaman || ""),
    })).filter((i) => i.anahtar),
  };
}

/** "2026-11-20..." -> "20.11.2026" */
export function trTarih(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "-";
}
export function trTutar(tutar: number | null, para: string | null): string {
  if (tutar === null) return "";
  return `${tutar.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${para || "USD"}`.trim();
}

const KONSIMENTO_YAZISI: Record<string, string> = {
  x: "konşimento serbest bırakılmadı", alindi: "orijinal konşimento elimizde", kargo: "kargoda", kuehne: "Kuehne'de", acente: "acentede",
};
export const konsimentoYazisi = (d: string | null) => (d ? KONSIMENTO_YAZISI[d] || d : "durum girilmemiş");

/** Postgres metin zamani ("2026-11-19 13:59:19.164+00") -> ISO ("2026-11-19T13:59:19.164+00:00"); ISO aynen. */
export function zamanIso(v: string | null | undefined): string | null {
  const t = String(v || "").trim();
  if (!t) return null;
  return t.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2").replace(/([+-]\d{2})$/, "$1:00");
}

const KAPANAN_ETIKET: Record<string, string> = { telex: "Telex", seawaybill: "Seawaybill", vesaik: "Vesaik", imzali: "İmzalı proforma", on_odeme: "Ön ödeme" };
/** "6375.00 USD" -> "6.375 USD"; "telex" -> "Telex"; "imzali" -> "İmzalı proforma" */
export function kapananAyrintisi(k: Pick<Kapanan, "ayrinti">): string {
  const a = (k.ayrinti || "").trim();
  const m = /^(-?\d+(?:\.\d+)?)\s+([A-Z]{3})$/.exec(a);
  if (m) return trTutar(Number(m[1]), m[2]);
  return KAPANAN_ETIKET[a] || a;
}

export const draftAnahtari = (d: Pick<DraftKaynagi, "dosya_id" | "kontrol_tarihi" | "yukleme">) => `draft:${d.dosya_id}:${d.kontrol_tarihi || d.yukleme || "-"}`;
export const odemeAnahtari = (tarih: string) => `odeme:${tarih}`;

export function draftMaili(d: DraftKaynagi): { konu: string; metin: string } {
  const firma = d.alici_firma || "-";
  const konu = `Draft B/L düzeltme · ${d.dosya_no || "-"} · ${firma}`;
  const satirlar = d.alanlar.length
    ? d.alanlar.map((a) => {
      const deger = [a.sistem ? `Sistem: ${a.sistem}` : "", a.belge ? `Draft: ${a.belge}` : ""].filter(Boolean).join(" / ");
      return `• ${a.alan}${deger ? ` — ${deger}` : ""}${a.not ? `\n  ${a.not}` : ""}`;
    }).join("\n")
    : `• ${d.ozet || "Kontrol uyuşmazlık buldu"}`;
  const kimlik = [d.dosya_no, firma, d.bl_no ? `B/L ${d.bl_no}` : "", d.gemi || "", d.varis_limani || ""].filter(Boolean).join(" · ");
  const metin = [
    "Merhaba,",
    "",
    `${kimlik}`,
    `Draft B/L sistemdeki bilgilerle karşılaştırıldı; aşağıdaki alanlar tutmuyor:`,
    "",
    satirlar,
    "",
    `Acenteden${d.acente ? ` (${d.acente})` : ""} düzeltilmiş draft'ı rica edebilir misiniz? Düzeltilmiş draft sisteme yüklendiğinde kontrol yeniden yapılacak.`,
    "",
    "Teşekkürler.",
  ].join("\n");
  return { konu, metin };
}

export function odemeMaili(odeme: OdemeKaynagi[], onOdeme: OnOdemeKaynagi[], tarih: string): { konu: string; metin: string } {
  const konu = `Ödeme durumu · ${trTarih(tarih)}`;
  const bolum: string[] = [`${ODEME_SORUMLUSU} merhaba,`, "", "Sistemde ödemesi görünmeyen sevkiyatlar ve ön ödemesi beklenen siparişler aşağıda. Ödemesi gelenleri bildirebilir misiniz?"];
  if (odeme.length) {
    bolum.push("", `GEMİSİ KALKMIŞ, ÖDEMESİ GİRİLMEMİŞ SEVKİYATLAR (${odeme.length})`);
    odeme.forEach((o, i) => bolum.push(
      `${i + 1}. ${[o.dosya_no, o.alici_firma, o.proforma_no].filter(Boolean).join(" · ")} — kalkış ${trTarih(o.etd)}${o.gun !== null ? ` (${o.gun} gün)` : ""}${o.konteyner ? ` · ${o.konteyner} kont.` : ""} · ${konsimentoYazisi(o.konsimento_durumu)}`,
    ));
  }
  if (onOdeme.length) {
    bolum.push("", `ÖN ÖDEMESİ BEKLENEN SİPARİŞLER (${onOdeme.length})`);
    onOdeme.forEach((s, i) => bolum.push(
      `${i + 1}. ${[s.proforma_no, s.firma].filter(Boolean).join(" · ")} — proforma ${trTarih(s.proforma_tarihi)}${s.tutar !== null ? ` · ${trTutar(s.tutar, s.para_birimi)}` : ""}${s.konteyner ? ` · ${s.konteyner} kont.` : ""}`,
    ));
  }
  bolum.push("", "Teşekkürler.");
  return { konu, metin: bolum.join("\n") };
}

/** Kaynaklardan gorev listesi: once acik gorevler (odeme en ustte), sonra "gonderildi, bekleniyor". */
export function gorevleriKur(v: AsistanVerisi): Gorev[] {
  const isaretler = new Map(v.isaretler.map((i) => [i.anahtar, i]));
  const liste: Gorev[] = [];
  if (v.odeme.length || v.on_odeme.length) {
    const anahtar = odemeAnahtari(v.tarih);
    const m = odemeMaili(v.odeme, v.on_odeme, v.tarih);
    const isaret = isaretler.get(anahtar) || null;
    const parca = [v.odeme.length ? `${v.odeme.length} sevkiyatın ödemesi girilmemiş` : "", v.on_odeme.length ? `${v.on_odeme.length} siparişin ön ödemesi bekleniyor` : ""].filter(Boolean);
    liste.push({
      anahtar, tur: "odeme", baslik: `${ODEME_SORUMLUSU}'den ödeme durumunu isteyin`, alt: parca.join(" · "),
      kaynak: "ETD/ETA ödeme takibi + Sipariş Listesi (onay bekleyen)", sorumlu: `${ODEME_SORUMLUSU} (muhasebe)`, alici: "",
      konu: m.konu, metin: m.metin, baglanti: "/etd-eta", durum: isaret ? "gonderildi" : "acik", isaret,
      ozetSatiri: `${ODEME_SORUMLUSU}: ${parca.join(", ")}`, adet: v.odeme.length + v.on_odeme.length,
    });
  }
  for (const d of v.draft) {
    const anahtar = draftAnahtari(d);
    const m = draftMaili(d);
    const isaret = isaretler.get(anahtar) || null;
    const alanlar = d.alanlar.map((a) => a.alan).join(", ") || d.ozet || "uyuşmazlık";
    liste.push({
      anahtar, tur: "draft_bl", baslik: `Draft B/L uyuşmazlığı · ${d.dosya_no || "-"}`, alt: `${d.alici_firma || "-"} · ${alanlar}`,
      kaynak: `Draft B/L kontrolü · ${trTarih(d.kontrol_tarihi || d.yukleme)}`, sorumlu: "Operasyon", alici: OPERASYON_EPOSTASI,
      konu: m.konu, metin: m.metin, baglanti: `/dosya/${d.dosya_id}?tab=evraklar`, durum: isaret ? "gonderildi" : "acik", isaret,
      ozetSatiri: `${d.dosya_no || "-"} · ${d.alici_firma || "-"}: ${alanlar} tutmuyor`, adet: d.alanlar.length || 1,
    });
  }
  return liste.sort((a, b) => Number(a.durum === "gonderildi") - Number(b.durum === "gonderildi"));
}

export function gorevSayilari(g: Gorev[]): { acik: number; gonderildi: number; draft: number; odeme: number } {
  return {
    acik: g.filter((x) => x.durum === "acik").length,
    gonderildi: g.filter((x) => x.durum === "gonderildi").length,
    draft: g.filter((x) => x.tur === "draft_bl").length,
    odeme: g.filter((x) => x.tur === "odeme").length,
  };
}

// ---------------------------------------------------------------- sabah ozet maili
const kacis = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LACIVERT = "#283474";
const SEFTALI = "#F4A07C";
const YESIL = "#10B981";

export function ozetKonusu(g: Gorev[], tarih: string): string {
  const acik = g.filter((x) => x.durum === "acik").length;
  return `Bugün istemeniz gerekenler · ${acik} görev · ${trTarih(tarih)}`;
}

/** Yalniz yoneticiye; her satirda panele giden baglanti. Booking / B/L no yazilmaz. */
export function ozetMailiHtml(g: Gorev[], v: AsistanVerisi, site: string, secenek: { test?: boolean; gercekAlici?: string } = {}): string {
  const acik = g.filter((x) => x.durum === "acik");
  const bekleyen = g.filter((x) => x.durum === "gonderildi");
  const adres = (x: Gorev) => `${site}/asistan?gorev=${encodeURIComponent(x.anahtar)}`;
  const satir = (x: Gorev, renk: string, sag: string) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;border-left:3px solid ${renk}">
    <div style="font-size:13px;font-weight:bold;color:#1E293B">${kacis(x.baslik)}</div>
    <div style="font-size:12px;color:#475569;margin-top:2px">${kacis(x.alt)}</div>
    <div style="font-size:11px;color:#94A3B8;margin-top:2px">Kime: ${kacis(x.sorumlu)} · Kaynak: ${kacis(x.kaynak)}</div></td>
    <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;text-align:right;white-space:nowrap;vertical-align:middle">${sag}<a href="${kacis(adres(x))}" style="display:inline-block;background:${YESIL};color:#fff;text-decoration:none;font-size:12px;font-weight:bold;padding:7px 14px;border-radius:5px">Aç</a></td></tr>`;
  const bolum = (t: string) => `<div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${SEFTALI};padding-left:8px">${kacis(t)}</div>`;
  const kutu = (etiket: string, deger: number, renk: string) => `<td style="width:25%;padding:0 4px"><div style="border:1px solid #E2E8F0;border-radius:6px;padding:10px 12px"><div style="font-size:11px;color:#64748B">${kacis(etiket)}</div><div style="font-size:22px;font-weight:bold;color:${renk}">${deger}</div></div></td>`;
  const testSeridi = secenek.test
    ? `<div style="margin:14px 0 0;border:1px solid #FCD34D;border-left:4px solid #D97706;background:#FFFBEB;border-radius:4px;padding:8px 12px;font-size:12px;color:#92400E"><b>TEST</b> · Yalnız test adresine gönderildi. Canlıda alıcı: <b>${kacis(secenek.gercekAlici || YONETICI_EPOSTASI)}</b></div>` : "";
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${site}/images/logo.png" width="48" height="48" alt="Unex" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">UNEX-AI</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Yönetici Asistanı · Bugün istemeniz gerekenler</div></td>
    <td style="text-align:right;vertical-align:middle"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${kacis(trTarih(v.tarih))}</div></td>
  </tr></table>
  ${testSeridi}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr>
    ${kutu("Açık görev", acik.length, acik.length ? "#B45309" : YESIL)}${kutu("Draft B/L uyuşmazlığı", v.draft.length, v.draft.length ? "#B91C1C" : YESIL)}${kutu("Ödemesi girilmemiş", v.odeme.length, LACIVERT)}${kutu("Ön ödeme bekleyen", v.on_odeme.length, LACIVERT)}
  </tr></table>
  ${acik.length ? `${bolum(`Bugün isteyin (${acik.length})`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${acik.map((x) => satir(x, x.tur === "draft_bl" ? "#B91C1C" : "#B45309", "")).join("")}</table>`
    : `<p style="margin:18px 0 0;font-size:14px;color:#047857">Bugün istemeniz gereken bir şey yok.</p>`}
  ${bekleyen.length ? `${bolum(`Gönderildi, cevap bekleniyor (${bekleyen.length})`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${bekleyen.map((x) => satir(x, "#94A3B8", `<span style="font-size:11px;color:#94A3B8;margin-right:8px">${kacis(x.isaret ? `${trTarih(x.isaret.zaman)} gönderildi` : "")}</span>`)).join("")}</table>` : ""}
  <div style="margin-top:20px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Hazır mail metinleri panelde: kopyalayıp kendi adresinizden gönderin, sonra “Gönderdim” deyin.<br>Görevler kaynak düzelince kendiliğinden kapanır. Bu özet yalnız size gider · UNEX-AI</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
