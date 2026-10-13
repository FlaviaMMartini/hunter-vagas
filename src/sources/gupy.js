import { getText } from '../http.js';

// A Gupy desligou a API aberta do portal (out/2026): a página de busca traz as vagas embutidas
// (__NEXT_DATA__ → initialJobList), 12 por página, no mesmo formato de antes.
const PORTAL = 'https://portal.gupy.io/job-search';
const MAX_PAGES = 9;

const pageData = (html) => {
  const m = (html ?? '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try { return JSON.parse(m[1]).props.pageProps.initialJobList; } catch { return null; }
};

export async function fetchGupy(terms, step = () => {}) {
  const byId = new Map();
  for (const [i, term] of terms.entries()) {
    step(i + 1, terms.length, `buscando "${term}"`);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = pageData(await getText(`${PORTAL}/term=${encodeURIComponent(term)}${page > 1 ? `&page=${page}` : ''}`));
      if (!list?.data?.length) break;
      for (const j of list.data) byId.set(j.id, j);
      const { total = 0, limit = 12, offset = 0 } = list.pagination ?? {};
      if (offset + limit >= total) break;
    }
  }
  return [...byId.values()].map((j) => ({
    source: 'gupy',
    id: `gupy:${j.id}`,
    title: j.name.trim(),
    company: j.careerPageName,
    text: j.description ?? '',
    url: j.jobUrl,
    remote: j.workplaceType === 'remote' || j.isRemoteWork,
    workplace: j.workplaceType,
    city: j.city,
    country: j.country,
    publishedAt: j.publishedDate,
  }));
}
