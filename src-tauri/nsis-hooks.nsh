!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "time-tracker" "$INSTDIR\time-tracker.exe"
!macroend