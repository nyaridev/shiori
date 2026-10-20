@echo off
rem Runs Shiori with hot reload: the UI on http://localhost:4410, the API server on 4411.
setlocal
cd /d "%~dp0"

netstat -ano | findstr /r /c:":4410 .*LISTENING" >nul
if not errorlevel 1 (
    echo Port 4410 is already in use, probably by another Shiori dev server.
    echo Close it and run this again.
    pause
    exit /b 1
)

if not exist node_modules (
    call pnpm install || goto :fail
)
start "" http://localhost:4410
call pnpm dev
exit /b 0

:fail
echo.
echo Shiori dev failed. See the messages above.
pause
exit /b 1
