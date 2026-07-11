Var InstanceId
Var InstanceDisplayName
Var InstanceManuKey
Var InstanceUninstKey
Var DataDir
Var DataDirField

!macro SetInstanceDisplayNameBody
  StrCmp $InstanceId "time-tracker" 0 +3
    StrCpy $InstanceDisplayName "Time Tracker"
    Goto set_instance_display_name_done
  StrCpy $0 $InstanceId 13
  StrCmp $0 "time-tracker-" 0 custom_instance_name
    StrCpy $1 $InstanceId "" 13
    StrCpy $InstanceDisplayName "Time Tracker $1"
    Goto set_instance_display_name_done
  custom_instance_name:
    StrCpy $InstanceDisplayName $InstanceId
  set_instance_display_name_done:
!macroend

!macro UpdateInstanceKeysBody
  StrCpy $InstanceManuKey "Software\${MANUFACTURER}\$InstanceId"
  StrCpy $InstanceUninstKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\$InstanceId"
!macroend

!macro SetInstanceFromInstDirBody
  ${GetFileName} $INSTDIR $InstanceId
  StrCmp $InstanceId "" 0 +2
    StrCpy $InstanceId "${PRODUCTNAME}"
  !insertmacro SetInstanceDisplayNameBody
  !insertmacro UpdateInstanceKeysBody
!macroend

Function SetInstanceDisplayName
  !insertmacro SetInstanceDisplayNameBody
FunctionEnd

Function UpdateInstanceKeys
  !insertmacro UpdateInstanceKeysBody
FunctionEnd

Function InstanceIdIsTaken
  Push $0
  Push $1
  StrCpy $0 0
  ReadRegStr $1 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\$InstanceId" "UninstallString"
  ${If} $1 != ""
    StrCpy $0 1
    Goto instance_id_is_taken_end
  ${EndIf}
  IfFileExists "$LOCALAPPDATA\Programs\$InstanceId\${MAINBINARYNAME}.exe" 0 instance_id_is_taken_end
  StrCpy $0 1
  instance_id_is_taken_end:
  Pop $1
  Exch $0
FunctionEnd

Function FindNextInstanceId
  StrCpy $InstanceId "${PRODUCTNAME}"
  Call InstanceIdIsTaken
  Pop $0
  ${If} $0 == 0
    Call SetInstanceDisplayName
    Call UpdateInstanceKeys
    Return
  ${EndIf}
  StrCpy $R9 2
  instance_find_loop:
    StrCpy $InstanceId "${PRODUCTNAME}-$R9"
    Call InstanceIdIsTaken
    Pop $0
    ${If} $0 == 0
      Call SetInstanceDisplayName
      Call UpdateInstanceKeys
      Return
    ${EndIf}
    IntOp $R9 $R9 + 1
    ${If} $R9 > 99
      MessageBox MB_ICONSTOP "Could not find an available instance name."
      Abort
    ${EndIf}
    Goto instance_find_loop
FunctionEnd

Function SetInstanceFromInstDir
  !insertmacro SetInstanceFromInstDirBody
FunctionEnd

Function DirectoryPageLeave
  Call SetInstanceFromInstDir
  StrCpy $DataDir "$APPDATA\$InstanceId"
FunctionEnd

Function DataDirPage
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}

  StrCmp $DataDir "" 0 data_dir_has_default
    StrCpy $DataDir "$APPDATA\$InstanceId"
  data_dir_has_default:

  IfFileExists "$INSTDIR\data_dir.txt" 0 data_dir_show
    ClearErrors
    FileOpen $R0 "$INSTDIR\data_dir.txt" r
    IfErrors data_dir_show
    FileRead $R0 $DataDir
    FileClose $R0
  data_dir_show:

  !insertmacro MUI_HEADER_TEXT "Data Location" "Choose where logs, settings, and the database are stored."

  nsDialogs::Create 1018
  Pop $R0
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  ${NSD_CreateLabel} 0 0 100% 24u "Each installed copy can use its own data folder. The database and app settings are saved here."
  Pop $R0

  ${NSD_CreateLabel} 0 28u 100% 12u "Data folder:"
  Pop $R0

  ${NSD_CreateDirRequest} 0 44u 100% 12u $DataDir
  Pop $DataDirField

  ${NSD_SetText} $DataDirField $DataDir

  nsDialogs::Show
FunctionEnd

Function DataDirPageLeave
  ${NSD_GetText} $DataDirField $DataDir
  StrCmp $DataDir "" 0 +3
    MessageBox MB_ICONEXCLAMATION "Please choose a data folder."
    Abort
FunctionEnd

Function un.SetInstanceFromInstDir
  !insertmacro SetInstanceFromInstDirBody
FunctionEnd

Function un.SetInstanceDisplayName
  !insertmacro SetInstanceDisplayNameBody
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  CreateDirectory "$DataDir"

  FileOpen $8 "$INSTDIR\data_dir.txt" w
  FileWrite $8 "$DataDir"
  FileClose $8

  FileOpen $7 "$INSTDIR\instance.json" w
  FileWrite $7 "{$\r$\n"
  FileWrite $7 '  "instance_id": "$InstanceId",$\r$\n'
  FileWrite $7 '  "display_name": "$InstanceDisplayName",$\r$\n'
  FileWrite $7 '  "data_dir_name": "$InstanceId"$\r$\n'
  FileWrite $7 "}$\r$\n"
  FileClose $7
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "$InstanceId" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
