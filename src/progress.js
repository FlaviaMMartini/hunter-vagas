// Progresso da busca em data/busca-progresso.json: o painel lê e mostra ao vivo
// (vale para a busca do botão e para a agendada, que roda em outro processo).
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

const FILE = new URL('../data/busca-progresso.json', import.meta.url);
let state = null;
let lastWrite = 0;

function flush(force = false) {
  // No máximo 1 gravação por segundo: fontes com milhares de passos não martelam o disco.
  if (!force && Date.now() - lastWrite < 1000) return;
  lastWrite = Date.now();
  state.updatedAt = new Date().toISOString();
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function startProgress(sourceNames, { firstRun = false } = {}) {
  state = {
    startedAt: new Date().toISOString(),
    firstRun,
    sources: Object.fromEntries(sourceNames.map((n) => [n, { status: 'pending' }])),
  };
  flush(true);
}

export function sourceStarted(name) {
  Object.assign(state.sources[name], { status: 'running', startedAt: new Date().toISOString() });
  flush(true);
}

// Passo dentro de uma fonte: "empresa 23 de 70".
export function sourceStep(name, done, total, label) {
  if (!state) return;
  Object.assign(state.sources[name], { done, total, label });
  flush();
}

export function sourceFinished(name, found, error) {
  Object.assign(state.sources[name], { status: error ? 'error' : 'done', found, error, done: undefined, total: undefined });
  flush(true);
}

export function finishProgress(summary) {
  Object.assign(state, { finishedAt: new Date().toISOString(), summary });
  flush(true);
}

export function readProgress() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return null; }
}
