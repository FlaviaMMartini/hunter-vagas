@echo off
rem Descobre qual Node usar. "npm run agendar" grava o caminho em scripts\node-path.txt,
rem porque o Agendador de Tarefas nem sempre enxerga o mesmo PATH do terminal.
set "NODE=node"
if exist "%~dp0node-path.txt" set /p NODE=<"%~dp0node-path.txt"
