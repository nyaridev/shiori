@echo off
rem Opens Shiori in its own borderless window (Tauri). The first run builds the window app, which needs Rust.
rem Rebuild the window app after changing src-tauri with: pnpm app:build
setlocal
cd /d "%~dp0"

if not exist node_modules (
    call pnpm install || goto :fail
)
call pnpm build || goto :fail
if not exist src-tauri\target\release\shiori.exe (
    call pnpm app:build || goto :fail
)
start "" src-tauri\target\release\shiori.exe
exit /b 0

:fail
echo.
echo Shiori failed to start. See the messages above.
pause
exit /b 1
