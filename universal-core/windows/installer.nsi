; V2RayEZ Universal Windows Installer - NSIS
; Produces V2RayEZ-setup.exe from V2RayEZ.exe + dlls
; Preserves optimized binary, adds Start Menu + Desktop shortcuts

!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "V2RayEZ Universal"
OutFile "dist-windows/V2RayEZ-setup.exe"
InstallDir "$PROGRAMFILES\V2RayEZ"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!define MUI_ICON "icons/icon.ico"
!define MUI_UNICON "icons/icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "V2RayEZ Core" SecCore
  SetOutPath "$INSTDIR"
  File /nonfatal "dist-windows/V2RayEZ.exe"
  File /nonfatal "dist-windows/v2rayez-license-gate.exe"
  File /nonfatal "dist-windows/*.dll"
  File /nonfatal "LICENSE.txt"
  File /nonfatal "README.md"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateShortCut "$DESKTOP\V2RayEZ.lnk" "$INSTDIR\V2RayEZ.exe"
  CreateDirectory "$SMPROGRAMS\V2RayEZ"
  CreateShortCut "$SMPROGRAMS\V2RayEZ\V2RayEZ.lnk" "$INSTDIR\V2RayEZ.exe"
  CreateShortCut "$SMPROGRAMS\V2RayEZ\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ" "DisplayName" "V2RayEZ Universal"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ" "DisplayVersion" "2.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ" "Publisher" "V2RayEZ"
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\V2RayEZ.exe"
  Delete "$INSTDIR\v2rayez-license-gate.exe"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$DESKTOP\V2RayEZ.lnk"
  RMDir /r "$SMPROGRAMS\V2RayEZ"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\V2RayEZ"
SectionEnd
