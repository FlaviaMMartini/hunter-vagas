// Agenda as rotinas automáticas no Windows (Agendador de Tarefas), sem precisar abrir o Agendador.
// Uso:
//   npm run agendar                  → busca de vagas a cada 1h + respostas do Gmail a cada 10 min
//   npm run agendar -- --painel      → também sobe o painel ao entrar no Windows
//   npm run desagendar               → remove tudo
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const TASKS = [
  { name: 'Hunter - Buscar vagas', script: 'buscar-vagas-oculto.vbs', every: 'PT1H', what: 'busca de vagas a cada 1 hora' },
  { name: 'Hunter - Respostas', script: 'verificar-respostas-oculto.vbs', every: 'PT10M', what: 'respostas do Gmail a cada 10 minutos' },
  { name: 'Hunter - Painel', script: 'painel-oculto.vbs', atLogon: true, optional: '--painel', what: 'painel ao entrar no Windows' },
];

const remove = process.argv.includes('--remover');
const wanted = TASKS.filter((t) => !t.optional || process.argv.includes(t.optional) || remove);

if (process.platform !== 'win32') {
  // Linux/macOS: não há Agendador de Tarefas; mostramos as linhas de crontab equivalentes.
  console.log('Agendamento automático é só para Windows. No Linux/macOS, adicione ao crontab (crontab -e):\n');
  console.log(`0 * * * *    cd "${ROOT}" && node --env-file-if-exists=.env src/hunt.js >> data/logs/busca.log 2>&1`);
  console.log(`*/10 * * * * cd "${ROOT}" && node --env-file-if-exists=.env src/check-responses.js >> data/logs/respostas.log 2>&1`);
  process.exit(0);
}

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
const q = (s) => `'${s.replace(/'/g, "''")}'`;

if (remove) {
  for (const t of wanted) ps(`Unregister-ScheduledTask -TaskName ${q(t.name)} -Confirm:$false -ErrorAction SilentlyContinue`);
  rmSync(new URL('../scripts/node-path.txt', import.meta.url), { force: true });
  console.log('✔ Rotinas automáticas do Hunter removidas.');
  process.exit(0);
}

// O Agendador nem sempre enxerga o mesmo PATH do terminal: grava o Node que está rodando agora.
writeFileSync(new URL('../scripts/node-path.txt', import.meta.url), process.execPath);

for (const t of wanted) {
  const trigger = t.atLogon
    ? 'New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME'
    : `New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval ([Xml.XmlConvert]::ToTimeSpan('${t.every}'))`;
  ps(`
    $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${q(`"${ROOT}\\scripts\\${t.script}"`)} -WorkingDirectory ${q(ROOT)}
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ${t.atLogon ? '([TimeSpan]::Zero)' : '(New-TimeSpan -Minutes 30)'}
    Register-ScheduledTask -TaskName ${q(t.name)} -Description ${q(`Hunter: ${t.what}`)} -Action $action -Trigger (${trigger}) -Settings $settings -Force | Out-Null`);
  console.log(`✔ ${t.name}: ${t.what}`);
}
console.log(`\nPronto. O PC precisa estar ligado; se estiver desligado no horário, roda assim que ligar.
Logs em data\\logs\\. Para remover: npm run desagendar${process.argv.includes('--painel') ? '' : '\nQuer o painel subindo sozinho ao entrar no Windows? npm run agendar -- --painel'}`);
