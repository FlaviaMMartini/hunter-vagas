@echo off
rem Confere respostas no Gmail e notifica entrevistas (chamado pelo Agendador de Tarefas; veja "npm run agendar").
cd /d "%~dp0.."
call "%~dp0node.cmd"
if not exist data\logs mkdir data\logs
"%NODE%" --env-file-if-exists=.env src\check-responses.js >> data\logs\respostas.log 2>&1
