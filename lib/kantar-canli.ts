/**
 * KANTAR PANELI · CANLI KANTAR BILGISI (24.11.2026). Veri: kantar_canli() (migration 20261124120000; SALT OKUNUR).
 * Kantar programinin (BAYKON Truck Scale) tartimlari DBA ajani ile her dakika gelir (kantar_tartimlari / kantar_bekleyenler).
 *
 * Kurallar (kullanici): evraklardaki kg'a DOKUNULMAZ; ic piyasada kantar irsaliyenin yerine GECMEZ. Bu yuzden burada
 * gosterilen her sey BILGIDIR: "kantarda bekliyor / dolduruluyor", "tartildi, DBA bekleniyor", "kantarda tartildi,
 * irsaliyesi sisteme girilmedi". Resmi rakamlar (DBA, irsaliye) degismez. Fiyat yok (kantarci fiyat gormez).
 * SAF yardimcilar (test: tests/kantar-canli.test.ts); veri okuma lib/kantar-canli-veri.ts.
 */

export type KantarIceride = {
  kayit_no: number;
  plaka: string | null;
  firma: string | null;
  urun: string | null;
  konteyner: string | null;
  giris: string | null;
  bekleme_dk: number | null;
  tartim1_kg: number | null;
  dosya_no: string | null;
  is_emri_no: string | null;
  alis_no: string | null;
};
export type KonteynerKantarDurumu = { konteyner_id: string; durum: "dolduruluyor" | "tartildi"; giris: string | null; cikis: string | null; plaka: string | null };
export type KantarBekleyenIs = { id: string; kg: number; arac: number; son_cikis: string | null; plakalar: string[] };
export type KantarEslesmeyen = { kayit_no: number; plaka: string | null; firma: string | null; urun: string | null; irsaliye_no: string | null; cikis: string | null; net_kg: number };
export type KantarCanli = {
  sonSinyal: string | null;
  iceride: KantarIceride[];
  konteynerler: Map<string, KonteynerKantarDurumu>;
  isEmirleri: Map<string, KantarBekleyenIs>;
  alislar: Map<string, KantarBekleyenIs>;
  eslesmeyen: KantarEslesmeyen[];
};

const sayi = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const metin = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const dizi = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);

export function kantarCanliHazirla(ham: unknown): KantarCanli | null {
  if (!ham || typeof ham !== "object") return null;
  const r = ham as Record<string, unknown>;
  const bekleyenIs = (anahtar: string, idAlani: string) =>
    new Map(dizi(r[anahtar]).map((x) => {
      const id = metin(x[idAlani]) || "";
      return [id, { id, kg: sayi(x.kg) ?? 0, arac: sayi(x.arac) ?? 0, son_cikis: metin(x.son_cikis), plakalar: Array.isArray(x.plakalar) ? (x.plakalar as unknown[]).map((p) => String(p ?? "")).filter(Boolean) : [] }] as const;
    }).filter(([id]) => !!id));
  return {
    sonSinyal: metin(r.son_sinyal),
    iceride: dizi(r.iceride).map((x) => ({
      kayit_no: sayi(x.kayit_no) ?? 0, plaka: metin(x.plaka), firma: metin(x.firma), urun: metin(x.urun), konteyner: metin(x.konteyner),
      giris: metin(x.giris), bekleme_dk: sayi(x.bekleme_dk), tartim1_kg: sayi(x.tartim1_kg),
      dosya_no: metin(x.dosya_no), is_emri_no: metin(x.is_emri_no), alis_no: metin(x.alis_no),
    })),
    konteynerler: new Map(dizi(r.konteynerler).map((x) => {
      const id = metin(x.konteyner_id) || "";
      return [id, { konteyner_id: id, durum: x.durum === "dolduruluyor" ? "dolduruluyor" : "tartildi", giris: metin(x.giris), cikis: metin(x.cikis), plaka: metin(x.plaka) } as KonteynerKantarDurumu] as const;
    }).filter(([id]) => !!id)),
    isEmirleri: bekleyenIs("is_emirleri", "is_emri_id"),
    alislar: bekleyenIs("alislar", "alis_id"),
    eslesmeyen: dizi(r.eslesmeyen).map((x) => ({
      kayit_no: sayi(x.kayit_no) ?? 0, plaka: metin(x.plaka), firma: metin(x.firma), urun: metin(x.urun),
      irsaliye_no: metin(x.irsaliye_no), cikis: metin(x.cikis), net_kg: sayi(x.net_kg) ?? 0,
    })),
  };
}

/** "45 dk", "2 sa 10 dk", "1 gün 3 sa" */
export function beklemeYazi(dk: number | null | undefined): string {
  if (dk === null || dk === undefined || !Number.isFinite(dk) || dk < 0) return "—";
  const d = Math.round(dk);
  if (d < 60) return `${d} dk`;
  if (d < 24 * 60) { const s = Math.floor(d / 60), m = d % 60; return m ? `${s} sa ${m} dk` : `${s} sa`; }
  const g = Math.floor(d / (24 * 60)), s = Math.floor((d % (24 * 60)) / 60);
  return s ? `${g} gün ${s} sa` : `${g} gün`;
}

/** Kantar bilgisayarindan son veri ne kadar eski? 5 dk'dan eskiyse "kopuk" (ajan her dakika gonderir). */
export function sinyalDurumu(sonSinyal: string | null, simdi: Date = new Date()): { kopuk: boolean; dk: number | null } {
  if (!sonSinyal) return { kopuk: true, dk: null };
  const dk = Math.floor((simdi.getTime() - Date.parse(sonSinyal)) / 60000);
  return { kopuk: !Number.isFinite(dk) || dk > 5, dk: Number.isFinite(dk) ? Math.max(0, dk) : null };
}

/** Bir sevkiyatin konteynerlerinden kac tanesi kantarda dolduruluyor / tartildi (DBA bekleniyor). */
export function sevkiyatKantarSayilari(konteynerIdleri: string[], harita: Map<string, KonteynerKantarDurumu> | null | undefined): { dolduruluyor: number; tartildi: number } {
  let dolduruluyor = 0, tartildi = 0;
  if (!harita) return { dolduruluyor, tartildi };
  for (const id of konteynerIdleri) {
    const d = harita.get(id);
    if (d?.durum === "dolduruluyor") dolduruluyor++;
    else if (d?.durum === "tartildi") tartildi++;
  }
  return { dolduruluyor, tartildi };
}

/** "dun 21:51" / "bugun 09:17" / "22.11 14:05" (Istanbul saati) */
export function kantarSaatYazi(iso: string | null, simdi: Date = new Date()): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "—";
  const gun = (d: Date) => d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const saat = t.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
  if (gun(t) === gun(simdi)) return `bugün ${saat}`;
  if (gun(t) === gun(new Date(simdi.getTime() - 86400000))) return `dün ${saat}`;
  // day+month bicimi ortama gore "20.11" / "20/11" olabiliyor: parcalardan elle
  const p = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }).formatToParts(t);
  const al = (tur: string) => p.find((x) => x.type === tur)?.value || "";
  return `${al("day")}.${al("month")} ${saat}`;
}
