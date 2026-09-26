// Uso:
//   npm run apply            → só gera prévia das mensagens (nada é enviado)
//   npm run apply -- --test  → envia 1 candidatura de exemplo para VOCÊ mesma
//   npm run apply -- --send  → envia de verdade (respeita limite e intervalo)
import { writeFile, mkdir } from 'node:fs/promises';
import { loadStore } from './store.js';
import { loadPerfil, buildQueue, sendApplication } from './queue.js';
import { sendMail } from './mailer.js';
import { requireProfile } from './profile.js';

// Sem tela: sem perfil configurado, avisa e sai.
requireProfile();

const MODE = process.argv.includes('--send') ? 'send' : process.argv.includes('--test') ? 'test' : 'preview';
const MAX_PER_RUN = Number(process.env.MAX_SENDS_PER_RUN ?? 20);
const INTERVAL_SEC = Number(process.env.SEND_INTERVAL_SEC ?? 90);

const perfil = await loadPerfil();
const store = await loadStore();
const letters = buildQueue(store, perfil);

const day = new Date().toISOString().slice(0, 10);
await mkdir(new URL('../data/candidaturas/', import.meta.url), { recursive: true });
const preview = letters.map((l) =>
  `## ${l.job.title}\n\n- Vaga: ${l.job.url}\n- Para: **${l.to}**\n- Assunto: **${l.subject}**\n- Skills em comum: ${l.matched.join(', ') || '—'}\n\n\`\`\`\n${l.body}\n\`\`\`\n`,
).join('\n---\n\n');
await writeFile(new URL(`../data/candidaturas/previa-${day}.md`, import.meta.url), `# Candidaturas por e-mail — ${day} (${letters.length})\n\n${preview}`);
console.log(`📝 ${letters.length} candidaturas na fila. Prévia: data/candidaturas/previa-${day}.md`);

if (MODE === 'preview') process.exit(0);

if (MODE === 'test') {
  const l = letters[0];
  if (!l) process.exit(console.log('Fila vazia, nada para testar.'));
  const pass = process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '');
  await sendMail({ user: perfil.email, pass, fromName: perfil.nome, attachment: perfil.cv, to: perfil.email, subject: `[TESTE] ${l.subject}`, text: `(Iria para: ${l.to})\n\n${l.body}` });
  console.log(`✔ Teste enviado para ${perfil.email}.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sent = 0;
for (const l of letters.slice(0, MAX_PER_RUN)) {
  try {
    await sendApplication(store, perfil, { jobId: l.job.id, to: l.to, subject: l.subject, body: l.body });
    console.log(`✔ ${++sent}. ${l.subject} → ${l.to}`);
  } catch (err) {
    console.error(`✖ ${l.to}: ${err.message}`);
    if (/535|534|auth/i.test(err.message)) break;
  }
  // Intervalo com variação para não parecer disparo em massa.
  await sleep((INTERVAL_SEC + Math.random() * INTERVAL_SEC) * 1000);
}
console.log(`\nEnviadas: ${sent}/${letters.length}`);
