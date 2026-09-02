# Build Windows exe + NSIS installer (PowerShell)
# Preserves optimized flags and all existing Windows features

param(
    [string]$Version = "2.0.0",
    [string]$OutDir = "dist-windows"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot/../..").Path
$Dist = Join-Path $Root $OutDir
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host "[windows] Building Windows exe version $Version"

# Build standalone binary
Push-Location "$Root/universal-core"
Write-Host "[windows] cargo build --release --bin v2rayez-license-gate"
cargo build --release --bin v2rayez-license-gate --features "std,post-quantum-lab"
if ($LASTEXITCODE -ne 0) { Write-Error "cargo build failed"; exit 1 }
Get-ChildItem target -Recurse -Filter "v2rayez-license-gate.exe" | ForEach-Object { Write-Host $_.FullName; Copy-Item $_.FullName $Dist -Force }
Pop-Location

# Build Tauri if possible
$GuiDir = Join-Path $Root "V2RayEZ-GUI"
if (Test-Path $GuiDir) {
    Push-Location $GuiDir
    Write-Host "[windows] npm ci"
    npm ci --ignore-scripts 2>&1 | Select-Object -Last 20
    if (Test-Path "scripts/prepare-sidecar.mjs") {
        node scripts/prepare-sidecar.mjs 2>&1 | Select-Object -Last 20
    }
    if (Test-Path "scripts/build-frontend.mjs") {
        node scripts/build-frontend.mjs 2>&1 | Select-Object -Last 20
    }
    Write-Host "[windows] tauri build"
    npx tauri build --bundles nsis,msi 2>&1 | Tee-Object -FilePath "$Root/tauri-build.log"
    Get-ChildItem "src-tauri/target" -Recurse -Include "*.exe","*.msi" | ForEach-Object { Copy-Item $_.FullName $Dist -Force -ErrorAction SilentlyContinue }
    Get-ChildItem "src-tauri/target/release/bundle" -Recurse -Include "*.exe","*.msi" -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName $Dist -Force }
    Pop-Location
}

# Build NSIS installer if makensis available
$MainExe = Get-ChildItem $Dist/*.exe | Where-Object { $_.Name -notlike "*setup*" } | Select-Object -First 1
if ($null -eq $MainExe) { $MainExe = Get-ChildItem $Dist/*.exe | Select-Object -First 1 }
if ($null -ne $MainExe) {
    Write-Host "[windows] Main exe: $($MainExe.FullName)"
    $NsiPath = Join-Path $Dist "installer.nsi"
    $NsiContent = @"
!include "MUI2.nsh"
Name "V2RayEZ $Version"
OutFile "$Dist\V2RayEZ-$Version-setup.exe"
InstallDir "`$PROGRAMFILES\V2RayEZ"
RequestExecutionLevel admin
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  SetOutPath "`$INSTDIR"
  File "$($MainExe.FullName)"
  File /nonfatal "$Dist\*.dll"
  WriteUninstaller "`$INSTDIR\uninstall.exe"
  CreateShortCut "`$DESKTOP\V2RayEZ.lnk" "`$INSTDIR\$($MainExe.Name)"
  CreateDirectory "`$SMPROGRAMS\V2RayEZ"
  CreateShortCut "`$SMPROGRAMS\V2RayEZ\V2RayEZ.lnk" "`$INSTDIR\$($MainExe.Name)"
SectionEnd
Section "Uninstall"
  Delete "`$INSTDIR\$($MainExe.Name)"
  Delete "`$INSTDIR\uninstall.exe"
  RMDir "`$INSTDIR"
  Delete "`$DESKTOP\V2RayEZ.lnk"
  RMDir /r "`$SMPROGRAMS\V2RayEZ"
SectionEnd
"@
    $NsiContent | Out-File -Encoding utf8 $NsiPath
    $Makensis = "C:\Program Files (x86)\NSIS\makensis.exe"
    if (Test-Path $Makensis) {
        & $Makensis $NsiPath
    } else {
        Write-Host "[windows] NSIS not found, skipping installer creation"
    }
}

Get-ChildItem $Dist | ForEach-Object { Write-Host "$($_.Name) $($_.Length) bytes" }

if (-not (Get-ChildItem $Dist/*.exe -ErrorAction SilentlyContinue)) {
    Write-Error "No exe produced"
    exit 1
}

Write-Host "[windows] Build done"
