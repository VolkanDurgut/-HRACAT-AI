#Requires -Version 5.1
# ============================================================================
# UNEX - KANTAR SQL OKUMA IZNI (tek seferlik) - 24.11.2026
# ============================================================================
# DBA gorevi (C:\UnexDBA\dba-ajan.ps1 >= 1.2.0) Windows SYSTEM hesabiyla calisir. Kantar programinin
# (BAYKON Truck Scale) tartimlarini okuyabilmesi icin bu hesaba YALNIZ TruckSolas veritabaninda OKUMA izni
# verir; yazma / silme / degistirme / calistirma ayrica YASAKLANIR (DENY).
#
# NE YAPMAZ: Truck Scale'in tablolarina, verisine, ayarlarina, "sa" girisine ve diger veritabanlarina
# dokunmaz. Program acikken calisir; yeniden baslatma gerekmez. Sifre kullanmaz / saklamaz.
#
# GUVENLIK ADIMLARI:
#  1) Once mevcut durumu okur ve C:\UnexDBA\kantar-izin-onceki.json dosyasina yazar.
#  2) SYSTEM zaten sunucu yoneticisiyse (sysadmin) HICBIR SEY degistirmez (zaten okuyabilir).
#  3) SYSTEM'in TruckSolas'ta onceden bir kullanicisi varsa ona DENY eklemez (baska bir sey kullaniyor
#     olabilir); yalniz okuma rolu ekler.
#  4) Degisiklikten sonra SYSTEM adina test eder: RECORDS okunabiliyor mu, yazma izni KAPALI mi.
#     Test basarisizsa yaptigi degisiklikleri geri alir.
# Geri almak icin:  powershell -NoProfile -ExecutionPolicy Bypass -File .\kantar-izin.ps1 -Kaldir
#   (yalniz bu betigin olusturdugu kullanici / girisi kaldirir)
#
# Calistirma (Yonetici PowerShell, bu klasorden):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\kantar-izin.ps1
# Bu dosya bilerek SADECE ASCII karakter icerir (Windows PowerShell 5.1).
# ============================================================================
param(
  [string]$Sunucu = '.\SQLEXPRESS',
  [string]$Veritabani = 'TruckSolas',
  [string]$Kok = 'C:\UnexDBA',
  [switch]$Kaldir
)
$ErrorActionPreference = 'Stop'
$GIRIS = 'NT AUTHORITY\SYSTEM'
$durumDosyasi = Join-Path $Kok 'kantar-izin-onceki.json'

function Tamam([string]$m) { Write-Host "   [TAMAM] $m" -ForegroundColor Green }
function Bilgi([string]$m) { Write-Host "   $m" }
function Dur([string]$m) { Write-Host ''; Write-Host "   [DURDU] $m" -ForegroundColor Red; exit 1 }

$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Dur 'PowerShell YONETICI olarak acilmali (Baslat > PowerShell > sag tik > Yonetici olarak calistir).'
}
if (-not (Test-Path -LiteralPath $Kok)) { Dur "$Kok yok. DBA gorevi bu bilgisayarda kurulu olmali." }

function Baglan([string]$vt) {
  $c = New-Object System.Data.SqlClient.SqlConnection ("Server=" + $Sunucu + ";Database=" + $vt + ";Integrated Security=SSPI;Connect Timeout=8;Pooling=false;Application Name=UnexDBA-izin")
  $c.Open()
  return $c
}
function Tek($baglanti, [string]$sorgu) {
  $k = $baglanti.CreateCommand(); $k.CommandText = $sorgu; $k.CommandTimeout = 30
  $v = $k.ExecuteScalar()
  if ($v -is [System.DBNull]) { return $null }
  return $v
}
function Calistir($baglanti, [string]$sorgu) {
  $k = $baglanti.CreateCommand(); $k.CommandText = $sorgu; $k.CommandTimeout = 30
  [void]$k.ExecuteNonQuery()
}
# Ad sabit ve bilinen; yine de koseli parantez kacislari
$G = '[' + $GIRIS.Replace(']', ']]') + ']'
$GN = "N'" + $GIRIS.Replace("'", "''") + "'"
$VT = '[' + $Veritabani.Replace(']', ']]') + ']'

Write-Host ''
Write-Host '   UNEX - Kantar SQL okuma izni' -ForegroundColor Cyan
Write-Host ''
try { $m = Baglan 'master' } catch { Dur ("SQL Server'a baglanilamadi (" + $Sunucu + "): " + $_.Exception.Message) }
try {
  if ([int](Tek $m "SELECT IS_SRVROLEMEMBER('sysadmin')") -ne 1) { Dur 'Bu Windows kullanicisi SQL Server yoneticisi degil; izin verilemez. (Hicbir sey degismedi.)' }
  if ($null -eq (Tek $m ("SELECT DB_ID(N'" + $Veritabani.Replace("'", "''") + "')"))) { Dur "$Veritabani veritabani bulunamadi. (Hicbir sey degismedi.)" }
  Tamam ("SQL Server'a baglanildi, " + $Veritabani + " bulundu")

  if ($Kaldir) {
    if (-not (Test-Path -LiteralPath $durumDosyasi)) { Dur "Onceki durum dosyasi yok ($durumDosyasi); kaldirilacak bir sey bilinmiyor." }
    $onceki = Get-Content -LiteralPath $durumDosyasi -Raw | ConvertFrom-Json
    $d = Baglan $Veritabani
    try {
      if ($onceki.kullaniciOlusturuldu -and $null -ne (Tek $d ("SELECT 1 FROM sys.database_principals WHERE name = " + $GN))) {
        Calistir $d ("DROP USER " + $G); Tamam "$Veritabani icindeki kullanici kaldirildi"
      } elseif ($onceki.rolEklendi -and $null -ne (Tek $d ("SELECT 1 FROM sys.database_principals WHERE name = " + $GN))) {
        Calistir $d ("ALTER ROLE db_datareader DROP MEMBER " + $G); Tamam 'Okuma rolu geri alindi'
      }
    } finally { $d.Close() }
    if ($onceki.girisOlusturuldu -and $null -ne (Tek $m ("SELECT 1 FROM sys.server_principals WHERE name = " + $GN))) {
      Calistir $m ("DROP LOGIN " + $G); Tamam 'Sunucu girisi kaldirildi'
    }
    Rename-Item -LiteralPath $durumDosyasi -NewName ('kantar-izin-onceki.kaldirildi-' + (Get-Date).ToString('yyyyMMddHHmmss') + '.json')
    Tamam 'Izin geri alindi. DBA gorevi kantar tartimlarini artik okuyamaz (DBA yuklemesi etkilenmez).'
    exit 0
  }

  # ---- 1) mevcut durum
  $girisVar = $null -ne (Tek $m ("SELECT 1 FROM sys.server_principals WHERE name = " + $GN))
  $sysadmin = $girisVar -and ([int](Tek $m ("SELECT IS_SRVROLEMEMBER('sysadmin', " + $GN + ")")) -eq 1)
  $d = Baglan $Veritabani
  try {
    $kullaniciVar = $null -ne (Tek $d ("SELECT 1 FROM sys.database_principals WHERE name = " + $GN))
    $okuyucu = $kullaniciVar -and ([int](Tek $d ("SELECT IS_ROLEMEMBER('db_datareader', " + $GN + ")")) -eq 1)
    $yazarRol = $kullaniciVar -and (([int](Tek $d ("SELECT IS_ROLEMEMBER('db_datawriter', " + $GN + ")")) -eq 1) -or ([int](Tek $d ("SELECT IS_ROLEMEMBER('db_owner', " + $GN + ")")) -eq 1))
  } finally { $d.Close() }
  Bilgi ("Onceki durum: sunucu girisi " + $(if ($girisVar) { 'VAR' } else { 'yok' }) + ", sysadmin " + $sysadmin + ", veritabani kullanicisi " + $(if ($kullaniciVar) { 'VAR' } else { 'yok' }) + ", okuma rolu " + $okuyucu)

  $kayit = [ordered]@{ tarih = (Get-Date).ToString('o'); sunucu = $Sunucu; veritabani = $Veritabani; girisVardi = $girisVar; sysadminDi = $sysadmin; kullaniciVardi = $kullaniciVar; okuyucuydu = $okuyucu; yazarRolVardi = $yazarRol; girisOlusturuldu = $false; kullaniciOlusturuldu = $false; rolEklendi = $false; denyEklendi = $false }
  if (Test-Path -LiteralPath $durumDosyasi) {
    Bilgi 'Bu betik daha once calistirilmis; onceki durum dosyasi korunuyor.'
  } else {
    [IO.File]::WriteAllText($durumDosyasi, ($kayit | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  }

  if ($sysadmin) {
    Tamam 'SYSTEM zaten SQL Server yoneticisi: okuyabilir. Hicbir sey degistirilmedi.'
  } else {
    # ---- 2) izin
    try {
      if (-not $girisVar) { Calistir $m ("CREATE LOGIN " + $G + " FROM WINDOWS"); $kayit.girisOlusturuldu = $true; Tamam 'Sunucu girisi olusturuldu (SYSTEM)' }
      $d = Baglan $Veritabani
      try {
        if (-not $kullaniciVar) { Calistir $d ("CREATE USER " + $G + " FOR LOGIN " + $G); $kayit.kullaniciOlusturuldu = $true; Tamam "$Veritabani icinde kullanici olusturuldu" }
        if (-not $okuyucu) { Calistir $d ("ALTER ROLE db_datareader ADD MEMBER " + $G); $kayit.rolEklendi = $true; Tamam 'Okuma rolu (db_datareader) verildi' }
        if ($kayit.kullaniciOlusturuldu) {
          Calistir $d ("DENY INSERT, UPDATE, DELETE, EXECUTE, ALTER, CREATE TABLE, CREATE PROCEDURE, CREATE VIEW, CREATE FUNCTION TO " + $G)
          $kayit.denyEklendi = $true; Tamam 'Yazma / silme / degistirme / calistirma YASAKLANDI'
        } else {
          Bilgi 'Kullanici onceden vardi; ona yasak (DENY) eklenmedi (baska bir sey kullaniyor olabilir).'
        }
      } finally { $d.Close() }

      # ---- 3) SYSTEM adina test (yazma YAPILMAZ; yalniz izin sorgulanir)
      $d = Baglan $Veritabani
      try {
        Calistir $d ("EXECUTE AS LOGIN = " + $GN)
        $adet = Tek $d 'SELECT COUNT(*) FROM dbo.RECORDS'
        $ilk = Tek $d 'SELECT COUNT(*) FROM dbo.FIRST'
        $yazma = [int](Tek $d "SELECT HAS_PERMS_BY_NAME('dbo.RECORDS', 'OBJECT', 'INSERT') + HAS_PERMS_BY_NAME('dbo.RECORDS', 'OBJECT', 'UPDATE') + HAS_PERMS_BY_NAME('dbo.RECORDS', 'OBJECT', 'DELETE')")
        Calistir $d 'REVERT'
      } finally { $d.Close() }
      Tamam ("SYSTEM test: RECORDS " + $adet + " kayit, FIRST " + $ilk + " kayit okunabiliyor")
      if ($kayit.denyEklendi -and $yazma -ne 0) { throw 'Yazma izni kapali degil (beklenmeyen durum).' }
      if ($kayit.denyEklendi) { Tamam 'SYSTEM test: yazma izni KAPALI' }
    } catch {
      $hata = $_.Exception.Message
      Write-Host "   [HATA] $hata" -ForegroundColor Red
      Write-Host '   Yapilan degisiklikler geri aliniyor...'
      try {
        $d = Baglan $Veritabani
        try {
          if ($kayit.kullaniciOlusturuldu) { Calistir $d ("DROP USER " + $G) }
          elseif ($kayit.rolEklendi) { Calistir $d ("ALTER ROLE db_datareader DROP MEMBER " + $G) }
        } finally { $d.Close() }
        if ($kayit.girisOlusturuldu) { Calistir $m ("DROP LOGIN " + $G) }
        Remove-Item -LiteralPath $durumDosyasi -Force -ErrorAction SilentlyContinue
        Tamam 'Geri alindi; SQL Server eski haline dondu.'
      } catch { Write-Host ("   [UYARI] Geri alma tamamlanamadi: " + $_.Exception.Message) -ForegroundColor Yellow }
      Dur 'Izin verilemedi. Bu cikti metnini sohbete ekleyin.'
    }
    if ($kayit.girisOlusturuldu -or $kayit.kullaniciOlusturuldu -or $kayit.rolEklendi) {
      $onceki = Get-Content -LiteralPath $durumDosyasi -Raw | ConvertFrom-Json
      foreach ($a in 'girisOlusturuldu', 'kullaniciOlusturuldu', 'rolEklendi', 'denyEklendi') { if ($kayit[$a]) { $onceki.$a = $true } }
      [IO.File]::WriteAllText($durumDosyasi, ($onceki | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
    }
  }
} finally { $m.Close() }

$truck = Get-Process Truck -ErrorAction SilentlyContinue
Tamam ("Truck Scale calismaya devam ediyor: " + [bool]$truck)
Write-Host ''
Write-Host '   Izin tamam. Simdi guncelle.ps1 calistirilabilir.' -ForegroundColor Green
exit 0
