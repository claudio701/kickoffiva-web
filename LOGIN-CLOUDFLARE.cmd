@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "RT=%LOCALAPPDATA%\Programs\Kimi\resources\resources\runtime"
if exist "%RT%\node.exe" set "PATH=%RT%;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
echo.
echo ===== Login de Cloudflare (Wrangler) =====
echo Se va a abrir el navegador. Inicia sesion en Cloudflare si hace falta y haz clic en "Allow".
echo Luego vuelve a esta ventana: debe decir "Successfully logged in".
echo.
call npx --yes wrangler@4 login
echo.
echo Verificando cuenta...
call npx --yes wrangler@4 whoami
echo.
echo Si arriba aparece tu correo/cuenta, ya puedes ejecutar DEPLOY.cmd
pause
