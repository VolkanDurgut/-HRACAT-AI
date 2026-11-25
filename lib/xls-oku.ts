/**
 * Eski Excel (.xls, BIFF8 / OLE2) okuyucu (25.11.2026). Dis paket YOK (SheetJS eklenmedi). Liman portalinin
 * "ExportToExcel" ciktisi icin yazildi; tarayicida ve Node'da calisir (DataView). Okunanlar: SST / LABELSST, LABEL,
 * NUMBER, RK, MULRK, FORMULA (sayi / metin sonucu), BOOLERR. Bicimler (tarih) uygulanmaz: tarih Excel seri sayisi doner.
 * Sifreli / bozuk dosyada anlasilir hata firlatir.
 */
export type XlsHucre = string | number | boolean | null;
export type XlsSayfa = { ad: string; satirlar: XlsHucre[][] };

const SON = -2; // ENDOFCHAIN
const OLE_IMZA = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function cfbAkisi(buf: Uint8Array, ad: string[]): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < 8; i++) if (buf[i] !== OLE_IMZA[i]) throw new Error("Dosya eski Excel (.xls) biçiminde değil.");
  const sektor = 1 << dv.getUint16(0x1e, true);
  const mini = 1 << dv.getUint16(0x20, true);
  const fatSayisi = dv.getUint32(0x2c, true);
  const ilkDizin = dv.getInt32(0x30, true);
  const miniSinir = dv.getUint32(0x38, true);
  const ilkMiniFat = dv.getInt32(0x3c, true);
  let difatSektor = dv.getInt32(0x44, true);
  const ofset = (s: number) => (s + 1) * sektor;
  const sektorOku = (s: number) => buf.subarray(ofset(s), ofset(s) + sektor);

  // FAT sektor listesi (DIFAT)
  const fatSektorleri: number[] = [];
  for (let i = 0; i < 109 && fatSektorleri.length < fatSayisi; i++) {
    const s = dv.getInt32(0x4c + i * 4, true);
    if (s >= 0) fatSektorleri.push(s);
  }
  let koruma = 0;
  while (difatSektor >= 0 && fatSektorleri.length < fatSayisi && koruma++ < 10000) {
    const o = ofset(difatSektor);
    for (let i = 0; i < sektor / 4 - 1 && fatSektorleri.length < fatSayisi; i++) {
      const s = dv.getInt32(o + i * 4, true);
      if (s >= 0) fatSektorleri.push(s);
    }
    difatSektor = dv.getInt32(o + sektor - 4, true);
  }
  const fat: number[] = [];
  for (const fs of fatSektorleri) {
    const o = ofset(fs);
    for (let i = 0; i < sektor / 4; i++) fat.push(dv.getInt32(o + i * 4, true));
  }
  const zincir = (bas: number, tablo: number[]) => {
    const z: number[] = [];
    let s = bas, k = 0;
    while (s >= 0 && s !== SON && k++ < 1_000_000) { z.push(s); s = tablo[s] ?? SON; }
    return z;
  };
  const birlestir = (parcalar: Uint8Array[], boyut: number) => {
    const c = new Uint8Array(boyut);
    let p = 0;
    for (const x of parcalar) { const n = Math.min(x.length, boyut - p); if (n <= 0) break; c.set(x.subarray(0, n), p); p += n; }
    return c;
  };

  // Dizin
  const dizinSek = zincir(ilkDizin, fat);
  const dizin = birlestir(dizinSek.map(sektorOku), dizinSek.length * sektor);
  const ddv = new DataView(dizin.buffer);
  type Giris = { ad: string; tur: number; bas: number; boyut: number };
  const girisler: Giris[] = [];
  for (let o = 0; o + 128 <= dizin.length; o += 128) {
    const uz = ddv.getUint16(o + 0x40, true);
    let s = "";
    for (let i = 0; i + 2 < uz; i += 2) s += String.fromCharCode(ddv.getUint16(o + i, true));
    girisler.push({ ad: s, tur: dizin[o + 0x42], bas: ddv.getInt32(o + 0x74, true), boyut: ddv.getUint32(o + 0x78, true) });
  }
  const kok = girisler.find((g) => g.tur === 5);
  const hedef = girisler.find((g) => g.tur === 2 && ad.includes(g.ad));
  if (!hedef) {
    if (girisler.some((g) => /EncryptedPackage|EncryptionInfo/i.test(g.ad))) throw new Error("Excel dosyası şifreli; şifresiz kaydedip yükleyin.");
    throw new Error("Excel dosyasında çalışma kitabı bulunamadı.");
  }
  if (hedef.boyut >= miniSinir || !kok) {
    const z = zincir(hedef.bas, fat);
    return birlestir(z.map(sektorOku), hedef.boyut);
  }
  // Kucuk akis: mini akistan
  const miniFatSek = zincir(ilkMiniFat, fat);
  const miniFatHam = birlestir(miniFatSek.map(sektorOku), miniFatSek.length * sektor);
  const mdv = new DataView(miniFatHam.buffer);
  const miniFat: number[] = [];
  for (let i = 0; i < miniFatHam.length / 4; i++) miniFat.push(mdv.getInt32(i * 4, true));
  const kokZ = zincir(kok.bas, fat);
  const miniAkis = birlestir(kokZ.map(sektorOku), kokZ.length * sektor);
  const z = zincir(hedef.bas, miniFat);
  return birlestir(z.map((s) => miniAkis.subarray(s * mini, s * mini + mini)), hedef.boyut);
}

function rkDeger(rk: number): number {
  let v: number;
  if (rk & 2) v = rk >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, rk & 0xfffffffc, true);
    b.setUint32(0, 0, true);
    v = b.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
}

/** BIFF8 parcali (CONTINUE) metin okuyucu */
class ParcaOkuyucu {
  private i = 0;
  private p = 0;
  constructor(private parcalar: Uint8Array[]) {}
  private get parca() { return this.parcalar[this.i]; }
  private ilerle() { if (this.p >= (this.parca?.length ?? 0)) { this.i++; this.p = 0; } }
  bayt(): number { this.ilerle(); return this.parca[this.p++]; }
  u16(): number { const a = this.bayt(); return a | (this.bayt() << 8); }
  u32(): number { return (this.u16() | (this.u16() << 16)) >>> 0; }
  atla(n: number) { for (let k = 0; k < n; k++) this.bayt(); }
  metin(): string {
    const uz = this.u16();
    let bayrak = this.bayt();
    let genis = (bayrak & 1) === 1;
    const zengin = bayrak & 8 ? this.u16() : 0;
    const ek = bayrak & 4 ? this.u32() : 0;
    let s = "";
    for (let k = 0; k < uz; k++) {
      if (this.p >= (this.parca?.length ?? 0)) {
        // Karakterler CONTINUE'ya tasti: yeni parca bir bayrak bayti ile baslar
        this.i++; this.p = 0;
        bayrak = this.parca[this.p++];
        genis = (bayrak & 1) === 1;
      }
      s += String.fromCharCode(genis ? this.u16() : this.bayt());
    }
    this.atla(zengin * 4 + ek);
    return s;
  }
}

function metinTek(d: Uint8Array, o: number): string {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const uz = dv.getUint16(o, true);
  const bayrak = d[o + 2];
  let p = o + 3;
  if (bayrak & 8) p += 2;
  if (bayrak & 4) p += 4;
  let s = "";
  for (let k = 0; k < uz; k++) {
    if (bayrak & 1) { s += String.fromCharCode(dv.getUint16(p, true)); p += 2; } else { s += String.fromCharCode(d[p]); p += 1; }
  }
  return s;
}

export function xlsOku(veri: ArrayBuffer | Uint8Array): XlsSayfa[] {
  const buf = veri instanceof Uint8Array ? veri : new Uint8Array(veri);
  const wb = cfbAkisi(buf, ["Workbook", "Book"]);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  type Kayit = { tur: number; veri: Uint8Array; ofset: number };
  const kayitlar: Kayit[] = [];
  for (let o = 0; o + 4 <= wb.length;) {
    const tur = dv.getUint16(o, true), uz = dv.getUint16(o + 2, true);
    kayitlar.push({ tur, veri: wb.subarray(o + 4, o + 4 + uz), ofset: o });
    o += 4 + uz;
  }
  if (kayitlar.some((k) => k.tur === 0x002f)) throw new Error("Excel dosyası şifreli; şifresiz kaydedip yükleyin.");
  const bof = kayitlar[0];
  if (!bof || bof.tur !== 0x0809 || new DataView(bof.veri.buffer, bof.veri.byteOffset).getUint16(0, true) !== 0x0600) {
    throw new Error("Desteklenmeyen Excel sürümü (yalnız Excel 97-2003 .xls).");
  }

  // Paylasilan metinler + sayfa adlari
  const sst: string[] = [];
  const sayfaAdlari: { ofset: number; ad: string }[] = [];
  for (let i = 0; i < kayitlar.length; i++) {
    const k = kayitlar[i];
    if (k.tur === 0x00fc) {
      const parcalar = [k.veri.subarray(8)];
      for (let j = i + 1; j < kayitlar.length && kayitlar[j].tur === 0x003c; j++) parcalar.push(kayitlar[j].veri);
      const adet = new DataView(k.veri.buffer, k.veri.byteOffset).getUint32(4, true);
      const r = new ParcaOkuyucu(parcalar);
      for (let n = 0; n < adet; n++) { try { sst.push(r.metin()); } catch { break; } }
    } else if (k.tur === 0x0085) {
      const kd = new DataView(k.veri.buffer, k.veri.byteOffset, k.veri.byteLength);
      const uz = k.veri[6], bayrak = k.veri[7];
      let s = "";
      for (let c = 0; c < uz; c++) s += String.fromCharCode(bayrak & 1 ? kd.getUint16(8 + c * 2, true) : k.veri[8 + c]);
      sayfaAdlari.push({ ofset: kd.getUint32(0, true), ad: s });
    }
  }

  const sayfalar: XlsSayfa[] = [];
  for (const sa of sayfaAdlari) {
    const bas = kayitlar.findIndex((k) => k.ofset === sa.ofset);
    if (bas < 0) continue;
    const satirlar: XlsHucre[][] = [];
    const koy = (r: number, c: number, v: XlsHucre) => { (satirlar[r] ||= [])[c] = v; };
    for (let i = bas + 1; i < kayitlar.length && kayitlar[i].tur !== 0x000a; i++) {
      const k = kayitlar[i];
      const d = k.veri;
      const kd = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (d.length < 6 && k.tur !== 0x000a) continue;
      const r = kd.getUint16(0, true), c = kd.getUint16(2, true);
      switch (k.tur) {
        case 0x00fd: koy(r, c, sst[kd.getUint32(6, true)] ?? ""); break;
        case 0x0203: koy(r, c, kd.getFloat64(6, true)); break;
        case 0x027e: koy(r, c, rkDeger(kd.getUint32(6, true))); break;
        case 0x00bd: {
          const son = kd.getUint16(d.length - 2, true);
          for (let cc = c, o = 4; cc <= son; cc++, o += 6) koy(r, cc, rkDeger(kd.getUint32(o + 2, true)));
          break;
        }
        case 0x0204: koy(r, c, metinTek(d, 6)); break;
        case 0x0205: if (d[7] === 0) koy(r, c, d[6] === 1); break;
        case 0x0006: {
          if (kd.getUint16(12, true) === 0xffff) {
            const t = d[6];
            if (t === 0) { const s = kayitlar[i + 1]; if (s && s.tur === 0x0207) koy(r, c, metinTek(s.veri, 0)); }
            else if (t === 1) koy(r, c, d[8] === 1);
          } else koy(r, c, kd.getFloat64(6, true));
          break;
        }
      }
    }
    const genislik = satirlar.reduce((m, s) => Math.max(m, s ? s.length : 0), 0);
    sayfalar.push({ ad: sa.ad, satirlar: Array.from({ length: satirlar.length }, (_, i) => Array.from({ length: genislik }, (_, j) => satirlar[i]?.[j] ?? null)) });
  }
  return sayfalar;
}
