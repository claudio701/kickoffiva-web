@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set LOG=%~dp0alarmas-setup.log
echo ==== Setup alarmas %date% %time% ==== > "%LOG%"

set "RT=%LOCALAPPDATA%\Programs\Kimi\resources\resources\runtime"
if exist "%RT%\node.exe" set "PATH=%RT%;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
call node -v >nul 2>&1 || ( echo [ERROR] No se pudo ejecutar node.exe & goto :fin )

echo.
echo ===== KickoffIVA: instalar sistema de alarmas (cron + email) =====
echo.
echo Requisito: haber ejecutado LOGIN-CLOUDFLARE.cmd antes (sesion de Wrangler).
echo.

rem --- 1) Secreto compartido entre la API (Pages) y el Worker ---------------
for /f "delims=" %%G in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"') do set "CRON_SECRET=%%G"
if "%CRON_SECRET%"=="" ( echo [ERROR] no se pudo generar el secreto & goto :fin )
echo [1/5] Guardando CRON_SECRET en Cloudflare Pages (kickoffiva-web)...
echo %CRON_SECRET%| call npx --yes wrangler@4 pages secret put CRON_SECRET --project-name kickoffiva-web >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] no se pudo guardar el secreto en Pages. Revisa alarmas-setup.log & goto :fin )

rem --- 2) Redeploy de la API para que tome el secreto -----------------------
echo [2/5] Redesplegando la API (Pages) para activar el secreto...
if not exist dist\index.html ( echo [ERROR] falta dist\. Ejecuta DEPLOY.cmd primero. & goto :fin )
call npx --yes wrangler@4 pages deploy dist --project-name kickoffiva-web --commit-dirty=true >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] redeploy fallo. Revisa alarmas-setup.log & goto :fin )

rem --- 3) Worker: secreto + (opcional) clave de Resend ----------------------
cd /d "%~dp0cron-worker"
echo [3/5] Guardando CRON_SECRET en el Worker...
echo %CRON_SECRET%| call npx --yes wrangler@4 secret put CRON_SECRET >> "%LOG%" 2>&1
if errorlevel 1 (
  rem Primer deploy: el worker aun no existe. Se despliega y se reintenta.
  call npx --yes wrangler@4 deploy >> "%LOG%" 2>&1
  echo %CRON_SECRET%| call npx --yes wrangler@4 secret put CRON_SECRET >> "%LOG%" 2>&1
  if errorlevel 1 ( echo [ERROR] no se pudo guardar el secreto en el Worker. Revisa alarmas-setup.log & goto :fin )
)
echo.
set "RESEND_API_KEY="
choice /c SN /t 45 /d N /m "Tienes ya una clave API de Resend (re_...) para el email? S=si, N=no (en 45 s sigue solo)"
if errorlevel 2 goto :sinresend
set /p RESEND_API_KEY="Pega la clave de Resend y Enter: "
if not "%RESEND_API_KEY%"=="" (
  echo %RESEND_API_KEY%| call npx --yes wrangler@4 secret put RESEND_API_KEY >> "%LOG%" 2>&1
  if errorlevel 1 ( echo [AVISO] no se pudo guardar RESEND_API_KEY; el cron correra sin email. )
)
:sinresend
set "RESEND_API_KEY="

rem --- 4) Deploy del Worker con el cron ------------------------------------
echo [4/5] Desplegando el Worker kickoffiva-cron (cron diario 12:07 UTC)...
call npx --yes wrangler@4 deploy >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] deploy del Worker fallo. Revisa alarmas-setup.log & goto :fin )

rem --- 5) Corrida de prueba ------------------------------------------------
echo [5/5] Corrida de prueba del cron...
for /f "delims=" %%U in ('powershell -NoProfile -Command "$l = Get-Content -Raw '%LOG%'; if ($l -match 'https://kickoffiva-cron[^\s]*workers\.dev') { $matches[0] } else { '' }"') do set "WURL=%%U"
if "%WURL%"=="" ( echo [AVISO] no encontre la URL del Worker en el log; pruebalo desde el dashboard de Cloudflare. & goto :ok )
echo Worker: %WURL%
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WURL%/run' -Headers @{ 'x-cron-secret' = '%CRON_SECRET%' } -TimeoutSec 120; $r.Content | Out-File -Encoding utf8 '%~dp0..\alarmas-prueba.json'; $r.Content } catch { ('ERROR: ' + $_.Exception.Message) | Tee-Object -FilePath '%~dp0..\alarmas-prueba.json' }"

:ok )
echo Worker: %WURL%
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WURL%/run' -Headers @{ 'x-cron-secret' = '%CRON_SECRET%' } -TimeoutSec 90; $r.Content } catch { 'ERROR: ' + $_.Exception.Message }" | tee "%~dp0..\alarmas-prueba.json" 2>nul || powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WURL%/run' -Headers @{ 'x-cron-secret' = '%CRON_SECRET%' } -TimeoutSec 90; $r.Content | Out-File -Encoding utf8 '%~dp0..\alarmas-prueba.json'; $r.Content } catch { 'ERROR: ' + $_.Exception.Message }"

:ok
echo.
echo ===== LISTO. El cron corre solo todos los dias. Resultado de la prueba en alarmas-prueba.json =====
echo (El secreto NO queda guardado en disco; vive en Cloudflare.)

:fin
set "CRON_SECRET="
echo FIN %date% %time% >> "%LOG%"
echo.
pause
