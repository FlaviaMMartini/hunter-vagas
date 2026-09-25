// InHire não tem portal central: cada empresa tem sua página (empresa.inhire.app/vagas).
// Usamos a mesma API pública que essas páginas usam, empresa por empresa.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getJson } from '../http.js';

const API = 'https://api.inhire.app/job-posts/public/pages';
const TENANTS_FILE = new URL('../../data/inhire-empresas.json', import.meta.url);
const CACHE_FILE = new URL('../../data/inhire-cache.json', import.meta.url);
const CACHE_DAYS = 3;
// Só buscamos detalhes de vagas cujo título pode ser de desenvolvimento (o filtro final vê o corpo).
const DEV_TITLE = /desenvolv|developer|engineer|engenheir|front|full|software|\bweb\b|react|tech lead|programador|arquitet|\bdev\b/i;

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

// Empresas conhecidas = lista inicial + as descobertas (vagas capturadas, Empregos Tech, e-mails da InHire).
export async function loadTenants(seed) {
  const saved = await readJson(TENANTS_FILE, { tenants: [], invalid: [] });
  const invalid = new Set(saved.invalid);
  return { tenants: [...new Set([...seed, ...saved.tenants])].filter((t) => !invalid.has(t)), saved };
}

export async function addTenants(names) {
  const saved = await readJson(TENANTS_FILE, { tenants: [], invalid: [] });
  const clean = names.map((n) => n.toLowerCase().trim()).filter((n) => /^[a-z0-9-]{2,60}$/.test(n) && !['www', 'api', 'files', 'cdn', 'ses-mail', 'carreira', 'help'].includes(n));
  const added = clean.filter((n) => !saved.tenants.includes(n) && !saved.invalid.includes(n));
  if (!added.length) return [];
  saved.tenants.push(...added);
  await mkdir(new URL('../../data/', import.meta.url), { recursive: true });
  await writeFile(TENANTS_FILE, JSON.stringify(saved, null, 2));
  return added;
}

// Acha nomes de empresa em links: empresa.inhire.app/... ou empresa.inhire.com.br/...
export const tenantsInLinks = (links) =>
  [...new Set(links.map((l) => l.match(/^https?:\/\/([a-z0-9-]+)\.inhire\.(?:app|com\.br)/i)?.[1]).filter(Boolean))];

export async function fetchInhire(seed) {
  const { tenants, saved } = await loadTenants(seed);
  const cache = await readJson(CACHE_FILE, {});
  const jobs = [];
  const invalid = [];
  for (const tenant of tenants) {
    const headers = { 'X-Tenant': tenant, 'X-Client': 'web-inhire' };
    const list = await getJson(`${API}/lean`, { headers, delayMs: 250 });
    if (!Array.isArray(list)) {
      if (list?.message) invalid.push(tenant);
      continue;
    }
    for (const item of list.filter((j) => DEV_TITLE.test(j.displayName))) {
      const cached = cache[item.jobId];
      let detail = cached && Date.now() - cached.fetchedAt < CACHE_DAYS * 864e5 ? cached.detail : null;
      if (!detail) {
        detail = await getJson(`${API}/${item.jobId}`, { headers, delayMs: 250 });
        if (!detail?.jobId) continue;
        cache[item.jobId] = { fetchedAt: Date.now(), detail };
      }
      const location = detail.location ?? '';
      jobs.push({
        source: `inhire:${tenant}`,
        id: `inhire:${item.jobId}`,
        title: (detail.displayName ?? item.displayName).trim(),
        company: detail.tenantName ?? tenant,
        text: [detail.description, detail.locationComplement, detail.contractType?.join(', ')].filter(Boolean).join('\n'),
        // Sem o segmento final (/-) a página da InHire fica preta: o app exige o "slug".
        url: `https://${tenant}.inhire.app/vagas/${item.jobId}/-`,
        remote: detail.workplaceType === 'Remote',
        workplace: detail.workplaceType,
        city: location,
        country: /,\s*BR$/i.test(location) ? 'BR' : location ? location.split(',').at(-1).trim() : null,
        publishedAt: detail.lastPublishedAt ?? detail.publishedAt ?? detail.createdAt,
        stillOpen: detail.status === 'published',
      });
    }
  }
  // Empresa que a API diz não existir sai da lista (evita chamadas inúteis).
  if (invalid.length) {
    saved.invalid = [...new Set([...saved.invalid, ...invalid])];
    await writeFile(TENANTS_FILE, JSON.stringify(saved, null, 2));
  }
  await mkdir(new URL('../../data/', import.meta.url), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache));
  return jobs;
}
