/**
 * MAIL ETIKETLEME - arsiv Gmail'indeki mailleri gruplara (UNEX/1..9) ve alt gruplara ayirir (24.11.2026)
 * ------------------------------------------------------------------
 * Kullanici: "Ajanlari egitebilmem icin maillerin gruplandirilmasi gerekiyor. Cok mail birikmis. Her mail kendi
 * grubuna girmeli; is sureci takibi o sekilde yapilabilir. Hatta grup icin bile grup olusturulabilir."
 *
 * KURULUM YERI: Pazar betiginin (Pazar Gelen Cevap) bulundugu AYNI proje (arsiv Gmail hesabi).
 * Projeye "+" -> Komut dosyasi -> adi "etiket" -> bu dosyanin icerigi -> Kaydet. Gizli bilgi / ozellik GEREKMEZ.
 *
 * CALISTIRMA SIRASI:
 *   1) etiketDeneme : HICBIR SEY DEGISTIRMEZ. Etiketsiz son 300 yazismanin hangi gruba girecegini sayar ve
 *                     ornek konularla Yurutme gunlugune yazar. Once bunu calistirip sonuca bakin.
 *   2) etiketGecmis : Etiketsiz TUM yazismalari etiketler. "BITTI" yazana kadar tekrar calistirin
 *                     (her calismada ~4 dakika, birkac yuz yazisma; ayni yazisma iki kez islenmez).
 *   3) etiketKur    : 30 dakikalik tetikleyiciyi kurar (yeni gelen mailler otomatik gruplanir; kota icin seyrek).
 *   Kaldirmak icin etiketKaldir (yalniz tetikleyiciyi siler; etiketler kalir).
 *
 * KURALLAR:
 *   - Yalniz ETIKET eklenir: mail silinmez, arsivlenmez, okundu yapilmaz, gelen kutusundan cikmaz.
 *   - Yalniz HIC etiketi olmayan yazismalar islenir; elle etiketlenmis yazismaya dokunulmaz.
 *   - Her yazisma bir ana grup + bir alt grup alir ("UNEX/2-Booking-Acente/Navlun-Talebi"). Hicbir kurala
 *     uymayan "UNEX/9-Diger/Siniflanmayan"a duser (bos kalan mail olmaz).
 *   - Siniflama konu satiri (RE/FW/Ynt onekleri atilir) ve ilk gondericiye bakar; kurallar asagidaki listede,
 *     yukaridan asagi ILK eslesen kazanir. Yeni bir kalip gerekirse listeye satir eklemek yeter.
 *
 * Gizli bilgi bu dosyada YOKTUR (repo herkese acik).
 */

var ETIKET_KOK = 'UNEX';
var ETIKET_SURE_MS = 4.2 * 60 * 1000;   // Apps Script 6 dk siniri; guvenli pay
var ETIKET_PAKET = 100;

/**
 * Gemi hatti alan adlari (konu bir sey soylemezse "Acente-Yazisma"). Calisilan forwarder / acente alan adlari repoya
 * YAZILMAZ: Proje ayarlari > Komut dosyasi ozellikleri > ACENTE_ALANLARI = "ornek1.com,ornek2.com.tr" (virgulle).
 */
var ETIKET_HAT_ALANLARI = ['msc.com', 'maersk.com', 'cma-cgm.com', 'hlag.com', 'coscoshipping.com.tr', 'oocl.com', 'zim.com', 'evergreen-line.com', 'one-line.com', 'hmm21.com', 'yangming.com'];
function etiketAcenteMi_(gonderen) {
  var alanlar = ETIKET_HAT_ALANLARI.slice();
  try {
    if (typeof PropertiesService !== 'undefined') {
      String(PropertiesService.getScriptProperties().getProperty('ACENTE_ALANLARI') || '').split(',').forEach(function (a) {
        a = a.trim().toLowerCase(); if (a) alanlar.push(a);
      });
    }
  } catch (e) { /* ozellik okunamazsa yalniz hatlar */ }
  var alan = (String(gonderen).split('@')[1] || '').toLowerCase();
  return alanlar.some(function (a) { return alan === a || alan.slice(-(a.length + 1)) === '.' + a; });
}

/**
 * [ana grup, alt grup, konu deseni (ASCII buyuk harfe cevrilmis konuda), gonderen deseni (istege bagli)]
 * Sira onemli: ozel ifadeler (BOOKING CONFIRMATION, PAYMENT) genel olanlardan (VGM, SHIPPING DOCUMENTS) once gelir.
 */
var ETIKET_KURALLARI = [
  // Reklam / kampanya (24.11.2026 deneme: "Black Friday offer" teklif sanilmasin)
  ['9-Diger', 'Bildirim-Reklam', /BLACK FRIDAY|CYBER MONDAY|% ?OFF\b|\bSAVE (UP TO )?[0-9]+ ?%|DISCOUNT|INDIRIM|KAMPANYA|UNSUBSCRIBE/, null],
  // Kesin ifadeler
  ['2-Booking-Acente', 'Booking', /BOOKING CONFIRMATION|BOOKING ONAY|REZERVASYON ONAY/, null],
  ['8-Gumruk', 'Fatura-Beyanname-Talimati', /FATURA VE BEYANNAME TALIMATI/, null],
  ['5-Odeme-Banka', 'Musteri-Odeme', /PAYMENT|ODEME|\bSWIFT\b|REMITTANCE|\bTT COPY\b|\bUSD [0-9.,]+\/?-? ON\b|AVANS|DEKONT/, null],
  ['5-Odeme-Banka', 'Acente-Fatura', /\*+ ?INVOICE ?\*+|FATURA (BILDIRIMI|ITIRAZI)|DEBIT NOTE|CREDIT NOTE|NAVLUN FATURA|LOCAL CHARGE/, null],
  ['4-Evrak', 'Draft-Onay', /DRAFT APPROVAL|DRAFT EVRAK/, null],
  ['4-Evrak', 'Sevkiyat-Evraklari', /SHIPPING DOCUMENTS|SEVKIYAT EVRAKLARI|ORIGINAL DOCUMENTS|ORIJINAL EVRAK|\bDHL\b|COURIER|KURYE/, null],
  ['5-Odeme-Banka', 'Acente-Fatura', /CARI (BILGI|HESAP|EKSTRE)|EKSTRE|MUTABAKAT/, null],
  // Konsimento
  ['3-Konsimento-DraftBL', 'BL-Kopya-Telex', /COPY OF BILL OF LADING|TELEX|SEAWAY|SURRENDER|ORIGINAL B\/?L|EXPRESS RELEASE/, null],
  ['3-Konsimento-DraftBL', 'Draft-BL', /DRAFT B\/?L|DRAFT BILL|^DRAFT\b|KONSIMENTO|SHIPPING INSTRUCTION|BL TALIMAT/, null],
  ['4-Evrak', 'Sertifika-ECTN', /\bECTN\b|CERTIFICATE|SERTIFIKA|FUMIGATION|FUMIGASYON|PHYTO|FITOSANITER|HEALTH CERT|MENSE|\bCOO\b|ANALIZ/, null],
  // Gumruk
  ['8-Gumruk', 'DIIB', /\bDIIB\b|\bD[12]-[0-9]{4,}|IKINCIL ISLEM/, null],
  ['8-Gumruk', 'Beyanname', /BEYANNAME|GUMRUK BEYAN|GUMRUK MUSAVIR|CUSTOMS DECLARATION|CUSTOMS CLEARANCE/, null],
  // Yukleme / lojistik
  ['7-Yukleme-Lojistik', 'VGM', /\bVGM\b|VERIFIED GROSS/, null],
  ['7-Yukleme-Lojistik', 'TMO-Irsaliye', /\bTMO\b|IRSALIYE/, null],
  ['7-Yukleme-Lojistik', 'Ekipman-Konteyner', /EKIPMAN|ARDIYESIZ|CEKILMEYEN KONTEYNER|KONTEYNER CEKIM|EQUIPMENT|EMPTY RELEASE/, null],
  ['7-Yukleme-Lojistik', 'Dokme-Gemi', /^M\/?V |DISCHARG|IN BULK|TAHLIYE/, null],
  // Gemi / ETA
  ['6-Gemi-ETA', 'ETD-ETA', /ETD-ETA|\bETA\b|ARRIVAL NOTICE|TAHMINI VARIS|VARIS (BILDIRIM|TARIH)|ROLL ?OVER|GECIKME|DELAY/, null],
  ['6-Gemi-ETA', 'Gemi-Programi-Cutoff', /GEMI PROGRAM|CUT ?OFF|GEMI DEGISIKLIGI|VESSEL SCHEDULE|SAILING|\bW[0-9]{2}\b|SERVISI|SURCHARGE|BILGILENDIRME/, null],
  // Booking / navlun
  ['2-Booking-Acente', 'Navlun-Talebi', /NAVLUN|FREIGHT RATE|FREIGHT QUOT|RATE REQUEST/, null],
  ['2-Booking-Acente', 'Booking', /BOOKING|REZERVASYON|^[0-9]{4}\/[0-9]{3,5} \/\/|^HRZ[0-9]|\bBKG\b/, null],
  // Siparis / proforma
  ['1-Siparis-Proforma', 'Siparis-Formu', /SIPARIS BILDIRIM FORMU|SIPARIS FORMU/, null],
  ['1-Siparis-Proforma', 'Sozlesme-Proforma', /BUS+INES+ AGREEMENT|PROFORMA|CONTRACT|\bPO[0-9]|PURCHASE ORDER|\bORDER\b|BUSINESS CONFIRMATION/, null],
  ['1-Siparis-Proforma', 'Musteri-Teklif', /SUPPLY|OFFER|QUOTATION|PRICE LIST|FIYAT TEKLIF|INQUIRY|ENQUIRY/, null],
  // Diger
  ['9-Diger', 'Duyuru-Bulten', /NEWSLETTER|BULTEN|WEBINAR|\bEVENT\b|FUAR|\bEXPO\b|DAVET|INVITATION|\bTIMES\b|ANNOUNCEMENT|DUYURU/, null],
  ['4-Evrak', 'Evrak-Diger', /DOCUMENT|EVRAK|BELGE/, null],
  ['9-Diger', 'Test', /\bTEST\b|DENEME/, null],
  ['9-Diger', 'Bildirim-Reklam', /GUVENLIK KODU|SECURITY CODE|VERIFICATION CODE|HESAB|ACCOUNT|REGISTRATION|PASSWORD|SIFRE/, null],
  ['9-Diger', 'Bildirim-Reklam', null, /no-?reply|accountprotection|security|newsletter|marketing|info@|news@/i],
  // Konu bir sey soylemiyor ama gonderen gemi hatti / forwarder
  ['2-Booking-Acente', 'Acente-Yazisma', null, { test: function (g) { return etiketAcenteMi_(g); } }],
];

/** Turkce harfleri ASCII'ye cevirir, buyuk harf yapar, RE/FW/Ynt oneklerini ve fazla boslugu atar. */
function etiketKonuNormal(konu) {
  var s = String(konu || '');
  var tr = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U', 'â': 'a', 'î': 'i', 'û': 'u' };
  s = s.replace(/[çÇğĞıİöÖşŞüÜâîû]/g, function (h) { return tr[h] || h; }).toUpperCase();
  s = s.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  for (var i = 0; i < 6; i++) {
    var y = s.replace(/^(RE|FW|FWD|YNT|YANIT|ILT|ILET|TR|AW|WG|RV|AUTOMATIC REPLY|OTOMATIK YANIT|OUT OF OFFICE)\s*:\s*/i, '');
    if (y === s) break;
    s = y;
  }
  return s;
}

/**
 * Konu + gonderen -> { ana, alt }. Saf fonksiyon (testlerde de calisir).
 * Unex AI'nin kendi mailleri: [Rapor] -> 9-Diger/Unex-AI-Rapor; [Hatirlatma]/[Onemli] icerigine gore ilgili gruba
 * (or. "[Onemli] FATURA VE BEYANNAME TALIMATI" -> 8-Gumruk); hicbirine uymazsa 9-Diger/Unex-AI.
 */
function etiketBul(konu, gonderen) {
  var k = etiketKonuNormal(konu);
  var g = String(gonderen || '').toLowerCase();
  var m = /<([^>]+)>/.exec(g);
  if (m) g = m[1];
  g = g.trim();
  var etiket = /^\[(?:TEST|DENEME)\] /.test(k) ? k.replace(/^\[(?:TEST|DENEME)\] /, '') : k;
  var ai = /^\[(RAPOR|HATIRLATMA|ONEMLI)\] ?/.exec(etiket);
  var unexAi = !!ai || /@ihracatasistanim\.com$/.test(g);
  if (ai && ai[1] === 'RAPOR') return { ana: '9-Diger', alt: 'Unex-AI-Rapor' };
  if (ai) k = etiket.slice(ai[0].length);
  for (var i = 0; i < ETIKET_KURALLARI.length; i++) {
    var r = ETIKET_KURALLARI[i];
    if (unexAi && !r[2]) continue;   // Unex AI mailinde gonderen kurallari (noreply, acente) gecersiz
    var konuUyar = r[2] ? r[2].test(k) : true;
    var gonUyar = r[3] ? r[3].test(g) : true;
    if ((r[2] || r[3]) && konuUyar && gonUyar) return { ana: r[0], alt: r[1] };
  }
  return unexAi ? { ana: '9-Diger', alt: 'Unex-AI' } : { ana: '9-Diger', alt: 'Siniflanmayan' };
}

var etiketOnbellek_ = {};
function etiketAl_(ad) {
  if (!etiketOnbellek_[ad]) etiketOnbellek_[ad] = GmailApp.getUserLabelByName(ad) || GmailApp.createLabel(ad);
  return etiketOnbellek_[ad];
}

/**
 * Bir yazisma listesini siniflar; uygula=false ise yalniz sayar.
 * 24.11.2026 KOTA: Gmail'in gunluk cagri siniri (arsiv hesabindaki Pazar + navlun betikleri de ayni kotayi kullanir)
 * asildi. Bu surum yazisma basina cagri yapmaz: mesajlar tek cagriyla (getMessagesForThreads) okunur, etiketler
 * grup basina tek cagriyla (addToThreads) eklenir. Liste zaten "etiketsiz" aramasiyla geldigi icin etiket okunmaz.
 * 100 yazisma ~ 2 + grup sayisi cagri (eskisi ~400).
 */
function etiketIsle_(konular, uygula) {
  var gruplar = {};   // tam etiket adi -> [yazisma]
  var sayac = {};
  var ornek = {};
  var mesajlar = konular.length ? GmailApp.getMessagesForThreads(konular) : [];
  for (var i = 0; i < konular.length; i++) {
    var t = konular[i];
    var ilk = (mesajlar[i] || [])[0];
    var konu = ilk ? ilk.getSubject() : '';
    var sonuc = etiketBul(konu, ilk ? ilk.getFrom() : '');
    var anaAd = ETIKET_KOK + '/' + sonuc.ana;
    var anahtar = sonuc.ana + '/' + sonuc.alt;
    sayac[anahtar] = (sayac[anahtar] || 0) + 1;
    if (!ornek[anahtar]) ornek[anahtar] = [];
    if (ornek[anahtar].length < (sonuc.alt === 'Siniflanmayan' ? 40 : 3)) ornek[anahtar].push(String(konu).slice(0, 90));
    [anaAd, anaAd + '/' + sonuc.alt].forEach(function (h) { (gruplar[h] = gruplar[h] || []).push(t); });
  }
  if (uygula) {
    Object.keys(gruplar).forEach(function (ad) {
      var liste = gruplar[ad];
      var etiket = etiketAl_(ad);
      for (var j = 0; j < liste.length; j += 100) etiket.addToThreads(liste.slice(j, j + 100));
    });
  }
  return { sayac: sayac, ornek: ornek };
}

/** 1) DENEME: hicbir sey degistirmez; dagilimi ve ornekleri gunluge yazar. */
function etiketDeneme() {
  var konular = GmailApp.search('has:nouserlabels -in:trash -in:spam', 0, 100);
  var s = etiketIsle_(konular, false);
  console.log('Etiketsiz ' + konular.length + ' yazisma (en yeni 100) - DEGISIKLIK YAPILMADI:');
  Object.keys(s.sayac).sort().forEach(function (k) {
    console.log(k + ' : ' + s.sayac[k] + '  | ornek: ' + s.ornek[k].join('  ||  '));
  });
}

/** 2) GECMIS: etiketsiz tum yazismalar. "BITTI" yazana kadar tekrar calistirin. */
function etiketGecmis() {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(5000)) return;
  var bas = Date.now();
  var toplam = 0;
  try {
    while (Date.now() - bas < ETIKET_SURE_MS) {
      var konular = GmailApp.search('has:nouserlabels -in:trash -in:spam', 0, ETIKET_PAKET);
      if (!konular.length) { console.log('BITTI - ' + toplam + ' yazisma etiketlendi; etiketsiz yazisma kalmadi.'); return; }
      etiketIsle_(konular, true);
      toplam += konular.length;
    }
    console.log(toplam + ' yazisma etiketlendi - tekrar calistirin (BITTI yazana kadar).');
  } finally {
    kilit.releaseLock();
  }
}

/** 3) Tetikleyici: son 3 gunun etiketsiz yazismalari (30 dakikada bir; Gmail gunluk kotasi Pazar/navlun ile ortak). */
function etiketTara() {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(5000)) return;
  try {
    var konular = GmailApp.search('has:nouserlabels newer_than:3d -in:trash -in:spam', 0, ETIKET_PAKET);
    if (konular.length) etiketIsle_(konular, true);
  } finally {
    kilit.releaseLock();
  }
}

function etiketKur() {
  etiketKaldir();
  ScriptApp.newTrigger('etiketTara').timeBased().everyMinutes(30).create();
  etiketTara();
}

function etiketKaldir() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'etiketTara') ScriptApp.deleteTrigger(t);
  });
}
