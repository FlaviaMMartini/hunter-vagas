import { getJson } from '../http.js';

const API = 'https://employability-portal.gupy.io/api/v1/jobs';

export async function fetchGupy(terms) {
  const byId = new Map();
  for (const [term, workplaceType] of terms.flatMap((t) => [[t, 'remote'], [t, 'hybrid']])) {
    for (let offset = 0; offset < 1000; offset += 100) {
      const q = new URLSearchParams({ jobName: term, limit: 100, offset, workplaceType });
      const page = await getJson(`${API}?${q}`);
      if (!page?.data?.length) break;
      for (const j of page.data) byId.set(j.id, j);
      if (page.data.length < 100) break;
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
