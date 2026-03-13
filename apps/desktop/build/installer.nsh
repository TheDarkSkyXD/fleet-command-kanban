; Refresh Windows icon cache after install so the new logo appears immediately
!macro customInstall
  ; Clear icon cache so Windows picks up the new app icon
  ExecShell "" "ie4uinit.exe" "-show"
!macroend
