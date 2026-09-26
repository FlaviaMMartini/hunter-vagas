@echo off
rem Busca vagas e guarda o log em data\logs (chamado pelo Agendador de Tarefas; veja "npm run agendar").
cd /d "%~dp0.."
call "%~dp0node.cmd"
if not exist data\logs mkdir data\logs
echo ===== %date% %time% ===== >> data\logs\busca.log
"%NODE%" --env-file-if-exists=.env src\hunt.js >> data\logs\busca.log 2>&1
