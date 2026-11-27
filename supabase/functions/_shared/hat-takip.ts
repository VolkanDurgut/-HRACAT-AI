/**
 * HAT TAKIP - DCSA Track & Trace olaylarini yorumlama (27.11.2026). TEK YER: edge hat-takip, lib/hat-takip ve
 * tests/hat-takip.test.ts bunu kullanir. Saf fonksiyonlar (ag / veritabani yok).
 *
 * DCSA T&T v2 (Hapag-Lloyd api.hlag.com/hlag/external/v2/events): her olay
 *   eventType: EQUIPMENT | TRANSPORT | SHIPMENT
 *   eventClassifierCode: PLN (planlanan) | EST (tahmini) | ACT (gerceklesen)
 *   EQUIPMENT: equipmentEventTypeCode (GTOT kapidan cikis, GTIN kapidan giris, LOAD yukleme, DISC tahliye ...),
 *              equipmentReference (konteyner), emptyIndicatorCode (EMPTY / LADEN)
 *   TRANSPORT: transportEventTypeCode (DEPA kalkis / ARRI varis), transportCall { UNLocationCode, vessel, voyage }
 *   SHIPMENT : shipmentEventTypeCode (CONF onay, ISSU belge kesildi ...)
 *
 * Ozet kurali (Asama 1, gozlem):
 *  - POL = en erken zamanli DEPA olayinin limani; ETD = o limandaki DEPA'larin en iyisi (ACT > EST > PLN, esitse en yeni olusan)
 *  - POD = en gec zamanli ARRI olayinin limani (son varis = bosaltma limani); ETA = o limandaki ARRI'larin en iyisi
 *  - Gemi / sefer: ETD olayindan (yoksa ETA olayindan)
 */

export type HatOlayi = {
  anahtar: string;
  tur: string;
  kod: string | null;
  sinif: string | null;
  zaman: string | null;
  olusma: string | null;
  konteyner: string | null;
  bos_dolu: string | null;
  yer: string | null;
  yer_adi: string | null;
  gemi: string | null;
  imo: string | null;
  sefer: string | null;
};

export type HatOzeti = {
  olay_sayisi: number;
  konteyner_sayisi: number;
  etd: string | null;
  etd_sinif: string | null;
  eta: string | null;
  eta_sinif: string | null;
  pol: string | null;
  pod: string | null;
  gemi: string | null;
  sefer: string | null;
};

type Kayit = Record<string, unknown>;
const metin = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const nesne = (v: unknown): Kayit => (v && typeof v === "object" && !Array.isArray(v) ? (v as Kayit) : {});

/** Kisa, kararli anahtar (eventID yoksa): FNV-1a 32 bit, hex. */
export function kisaOzet(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** DCSA olayini sade kayda cevirir. Taninmayan (eventType yok) olay null. */
export function olayNormalle(o: Kayit): HatOlayi | null {
  const tur = metin(o.eventType)?.toUpperCase() ?? null;
  if (!tur) return null;
  const tc = nesne(o.transportCall);
  const ves = nesne(tc.vessel);
  const tcYer = nesne(tc.location);
  const olayYer = nesne(o.eventLocation);
  const kod = metin(o.transportEventTypeCode ?? o.equipmentEventTypeCode ?? o.shipmentEventTypeCode)?.toUpperCase() ?? null;
  const yer = metin(olayYer.UNLocationCode ?? tc.UNLocationCode ?? tcYer.UNLocationCode)?.toUpperCase() ?? null;
  const yerAdi = metin(olayYer.locationName ?? tcYer.locationName ?? nesne(tc.facility).facilityName);
  const zaman = metin(o.eventDateTime);
  const olusma = metin(o.eventCreatedDateTime);
  const konteyner = metin(o.equipmentReference)?.toUpperCase().replace(/\s+/g, "") ?? null;
  const sinif = metin(o.eventClassifierCode)?.toUpperCase() ?? null;
  const eventId = metin(o.eventID);
  const anahtar = eventId ?? `h${kisaOzet([tur, kod, sinif, zaman, konteyner, yer, olusma].join("|"))}`;
  return {
    anahtar, tur, kod, sinif, zaman, olusma, konteyner,
    bos_dolu: metin(o.emptyIndicatorCode)?.toUpperCase() ?? null,
    yer, yer_adi: yerAdi,
    gemi: metin(ves.vesselName),
    imo: metin(ves.vesselIMONumber),
    sefer: metin(tc.exportVoyageNumber ?? tc.carrierExportVoyageNumber ?? tc.importVoyageNumber),
  };
}

export const SINIF_DERECE: Record<string, number> = { ACT: 3, EST: 2, PLN: 1 };
const derece = (s: string | null) => SINIF_DERECE[s ?? ""] ?? 0;
const ms = (z: string | null) => (z ? Date.parse(z) : NaN);

/** Ayni duraga ait olaylardan en guvenilir olani: ACT > EST > PLN; esitse en yeni olusan, o da esitse en gec zaman. */
export function enIyiOlay(liste: HatOlayi[]): HatOlayi | null {
  let en: HatOlayi | null = null;
  for (const o of liste) {
    if (!o.zaman || Number.isNaN(ms(o.zaman))) continue;
    if (!en) { en = o; continue; }
    const d = derece(o.sinif) - derece(en.sinif);
    if (d > 0) { en = o; continue; }
    if (d < 0) continue;
    const yeni = (ms(o.olusma) || 0) - (ms(en.olusma) || 0);
    if (yeni > 0 || (yeni === 0 && ms(o.zaman) > ms(en.zaman))) en = o;
  }
  return en;
}

export function hatOzeti(olaylar: HatOlayi[]): HatOzeti {
  const tasima = olaylar.filter((o) => o.tur === "TRANSPORT" && o.zaman && !Number.isNaN(ms(o.zaman)));
  const kalkislar = tasima.filter((o) => o.kod === "DEPA");
  const varislar = tasima.filter((o) => o.kod === "ARRI");
  const ilkKalkis = kalkislar.reduce<HatOlayi | null>((a, o) => (!a || ms(o.zaman) < ms(a.zaman) ? o : a), null);
  const sonVaris = varislar.reduce<HatOlayi | null>((a, o) => (!a || ms(o.zaman) > ms(a.zaman) ? o : a), null);
  const pol = ilkKalkis?.yer ?? null;
  const pod = sonVaris?.yer ?? null;
  const etd = enIyiOlay(kalkislar.filter((o) => o.yer === pol));
  const eta = enIyiOlay(varislar.filter((o) => o.yer === pod));
  const kaynak = etd ?? eta;
  return {
    olay_sayisi: olaylar.length,
    konteyner_sayisi: new Set(olaylar.map((o) => o.konteyner).filter(Boolean)).size,
    etd: etd?.zaman ?? null, etd_sinif: etd?.sinif ?? null,
    eta: eta?.zaman ?? null, eta_sinif: eta?.sinif ?? null,
    pol, pod,
    gemi: kaynak?.gemi ?? null,
    sefer: kaynak?.sefer ?? null,
  };
}

/** ISO zamanini Istanbul takvim gunune cevirir (YYYY-MM-DD). TR saati UTC+3, yaz saati yok. */
export function istanbulGunu(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Hat ETA'si ile sistem ETA'si arasindaki gun farki (hat - sistem). Biri yoksa null. */
export function etaFarkiGun(sistemEta: string | null, hatEta: string | null): number | null {
  const s = sistemEta ? sistemEta.slice(0, 10) : null;
  const h = istanbulGunu(hatEta);
  if (!s || !h || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Math.round((Date.parse(`${h}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000);
}

/**
 * Konteyner yolculugu: sayfadaki zaman cizelgesinin sutunlari. Her adim icin konteynerin en iyi olayi.
 * Liman (POL / POD) ayrimi: GTOT bos = depodan / limandan bos alindi; GTIN dolu = limana girdi; LOAD; DISC; GTOT dolu
 * varis limaninda = teslim alindi (limandan cikti).
 */
export type AdimAnahtari = "bos_alindi" | "limana_girdi" | "yuklendi" | "tahliye" | "teslim";
export const ADIMLAR: { anahtar: AdimAnahtari; etiket: string }[] = [
  { anahtar: "bos_alindi", etiket: "Boş alındı" },
  { anahtar: "limana_girdi", etiket: "Limana girdi" },
  { anahtar: "yuklendi", etiket: "Gemiye yüklendi" },
  { anahtar: "tahliye", etiket: "Tahliye edildi" },
  { anahtar: "teslim", etiket: "Limandan çıktı" },
];

export type KonteynerYolculugu = { konteyner: string; adimlar: Partial<Record<AdimAnahtari, HatOlayi>> };

export function adimBul(o: HatOlayi, pod: string | null): AdimAnahtari | null {
  if (o.tur !== "EQUIPMENT" || !o.konteyner) return null;
  const varista = !!pod && o.yer === pod;
  if (o.kod === "GTOT" && o.bos_dolu === "EMPTY" && !varista) return "bos_alindi";
  if (o.kod === "GTIN" && o.bos_dolu !== "EMPTY" && !varista) return "limana_girdi";
  if (o.kod === "LOAD" && !varista) return "yuklendi";
  if (o.kod === "DISC" && varista) return "tahliye";
  if (o.kod === "GTOT" && o.bos_dolu !== "EMPTY" && varista) return "teslim";
  return null;
}

export function konteynerYolculuklari(olaylar: HatOlayi[], pod: string | null): KonteynerYolculugu[] {
  const gruplar = new Map<string, Map<AdimAnahtari, HatOlayi[]>>();
  for (const o of olaylar) {
    const a = adimBul(o, pod);
    if (!a || !o.konteyner) continue;
    const g = gruplar.get(o.konteyner) ?? new Map<AdimAnahtari, HatOlayi[]>();
    g.set(a, [...(g.get(a) ?? []), o]);
    gruplar.set(o.konteyner, g);
  }
  return Array.from(gruplar.entries())
    .map(([konteyner, g]) => {
      const adimlar: Partial<Record<AdimAnahtari, HatOlayi>> = {};
      g.forEach((liste, a) => { const en = enIyiOlay(liste); if (en) adimlar[a] = en; });
      return { konteyner, adimlar };
    })
    .sort((x, y) => x.konteyner.localeCompare(y.konteyner));
}
