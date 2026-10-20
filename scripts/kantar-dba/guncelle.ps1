#Requires -Version 5.1
# ============================================================================
# UNEX - DBA OTOMATİK YÜKLEME · GÖREV GÜNCELLEME
# ============================================================================
# Çalıştırma (Yönetici olarak açılmış PowerShell'de, bu klasörün içinden):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\guncelle.ps1
#
# SADECE görev betiğini (dba-ajan.ps1) yenisiyle değiştirir. Cihaz anahtarı,
# ayar.json, durum.json ve günlükler OLDUĞU GİBİ kalır (anahtar yeniden
# istenmez). Görev Zamanlayıcı görevi değişmez. Solas klasörüne dokunulmaz.
# Önce kurulum.ps1 ile kurulmuş olmalı.
# ============================================================================
param([string]$Hedef = 'C:\UnexDBA')
$ErrorActionPreference = 'Stop'
$GorevAdi = 'UnexDBA Otomatik Yukleme'

function Tamam([string]$m) { Write-Host "   [TAMAM] $m" -ForegroundColor Green }
function Dur([string]$m) { Write-Host ''; Write-Host "   [DURDU] $m" -ForegroundColor Red; exit 1 }
function Surum([string]$yol) {
  $s = Select-String -LiteralPath $yol -Pattern "^\`$SURUM = '([0-9.]+)'" | Select-Object -First 1
  if ($null -eq $s) { return '?' } else { return $s.Matches[0].Groups[1].Value }
}

$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Dur 'PowerShell YÖNETİCİ olarak açılmalı (Başlat > PowerShell > sağ tık > Yönetici olarak çalıştır).'
}
$kaynak = Join-Path $PSScriptRoot 'dba-ajan.ps1'
$hedefBetik = Join-Path $Hedef 'dba-ajan.ps1'
if (-not (Test-Path -LiteralPath $kaynak)) { Dur "Yeni görev betiği bu klasörde yok: $kaynak" }
foreach ($f in 'ayar.json', 'anahtar.dat') {
  if (-not (Test-Path -LiteralPath (Join-Path $Hedef $f))) { Dur "$Hedef\$f yok. Önce kurulum.ps1 çalıştırılmalı." }
}
if ($null -eq (Get-ScheduledTask -TaskName $GorevAdi -ErrorAction SilentlyContinue)) { Dur "Görev bulunamadı: $GorevAdi. Önce kurulum.ps1 çalıştırılmalı." }

# Betik sözdizimi kontrolü (bozuk dosya kurulmasın)
$hatalar = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($kaynak, [ref]$null, [ref]$hatalar)
if ($hatalar.Count -gt 0) { Dur "Yeni betikte sözdizimi hatası: $($hatalar[0].Message)" }

$eski = if (Test-Path -LiteralPath $hedefBetik) { Surum $hedefBetik } else { 'yok' }
$yeni = Surum $kaynak
Write-Host "   Görev sürümü: $eski -> $yeni"

# Önce yanına kopyala, sonra tek hamlede değiştir (çalışan görev yarım dosya görmesin)
$gecici = $hedefBetik + '.yeni'
Copy-Item -LiteralPath $kaynak -Destination $gecici -Force
if (Test-Path -LiteralPath $hedefBetik) { [IO.File]::Replace($gecici, $hedefBetik, [NullString]::Value) } else { Move-Item -LiteralPath $gecici -Destination $hedefBetik }
Unblock-File -LiteralPath $hedefBetik -ErrorAction SilentlyContinue
$icacls = & icacls.exe (Join-Path $Hedef '*') /reset /T /Q 2>&1
if ($LASTEXITCODE -ne 0) { Dur "Dosya izinleri ayarlanamadı: $icacls" }
try { [void][IO.File]::ReadAllBytes($hedefBetik) } catch { Dur "Betik okunamıyor (izin): $($_.Exception.Message)" }
if ((Surum $hedefBetik) -ne $yeni) { Dur 'Kopyalanan betiğin sürümü beklenenden farklı.' }
Tamam "dba-ajan.ps1 güncellendi ($yeni); anahtar ve ayarlar değişmedi"

Write-Host '   Görev bir kez çalıştırılıyor...'
Start-ScheduledTask -TaskName $GorevAdi
$bitis = (Get-Date).AddSeconds(120)
Start-Sleep -Seconds 3
while ((Get-ScheduledTask -TaskName $GorevAdi).State -eq 'Running' -and (Get-Date) -lt $bitis) { Start-Sleep -Seconds 2 }
$bilgi = Get-ScheduledTaskInfo -TaskName $GorevAdi
if ($bilgi.LastTaskResult -eq 0) { Tamam "Görev çalıştı (sonuç 0, $($bilgi.LastRunTime))" }
else { Write-Host "   [UYARI] Görev sonucu: $($bilgi.LastTaskResult). Günlüğe bakın." -ForegroundColor Yellow }
$gunluk = Get-ChildItem -LiteralPath (Join-Path $Hedef 'gunluk') -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if ($gunluk) { Write-Host ''; Write-Host '   Son günlük satırları:'; Get-Content -LiteralPath $gunluk.FullName -Tail 8 -Encoding UTF8 | ForEach-Object { Write-Host "   $_" } }
