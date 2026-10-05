import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// GUNLUK VERI YEDEGI (yedekleme-gonder)
// ============================================================================
// Her gece 00:00 UTC (03:00 TR) pg_cron "gunluk-yedek-maili" isiyle tetiklenir
// ve veritabaninin JSON yedegini mail eki olarak YEDEK_ALICI adresine gonderir.
//
// v2 (01.10.2026) iyilestirmeleri:
//  - SAYFALAMA: PostgREST tek istekte en fazla 1000 satir dondurur. Eskiden
//    her tablo tek istekte cekildigi icin 1000 satiri asan tablo SESSIZCE
//    eksik yedeklenecekti. Artik tablolar sayfa sayfa (1000'er) cekilir.
//  - SESSIZ HATA YOK: okunamayan tablo eskiden bos [] olarak yedege girip
//    "basarili" gorunuyordu. Artik uyari olarak raporlanir, mail konusu
//    "[UYARI]" ile baslar ve hangi tablonun eksik oldugu yazilir.
//  - KAPSAM: kalite_sertifikasi_ayarlari ve ai_usage_logs eklendi;
//    denetim_kayitlari (her degisikligin/silinen kaydin eski hali) SON 7
//    GUNUYLE eklenir (tamami hizla buyudugu icin mail sinirini zorlar; 7
//    gunluk kayan pencere, bir mail kacsa bile bosluk birakmaz).
//  - STORAGE ENVANTERI: PDF dosyalarinin kendisi (~120 MB) mail ekine
//    sigmaz; yedege TAM DOSYA LISTESI (bucket, yol, boyut, tarih) eklenir ve
//    mailde dosyalarin kendisinin yedekte OLMADIGI acikca yazilir.
//  - BOYUT SINIRI: ek, guvenli sinirdan buyukse ek yerine uyari maili gider.
//  - KOTUYE KULLANIM KORUMASI + GECMIS: her gercek calisma yedek_kayitlari
//    tablosuna yazilir; son 20 saatte basarili yedek gonderildiyse yeni mail
//    gonderilmez (cron herkese acik anon anahtarla cagirdigi icin, anahtari
//    bilen biri mail kutusunu dolduramaz).
//  - DENEME MODU: govdede {"deneme": true} -> her sey hazirlanir ama mail
//    GONDERILMEZ, kayit YAZILMAZ; yanitta SADECE ozet sayilar doner (veri
//    donmez).
//  - KAPASITE IZLEME (05.10.2026): mailde DB ve dosya deposu doluluk orani
//    yazilir. %85'i gecen kaynak uyariya eklenir (konu "[UYARI]"), %90'da
//    "KRITIK" yazar. DB boyutu public.veritabani_boyutu_bayt() (sadece
//    service_role) ile, depo boyutu storage envanterinden hesaplanir.
//    Sinirlar Free plan kotasidir; plan degisirse asagidaki sabitler guncellenir.
//  - GECICI HATA TEKRARI (05.10.2026): okuma isteklerinde 5xx / ag hatasi
//    olursa 2 kez daha denenir (geciciHatadaTekrarla).
//
// depositors ve contact_messages tablolari BASKA bir projeye ait - bilerek
// yedege dahil edilmez (bkz. CLAUDE.md).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const YEDEK_ALICI = Deno.env.get("GERI_BILDIRIM_ALICI") || "volkandurgut.tr@gmail.com";

// Tum satirlariyla yedeklenen tablolar.
const YEDEKLENECEK_TABLOLAR = [
  "ihracat_dosyalari",
  "rezervasyonlar",
  "konteynerler",
  "sevkiyatlar",
  "acenteler",
  "plakalar",
  "ana_siparisler",
  "acente_teklifleri",
  "dosya_evraklari",
  "fumigation_ayarlari",
  "kalite_sertifikasi_ayarlari",
  "kullanici_rolleri",
  "kullanici_yetkileri",
  "companies",
  "destek_mesajlari",
  "geri_bildirimler",
  "banka_presetleri",
  "ai_usage_logs",
];

// Denetim kayitlari: sadece son N gun (kayan pencere).
const DENETIM_TABLOSU = "denetim_kayitlari";
const DENETIM_GUN = 7;

const SAYFA_BOYUTU = 1000;
// Resend toplam mail siniri 40 MB (base64 dahil). Base64 ~%33 buyuttugu
// icin ham JSON icin 25 MB guvenli ust sinir.
const MAKS_EK_BAYT = 25 * 1024 * 1024;
// Ayni gun icinde ikinci bir yedek maili gonderilmez.
const TEKRAR_BEKLEME_SAAT = 20;

// Kapasite izleme (Free plan kotalari, supabase.com/pricing 05.10.2026).
const DB_KOTA_BAYT = 500 * 1024 * 1024;
const DEPO_KOTA_BAYT = 1024 * 1024 * 1024;
const KAPASITE_UYARI_ORAN = 0.85;
const KAPASITE_KRITIK_ORAN = 0.9;

const servisBasliklari = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

/** Gecici sunucu hatalarinda (5xx, ag hatasi) 2 kez daha dener (2 sn, 4 sn
 * bekleyerek). 05.10.2026: PostgREST'in "Thread killed by timeout manager"
 * aninda 19 satirlik ihracat_dosyalari tek seferlik HTTP 555 dondurdu; tek
 * bir anlik kesinti gece yedeginde tabloyu eksik birakmasin. 4xx tekrar
 * denenmez (kalici hata). */
async function geciciHatadaTekrarla(istek: () => Promise<Response>): Promise<Response> {
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

/** Bir tablonun TUM satirlarini 1000'erlik sayfalarla ceker. Hata olursa
 * firlatir (sessizce bos donmez). */
async function tabloyuSayfaliCek(tablo: string, ekFiltre = "", siralama = "id.asc"): Promise<unknown[]> {
  const satirlar: unknown[] = [];
  for (let baslangic = 0; ; baslangic += SAYFA_BOYUTU) {
    // limit/offset: son sayfadan sonrasi her zaman bos liste (200) doner;
    // Range basligi tam 1000'in katinda 416 hatasi verebiliyordu.
    const url = `${SUPABASE_URL}/rest/v1/${tablo}?select=*&order=${siralama}${ekFiltre}&limit=${SAYFA_BOYUTU}&offset=${baslangic}`;
    const res = await geciciHatadaTekrarla(() => fetch(url, { headers: servisBasliklari }));
    if (!res.ok) {
      throw new Error(`${tablo} okunamadı (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const sayfa = (await res.json()) as unknown[];
    satirlar.push(...sayfa);
    if (sayfa.length < SAYFA_BOYUTU) break;
  }
  return satirlar;
}

type StorageDosyasi = { bucket: string; yol: string; bayt: number | null; tur: string | null; tarih: string | null };

/** Bir bucket'taki tum dosyalari (alt klasorler dahil) listeler. */
async function bucketDosyalariniListele(bucket: string, onEk = ""): Promise<StorageDosyasi[]> {
  const sonuc: StorageDosyasi[] = [];
  for (let offset = 0; ; offset += SAYFA_BOYUTU) {
    const res = await geciciHatadaTekrarla(() =>
      fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...servisBasliklari, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: onEk, limit: SAYFA_BOYUTU, offset, sortBy: { column: "name", order: "asc" } }),
      })
    );
    if (!res.ok) {
      throw new Error(`${bucket}/${onEk} listelenemedi (HTTP ${res.status})`);
    }
    // deno-lint-ignore no-explicit-any
    const ogeler = (await res.json()) as any[];
    for (const oge of ogeler) {
      if (oge.id === null) {
        // Klasor -> icine in
        sonuc.push(...(await bucketDosyalariniListele(bucket, `${onEk}${oge.name}/`)));
      } else {
        sonuc.push({
          bucket,
          yol: `${onEk}${oge.name}`,
          bayt: oge.metadata?.size ?? null,
          tur: oge.metadata?.mimetype ?? null,
          tarih: oge.created_at ?? null,
        });
      }
    }
    if (ogeler.length < SAYFA_BOYUTU) break;
  }
  return sonuc;
}

async function storageEnvanteriCikar(): Promise<StorageDosyasi[]> {
  const res = await geciciHatadaTekrarla(() => fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: servisBasliklari }));
  if (!res.ok) throw new Error(`Bucket listesi alınamadı (HTTP ${res.status})`);
  // deno-lint-ignore no-explicit-any
  const bucketlar = (await res.json()) as any[];
  const tumu: StorageDosyasi[] = [];
  for (const b of bucketlar) {
    tumu.push(...(await bucketDosyalariniListele(b.id)));
  }
  return tumu;
}

/** Son TEKRAR_BEKLEME_SAAT icinde basarili/uyarili yedek gonderildi mi? */
async function yakindaYedekGonderildiMi(): Promise<boolean> {
  const esik = new Date(Date.now() - TEKRAR_BEKLEME_SAAT * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/yedek_kayitlari?select=id&durum=in.(basarili,uyarili)&created_at=gte.${encodeURIComponent(esik)}&limit=1`,
    { headers: servisBasliklari }
  );
  if (!res.ok) {
    // Kayit tablosu okunamazsa yedegi ENGELLEME - yedek almak, tekrar mail
    // riskinden daha onemli.
    console.error("yedek_kayitlari okunamadi:", res.status);
    return false;
  }
  const satirlar = (await res.json()) as unknown[];
  return satirlar.length > 0;
}

async function calismayiKaydet(kayit: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/yedek_kayitlari`, {
    method: "POST",
    headers: { ...servisBasliklari, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(kayit),
  });
  if (!res.ok) console.error("yedek_kayitlari yazilamadi:", res.status, await res.text());
}

/** Veritabani boyutu (bayt). Okunamazsa firlatir. */
async function veritabaniBoyutu(): Promise<number> {
  const res = await geciciHatadaTekrarla(() =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/veritabani_boyutu_bayt`, {
      method: "POST",
      headers: { ...servisBasliklari, "Content-Type": "application/json" },
      body: "{}",
    })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const deger = Number(await res.json());
  if (!Number.isFinite(deger) || deger <= 0) throw new Error("geçersiz değer");
  return deger;
}

type KapasiteSatiri = { kaynak: string; bayt: number | null; kota: number; oran: number | null };

function kapasiteDurumu(oran: number | null): "normal" | "uyari" | "kritik" | "olculemedi" {
  if (oran === null) return "olculemedi";
  if (oran >= KAPASITE_KRITIK_ORAN) return "kritik";
  if (oran >= KAPASITE_UYARI_ORAN) return "uyari";
  return "normal";
}

function yuzdeYaz(oran: number): string {
  return `%${(oran * 100).toFixed(1).replace(".", ",")}`;
}

function escapeHtml(deger: string): string {
  return deger.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mbYaz(bayt: number): string {
  return `${(bayt / (1024 * 1024)).toFixed(2)} MB`;
}

function jsonCevap(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  let deneme = false;
  try {
    const govde = await req.json();
    deneme = govde?.deneme === true;
  } catch {
    // Govde yok / JSON degil -> normal (gercek) calisma
  }

  try {
    if (!deneme) {
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY ortam değişkeni ayarlanmamış.");
      if (await yakindaYedekGonderildiMi()) {
        return jsonCevap({ basarili: true, atlandi: true, neden: `Son ${TEKRAR_BEKLEME_SAAT} saatte zaten yedek gönderildi.` });
      }
    }

    const uyarilar: string[] = [];
    const yedek: Record<string, unknown> = {};
    const tabloSayilari: { tablo: string; adet: number | null; not?: string }[] = [];

    for (const tablo of YEDEKLENECEK_TABLOLAR) {
      try {
        const satirlar = await tabloyuSayfaliCek(tablo);
        yedek[tablo] = satirlar;
        tabloSayilari.push({ tablo, adet: satirlar.length });
      } catch (e) {
        const mesaj = e instanceof Error ? e.message : String(e);
        uyarilar.push(`Tablo yedeklenemedi: ${mesaj}`);
        tabloSayilari.push({ tablo, adet: null, not: "OKUNAMADI" });
      }
    }

    const denetimEsik = new Date(Date.now() - DENETIM_GUN * 24 * 60 * 60 * 1000).toISOString();
    try {
      const satirlar = await tabloyuSayfaliCek(
        DENETIM_TABLOSU,
        `&olusturma_tarihi=gte.${encodeURIComponent(denetimEsik)}`,
        "olusturma_tarihi.asc,id.asc"
      );
      yedek[DENETIM_TABLOSU] = satirlar;
      tabloSayilari.push({ tablo: DENETIM_TABLOSU, adet: satirlar.length, not: `son ${DENETIM_GUN} gün` });
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      uyarilar.push(`Tablo yedeklenemedi: ${mesaj}`);
      tabloSayilari.push({ tablo: DENETIM_TABLOSU, adet: null, not: "OKUNAMADI" });
    }

    let storageDosyalari: StorageDosyasi[] = [];
    try {
      storageDosyalari = await storageEnvanteriCikar();
    } catch (e) {
      uyarilar.push(`Storage dosya listesi çıkarılamadı: ${e instanceof Error ? e.message : String(e)}`);
    }
    const bucketOzeti: Record<string, { dosya: number; bayt: number }> = {};
    for (const d of storageDosyalari) {
      const o = (bucketOzeti[d.bucket] ||= { dosya: 0, bayt: 0 });
      o.dosya += 1;
      o.bayt += d.bayt || 0;
    }

    // ---- Kapasite (DB + dosya deposu) ----
    let dbBayt: number | null = null;
    try {
      dbBayt = await veritabaniBoyutu();
    } catch (e) {
      uyarilar.push(`Veritabanı boyutu ölçülemedi: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Envanter cikarilamadiysa depo boyutu bilinmiyor (0 yazmak yaniltir).
    const envanterVar = !uyarilar.some((u) => u.startsWith("Storage dosya listesi"));
    const depoBayt = envanterVar ? storageDosyalari.reduce((s, d) => s + (d.bayt || 0), 0) : null;
    const kapasite: KapasiteSatiri[] = [
      { kaynak: "Veritabanı", bayt: dbBayt, kota: DB_KOTA_BAYT, oran: dbBayt === null ? null : dbBayt / DB_KOTA_BAYT },
      { kaynak: "Dosya deposu (PDF vb.)", bayt: depoBayt, kota: DEPO_KOTA_BAYT, oran: depoBayt === null ? null : depoBayt / DEPO_KOTA_BAYT },
    ];
    for (const k of kapasite) {
      const d = kapasiteDurumu(k.oran);
      if (d === "kritik" || d === "uyari") {
        uyarilar.push(
          `${d === "kritik" ? "KRİTİK: " : ""}${k.kaynak} ${yuzdeYaz(k.oran!)} dolu (${mbYaz(k.bayt!)} / ${mbYaz(k.kota)}). ` +
            "Yer açılmalı veya plan yükseltilmeli; kota dolunca yeni yükleme/kayıt yapılamaz."
        );
      }
    }

    const simdi = new Date();
    const tarih = simdi.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
    const paket = {
      _bilgi: {
        olusturulma: simdi.toISOString(),
        surum: 2,
        not: `Tablolar tam yedektir; ${DENETIM_TABLOSU} sadece son ${DENETIM_GUN} günü içerir. _storage_dosya_listesi sadece DOSYA LİSTESİDİR - PDF dosyalarının kendisi bu yedekte YOKTUR, Supabase Storage'da durur.`,
        uyarilar,
      },
      ...yedek,
      _storage_dosya_listesi: storageDosyalari,
    };
    const jsonIcerik = JSON.stringify(paket, null, 2);
    const jsonBayt = new TextEncoder().encode(jsonIcerik).length;
    const ekSigiyor = jsonBayt <= MAKS_EK_BAYT;
    if (!ekSigiyor) {
      uyarilar.push(`Yedek dosyası çok büyük (${mbYaz(jsonBayt)} > ${mbYaz(MAKS_EK_BAYT)}); mail eki olarak gönderilemedi.`);
    }

    const toplamKayit = tabloSayilari.reduce((s, t) => s + (t.adet || 0), 0);
    const durum = uyarilar.length > 0 ? "uyarili" : "basarili";

    const ozet = {
      basarili: true,
      deneme,
      durum,
      toplamKayit,
      tabloSayisi: tabloSayilari.length,
      jsonBayt,
      storageDosyaSayisi: storageDosyalari.length,
      tablolar: tabloSayilari,
      bucketlar: bucketOzeti,
      kapasite: kapasite.map((k) => ({ ...k, durum: kapasiteDurumu(k.oran) })),
      uyarilar,
    };

    if (deneme) return jsonCevap(ozet);

    // ---- Mail ----
    const tabloSatirlari = tabloSayilari
      .map((t) => `<tr><td style="padding:2px 12px 2px 0;">${escapeHtml(t.tablo)}</td><td style="padding:2px 0;text-align:right;">${t.adet === null ? "<b style=\"color:#b91c1c\">OKUNAMADI</b>" : t.adet}${t.not && t.adet !== null ? ` <span style="color:#6b7280">(${escapeHtml(t.not)})</span>` : ""}</td></tr>`)
      .join("");
    const bucketSatirlari = Object.entries(bucketOzeti)
      .map(([b, o]) => `<li>${escapeHtml(b)}: ${o.dosya} dosya, ${mbYaz(o.bayt)}</li>`)
      .join("");
    const uyariBlogu = uyarilar.length
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:10px 14px;border-radius:8px;margin:12px 0;"><b>Uyarılar:</b><ul>${uyarilar.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul></div>`
      : "";
    const kapasiteRenk = { normal: "#15803d", uyari: "#b45309", kritik: "#b91c1c", olculemedi: "#6b7280" };
    const kapasiteSatirlari = kapasite
      .map((k) => {
        const d = kapasiteDurumu(k.oran);
        const deger = k.oran === null ? "ölçülemedi" : `${mbYaz(k.bayt!)} / ${mbYaz(k.kota)} (${yuzdeYaz(k.oran)})`;
        return `<tr><td style="padding:2px 12px 2px 0;">${escapeHtml(k.kaynak)}</td><td style="padding:2px 0;text-align:right;color:${kapasiteRenk[d]};font-weight:${d === "normal" ? "400" : "700"};">${deger}</td></tr>`;
      })
      .join("");
    const html = `
<p>İhracat AI veritabanınızın ${tarih} tarihli otomatik yedeği ${ekSigiyor ? "ektedir" : "<b>bu sefer eke sığmadı</b>"}.</p>
${uyariBlogu}
<p><b>Toplam ${toplamKayit} kayıt, ${tabloSayilari.length} tablo.</b></p>
<table style="border-collapse:collapse;font-size:13px;">${tabloSatirlari}</table>
<p style="margin-top:14px;"><b>Kapasite (Free plan kotası):</b> %85'te uyarı, %90'da kritik.</p>
<table style="border-collapse:collapse;font-size:13px;">${kapasiteSatirlari}</table>
<p style="margin-top:14px;"><b>Dosyalar (PDF vb.):</b> Yedekte sadece dosya <i>listesi</i> vardır; dosyaların kendisi mail ekine sığmadığı için yedekte değildir ve Supabase Storage'da durur.</p>
<ul>${bucketSatirlari || "<li>-</li>"}</ul>
<p>Bu dosyayı güvenli bir yerde (örn. bilgisayarınızda veya bulut depolamada) saklamanızı öneririz.</p>`;

    const mailGovdesi: Record<string, unknown> = {
      from: "İhracat AI <bildirim@ihracatasistanim.com>",
      to: [YEDEK_ALICI],
      subject: `${uyarilar.length ? "[UYARI] " : ""}İhracat AI - Günlük Veri Yedeği (${tarih})`,
      html,
    };
    if (ekSigiyor) {
      mailGovdesi.attachments = [
        {
          filename: `ihracat-ai-yedek-${tarih.replace(/\./g, "-")}.json`,
          content: btoa(unescape(encodeURIComponent(jsonIcerik))),
        },
      ];
    }

    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(mailGovdesi),
    });
    if (!mailRes.ok) {
      const err = await mailRes.text();
      throw new Error(`Yedek maili gönderilemedi (${mailRes.status}): ${err.slice(0, 300)}`);
    }

    await calismayiKaydet({
      durum,
      toplam_kayit: toplamKayit,
      tablo_sayisi: tabloSayilari.length,
      json_bayt: jsonBayt,
      storage_dosya_sayisi: storageDosyalari.length,
      uyarilar,
    });

    return jsonCevap(ozet);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("Yedekleme hatasi:", message);
    if (!deneme) await calismayiKaydet({ durum: "hatali", hata: message });
    return jsonCevap({ basarili: false, error: message }, 500);
  }
});
