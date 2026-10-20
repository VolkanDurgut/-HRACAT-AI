#Requires -Version 5.1
# ============================================================================
# UNEX - DBA OTOMATİK YÜKLEME · KANTAR BİLGİSAYARI KURULUMU
# ============================================================================
# Çalıştırma (Yönetici olarak açılmış PowerShell'de, bu klasörün içinden):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\kurulum.ps1
#
# Yaptıkları (sırasıyla; bir adım başarısız olursa DURUR):
#   1) Yönetici yetkisi ve Solas klasörü (C:\Truck Scale\DBA) kontrolü
#   2) Cihaz anahtarını ister ve sunucuyla DENER (henüz hiçbir şey kurulmadan)
#   3) C:\UnexDBA klasörünü kurar: görev betiği, ayar.json, şifreli anahtar
#      (Windows DPAPI, bu bilgisayara bağlı); klasör izinleri yalnızca
#      SYSTEM + Yöneticiler
#   4) Görev Zamanlayıcı'ya "UnexDBA Otomatik Yukleme" görevini ekler:
#      bilgisayar açılınca başlar, her dakika çalışır, oturum açılmasa da çalışır
#   5) Görevi bir kez çalıştırıp sonucu gösterir
# Solas'ın klasörüne HİÇBİR ŞEY yazılmaz. Tekrar çalıştırılabilir (günceller).
# Kaldırmak için: kaldir.ps1
# ============================================================================
param(
  [string]$SolasKlasoru = 'C:\Truck Scale\DBA',
  [string]$Hedef = 'C:\UnexDBA',
  [string]$Adres = 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/dba-otomatik'
)
$ErrorActionPreference = 'Stop'
$GorevAdi = 'UnexDBA Otomatik Yukleme'

function Baslik([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Tamam([string]$m) { Write-Host "   [TAMAM] $m" -ForegroundColor Green }
function Dur([string]$m) { Write-Host ''; Write-Host "   [DURDU] $m" -ForegroundColor Red; Write-Host '   Hiçbir değişiklik yapılmadıysa güvenle tekrar deneyebilirsiniz.'; exit 1 }

Baslik '1/5 Ön kontrol'
$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Dur 'PowerShell YÖNETİCİ olarak açılmalı (Başlat > PowerShell > sağ tık > Yönetici olarak çalıştır).'
}
Tamam 'Yönetici yetkisi var'
if (-not (Test-Path -LiteralPath $SolasKlasoru)) { Dur "Solas klasörü bulunamadı: $SolasKlasoru" }
$ornek = @(Get-ChildItem -LiteralPath $SolasKlasoru -File -Filter '*.pdf' | Where-Object { $_.Name -match '^\d{12}_.+\.pdf$' })
Tamam "Solas klasörü: $SolasKlasoru ($($ornek.Count) DBA dosyası)"
$kaynak = Join-Path $PSScriptRoot 'dba-ajan.ps1'
if (-not (Test-Path -LiteralPath $kaynak)) { Dur "dba-ajan.ps1 bu klasörde yok: $PSScriptRoot" }
Tamam 'Görev betiği bulundu'

Baslik '2/5 Cihaz anahtarı ve bağlantı testi'
Write-Host '   Anahtarı yapıştırın (unexdba_ ile başlar; yazarken görünmez, sağ tık = yapıştır) ve Enter''a basın:'
$guvenli = Read-Host '   Anahtar' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($guvenli)
try { $anahtar = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($anahtar -notmatch '^unexdba_[0-9a-f]{64}$') { Dur 'Anahtar biçimi hatalı (unexdba_ + 64 karakter olmalı). Eksik/fazla kopyalanmış olabilir.' }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$istemci = New-Object System.Net.Http.HttpClient
$istemci.Timeout = [TimeSpan]::FromSeconds(30)
$mesaj = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Adres)
[void]$mesaj.Headers.TryAddWithoutValidation('x-cihaz-anahtari', $anahtar)
[void]$mesaj.Headers.TryAddWithoutValidation('x-islem', 'sinyal')
[void]$mesaj.Headers.TryAddWithoutValidation('x-ajan-surumu', 'kurulum')
try {
  $yanit = $istemci.SendAsync($mesaj).GetAwaiter().GetResult()
  $metin = $yanit.Content.ReadAsStringAsync().GetAwaiter().GetResult()
} catch {
  Dur ("Sunucuya ulaşılamadı: " + $_.Exception.GetBaseException().Message + ' (internet / güvenlik duvarı?)')
} finally { $istemci.Dispose() }
if ([int]$yanit.StatusCode -eq 401) { Dur 'Sunucu anahtarı kabul etmedi (geçersiz veya iptal edilmiş).' }
if ([int]$yanit.StatusCode -ne 200) { Dur "Sunucu beklenmeyen yanıt verdi (HTTP $([int]$yanit.StatusCode)): $metin" }
$bilgi = $metin | ConvertFrom-Json
$modMetni = 'CANLI (eşleşen DBA otomatik yüklenir)'
if ($bilgi.mod -ne 'canli') { $modMetni = 'DENEME (okur ve eşleştirir, hiçbir şey YAZMAZ)' }
Tamam "Bağlantı başarılı · cihaz: $($bilgi.cihaz) · mod: $modMetni"

Baslik "3/5 $Hedef klasörü"
if (-not (Test-Path -LiteralPath $Hedef)) { New-Item -ItemType Directory -Path $Hedef | Out-Null }
Copy-Item -LiteralPath $kaynak -Destination (Join-Path $Hedef 'dba-ajan.ps1') -Force
Unblock-File -LiteralPath (Join-Path $Hedef 'dba-ajan.ps1') -ErrorAction SilentlyContinue
$ayarYolu = Join-Path $Hedef 'ayar.json'
$baslangic = $null
if (Test-Path -LiteralPath $ayarYolu) {
  # Güncellemede başlangıç tarihi korunur (eski belgeler yeniden taranmasın)
  try { $baslangic = [string](Get-Content -LiteralPath $ayarYolu -Raw -Encoding UTF8 | ConvertFrom-Json).baslangic } catch { $baslangic = $null }
}
if (-not $baslangic) {
  # Dünden itibaren üretilen DBA'lar işlenir; daha eskileri zaten elle yüklenmiştir
  $baslangic = (Get-Date).Date.AddDays(-1).ToString('yyyy-MM-ddTHH:mm:ss')
}
$ayar = [ordered]@{ klasor = $SolasKlasoru; adres = $Adres; baslangic = $baslangic }
[IO.File]::WriteAllText($ayarYolu, ($ayar | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Add-Type -AssemblyName System.Security
$sifreli = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($anahtar), $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
[IO.File]::WriteAllBytes((Join-Path $Hedef 'anahtar.dat'), $sifreli)
$anahtar = $null
# İzinler: devralma kapalı; yalnızca SYSTEM (S-1-5-18) ve Yöneticiler (S-1-5-32-544) - SID ile (Türkçe Windows'ta grup adları farklı)
$icacls = & icacls.exe $Hedef /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /Q 2>&1
if ($LASTEXITCODE -ne 0) { Dur "Klasör izinleri ayarlanamadı: $icacls" }
Tamam "Kuruldu: dba-ajan.ps1, ayar.json (başlangıç $baslangic), anahtar.dat (şifreli); izinler yalnızca SYSTEM + Yöneticiler"

Baslik '4/5 Görev Zamanlayıcı'
$ilk = (Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Unex: Solas DBA belgelerini ihracatasistanim.com'a otomatik yukler ($Hedef)</Description></RegistrationInfo>
  <Triggers>
    <BootTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><Enabled>true</Enabled><Delay>PT1M</Delay></BootTrigger>
    <TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>$ilk</StartBoundary><Enabled>true</Enabled></TimeTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$ps</Command>
      <Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$Hedef\dba-ajan.ps1"</Arguments>
      <WorkingDirectory>$Hedef</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
Register-ScheduledTask -TaskName $GorevAdi -Xml $xml -Force | Out-Null
$gorev = Get-ScheduledTask -TaskName $GorevAdi
if ($gorev.State -eq 'Disabled') { Dur 'Görev oluşturuldu ama devre dışı görünüyor.' }
Tamam "Görev eklendi: '$GorevAdi' (açılışta başlar, her dakika, SYSTEM hesabıyla)"

Baslik '5/5 İlk çalıştırma'
Start-ScheduledTask -TaskName $GorevAdi
$bitti = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $g = Get-ScheduledTask -TaskName $GorevAdi
  if ($g.State -ne 'Running') { $bitti = $true; break }
}
$sonuc = Get-ScheduledTaskInfo -TaskName $GorevAdi
if (-not $bitti) { Write-Host '   Görev hâlâ çalışıyor (çok sayıda belge işleniyor olabilir).' -ForegroundColor Yellow }
elseif ($sonuc.LastTaskResult -eq 0) { Tamam 'Görev başarıyla çalıştı' }
else { Write-Host "   [UYARI] Görev sonucu: $($sonuc.LastTaskResult). Ayrıntı için günlüğe bakın." -ForegroundColor Yellow }
$gunluk = Get-ChildItem -LiteralPath (Join-Path $Hedef 'gunluk') -File -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if ($gunluk) {
  Write-Host '   Günlüğün son satırları:'
  Get-Content -LiteralPath $gunluk.FullName -Encoding UTF8 -Tail 8 | ForEach-Object { Write-Host "     $_" }
} else {
  Write-Host '   Henüz günlük yok (işlenecek yeni DBA olmayabilir; bu normaldir).'
}
Write-Host ''
Write-Host 'Kurulum tamamlandı. Kantar Paneli > "Otomatik DBA" bölümünde "Bağlı" görünmelidir.' -ForegroundColor Green
Write-Host "Günlük klasörü: $Hedef\gunluk  ·  Kaldırmak için: kaldir.ps1"
