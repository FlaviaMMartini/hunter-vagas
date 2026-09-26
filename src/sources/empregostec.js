// Empregos Tech (empregostec.com.br): portal só de vagas 100% remotas.
// O feed RSS lista ~1000 vagas recentes; a página de cada vaga traz a descrição completa
// (JSON-LD JobPosting) e o link direto de candidatura (Gupy, InHire, etc.).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getText } from '../http.js';
import { normalizeLink } from '../posts.js';
import { cleanText } from '../filter.js';
import { addTenants, tenantsInLinks } from './inhire.js';
import { addBoards, boardsInText } from './greenhouse.js';

const FEED = 'https://www.empregostec.com.br/feed/';
const CACHE_FILE = new URL('../../data/empregostec-cache.json', import.meta.url);
// Só abrimos páginas cujo título pode ser de desenvolvimento (o filtro final vê a descrição).
const DEV_TITLE = /desenvolv|developer|engineer|engenheir|front|full|software|\bweb\b|react|tech lead|programador|arquitet|\bdev\b/i;

const tag = (s, t) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();

function parseFeed(xml) {
  return xml.split('<item>').slice(1).map((it) => ({
    title: tag(it, 'title') ?? '',
    link: tag(it, 'link'),
    pubDate: tag(it, 'pubDate'),
    category: tag(it, 'category')?.replace(/<!\[CDATA\[|\]\]>/g, ''),
  }));
}

// JobPosting (JSON-LD) + botão "Quero me Candidatar" da página da vaga.
function parsePage(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean)
    .flatMap((b) => b['@graph'] ?? [b]);
  const jp = blocks.find((b) => b['@type'] === 'JobPosting');
  if (!jp) return null;
  const apply = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)/g)]
    .find(([, , label]) => /candidat|aplicar|inscrev/i.test(label))?.[1];
  return {
    title: jp.title,
    description: jp.description ?? '',
    skills: jp.skills ?? '',
    company: jp.hiringOrganization?.name ?? null,
    datePosted: jp.datePosted,
    validThrough: jp.validThrough,
    employmentType: jp.employmentType,
    apply: apply ? normalizeLink(apply.replace(/&amp;/g, '&')) : null,
  };
}

// "Vaga Home Office: Desenvolvedor React - Sênior na empresa FCamara" → cargo e empresa
function splitTitle(raw) {
  const t = cleanText(raw);
  const m = t.replace(/^vaga home office:\s*/i, '').match(/^(.*?)\s+na empresa\s+(.+)$/i);
  return m ? { role: m[1].trim(), company: m[2].trim() } : { role: t.replace(/^vaga home office:\s*/i, '').trim(), company: null };
}

export async function fetchEmpregostec(step = () => {}) {
  const xml = await getText(FEED);
  if (!xml) return [];
  let cache = {};
  try { cache = JSON.parse(await readFile(CACHE_FILE, 'utf8')); } catch {}

  const jobs = [];
  const fresh = {};
  const items = parseFeed(xml);
  for (const [i, item] of items.entries()) {
    step(i + 1, items.length, 'lendo vagas do feed');
    const { role, company } = splitTitle(item.title);
    if (!item.link || !DEV_TITLE.test(role)) continue;
    // A página de uma vaga não muda: baixa uma vez só.
    if (!cache[item.link]) {
      const html = await getText(item.link, { delayMs: 350 });
      const page = html && parsePage(html);
      if (!page) continue;
      cache[item.link] = page;
    }
    const p = cache[item.link];
    fresh[item.link] = p;
    jobs.push({
      source: 'empregostec',
      id: `empregostec:${item.link.replace(/^https?:\/\/[^/]+\/|\/$/g, '')}`,
      title: role,
      company: p.company ?? company,
      text: [p.description, `Skills: ${p.skills}`, `Contratação: ${p.employmentType ?? ''}`, 'Modalidade: 100% remoto'].join('\n'),
      // Link direto da candidatura (Gupy, InHire...) quando existe; senão a página do Empregos Tech.
      url: p.apply ?? item.link,
      sourceUrl: item.link,
      remote: true,
      country: 'BR',
      publishedAt: p.datePosted ?? new Date(item.pubDate).toISOString(),
      stillOpen: p.validThrough ? new Date(p.validThrough) > new Date() : false,
    });
  }
  await mkdir(new URL('../../data/', import.meta.url), { recursive: true });
  // Guarda só o que ainda está no feed (o cache não cresce para sempre).
  await writeFile(CACHE_FILE, JSON.stringify(fresh));
  // Empresas da InHire vistas aqui passam a ser buscadas direto na próxima rodada.
  const novas = await addTenants(tenantsInLinks(jobs.map((j) => j.url)));
  if (novas.length) console.log(`  (InHire: ${novas.length} empresas novas pelo Empregos Tech: ${novas.join(', ')})`);
  const boards = await addBoards(boardsInText(jobs.map((j) => j.url).join(' ')));
  if (boards.length) console.log(`  (Greenhouse: ${boards.length} empresas novas pelo Empregos Tech: ${boards.join(', ')})`);
  return jobs;
}
