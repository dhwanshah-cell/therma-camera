@echo off
REM Installs the latest RoboDog APK on a phone connected by USB (USB debugging must be ON).
REM Downloads Android platform-tools (adb) and the APK automatically.
setlocal
cd /d "%~dp0"
set APK_URL=https://github.com/dhwanshah-cell/therma-camera/releases/download/latest-apk/robodog.apk
if not exist tools\platform-tools\adb.exe (
  echo Downloading Android platform-tools...
  mkdir tools 2>nul
  curl -L -o tools\platform-tools.zip https://dl.google.com/android/repository/platform-tools-latest-windows.zip || (pause & exit /b 1)
  tar -xf tools\platform-tools.zip -C tools || (pause & exit /b 1)
)
echo Downloading latest RoboDog APK...
curl -L -o robodog.apk %APK_URL% || (pause & exit /b 1)
echo Connect the phone by USB, enable USB debugging, accept the prompt on the phone.
tools\platform-tools\adb.exe devices
tools\platform-tools\adb.exe install -r robodog.apk && echo Installed. Open RoboDog on the phone.
pause
