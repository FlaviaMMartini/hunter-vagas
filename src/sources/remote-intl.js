// Vagas remotas internacionais (em inglês): RemoteOK, Jobicy, We Work Remotely e Remotive.
// Todas são APIs/feeds públicos feitos para isso. Só entram vagas abertas a quem mora no Brasil
// (Worldwide, Anywhere, LATAM, Américas, Brasil) — o resto exige morar nos EUA/Europa.
import { getJson, getText } from '../http.js';

const OPEN_TO_BRAZIL = /worldwide|anywhere|global|latam|latin america|south america|americas|brazil|brasil|^remote$|^$/i;
const country = (location) => (OPEN_TO_BRAZIL.test(String(location ?? '').trim()) ? 'BR' : location);
const intl = (j) => ({ remote: true, stillOpen: true, englishHint: true, ...j });
// Essas plataformas etiquetam com "react" até vaga de vendas/gestão: o título precisa ser de desenvolvimento.
const DEV_TITLE = /develop|engineer|front|full[- ]?stack|software|programmer|web|react|javascript|typescript|\bdev\b/i;

async function remoteOk(stackTerm) {
  const list = await getJson(`https://remoteok.com/api?tag=${encodeURIComponent(stackTerm)}`, { delayMs: 800 });
  return (Array.isArray(list) ? list.slice(1) : []).map((j) => intl({
    source: 'remoteok',
    id: `remoteok:${j.id}`,
    title: String(j.position ?? '').trim(),
    company: j.company,
    text: [j.description, `Tags: ${(j.tags ?? []).join(', ')}`, `Local: ${j.location ?? ''}`].join('\n'),
    url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
    country: country(j.location),
    publishedAt: j.date,
    contractHint: (j.tags ?? []).join(' '),
  }));
}

async function jobicy(stackTerm) {
  const res = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(stackTerm)}`, { delayMs: 800 });
  return (res?.jobs ?? []).map((j) => intl({
    source: 'jobicy',
    id: `jobicy:${j.id}`,
    title: String(j.jobTitle ?? '').trim(),
    company: j.companyName,
    text: [j.jobExcerpt, j.jobDescription, `Local: ${j.jobGeo ?? ''}`].join('\n'),
    url: j.url,
    country: country(j.jobGeo),
    publishedAt: j.pubDate,
    contractHint: (j.jobType ?? []).join(' '),
  }));
}

const tag = (s, t) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
async function weWorkRemotely() {
  const jobs = [];
  for (const cat of ['remote-front-end-programming-jobs', 'remote-full-stack-programming-jobs']) {
    const xml = await getText(`https://weworkremotely.com/categories/${cat}.rss`, { delayMs: 800 });
    for (const it of (xml ?? '').split('<item>').slice(1)) {
      // Título vem como "Empresa: Cargo".
      const [company, ...rest] = (tag(it, 'title') ?? '').split(':');
      const link = tag(it, 'link') ?? tag(it, 'guid');
      jobs.push(intl({
        source: 'weworkremotely',
        id: `wwr:${link}`,
        title: rest.join(':').trim() || company,
        company: rest.length ? company.trim() : null,
        text: [tag(it, 'description'), `Local: ${tag(it, 'region') ?? ''}`, tag(it, 'type') ?? ''].join('\n'),
        url: link,
        country: country((tag(it, 'region') ?? '').replace(/only$/i, '').trim()),
        publishedAt: new Date(tag(it, 'pubDate')).toISOString(),
        contractHint: tag(it, 'type') ?? '',
      }));
    }
  }
  return jobs;
}

async function remotive(stackTerm) {
  const res = await getJson(`https://remotive.com/api/remote-jobs?category=software-dev&search=${encodeURIComponent(stackTerm)}`, { delayMs: 800 });
  return (res?.jobs ?? []).map((j) => intl({
    source: 'remotive',
    id: `remotive:${j.id}`,
    title: String(j.title ?? '').trim(),
    company: j.company_name,
    text: [j.description, `Local: ${j.candidate_required_location ?? ''}`].join('\n'),
    url: j.url,
    country: country(j.candidate_required_location),
    publishedAt: j.publication_date,
    contractHint: j.job_type ?? '',
  }));
}

export async function fetchRemoteIntl(stackTerm, step = () => {}) {
  const parts = [['RemoteOK', () => remoteOk(stackTerm)], ['Jobicy', () => jobicy(stackTerm)],
    ['We Work Remotely', weWorkRemotely], ['Remotive', () => remotive(stackTerm)]];
  const jobs = [];
  for (const [i, [name, fn]] of parts.entries()) {
    step(i + 1, parts.length, name);
    jobs.push(...await fn().catch(() => []));
  }
  return jobs.filter((j) => DEV_TITLE.test(j.title));
}
