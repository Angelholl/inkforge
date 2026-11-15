@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem --- Preflight: pnpm must be available ---
where pnpm >nul 2>&1
if errorlevel 1 (
    echo pnpm not found in PATH
    pause
    exit /b 1
)

rem --- Guard: single instance (5173 already listening) ---
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo InkForge GUI already running
    exit /b 0
)

set STARTED_SERVER=0

rem --- Ensure backend on 8787 (reuse if already listening) ---
netstat -ano | findstr ":8787" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto server_ready

start "inkforge-server" /min cmd /c "pnpm dev:server"
set STARTED_SERVER=1

rem --- Poll health endpoint, up to 40s (20 tries x 2s) ---
set /a TRIES=0
:wait_health
curl -s -o NUL -m 2 http://127.0.0.1:8787/api/health >nul 2>&1
if not errorlevel 1 goto server_ready
set /a TRIES+=1
if !TRIES! GEQ 20 (
    echo Timed out waiting for server on port 8787
    goto cleanup
)
timeout /t 2 /nobreak >nul
goto wait_health

:server_ready
rem --- Launch desktop GUI (blocks until window closes) ---
rem NOTE: `call` is required - pnpm is a .cmd shim; without it control never returns to :cleanup
call pnpm --filter @inkforge/desktop dev

:cleanup
if not "%STARTED_SERVER%"=="1" goto done
rem --- Kill the server console we spawned (title-based, whole tree incl. node --watch parent) ---
taskkill /f /t /fi "WINDOWTITLE eq inkforge-server*" >nul 2>&1
rem --- Bounded fallback: port-based, in case title filter misses ---
set /a KC=0
:kill_retry
netstat -ano | findstr ":8787" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 goto done
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /f /t /pid %%P >nul 2>&1
set /a KC+=1
if %KC% GEQ 3 goto done
timeout /t 2 /nobreak >nul
goto kill_retry

:done
endlocal
exit /b 0
