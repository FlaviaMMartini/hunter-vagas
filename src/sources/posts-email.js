// Varredura de posts públicos com vaga + e-mail para candidatura: issues de vagas em qualquer
// repositório do GitHub (busca global) e o "Ask HN: Who is hiring?" do mês. Só entram posts que
// trazem um e-mail no texto — é o que permite candidatura direta pela fila.
import { getJson } from '../http.js';
import { cleanText } from '../filter.js';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const FAKE = /example\.|seu-?email|email@|empresa\.com\b|exemplo|@users\.noreply/i;
// Cargo de desenvolvimento (e não "Business Development Manager").
const DEV_ROLE = /engineer|developer|desenvolvedor|programador|front[- ]?end|full[- ]?stack|software/i;
const NOT_DEV = /business development|manager|sales|recruiter|designer(?! engineer)/i;
const isDevRole = (t) => DEV_ROLE.test(t) && !NOT_DEV.test(t);
// Gente divulgando o próprio currículo ("[Cidade/UF] Nome Sobrenome | Desenvolvedor..."): não é vaga.
const CANDIDATE = /^\s*\[[^\]]+\]\s*\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+.*\|/u;
const hasEmail = (t) => { const m = t.match(new RegExp(EMAIL.source, 'g')) ?? []; return m.some((e) => !FAKE.test(e)); };

async function githubIssues(stackTerm) {
  const headers = { accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const queries = [`${stackTerm} vaga`, `${stackTerm} remoto`, 'frontend vaga', 'fullstack vaga', 'desenvolvedor front-end'];
  const byId = new Map();
  for (const q of queries) {
    // Sem token o GitHub aceita 10 buscas/min: vai devagar.
    const res = await getJson(`https://api.github.com/search/issues?per_page=100&sort=created&q=${encodeURIComponent(`${q} "@" is:issue is:open created:>${since}`)}`,
      { headers, delayMs: process.env.GITHUB_TOKEN ? 800 : 6500 });
    for (const i of res?.items ?? []) {
      if (!hasEmail(i.body ?? '') || CANDIDATE.test(i.title) || !isDevRole(i.title)) continue;
      const repo = i.repository_url.split('/').slice(-2).join('/');
      const labels = (i.labels ?? []).map((l) => l.name);
      byId.set(i.id, {
        source: 'posts',
        id: `ghpost:${repo}#${i.number}`,
        title: i.title.trim(),
        company: null,
        text: `${i.body ?? ''}\n\nLabels: ${labels.join(', ')}\nPublicado em github.com/${repo}`,
        url: i.html_url,
        remote: labels.some((l) => /remot/i.test(l)) || null,
        publishedAt: i.created_at,
      });
    }
  }
  return [...byId.values()];
}

const OPEN_TO_BRAZIL = /worldwide|anywhere|global|latam|latin america|south america|americas|brazil|brasil/i;
async function hackerNews(stackTerm) {
  const s = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=5');
  const story = (s?.hits ?? []).find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const c = await getJson(`https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&query=${encodeURIComponent(`${stackTerm} remote`)}&hitsPerPage=300`);
  // O HN separa parágrafos com <p> (sem fechar): vira quebra de linha para a 1ª linha ser o cabeçalho.
  return (c?.hits ?? []).map((h) => ({ h, text: cleanText((h.comment_text ?? '').replace(/<p>/g, '\n')) }))
    .filter(({ text }) => hasEmail(text) && OPEN_TO_BRAZIL.test(text))
    .map(({ h, text }) => {
      // Primeira linha: "Empresa | Cargo | REMOTE (Worldwide) | ..."
      const head = text.split('\n')[0].split('|').map((p) => p.trim());
      const role = head.slice(1).find((p) => p.length < 100 && !/^https?:/.test(p) && isDevRole(p));
      if (!role) return null;
      return {
        source: 'posts',
        id: `hn:${h.objectID}`,
        title: role.slice(0, 120),
        company: head[0].slice(0, 60),
        text,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        remote: true,
        country: 'BR',
        publishedAt: h.created_at,
        englishHint: true,
        contractHint: /contract|freelance|part[- ]time/i.test(head.join(' ')) ? 'contract' : '',
      };
    }).filter(Boolean);
}

export async function fetchPostsWithEmail(stackTerm, step = () => {}) {
  step(1, 2, 'GitHub (issues de vagas)');
  const a = await githubIssues(stackTerm).catch(() => []);
  step(2, 2, 'Hacker News (Who is hiring)');
  const b = await hackerNews(stackTerm).catch(() => []);
  return [...a, ...b];
}
