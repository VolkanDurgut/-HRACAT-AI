/**
 * HAT TAKIP Asama 4 (28.11.2026): Hapag-Lloyd Commercial Schedules (DCSA CS 1.0) point-to-point rotalarini sade sefer
 * listesine cevirir. TEK YER: edge hat-takip ("sefer_ara"), sayfa ve tests/hat-sefer.test.ts. Saf (ag / veritabani yok).
 *
 * Canli bicim (28.11.2026 TRIST -> GHTEM denemesi):
 *   { placeOfReceipt{location{UNLocationCode, locationName, facility{facilityCode}}, dateTime}, placeOfDelivery{...},
 *     legs[{ sequenceNumber, departure{location, dateTime}, arrival{location, dateTime},
 *            transport{ modeOfTransport, servicePartners[{carrierServiceName, carrierServiceCode, carrierExportVoyageNumber}],
 *                       vessel{ vesselIMONumber, name, flag } } }],
 *     cutOffTimes[{cutOffDateTimeCode, cutOffDateTime}], solutionNumber, transitTime }
 * Gemi adi "vessel.name" (DCSA T&T'deki "vesselName" degil); eski adlar da okunur.
 */

export type SeferBacagi = {
  sira: number;
  tur: string;
  gemi: string | null;
  imo: string | null;
  bayrak: string | null;
  sefer: string | null;
  servis: string | null;
  servis_kodu: string | null;
  kalkis_kodu: string | null;
  kalkis_adi: string | null;
  kalkis_zamani: string | null;
  varis_kodu: string | null;
  varis_adi: string | null;
  varis_zamani: string | null;
};

/** Cut-off kodlari (DCSA): DCO dokuman, VCO VGM, FCO konteyner (FCL), DGC tehlikeli yuk, RCO reefer. */
export type SeferCutoff = { dokuman: string | null; vgm: string | null; konteyner: string | null; tehlikeli: string | null; reefer: string | null };

export type Sefer = {
  anahtar: string;
  kalkis: string | null;
  varis: string | null;
  transit_gun: number | null;
  pol: string | null;
  pol_adi: string | null;
  terminal: string | null;
  pod: string | null;
  pod_adi: string | null;
  /** ilk gemi bacagi (ana gemi) */
  gemi: string | null;
  sefer: string | null;
  servis: string | null;
  servis_kodu: string | null;
  /** aktarma limanlari (gemi bacaklari arasindaki ara limanlar), sirayla */
  aktarmalar: { kod: string | null; ad: string | null }[];
  bacaklar: SeferBacagi[];
  cutoff: SeferCutoff;
};

type Kayit = Record<string, unknown>;
const nesne = (v: unknown): Kayit => (v && typeof v === "object" && !Array.isArray(v) ? (v as Kayit) : {});
const metin = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const zamanMs = (z: string | null) => (z ? Date.parse(z) : NaN);

function yer(v: unknown): { kod: string | null; ad: string | null; terminal: string | null; zaman: string | null } {
  const n = nesne(v);
  const loc = nesne(n.location);
  return {
    kod: metin(loc.UNLocationCode ?? n.UNLocationCode)?.toUpperCase() ?? null,
    ad: metin(loc.locationName ?? n.locationName),
    terminal: metin(nesne(loc.facility).facilityCode ?? loc.facilityCode),
    zaman: metin(n.dateTime),
  };
}

function bacakNormalle(b: Kayit, i: number): SeferBacagi {
  const t = nesne(b.transport);
  const v = nesne(t.vessel);
  const ortak = Array.isArray(t.servicePartners) ? nesne(t.servicePartners[0]) : {};
  const k = yer(b.departure);
  const a = yer(b.arrival);
  const no = Number(b.sequenceNumber);
  return {
    sira: Number.isFinite(no) && no > 0 ? no : i + 1,
    tur: (metin(t.modeOfTransport ?? b.modeOfTransport) ?? "VESSEL").toUpperCase(),
    gemi: metin(v.name ?? v.vesselName ?? t.vesselName),
    imo: metin(v.vesselIMONumber ?? t.vesselIMONumber),
    bayrak: metin(v.flag ?? v.vesselFlag),
    sefer: metin(ortak.carrierExportVoyageNumber ?? ortak.carrierImportVoyageNumber ?? t.carrierExportVoyageNumber),
    servis: metin(ortak.carrierServiceName),
    servis_kodu: metin(ortak.carrierServiceCode),
    kalkis_kodu: k.kod, kalkis_adi: k.ad, kalkis_zamani: k.zaman,
    varis_kodu: a.kod, varis_adi: a.ad, varis_zamani: a.zaman,
  };
}

function cutoffOku(v: unknown): SeferCutoff {
  const c: SeferCutoff = { dokuman: null, vgm: null, konteyner: null, tehlikeli: null, reefer: null };
  const harita: Record<string, keyof SeferCutoff> = { DCO: "dokuman", VCO: "vgm", FCO: "konteyner", DGC: "tehlikeli", RCO: "reefer" };
  for (const x of Array.isArray(v) ? v : []) {
    const n = nesne(x);
    const alan = harita[metin(n.cutOffDateTimeCode)?.toUpperCase() ?? ""];
    const z = metin(n.cutOffDateTime);
    if (alan && z && !Number.isNaN(zamanMs(z))) c[alan] = z;
  }
  return c;
}

/** Tek rota -> Sefer. Kalkis / varis zamani yoksa null (listeye alinmaz). */
export function seferNormalle(p: Kayit): Sefer | null {
  const bacaklar = (Array.isArray(p.legs) ? p.legs : []).map((b, i) => bacakNormalle(nesne(b), i)).sort((x, y) => x.sira - y.sira);
  const al = yer(p.placeOfReceipt);
  const ver = yer(p.placeOfDelivery);
  const kalkis = al.zaman ?? bacaklar[0]?.kalkis_zamani ?? null;
  const varis = ver.zaman ?? bacaklar[bacaklar.length - 1]?.varis_zamani ?? null;
  if (!kalkis || !varis || Number.isNaN(zamanMs(kalkis)) || Number.isNaN(zamanMs(varis))) return null;
  const gemiler = bacaklar.filter((b) => b.tur === "VESSEL");
  const ana = gemiler[0] ?? bacaklar[0] ?? null;
  const aktarmalar = gemiler.slice(0, -1).map((b) => ({ kod: b.varis_kodu, ad: b.varis_adi }));
  const tt = Number(p.transitTime);
  const transit = Number.isFinite(tt) && tt >= 0 ? tt : Math.round((zamanMs(varis) - zamanMs(kalkis)) / 86_400_000);
  const pol = al.kod ?? bacaklar[0]?.kalkis_kodu ?? null;
  const pod = ver.kod ?? bacaklar[bacaklar.length - 1]?.varis_kodu ?? null;
  return {
    anahtar: [pol, pod, kalkis, ana?.gemi, ana?.sefer, metin(p.solutionNumber)].join("|"),
    kalkis, varis, transit_gun: transit,
    pol, pol_adi: al.ad ?? bacaklar[0]?.kalkis_adi ?? null, terminal: al.terminal,
    pod, pod_adi: ver.ad ?? bacaklar[bacaklar.length - 1]?.varis_adi ?? null,
    gemi: ana?.gemi ?? null, sefer: ana?.sefer ?? null, servis: ana?.servis ?? null, servis_kodu: ana?.servis_kodu ?? null,
    aktarmalar, bacaklar, cutoff: cutoffOku(p.cutOffTimes),
  };
}

/** Hapag cevabi -> kalkis sirali sefer listesi (ayni anahtar tek). Dizi degilse bos. */
export function seferleriNormalle(govde: unknown): Sefer[] {
  if (!Array.isArray(govde)) return [];
  const gorulen = new Set<string>();
  return govde
    .map((p) => seferNormalle(nesne(p)))
    .filter((x): x is Sefer => !!x && !gorulen.has(x.anahtar) && (gorulen.add(x.anahtar), true))
    .sort((a, b) => zamanMs(a.kalkis) - zamanMs(b.kalkis) || (a.transit_gun ?? 0) - (b.transit_gun ?? 0));
}

/** Hapag hata govdesinden kullaniciya gosterilecek kisa metin. */
export function hapagHataMetni(durum: number, govde: unknown): string {
  if (durum === 429) return "Hapag-Lloyd şu an yoğun (saniyede 1 sorgu sınırı). Birkaç saniye sonra tekrar deneyin.";
  const hatalar = Array.isArray(nesne(govde).errors) ? (nesne(govde).errors as unknown[]) : [];
  const ilk = nesne(hatalar[0]);
  const kod = Number(ilk.errorCode);
  const ozellik = metin(ilk.property) ?? "";
  if (kod === 8001 || /not found/i.test(metin(ilk.errorCodeText) ?? "")) {
    return ozellik.includes("Delivery") ? "Hapag-Lloyd bu varış limanı kodunu tanımıyor." : ozellik.includes("Receipt") ? "Hapag-Lloyd bu çıkış limanı kodunu tanımıyor." : "Hapag-Lloyd bu liman kodunu tanımıyor.";
  }
  if (durum === 401 || durum === 403) return "Hapag-Lloyd bağlantı yetkisi reddedildi (abonelik / anahtar).";
  return `Hapag-Lloyd cevap vermedi (HTTP ${durum}).`;
}
