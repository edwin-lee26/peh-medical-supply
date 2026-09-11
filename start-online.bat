@echo off
title PEH Medical Supply - Online Sharing
cd /d "%~dp0"

echo ============================================================
echo  PEH Medical Supply - Online Sharing
echo  (phones/tablets can open the link from anywhere)
echo ============================================================
echo.

rem --- Clean up any leftover instances ---
taskkill /f /im cloudflared.exe >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8123 .*LISTENING"') do taskkill /f /pid %%P >nul 2>&1
timeout /t 1 /nobreak >nul

rem --- 1. Start the local server ---
echo [1/3] Starting local server on port 8123 ...
start "msm-server" /b node server.js 8123
timeout /t 2 /nobreak >nul

rem --- 2. Start the Cloudflare public tunnel ---
echo [2/3] Starting public tunnel (Cloudflare) ...
if exist data\cloudflared.log del data\cloudflared.log
start "msm-tunnel" /b tunnel\cloudflared.exe tunnel --url http://localhost:8123 --no-autoupdate > data\cloudflared.log 2>&1

echo.
echo [3/3] Waiting for the public link (5-10 seconds)...
echo.

set "PUB="
for /l %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  for /f "delims=" %%A in ('powershell -NoProfile -Command "(Select-String -Path 'data\cloudflared.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches[0].Value" 2^>nul') do set "PUB=%%A"
  if defined PUB goto :found
)

echo  Tunnel did not start in time. Check data\cloudflared.log
goto :done

:found
if not exist data mkdir data
echo %PUB%> data\public-url.txt
echo.
echo  ============================================================
echo   PUBLIC LINK - open this to share (works from anywhere):
echo     %PUB%
echo  ============================================================
echo.
echo  Local:     http://localhost:8123
echo  Admin:     http://localhost:8123/admin.html
echo  The QR code + link on the admin Share box use this public URL.
echo  Close this window to stop sharing.
echo  ============================================================

:done
echo.
pause