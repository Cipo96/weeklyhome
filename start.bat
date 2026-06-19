@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   WeeklyHome - avvio
echo ============================================

echo.
echo [1/3] Build del dominio...
call npm run build:domain
if errorlevel 1 goto :err

echo.
echo [2/3] Build dell'API (prisma generate + tsc)...
call npm --workspace @weeklyhome/api run build
if errorlevel 1 goto :err

echo.
echo [3/3] Avvio servizi in finestre separate...
start "WeeklyHome API" cmd /k "cd /d "%~dp0" && npm --workspace @weeklyhome/api run start"
start "WeeklyHome Web" cmd /k "cd /d "%~dp0" && npm --workspace @weeklyhome/web run dev"

echo.
echo   API : http://localhost:3000/api
echo   Web : http://localhost:5173
echo.
echo I log girano nelle due finestre appena aperte.
echo Per fermare tutto: stop.bat
echo.
goto :eof

:err
echo.
echo *** Build fallita: controlla l'errore qui sopra. ***
exit /b 1
