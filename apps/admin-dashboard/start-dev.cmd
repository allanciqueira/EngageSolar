@echo off
setlocal
cd /d "%~dp0"
echo Encerrando processo na porta 5173 (serve antigo)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Iniciando dev-server com proxy para http://127.0.0.1:8080 ...
node dev-server.mjs
