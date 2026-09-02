# Build Windows exe + NSIS installer (PowerShell)
# Preserves optimized flags and all existing Windows features

param(
    [string]$Version = "2.0.0",
    [string]$OutDir = "dist-windows"
)

$Root = (Resolve-Path "$PSScriptRoot/../..").Path
$Dist = Join-Path $Root $OutDir
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host "[windows] Building Windows exe version $Version into $Dist"

# 1. Build standalone core binary via Cargo
Push-Location "$Root/universal-core"
Write-Host "[windows] cargo build --release --bin v2rayez-license-gate"
cargo build --release --bin v2rayez-license-gate --features "std,post-quantum-lab"
cargo build --release --lib --features "std,post-quantum-lab"

$GateExe = Get-ChildItem "target" -Recurse -Filter "v2rayez-license-gate.exe" | Select-Object -First 1
if ($GateExe) {
    Write-Host "[windows] Found $GateExe"
    Copy-Item $GateExe.FullName (Join-Path $Dist "v2rayez-license-gate.exe") -Force
    Copy-Item $GateExe.FullName (Join-Path $Dist "v2rayez-license-gate-v$Version-x86_64.exe") -Force
    Copy-Item $GateExe.FullName (Join-Path $Dist "V2RayEZ.exe") -Force
    Copy-Item $GateExe.FullName (Join-Path $Dist "V2RayEZ-v$Version-Windows-x64.exe") -Force
}

$CoreDll = Get-ChildItem "target" -Recurse -Filter "v2rayez_universal_core.dll" | Select-Object -First 1
if ($CoreDll) {
    Copy-Item $CoreDll.FullName (Join-Path $Dist "v2rayez_universal_core.dll") -Force
    Copy-Item $CoreDll.FullName (Join-Path $Dist "v2rayez_universal_core-v$Version-x86_64.dll") -Force
}
Pop-Location

# 2. Try building GUI if npm & Tauri tools are functional
$GuiDir = Join-Path $Root "V2RayEZ-GUI"
if (Test-Path $GuiDir) {
    try {
        Push-Location $GuiDir
        Write-Host "[windows] Attempting Tauri GUI build"
        if (Test-Path "scripts/prepare-sidecar.mjs") {
            node scripts/prepare-sidecar.mjs
        }
        if (Test-Path "scripts/build-frontend.mjs") {
            node scripts/build-frontend.mjs
        }
        if (Get-Command "npm" -ErrorAction SilentlyContinue) {
            npm run build
        }
        Get-ChildItem "src-tauri/target" -Recurse -Include "*.exe","*.msi" -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item $_.FullName $Dist -Force
        }
        Pop-Location
    } catch {
        Write-Warning "[windows] Tauri GUI build optional step: $_"
        Pop-Location
    }
}

# 3. Build NSIS installer if makensis is available
$MakensisCmd = $null
if (Get-Command "makensis" -ErrorAction SilentlyContinue) {
    $MakensisCmd = "makensis"
} elseif (Test-Path "C:\Program Files (x86)\NSIS\makensis.exe") {
    $MakensisCmd = "C:\Program Files (x86)\NSIS\makensis.exe"
} elseif (Test-Path "C:\Program Files\NSIS\makensis.exe") {
    $MakensisCmd = "C:\Program Files\NSIS\makensis.exe"
}

$MainExe = Get-ChildItem $Dist/*.exe | Where-Object { $_.Name -like "V2RayEZ*" -and $_.Name -notlike "*setup*" } | Select-Object -First 1
if ($null -eq $MainExe) { $MainExe = Get-ChildItem $Dist/*.exe | Select-Object -First 1 }

if ($null -ne $MainExe -and $null -ne $MakensisCmd) {
    Write-Host "[windows] Creating NSIS installer using $MakensisCmd for $($MainExe.FullName)"
    $NsiPath = Join-Path $Dist "installer.nsi"
    $OutSetupExe = (Join-Path $Dist "V2RayEZ-v$Version-Windows-x64-setup.exe").Replace('\', '/')
    $MainExePath = ($MainExe.FullName).Replace('\', '/')
    $DistPath = ($Dist).Replace('\', '/')
    
    $NsiContent = @"
!include "MUI2.nsh"
Name "V2RayEZ $Version"
OutFile "$OutSetupExe"
InstallDir "`$PROGRAMFILES\V2RayEZ"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "MainSection" SEC01
  SetOutPath "`$INSTDIR"
  File "$MainExePath"
  File /nonfatal "$DistPath/*.dll"
  WriteUninstaller "`$INSTDIR\uninstall.exe"
  CreateDirectory "`$SMPROGRAMS\V2RayEZ"
  CreateShortCut "`$SMPROGRAMS\V2RayEZ\V2RayEZ.lnk" "`$INSTDIR\$($MainExe.Name)"
  CreateShortCut "`$SMPROGRAMS\V2RayEZ\Uninstall.lnk" "`$INSTDIR\uninstall.exe"
  CreateShortCut "`$DESKTOP\V2RayEZ.lnk" "`$INSTDIR\$($MainExe.Name)"
SectionEnd

Section "Uninstall"
  Delete "`$INSTDIR\$($MainExe.Name)"
  Delete "`$INSTDIR\uninstall.exe"
  Delete "`$INSTDIR\*.dll"
  Delete "`$DESKTOP\V2RayEZ.lnk"
  RMDir /r "`$SMPROGRAMS\V2RayEZ"
  RMDir "`$INSTDIR"
SectionEnd
"@
    [System.IO.File]::WriteAllText($NsiPath, $NsiContent)
    try {
        & $MakensisCmd $NsiPath
        Write-Host "[windows] NSIS installer generated successfully: $OutSetupExe"
    } catch {
        Write-Warning "[windows] NSIS execution warning: $_"
    }
} else {
    Write-Host "[windows] NSIS makensis not available or no exe found, skipping installer generation"
}

# 4. Verify deliverables
Write-Host "[windows] Output assets in $Dist :"
Get-ChildItem $Dist | ForEach-Object { Write-Host " - $($_.Name) ($($_.Length) bytes)" }

$Exes = Get-ChildItem $Dist/*.exe -ErrorAction SilentlyContinue
if (-not $Exes) {
    Write-Error "[windows] No .exe produced in $Dist"
    exit 1
}

Write-Host "[windows] Windows packaging successful!"
