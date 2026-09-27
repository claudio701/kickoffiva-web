@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set LOG=%~dp0deploy.log
echo ==== KickoffIVA deploy %date% %time% ==== > "%LOG%"

rem --- Ubicar Node si no esta en PATH -------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  for %%D in ("%LOCALAPPDATA%\Programs\Kimi\resources\resources\runtime" "%ProgramFiles%\nodejs" "%ProgramFiles(x86)%\nodejs" "%LOCALAPPDATA%\Programs\nodejs" "%APPDATA%\nvm\current") do (
    if exist "%%~D\node.exe" set "PATH=%%~D;%PATH%"
  )
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro node.exe en este equipo. >> "%LOG%"
  echo [ERROR] No se encontro node.exe. Instala Node 20+ desde https://nodejs.org y vuelve a ejecutar.
  goto :fin
)
echo node: >> "%LOG%"
call node -v >> "%LOG%" 2>&1
call npm -v >> "%LOG%" 2>&1

echo. >> "%LOG%"
echo ==== 1/5 npm install ==== >> "%LOG%"
echo [1/5] npm install ...
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] npm install fallo. Revisa deploy.log & goto :fin )

echo. >> "%LOG%"
echo ==== 2/5 tests + type-check functions ==== >> "%LOG%"
echo [2/5] tests y type-check ...
call node --test tests/sanitize.test.mjs tests/rut.test.mjs >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] tests fallaron. Revisa deploy.log & goto :fin )
call npx tsc -p tsconfig.functions.json >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] type-check de functions fallo. Revisa deploy.log & goto :fin )

echo. >> "%LOG%"
echo ==== 3/5 npm run build ==== >> "%LOG%"
echo [3/5] build ...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] build fallo. Revisa deploy.log & goto :fin )

echo. >> "%LOG%"
echo ==== 4/5 wrangler pages deploy ==== >> "%LOG%"
echo [4/5] deploy a Cloudflare Pages (si pide login, se abre el navegador: clic en Allow) ...
call npx --yes wrangler@4 pages deploy dist --project-name kickoffiva-web --commit-dirty=true >> "%LOG%" 2>&1
if errorlevel 1 ( echo [ERROR] deploy fallo. Revisa deploy.log & goto :fin )

echo. >> "%LOG%"
echo ==== 5/5 verificacion en vivo ==== >> "%LOG%"
echo [5/5] verificando https://api.kickoffiva.cl ...
timeout /t 20 /nobreak >nul
call node scripts/verify-api.mjs https://api.kickoffiva.cl >> "%LOG%" 2>&1
if errorlevel 1 ( echo [AVISO] alguna verificacion fallo. Revisa deploy.log & goto :fin )

echo. >> "%LOG%"
echo ==== OK: deploy completo ==== >> "%LOG%"
echo.
echo ===== LISTO: deploy completo y verificado. =====

:fin
echo FIN %date% %time% >> "%LOG%"
echo.
echo (El detalle quedo en deploy.log)
pause
