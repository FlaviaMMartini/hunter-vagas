@echo off
rem Roda a busca de vagas e guarda o log em data\logs (usado pelo Agendador de Tarefas).
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
echo ===== %date% %time% ===== >> data\logs\busca.log
node src\hunt.js >> data\logs\busca.log 2>&1
