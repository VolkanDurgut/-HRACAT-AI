import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  DURUM_METNI,
  gunlukRaporHesapla,
  istanbulBugun,
  gunEkle,
  sevkiyatSatiriMetni,
  type GunlukRapor,
  type RaporDosyasi,
  type RaporKonteyneri,
  type RaporRezervasyonu,
  type SevkiyatSatiri,
} from "../_shared/gunluk-rapor.ts";

// ============================================================================
// GUNLUK SEVKIYAT RAPORU MAILI (gunluk-rapor-gonder) - 07.10.2026
// ============================================================================
// pg_cron ile her gun 2 kez tetiklenir (Turkiye saati, UTC+3 sabit):
//   "gunluk-rapor-sabah" 05:00 UTC = 08:00 TR -> DUNUN raporu (gunu kapatir)
//   "gunluk-rapor-aksam" 14:00 UTC = 17:00 TR -> BUGUNUN raporu
// Icerik /rapor/gunluk sayfasiyla AYNI hesaptan gelir (_shared/gunluk-rapor.ts):
// ozet kutulari + sevkiyat tablosu ("MUSTERI | 4x | MARKA | Yukleme Tamamlandi ✔")
// + gun icinde yuklenen konteynerler (07.10.2026 revize: "Kisa Ozet" metni ve
// alt bilgi notu kullanici istegiyle kaldirildi). Musteriye GITMEZ; sirket ici alicilara.
//
// Alici: GUNLUK_RAPOR_ALICILARI (virgulle birden fazla) secret'i varsa o,
// yoksa gece yedeginin gittigi GERI_BILDIRIM_ALICI. Sirket adreslerine gecmek
// icin sadece secret ayarlanir; kod degismez.
//
// TEKRAR KORUMASI: cron herkese acik anon anahtarla cagirir. Her (gun, slot,
// sirket) icin rapor_gonderimleri tablosuna kayit atilir (benzersiz); ayni
// slot ikinci kez gonderilmez -> anahtari bilen biri posta kutusunu dolduramaz.
// Gonderim basarisizsa kayit silinir (sonraki deneme gonderebilsin).
//
// DENEME MODU: govdede {"deneme": true} -> mail GITMEZ, kayit YAZILMAZ; yanitta
// ozet + konu + mail HTML'i doner (onizleme/test icin). {"slot":"sabah"|"aksam"}
// ile slot zorlanabilir; verilmezse TR saatine gore secilir (12'den once sabah).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALICILAR = (Deno.env.get("GUNLUK_RAPOR_ALICILARI") || Deno.env.get("GERI_BILDIRIM_ALICI") || "volkandurgut.tr@gmail.com")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);
const UYGULAMA_URL = "https://ihracatasistanim.com";
const SAYFA_BOYUTU = 1000;

const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

/** 5xx / ag hatasinda 2 kez daha dener (yedekleme-gonder ile ayni kural). */
async function tekrarla(istek: () => Promise<Response>): Promise<Response> {
  for (let sira = 0; ; sira++) {
    try {
      const res = await istek();
      if (res.status < 500 || sira >= 2) return res;
      await res.body?.cancel();
    } catch (e) {
      if (sira >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (sira + 1)));
  }
}

/** Sayfali GET; hata olursa firlatir (sessizce bos donmez). */
async function hepsiniCek<T>(yol: string): Promise<T[]> {
  const satirlar: T[] = [];
  for (let bas = 0; ; bas += SAYFA_BOYUTU) {
    const ayrac = yol.includes("?") ? "&" : "?";
    const res = await tekrarla(() => fetch(`${SUPABASE_URL}/rest/v1/${yol}${ayrac}limit=${SAYFA_BOYUTU}&offset=${bas}`, { headers: basliklar }));
    if (!res.ok) throw new Error(`${yol.split("?")[0]} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const sayfa = (await res.json()) as T[];
    satirlar.push(...sayfa);
    if (sayfa.length < SAYFA_BOYUTU) break;
  }
  return satirlar;
}

const inListe = (idler: string[]) => `(${idler.map((i) => `"${i}"`).join(",")})`;

async function sirketRaporu(companyId: string, tarih: string): Promise<GunlukRapor> {
  const acik = await hepsiniCek<RaporDosyasi>(
    `ihracat_dosyalari?select=id,dosya_no,alici_firma,marka&company_id=eq.${companyId}&durum=in.(${encodeURIComponent("Açık")},Acik)&order=id`
  );
  const acikIdler = acik.map((d) => d.id);
  const kolonlar = "id,dosya_id,konteyner_no,muhur_no,plaka,marka,tare_kg,vgm_kg,dba_dosya_url,dba_yukleme_tarihi,dba_kontrol_sonucu";
  const [rezler, acikKont, dbaKont] = await Promise.all([
    acikIdler.length
      ? hepsiniCek<RaporRezervasyonu>(`rezervasyonlar?select=dosya_id,konteyner_adedi,booking_no,gemi_adi,gemi_kalkis_tarihi&company_id=eq.${companyId}&dosya_id=in.${inListe(acikIdler)}&order=id`)
      : Promise.resolve([]),
    acikIdler.length
      ? hepsiniCek<RaporKonteyneri>(`konteynerler?select=${kolonlar}&company_id=eq.${companyId}&dosya_id=in.${inListe(acikIdler)}&order=id`)
      : Promise.resolve([]),
    hepsiniCek<RaporKonteyneri>(`konteynerler?select=${kolonlar}&company_id=eq.${companyId}&dba_dosya_url=not.is.null&order=id`),
  ]);
  const acikSet = new Set(acikIdler);
  const digerIdler = Array.from(new Set(dbaKont.map((k) => k.dosya_id).filter((id) => !acikSet.has(id))));
  const diger = digerIdler.length
    ? await hepsiniCek<RaporDosyasi>(`ihracat_dosyalari?select=id,dosya_no,alici_firma,marka&company_id=eq.${companyId}&id=in.${inListe(digerIdler)}&order=id`)
    : [];
  return gunlukRaporHesapla(tarih, acik, rezler, [...acikKont, ...dbaKont], diger);
}

// ---------------------------------------------------------------- mail HTML
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (n: number) => n.toLocaleString("tr-TR");
const tarihTR = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "—");

function durumHucresi(s: SevkiyatSatiri, gunEtiket: string): string {
  const [renk, zemin, metin] =
    s.durum === "tamamlandi"
      ? ["#047857", "#D1FAE5", DURUM_METNI.tamamlandi]
      : s.durum === "yukleniyor"
      ? ["#B45309", "#FEF3C7", `Yükleniyor ${s.yuklenen}/${s.konteynerAdedi}`]
      : ["#475569", "#F1F5F9", DURUM_METNI.bekliyor];
  const ek = s.gunTamamlandi
    ? ` <span style="color:#047857;font-size:11px;font-weight:bold">${gunEtiket}</span>`
    : s.durum !== "tamamlandi" && s.gunYuklenen > 0
    ? ` <span style="color:#64748B;font-size:11px">+${s.gunYuklenen} ${gunEtiket}</span>`
    : "";
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${zemin};color:${renk};font-size:11px;font-weight:bold;white-space:nowrap">${metin}</span>${ek}`;
}

function mailHtml(sirketAdi: string, r: GunlukRapor, slot: "sabah" | "aksam"): string {
  const o = r.ozet;
  const gunEtiket = slot === "aksam" ? "bugün" : "dün";
  const baslikGun = slot === "aksam" ? "Bugün" : "Dün";
  const th = (t: string, sag = false) => `<th style="background:#1E293B;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold">${t}</th>`;
  const td = (t: string, ek = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;${ek}">${t}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, renk: string) =>
    `<td style="width:33%;padding:4px;vertical-align:top"><div style="border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:22px;font-weight:bold;color:${renk};line-height:1.2">${deger}</div><div style="font-size:10px;color:#64748B">${alt}</div></div></td>`;

  const sevkiyatSatirlari = r.sevkiyatlar.length
    ? r.sevkiyatlar
        .map((s, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(s.musteri)}</b>`)}${td(`<b>${s.konteynerAdedi}x</b>`, "text-align:center;white-space:nowrap")}${td(`<b>${esc(s.marka)}</b>`)}${td(durumHucresi(s, gunEtiket))}${td(`<span style="color:#64748B;font-size:11px">${esc(s.dosya_no)}${s.booking ? " · " + esc(s.booking) : ""}</span>`, "white-space:nowrap")}${td(`<span style="color:#64748B;font-size:11px">${tarihTR(s.etd)}</span>`, "white-space:nowrap")}</tr>`)
        .join("")
    : `<tr><td colspan="6" style="padding:10px;color:#94A3B8;font-style:italic;font-size:12px">Açık sevkiyat bulunmuyor.</td></tr>`;

  const yuklenenSatirlari = r.gunYuklenenler.length
    ? r.gunYuklenenler
        .map((k, i) => `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(esc(k.saat || "—"), "color:#64748B")}${td(`<b style="font-family:monospace">${esc(k.konteyner_no)}</b>`)}${td(esc(k.musteri))}${td(esc(k.marka))}${td(esc(k.muhur_no || "-"))}${td(esc(k.plaka || "-"))}${td(k.net != null ? sayi(k.net) : "-", "text-align:right;font-weight:bold")}</tr>`)
        .join("") +
      `<tr><td colspan="6" style="padding:8px;font-size:11px;font-weight:bold;color:#475569;border-top:2px solid #CBD5E1">TOPLAM — ${r.gunYuklenenler.length} konteyner</td><td style="padding:8px;font-size:11px;font-weight:bold;text-align:right;border-top:2px solid #CBD5E1">${o.gunYuklenenNetKg ? sayi(o.gunYuklenenNetKg) + " kg" : ""}</td></tr>`
    : `<tr><td colspan="7" style="padding:10px;color:#94A3B8;font-style:italic;font-size:12px">${baslikGun} yüklenen konteyner bulunmuyor.</td></tr>`;

  const bolumBaslik = (t: string) => `<div style="margin:22px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#334155;border-left:4px solid #1E293B;padding-left:8px">${t}</div>`;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid #1E293B;padding-bottom:10px"><tr>
    <td><div style="font-size:18px;font-weight:bold;color:#0F172A">${esc(sirketAdi || "İhracat AI")}</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Sevkiyat ve Kantar Raporu</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:#1E293B">${tarihTR(r.tarih)}</div><div style="font-size:11px;color:#94A3B8">${slot === "aksam" ? "Akşam raporu · 17:00" : "Sabah raporu · 08:00 (dünün özeti)"}</div></td>
  </tr></table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
    ${kutu(`${baslikGun} Yüklenen`, String(o.gunYuklenenKonteyner), o.gunYuklenenNetKg ? `konteyner · ${sayi(o.gunYuklenenNetKg)} kg` : "konteyner", "#1E293B")}
    ${kutu("Açık Sevkiyat", String(o.acikSevkiyat), `${o.tamamlanan} yüklendi · ${o.yukleniyor} yükleniyor · ${o.bekliyor} başlamadı`, "#047857")}
    ${kutu("Yükleme Bekleyen Konteyner", String(o.bekleyenKonteyner), `DBA bekliyor · toplam ${o.toplamKonteyner}, yüklenen ${o.yuklenenKonteyner}`, "#B45309")}
  </tr></table>

  ${bolumBaslik("Sevkiyat Durumu — Açık Dosyalar")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${th("Müşteri")}${th("Adet")}${th("Marka")}${th("Durum")}${th("Dosya / Booking")}${th("ETD")}</tr>
    ${sevkiyatSatirlari}
  </table>

  ${bolumBaslik(`${baslikGun} Yüklenen Konteynerler`)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>${th("Saat")}${th("Konteyner No")}${th("Müşteri")}${th("Marka")}${th("Mühür No")}${th("Plaka")}${th("Net (kg)", true)}</tr>
    ${yuklenenSatirlari}
  </table>

  <div style="margin-top:24px;text-align:center">
    <a href="${UYGULAMA_URL}/rapor/gunluk?tarih=${r.tarih}" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">Raporu uygulamada aç</a>
  </div>
</td></tr></table>
</td></tr></table></body></html>`;
}

function mailKonusu(r: GunlukRapor, slot: "sabah" | "aksam"): string {
  const o = r.ozet;
  const parcalar = [`${o.gunYuklenenKonteyner} konteyner yüklendi`];
  if (o.gunTamamlanan) parcalar.push(`${o.gunTamamlanan} sevkiyatın yüklemesi bitti`);
  parcalar.push(o.bekleyenKonteyner ? `${o.bekleyenKonteyner} konteyner yükleme bekliyor` : "bekleyen konteyner yok");
  return `Günlük Sevkiyat Raporu — ${tarihTR(r.tarih)} ${slot === "aksam" ? "Akşam" : "(Dün)"} | ${parcalar.join(" · ")}`;
}

// ---------------------------------------------------------------- kayit
/** Bu (gun, slot, sirket) icin gonderim hakki alir; zaten varsa false. */
async function gonderimHakkiAl(tarih: string, slot: string, companyId: string): Promise<boolean> {
  const res = await tekrarla(() =>
    fetch(`${SUPABASE_URL}/rest/v1/rapor_gonderimleri?on_conflict=rapor_tarihi,slot,company_id`, {
      method: "POST",
      headers: { ...basliklar, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ rapor_tarihi: tarih, slot, company_id: companyId, durum: "gonderiliyor" }),
    })
  );
  if (!res.ok) throw new Error(`rapor_gonderimleri yazılamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const satir = (await res.json()) as unknown[];
  return satir.length > 0;
}

async function kayitGuncelle(tarih: string, slot: string, companyId: string, alanlar: Record<string, unknown> | null) {
  const filtre = `rapor_tarihi=eq.${tarih}&slot=eq.${slot}&company_id=eq.${companyId}`;
  await fetch(`${SUPABASE_URL}/rest/v1/rapor_gonderimleri?${filtre}`, {
    method: alanlar ? "PATCH" : "DELETE",
    headers: { ...basliklar, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: alanlar ? JSON.stringify(alanlar) : undefined,
  });
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req: Request) => {
  try {
    const govde = (await req.json().catch(() => ({}))) as { deneme?: boolean; slot?: string; tarih?: string };
    const deneme = govde.deneme === true;
    const trSaat = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }));
    const slot: "sabah" | "aksam" = govde.slot === "sabah" || govde.slot === "aksam" ? govde.slot : trSaat < 12 ? "sabah" : "aksam";
    const bugun = istanbulBugun();
    // Sabah raporu DUNU kapatir; tarih sadece deneme modunda elle verilebilir.
    const tarih = deneme && govde.tarih && /^\d{4}-\d{2}-\d{2}$/.test(govde.tarih) ? govde.tarih : slot === "sabah" ? gunEkle(bugun, -1) : bugun;

    // Raporlanacak sirketler: acik dosyasi olanlar.
    const sirketDosyalari = await hepsiniCek<{ company_id: string }>(`ihracat_dosyalari?select=company_id&durum=in.(${encodeURIComponent("Açık")},Acik)&order=id`);
    const sirketIdler = Array.from(new Set(sirketDosyalari.map((d) => d.company_id).filter(Boolean)));
    const sirketler = sirketIdler.length
      ? await hepsiniCek<{ id: string; company_name: string | null }>(`companies?select=id,company_name&id=in.${inListe(sirketIdler)}&order=id`)
      : [];

    const sonuclar: unknown[] = [];
    for (const s of sirketler) {
      const rapor = await sirketRaporu(s.id, tarih);
      const konu = mailKonusu(rapor, slot);
      const html = mailHtml(s.company_name || "", rapor, slot);
      if (deneme) {
        sonuclar.push({ sirket: s.company_name, tarih, slot, konu, ozet: rapor.ozet, sevkiyat_satirlari: rapor.sevkiyatlar.map(sevkiyatSatiriMetni), html });
        continue;
      }
      if (!(await gonderimHakkiAl(tarih, slot, s.id))) {
        sonuclar.push({ sirket: s.company_name, tarih, slot, atlandi: "Bu rapor zaten gönderilmiş." });
        continue;
      }
      if (!RESEND_API_KEY) {
        await kayitGuncelle(tarih, slot, s.id, null);
        throw new Error("RESEND_API_KEY tanımlı değil.");
      }
      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "İhracat AI <bildirim@ihracatasistanim.com>", to: ALICILAR, subject: konu, html }),
      });
      if (!mailRes.ok) {
        const hata = (await mailRes.text()).slice(0, 300);
        await kayitGuncelle(tarih, slot, s.id, null); // sonraki deneme gonderebilsin
        throw new Error(`Mail gönderilemedi (HTTP ${mailRes.status}): ${hata}`);
      }
      await kayitGuncelle(tarih, slot, s.id, { durum: "gonderildi", alicilar: ALICILAR.join(", "), ozet: rapor.ozet, gonderim_zamani: new Date().toISOString() });
      sonuclar.push({ sirket: s.company_name, tarih, slot, gonderildi: true, ozet: rapor.ozet });
    }

    return new Response(JSON.stringify({ ok: true, deneme, slot, tarih, sonuclar }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("gunluk-rapor-gonder hata:", mesaj);
    return new Response(JSON.stringify({ ok: false, hata: mesaj }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
