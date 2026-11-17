import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { sevkiyatBelgeTuru, yedekMailHtml, yedekMailKonusu } from "./mail.ts";

// ============================================================================
// GUNLUK VERI YEDEGI (yedekleme-gonder)
// ============================================================================
// Her gece 00:00 UTC (03:00 TR) pg_cron "gunluk-yedek-maili" isiyle tetiklenir
// ve veritabaninin JSON yedegini (zip) ozel depoya yukler; ozet maili YEDEK_ALICILARI adreslerine gider (13.11.2026).
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
//  - GERI YUKLEME TESTI (05.10.2026): uretilen paket her gece
//    public.yedek_geri_yukleme_testi() ile canliyla ayni yapidaki GECICI
//    tablolara gercekten yuklenir; satirlar canliyla md5 karsilastirilir ve
//    tablolar arasi baglar kontrol edilir. Sonuc mailde yazar; sorun varsa
//    konu "[UYARI]". Canliya hicbir sey yazilmaz.
//    10.11.2026: PARCALI calisir (geriYuklemeTestiParcali); tek seferde 8 sn sinirina takiliyordu.
//    17.11.2026 (03:00 cokmesi): denetim_kayitlari testte zaman asimina dusuyor (16.11 uyari), 5xx "gecici hata"
//    sayilip 2 kez daha deneniyordu -> Nano sunucuda disk IO butcesi bitti, veritabani kilitlendi (17.11 504).
//    Artik: (1) denetim_kayitlari geri yukleme testine GIRMEZ (yedege girer; 7 gunluk denetim kaydi),
//    (2) test RPC'si 5xx'te TEKRAR DENENMEZ (yalniz ag kopmasi), (3) test GERI_YUKLEME_SURE_MS'yi asarsa kalan
//    parcalar "ATLANDI" (edge 150 sn sinirina carpmaz).
//  - MAIL GORUNUMU (26.10.2026): gunluk raporla ayni kurumsal tasarim, tablolar
//    Turkce adlariyla gruplu, kaydi 0 olan tablonun nedeni yazar -> mail.ts (saf).
//    Deneme yanitinda "html" alani da doner (onizleme; veri icermez, sadece sayilar).
//  - SIKISTIRILMIS EK (13.11.2026, kullanici: "Gunluk yedek maili gelmiyor"): 11.11'den beri JSON 10 MB'i asti
//    (mail ~14 MB) ve execution@ kutusuna ulasmadi (Resend kabul etti, alici sunucusu boyut sinirina takildi; son
//    ulasan 10.11, ~10,8 MB). Ek artik .zip (icinde ayni .json, DEFLATE ~%90 kucuk). Sinir sikistirilmis boyuta uygulanir.
//  - EK YERINE INDIRME LINKI (13.11.2026, kullanici karari "Ek yerine giris gerektiren link"): zip ekli mail de
//    execution@ kutusuna ulasmadi (kurumsal sunucu .zip ekini karantinaya aliyor). Zip artik OZEL depoya
//    ("veri-yedekleri", politika yok) yuklenir, mailde ek YOK; "Yedegi indir" dugmesi Ayarlar > Yedekler sayfasina
//    gider (yalniz super admin; imzali 2 dk link edge "yedek-indir"). Depoya yuklenemezse eski yol: zip ek olarak
//    gider + uyari. Depodaki zip'ler SAKLAMA_GUN gun saklanir, sonra silinir (kayit + dosya listesi kalir).
//  - TEST MAILI (26.10.2026): govdede {"test_maili": true} -> 20 saatlik tekrar korumasi
//    ATLANIR, KISISEL_ALICI'ya (sirket adreslerine DEGIL) "[TEST]" konulu tam mail gider (zip depoda "test/" altinda), yedek_kayitlari'na
//    durum='test' yazilir (gece yedeginin tekrar korumasina SAYILMAZ). Kotuye kullanim
//    korumasi: son 24 saatte en fazla TEST_GUNLUK_SINIR test maili (migration 20261026031500).
//  - KULLANICI LISTESI (05.10.2026): pakete "_kullanicilar" eklenir (kimlik,
//    e-posta, tarihler; SIFRE YOK) - yeni projede ayni kimlikle yeniden
//    olusturmak icin (docs/felaket-kurtarma.md).
//
//  - CAGRI ANAHTARI (13.11.2026, guvenlik incelemesi): anon anahtar herkese acik oldugu icin {"deneme": true} sinirsiz
//    cagrilip butun tablolar + storage envanteri + geri yukleme testi tekrar tekrar calistirilabiliyordu. Artik HER cagri
//    "x-cron-anahtar" basligi ister: deger Vault'ta (yedek_cron_anahtari, migration 20261113200000), pg_cron gonderir,
//    edge public.yedek_cron_anahtari_dogrula() ile dogrular. Gecersiz / yoksa HICBIR SEY okumadan 401. Elle deneme /
//    test SQL'den ayni basligi Vault'tan okuyarak yapilir (docs/felaket-kurtarma.md). Dogrulama fonksiyonu
//    calismazsa (or. migration yok): deneme / test REDDEDILIR, gece yedegi 20 saat kilidiyle DEVAM eder (yedek oncelikli).
//
// depositors ve contact_messages tablolari BASKA bir projeye ait - bilerek
// yedege dahil edilmez (bkz. CLAUDE.md).
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Kisisel adres: TEST maili HER ZAMAN buraya gider (sirket adreslerine test dusmez).
// 13.11.2026: koddaki kisisel varsayilan kaldirildi; secret yoksa bos (test maili gonderilemez, hata).
const KISISEL_ALICI = (Deno.env.get("GERI_BILDIRIM_ALICI") || "").trim();
// Gece yedeginin alicilari (26.10.2026): secret YEDEK_ALICILARI (virgulle). Yoksa / gecerli
// adres yoksa KISISEL_ALICI. GERI_BILDIRIM_ALICI'yi degistirmek Sorun Bildir maillerini de
// tasirdi; o yuzden ayri secret.
const EPOSTA_DESENI = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const YEDEK_ALICILARI = (() => {
  const liste = (Deno.env.get("YEDEK_ALICILARI") || "").split(",").map((a) => a.trim()).filter((a) => EPOSTA_DESENI.test(a));
  return liste.length ? [...new Set(liste)] : KISISEL_ALICI ? [KISISEL_ALICI] : [];
})();

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
  // Ic piyasa fiyat bilgilendirme formu (11.10.2026)
  "ic_fiyat_kalemleri",
  "ic_fiyat_formlari",
  // Ic piyasa musteri / is emri / sevk (12.10.2026)
  "ic_musteriler",
  "ic_is_emirleri",
  "ic_sevkler",
  // Ic piyasa bildirim kutusu (Parca 2, 12.10.2026)
  "ic_bildirimler",
  // Proforma olusturucu - musteri kartlari / urun kutuphanesi (17.10.2026)
  "ihracat_musterileri",
  "ihracat_urunleri",
  // Kayitli proformalar (03.11.2026; taslak jsonb = ekranin tamami)
  "proformalar",
  // DBA otomatik yukleme - kantar cihazlari (anahtarin SADECE SHA-256 ozeti) ve belge kayitlari (20.10.2026)
  "kantar_cihazlari",
  "dba_otomatik_kayitlari",
  // Satin alma talepleri (26.10.2026; departman token'lari dahil)
  "satin_alma_departmanlari",
  "satin_alma_listeleri",
  "satin_alma_kalemleri",
  // Daha once siparis verilen urunler (28.10.2026; gonderilen formlardan otomatik)
  "satin_alma_urunleri",
  // Ic piyasa ALIS: tedarikciler, alis siparisleri, teslim alinan araclar (30.10.2026)
  "ic_tedarikciler",
  "ic_alis_siparisleri",
  "ic_alis_teslimler",
  // DIIB takibi: belgeler, ihracat satirlari, fatura bolunmeleri (04.11.2026)
  "diib_belgeleri",
  "diib_ihracatlari",
  "diib_dosya_bolunmeleri",
  // Ic piyasa siparisler arasi tonaj devri (04.11.2026)
  "ic_is_emri_devirleri",
  // PAZAR (UNEX Satis) CRM: firmalar, yetkililer, fuar katilimlari, ice aktarma kaydi (10.11.2026)
  "pazar_firmalar",
  "pazar_kisiler",
  "pazar_fuar_katilimlari",
  "pazar_ice_aktarimlari",
  // PAZAR gorusmeleri, gunluk gorevler (token dahil), gunluk mail kaydi (10.11.2026, Dalga 3.3/3.4)
  "pazar_temaslar",
  "pazar_gorevler",
  "pazar_gorev_gonderimleri",
  // PAZAR satis ekibi (gorev alanlar) + arsivden tespit edilen musteri cevaplari (10.11.2026, 3.3b / 3.5)
  "pazar_ekip",
  "pazar_gelenler",
  // 13.11.2026 kontrol: yedekte OLMAYAN is tablolari eklendi (kullanici: "gerekli kontrolleri sagla").
  // Siparis defteri, on odemeler, yukleme plani (Excel aktarimlari dahil)
  "siparis_defteri",
  "siparis_defteri_aktarimlari",
  "siparis_on_odemeler",
  "sevkiyat_plani",
  "sevkiyat_plani_aktarimlari",
  // Odeme takibi (tahsilat Excel'i + musteri hatirlatmalari)
  "odeme_excel_yuklemeleri",
  "odeme_hatirlatmalari",
  // Navlun bildirimi (acente mailleri, okunan teklifler)
  "navlun_acenteler",
  "navlun_mesajlari",
  "navlun_teklifleri",
  // Fatura talimati onayi, konsimento hatirlatma
  "fatura_talimati_onaylari",
  "konsimento_hatirlatmalari",
  // Rapor gonderim kayitlari (hangi rapor kime ne zaman gitti)
  "rapor_gonderimleri",
  "ic_gunluk_rapor_gonderimleri",
  "diib_rapor_gonderimleri",
  "vgm_rapor_gonderimleri",
  "siparis_rapor_gonderimleri",
  "navlun_tablosu_gonderimleri",
];

// "id" kolonu OLMAYAN ayar tablolari: pakete "_" onekiyle girer
// (ornek "_ic_piyasa_ayarlari"). Geri yukleme testi satirlari id ile
// eslestirdigi icin bunlari test disi tutar; veri yine yedektedir.
// Deger = sayfalama sirasi.
const AYAR_TABLOLARI: Record<string, string> = {
  ic_piyasa_ayarlari: "company_id.asc",
  proforma_ayarlari: "company_id.asc", // Proforma sablon metinleri (17.10.2026)
  // Ayarlar > Rapor Alicilari (13.11.2026)
  rapor_alicilari: "company_id.asc,rapor.asc",
  rapor_adres_defteri: "company_id.asc,eposta.asc",
};

// Denetim kayitlari: sadece son N gun (kayan pencere).
const DENETIM_TABLOSU = "denetim_kayitlari";
const DENETIM_GUN = 7;

const SAYFA_BOYUTU = 1000;
// Ek .zip olarak gider (13.11.2026). Sinir SIKISTIRILMIS boyuta uygulanir: kurumsal posta sunuculari ~10 MB ustu
// maili (base64 ile ~%33 buyur) reddedebiliyor; 6 MB zip ~8 MB mail eder.
const MAKS_EK_BAYT = 6 * 1024 * 1024;
// 13.11.2026: zip mail eki yerine ozel depoda (bkz. ust aciklama).
const YEDEK_KOVASI = "veri-yedekleri";
const SAKLAMA_GUN = 30;
const YEDEKLER_SAYFASI = "https://ihracatasistanim.com/ayarlar/yedekler";
// Ayni gun icinde ikinci bir yedek maili gonderilmez.
const TEKRAR_BEKLEME_SAAT = 20;
// Test maili: son 24 saatte en fazla bu kadar (anon anahtarla cagrilabildigi icin).
const TEST_GUNLUK_SINIR = 3;

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

/** Son 24 saatte gonderilen test maili sayisi (okunamazsa sinir dolu sayilir: test, yedek degil). */
async function sonGunTestSayisi(): Promise<number> {
  const esik = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/yedek_kayitlari?select=id&durum=eq.test&created_at=gte.${encodeURIComponent(esik)}`, { headers: servisBasliklari });
  if (!res.ok) return TEST_GUNLUK_SINIR;
  return ((await res.json()) as unknown[]).length;
}

/** Zip'i ozel depoya yukler (ayni yol varsa ustune yazar). Basarisizsa hata metni doner. */
async function depoyaYukle(yol: string, icerik: Uint8Array): Promise<string | null> {
  try {
    const res = await geciciHatadaTekrarla(() =>
      fetch(`${SUPABASE_URL}/storage/v1/object/${YEDEK_KOVASI}/${yol}`, {
        method: "POST",
        headers: { ...servisBasliklari, "Content-Type": "application/zip", "x-upsert": "true" },
        body: icerik as unknown as BodyInit,
      })
    );
    if (res.ok) return null;
    return `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** SAKLAMA_GUN'den eski zip'leri depodan siler, kaydin dosya_yolu'nu bosaltir. Hata yedegi durdurmaz (uyari doner). */
async function eskiYedekleriTemizle(): Promise<string | null> {
  try {
    const esik = new Date(Date.now() - SAKLAMA_GUN * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/yedek_kayitlari?select=id,dosya_yolu&dosya_yolu=not.is.null&created_at=lt.${encodeURIComponent(esik)}&limit=100`,
      { headers: servisBasliklari }
    );
    if (!res.ok) return `Eski yedekler okunamadı (HTTP ${res.status}).`;
    const eski = (await res.json()) as { id: string; dosya_yolu: string }[];
    if (!eski.length) return null;
    const sil = await fetch(`${SUPABASE_URL}/storage/v1/object/${YEDEK_KOVASI}`, {
      method: "DELETE",
      headers: { ...servisBasliklari, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: eski.map((e) => e.dosya_yolu) }),
    });
    if (!sil.ok) return `Eski yedek dosyaları silinemedi (HTTP ${sil.status}).`;
    const g = await fetch(`${SUPABASE_URL}/rest/v1/yedek_kayitlari?id=in.(${eski.map((e) => e.id).join(",")})`, {
      method: "PATCH",
      headers: { ...servisBasliklari, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ dosya_yolu: null }),
    });
    return g.ok ? null : `Eski yedek kayıtları güncellenemedi (HTTP ${g.status}).`;
  } catch (e) {
    return `Eski yedek temizliği: ${e instanceof Error ? e.message : String(e)}`;
  }
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

/** Service-role RPC cagrisi. tekrar=true: 5xx / ag hatasinda tekrar dener (okuma). tekrar=false: TEKRAR YOK
 * (agir yazan geri yukleme testi - zaman asimini tekrar denemek veritabanini kilitler, 17.11.2026). */
async function rpc(ad: string, govde: unknown, tekrar = true): Promise<unknown> {
  const istek = () =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
      method: "POST",
      headers: { ...servisBasliklari, "Content-Type": "application/json" },
      body: JSON.stringify(govde),
    });
  const res = tekrar ? await geciciHatadaTekrarla(istek) : await istek();
  if (!res.ok) throw new Error(`${ad} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

type GeriYuklemeSonucu = {
  tablo_sayisi: number;
  yuklenemeyen: number;
  birebir: number;
  bag_sorunlari: { bag: string; kirik: number }[];
  tablolar: { tablo: string; durum: string; satir?: number; farkli?: number; canlida_yok?: number; hata?: string }[];
};

/** Geri yukleme testi PARCALI (10.11.2026): tek RPC'de tum paket (Pazar fuar aktarimi + 7 gunluk
 * denetim kayitlari ile ~10 MB) PostgREST'in 8 sn statement_timeout sinirina takiliyordu.
 * Bag kontrolu yapilan tablolar (yedek_geri_yukleme_testi icindeki bag listesi) AYNI parcada,
 * diger her tablo kendi parcasinda test edilir; sonuclar birlestirilir. Bir parca hata verirse
 * o parcanin tablolari YUKLENEMEDI sayilir (test durmaz). Fonksiyonun kendisi degismedi. */
const BAG_TABLOLARI = ["ihracat_dosyalari", "rezervasyonlar", "konteynerler", "dosya_evraklari", "acente_teklifleri", "acenteler", "ana_siparisler", "kullanici_rolleri", "companies"];
/** Geri yukleme testine GIRMEYEN tablolar (yedege girer). 17.11.2026: denetim kaydi buyuk + yalniz 7 gunluk; test
 * zaman asimina dusup veritabanini kilitledi. */
const GERI_YUKLEME_DISI = new Set<string>([DENETIM_TABLOSU]);
/** Testin toplam sure siniri (edge 150 sn; oncesinde okuma + zip + yukleme + mail var). */
const GERI_YUKLEME_SURE_MS = 100_000;
async function geriYuklemeTestiParcali(yedek: Record<string, unknown>): Promise<GeriYuklemeSonucu> {
  const baslangic = Date.now();
  const tablolar = Object.keys(yedek).filter((t) => !t.startsWith("_") && !GERI_YUKLEME_DISI.has(t));
  const bagParcasi = tablolar.filter((t) => BAG_TABLOLARI.includes(t));
  const parcalar = [bagParcasi, ...tablolar.filter((t) => !BAG_TABLOLARI.includes(t)).map((t) => [t])].filter((p) => p.length);
  const toplam: GeriYuklemeSonucu = { tablo_sayisi: 0, yuklenemeyen: 0, birebir: 0, bag_sorunlari: [], tablolar: [] };
  for (const parca of parcalar) {
    if (Date.now() - baslangic > GERI_YUKLEME_SURE_MS) {
      // Sure doldu: kalan parcalar denenmez (uyari olarak mailde gorunur, fonksiyon cokmez)
      for (const t of parca) toplam.tablolar.push({ tablo: t, durum: "YUKLENEMEDI", hata: "atlandı: test süresi doldu" });
      toplam.tablo_sayisi += parca.length;
      toplam.yuklenemeyen += parca.length;
      continue;
    }
    const altPaket: Record<string, unknown> = {};
    for (const t of parca) altPaket[t] = yedek[t];
    try {
      const s = (await rpc("yedek_geri_yukleme_testi", { paket: altPaket }, false)) as GeriYuklemeSonucu;
      toplam.tablo_sayisi += s.tablo_sayisi;
      toplam.yuklenemeyen += s.yuklenemeyen;
      toplam.birebir += s.birebir;
      toplam.bag_sorunlari.push(...s.bag_sorunlari);
      toplam.tablolar.push(...s.tablolar);
    } catch (e) {
      const hata = e instanceof Error ? e.message : String(e);
      for (const t of parca) toplam.tablolar.push({ tablo: t, durum: "YUKLENEMEDI", hata });
      toplam.tablo_sayisi += parca.length;
      toplam.yuklenemeyen += parca.length;
    }
  }
  return toplam;
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

function mbYaz(bayt: number): string {
  return `${(bayt / (1024 * 1024)).toFixed(2)} MB`;
}

/** x-cron-anahtar dogrulamasi: true / false; null = dogrulanamadi (fonksiyon yok / ag hatasi). Anahtar loglanmaz. */
async function cronAnahtariGecerli(anahtar: string): Promise<boolean | null> {
  if (!anahtar) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/yedek_cron_anahtari_dogrula`, {
      method: "POST",
      headers: { ...servisBasliklari, "Content-Type": "application/json" },
      body: JSON.stringify({ p_anahtar: anahtar }),
    });
    if (!res.ok) {
      console.error("yedek_cron_anahtari_dogrula:", res.status);
      await res.body?.cancel();
      return null;
    }
    return (await res.json()) === true;
  } catch (e) {
    console.error("yedek_cron_anahtari_dogrula:", e instanceof Error ? e.message : e);
    return null;
  }
}

function jsonCevap(veri: unknown, status = 200): Response {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  let deneme = false;
  let testMaili = false;
  try {
    const govde = await req.json();
    deneme = govde?.deneme === true;
    testMaili = !deneme && govde?.test_maili === true;
  } catch {
    // Govde yok / JSON degil -> normal (gercek) calisma
  }

  // Cagri anahtari (13.11.2026): veri OKUNMADAN once
  const anahtarDurumu = await cronAnahtariGecerli((req.headers.get("x-cron-anahtar") || "").trim());
  if (anahtarDurumu !== true) {
    const geceYedegi = !deneme && !testMaili;
    if (!(anahtarDurumu === null && geceYedegi && req.headers.get("x-cron-anahtar"))) {
      return jsonCevap({ basarili: false, error: "Yetkisiz çağrı." }, 401);
    }
    console.error("yedekleme-gonder: anahtar dogrulanamadi; gece yedegi 20 saat kilidiyle devam ediyor");
  }

  try {
    if (!deneme) {
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY ortam değişkeni ayarlanmamış.");
      if (testMaili) {
        if ((await sonGunTestSayisi()) >= TEST_GUNLUK_SINIR) {
          return jsonCevap({ basarili: false, error: `Son 24 saatte en fazla ${TEST_GUNLUK_SINIR} test maili gönderilebilir.` }, 429);
        }
      } else if (await yakindaYedekGonderildiMi()) {
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

    for (const [tablo, siralama] of Object.entries(AYAR_TABLOLARI)) {
      try {
        const satirlar = await tabloyuSayfaliCek(tablo, "", siralama);
        yedek[`_${tablo}`] = satirlar;
        tabloSayilari.push({ tablo, adet: satirlar.length, not: "ayar" });
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
    // Sevkiyat belgeleri kovasi: belge turu bazinda dokum (28.10.2026)
    const belgeTurleri: Record<string, { dosya: number; bayt: number }> = {};
    for (const d of storageDosyalari) {
      const o = (bucketOzeti[d.bucket] ||= { dosya: 0, bayt: 0 });
      o.dosya += 1;
      o.bayt += d.bayt || 0;
      if (d.bucket === "konsimento-talimatlari") {
        const t = (belgeTurleri[sevkiyatBelgeTuru(d.yol)] ||= { dosya: 0, bayt: 0 });
        t.dosya += 1;
        t.bayt += d.bayt || 0;
      }
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

    // ---- Giris kullanicilari (sifresiz liste) ----
    let kullanicilar: unknown = null;
    try {
      kullanicilar = await rpc("yedek_kullanici_listesi", {});
    } catch (e) {
      uyarilar.push(`Kullanıcı listesi alınamadı: ${e instanceof Error ? e.message : String(e)}`);
    }

    const simdi = new Date();
    const tarih = simdi.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
    const paket = {
      _bilgi: {
        olusturulma: simdi.toISOString(),
        surum: 3,
        not: `Tablolar tam yedektir; ${DENETIM_TABLOSU} sadece son ${DENETIM_GUN} günü içerir. _storage_dosya_listesi sadece DOSYA LİSTESİDİR - PDF dosyalarının kendisi bu yedekte YOKTUR, Supabase Storage'da durur. _kullanicilar giriş kullanıcılarının kimlik ve e-postalarıdır (şifre YOK); geri yükleme adımları: repodaki docs/felaket-kurtarma.md.`,
        uyarilar,
      },
      ...yedek,
      _kullanicilar: kullanicilar,
      _storage_dosya_listesi: storageDosyalari,
    };

    // ---- Geri yukleme testi: paket GERCEKTEN yuklenebiliyor mu? ----
    let geriYukleme: GeriYuklemeSonucu | null = null;
    try {
      geriYukleme = await geriYuklemeTestiParcali(yedek);
      if (geriYukleme.yuklenemeyen > 0) {
        const adlar = geriYukleme.tablolar.filter((t) => t.durum === "YUKLENEMEDI").map((t) => `${t.tablo} (${t.hata})`);
        uyarilar.push(`Geri yükleme testi: ${geriYukleme.yuklenemeyen} tablo yüklenemedi: ${adlar.join("; ")}`);
      }
      const farkli = geriYukleme.tablolar.filter((t) => t.durum === "fark_var");
      if (farkli.length > 0) {
        uyarilar.push(
          `Geri yükleme testi: ${farkli.map((t) => `${t.tablo} (${(t.farkli || 0) + (t.canlida_yok || 0)} satır)`).join(", ")} canlıdan farklı. ` +
            "Yedek alınırken o kayıtlar değiştirildiyse normaldir; tekrarlarsa incelenmeli."
        );
      }
      if (geriYukleme.bag_sorunlari.length > 0) {
        uyarilar.push(`Geri yükleme testi: kırık bağ: ${geriYukleme.bag_sorunlari.map((b) => `${b.bag} (${b.kirik})`).join(", ")}`);
      }
    } catch (e) {
      uyarilar.push(`Geri yükleme testi çalıştırılamadı: ${e instanceof Error ? e.message : String(e)}`);
    }
    const jsonIcerik = JSON.stringify(paket, null, 2);
    const jsonBayt = new TextEncoder().encode(jsonIcerik).length;
    const jsonAdi = `ihracat-ai-yedek-${tarih.replace(/\./g, "-")}.json`;
    const zip = new JSZip();
    zip.file(jsonAdi, jsonIcerik);
    const zipIcerik = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const zipBayt = zipIcerik.length;
    const ekAdi = jsonAdi.replace(/\.json$/, ".zip");

    // 13.11.2026: zip ozel depoya (mail eki karantinaya takiliyordu). Deneme modunda hicbir sey yazilmaz.
    let dosyaYolu: string | null = null;
    let ekSigiyor = false;
    if (!deneme) {
      const yol = testMaili
        ? `test/${ekAdi.replace(/\.zip$/, "")}-${simdi.toISOString().slice(11, 19).replace(/:/g, "")}.zip`
        : `${simdi.getUTCFullYear()}/${ekAdi}`;
      const yukleHata = await depoyaYukle(yol, zipIcerik);
      if (!yukleHata) {
        dosyaYolu = yol;
        const temizlik = testMaili ? null : await eskiYedekleriTemizle();
        if (temizlik) uyarilar.push(temizlik);
      } else {
        // Yedek kaybolmasin: eski yol (mail eki) - karantinaya takilabilir, uyari yazilir
        ekSigiyor = zipBayt <= MAKS_EK_BAYT;
        uyarilar.push(
          `Yedek dosyası depoya yüklenemedi (${yukleHata}); ` +
            (ekSigiyor ? "mail eki olarak gönderildi (şirket posta sunucusu eki engelleyebilir)." : `eke de sığmadı (${mbYaz(zipBayt)}).`)
        );
      }
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
      belgeTurleri,
      kapasite: kapasite.map((k) => ({ ...k, durum: kapasiteDurumu(k.oran) })),
      kullaniciSayisi: Array.isArray(kullanicilar) ? kullanicilar.length : null,
      geriYukleme: geriYukleme ? { tablo_sayisi: geriYukleme.tablo_sayisi, birebir: geriYukleme.birebir, yuklenemeyen: geriYukleme.yuklenemeyen, bag_sorunlari: geriYukleme.bag_sorunlari } : null,
      uyarilar,
    };

    const saat = simdi.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
    const mailGirdisi = {
      tarih,
      saat,
      ekSigiyor,
      depoda: !!dosyaYolu || deneme,
      indirmeLinki: YEDEKLER_SAYFASI,
      saklamaGun: SAKLAMA_GUN,
      ekAdi,
      ekBayt: zipBayt,
      jsonAdi,
      jsonBayt,
      toplamKayit,
      tablolar: tabloSayilari,
      kapasite: kapasite.map((k) => ({ ...k, durum: kapasiteDurumu(k.oran) })),
      bucketlar: bucketOzeti,
      belgeTurleri,
      geriYukleme: geriYukleme ? { tablo_sayisi: geriYukleme.tablo_sayisi, birebir: geriYukleme.birebir, bag_sorunlari: geriYukleme.bag_sorunlari } : null,
      uyarilar,
      kullaniciSayisi: Array.isArray(kullanicilar) ? kullanicilar.length : null,
      test: testMaili,
      gercekAlicilar: YEDEK_ALICILARI,
    };
    const html = yedekMailHtml(mailGirdisi);

    if (deneme) return jsonCevap({ ...ozet, html });

    // ---- Mail ----
    const mailGovdesi: Record<string, unknown> = {
      from: "İhracat AI <bildirim@ihracatasistanim.com>",
      to: testMaili ? [KISISEL_ALICI] : YEDEK_ALICILARI,
      subject: `${testMaili ? "[TEST] " : ""}${yedekMailKonusu(mailGirdisi)}`,
      html,
    };
    if (ekSigiyor) {
      // Yalniz depoya yuklenemediyse (yedek kaybolmasin)
      mailGovdesi.attachments = [
        {
          filename: ekAdi,
          content: await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 9 } }),
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
      durum: testMaili ? "test" : durum,
      toplam_kayit: toplamKayit,
      tablo_sayisi: tabloSayilari.length,
      json_bayt: jsonBayt,
      storage_dosya_sayisi: storageDosyalari.length,
      uyarilar,
      dosya_yolu: dosyaYolu,
      dosya_bayt: dosyaYolu ? zipBayt : null,
    });

    return jsonCevap({ ...ozet, test: testMaili, aliciSayisi: testMaili ? 1 : YEDEK_ALICILARI.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("Yedekleme hatasi:", message);
    if (!deneme) await calismayiKaydet({ durum: "hatali", hata: testMaili ? `TEST MAILI: ${message}` : message });
    return jsonCevap({ basarili: false, error: message }, 500);
  }
});
