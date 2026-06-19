@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   WeeklyHome - avvio rapido (senza build)
echo ============================================
echo.

if not exist "apps\api\dist\main.js" (
  echo *** API non ancora compilata: manca apps\api\dist\main.js
  echo *** Lancia prima start.bat almeno una volta.
  exit /b 1
)

echo Avvio servizi in finestre separate...
start "WeeklyHome API" cmd /k "cd /d "%~dp0" && npm --workspace @weeklyhome/api run start"
start "WeeklyHome Web" cmd /k "cd /d "%~dp0" && npm --workspace @weeklyhome/web run dev"

echo.
echo   API : http://localhost:3000/api
echo   Web : http://localhost:5173
echo.
echo Nota: salta i build. Se hai cambiato codice API/dominio usa start.bat.
echo Per fermare tutto: stop.bat
