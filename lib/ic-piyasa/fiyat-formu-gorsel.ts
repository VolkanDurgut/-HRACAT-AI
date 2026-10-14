import { INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64, INTER_BOLD_BASE64 } from "@/lib/fonts/inter-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import {
  FORM_SIRKET,
  GECERLILIK_GUN,
  IcFiyatFormu,
  fiyatYazi,
  formDosyaAdi,
  gunYazi,
  hitapYazi,
  kalemFiyatlari,
  kdvYazi,
  onayZamaniYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";
import { formOzelGunleri, ozelGunTarihYazi, trGunu } from "@/lib/ic-piyasa/ozel-gunler";

/**
 * Telefon gorseli (1080 x 1350, WhatsApp onizlemesinde acmadan okunur).
 * PDF ile AYNI form kaydindan ve AYNI tasarim dilinden (lacivert bant + logo
 * karosu + seftali serit + Inter) cizilir; tarayicida canvas, ek kutuphane yok.
 * Revize 11.10.2026: KDV dahil/haric her urunde; Inter yazi tipi.
 * Revize 12.10.2026: ozel gun bandi (PDF ile ayni kural, ozel-gunler.ts) ve
 * alt kutuda siparis sureci cumlesi.
 * Revize 14.10.2026: her urunde PESIN ve VADELI fiyat yan yana (ustlerinde
 * kucuk etiket, vadeli etiketinde vade); odeme bilgisi kaldirildi.
 */

const G = 1080;
const Y = 1350;
const LACIVERT = "#283474";
const LACIVERT_KOYU = "#1B2352";
const SEFTALI = "#F4A07C";
const SEFTALI_ZEMIN = "#FDF2EC";
const MUREKKEP = "#1D2333";
const SOLUK = "#767E8F";
const CIZGI = "#E2E5ED";
const BANT_ACIK = "#C4CBE6";
const AILE = "UnexInter";
const SEFTALI_YAZI = "#BE623A"; // beyaz zeminde okunur seftali (etiketler)
const FIYAT_SUTUN_G = 210; // pesin / vadeli fiyat sutun genisligi (px)

let fontlar: Promise<void> | null = null;
function fontlariYukle(): Promise<void> {
  if (!fontlar) {
    const yukle = (b64: string, agirlik: string) =>
      new FontFace(AILE, `url(data:font/ttf;base64,${b64})`, { weight: agirlik }).load().then((f) => {
        (document.fonts as unknown as { add: (f: FontFace) => void }).add(f);
      });
    fontlar = Promise.all([yukle(INTER_REGULAR_BASE64, "400"), yukle(INTER_SEMIBOLD_BASE64, "600"), yukle(INTER_BOLD_BASE64, "700")]).then(() => undefined);
  }
  return fontlar;
}

function resimYukle(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, hata) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = hata;
    img.src = src;
  });
}

function sigdir(ctx: CanvasRenderingContext2D, metin: string, genislik: number): string {
  if (ctx.measureText(metin).width <= genislik) return metin;
  let m = metin;
  while (m.length > 1 && ctx.measureText(m + "…").width > genislik) m = m.slice(0, -1);
  return m + "…";
}

function yuvarlak(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function fiyatFormuGorselOlustur(form: IcFiyatFormu): Promise<Blob> {
  await fontlariYukle();
  const logo = await resimYukle(`data:image/png;base64,${UNEX_LOGO_BASE64}`);
  const canvas = document.createElement("canvas");
  canvas.width = G;
  canvas.height = Y;
  const ctx = canvas.getContext("2d")!;
  const f = (boy: number, agirlik: 400 | 600 | 700 = 400) => `${agirlik} ${boy}px "${AILE}", sans-serif`;
  const sol = 64;
  const sag = G - 64;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, G, Y);

  // Ust bant + dekor halkalari + seftali serit
  ctx.fillStyle = LACIVERT;
  ctx.fillRect(0, 0, G, 300);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(G - 40, 20, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = SEFTALI;
  ctx.fillRect(0, 300, G, 12);

  ctx.fillStyle = "#ffffff";
  yuvarlak(ctx, sol, 64, 150, 150, 26);
  ctx.fill();
  ctx.drawImage(logo, sol + 13, 77, 124, 124);

  const tx = sol + 186;
  ctx.fillStyle = SEFTALI;
  ctx.font = f(24, 600);
  ctx.fillText("U N E X   G I D A", tx, 104);
  ctx.fillStyle = "#ffffff";
  ctx.font = f(56, 700);
  ctx.fillText("Fiyat Bilgilendirme", tx, 168);
  ctx.fillText("Formu", tx, 230);
  ctx.fillStyle = BANT_ACIK;
  ctx.font = f(26, 400);
  ctx.fillText("Yan Mamul Ürünler", tx, 272);

  // Form no + gecerlilik seridi
  ctx.fillStyle = SOLUK;
  ctx.font = f(22, 600);
  ctx.fillText("FORM NO", sol, 370);
  ctx.textAlign = "right";
  ctx.fillText("SON GEÇERLİLİK TARİHİ", sag, 370);
  ctx.fillStyle = LACIVERT;
  ctx.font = f(34, 700);
  ctx.fillText(gunYazi(form.gecerlilik_bitis), sag, 412);
  ctx.textAlign = "left";
  ctx.fillText(form.form_no, sol, 412);
  ctx.fillStyle = MUREKKEP;
  ctx.font = f(26, 600);
  ctx.fillText(sigdir(ctx, hitapYazi(form.alici), sag - sol), sol, 470);

  // Ozel gun bandi (formun haftasina denk gelen bayram / kandil / yilbasi)
  const gunler = formOzelGunleri(trGunu(form.onay_zamani));
  let ustY = 500;
  if (gunler.length) {
    const bantH = 22 + gunler.length * 40;
    ctx.fillStyle = SEFTALI_ZEMIN;
    yuvarlak(ctx, sol, 494, sag - sol, bantH, 16);
    ctx.fill();
    ctx.fillStyle = LACIVERT;
    ctx.beginPath();
    ctx.arc(sol + 40, 494 + bantH / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SEFTALI;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sol + 40, 494 + bantH / 2, 11, 0, Math.PI * 2);
    ctx.stroke();
    gunler.forEach((g, i) => {
      const gy = 494 + 39 + i * 40;
      ctx.textAlign = "right";
      ctx.fillStyle = "#BE623A";
      ctx.font = f(20, 600);
      ctx.fillText(ozelGunTarihYazi(g), sag - 22, gy);
      const tarihG = ctx.measureText(ozelGunTarihYazi(g)).width;
      ctx.textAlign = "left";
      ctx.fillStyle = LACIVERT;
      ctx.font = f(24, 600);
      ctx.fillText(sigdir(ctx, g.kisa || g.mesaj, sag - sol - 120 - tarihG), sol + 80, gy);
    });
    ustY = 494 + bantH + 22;
  }

  // Urun satirlari
  const altY = 1136;
  const n = form.kalemler.length;
  const satirH = Math.min(128, (altY - ustY) / Math.max(n, 1));
  const k = Math.max(0.6, satirH / 128);
  ctx.fillStyle = LACIVERT;
  ctx.fillRect(sol, ustY - 4, sag - sol, 3);
  form.kalemler.forEach((u, i) => {
    const y0 = ustY + i * satirH;
    if (i % 2 === 1) {
      ctx.fillStyle = "#FAFBFD";
      ctx.fillRect(sol, y0, sag - sol, satirH);
    }
    const orta = y0 + satirH / 2;
    const fiyat = kalemFiyatlari(u);
    // Sag: iki fiyat sutunu (vadeli en sagda, pesin solunda)
    const vadeliSag = sag - 16;
    const pesinSag = sag - 16 - FIYAT_SUTUN_G;
    const urunG = pesinSag - FIYAT_SUTUN_G - (sol + 16) + 30;
    ctx.textAlign = "left";
    ctx.fillStyle = LACIVERT;
    ctx.font = f(Math.round(38 * k), 600);
    ctx.fillText(sigdir(ctx, `${u.urun}`, urunG), sol + 16, orta - 10 * k);
    ctx.fillStyle = SOLUK;
    ctx.font = f(Math.round(23 * k), 400);
    ctx.fillText(sigdir(ctx, `${u.ambalaj}  ·  ${u.teslim}`, urunG), sol + 16, orta + 22 * k);
    ctx.fillStyle = u.kdv_dahil ? LACIVERT : SOLUK;
    ctx.font = f(Math.round(20 * k), 600);
    ctx.fillText(`TL/kg · ${kdvYazi(u.kdv_dahil)}`, sol + 16, orta + 50 * k);
    const fiyatCiz = (deger: number | null, x: number, etiket: string) => {
      ctx.textAlign = "right";
      ctx.fillStyle = SEFTALI_YAZI;
      ctx.font = f(Math.round(19 * k), 600);
      ctx.fillText(etiket, x, orta - 26 * k);
      if (deger === null) {
        ctx.fillStyle = "#B0B6C5";
        ctx.font = f(Math.round(40 * k), 600);
        ctx.fillText("—", x, orta + 24 * k);
        return;
      }
      ctx.fillStyle = MUREKKEP;
      ctx.font = f(Math.round(48 * k), 700);
      ctx.fillText(fiyatYazi(deger), x, orta + 26 * k);
    };
    fiyatCiz(fiyat.pesin, pesinSag, "PEŞİN");
    fiyatCiz(fiyat.vadeli, vadeliSag, fiyat.vadeli !== null ? `VADELİ · ${vadeYazi(fiyat.vadeGun).toLocaleUpperCase("tr")}` : "VADELİ");
    ctx.fillStyle = CIZGI;
    ctx.fillRect(sol, y0 + satirH - 2, sag - sol, 2);
  });
  ctx.textAlign = "left";

  // Alt: gecerlilik + siparis sureci kutusu + iletisim bandi
  ctx.fillStyle = SEFTALI_ZEMIN;
  yuvarlak(ctx, sol, 1150, sag - sol, 86, 14);
  ctx.fill();
  ctx.fillStyle = SEFTALI;
  ctx.fillRect(sol, 1162, 6, 62);
  ctx.fillStyle = LACIVERT;
  ctx.font = f(23, 600);
  ctx.fillText(
    sigdir(ctx, `${onayZamaniYazi(form.onay_zamani).slice(0, 10)} tarihinde onaylanmıştır · ${GECERLILIK_GUN} gün geçerlidir`, sag - sol - 40),
    sol + 26,
    1186
  );
  ctx.fillStyle = SOLUK;
  ctx.font = f(20, 400);
  ctx.fillText(sigdir(ctx, "Siparişinizin her adımında WhatsApp ile bilgilendirilirsiniz; 7/24 takip bağlantısı.", sag - sol - 40), sol + 26, 1218);

  ctx.fillStyle = LACIVERT_KOYU;
  ctx.fillRect(0, 1250, G, 100);
  ctx.fillStyle = "#ffffff";
  ctx.font = f(30, 700);
  ctx.fillText(`${FORM_SIRKET.iletisimAd} · ${FORM_SIRKET.iletisimTel}`, sol, 1300);
  ctx.fillStyle = BANT_ACIK;
  ctx.font = f(22, 400);
  ctx.fillText(`${FORM_SIRKET.web}  ·  ${FORM_SIRKET.tel}`, sol, 1333);
  ctx.textAlign = "right";
  ctx.fillStyle = SEFTALI;
  ctx.font = f(22, 600);
  ctx.fillText("WhatsApp", sag, 1300);

  return new Promise((ok, hata) => canvas.toBlob((b) => (b ? ok(b) : hata(new Error("Görsel oluşturulamadı"))), "image/png"));
}

export async function indirFiyatFormuGorsel(form: IcFiyatFormu): Promise<void> {
  const blob = await fiyatFormuGorselOlustur(form);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${formDosyaAdi(form.form_no)}_telefon.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
