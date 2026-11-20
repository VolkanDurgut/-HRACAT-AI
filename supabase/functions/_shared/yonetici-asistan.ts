/**
 * YONETICI ASISTANI - saf kurallar (21.11.2026, Faz 2). Sayfa (app/asistan) bu kurallari kullanir
 * (21.11.2026: sabah ozet maili kaldirildi - kullanici takibi sistemden yapiyor). Veri: yonetici_asistani() / yonetici_asistan_veri() RPC (migration 20261121000000).
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
 *  - fatura / beyanname (21.11.2026, kullanici: "ayni sekilde fatura, draft BL ve beyanname icin de revize metinleri"):
 *    acik dosyada uyusmayan fatura / beyanname kontrolu. Beyanname: birlesik fatura grubundaki dosyalar ve okunamayan /
 *    birbirini iceren alanlar veritabaninda elenir (asistan_kontrol_alanlari; migration 20261121010000).
 * Kontroller evrak sisteme YUKLENINCE yapilir (mail okunmaz); gorev listesi her acilista bu sonuclardan hesaplanir.
 */

export const YONETICI_EPOSTASI = "execution@unex.com.tr";
export const OPERASYON_EPOSTASI = "operation@unex.com.tr";
export const ODEME_SORUMLUSU = "Harun Bey";
export const FATURA_SORUMLUSU = "Muhasebe (Harun Bey)";
export const BEYANNAME_SORUMLUSU = "Gümrük müşaviri";

export type DraftAlani = { alan: string; sistem: string | null; belge: string | null; not: string | null };
export type DraftKaynagi = {
  dosya_id: string; dosya_no: string | null; alici_firma: string | null; varis_limani: string | null; bl_no: string | null;
  yukleme: string | null; kontrol_tarihi: string | null; ozet: string | null; revize_istendi: boolean;
  gemi: string | null; acente: string | null; alanlar: DraftAlani[];
};
export type EvrakTuru = "fatura" | "beyanname";
export type EvrakKaynagi = {
  tur: EvrakTuru; dosya_id: string; dosya_no: string | null; alici_firma: string | null; varis_limani: string | null;
  belge_no: string | null; yukleme: string | null; kontrol_tarihi: string | null; ozet: string | null; gemi: string | null; alanlar: DraftAlani[];
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
export type Kapanan = { tur: "odeme" | "on_odeme" | "draft_bl" | "fatura" | "beyanname"; baslik: string | null; ayrinti: string | null; zaman: string | null };
export type Isaret = { anahtar: string; tur: GorevTuru; ozet: string | null; isleyen: string; zaman: string };
export type AsistanVerisi = {
  tarih: string; draft: DraftKaynagi[]; evrak: EvrakKaynagi[]; odeme: OdemeKaynagi[]; on_odeme: OnOdemeKaynagi[]; kapananlar: Kapanan[]; isaretler: Isaret[];
};

export type GorevTuru = "draft_bl" | "odeme" | "fatura" | "beyanname";
export const GOREV_TURLERI: readonly GorevTuru[] = ["draft_bl", "fatura", "beyanname", "odeme"];
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
    evrak: dizi<Record<string, unknown>>(h.evrak).map((e) => ({
      tur: (e.tur === "beyanname" || e.tur === "fatura" ? e.tur : "") as EvrakTuru, dosya_id: String(e.dosya_id || ""), dosya_no: yazi(e.dosya_no),
      alici_firma: yazi(e.alici_firma), varis_limani: yazi(e.varis_limani), belge_no: yazi(e.belge_no), yukleme: yazi(e.yukleme),
      kontrol_tarihi: yazi(e.kontrol_tarihi), ozet: yazi(e.ozet), gemi: yazi(e.gemi),
      alanlar: dizi<Record<string, unknown>>(e.alanlar).map((a) => ({ alan: String(a.alan || "-"), sistem: yazi(a.sistem), belge: yazi(a.belge), not: yazi(a.not) })),
    })).filter((e) => e.dosya_id && (e.tur === "fatura" || e.tur === "beyanname")),
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
      tur: (["on_odeme", "draft_bl", "fatura", "beyanname"].includes(String(k.tur)) ? k.tur : "odeme") as Kapanan["tur"], baslik: yazi(k.baslik), ayrinti: yazi(k.ayrinti), zaman: yazi(k.zaman),
    })),
    isaretler: dizi<Record<string, unknown>>(h.isaretler).map((i) => ({
      anahtar: String(i.anahtar || ""), tur: ((GOREV_TURLERI as readonly string[]).includes(String(i.tur)) ? i.tur : "draft_bl") as GorevTuru, ozet: yazi(i.ozet), isleyen: String(i.isleyen || ""), zaman: String(i.zaman || ""),
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
export const evrakAnahtari = (e: Pick<EvrakKaynagi, "tur" | "dosya_id" | "kontrol_tarihi" | "yukleme">) => `${e.tur}:${e.dosya_id}:${e.kontrol_tarihi || e.yukleme || "-"}`;

const alanSatirlari = (alanlar: DraftAlani[], belgeAdi: string, ozet: string | null) => (alanlar.length
  ? alanlar.map((a) => {
    const deger = [a.sistem ? `Sistem: ${a.sistem}` : "", a.belge ? `${belgeAdi}: ${a.belge}` : ""].filter(Boolean).join(" / ");
    return `• ${a.alan}${deger ? ` — ${deger}` : ""}${a.not ? `\n  ${a.not}` : ""}`;
  }).join("\n")
  : `• ${ozet || "Kontrol uyuşmazlık buldu"}`);

export const EVRAK_ADI: Record<EvrakTuru, string> = { fatura: "Fatura", beyanname: "Gümrük beyannamesi" };

/** Fatura -> muhasebe, beyanname -> gumruk musaviri: duzeltilmis belge rica metni. */
export function evrakMaili(e: EvrakKaynagi): { konu: string; metin: string } {
  const firma = e.alici_firma || "-";
  const ad = EVRAK_ADI[e.tur];
  const konu = `${ad} düzeltme · ${e.dosya_no || "-"} · ${firma}`;
  const kimlik = [e.dosya_no, firma, e.belge_no ? `${e.tur === "fatura" ? "Fatura" : "Beyanname"} no ${e.belge_no}` : "", e.gemi || "", e.varis_limani || ""].filter(Boolean).join(" · ");
  const hitap = e.tur === "fatura" ? `${ODEME_SORUMLUSU} merhaba,` : "Merhaba,";
  const rica = e.tur === "fatura"
    ? "Faturayı bu bilgilere göre düzeltip yeniden gönderebilir misiniz? Düzeltilmiş fatura sisteme yüklendiğinde kontrol yeniden yapılacak."
    : "Beyannameyi bu bilgilere göre düzeltebilir misiniz? Düzeltilmiş beyanname sisteme yüklendiğinde kontrol yeniden yapılacak.";
  const metin = [hitap, "", kimlik, `${ad} sistemdeki bilgilerle karşılaştırıldı; aşağıdaki alanlar tutmuyor:`, "",
    alanSatirlari(e.alanlar, e.tur === "fatura" ? "Fatura" : "Beyanname", e.ozet), "", rica, "", "Teşekkürler."].join("\n");
  return { konu, metin };
}

export function draftMaili(d: DraftKaynagi): { konu: string; metin: string } {
  const firma = d.alici_firma || "-";
  const konu = `Draft B/L düzeltme · ${d.dosya_no || "-"} · ${firma}`;
  const satirlar = alanSatirlari(d.alanlar, "Draft", d.ozet);
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
  for (const e of v.evrak) {
    const anahtar = evrakAnahtari(e);
    const m = evrakMaili(e);
    const isaret = isaretler.get(anahtar) || null;
    const alanlar = e.alanlar.map((a) => a.alan).join(", ") || e.ozet || "uyuşmazlık";
    const sorumlu = e.tur === "fatura" ? FATURA_SORUMLUSU : BEYANNAME_SORUMLUSU;
    liste.push({
      anahtar, tur: e.tur, baslik: `${EVRAK_ADI[e.tur]} uyuşmazlığı · ${e.dosya_no || "-"}`, alt: `${e.alici_firma || "-"} · ${alanlar}`,
      kaynak: `${EVRAK_ADI[e.tur]} kontrolü · ${trTarih(e.kontrol_tarihi || e.yukleme)}`, sorumlu, alici: "",
      konu: m.konu, metin: m.metin, baglanti: `/dosya/${e.dosya_id}?tab=evraklar`, durum: isaret ? "gonderildi" : "acik", isaret,
      ozetSatiri: `${e.dosya_no || "-"} · ${e.alici_firma || "-"}: ${alanlar} tutmuyor`, adet: e.alanlar.length || 1,
    });
  }
  return liste.sort((a, b) => Number(a.durum === "gonderildi") - Number(b.durum === "gonderildi"));
}

export function gorevSayilari(g: Gorev[]): { acik: number; gonderildi: number; draft: number; odeme: number; evrak: number } {
  return {
    acik: g.filter((x) => x.durum === "acik").length,
    gonderildi: g.filter((x) => x.durum === "gonderildi").length,
    draft: g.filter((x) => x.tur === "draft_bl").length,
    odeme: g.filter((x) => x.tur === "odeme").length,
    evrak: g.filter((x) => x.tur === "draft_bl" || x.tur === "fatura" || x.tur === "beyanname").length,
  };
}
