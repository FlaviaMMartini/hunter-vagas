// Vagas excluídas (✕): você viu e não quer aplicar. Ficam em data/excluidas.json e a busca nunca
// mais traz a mesma vaga — nem por outra fonte, nem com o nome da empresa escrito diferente
// ("FCamara" × "Grupo FCamara") ou o link com outro formato.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fold } from './profile.js';

const FILE = new URL('../data/excluidas.json', import.meta.url);

// Link sem parâmetros e sem barra final; InHire: o final do link (slug) varia.
export const urlKey = (u) => (u ?? '').toLowerCase().replace(/[?#].*$/, '')
  .replace(/(\/vagas\/[0-9a-f-]{36})\/.*$/, '$1')
  .replace(/=+$/, '')
  .replace(/\/$/, '');

// Gupy: o link traz o id da vaga em base64 ({"jobId":123,...}) ou direto (/jobs/123).
function gupyId(url) {
  const b64 = String(url ?? '').match(/gupy\.io\/job\/([A-Za-z0-9_-]+)/)?.[1];
  if (b64) {
    try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).jobId ?? null; } catch { /* segue */ }
  }
  return String(url ?? '').match(/gupy\.io\/jobs\/(\d+)/)?.[1] ?? null;
}

const COMPANY_NOISE = /\b(grupo|group|ltda|s\/?a|sa|me|eireli|inc|llc|tecnologia|technology|tech|brasil|brazil|digital|sistemas|solucoes|solutions|consultoria|software)\b/g;
const companyKey = (c) => fold(c).toLowerCase().replace(/[^\w\s/]+/g, ' ').replace(COMPANY_NOISE, ' ').replace(/[^a-z0-9]+/g, '');
const TITLE_NOISE = /\b(remot[oa]|remote|100|home ?office|hibrid[oa]|hybrid|vaga|oportunidade)\b/g;
const titleKey = (t) => fold(t).toLowerCase().replace(/\((a|o|as|os)\)/g, '')
  .replace(/\bsr\b\.?/g, 'senior').replace(/\bpl\b\.?/g, 'pleno').replace(/\bjr\b\.?/g, 'junior')
  .replace(/\bdesenvolvedor[a]?\b|\bpessoa desenvolvedora\b/g, 'dev').replace(/\bdeveloper\b/g, 'dev')
  .replace(TITLE_NOISE, ' ').replace(/[^a-z0-9]+/g, '');

// Em vaga capturada, o "link" pode ser o feed, um encurtador repetido em vários posts ou um site
// qualquer citado no texto: só vale como identidade se for página de vaga de uma plataforma conhecida.
const JOB_PAGE = /gupy\.io\/jobs?\/|inhire\.app\/vagas\/|greenhouse\.io\/.+\/jobs\/|lever\.co\/.+\/[0-9a-f-]{36}|solides\.jobs\/.+\/vacancies|vagas\.solides|remotar\.com\.br\/job\/|99freelas\.com\.br\/project\/|freelancer\.com\/projects\/|github\.com\/.+\/issues\/\d|weworkremotely\.com\/remote-jobs\/|remoteok\.com\/remote-jobs\/|jobicy\.com\/jobs\/|remotive\.com\/remote-jobs\/|news\.ycombinator\.com\/item/;
const CAPTURED = ['captura', 'linkedin'];

// Várias "impressões digitais" da vaga: basta uma bater para ser a mesma.
export function fingerprints(job) {
  const fp = [];
  const u = urlKey(job.url);
  if (u.startsWith('http') && (!CAPTURED.includes(job.source) || JOB_PAGE.test(u))) fp.push(`u:${u}`);
  const g = gupyId(job.url);
  if (g) fp.push(`gupy:${g}`);
  const c = companyKey(job.company);
  const t = titleKey(job.title);
  if (c.length >= 2 && t.length >= 4) fp.push(`c:${c}|${t}`);
  if (job.id) fp.push(`id:${job.id}`);
  return fp;
}

export async function loadExcluded() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return null; }
}

const save = async (ex) => {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(FILE, JSON.stringify(ex, null, 2));
};

// Primeira vez: começa com tudo que você já marcou como descartada.
export async function excludedFor(store) {
  let ex = await loadExcluded();
  if (!ex) {
    ex = { items: {} };
    for (const j of Object.values(store.jobs)) if (j.status === 'descartada') add(ex, j, j.statusAt);
    await save(ex);
  }
  return ex;
}

function add(ex, job, at = new Date().toISOString()) {
  ex.items[job.id] = { id: job.id, title: job.title, company: job.company, url: job.url, source: job.source, at, fp: fingerprints(job) };
}

export async function excludeJob(store, job) {
  const ex = await excludedFor(store);
  add(ex, job);
  await save(ex);
}

export async function restoreJob(store, id) {
  const ex = await excludedFor(store);
  delete ex.items[id];
  await save(ex);
}

// Conjunto de impressões digitais para checar rápido muitas vagas.
export const fingerprintSet = (ex) => new Set(Object.values(ex?.items ?? {}).flatMap((i) => i.fp));
export const isExcluded = (set, job) => fingerprints(job).some((f) => set.has(f));
