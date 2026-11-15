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
set SRV_PID=

rem --- Ensure backend on 8787 ---
netstat -ano | findstr ":8787" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    start "inkforge-server" /min cmd /c "pnpm dev:server"
    set STARTED_SERVER=1

    rem --- Poll health endpoint, up to 40s (20 tries x 2s) ---
    set /a TRIES=0
    :wait_health
    curl -s -o NUL -m 2 http://127.0.0.1:8787/api/health >nul 2>&1
    if not errorlevel 1 goto health_ok
    set /a TRIES+=1
    if !TRIES! GEQ 20 (
        echo Timed out waiting for server on port 8787
        for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
            if not defined SRV_PID set SRV_PID=%%P
        )
        if "!STARTED_SERVER!"=="1" if not "!SRV_PID!"=="" taskkill /f /t /pid !SRV_PID! >nul 2>&1
        endlocal
        exit /b 1
    )
    timeout /t 2 /nobreak >nul
    goto wait_health

    :health_ok
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
        if not defined SRV_PID set SRV_PID=%%P
    )
)

rem --- Launch desktop GUI (blocks until window closes) ---
pnpm --filter @inkforge/desktop dev

:cleanup
if "%STARTED_SERVER%"=="1" if not "%SRV_PID%"=="" (
    taskkill /f /t /pid %SRV_PID% >nul 2>&1
)

endlocal
exit /b 0
