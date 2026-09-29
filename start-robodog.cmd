@echo off
REM One-click start for the RoboDog backend + web dashboard on Windows.
REM Requires Node.js 20+ (https://nodejs.org). Everything else is installed automatically.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies, first run only... & call npm install || (pause & exit /b 1))
if not exist shared\dist (call npm run build -w shared || (pause & exit /b 1))
if "%ROBODOG_SIMULATION%"=="" set ROBODOG_SIMULATION=false
start "RoboDog backend (port 8080)" cmd /k "set ROBODOG_SIMULATION=%ROBODOG_SIMULATION%&& npm run dev -w server"
start "RoboDog web (port 5173)" cmd /k "npm run dev -w web -- --host"
timeout /t 8 >nul
start "" http://localhost:5173
echo.
echo ==========================================================
echo  RoboDog is running.  Dashboard: http://localhost:5173
echo  Simulation mode: %ROBODOG_SIMULATION%
echo.
echo  In the phone app, Settings ^> Backend ^> Server URL, enter
echo  http://YOUR-LAPTOP-IP:8080  (token: robodog-dev-token)
echo  Your laptop IP addresses:
ipconfig | findstr /c:"IPv4"
echo.
echo  Close the two black windows to stop.
echo ==========================================================
pause
