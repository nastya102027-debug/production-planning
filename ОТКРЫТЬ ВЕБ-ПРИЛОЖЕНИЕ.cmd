@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "Production planning" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
