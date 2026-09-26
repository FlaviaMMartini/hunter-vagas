// Greenhouse: API pública oficial por empresa (boards-api.greenhouse.io/v1/boards/{empresa}/jobs).
// Sem portal central: a lista de empresas cresce com links vistos nas capturas, no Empregos Tech
// e nos e-mails do Greenhouse no seu Gmail.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getJson } from '../http.js';
import { cleanText } from '../filter.js';

const FILE = new URL('../../data/greenhouse-empresas.json', import.meta.url);
const IGNORE = new Set(['embed', 'jobs', 'job_app', 'v1', 'boards', 'www', 'api']);

const readSaved = async () => {
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return { boards: [], invalid: [] }; }
};

export async function addBoards(names) {
  const saved = await readSaved();
  const added = [...new Set(names.map((n) => n.toLowerCase()))]
    .filter((n) => /^[a-z0-9_-]{2,60}$/.test(n) && !IGNORE.has(n) && !saved.boards.includes(n) && !saved.invalid.includes(n));
  if (!added.length) return [];
  saved.boards.push(...added);
  await mkdir(new URL('../../data/', import.meta.url), { recursive: true });
  await writeFile(FILE, JSON.stringify(saved, null, 2));
  return added;
}

// job-boards.greenhouse.io/empresa/jobs/123 · boards.greenhouse.io/empresa · …/embed/job_app?for=empresa
export const boardsInText = (text) => [...new Set(
  [...String(text).matchAll(/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_app\?for=)?([a-z0-9_-]+)/gi)].map((m) => m[1].toLowerCase()),
)].filter((b) => !IGNORE.has(b));

// "Remote - United States" não é Brasil só por ter "Remote": tira a palavra e vê o que sobra.
const BR_PLACE = /brazil|brasil|latam|latin america|am[eé]rica latina|south america|americas|anywhere|worldwide|s[aã]o paulo|rio de janeiro|florian[oó]polis|belo horizonte|curitiba|porto alegre|recife|campinas/i;
function countryOf(location) {
  if (BR_PLACE.test(location)) return 'BR';
  const rest = location.replace(/remot[eo]|home office|hybrid|h[ií]brido|[-,()|/]/gi, ' ').trim();
  return rest || null; // só "Remote": país desconhecido, o filtro decide pelo texto
}

export async function fetchGreenhouse(seed, step = () => {}) {
  const saved = await readSaved();
  const invalid = new Set(saved.invalid);
  const boards = [...new Set([...seed, ...saved.boards])].filter((b) => !invalid.has(b));
  const jobs = [];
  const nowInvalid = [];
  for (const [i, board] of boards.entries()) {
    step(i + 1, boards.length, `empresa ${board}`);
    const res = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, { delayMs: 300 });
    if (!res) { nowInvalid.push(board); continue; }
    for (const p of res.jobs ?? []) {
      const location = p.location?.name ?? '';
      jobs.push({
        source: `greenhouse:${board}`,
        id: `greenhouse:${p.id}`,
        title: p.title.trim(),
        company: p.company_name ?? board,
        // O conteúdo vem como HTML "escapado" (&lt;p&gt;): decodifica e depois tira as tags.
        text: `${cleanText(cleanText(p.content ?? ''))}\nLocal: ${location}`,
        url: p.absolute_url,
        remote: /remot|anywhere|home office|work from home/i.test(location) || null,
        city: location,
        country: countryOf(location),
        publishedAt: p.first_published ?? p.updated_at,
        // A API só lista vagas abertas.
        stillOpen: true,
      });
    }
  }
  // Empresa que não existe no Greenhouse (404) sai da lista.
  if (nowInvalid.length) {
    saved.invalid = [...new Set([...saved.invalid, ...nowInvalid])];
    await mkdir(new URL('../../data/', import.meta.url), { recursive: true });
    await writeFile(FILE, JSON.stringify(saved, null, 2));
  }
  return jobs;
}
