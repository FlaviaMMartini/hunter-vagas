// Freelance / projetos: Freelancer.com (API oficial de projetos ativos) e 99Freelas (lista pública
// de projetos; o robots.txt permite /projects). Candidatura é pela própria plataforma.
import { getJson, getText } from '../http.js';
import { cleanText } from '../filter.js';

async function freelancerCom(stackTerm) {
  const res = await getJson(`https://www.freelancer.com/api/projects/0.1/projects/active?query=${encodeURIComponent(stackTerm)}&limit=50&full_description=true`, { delayMs: 800 });
  return (res?.result?.projects ?? []).map((p) => {
    const budget = p.budget ? `${p.currency?.code ?? ''} ${p.budget.minimum ?? ''}–${p.budget.maximum ?? ''} (${p.type === 'hourly' ? 'por hora' : 'preço fixo'})` : '';
    return {
      source: 'freelancer',
      id: `freelancer:${p.id}`,
      title: String(p.title ?? '').trim(),
      company: 'Freelancer.com',
      text: [p.description ?? p.preview_description, `Orçamento: ${budget}`, 'Projeto freelance remoto.'].join('\n'),
      url: `https://www.freelancer.com/projects/${p.seo_url}`,
      remote: true,
      country: 'BR',
      publishedAt: new Date((p.time_submitted ?? Date.now() / 1000) * 1000).toISOString(),
      stillOpen: true,
      contractHint: `freelance ${p.type ?? ''}`,
      englishHint: p.language ? p.language !== 'pt' : true,
    };
  });
}

const attr = (s, name) => s.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
async function noventaENoveFreelas(stackTerm) {
  const jobs = [];
  for (let page = 1; page <= 3; page++) {
    const html = await getText(`https://www.99freelas.com.br/projects?q=${encodeURIComponent(stackTerm)}&page=${page}`, { delayMs: 800 });
    const items = (html ?? '').split('<li class="').slice(1).filter((s) => s.includes('result-item'));
    for (const it of items) {
      const id = attr(it, 'data-id');
      const href = it.match(/<h1 class="title">\s*<a href="([^"?]+)/)?.[1];
      if (!id || !href) continue;
      const info = cleanText(it.match(/<p class="item-text information">([\s\S]*?)<\/hgroup>/)?.[1] ?? '');
      jobs.push({
        source: '99freelas',
        id: `99freelas:${id}`,
        title: cleanText(attr(it, 'data-nome')),
        company: '99Freelas',
        text: [cleanText(attr(it, 'data-content')), info, 'Projeto freelance remoto.'].join('\n'),
        url: `https://www.99freelas.com.br${href}`,
        remote: true,
        country: 'BR',
        publishedAt: new Date(Number(it.match(/class="datetime" cp-datetime="(\d+)"/)?.[1] ?? Date.now())).toISOString(),
        stillOpen: true,
        contractHint: 'freelance projeto',
      });
    }
    if (items.length < 10) break;
  }
  return jobs;
}

export async function fetchFreelance(stackTerm, step = () => {}) {
  step(1, 2, 'Freelancer.com');
  const a = await freelancerCom(stackTerm).catch(() => []);
  step(2, 2, '99Freelas');
  const b = await noventaENoveFreelas(stackTerm).catch(() => []);
  return [...a, ...b];
}
