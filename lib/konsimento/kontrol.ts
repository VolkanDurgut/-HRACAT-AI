// ============================================================================
// KONSIMENTO TALIMATI KONTROLU - yapay zekasiz, ucretsiz (06.11.2026)
// ============================================================================
// Kullanici: "Beyanname yukleyince kontrol mekanizmasini cok begendim. Aynisini konsimento kontrol
// kisminda da yapilmasini istiyorum." Tanitilan sablonlar (standart DRAFT/MAERSK formu, AKKON formu)
// PDF metin katmanindan okunur (unpdf, tarayicida) ve sistemdeki talimat modeliyle karsilastirilir.
// Metin sirasi sablona gore degistigi icin (standart formda etiketler once, degerler sonra gelir)
// alanlar KONUM ile degil, sistem degerinin belgede GECIP GECMEDIGIYLE kontrol edilir; konteyner
// satirlari ise ISO 6346 numarasindan sonra gelen mühür / kap / net / brut ile okunur.
// Tanınmayan bir form icin null doner -> eski (yapay zeka) kontrolu yedek olarak calisir.
// ============================================================================

import { belgedekiKonteynerler, konteynerGecerli, kontrolHanesiHatalari, kontrolHanesiNotu } from "@/lib/konteyner-no";
import { limanAnahtari } from "@/lib/liman-anahtari";
import { sayiTr, type TalimatModeli } from "@/lib/konsimento/talimat";

export type KonsimentoKontrolDurumu = "uyumlu" | "uyusmuyor" | "okunamadi" | "bilgi";
export type KonsimentoKontrolSatiri = { alan: string; durum: KonsimentoKontrolDurumu; sistem: string; belge: string; not?: string };
export type KonsimentoKontrolSonucu = {
  kaynak: "metin";
  /** "draft_bl": sablondan bagimsiz Draft BL kontrolu (16.11.2026). */
  sablon: "standart" | "akkon" | "draft_bl";
  uyumlu: boolean;
  ozet: string;
  kontroller: KonsimentoKontrolSatiri[];
  /** Eski ekranla uyum: yalniz "uyusmuyor" satirlari */
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  tarih: string;
};

/** Karsilastirma bicimi: buyuk harf, Turkce harfler ASCII, noktalama -> bosluk. */
export function sade(s: string | null | undefined): string {
  return (s || "").toLocaleUpperCase("en-US")
    .replace(/[İI]/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C").replace(/ı/g, "I")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9./,:-]+/g, " ").replace(/\s+/g, " ").trim();
}
const kelimeVar = (metin: string, aranan: string) => {
  const a = sade(aranan); if (!a) return false;
  return new RegExp(`(^|[^A-Z0-9])${a.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^A-Z0-9]|$)`).test(metin);
};
const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const sayiOku = (s: string) => Number(s.replace(/\./g, "").replace(/,\d*$/, "")) || 0;

export function talimatSablonuTani(metinHam: string): "standart" | "akkon" | null {
  const m = sade(metinHam);
  if (/KONISMENTO TALIMAT FORMU|BILL OF LADING INSTRUCTION FORM/.test(m) && /AKKON/.test(m)) return "akkon";
  if (/SHIPPING INSTRUCTION/.test(m) && /BOOKING NUMBER/.test(m)) return "standart";
  return null;
}

type BelgeKonteyneri = { no: string; muhur: string; kap: number; net: number; brut: number };
/**
 * "MRKU8974936 20 DC ML-TR1550076 500 25000 25050" / "CAIU6952005 767737 1000 25000 25050".
 * sistemdekiler: kontrol hanesi tutmayan ama sistemde AYNEN kayitli numara da okunur (16.11.2026, PSRU2219194).
 */
export function talimatKonteynerleri(metinHam: string, sistemdekiler: string[] = []): BelgeKonteyneri[] {
  const sistem = new Set(sistemdekiler.map((x) => x.replace(/\s+/g, "").toUpperCase()));
  const m = sade(metinHam);
  const sonuc: BelgeKonteyneri[] = [];
  const re = /\b([A-Z]{3}[UJZ]\s?\d{7})\s+(?:\d{2}\s?(?:DC|DV|HC|GP|HQ|RF|OT|FR)\s+)?(\S+)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\b/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(m))) {
    const no = x[1].replace(/\s+/g, "");
    if ((!konteynerGecerli(no) && !sistem.has(no)) || sonuc.some((s) => s.no === no)) continue;
    sonuc.push({ no, muhur: x[2], kap: sayiOku(x[3]), net: sayiOku(x[4]), brut: sayiOku(x[5]) });
  }
  return sonuc;
}

export function konsimentoMetniniKontrolEt(metinHam: string, model: TalimatModeli): KonsimentoKontrolSonucu | null {
  const sablon = talimatSablonuTani(metinHam);
  if (!sablon) return null;
  const metin = sade(metinHam);
  const k: KonsimentoKontrolSatiri[] = [];
  const ekle = (alan: string, durum: KonsimentoKontrolDurumu, sistem: string, belge: string, not?: string) => k.push({ alan, durum, sistem, belge, ...(not ? { not } : {}) });

  // Booking (birden fazla rezervasyon "A + B")
  const bookingler = model.booking.split("+").map((x) => x.trim()).filter(Boolean);
  if (!bookingler.length) ekle("Booking no", "bilgi", "-", "-", "Sistemde booking no yok.");
  else if (sablon === "akkon" && !bookingler.some((b) => kelimeVar(metin, b))) ekle("Booking no", "bilgi", model.booking, "-", "Akkon formunda booking alanı yok.");
  else {
    const eksik = bookingler.filter((b) => !kelimeVar(metin, b));
    ekle("Booking no", eksik.length ? "uyusmuyor" : "uyumlu", model.booking, eksik.length ? "-" : model.booking, eksik.length ? `Belgede yok: ${eksik.join(", ")}` : undefined);
  }

  // Gemi / sefer
  const gemi = sade(model.gemiAdi).replace(/^M\s?\/?\s?[VS]\s+/, "");
  if (!gemi) ekle("Gemi / sefer", "bilgi", "-", "-", "Rezervasyonda gemi adı yok.");
  else if (!kelimeVar(metin, gemi)) ekle("Gemi / sefer", "uyusmuyor", model.gemi, "-", "Gemi adı belgede yok.");
  else {
    const s = new RegExp(`${kacis(gemi)}\\s*(?:/\\s*)?([A-Z0-9]{2,})`).exec(metin)?.[1] || "";
    const sefer = sade(model.sefer);
    if (!sefer) ekle("Gemi / sefer", "uyumlu", model.gemiAdi, model.gemiAdi);
    else if (s === sefer) ekle("Gemi / sefer", "uyumlu", `${model.gemiAdi} ${model.sefer}`, `${model.gemiAdi} ${s}`);
    else ekle("Gemi / sefer", "uyusmuyor", `${model.gemiAdi} ${model.sefer}`, `${model.gemiAdi} ${s || "-"}`, "Sefer no farklı. Acente seferi değiştirdiyse rezervasyonu güncelleyin.");
  }

  // Limanlar
  if (!model.polAnahtar) ekle("Yükleme limanı", "bilgi", "-", "-");
  else ekle("Yükleme limanı", kelimeVar(metin, model.polAnahtar) ? "uyumlu" : "uyusmuyor", model.polAnahtar, kelimeVar(metin, model.polAnahtar) ? model.polAnahtar : "-");
  if (!model.pod) ekle("Tahliye limanı", "bilgi", "-", "-");
  else ekle("Tahliye limanı", kelimeVar(metin, model.pod) ? "uyumlu" : "uyusmuyor", model.pod, kelimeVar(metin, model.pod) ? model.pod : "-");

  // Konteynerler
  const sistemNo = model.konteynerler.map((x) => x.no);
  const belgeK = talimatKonteynerleri(metinHam, sistemNo);
  if (!belgeK.length) ekle("Konteynerler", "okunamadi", `${sistemNo.length} adet`, "-", "Konteyner satırları okunamadı; elle bakın.");
  else {
    const eksik = sistemNo.filter((n) => !belgeK.some((b) => b.no === n));
    const fazla = belgeK.filter((b) => !sistemNo.includes(b.no)).map((b) => b.no);
    ekle("Konteynerler", eksik.length || fazla.length ? "uyusmuyor" : "uyumlu", `${sistemNo.length} adet`, `${belgeK.length} adet`,
      [eksik.length ? `Belgede yok: ${eksik.join(", ")}` : "", fazla.length ? `Sistemde yok: ${fazla.join(", ")}` : ""].filter(Boolean).join(" · ") || undefined);
    const muhurFark: string[] = []; const agirlikFark: string[] = [];
    for (const s of model.konteynerler) {
      const b = belgeK.find((x) => x.no === s.no); if (!b) continue;
      if (s.muhur && sade(s.muhur).replace(/\s/g, "") !== b.muhur) muhurFark.push(`${s.no}: ${s.muhur} ≠ ${b.muhur}`);
      if ((s.kap && s.kap !== b.kap) || (s.net && s.net !== b.net) || (s.brut && s.brut !== b.brut)) agirlikFark.push(`${s.no}: ${s.kap}/${s.net}/${s.brut} ≠ ${b.kap}/${b.net}/${b.brut}`);
    }
    ekle("Mühür no", muhurFark.length ? "uyusmuyor" : "uyumlu", "konteyner bazında", muhurFark.length ? `${muhurFark.length} farklı` : "aynı", muhurFark.join(" · ") || undefined);
    ekle("Kap / net / brüt", agirlikFark.length ? "uyusmuyor" : "uyumlu", "konteyner bazında", agirlikFark.length ? `${agirlikFark.length} farklı` : "aynı", agirlikFark.join(" · ") || undefined);
  }
  isoSatiri(sistemNo, ekle);

  // Toplamlar (belgede "250.500" ya da "250.500,00")
  const toplamVar = (n: number) => !!n && (kelimeVar(metin, sayiTr(n)) || kelimeVar(metin, sayiTr(n, 2)));
  const brutOk = toplamVar(model.toplamBrut), netOk = toplamVar(model.toplamNet);
  ekle("Toplam net / brüt", brutOk && netOk ? "uyumlu" : "uyusmuyor", `${sayiTr(model.toplamNet)} / ${sayiTr(model.toplamBrut)} kg`, brutOk && netOk ? "aynı" : "belgede bulunamadı");

  // Navlun
  let navlun = "";
  if (sablon === "standart") navlun = /SEA FREIGHT .{0,12}NAVLUN.{0,3} (PREPAID|COLLECT)/.exec(metin)?.[1] || "";
  else {
    // "NAVLUN (freight) : PREPAID ( X ) COLLECT ( )" -> sade: "PREPAID X COLLECT"
    const n = /PREPAID( X)? COLLECT( X)?/.exec(metin);
    navlun = n?.[1] && !n?.[2] ? "PREPAID" : n?.[2] && !n?.[1] ? "COLLECT" : "";
  }
  if (!navlun) ekle("Navlun", "okunamadi", model.navlun, "-");
  else ekle("Navlun", navlun === model.navlun ? "uyumlu" : "uyusmuyor", model.navlun, navlun, navlun === model.navlun ? undefined : "Teslim şekline göre navlun ödemesi farklı.");

  // GTIP
  ekle("GTİP", kelimeVar(metin, model.gtip) ? "uyumlu" : "uyusmuyor", model.gtip, kelimeVar(metin, model.gtip) ? model.gtip : "-");

  // Taraflar: dosyadaki consignee / notify ilk satiri belgede gecmeli
  const ilk = (s: string) => s.split("\n").map((x) => x.trim()).find(Boolean) || "";
  if (!model.consignee) ekle("Consignee", "bilgi", "-", "-", "Dosyada consignee yok; talimattakini kontrol edin.");
  else ekle("Consignee", kelimeVar(metin, ilk(model.consignee)) ? "uyumlu" : "uyusmuyor", ilk(model.consignee), kelimeVar(metin, ilk(model.consignee)) ? ilk(model.consignee) : "-");
  if (!model.notify.length) ekle("Notify", "bilgi", "-", "-", "Dosyada notify yok.");
  else {
    const yok = model.notify.map(ilk).filter((n) => !kelimeVar(metin, n));
    ekle("Notify", yok.length ? "uyusmuyor" : "uyumlu", model.notify.map(ilk).join(" · "), yok.length ? "-" : model.notify.map(ilk).join(" · "), yok.length ? `Belgede yok: ${yok.join(", ")}` : undefined);
  }

  return sonucOlustur(k, sablon);
}

type Ekle = (alan: string, durum: KonsimentoKontrolDurumu, sistem: string, belge: string, not?: string) => void;

/** Sistemdeki konteyner no'larindan ISO 6346 kontrol hanesi tutmayanlar: "elle bakin" (uyusmazlik sayilmaz). */
function isoSatiri(sistemNo: string[], ekle: Ekle) {
  const h = kontrolHanesiHatalari(sistemNo);
  if (h.length) ekle("Konteyner no (ISO)", "bilgi", h.map((x) => x.no).join(", "), "teyit edin", kontrolHanesiNotu(h));
}

function sonucOlustur(k: KonsimentoKontrolSatiri[], sablon: KonsimentoKontrolSonucu["sablon"]): KonsimentoKontrolSonucu {
  const uyusmayan = k.filter((x) => x.durum === "uyusmuyor");
  const okunamayan = k.filter((x) => x.durum === "okunamadi");
  const uyumluSayi = k.filter((x) => x.durum === "uyumlu").length;
  const iso = k.some((x) => x.alan === "Konteyner no (ISO)") ? " Konteyner no kontrol hanesi tutmuyor; teyit edin." : "";
  const ozet = (uyusmayan.length
    ? `${uyusmayan.length} alan sistemle uyuşmuyor: ${uyusmayan.map((x) => x.alan).join(", ")}.`
    : `${uyumluSayi} alan sistemle uyumlu.${okunamayan.length ? ` ${okunamayan.length} alan okunamadı (${okunamayan.map((x) => x.alan).join(", ")}).` : ""}`) + iso;
  return {
    kaynak: "metin", sablon, uyumlu: uyusmayan.length === 0, ozet, kontroller: k,
    uyusmazliklar: uyusmayan.map((x) => ({ alan: x.alan, sistemde: x.sistem, dosyada: x.not ? `${x.belge} (${x.not})` : x.belge })),
    tarih: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DRAFT BL - sablondan bagimsiz kontrol (16.11.2026)
// ---------------------------------------------------------------------------
// Kullanici: "Fatura / konsimento talimati / Draft BL / beyanname kontrolleri en dogru sekilde yapilmali."
// Eski Draft BL kontrolu yalniz yapay zekaydi ve 16 dosyanin 14'unde "uyumsuz" dedi (BL no, dara, konteyner tipi,
// "MARPORT" / "AMBARLI" gibi ayni limanin farkli yazimi). Armator formlari cok farkli oldugu icin KONUM yerine
// sistemdeki degerin belgede GECIP GECMEDIGINE bakilir; belgede hic bulunamayan ama genelde yazilmayan bilgi
// (konteyner bazinda agirlik, toplam kap) yanlis alarm vermesin diye "okunamadi / elle bakin" olur.
// Dara ve konteyner tipi KARSILASTIRILMAZ (armator kendi dara degerini yazar). Yapay zeka yalniz BL no /
// consignee / notify okumak icin calisir (draft-bl-section).

/** Ayni liman sayilan yazimlar: Ambarli terminalleri, Asyaport = Tekirdag. */
const POL_ESDEGER: string[][] = [
  ["AMBARLI", "MARPORT", "KUMPORT", "MARDAS", "ISTANBUL"],
  ["ASYAPORT", "TEKIRDAG", "BARBAROS"],
  ["MERSIN", "MIP"], ["IZMIR", "ALSANCAK", "ALIAGA", "NEMPORT"], ["GEMLIK", "GEMPORT", "BORUSAN"],
];

/** Tam sayi icin belgede gecebilecek tum yazimlar: 25050 / 25.050 / 25,050 / 25.050,000 / 25,050.00 */
export function sayiGeciyor(metin: string, n: number): boolean {
  if (!n || !Number.isFinite(n)) return false;
  const tam = String(Math.round(n));
  const gruplu = tam.replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]?");
  return new RegExp(`(?<![0-9.,])${gruplu}(?:[.,]0{1,3})?(?![0-9])`).test(metin);
}

export function draftBlMetniniKontrolEt(metinHam: string, model: TalimatModeli): KonsimentoKontrolSonucu | null {
  const metin = sade(metinHam);
  const sistemNo = model.konteynerler.map((x) => x.no);
  const belgeNo = belgedekiKonteynerler(metinHam, sistemNo);
  // Metin katmani yok (taranmis PDF) ya da hic konteyner bulunamadi -> yapay zeka kontrolu yedek olarak calisir
  if (metin.length < 200 || !sistemNo.length || !belgeNo.length) return null;
  const k: KonsimentoKontrolSatiri[] = [];
  const ekle: Ekle = (alan, durum, sistem, belge, not) => k.push({ alan, durum, sistem, belge, ...(not ? { not } : {}) });

  // Booking (armator BL'sinde cogu zaman yazar; yazmiyorsa bilgi)
  const bookingler = model.booking.split("+").map((x) => x.trim()).filter(Boolean);
  if (bookingler.length) {
    const eksik = bookingler.filter((b) => !kelimeVar(metin, b));
    ekle("Booking no", eksik.length ? "bilgi" : "uyumlu", model.booking, eksik.length ? "-" : model.booking, eksik.length ? "Booking no belgede geçmiyor (bazı armatörler yazmaz)." : undefined);
  }

  // Gemi / sefer
  const gemi = sade(model.gemiAdi).replace(/^M\s?\/?\s?[VS]\s+/, "");
  if (!gemi) ekle("Gemi / sefer", "bilgi", "-", "-", "Rezervasyonda gemi adı yok.");
  else if (!kelimeVar(metin, gemi)) ekle("Gemi / sefer", "uyusmuyor", model.gemi || model.gemiAdi, "-", "Gemi adı belgede yok. Acente gemiyi değiştirdiyse rezervasyonu güncelleyin.");
  else if (!sade(model.sefer) || kelimeVar(metin, sade(model.sefer))) ekle("Gemi / sefer", "uyumlu", `${model.gemiAdi} ${model.sefer}`.trim(), `${model.gemiAdi} ${model.sefer}`.trim());
  else ekle("Gemi / sefer", "bilgi", `${model.gemiAdi} ${model.sefer}`, model.gemiAdi, "Gemi aynı, sefer no belgede bulunamadı; farklıysa rezervasyonu güncelleyin.");

  // Yukleme limani: ayni limanin farkli yazimlari esdeger
  const pol = sade(model.polAnahtar);
  if (!pol) ekle("Yükleme limanı", "bilgi", "-", "-");
  else {
    const grup = POL_ESDEGER.find((g) => g.some((x) => pol.includes(x))) || [pol];
    const bulunan = grup.find((x) => kelimeVar(metin, x));
    ekle("Yükleme limanı", bulunan ? "uyumlu" : "bilgi", model.polAnahtar, bulunan || "-", bulunan ? undefined : "Yükleme limanı belgede bulunamadı; elle bakın.");
  }
  // Varis limani: anahtar ("DJIBOUTI PORT, DJIBOUTI" -> DJIBOUTI)
  const pod = limanAnahtari(model.pod) || sade(model.pod);
  if (!pod) ekle("Tahliye limanı", "bilgi", "-", "-");
  else ekle("Tahliye limanı", kelimeVar(metin, pod) ? "uyumlu" : "uyusmuyor", pod, kelimeVar(metin, pod) ? pod : "-");

  // Konteynerler
  const eksik = sistemNo.filter((n) => !belgeNo.includes(n));
  const fazla = belgeNo.filter((n) => !sistemNo.includes(n));
  ekle("Konteynerler", eksik.length || fazla.length ? "uyusmuyor" : "uyumlu", `${sistemNo.length} adet`, `${belgeNo.length} adet`,
    [eksik.length ? `Belgede yok: ${eksik.join(", ")}` : "", fazla.length ? `Sistemde yok: ${fazla.join(", ")}` : ""].filter(Boolean).join(" · ") || undefined);
  isoSatiri(sistemNo, ekle);

  // Muhurler: sistemdeki her muhur belgede gecmeli
  const muhurlu = model.konteynerler.filter((x) => sade(x.muhur).replace(/\s/g, ""));
  if (muhurlu.length) {
    const yok = muhurlu.filter((x) => !kelimeVar(metin.replace(/\s+/g, " "), sade(x.muhur)) && !metin.replace(/\s+/g, "").includes(sade(x.muhur).replace(/\s+/g, "")));
    ekle("Mühür no", yok.length ? "uyusmuyor" : "uyumlu", `${muhurlu.length} mühür`, yok.length ? `${muhurlu.length - yok.length} bulundu` : "hepsi var",
      yok.length ? `Belgede yok: ${yok.map((x) => `${x.no} ${x.muhur}`).join(" · ")}` : undefined);
  }

  // Konteyner bazinda brut: hic biri yazmiyorsa belge yalniz toplam veriyordur (elle bakin); kismen yazmiyorsa uyusmuyor
  const brutlu = model.konteynerler.filter((x) => x.brut > 0);
  if (brutlu.length) {
    const yok = brutlu.filter((x) => !sayiGeciyor(metin, x.brut));
    if (yok.length === brutlu.length) ekle("Brüt (konteyner)", "bilgi", "konteyner bazında", "-", "Belgede konteyner bazında brüt bulunamadı; elle bakın.");
    else ekle("Brüt (konteyner)", yok.length ? "uyusmuyor" : "uyumlu", "konteyner bazında", yok.length ? `${yok.length} farklı` : "aynı",
      yok.length ? `Belgede yok: ${yok.map((x) => `${x.no} ${sayiTr(x.brut)} kg`).join(" · ")}` : undefined);
  }
  // Toplamlar
  if (model.toplamBrut) ekle("Toplam brüt", sayiGeciyor(metin, model.toplamBrut) ? "uyumlu" : "okunamadi", `${sayiTr(model.toplamBrut)} kg`, sayiGeciyor(metin, model.toplamBrut) ? "aynı" : "-");
  if (model.toplamNet) ekle("Toplam net", sayiGeciyor(metin, model.toplamNet) ? "uyumlu" : "bilgi", `${sayiTr(model.toplamNet)} kg`, sayiGeciyor(metin, model.toplamNet) ? "aynı" : "-",
    sayiGeciyor(metin, model.toplamNet) ? undefined : "Net ağırlık belgede bulunamadı (bazı BL'lerde yalnız brüt yazar).");
  if (model.toplamKap) ekle("Toplam kap", sayiGeciyor(metin, model.toplamKap) ? "uyumlu" : "bilgi", sayiTr(model.toplamKap), sayiGeciyor(metin, model.toplamKap) ? "aynı" : "-",
    sayiGeciyor(metin, model.toplamKap) ? undefined : "Kap adedi belgede bulunamadı; elle bakın.");

  // Taraflar: armator adresi farkli satirlara boler / kisaltir -> yalniz UNVAN (ilk satirin virgulden onceki ilk 5 kelimesi)
  const unvan = (x: string) => (x.split("\n").map((y) => y.trim()).find(Boolean) || "").split(",")[0].split(/\s+/).slice(0, 5).join(" ");
  if (!model.consignee) ekle("Consignee", "bilgi", "-", "-", "Dosyada consignee yok; BL'dekini kontrol edin.");
  else {
    const c = unvan(model.consignee);
    ekle("Consignee", kelimeVar(metin, c) ? "uyumlu" : "uyusmuyor", c, kelimeVar(metin, c) ? c : "-");
  }
  if (model.notify.length) {
    const adlar = model.notify.map(unvan).filter(Boolean);
    const yok = adlar.filter((n) => !kelimeVar(metin, n));
    ekle("Notify", yok.length ? "uyusmuyor" : "uyumlu", adlar.join(" · "), yok.length ? "-" : adlar.join(" · "), yok.length ? `Belgede yok: ${yok.join(", ")}` : undefined);
  }
  return sonucOlustur(k, "draft_bl");
}
