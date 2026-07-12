@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set LOG_FILE=.cryobox-local.log
set PID_FILE=.cryobox-local.pid
set PORT_FILE=.cryobox-local.port

echo 冻存盒管理系统（本地版）
echo 项目目录：%cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。
  echo 请先安装 Node.js LTS：https://nodejs.org/
  echo 安装后重新双击本文件。
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行：正在安装依赖。
  echo 如果网络较慢，请等待；中国大陆网络可尝试使用 npm 镜像源。
  echo.
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo.
    echo 依赖安装失败。请检查网络后重试，或手动运行：
    echo   npm install --registry=https://registry.npmmirror.com
    echo.
    pause
    exit /b 1
  )
)

set PORT=
if exist "%PORT_FILE%" (
  set /p SAVED_PORT=<"%PORT_FILE%"
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:%SAVED_PORT% -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 set PORT=%SAVED_PORT%
)

if "%PORT%"=="" (
  for /L %%P in (3000,1,3010) do (
    netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
    if errorlevel 1 (
      if "!PORT!"=="" set PORT=%%P
    )
  )
)

if "%PORT%"=="" (
  echo 启动失败：3000-3010 端口均被占用。
  echo.
  pause
  exit /b 1
)

set URL=http://localhost:%PORT%

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo 正在启动本地系统：%URL%
  echo %PORT%>"%PORT_FILE%"
  start "cryobox-local-server" /min cmd /c "set NEXT_PUBLIC_APP_MODE=local&& npm run dev -- --hostname 127.0.0.1 --port %PORT% > %LOG_FILE% 2>&1"

  powershell -NoProfile -Command "$ready=$false; for ($i=0; $i -lt 45; $i++) { try { Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2 | Out-Null; $ready=$true; break } catch { Start-Sleep -Seconds 1 } }; if ($ready) { exit 0 } else { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo 启动失败。日志文件：%LOG_FILE%
    echo.
    pause
    exit /b 1
  )
) else (
  echo 系统已经在运行：%URL%
)

echo 正在打开浏览器：%URL%
start "" "%URL%"
echo 完成。可以关闭此窗口，系统会继续在后台运行。
timeout /t 2 >nul
