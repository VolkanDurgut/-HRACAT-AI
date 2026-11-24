#Requires -Version 5.1
# ============================================================================
# UNEX - DBA OTOMATIK YUKLEME GOREVI (kantar bilgisayari) - surum 1.2.0
# ============================================================================
# Windows Gorev Zamanlayici her dakika calistirir (SYSTEM hesabi, pencere yok).
# Solas'in C:\Truck Scale\DBA klasorune yazdigi "<12 hane>_<yukleten>.pdf"
# (yukleten bos birakilirsa "<12 hane>_.pdf")
# dosyalarini sunucuya (edge function dba-otomatik) gonderir. Butun kararlari
# SUNUCU verir; bu betik is kurali icermez.
#
# GUVENLIK / VERI:
#  - Solas'in klasorune ASLA yazmaz: dosya tasimaz, silmez, adini degistirmez.
#  - Neyi gonderdigini kendi klasorundeki durum.json'da tutar.
#  - Cihaz anahtari anahtar.dat'ta Windows DPAPI (LocalMachine) ile sifreli;
#    klasor izinleri yalnizca SYSTEM + Yoneticiler (kurulum.ps1 ayarlar).
#  - Ayni anda tek kopya calisir (Gorev Zamanlayici + mutex).
#
# KONTEYNER SONRADAN GIRILIRSE (1.1.0): sunucu "beklemede" dediyse (konteyner henuz
# sisteme girilmemis) gorev her dakika PDF gondermeden "bekleyen" sorusunu sorar;
# konteyner eklenince belge ayni dakika gonderilir (PDF yedek olarak saatte bir).
#
# KANTAR TARTIMLARI (1.2.0, 24.11.2026): kantar programi (BAYKON Truck Scale) tartimlari yerel SQL Server
# Express'teki TruckSolas veritabanina yaziyor. Gorev SYSTEM hesabiyla (kantar-izin.ps1 ile verilen SALT OKUMA
# izniyle) dbo.RECORDS (tamamlanan) ve dbo.FIRST (ikinci tartimi bekleyen) tablolarindan yalniz gerekli alanlari
# okur ve sunucuya "tartim" islemiyle gonderir. SQL'e ASLA yazmaz (yalniz SELECT). Sofor adi / TC / fotograf
# alanlari okunmaz. Okuma basarisiz olursa DBA akisi etkilenmez (saatte bir gunluge yazilir).
#   - Ilk calisma: son 14 gunun tartimlari; sonra her dakika yeni kayitlar + son 2 saatte cikan kayitlar
#     (DBA durumu sonradan dolar); gunde bir kez son 3 gun yeniden (sonradan duzeltilen kayitlar).
#   - ayar.json "kantar": { "aktif": false } ile kapatilabilir; "sunucu" / "veritabani" degistirilebilir.
#
# Gunluk: <kok>\gunluk\YYYY-MM.log (6 aydan eski gunlukler silinir).
# Bu dosya bilerek SADECE ASCII karakter icerir (Windows PowerShell 5.1 BOM'suz
# dosyayi ANSI okur; Turkce karakter bozulmasin).
# ============================================================================
param(
  [string]$Kok = $PSScriptRoot,
  # Sadece test icin: anahtar DPAPI yerine UNEXDBA_TEST_ANAHTAR ortam degiskeninden
  [switch]$Test
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$SURUM = '1.2.0'
$AZAMI_DOSYA_ISTEK = 15          # bir calismada en fazla gonderilecek belge
$AZAMI_CALISMA_SN = 480          # 8 dk (gorev zaman siniri 10 dk)
$KARARLILIK_SN = 15              # Solas yazmayi bitirsin diye son degisiklikten sonra beklenen sure
$AZAMI_BOYUT = 5MB
$SINYAL_DK = 5
$AZAMI_BEKLEYEN = 50            # bir "bekleyen" sorusunda en fazla belge

$gunlukKlasoru = Join-Path $Kok 'gunluk'
$durumDosyasi = Join-Path $Kok 'durum.json'
$ayarDosyasi = Join-Path $Kok 'ayar.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Gunluk([string]$metin) {
  try {
    if (-not (Test-Path -LiteralPath $gunlukKlasoru)) { New-Item -ItemType Directory -Path $gunlukKlasoru | Out-Null }
    $satir = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' | ' + $metin + [Environment]::NewLine
    [System.IO.File]::AppendAllText((Join-Path $gunlukKlasoru ((Get-Date).ToString('yyyy-MM') + '.log')), $satir, $utf8)
  } catch { }
}

function Hashtable-Yap($nesne) {
  # ConvertFrom-Json (PS 5.1) PSCustomObject dondurur; ic ice hashtable'a cevir
  if ($null -eq $nesne) { return $null }
  if ($nesne -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $nesne.PSObject.Properties) { $h[$p.Name] = Hashtable-Yap $p.Value }
    return $h
  }
  return $nesne
}

function Zaman-Coz($deger) {
  # durum.json'daki zamanlar: PS 7 ConvertFrom-Json ISO metni DateTime'a cevirir, PS 5.1 metin birakir.
  # Turkce Windows'ta kultur farki olmasin diye her zaman kulturden bagimsiz okunur.
  if ($null -eq $deger -or [string]$deger -eq '') { return $null }
  if ($deger -is [DateTime]) { return $deger }
  return [DateTime]::Parse([string]$deger, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
}

function Durum-Oku {
  if (Test-Path -LiteralPath $durumDosyasi) {
    try {
      $h = Hashtable-Yap ((Get-Content -LiteralPath $durumDosyasi -Raw -Encoding UTF8) | ConvertFrom-Json)
      if ($h -is [hashtable] -and $h.ContainsKey('dosyalar')) {
        if ($null -eq $h['dosyalar']) { $h['dosyalar'] = @{} }
        return $h
      }
    } catch {
      # Bozuk durum dosyasi: yedegini al, sifirdan basla (sunucu zaten yuklenmisleri "zaten_yuklu" der)
      Copy-Item -LiteralPath $durumDosyasi -Destination ($durumDosyasi + '.bozuk-' + (Get-Date).ToString('yyyyMMddHHmmss')) -Force
      Gunluk 'UYARI | durum.json okunamadi, yedeklendi ve sifirlandi'
    }
  }
  return @{ dosyalar = @{}; sonSinyal = $null }
}

function Durum-Yaz($durum) {
  $gecici = $durumDosyasi + '.yaz'
  [System.IO.File]::WriteAllText($gecici, ($durum | ConvertTo-Json -Depth 6), $utf8)
  Move-Item -LiteralPath $gecici -Destination $durumDosyasi -Force
}

function Anahtar-Oku {
  if ($Test) { return $env:UNEXDBA_TEST_ANAHTAR }
  Add-Type -AssemblyName System.Security
  $sifreli = [System.IO.File]::ReadAllBytes((Join-Path $Kok 'anahtar.dat'))
  $acik = [System.Security.Cryptography.ProtectedData]::Unprotect($sifreli, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
  return [System.Text.Encoding]::UTF8.GetString($acik)
}

function Istek-Gonder($istemci, [string]$adres, [hashtable]$basliklar, [byte[]]$govde, [string]$icerikTuru = 'application/pdf') {
  # Donus: @{ Durum = <HTTP kodu veya 0>; Veri = <json nesnesi veya $null>; Hata = <metin> }
  $mesaj = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $adres)
  foreach ($k in $basliklar.Keys) { [void]$mesaj.Headers.TryAddWithoutValidation($k, [string]$basliklar[$k]) }
  if ($null -ne $govde) {
    $icerik = New-Object System.Net.Http.ByteArrayContent(, $govde)
    $icerik.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue($icerikTuru)
    $mesaj.Content = $icerik
  }
  try {
    $yanit = $istemci.SendAsync($mesaj).GetAwaiter().GetResult()
    $metin = $yanit.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $veri = $null
    try { $veri = Hashtable-Yap ($metin | ConvertFrom-Json) } catch { }
    return @{ Durum = [int]$yanit.StatusCode; Veri = $veri; Hata = $(if ($null -eq $veri) { $metin } else { $null }) }
  } catch {
    return @{ Durum = 0; Veri = $null; Hata = $_.Exception.GetBaseException().Message }
  } finally {
    $mesaj.Dispose()
  }
}

function Sql-Deger($v) {
  if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
  $m = ([string]$v).Trim()
  if ($m -eq '') { return $null }
  return $m
}

function Kantar-Oku([string]$sunucu, [string]$veritabani, [string]$kosul, [int]$sinir) {
  # SALT OKUNUR: yalniz SELECT. Donus: @{ Kayitlar = ArrayList; Bekleyenler = ArrayList veya $null }
  $baglanti = New-Object System.Data.SqlClient.SqlConnection ("Server=" + $sunucu + ";Database=" + $veritabani + ";Integrated Security=SSPI;Connect Timeout=5;Application Name=UnexDBA-ajan;ApplicationIntent=ReadOnly")
  $baglanti.Open()
  try {
    $k = $baglanti.CreateCommand()
    $k.CommandTimeout = 20
    $k.CommandText = "SELECT TOP (" + $sinir + ") ID, EXTRA_3, PLATE_NO, QUESTION_1, QUESTION_2, QUESTION_3, QUESTION_4, QUESTION_6, QUESTION_7, QUESTION_8, " +
      "CONVERT(varchar(19), ENTRY_DATE_TIME, 126) AS GIRIS, CONVERT(varchar(19), EXIT_DATE_TIME, 126) AS CIKIS, " +
      "CONVERT(varchar(40), WEIGHT_1) AS W1, CONVERT(varchar(40), WEIGHT_2) AS W2, " +
      "CONVERT(varchar(40), TICKET_NO_WEIGHT_1) AS F1, CONVERT(varchar(40), TICKET_NO_WEIGHT_2) AS F2, " +
      "SOLAS_02, SOLAS_03, CONVERT(varchar(10), SolasStatu) AS SDURUM, CONVERT(varchar(1), [CHANGE]) AS DEGISTI " +
      "FROM dbo.RECORDS WHERE " + $kosul + " ORDER BY ID"
    $kayitlar = New-Object System.Collections.ArrayList
    $o = $k.ExecuteReader()
    try {
      while ($o.Read()) {
        [void]$kayitlar.Add(@{
          kayit_no = Sql-Deger $o['ID']; ilk_kayit_no = Sql-Deger $o['EXTRA_3']; plaka = Sql-Deger $o['PLATE_NO']
          firma = Sql-Deger $o['QUESTION_1']; urun = Sql-Deger $o['QUESTION_2']; rezervasyon = Sql-Deger $o['QUESTION_3']
          irsaliye_no = Sql-Deger $o['QUESTION_4']; konteyner_muhur = Sql-Deger $o['QUESTION_6']; dorse = Sql-Deger $o['QUESTION_7']
          liman = Sql-Deger $o['QUESTION_8']; giris = Sql-Deger $o['GIRIS']; cikis = Sql-Deger $o['CIKIS']
          tartim1_kg = Sql-Deger $o['W1']; tartim2_kg = Sql-Deger $o['W2']; fis1 = Sql-Deger $o['F1']; fis2 = Sql-Deger $o['F2']
          dba_belge_no = Sql-Deger $o['SOLAS_02']; dba_konteyner = Sql-Deger $o['SOLAS_03']; dba_durum = Sql-Deger $o['SDURUM']; degisti = Sql-Deger $o['DEGISTI']
        })
      }
    } finally { $o.Close() }

    $bekleyenler = $null
    try {
      $k.CommandText = "SELECT TOP (100) ID, PLATE_NO, QUESTION_1, QUESTION_2, QUESTION_3, QUESTION_4, QUESTION_6, QUESTION_8, " +
        "CONVERT(varchar(19), ENTRY_DATE_TIME, 126) AS GIRIS, CONVERT(varchar(40), WEIGHT_1) AS W1 FROM dbo.FIRST ORDER BY ID"
      $liste = New-Object System.Collections.ArrayList
      $o = $k.ExecuteReader()
      try {
        while ($o.Read()) {
          [void]$liste.Add(@{
            kayit_no = Sql-Deger $o['ID']; plaka = Sql-Deger $o['PLATE_NO']; firma = Sql-Deger $o['QUESTION_1']; urun = Sql-Deger $o['QUESTION_2']
            rezervasyon = Sql-Deger $o['QUESTION_3']; irsaliye_no = Sql-Deger $o['QUESTION_4']; konteyner_muhur = Sql-Deger $o['QUESTION_6']
            liman = Sql-Deger $o['QUESTION_8']; giris = Sql-Deger $o['GIRIS']; tartim1_kg = Sql-Deger $o['W1']
          })
        }
      } finally { $o.Close() }
      $bekleyenler = $liste
    } catch {
      Gunluk ("UYARI | kantar: bekleyenler (FIRST) okunamadi: " + $_.Exception.Message)
    }
    return @{ Kayitlar = $kayitlar; Bekleyenler = $bekleyenler }
  } finally {
    $baglanti.Close()
  }
}

function Tekrar-Zamani([int]$deneme) {
  # Ag / sunucu hatasinda bekleme: 2, 5, 10, 30 dk
  $dk = @(2, 5, 10, 30)[[Math]::Min($deneme, 3)]
  return (Get-Date).AddMinutes($dk).ToString('o')
}

# ---------------------------------------------------------------- ana akis
$mutex = New-Object System.Threading.Mutex($false, 'Global\UnexDbaAjan')
if (-not $mutex.WaitOne(0)) { exit 0 }
$istemci = $null
try {
  $baslangicZamani = Get-Date
  $ayar = Hashtable-Yap ((Get-Content -LiteralPath $ayarDosyasi -Raw -Encoding UTF8) | ConvertFrom-Json)
  $klasor = [string]$ayar['klasor']
  $adres = [string]$ayar['adres']
  $esik = Zaman-Coz $ayar['baslangic']
  if (-not (Test-Path -LiteralPath $klasor)) { Gunluk "HATA | klasor bulunamadi: $klasor"; exit 1 }

  $anahtar = Anahtar-Oku
  if ($anahtar -notmatch '^unexdba_[0-9a-f]{64}$') { Gunluk 'HATA | cihaz anahtari okunamadi / bicimi hatali'; exit 1 }

  if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  }
  Add-Type -AssemblyName System.Net.Http
  $istemci = New-Object System.Net.Http.HttpClient
  $istemci.Timeout = [TimeSpan]::FromSeconds(90)
  $ortak = @{ 'x-cihaz-anahtari' = $anahtar; 'x-ajan-surumu' = $SURUM }

  $durum = Durum-Oku
  $dosyalar = $durum['dosyalar']
  $simdi = Get-Date
  $gonderilen = 0
  $basarili = 0       # sunucudan 200 alinan istek (sinyal zamani sadece buna gore)
  $anahtarGecersiz = $false

  $adaylar = @(Get-ChildItem -LiteralPath $klasor -File -Filter '*.pdf' -ErrorAction Stop |
    Where-Object { $_.Name -match '^\d{12}_.*\.pdf$' -and $_.LastWriteTime -ge $esik } |
    Sort-Object LastWriteTime)

  # Bekleyenler: konteyneri henuz sisteme girilmemis belgeler. Sunucuya PDF'siz sorulur;
  # konteyner eklendiyse (veya belge artik beklemede degilse) bu calismada hemen gonderilir.
  $bekleyenler = @{}
  foreach ($f in $adaylar) {
    if ($bekleyenler.Count -ge $AZAMI_BEKLEYEN) { break }
    if (-not $dosyalar.ContainsKey($f.Name)) { continue }
    $k = $dosyalar[$f.Name]
    if ($k['sonuc'] -ne 'beklemede' -or $null -eq $k['tekrar']) { continue }
    if ((Zaman-Coz $k['tekrar']) -le $simdi) { continue }   # zamani zaten gelmis, asagida gonderilecek
    $bekleyenler[$f.Name.Substring(0, 12)] = $f.Name
  }
  if ($bekleyenler.Count -gt 0) {
    $json = '{"belgeler":["' + (@($bekleyenler.Keys) -join '","') + '"]}'
    $b = $ortak.Clone(); $b['x-islem'] = 'bekleyen'
    $y = Istek-Gonder $istemci $adres $b ($utf8.GetBytes($json)) 'application/json'
    if ($y.Durum -eq 200 -and $null -ne $y.Veri) {
      $basarili++
      $durum['sonSinyal'] = (Get-Date).ToString('o')   # sunucu bu istekte sinyali de gunceller
      foreach ($belge in @($y.Veri['hazir'])) {
        if ($null -eq $belge) { continue }
        $belge = [string]$belge
        if (-not $bekleyenler.ContainsKey($belge)) { continue }
        $ad = $bekleyenler[$belge]
        $dosyalar[$ad]['tekrar'] = $simdi.AddSeconds(-1).ToString('o')
        Gunluk "BILGI | $ad | konteyner sisteme eklendi, belge simdi gonderiliyor"
      }
    } elseif ($y.Durum -eq 401) {
      $anahtarGecersiz = $true
      Gunluk 'HATA | bekleyen: cihaz anahtari reddedildi (401)'
    }
    # Diger hatalar sessiz: belge zaten yedek zamaninda (tekrar) yeniden gonderilir
  }

  foreach ($f in $adaylar) {
    if ($gonderilen -ge $AZAMI_DOSYA_ISTEK -or $anahtarGecersiz) { break }
    if (((Get-Date) - $baslangicZamani).TotalSeconds -gt $AZAMI_CALISMA_SN) { break }

    $ad = $f.Name
    $imza = [string]$f.Length + '|' + [string]$f.LastWriteTimeUtc.Ticks
    $k = $null
    if ($dosyalar.ContainsKey($ad)) { $k = $dosyalar[$ad] }
    if ($null -ne $k -and $k['imza'] -eq $imza) {
      if ($null -eq $k['tekrar']) { continue }                                   # bitti
      if ((Zaman-Coz $k['tekrar']) -gt $simdi) { continue }  # zamani gelmedi
    } elseif ($null -ne $k) {
      Gunluk "BILGI | $ad degismis (boyut/zaman), yeniden gonderilecek"
      $k = $null
    }

    # Solas hala yaziyor olabilir: son degisiklikten bu yana bekle + dosya okunabilir mi
    if (($simdi - $f.LastWriteTime).TotalSeconds -lt $KARARLILIK_SN) { continue }
    if ($f.Length -le 0) { continue }
    try {
      $akis = [System.IO.File]::Open($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
      $akis.Dispose()
    } catch { continue }

    $deneme = 0
    if ($null -ne $k -and $k.ContainsKey('deneme')) { $deneme = [int]$k['deneme'] }
    $yeni = @{ imza = $imza; deneme = $deneme + 1; son = (Get-Date).ToString('o'); sonuc = $null; tekrar = $null; mesaj = $null }

    if ($f.Length -gt $AZAMI_BOYUT) {
      $yeni['sonuc'] = 'cok_buyuk'; $yeni['mesaj'] = 'Dosya 5 MB sinirini asiyor; elle yukleyin.'
      $dosyalar[$ad] = $yeni; Gunluk "UYARI | $ad | cok buyuk ($($f.Length) bayt)"; continue
    }

    $govde = [System.IO.File]::ReadAllBytes($f.FullName)
    $basliklar = $ortak.Clone()
    $basliklar['x-islem'] = 'belge'
    $basliklar['x-dosya-adi'] = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ad))
    $y = Istek-Gonder $istemci $adres $basliklar $govde
    $gonderilen++

    if ($y.Durum -eq 200 -and $null -ne $y.Veri) {
      $yeni['sonuc'] = [string]$y.Veri['karar']
      $yeni['mesaj'] = [string]$y.Veri['mesaj']
      $td = $y.Veri['tekrar_dk']
      if ($null -ne $td) { $yeni['tekrar'] = (Get-Date).AddMinutes([double]$td).ToString('o') }
      $yeni['deneme'] = 0
      $basarili++
      Gunluk ("{0} | {1} | {2} | {3}" -f $ad, $y.Veri['karar'], $y.Veri['mod'], $y.Veri['mesaj'])
    } elseif ($y.Durum -eq 401) {
      $anahtarGecersiz = $true
      $yeni = $k  # durum degismez; anahtar duzelince tekrar denenir
      Gunluk 'HATA | sunucu cihaz anahtarini reddetti (401). Anahtar iptal edilmis olabilir.'
    } elseif ($y.Durum -eq 400) {
      $yeni['sonuc'] = 'reddedildi'
      $yeni['mesaj'] = $(if ($null -ne $y.Veri) { [string]$y.Veri['hata'] } else { [string]$y.Hata })
      Gunluk "UYARI | $ad | sunucu reddetti (400) | $($yeni['mesaj'])"
    } else {
      $yeni['sonuc'] = 'hata'
      $yeni['tekrar'] = Tekrar-Zamani $deneme
      $hataMetni = $(if ($null -ne $y.Veri) { [string]$y.Veri['hata'] } else { [string]$y.Hata })
      $yeni['mesaj'] = $hataMetni
      Gunluk "HATA | $ad | HTTP $($y.Durum) | $hataMetni | tekrar: $($yeni['tekrar'])"
    }
    if ($null -ne $yeni) { $dosyalar[$ad] = $yeni }
    Durum-Yaz $durum   # her belgeden sonra kaydet (kesinti olursa ayni belge iki kez islenmesin)
  }

  # Kantar tartimlari (1.2.0): DBA akisindan bagimsiz; hata olursa yalniz gunluge (saatte bir) yazilir
  $kantarAyar = @{}
  if ($ayar.ContainsKey('kantar') -and $ayar['kantar'] -is [hashtable]) { $kantarAyar = $ayar['kantar'] }
  $kantarAktif = -not ($kantarAyar.ContainsKey('aktif') -and $kantarAyar['aktif'] -eq $false)
  if ($kantarAktif -and -not $anahtarGecersiz -and ((Get-Date) - $baslangicZamani).TotalSeconds -lt $AZAMI_CALISMA_SN) {
    $sunucu = $(if ($kantarAyar.ContainsKey('sunucu')) { [string]$kantarAyar['sunucu'] } else { '.\SQLEXPRESS' })
    $veritabani = $(if ($kantarAyar.ContainsKey('veritabani')) { [string]$kantarAyar['veritabani'] } else { 'TruckSolas' })
    try {
      $son = $null
      if ($durum.ContainsKey('kantarSon') -and $null -ne $durum['kantarSon']) { $son = [long]$durum['kantarSon'] }
      $bugun = (Get-Date).ToString('yyyy-MM-dd')
      $tamTarama = -not ($durum.ContainsKey('kantarTamTarama') -and [string]$durum['kantarTamTarama'] -eq $bugun)
      if ($null -eq $son) {
        $kosul = 'EXIT_DATE_TIME >= DATEADD(day, -14, GETDATE())'
      } elseif ($tamTarama) {
        $kosul = 'ID > ' + $son + ' OR EXIT_DATE_TIME >= DATEADD(day, -3, GETDATE())'
      } else {
        $kosul = 'ID > ' + $son + ' OR EXIT_DATE_TIME >= DATEADD(minute, -120, GETDATE())'
      }
      $okunan = Kantar-Oku $sunucu $veritabani $kosul 300
      $json = (@{ kayitlar = $okunan.Kayitlar; bekleyenler = $okunan.Bekleyenler } | ConvertTo-Json -Depth 5 -Compress)
      $b = $ortak.Clone(); $b['x-islem'] = 'tartim'
      $y = Istek-Gonder $istemci $adres $b ($utf8.GetBytes($json)) 'application/json'
      if ($y.Durum -eq 200 -and $null -ne $y.Veri) {
        $basarili++
        $enBuyuk = $son
        foreach ($r in $okunan.Kayitlar) { $n = [long]$r['kayit_no']; if ($null -eq $enBuyuk -or $n -gt $enBuyuk) { $enBuyuk = $n } }
        if ($null -eq $enBuyuk) { $enBuyuk = 0 }
        $durum['kantarSon'] = $enBuyuk
        if ($null -eq $son -or $tamTarama) { $durum['kantarTamTarama'] = $bugun }
        if ($null -eq $son -or $okunan.Kayitlar.Count -ge 50) { Gunluk ("BILGI | kantar: " + $okunan.Kayitlar.Count + " tartim gonderildi (son kayit " + $enBuyuk + ")") }
        $durum['kantarHata'] = $null
      } elseif ($y.Durum -eq 401) {
        $anahtarGecersiz = $true
        Gunluk 'HATA | kantar: cihaz anahtari reddedildi (401)'
      } else {
        throw ("sunucu HTTP " + $y.Durum + " | " + $(if ($null -ne $y.Veri) { [string]$y.Veri['hata'] } else { [string]$y.Hata }))
      }
    } catch {
      $sonHata = $null
      if ($durum.ContainsKey('kantarHata')) { $sonHata = Zaman-Coz $durum['kantarHata'] }
      if ($null -eq $sonHata -or ((Get-Date) - $sonHata).TotalMinutes -ge 60) {
        Gunluk ("UYARI | kantar okunamadi/gonderilemedi: " + $_.Exception.Message)
        $durum['kantarHata'] = (Get-Date).ToString('o')
      }
    }
  }

  # Sinyal: belge gonderilmediyse 5 dakikada bir "buradayim" (bekleyen sorusu da sinyal sayilir)
  if ($gonderilen -eq 0 -and -not $anahtarGecersiz -and $basarili -eq 0) {
    $sonSinyal = $null
    if ($durum.ContainsKey('sonSinyal')) { $sonSinyal = Zaman-Coz $durum['sonSinyal'] }
    if ($null -eq $sonSinyal -or ((Get-Date) - $sonSinyal).TotalMinutes -ge $SINYAL_DK) {
      $b = $ortak.Clone(); $b['x-islem'] = 'sinyal'
      $y = Istek-Gonder $istemci $adres $b $null
      if ($y.Durum -eq 200) { $durum['sonSinyal'] = (Get-Date).ToString('o') }
      elseif ($y.Durum -eq 401) { Gunluk 'HATA | sinyal: cihaz anahtari reddedildi (401)' }
      else { Gunluk "UYARI | sinyal gonderilemedi | HTTP $($y.Durum) | $($y.Hata)" }
    }
  } elseif ($basarili -gt 0) {
    $durum['sonSinyal'] = (Get-Date).ToString('o')   # basarili belge istekleri sunucuda sinyal yerine gecer
  }

  # Temizlik: klasorde artik olmayan ve 30 gunden eski kayitlar; 6 aydan eski gunlukler
  $silinecek = @()
  foreach ($ad in @($dosyalar.Keys)) {
    if (-not (Test-Path -LiteralPath (Join-Path $klasor $ad))) {
      $son = $dosyalar[$ad]['son']
      $sonZaman = Zaman-Coz $son
      if ($null -ne $sonZaman -and $sonZaman -lt (Get-Date).AddDays(-30)) { $silinecek += $ad }
    }
  }
  foreach ($ad in $silinecek) { $dosyalar.Remove($ad) }
  Durum-Yaz $durum
  if (Test-Path -LiteralPath $gunlukKlasoru) {
    Get-ChildItem -LiteralPath $gunlukKlasoru -File -Filter '*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddMonths(-6) } | Remove-Item -Force -ErrorAction SilentlyContinue
  }
} catch {
  Gunluk ("HATA | beklenmeyen: " + $_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $istemci) { $istemci.Dispose() }
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
exit 0
