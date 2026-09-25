import { getJson } from '../http.js';

export async function fetchLever(companies) {
  const jobs = [];
  for (const c of companies) {
    const list = await getJson(`https://api.lever.co/v0/postings/${c}?mode=json`);
    for (const p of list ?? []) {
      jobs.push({
        source: `lever:${c}`,
        id: `lever:${p.id}`,
        title: p.text.trim(),
        company: c,
        text: [p.descriptionPlain, ...(p.lists ?? []).map((l) => `${l.text}\n${l.content}`), p.additionalPlain]
          .filter(Boolean).join('\n'),
        url: p.hostedUrl,
        remote: p.workplaceType === 'remote' || /remot/i.test(p.categories?.location ?? ''),
        country: p.country ?? p.categories?.location,
        publishedAt: new Date(p.createdAt).toISOString(),
      });
    }
  }
  return jobs;
}
