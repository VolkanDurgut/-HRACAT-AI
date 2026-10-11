import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import {
  FORM_SIRKET,
  IcFiyatFormu,
  fiyatYazi,
  formDosyaAdi,
  gunYazi,
  hitapYazi,
  onayZamaniYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * Telefon gorseli (1080 x 1350, WhatsApp onizlemesinde acmadan okunur).
 * PDF ile AYNI form kaydindan cizilir; tarayicida canvas ile, ek kutuphane yok.
 * Yazi tipi PDF'teki gomulu Roboto TR (Turkce karakterler tam).
 */

const G = 1080;
const Y = 1350;
const LACIVERT = "#283474";
const SEFTALI = "#F4A07C";
const KOYU = "#1d2333";
const GRI = "#5b6275";
const CIZGI = "#e3e6ee";
const YAZI = "UnexRobotoTR";

let fontYuklendi: Promise<void> | null = null;
function fontuYukle(): Promise<void> {
  if (!fontYuklendi) {
    const ff = new FontFace(YAZI, `url(data:font/ttf;base64,${ROBOTO_TR_BASE64})`);
    fontYuklendi = ff.load().then((f) => { (document.fonts as any).add(f); });
  }
  return fontYuklendi;
}

function resimYukle(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, hata) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = hata;
    img.src = src;
  });
}

/** Metni verilen genislige sigdirir (sigmazsa sonuna "…"). */
function sigdir(ctx: CanvasRenderingContext2D, metin: string, genislik: number): string {
  if (ctx.measureText(metin).width <= genislik) return metin;
  let m = metin;
  while (m.length > 1 && ctx.measureText(m + "…").width > genislik) m = m.slice(0, -1);
  return m + "…";
}

export async function fiyatFormuGorselOlustur(form: IcFiyatFormu): Promise<Blob> {
  await fontuYukle();
  const logo = await resimYukle(`data:image/png;base64,${UNEX_LOGO_BASE64}`);
  const canvas = document.createElement("canvas");
  canvas.width = G;
  canvas.height = Y;
  const ctx = canvas.getContext("2d")!;
  const f = (boy: number, kalin = false) => `${kalin ? "bold " : ""}${boy}px "${YAZI}", sans-serif`;
  const sol = 60;
  const sag = G - 60;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, G, Y);

  // Ust bant
  ctx.fillStyle = LACIVERT;
  ctx.fillRect(0, 0, G, 236);
  ctx.fillStyle = SEFTALI;
  ctx.fillRect(0, 236, G, 9);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  (ctx as any).roundRect ? (ctx as any).roundRect(sol, 46, 144, 144, 26) : ctx.rect(sol, 46, 144, 144);
  ctx.fill();
  ctx.drawImage(logo, sol + 10, 56, 124, 124);
  ctx.fillStyle = "#ffffff";
  ctx.font = f(50, true);
  ctx.fillText("Yan Mamul Fiyat", sol + 178, 108);
  ctx.fillText("Bilgilendirme Formu", sol + 178, 166);
  ctx.fillStyle = SEFTALI;
  ctx.font = f(24, true);
  ctx.fillText("UNEX GIDA", sol + 178, 206);

  // Form no + gecerlilik
  ctx.fillStyle = GRI;
  ctx.font = f(26);
  ctx.fillText(sigdir(ctx, hitapYazi(form.alici), 620), sol, 300);
  ctx.textAlign = "right";
  ctx.fillStyle = LACIVERT;
  ctx.font = f(28, true);
  ctx.fillText(form.form_no, sag, 300);
  ctx.textAlign = "left";
  ctx.fillStyle = KOYU;
  ctx.font = f(26);
  ctx.fillText(`Onay ${onayZamaniYazi(form.onay_zamani).slice(0, 10)}  ·  ${gunYazi(form.gecerlilik_bitis)} tarihine kadar geçerli`, sol, 342);

  // Urun kartlari
  const ustY = 372;
  const altY = 1180;
  const n = form.kalemler.length;
  const satirH = Math.min(150, (altY - ustY) / Math.max(n, 1));
  const k = satirH / 150; // yazi olcegi
  form.kalemler.forEach((u, i) => {
    const y0 = ustY + i * satirH;
    if (i > 0) {
      ctx.fillStyle = CIZGI;
      ctx.fillRect(sol, y0, sag - sol, 2);
    }
    const orta = y0 + satirH / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = LACIVERT;
    ctx.font = f(Math.round(40 * k), true);
    ctx.fillText(sigdir(ctx, u.urun, 560), sol, orta - 14 * k);
    ctx.fillStyle = GRI;
    ctx.font = f(Math.round(25 * k));
    ctx.fillText(sigdir(ctx, `${u.ambalaj}  ·  ${vadeYazi(u.vade_gun)}  ·  ${u.odeme}  ·  ${u.teslim}`, 640), sol, orta + 30 * k);
    ctx.textAlign = "right";
    ctx.fillStyle = KOYU;
    ctx.font = f(Math.round(58 * k), true);
    ctx.fillText(fiyatYazi(u.birim_fiyat), sag, orta + 8 * k);
    ctx.fillStyle = GRI;
    ctx.font = f(Math.round(21 * k));
    ctx.fillText("TL/kg + KDV", sag, orta + 40 * k);
  });
  ctx.textAlign = "left";

  // Alt bant
  ctx.fillStyle = "#FDF0EA";
  ctx.fillRect(0, 1190, G, Y - 1190);
  ctx.fillStyle = SEFTALI;
  ctx.fillRect(0, 1190, G, 6);
  ctx.fillStyle = LACIVERT;
  ctx.font = f(30, true);
  ctx.fillText(FORM_SIRKET.iletisim.replace(" (WhatsApp)", ""), sol, 1252);
  ctx.fillStyle = GRI;
  ctx.font = f(23);
  ctx.fillText(`${FORM_SIRKET.web}  ·  ${FORM_SIRKET.tel}  ·  Birim fiyatlara KDV dahil değildir.`, sol, 1300);

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
