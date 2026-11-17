// ============================================================================
// SALT OKUNUR IMAP ISTEMCISI (17.11.2026, Operasyon Ajani - arsiv acigi)
// ============================================================================
// Neden: execution@ -> arsiv Gmail iletmesi bazi acentelerin maillerini teslim edemiyor (28.10.2026'dan beri
// arsive ulasmiyor; muhtemel sebep gondericinin DMARC politikasi). Sunucu kutuyu dogrudan okur.
//
// GUVENLIK ILKELERI:
//  - Kutu EXAMINE ile acilir (salt okunur): hicbir bayrak degismez, mail "okundu" olmaz, silinmez, tasinmaz.
//  - Govde BODY.PEEK ile alinir (\Seen bayragi koyulmaz).
//  - Kullanici / sifre yalniz cagirandan gelir (edge secret); loglanmaz, hata metnine yazilmaz.
//  - Sabit bir toplam sure siniri vardir; asilirsa baglanti kapatilir.
// Bagimlilik yok: Deno TCP/TLS + elle yazilmis kucuk protokol okuyucu (yalniz kullandigimiz komutlar).
// ============================================================================

import { adresAyir, baslikCoz, basliklariAyir, fetchParcalari, imapTarihi, tirnakla } from "./imap-yardimci.ts";
export { adresAyir, alanKriteri, baslikCoz, basliklariAyir, fetchParcalari, imapTarihi, tirnakla } from "./imap-yardimci.ts";

export type ImapAyar = {
  sunucu: string;
  port?: number;
  kullanici: string;
  sifre: string;
  tls?: boolean; // test icin false (yerel sahte sunucu); canlida daima true
  sureMs?: number;
};

export type ImapBaslik = {
  uid: number;
  gonderen: string; // e-posta (kucuk harf)
  gonderenAd: string;
  konu: string;
  tarih: string | null; // ISO
  mesajId: string | null;
};

type Yanit = { satir: string; literaller: Uint8Array[] };

const enc = new TextEncoder();
const latin = new TextDecoder("latin1");

class SaltOkunurImap {
  #conn: Deno.Conn;
  #tampon = new Uint8Array(0);
  #sayac = 0;
  constructor(conn: Deno.Conn) {
    this.#conn = conn;
  }

  async #doldur(): Promise<void> {
    const parca = new Uint8Array(16384);
    const n = await this.#conn.read(parca);
    if (n === null) throw new Error("IMAP baglantisi kapandi");
    const yeni = new Uint8Array(this.#tampon.length + n);
    yeni.set(this.#tampon);
    yeni.set(parca.subarray(0, n), this.#tampon.length);
    this.#tampon = yeni;
  }

  async #satirOku(): Promise<string> {
    for (;;) {
      for (let i = 0; i + 1 < this.#tampon.length; i++) {
        if (this.#tampon[i] === 13 && this.#tampon[i + 1] === 10) {
          const s = latin.decode(this.#tampon.subarray(0, i));
          this.#tampon = this.#tampon.slice(i + 2);
          return s;
        }
      }
      await this.#doldur();
    }
  }

  async #baytOku(n: number): Promise<Uint8Array> {
    while (this.#tampon.length < n) await this.#doldur();
    const b = this.#tampon.slice(0, n);
    this.#tampon = this.#tampon.slice(n);
    return b;
  }

  /** Tek yanit: {n} literalleri birlestirilerek (literal yerine NUL karakteri konur). */
  async #yanitOku(): Promise<Yanit> {
    let satir = await this.#satirOku();
    const literaller: Uint8Array[] = [];
    for (;;) {
      const m = satir.match(/\{(\d+)\}$/);
      if (!m) break;
      literaller.push(await this.#baytOku(Number(m[1])));
      satir = satir.slice(0, -m[0].length) + "\x00" + (await this.#satirOku());
    }
    return { satir, literaller };
  }

  async karsilama(): Promise<void> {
    const y = await this.#yanitOku();
    if (!/^\* (OK|PREAUTH)/i.test(y.satir)) throw new Error("IMAP karsilama beklenmedik");
  }

  async komut(metin: string): Promise<Yanit[]> {
    const etiket = `A${++this.#sayac}`;
    await this.#conn.write(enc.encode(`${etiket} ${metin}\r\n`));
    const toplu: Yanit[] = [];
    for (;;) {
      const y = await this.#yanitOku();
      if (y.satir.startsWith(`${etiket} `)) {
        const durum = y.satir.slice(etiket.length + 1);
        if (!/^OK/i.test(durum)) {
          // Komutun kendisi (sifre olabilir) hata metnine YAZILMAZ.
          throw new Error(`IMAP ${metin.split(" ")[0]} reddedildi: ${durum.slice(0, 120)}`);
        }
        return toplu;
      }
      toplu.push(y);
    }
  }

  kapat(): void {
    try {
      this.#conn.close();
    } catch {
      /* zaten kapali */
    }
  }
}






/** FETCH yanitlarindan UID + baslik literali. */
export function fetchCoz(yanitlar: { satir: string; literaller: Uint8Array[] }[]): ImapBaslik[] {
  const utf8 = new TextDecoder("utf-8");
  const cikti: ImapBaslik[] = [];
  for (const y of yanitlar) {
    if (!/^\* \d+ FETCH /i.test(y.satir)) continue;
    const uid = Number(y.satir.match(/UID (\d+)/i)?.[1] ?? NaN);
    const ham = y.literaller.length ? utf8.decode(y.literaller[0]) : "";
    const b = basliklariAyir(ham);
    const kim = adresAyir(b["from"] ?? "");
    const t = b["date"] ? new Date(b["date"]) : null;
    cikti.push({
      uid,
      gonderen: kim.eposta,
      gonderenAd: kim.ad,
      konu: baslikCoz(b["subject"] ?? "").slice(0, 300),
      tarih: t && !isNaN(t.getTime()) ? t.toISOString() : null,
      mesajId: b["message-id"] ?? null,
    });
  }
  return cikti.sort((x, y) => x.uid - y.uid);
}

/**
 * Gelen Kutusu'nda verilen gunden beri, gondereni `alanAdi` iceren maillerin basliklari.
 * Salt okunur (EXAMINE + BODY.PEEK). En fazla `enFazla` mail (en yeniler).
 */
export async function alandanGelenBasliklar(
  ayar: ImapAyar,
  alanAdi: string,
  gun: string,
  enFazla = 100,
): Promise<ImapBaslik[]> {
  if (!/^[a-z0-9.-]+$/i.test(alanAdi)) throw new Error("Gecersiz alan adi");
  const port = ayar.port ?? 993;
  const conn = ayar.tls === false
    ? await Deno.connect({ hostname: ayar.sunucu, port })
    : await Deno.connectTls({ hostname: ayar.sunucu, port });
  const imap = new SaltOkunurImap(conn);
  const zamanlayici = setTimeout(() => imap.kapat(), ayar.sureMs ?? 25000);
  try {
    await imap.karsilama();
    await imap.komut(`LOGIN ${tirnakla(ayar.kullanici)} ${tirnakla(ayar.sifre)}`);
    await imap.komut("EXAMINE INBOX");
    const arama = await imap.komut(`UID SEARCH SINCE ${imapTarihi(gun)} FROM ${tirnakla(alanAdi)}`);
    const uidler = arama
      .filter((y) => /^\* SEARCH/i.test(y.satir))
      .flatMap((y) => y.satir.replace(/^\* SEARCH/i, "").trim().split(/\s+/))
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b)
      .slice(-enFazla);
    if (!uidler.length) {
      await imap.komut("LOGOUT").catch(() => {});
      return [];
    }
    const fetch = await imap.komut(
      `UID FETCH ${uidler.join(",")} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])`,
    );
    await imap.komut("LOGOUT").catch(() => {});
    return fetchCoz(fetch);
  } finally {
    clearTimeout(zamanlayici);
    imap.kapat();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// OTURUM (operasyon-imap "tara"): birden cok komut tek baglantida. Yine SALT OKUNUR (EXAMINE + BODY.PEEK).
// ---------------------------------------------------------------------------------------------------------------

export type HamMail = { uid: number; baslik: string; govde: string }; // baslik/govde: bayt bayt latin1 dize

export type ImapOturum = {
  /** Gelen Kutusu'nu salt okunur acar; UIDVALIDITY doner. */
  kutuAc(): Promise<number>;
  /** UID SEARCH (kriter IMAP sozdizimi; cagiran dogrular). Artan sirali UID listesi. */
  uidAra(kriter: string): Promise<number[]>;
  /** Baslik + govdenin ilk `govdeSiniri` bayti. */
  getir(uidler: number[], govdeSiniri: number): Promise<HamMail[]>;
  kapat(): Promise<void>;
};


export async function imapOturumu(ayar: ImapAyar): Promise<ImapOturum> {
  const port = ayar.port ?? 993;
  const conn = ayar.tls === false
    ? await Deno.connect({ hostname: ayar.sunucu, port })
    : await Deno.connectTls({ hostname: ayar.sunucu, port });
  const imap = new SaltOkunurImap(conn);
  const zamanlayici = setTimeout(() => imap.kapat(), ayar.sureMs ?? 50000);
  try {
    await imap.karsilama();
    await imap.komut(`LOGIN ${tirnakla(ayar.kullanici)} ${tirnakla(ayar.sifre)}`);
  } catch (e) {
    clearTimeout(zamanlayici);
    imap.kapat();
    throw e;
  }
  return {
    async kutuAc() {
      const y = await imap.komut("EXAMINE INBOX");
      const v = y.map((x) => x.satir.match(/\[UIDVALIDITY (\d+)\]/i)?.[1]).find(Boolean);
      return Number(v ?? 0);
    },
    async uidAra(kriter: string) {
      const y = await imap.komut(`UID SEARCH ${kriter}`);
      return y
        .filter((x) => /^\* SEARCH/i.test(x.satir))
        .flatMap((x) => x.satir.replace(/^\* SEARCH/i, "").trim().split(/\s+/))
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);
    },
    async getir(uidler: number[], govdeSiniri: number) {
      if (!uidler.length) return [];
      const n = Math.max(1000, Math.min(400000, Math.floor(govdeSiniri)));
      const y = await imap.komut(`UID FETCH ${uidler.join(",")} (UID BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.${n}>)`);
      return y.filter((x) => /^\* \d+ FETCH /i.test(x.satir)).map(fetchParcalari).sort((a, b) => a.uid - b.uid);
    },
    async kapat() {
      try {
        await imap.komut("LOGOUT");
      } catch {
        /* yok say */
      }
      clearTimeout(zamanlayici);
      imap.kapat();
    },
  };
}

