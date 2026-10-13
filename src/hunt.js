import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { fetchGupy } from './sources/gupy.js';
import { fetchLever } from './sources/ats.js';
import { fetchGreenhouse, addBoards, boardsInText } from './sources/greenhouse.js';
import { loadResponses } from './responses.js';
import { fetchInhire } from './sources/inhire.js';
import { fetchSolides } from './sources/solides.js';
import { fetchEmpregostec } from './sources/empregostec.js';
import { fetchRemotar } from './sources/remotar.js';
import { fetchRemoteIntl } from './sources/remote-intl.js';
import { fetchFreelance } from './sources/freelance.js';
import { fetchPostsWithEmail } from './sources/posts-email.js';
import { evaluate, dedupKey } from './filter.js';
import { loadStore, saveStore } from './store.js';
import { writeReport } from './report.js';
import { requireProfile } from './profile.js';
import { startProgress, sourceStarted, sourceStep, sourceFinished, finishProgress } from './progress.js';

// Sem tela: sem perfil configurado, avisa e sai.
requireProfile();

// --emails: "varrer vagas com e-mail" — só as fontes onde aparece e-mail de candidatura,
// e só as vagas com e-mail entram (vão direto para a fila de envio).
const emailsOnly = process.argv.includes('--emails');

// Cada fonte recebe step(feitos, total, rótulo) para o painel mostrar o progresso ao vivo.
const sources = {
  gupy: (step) => fetchGupy(config.gupyTerms, step),
  lever: () => fetchLever(config.leverCompanies),
  greenhouse: (step) => fetchGreenhouse(config.greenhouseBoards, step),
  inhire: (step) => fetchInhire(config.inhireTenants, step),
  solides: (step) => fetchSolides(config.solidesTerms, step),
  empregostec: (step) => fetchEmpregostec(step),
  remotar: (step) => fetchRemotar(config.remotarTerms, step),
  internacional: (step) => fetchRemoteIntl(config.stackTerm, step),
  freelance: (step) => fetchFreelance(config.stackTerm, step),
  posts: (step) => fetchPostsWithEmail(config.stackTerm, step),
};
if (!config.githubRepos?.length) delete sources.github;
const EMAIL_SOURCES = ['posts', 'github', 'solides', 'empregostec'];
if (emailsOnly) for (const k of Object.keys(sources)) if (!EMAIL_SOURCES.includes(k)) delete sources[k];

const store = await loadStore();
// Primeira busca = sem vagas guardadas ainda (demora mais: baixa a descrição de cada vaga).
startProgress(Object.keys(sources), { firstRun: !Object.keys(store.jobs).length, mode: emailsOnly ? 'emails' : 'completa' });

// Empresas do Greenhouse vistas nos e-mails de candidatura (lidos pela aba Respostas).
const resp = await loadResponses();
const fromEmails = await addBoards(Object.values(resp?.items ?? {}).flatMap((r) => boardsInText(`${r.text ?? ''} ${r.snippet ?? ''}`)));
if (fromEmails.length) console.log(`  (Greenhouse: ${fromEmails.length} empresas novas pelos e-mails: ${fromEmails.join(', ')})`);
const raw = [];
for (const [name, fetcher] of Object.entries(sources)) {
  process.stdout.write(`→ ${name}... `);
  sourceStarted(name);
  let error = null;
  const jobs = await fetcher((done, total, label) => sourceStep(name, done, total, label))
    .catch((e) => { error = e.message; console.warn(e.message); return []; });
  sourceFinished(name, jobs.length, error);
  console.log(`${jobs.length}`);
  raw.push(...jobs);
}

const rejected = {};
const approved = new Map();
for (const job of raw) {
  const r = evaluate(job, config);
  if (r.rejected) {
    rejected[r.rejected] = (rejected[r.rejected] ?? 0) + 1;
    continue;
  }
  if (emailsOnly && r.channel !== 'email') continue;
  const key = dedupKey(r);
  if (!approved.has(key) || approved.get(key).score < r.score) approved.set(key, r);
}

// Agregadores (Empregos Tech, Remotar) apontam para a vaga original (Gupy, InHire…): a mesma vaga
// chega por dois caminhos com títulos diferentes. O link de candidatura desempata.
const urlKey = (u) => (u ?? '').toLowerCase().replace(/[?#].*$/, '')
  .replace(/(\/vagas\/[0-9a-f-]{36})\/.*$/, '$1') // InHire: o final do link (slug) varia
  .replace(/\/$/, '');
const AGGREGATORS = ['empregostec', 'remotar'];
const CAPTURED = ['captura', 'linkedin'];
const byUrl = new Map();
for (const [key, r] of approved) {
  const k = urlKey(r.url);
  const prev = byUrl.get(k);
  if (!prev) { byUrl.set(k, key); continue; }
  // Fica a da plataforma original; o agregador só entra quando é a única fonte.
  if (AGGREGATORS.includes(approved.get(prev).source) && !AGGREGATORS.includes(r.source)) { approved.delete(prev); byUrl.set(k, key); }
  else approved.delete(key);
}

// Mesma vaga que você já tratou (candidatou, descartou, enviou) vinda por outra fonte/captura: não volta.
const handled = Object.values(store.jobs).filter((j) => j.status !== 'nova');
const handledKeys = new Set(handled.filter((j) => j.company).map(dedupKey));
const handledUrls = new Set(handled.map((j) => urlKey(j.url)).filter(Boolean));
const alreadyHandled = (j) => (j.company && handledKeys.has(dedupKey(j))) || handledUrls.has(urlKey(j.url));
for (const [id, j] of Object.entries(store.jobs)) {
  if (j.status === 'nova' && !CAPTURED.includes(j.source) && alreadyHandled(j)) delete store.jobs[id];
}

const newIds = new Set();
const now = new Date().toISOString();
for (const j of approved.values()) {
  const prev = store.jobs[j.id];
  if (!prev && alreadyHandled(j)) continue;
  if (!prev) newIds.add(j.id);
  // Atualiza os dados da vaga SEM perder o que já aconteceu com ela (envio, destinatário, mensagem…).
  store.jobs[j.id] = { ...prev, ...j, firstSeenAt: prev?.firstSeenAt ?? now, lastSeenAt: now, status: prev?.status ?? 'nova' };
}
store.runs.push({ at: now, collected: raw.length, approved: approved.size, new: newIds.size });
await saveStore(store);

const path = await writeReport([...approved.values()], newIds, { collected: raw.length, rejected }, { suffix: emailsOnly ? '-emails' : '' });
finishProgress({ collected: raw.length, approved: approved.size, new: newIds.size, mode: emailsOnly ? 'emails' : 'completa' });
console.log(`\n✔ ${approved.size} vagas aprovadas (${newIds.size} novas). Relatório: ${fileURLToPath(path)}`);
