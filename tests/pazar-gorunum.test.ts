/**
 * PAZAR sayfa duzeni (16.11.2026) - lib/pazar/gorunum.ts + lib/pazar/musteri.ts dosyaHacmi. Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hacimMetni, pazarSekmesi, potansiyelFiltrele, ulkeTablosu } from "@/lib/pazar/gorunum";
import { dosyaHacmi } from "@/lib/pazar/musteri";
import type { PazarFirma, PazarKisi } from "@/lib/pazar/veri";
import type { UlkeSatiri } from "@/lib/pazar/panel";

const firma = (id: string, ad: string, ek: Partial<PazarFirma> = {}): PazarFirma => ({
  id, ad, anahtar: id.toUpperCase(), ulke: "GANA", ulke_kaynagi: "excel", durum: "potansiyel", kaynak: "fuar", kaynak_etiket: null,
  alici_adi: null, musteri_olma_tarihi: null, created_at: "2026-11-01T08:00:00Z", ek_anahtarlar: [], notlar: null, crm_asama: "yeni",
  sonraki_adim: null, bekleme_bitis: null, son_temas: null, ...ek,
});
const kisi = (firma_id: string, ad: string, eposta: string, tel: string[] = []): PazarKisi =>
  ({ id: `k-${firma_id}`, firma_id, ad, eposta, eposta_gecerli: true, telefonlar: tel, whatsapp: null });

test("sekme adresi: eski 'takip' operasyona, bilinmeyen null", () => {
  assert.equal(pazarSekmesi("takip"), "operasyon");
  assert.equal(pazarSekmesi("ulkeler"), "ulkeler");
  assert.equal(pazarSekmesi("musteriler"), "musteriler");
  assert.equal(pazarSekmesi("yok"), null);
  assert.equal(pazarSekmesi(null), null);
});

const firmalar = [
  firma("a", "Örnek Işık Gıda", { ulke: "GANA" }),
  firma("b", "Beta Trading", { ulke: null, kaynak: "liste", kaynak_etiket: "Ornek listesi" }),
  firma("c", "Ceta Foods", { ulke: "KENYA", crm_asama: "sorgulandi" }),
];
const kisiler = new Map<string, PazarKisi[]>([["c", [kisi("c", "Ali Veli", "ali@ornek.example", ["905551234567"])]]]);
const bos = { ulke: "", kaynak: "", arama: "", asama: null };

test("potansiyel filtresi: eski kurallar + asama", () => {
  assert.deepEqual(potansiyelFiltrele(firmalar, bos, kisiler).map((f) => f.id), ["b", "c", "a"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, ulke: "-" }, kisiler).map((f) => f.id), ["b"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, kaynak: "fuar" }, kisiler).map((f) => f.id), ["c", "a"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, kaynak: "Ornek listesi" }, kisiler).map((f) => f.id), ["b"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, arama: "IŞIK" }, kisiler).map((f) => f.id), ["a"], "buyuk harf + ı/i duyarsiz");
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, arama: "ali@ornek" }, kisiler).map((f) => f.id), ["c"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, arama: "1234" }, kisiler).map((f) => f.id), ["c"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, arama: "123" }, kisiler).map((f) => f.id), [], "4 rakamdan kisa telefon aranmaz");
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, asama: new Set(["c", "a"]) }, kisiler).map((f) => f.id), ["c", "a"]);
  assert.deepEqual(potansiyelFiltrele(firmalar, { ...bos, asama: new Set(["c"]), ulke: "GANA" }, kisiler).map((f) => f.id), []);
});

const ulke = (u: string, ek: Partial<UlkeSatiri> = {}): UlkeSatiri => ({ ulke: u, musteri: 0, potansiyel: 0, epostali: 0, ulasilan: 0, cevap: 0, sonTemas: null, ...ek });
const gosterim = (u: string) => u.charAt(0) + u.slice(1).toLocaleLowerCase("tr-TR");

test("ulke tablosu: arama + siralama, bilinmeyen her zaman en altta", () => {
  const u = [ulke("GANA", { potansiyel: 10, sonTemas: "2026-11-10" }), ulke("—", { potansiyel: 50 }), ulke("KENYA", { potansiyel: 3, musteri: 1, sonTemas: "2026-11-15" }), ulke("İRAN", { potansiyel: 7 })];
  assert.deepEqual(ulkeTablosu(u, "", "potansiyel", false, gosterim).map((x) => x.ulke), ["GANA", "İRAN", "KENYA", "—"]);
  assert.deepEqual(ulkeTablosu(u, "", "potansiyel", true, gosterim).map((x) => x.ulke), ["KENYA", "İRAN", "GANA", "—"]);
  assert.deepEqual(ulkeTablosu(u, "", "sonTemas", false, gosterim).map((x) => x.ulke), ["KENYA", "GANA", "İRAN", "—"]);
  assert.deepEqual(ulkeTablosu(u, "ken", null, false, gosterim).map((x) => x.ulke), ["KENYA"]);
  assert.deepEqual(ulkeTablosu(u, "iran", null, false, gosterim).map((x) => x.ulke), ["İRAN"], "Türkçe harf duyarsız");
  assert.equal(ulkeTablosu(u, "", null, false, gosterim).length, 4, "siralama yoksa gelen sira korunur");
});

test("musteri hacmi para birimine gore; bos / sifir sayilmaz", () => {
  const h = dosyaHacmi([{ toplam_tutar: 1000, para_birimi: "USD" }, { toplam_tutar: "250.50", para_birimi: "usd" }, { toplam_tutar: 500, para_birimi: "EUR" }, { toplam_tutar: null }, { toplam_tutar: 0, para_birimi: "USD" }]);
  assert.deepEqual(h, [{ para: "USD", tutar: 1250.5 }, { para: "EUR", tutar: 500 }]);
  assert.equal(hacimMetni([]), "—");
  assert.ok(hacimMetni(h).includes(" + "));
});
