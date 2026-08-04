Var InstanceId
Var InstanceDisplayName
Var InstanceManuKey
Var InstanceUninstKey

!macro InitFixedInstanceBody
  StrCpy $InstanceId "${PRODUCTNAME}"
  StrCpy $InstanceDisplayName "Time Tracker"
  StrCpy $InstanceManuKey "Software\${MANUFACTURER}\${PRODUCTNAME}"
  StrCpy $InstanceUninstKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!macroend

Function InitFixedInstance
  !insertmacro InitFixedInstanceBody
FunctionEnd

Function un.InitFixedInstance
  !insertmacro InitFixedInstanceBody
FunctionEnd

Function ShouldRemoveStaleRunKey
  Exch $0
  Push $1
  StrCmp $0 "${PRODUCTNAME}" keep
  StrCpy $1 $0 1
  StrCmp $1 "$$" remove
  StrCpy $1 $0 4
  StrCmp $1 "beta" remove
  StrCpy $1 $0 13
  StrCmp $1 "time-tracker-" remove
  Goto keep
  remove:
    StrCpy $0 1
    Goto done
  keep:
    StrCpy $0 0
  done:
  Pop $1
  Exch $0
FunctionEnd

Function CleanupStaleStartupEntries
  Push $0
  Push $1
  Push $2
  StrCpy $0 0
  cleanup_loop:
    EnumRegValue $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" $0
    StrCmp $1 "" cleanup_done
    StrCpy $2 $1
    Push $2
    Call ShouldRemoveStaleRunKey
    Pop $2
    StrCmp $2 1 0 cleanup_next
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" $1
    StrCpy $0 0
    Goto cleanup_loop
  cleanup_next:
    IntOp $0 $0 + 1
    Goto cleanup_loop
  cleanup_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  CreateDirectory "$APPDATA\${PRODUCTNAME}"
  Delete "$INSTDIR\data_dir.txt"
  Delete "$INSTDIR\instance.json"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Call CleanupStaleStartupEntries
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
