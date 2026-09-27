@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "OUT=%USERPROFILE%\Downloads\kickoffiva-web-src.zip"
if exist "%OUT%" del /q "%OUT%"
echo Exportando el proyecto (sin node_modules/dist) a %OUT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$src=(Get-Location).Path; $tmp=Join-Path $env:TEMP 'kickoffiva-export'; if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force}; New-Item -ItemType Directory $tmp | Out-Null; robocopy $src $tmp /E /XD node_modules dist dist-ssr .wrangler /XF deploy.log /NFL /NDL /NJH /NJS /NP | Out-Null; if($LASTEXITCODE -ge 8){ Write-Host 'ERROR robocopy'; exit 1 }; Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $env:OUT -Force; Remove-Item $tmp -Recurse -Force; Write-Host ('OK ' + (Get-Item $env:OUT).Length + ' bytes')"
if errorlevel 1 ( echo [ERROR] no se pudo exportar ) else ( echo Listo: %OUT% )
timeout /t 5 >nul
