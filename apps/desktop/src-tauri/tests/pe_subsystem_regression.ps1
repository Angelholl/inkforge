# 一次性回归脚本：校验 release 版 exe 的 PE 可选头 Subsystem 字段为 2(GUI)。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1
# 首次运行记录 BEFORE（现状），此后运行输出 BEFORE/AFTER 对比并断言 AFTER=2。
# 仅用 .NET 内置 API，不依赖第三方模块。

$ErrorActionPreference = 'Stop'

$exe = Join-Path $PSScriptRoot '..\target\release\inkforge-desktop.exe'
$exe = [System.IO.Path]::GetFullPath($exe)
$baselineFile = Join-Path $env:TEMP 'inkforge_pe_subsystem_baseline.txt'

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Host "ERROR: exe not found: $exe"
  exit 2
}

function Read-PeSubsystem([string]$path) {
  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)
  try {
    $br = New-Object System.IO.BinaryReader($fs)
    $fs.Position = 0x3C
    $eLfanew = $br.ReadInt32()                      # DOS 头 e_lfanew @ 0x3C
    $fs.Position = $eLfanew + 4                     # 跳过 PE 签名，进入 COFF 头(20 字节)
    $fs.Position = $eLfanew + 4 + 20 + 68           # 可选头 Subsystem @ +68，1 字节
    $subsystem = $br.ReadByte()
    $br.Dispose()
    return [int]$subsystem
  } finally {
    $fs.Dispose()
  }
}

function Get-SubsystemLabel([int]$n) {
  switch ($n) {
    2 { 'GUI' }
    3 { 'console' }
    default { 'unknown' }
  }
}

$current = Read-PeSubsystem $exe
$currentLine = "SUBSYSTEM=$current($(Get-SubsystemLabel $current))"

if (-not (Test-Path -LiteralPath $baselineFile)) {
  Set-Content -LiteralPath $baselineFile -Value $current -Encoding ASCII
  Write-Host "BEFORE=$current($(Get-SubsystemLabel $current))"
  Write-Host $currentLine
  if ($current -ne 2) {
    Write-Host 'FAIL: release exe is not GUI subsystem (red baseline recorded)'
    exit 1
  }
  Write-Host 'PASS: release exe is GUI subsystem'
  exit 0
}

$before = [int](Get-Content -LiteralPath $baselineFile -Raw).Trim()
Write-Host "BEFORE=$before($(Get-SubsystemLabel $before))"
Write-Host "AFTER=$current($(Get-SubsystemLabel $current))"

if ($current -eq 2) {
  Write-Host 'PASS: AFTER=2(GUI)'
  exit 0
}

Write-Host "FAIL: AFTER=$current($(Get-SubsystemLabel $current)), expected 2(GUI)"
exit 1
