#Requires -Version 5.1
# ============================================================================
# UNEX - DBA OTOMATİK YÜKLEME · KALDIRMA
# ============================================================================
# Çalıştırma (Yönetici PowerShell):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\kaldir.ps1
# Görev Zamanlayıcı görevini siler. C:\UnexDBA klasörü (günlükler) yerinde
# bırakılır; isterseniz elle silin. Solas klasörüne dokunulmaz.
# Cihaz anahtarını SUNUCUDA da iptal etmeyi unutmayın (kantar_cihazlari.aktif = false).
# ============================================================================
$ErrorActionPreference = 'Stop'
$GorevAdi = 'UnexDBA Otomatik Yukleme'
$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'PowerShell YÖNETİCİ olarak açılmalı.' -ForegroundColor Red; exit 1
}
$gorev = Get-ScheduledTask -TaskName $GorevAdi -ErrorAction SilentlyContinue
if ($null -eq $gorev) {
  Write-Host "Görev zaten yok: $GorevAdi" -ForegroundColor Yellow
} else {
  Stop-ScheduledTask -TaskName $GorevAdi -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $GorevAdi -Confirm:$false
  Write-Host "Görev kaldırıldı: $GorevAdi" -ForegroundColor Green
}
Write-Host 'C:\UnexDBA klasörü yerinde bırakıldı (günlükler için). Gerekirse elle silebilirsiniz.'
