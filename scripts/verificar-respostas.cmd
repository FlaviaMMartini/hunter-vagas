@echo off
rem Confere respostas no Gmail e notifica entrevistas (usado pelo Agendador de Tarefas a cada 10 min).
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
node --env-file=.env src\check-responses.js >> data\logs\respostas.log 2>&1
