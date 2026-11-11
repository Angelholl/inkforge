@echo off
rem 墨炉启动器：起服务 + 开界面（MODE=tauri|browser 二选一）
set MODE=browser
cd /d %~dp0..
if "%MODE%"=="tauri" (
  start "墨炉-桌面" cmd /c "pnpm --filter @inkforge/desktop tauri dev"
) else (
  start "墨炉-服务" cmd /c "pnpm --filter @inkforge/server start"
  timeout /t 3 /nobreak >nul
  start "" "msedge.exe" --app=http://localhost:8787 2>nul || start "" http://localhost:8787
)
