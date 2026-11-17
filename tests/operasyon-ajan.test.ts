/**
 * Operasyon Ajani Faz 1 (17.11.2026): kural motoru (_shared/operasyon-ajan.ts), MIME okuyucu (_shared/mime-oku.ts)
 * ve salt okunur IMAP yardimcilari (_shared/imap-oku.ts). Veriler kurgusaldir (ornek-acente.test, BK001, ORNEKPORT).
 * Gercek pilot sinavi (182 mail) depo disinda calistirildi: yanlis baglama 0, alan 80/80.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isle, yeniDurum, tarihOku, iso6346Gecerli, type AjanAyar, type Mail } from "../supabase/functions/_shared/operasyon-ajan.ts";
import { mimeMetni, htmldenMetin } from "../supabase/functions/_shared/mime-oku.ts";
import { alanKriteri, fetchParcalari, imapTarihi, baslikCoz, tirnakla } from "../supabase/functions/_shared/imap-yardimci.ts";

const AYAR: AjanAyar = { acenteAlanlari: ["ornek-acente.test"], bookingDeseni: "BK\\d{3}" };
const mail = (p: Partial<Mail>): Mail => ({
  id: "m", tarih: "2026-11-01", gonderen: "operation@unex.com.tr", konu: "", govde: "", acenteKatilimi: true, ...p,
});

test("konudaki tek booking kesin baglanir; metinde baska booking varsa baglanmaz, oneriye duser", () => {
  const d = yeniDurum();
  const a = isle(mail({ konu: "RE: BOOKING CONFIRMATION BK001 // UNEX", govde: "Merhabalar, Vgm sonuçları ektedir." }), d, AYAR);
  assert.equal(a.booking, "BK001");
  assert.equal(a.guven, "kesin");
  assert.equal(a.olay, "vgm_gonderimi");
  const b = isle(mail({ gonderen: "bbt@unex.com.tr", konu: "Re: BOOKING CONFIRMATION BK001", govde: "Ekte BK002 nolu BL için yapılan ödeme dekontu sunulmaktadır" }), d, AYAR);
  assert.equal(b.booking, null);
  assert.equal(b.oneri, "BK002");
  assert.equal(b.guven, "zayif");
});

test("acente yoksa ve booking yoksa kapsam disi; baska acentenin maili baglanmaz", () => {
  const r = isle(mail({ gonderen: "x@baska-acente.test", konu: "UNEX // 123456 // FINANS ONAY", govde: "Finansal onay verilmiştir.", acenteKatilimi: false }), yeniDurum(), AYAR);
  assert.equal(r.kapsamda, false);
  assert.equal(r.booking, null);
});

test("coklu etiket: draft onayi + VGM ayni mailde; kural sirasi: liman sorunu dolu giristen once", () => {
  const r = isle(mail({ konu: "RE: BOOKING CONFIRMATION BK003", govde: "Merhabalar, Draft onaylıdır. Vgm sonuçlarını ekte bulabilirsiniz." }), yeniDurum(), AYAR);
  assert.deepEqual(r.olaylar, ["draft_onayi", "vgm_gonderimi"]);
  const s = isle(mail({ konu: "RE: BOOKING CONFIRMATION BK003", govde: "Marport sisteminde aşağıdaki konteynerlerin aktif booking kaydı bulunmuyor. Dolu giriş talebi konusunda ivedi desteğiniz ricadır." }), yeniDurum(), AYAR);
  assert.deepEqual(s.olaylar, ["liman_giris_sorunu", "dolu_giris_talebi"]);
});

test("booking onayi alanlari: alinti disi tablo, hatali tarih yazilmaz, yukleme limani ETA'si varis ETA'si sayilmaz", () => {
  const govde = [
    "Merhaba;", "", "Konu rezervasyonunuz 3*20DV olarak güncellenmiştir.", "",
    "M/V ORNEK GEMI", "ORN0126E", "Marport Ardiyesiz Giriş", "03.11.2026",
    "Konşimento Talimatı Cut Off", "04.11.2026 12.00", "Marport Cut Off", "05.11.20226 14.00",
    "Marport ETA", "06.11.2026", "Marport ETS", "07.11.2026", "ORNEKPORT ETA", "18.11.2026", "",
    "From: Operation <operation@unex.com.tr>", "Konu yükümüzün 9*20 dc olarak revize edilmesini rica edeceğim.",
  ].join("\n");
  const r = isle(mail({ gonderen: "satis@ornek-acente.test", konu: "RE: BOOKING CONFIRMATION (BK004) // UNEX // 5*20 DC // AMBARLI-ORNEKPORT // ORN0126E", govde }), yeniDurum(), AYAR);
  assert.equal(r.olay, "booking_guncelleme");
  assert.equal(r.alanlar.adet, "3");
  assert.equal(r.alanlar.tip, "20DC");
  assert.equal(r.alanlar.gemi, "ORNEK GEMI");
  assert.equal(r.alanlar.sefer, "ORN0126E");
  assert.equal(r.alanlar.ardiyesiz, "2026-11-03");
  assert.equal(r.alanlar.si_cutoff, "2026-11-04 12:00");
  assert.equal(r.alanlar.beyan_cutoff, undefined);
  assert.equal(r.alanlar.etd, "2026-11-07");
  assert.equal(r.alanlar.eta, "2026-11-18");
  assert.ok(r.kanit.etd && govde.includes(r.kanit.etd));
});

test("konteyner (ISO 6346 kontrol hanesi) + muhur; konteyner hafizasi guclu eslesme", () => {
  const d = yeniDurum();
  const a = isle(mail({ konu: "RE: BOOKING CONFIRMATION BK005", govde: "Aşağıdaki konteyner için dolu giriş talebi rica ederim. CSQU3054383 - 123456" }), d, AYAR);
  assert.equal(a.alanlar.konteyner, "CSQU3054383");
  assert.equal(a.alanlar.muhur, "123456");
  const b = isle(mail({ konu: "UNEX // KONTEYNER", govde: "CSQU3054383 için liman girişi tamam mı?" }), d, AYAR);
  assert.equal(b.booking, "BK005");
  assert.equal(b.guven, "guclu");
  assert.equal(iso6346Gecerli("CSQU3054384"), false);
  assert.equal(tarihOku("31.02.2026"), null);
});

test("MIME: multipart/alternative base64 utf-8 duz metin; yalniz html varsa etiketsiz metin; kirpik base64", () => {
  const govdeB64 = btoa(Array.from(new TextEncoder().encode("Merhaba, Vgm sonuçları ektedir."), (b) => String.fromCharCode(b)).join(""));
  const baslik = 'Content-Type: multipart/mixed; boundary="S1"\r\n';
  const govde = [
    "--S1", 'Content-Type: multipart/alternative; boundary="S2"', "", "--S2",
    "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", govdeB64, "--S2",
    "Content-Type: text/html; charset=utf-8", "", "<p>yok say</p>", "--S2--",
    "--S1", "Content-Type: application/pdf", "Content-Disposition: attachment", "Content-Transfer-Encoding: base64", "", "JVBERi0xLjQK", "--S1--",
  ].join("\r\n");
  assert.equal(mimeMetni(baslik, govde), "Merhaba, Vgm sonuçları ektedir.");
  const h = mimeMetni("Content-Type: text/html; charset=windows-1254\r\nContent-Transfer-Encoding: quoted-printable\r\n", "<div>Konteyner=20limanda</div><br><b>=FEu</b>&nbsp;&amp;");
  assert.equal(h, "Konteyner limanda\n\nşu &");
  assert.equal(htmldenMetin("<style>x{}</style>a<br/>b"), "a\nb");
  assert.ok(mimeMetni("Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n", btoa("Merhaba dunya") + "QW") .startsWith("Merhaba dunya"));
});

test("IMAP yardimcilari: alan kriteri OR zinciri, FETCH literal eslestirme, tarih, tirnak", () => {
  assert.equal(alanKriteri(["ornek-acente.test"]), 'OR OR FROM "ornek-acente.test" TO "ornek-acente.test" CC "ornek-acente.test"');
  assert.throws(() => alanKriteri(['x" OR ALL']));
  const enc = new TextEncoder();
  const p = fetchParcalari({ satir: "* 3 FETCH (UID 42 BODY[HEADER] \x00 BODY[TEXT]<0> \x00)", literaller: [enc.encode("Subject: A\r\n"), enc.encode("govde")] });
  assert.deepEqual(p, { uid: 42, baslik: "Subject: A\r\n", govde: "govde" });
  assert.equal(imapTarihi("2026-10-28"), "28-Oct-2026");
  assert.equal(baslikCoz("=?utf-8?B?w5ZybmVr?= konu"), "Örnek konu");
  assert.equal(tirnakla('a"b\\c'), '"a\\"b\\\\c"');
  assert.throws(() => tirnakla("ş"));
});
