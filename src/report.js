import { writeFile } from 'node:fs/promises';

const row = (j, isNew) =>
  `| ${isNew ? '🆕 ' : ''}${j.modality === 'remoto' ? '' : '🏢 '}[${j.title.replace(/\|/g, '/')}](${j.url}) | ${j.company ?? '—'} | ${j.level} | ` +
  `${(j.extras ?? []).join(', ') || '—'} | ${j.emails.join(', ') || '—'} | ${j.ageDays}d | ${j.source} |`;

const HEADER = '| Vaga | Empresa | Nível | Extras | E-mail | Idade | Fonte |\n|---|---|---|---|---|---|---|';

export async function writeReport(jobs, newIds, stats) {
  const day = new Date().toISOString().slice(0, 10);
  const sorted = [...jobs].sort((a, b) => b.score - a.score || a.ageDays - b.ageDays);
  const byEmail = sorted.filter((j) => j.channel === 'email');
  const byPlatform = sorted.filter((j) => j.channel !== 'email');
  const md = `# Relatório do Hunter — ${day}

- Coletadas: **${stats.collected}** · Aprovadas no filtro: **${jobs.length}** · Novas nesta rodada: **${newIds.size}**
- Rejeitadas: ${Object.entries(stats.rejected).map(([k, v]) => `${k} ${v}`).join(' · ')}

## 📧 Candidatura por e-mail (${byEmail.length})

${HEADER}
${byEmail.map((j) => row(j, newIds.has(j.id))).join('\n')}

## 🖱️ Candidatura pela plataforma (${byPlatform.length})

${HEADER}
${byPlatform.map((j) => row(j, newIds.has(j.id))).join('\n')}
`;
  const path = new URL(`../data/relatorio-${day}.md`, import.meta.url);
  await writeFile(path, md);
  return path;
}
