// Remotar (remotar.com.br): agregador brasileiro de vagas remotas, com API pública de busca.
// As vagas apontam para a candidatura original (Gupy, InHire, Lever…); a deduplicação do hunt
// prefere a plataforma original quando as duas aparecem.
import { getJson } from '../http.js';

const API = 'https://api.remotar.com.br/jobs';
const MAX_PAGES = 15;

export async function fetchRemotar(terms, step = () => {}) {
  const byId = new Map();
  for (const [i, term] of terms.entries()) {
    step(i + 1, terms.length, `buscando "${term}"`);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await getJson(`${API}?search=${encodeURIComponent(term)}&page=${page}`, { delayMs: 400 });
      for (const j of res?.data ?? []) if (j.active !== false && !j.expired) byId.set(j.id, j);
      if (!res?.data?.length || page >= (res.meta?.last_page ?? 1)) break;
    }
  }
  return [...byId.values()].map((j) => {
    const tags = (j.jobTags ?? []).map((t) => t.name ?? t.tag?.name ?? '').join(' ');
    return {
      source: 'remotar',
      id: `remotar:${j.id}`,
      title: String(j.title ?? '').trim(),
      company: j.companyDisplayName ?? j.company?.name ?? null,
      text: [j.subtitle, j.description, j.moreInfos, `Tags: ${tags}`].filter(Boolean).join('\n'),
      url: j.externalLink || `https://remotar.com.br/job/${j.id}`,
      remote: j.type === 'remote',
      city: [j.city, j.state].filter(Boolean).join(', ') || null,
      country: j.country?.name ?? 'Brasil',
      publishedAt: j.createdAt,
      stillOpen: true,
      // Etiquetas do próprio Remotar: "💼 CLT", "🤝🏽 PJ", "💬 Inglês", "✈️ Vaga internacional".
      contractHint: tags,
      englishHint: /ingl[eê]s|internacional/i.test(tags) || undefined,
    };
  });
}
