@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   WeeklyHome - arresto
echo ============================================
echo.

rem 1) Chiude chi e' in ascolto sulle porte dei servizi (modo piu' affidabile)
for %%p in (3000 5173) do (
  set "found="
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p " ^| findstr LISTENING') do (
    echo  Porta %%p  ->  termino PID %%a
    taskkill /F /PID %%a >nul 2>&1
    set "found=1"
  )
  if not defined found echo  Porta %%p  ->  nessun processo in ascolto
)

rem 2) Chiude anche le finestre cmd aperte da start.bat (se ancora aperte)
taskkill /F /FI "WINDOWTITLE eq WeeklyHome API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq WeeklyHome Web*" >nul 2>&1

echo.
echo Fatto.
