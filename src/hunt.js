import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { fetchGupy } from './sources/gupy.js';
import { fetchLever } from './sources/ats.js';
import { fetchGreenhouse, addBoards, boardsInText } from './sources/greenhouse.js';
import { loadResponses } from './responses.js';
import { fetchInhire } from './sources/inhire.js';
import { fetchSolides } from './sources/solides.js';
import { fetchEmpregostec } from './sources/empregostec.js';
import { evaluate, dedupKey } from './filter.js';
import { loadStore, saveStore } from './store.js';
import { writeReport } from './report.js';
import { requireProfile } from './profile.js';
import { startProgress, sourceStarted, sourceStep, sourceFinished, finishProgress } from './progress.js';

// Sem tela: sem perfil configurado, avisa e sai.
requireProfile();

// Cada fonte recebe step(feitos, total, rótulo) para o painel mostrar o progresso ao vivo.
const sources = {
  gupy: (step) => fetchGupy(config.gupyTerms, step),
  lever: () => fetchLever(config.leverCompanies),
  greenhouse: (step) => fetchGreenhouse(config.greenhouseBoards, step),
  inhire: (step) => fetchInhire(config.inhireTenants, step),
  solides: (step) => fetchSolides(config.solidesTerms, step),
  empregostec: (step) => fetchEmpregostec(step),
};
if (!config.githubRepos?.length) delete sources.github;

const store = await loadStore();
// Primeira busca = sem vagas guardadas ainda (demora mais: baixa a descrição de cada vaga).
startProgress(Object.keys(sources), { firstRun: !Object.keys(store.jobs).length });

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
  const key = dedupKey(r);
  if (!approved.has(key) || approved.get(key).score < r.score) approved.set(key, r);
}

// Agregadores (Empregos Tech) apontam para a vaga original (Gupy, InHire…): a mesma vaga
// chega por dois caminhos com títulos diferentes. O link de candidatura desempata.
const urlKey = (u) => (u ?? '').toLowerCase().replace(/[?#].*$/, '')
  .replace(/(\/vagas\/[0-9a-f-]{36})\/.*$/, '$1') // InHire: o final do link (slug) varia
  .replace(/\/$/, '');
const byUrl = new Map();
for (const [key, r] of approved) {
  const k = urlKey(r.url);
  const prev = byUrl.get(k);
  if (!prev) { byUrl.set(k, key); continue; }
  // Fica a da plataforma original; o agregador só entra quando é a única fonte.
  if (approved.get(prev).source === 'empregostec' && r.source !== 'empregostec') { approved.delete(prev); byUrl.set(k, key); }
  else approved.delete(key);
}

const newIds = new Set();
const now = new Date().toISOString();
for (const j of approved.values()) {
  const prev = store.jobs[j.id];
  if (!prev) newIds.add(j.id);
  // Atualiza os dados da vaga SEM perder o que já aconteceu com ela (envio, destinatário, mensagem…).
  store.jobs[j.id] = { ...prev, ...j, firstSeenAt: prev?.firstSeenAt ?? now, lastSeenAt: now, status: prev?.status ?? 'nova' };
}
store.runs.push({ at: now, collected: raw.length, approved: approved.size, new: newIds.size });
await saveStore(store);

const path = await writeReport([...approved.values()], newIds, { collected: raw.length, rejected });
finishProgress({ collected: raw.length, approved: approved.size, new: newIds.size });
console.log(`\n✔ ${approved.size} vagas aprovadas (${newIds.size} novas). Relatório: ${fileURLToPath(path)}`);
