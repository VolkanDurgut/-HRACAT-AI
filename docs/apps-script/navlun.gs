/**
 * NAVLUN BILDIRIMI - navlun yazismalarini okuma (10.11.2026)
 * ------------------------------------------------------------------
 * KURULUM YERI: Pazar betiginin (pazar-gelen.gs) bulundugu AYNI proje (arsiv Gmail hesabi,
 * unex.execution.arsiv@gmail.com). Projeye "+" -> Komut dosyasi -> adi "navlun" -> bu dosyanin icerigi.
 * ANAHTAR ve ANON betik ozellikleri Pazar ile ortaktir; yeni gizli bilgi gerekmez.
 *
 * PDF / gorsel teklifler icin: Sol menu "Hizmetler" (Services) "+" -> "Drive API" -> Ekle.
 * (Eklenmezse betik yine calisir; eki okunamayan teklif sayfadaki "Okunamayanlar" listesine duser.)
 *
 * Calistirma:
 *   1) navlunGecmis  : 26.10.2026'dan bugune kadarki yazismalari bir kez okutur. "BITTI" yazana kadar
 *                      tekrar calistirin (her calismada ~20 yazisma; ayni mail iki kez kaydedilmez).
 *   2) navlunKur     : 15 dakikalik tetikleyiciyi kurar (navlunTara).
 *   Kaldirmak icin navlunKaldir.
 *   TAM YENIDEN OKUMA (11.11.2026, free time / transit icin bir kez): Proje Ayarlari > Betik Ozellikleri'nde
 *   NAVLUN_GECMIS_I satirini silin, navlunGecmis'i "BITTI" yazana kadar tekrar calistirin (kayitlar yenilenir,
 *   cift kayit olmaz). Sonrasinda sunucu saklanan metinden yeniden okuyabilir; bu adim tekrar gerekmez.
 *
 * Ne gonderilir: konusu "NAVLUN" gecen maillerin gonderen, konu, tarih, Message-ID ve alintisiz metni;
 * fiyat metinde yoksa ekteki PDF'in (yoksa en buyuk gorselin) Google Drive OCR metni. Okuma ve
 * siniflama sunucuda (edge "navlun-bildirimi", kural tabanli). Gecici OCR belgesi hemen silinir.
 *
 * Gizli bilgi bu dosyada YOKTUR (repo herkese acik).
 */

var NAVLUN_URL = 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/navlun-bildirimi';
var NAVLUN_ILK_TARIH = '2026/09/01';   // arsivin tamami (11.11.2026: 26.10 oncesi Beyrut / Cape Town eksikti)
var NAVLUN_KENDI = /@(unex\.com\.tr|ihracatasistanim\.com)$/i;
var NAVLUN_PAKET = 20;
var NAVLUN_SURE_MS = 4.5 * 60 * 1000;   // Apps Script 6 dk siniri; guvenli pay

function navlunKur() {
  navlunKaldir();
  ScriptApp.newTrigger('navlunTara').timeBased().everyMinutes(15).create();
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('NAVLUN_SON')) p.setProperty('NAVLUN_SON', String(Date.now() - 2 * 24 * 3600 * 1000));
  navlunTara();
}

function navlunKaldir() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'navlunTara') ScriptApp.deleteTrigger(t);
  });
}

/** Tetikleyici: son calismadan beri gelen navlun mailleri. */
function navlunTara() {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(5000)) return;
  try {
    var p = PropertiesService.getScriptProperties();
    var son = Number(p.getProperty('NAVLUN_SON') || (Date.now() - 2 * 24 * 3600 * 1000));
    var baslangic = son - 3600 * 1000;   // 1 saat geri tasma: gec indekslenen mail kacmasin
    var konular = GmailApp.search('subject:(navlun OR "rezervasyon talebi") after:' + Math.floor(baslangic / 1000) + ' -in:trash', 0, 100);
    var sonuc = navlunIsle(konular, baslangic);
    p.setProperty('NAVLUN_SON', String(Math.max(sonuc.enYeni, son)));
    console.log(JSON.stringify(sonuc.ozet));
  } finally {
    kilit.releaseLock();
  }
}

/** Tek seferlik gecmis okuma. "BITTI" yazana kadar tekrar calistirin. */
function navlunGecmis() {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(5000)) return;
  try {
    var p = PropertiesService.getScriptProperties();
    var i = Number(p.getProperty('NAVLUN_GECMIS_I') || 0);
    var konular = GmailApp.search('subject:(navlun OR "rezervasyon talebi") after:' + NAVLUN_ILK_TARIH + ' -in:trash', i, 20);
    if (!konular.length) { console.log('BITTI - gecmis okuma tamamlandi.'); return; }
    var sonuc = navlunIsle(konular, 0);
    p.setProperty('NAVLUN_GECMIS_I', String(i + sonuc.islenenKonu));
    console.log('Islenen yazisma: ' + (i + sonuc.islenenKonu) + ' | ' + JSON.stringify(sonuc.ozet) + ' | tekrar calistirin.');
  } finally {
    kilit.releaseLock();
  }
}

function navlunIsle(konular, baslangic) {
  var p = PropertiesService.getScriptProperties();
  var anahtar = p.getProperty('ANAHTAR');
  var anon = p.getProperty('ANON');
  if (!anahtar || !anon) throw new Error('ANAHTAR ve ANON betik ozellikleri girilmeli (Pazar ile ayni).');
  var bas = Date.now();
  var mesajlar = [];
  var enYeni = 0;
  var islenenKonu = 0;
  for (var k = 0; k < konular.length; k++) {
    if (Date.now() - bas > NAVLUN_SURE_MS) break;
    var liste = konular[k].getMessages();
    for (var j = 0; j < liste.length; j++) {
      var m = liste[j];
      var t = m.getDate().getTime();
      if (t < baslangic) continue;
      if (!/navlun|rezervasyon\s*taleb/i.test(m.getSubject() || '')) continue;   // 12.11.2026: rezervasyon talebi de
      mesajlar.push(navlunMesaj(m));
      if (t > enYeni) enYeni = t;
    }
    islenenKonu++;
  }
  var ozet = { gonderilen: mesajlar.length, yeni: 0, guncellenen: 0, okunamadi: 0, atlanan: 0 };
  for (var i = 0; i < mesajlar.length; i += NAVLUN_PAKET) {
    var cevap = UrlFetchApp.fetch(NAVLUN_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + anon, apikey: anon, 'x-pazar-anahtar': anahtar },
      payload: JSON.stringify({ islem: 'kaydet', mesajlar: mesajlar.slice(i, i + NAVLUN_PAKET) }),
      muteHttpExceptions: true,
    });
    if (cevap.getResponseCode() !== 200) {
      // Imleci ilerletme: bir sonraki calismada tekrar denenir (sunucu tekrari Message-ID ile ayiklar)
      throw new Error('Ihracat AI ' + cevap.getResponseCode() + ': ' + cevap.getContentText().slice(0, 200));
    }
    var v = JSON.parse(cevap.getContentText());
    ['yeni', 'guncellenen', 'okunamadi', 'atlanan'].forEach(function (a) { ozet[a] += Number(v[a] || 0); });
  }
  return { enYeni: enYeni, islenenKonu: islenenKonu, ozet: ozet };
}

function navlunMesaj(m) {
  var kimden = navlunAdres(m.getFrom());
  var govde = navlunAlintisiz(m.getPlainBody() || '').slice(0, 8000);
  var r = {
    mesaj_id: m.getHeader('Message-ID') || ('gmail:' + m.getId()),
    gonderen: kimden,
    konu: (m.getSubject() || '').slice(0, 300),
    govde: govde,
    tarih: m.getDate().toISOString(),
  };
  if (kimden && !NAVLUN_KENDI.test(kimden) && navlunEkGerekli(govde)) {
    var ek = navlunEkMetni(m);
    if (ek) { r.ek_metin = ek.metin.slice(0, 12000); r.ek_kaynak = ek.kaynak; }
  }
  return r;
}

/** Fiyat metinde yoksa ve "ekte / asagidaki / teklif" geciyorsa eke bakilir. */
function navlunEkGerekli(govde) {
  var fiyatVar = /(usd|\$)\s*:?\s*\d{2,}|\d{2,}\s*(usd|\$)/i.test(govde);
  return !fiyatVar && /ekte|ekli|aşağıdaki|asagidaki|teklif|attached|below/i.test(govde);
}

function navlunEkMetni(m) {
  var ekler;
  try { ekler = m.getAttachments({ includeInlineImages: true, includeAttachments: true }); } catch (e) { return null; }
  var pdf = ekler.filter(function (a) { return a.getContentType() === 'application/pdf' && a.getSize() < 8 * 1024 * 1024; });
  if (pdf.length) {
    var metin = pdf.slice(0, 2).map(function (a) { return navlunOcr(a.copyBlob()); }).join('\n');
    return metin.trim() ? { metin: metin, kaynak: 'pdf' } : null;
  }
  var gorsel = ekler.filter(function (a) {
    return /^image\/(png|jpe?g)$/i.test(a.getContentType()) && a.getSize() > 15000 && a.getSize() < 4 * 1024 * 1024;
  }).sort(function (a, b) { return b.getSize() - a.getSize(); });
  // En buyuk 3 gorsel sirayla okunur; bizim imzamiz/logomuz atlanir, fiyat icermeyen gorsel gonderilmez.
  for (var i = 0; i < gorsel.length && i < 3; i++) {
    var g = navlunOcr(gorsel[i].copyBlob());
    if (!g.trim() || /unex\.com\.tr|ihracatasistanim/i.test(g)) continue;
    if (/usd|\$|eur|freight|navlun|ta[şs]ıma|rate/i.test(g) && /\d{2,}/.test(g)) return { metin: g, kaynak: 'gorsel' };
  }
  return null;
}

/** Google Drive OCR: gecici Google Doku olusturur, metni alir, belgeyi siler. Drive API yoksa bos doner. */
function navlunOcr(blob) {
  if (typeof Drive === 'undefined') return '';
  var dosya = null;
  try {
    dosya = Drive.Files.create({ name: 'navlun-ocr-gecici', mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'tr', fields: 'id' });
    return DocumentApp.openById(dosya.id).getBody().getText() || '';
  } catch (e) {
    console.log('OCR yapilamadi: ' + e);
    return '';
  } finally {
    if (dosya && dosya.id) { try { Drive.Files.remove(dosya.id); } catch (e2) { /* yok say */ } }
  }
}

function navlunAdres(s) {
  var m = /<([^>]+)>/.exec(s || '');
  var e = (m ? m[1] : s || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

/** Yalniz yeni yazilan kisim (alinti oncesi). */
function navlunAlintisiz(govde) {
  var satirlar = govde.replace(/\r/g, '').split('\n');
  var cikti = [];
  for (var i = 0; i < satirlar.length; i++) {
    var s = satirlar[i];
    if (/^\s*>/.test(s)) break;
    if (/^\s*(On .+wrote:|From:|Gönderen:|Kimden:|-{2,}\s*Original Message|_{8,})/i.test(s)) break;
    cikti.push(s);
  }
  return cikti.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
