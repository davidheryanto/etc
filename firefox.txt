# Disable crash reporter
# http://forums.mozillazine.org/viewtopic.php?f=7&t=2442071
reg.exe add "HKEY_CURRENT_USER\Software\Mozilla\Firefox\Crash Reporter" /v SubmitCrashReport /t REG_DWORD /d 0 /f
# https://support.mozilla.org/en-US/questions/1018211
set environment variable MOZ_CRASHREPORTER_DISABLE=1