!macro NSIS_HOOK_POSTINSTALL
  Delete "$DESKTOP\V2RayEZ.lnk"
  IfSilent desktop_shortcut_done
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a V2RayEZ shortcut on the Desktop?" IDNO desktop_shortcut_done
  CreateShortCut "$DESKTOP\V2RayEZ.lnk" "$INSTDIR\v2rayez-gui.exe"
  desktop_shortcut_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\v2rayez-gui.exe" --repair-network'
  Sleep 3000
  Delete "$DESKTOP\V2RayEZ.lnk"
  Delete "$DESKTOP\V2RayEZ.lnk"
!macroend

