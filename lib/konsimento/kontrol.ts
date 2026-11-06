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

import { konteynerGecerli } from "@/lib/beyanname-kontrol";
import { sayiTr, type TalimatModeli } from "@/lib/konsimento/talimat";

export type KonsimentoKontrolDurumu = "uyumlu" | "uyusmuyor" | "okunamadi" | "bilgi";
export type KonsimentoKontrolSatiri = { alan: string; durum: KonsimentoKontrolDurumu; sistem: string; belge: string; not?: string };
export type KonsimentoKontrolSonucu = {
  kaynak: "metin";
  sablon: "standart" | "akkon";
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
/** "MRKU8974936 20 DC ML-TR1550076 500 25000 25050" / "CAIU6952005 767737 1000 25000 25050" */
export function talimatKonteynerleri(metinHam: string): BelgeKonteyneri[] {
  const m = sade(metinHam);
  const sonuc: BelgeKonteyneri[] = [];
  const re = /\b([A-Z]{3}[UJZ]\s?\d{7})\s+(?:\d{2}\s?(?:DC|DV|HC|GP|HQ|RF|OT|FR)\s+)?(\S+)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\b/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(m))) {
    const no = x[1].replace(/\s+/g, "");
    if (!konteynerGecerli(no) || sonuc.some((s) => s.no === no)) continue;
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
  const belgeK = talimatKonteynerleri(metinHam);
  const sistemNo = model.konteynerler.map((x) => x.no);
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

  const uyusmayan = k.filter((x) => x.durum === "uyusmuyor");
  const okunamayan = k.filter((x) => x.durum === "okunamadi");
  const uyumluSayi = k.filter((x) => x.durum === "uyumlu").length;
  const ozet = uyusmayan.length
    ? `${uyusmayan.length} alan sistemle uyuşmuyor: ${uyusmayan.map((x) => x.alan).join(", ")}.`
    : `${uyumluSayi} alan sistemle uyumlu.${okunamayan.length ? ` ${okunamayan.length} alan okunamadı (${okunamayan.map((x) => x.alan).join(", ")}).` : ""}`;
  return {
    kaynak: "metin", sablon, uyumlu: uyusmayan.length === 0, ozet, kontroller: k,
    uyusmazliklar: uyusmayan.map((x) => ({ alan: x.alan, sistemde: x.sistem, dosyada: x.not ? `${x.belge} (${x.not})` : x.belge })),
    tarih: new Date().toISOString(),
  };
}
