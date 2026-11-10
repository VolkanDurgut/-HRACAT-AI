/**
 * PAZAR 3.5 - Gelen cevap tespiti (10.11.2026)
 * ------------------------------------------------------------------
 * KURULUM YERI: arsiv Gmail hesabi (unex.execution.arsiv@gmail.com) -> script.google.com -> Yeni proje.
 * Bu betik 10 dakikada bir arsive yeni dusen dis mailleri (gonderen, ad, konu, tarih, Message-ID ve
 * alintisiz ilk 1500 karakter) Ihracat AI'a (edge "pazar-gorev", islem "gelen") gonderir. Sistem
 * gondereni Pazar'daki firma yetkilileriyle eslestirir; eslesmeyen mail KAYDEDILMEZ.
 *
 * AYARLAR (Proje ayarlari -> Komut dosyasi ozellikleri / Script properties):
 *   ANAHTAR : Supabase secret PAZAR_GELEN_ANAHTAR ile AYNI deger (gizli; kimseyle paylasmayin)
 *   ANON    : Supabase anon (public) anahtar
 * Sonra bir kez "kur" fonksiyonunu calistirin (izin ister) -> 10 dakikalik tetikleyici kurulur.
 * Kaldirmak icin "kaldir" fonksiyonunu calistirin.
 *
 * Gizli bilgi bu dosyada YOKTUR (repo herkese acik); degerler yalniz betik ozelliklerinde durur.
 */

var URL_GELEN = 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/pazar-gorev';
var KENDI_ALANLAR = ['unex.com.tr', 'ihracatasistanim.com'];
var PAKET = 50;

function kur() {
  kaldir();
  ScriptApp.newTrigger('tara').timeBased().everyMinutes(10).create();
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SON')) p.setProperty('SON', String(Date.now() - 2 * 24 * 3600 * 1000));
  tara();
}

function kaldir() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tara') ScriptApp.deleteTrigger(t);
  });
}

function tara() {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(5000)) return;
  try {
    var p = PropertiesService.getScriptProperties();
    var anahtar = p.getProperty('ANAHTAR');
    var anon = p.getProperty('ANON');
    if (!anahtar || !anon) throw new Error('ANAHTAR ve ANON betik ozellikleri girilmeli.');
    var son = Number(p.getProperty('SON') || (Date.now() - 2 * 24 * 3600 * 1000));
    // 1 saat geri tasma: gec gelen / gec indekslenen mail kacmasin (sunucu Message-ID ile tekrari atar)
    var baslangic = son - 3600 * 1000;
    var sorgu = 'in:anywhere after:' + Math.floor(baslangic / 1000) + ' -in:trash -in:sent ' +
      KENDI_ALANLAR.map(function (a) { return '-from:' + a; }).join(' ');
    var konular = GmailApp.search(sorgu, 0, 200);
    var mesajlar = [];
    var enYeni = son;
    konular.forEach(function (k) {
      k.getMessages().forEach(function (m) {
        var t = m.getDate().getTime();
        if (t < baslangic) return;
        var kimden = adresAyir(m.getFrom());
        if (!kimden.eposta) return;
        var alan = kimden.eposta.split('@')[1] || '';
        if (KENDI_ALANLAR.indexOf(alan) >= 0) return;
        mesajlar.push({
          mesaj_id: m.getHeader('Message-ID') || ('gmail:' + m.getId()),
          gonderen: kimden.eposta,
          gonderen_ad: kimden.ad,
          konu: (m.getSubject() || '').slice(0, 300),
          ozet: alintisiz(m.getPlainBody() || '').slice(0, 1500),
          tarih: m.getDate().toISOString(),
        });
        if (t > enYeni) enYeni = t;
      });
    });
    for (var i = 0; i < mesajlar.length; i += PAKET) {
      var cevap = UrlFetchApp.fetch(URL_GELEN, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + anon, apikey: anon, 'x-pazar-anahtar': anahtar },
        payload: JSON.stringify({ islem: 'gelen', mesajlar: mesajlar.slice(i, i + PAKET) }),
        muteHttpExceptions: true,
      });
      if (cevap.getResponseCode() !== 200) {
        // Imleci ilerletme: bir sonraki calismada tekrar denenir
        throw new Error('Ihracat AI ' + cevap.getResponseCode() + ': ' + cevap.getContentText().slice(0, 200));
      }
      console.log(cevap.getContentText());
    }
    p.setProperty('SON', String(Math.max(enYeni, son)));
  } finally {
    kilit.releaseLock();
  }
}

/** "Ad Soyad <a@b.com>" -> { ad, eposta } */
function adresAyir(s) {
  var m = /<([^>]+)>/.exec(s || '');
  var eposta = (m ? m[1] : s || '').trim().toLowerCase();
  var ad = m ? (s.slice(0, m.index).replace(/["']/g, '').trim()) : '';
  return { eposta: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta) ? eposta : '', ad: ad.slice(0, 200) };
}

/** Cevabin yalniz yeni kismi: alinti (">", "On ... wrote:", "From:", "Gonderen:" ...) oncesi. */
function alintisiz(govde) {
  var satirlar = govde.replace(/\r/g, '').split('\n');
  var cikti = [];
  for (var i = 0; i < satirlar.length; i++) {
    var s = satirlar[i];
    if (/^\s*>/.test(s)) break;
    if (/^\s*(On .+wrote:|Le .+a écrit|El .+escribió|Am .+schrieb|From:|De :|Von:|Gönderen:|Kimden:|Sent:|-{2,}\s*Original Message|_{8,})/i.test(s)) break;
    cikti.push(s);
  }
  return cikti.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
