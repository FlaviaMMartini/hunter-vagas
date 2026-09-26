@echo off
rem Sobe o painel ao entrar no Windows (opcional: "npm run agendar -- --painel").
cd /d "%~dp0.."
call "%~dp0node.cmd"
if not exist data\logs mkdir data\logs
"%NODE%" --env-file-if-exists=.env src\server.js >> data\logs\painel.log 2>&1
