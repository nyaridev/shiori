@echo off
rem Builds the UI and serves Shiori at http://localhost:4400 in your browser (needs Node 25+ and pnpm).
setlocal
cd /d "%~dp0"

netstat -ano | findstr /r /c:":4400 .*LISTENING" >nul
if not errorlevel 1 (
    echo Shiori is already running. Opening it.
    start "" http://localhost:4400
    exit /b 0
)

if not exist node_modules (
    call pnpm install || goto :fail
)
call pnpm build || goto :fail
start "" http://localhost:4400
call pnpm start
exit /b 0

:fail
echo.
echo Shiori failed to start. See the messages above.
pause
exit /b 1
