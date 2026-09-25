// Transforma vagas capturadas (texto colado, print lido por OCR) em vagas prontas para candidatura.
import { createHash } from 'node:crypto';
import { evaluate } from './filter.js';
import { config } from './config.js';
import { cleanRole, extractRole } from './writer.js';

const JOB_LINK = /greenhouse\.io|lever\.co|gupy\.io|ashbyhq|workable|inhire|recrutei|solides|kenoby|abler|99jobs|breezy|smartrecruiters|pandape|vagas\.com|lnkd\.in|linkedin\.com\/jobs\/view|forms\.gle|docs\.google\.com\/forms|typeform/i;
const JOB_POST = /\bvagas?\b|contratando|contratamos|hiring|oportunidade|candidat[ae]-se|aplique|apply|recrutando|procuramos|buscamos/i;
// Links que nunca são "onde se candidatar".
const NOISE_LINK = /linkedin\.com\/(in|company|school|feed|posts|search|groups|events|premium|mynetwork|notifications|messaging|learning|help|legal)\b|linkedin\.com\/?$|licdn\.com|\.(png|jpe?g|gif|webp)(\?|$)/i;

// Divulgação que aparece junto das vagas (grupos, WhatsApp, redes), nunca é a vaga.
const PROMO_LINK = /whatsapp|wa\.me|chat\.|t\.me|telegram|instagram|facebook|youtube|youtu\.be|tiktok|twitter|x\.com|linktr\.ee|bit\.ly\/grupo|\/grupo|hub-de-vagas/i;

// linkedin.com/redir/... e linkedin.com/safety/go/?url=... → o link real.
export function normalizeLink(href) {
  try {
    const u = new URL(href);
    if (/linkedin\.com$/.test(u.hostname) && /^\/(redir|safety\/go)/.test(u.pathname)) return normalizeLink(u.searchParams.get('url') ?? href);
    // Página da InHire só abre em *.inhire.app e com o segmento final (/vagas/{id}/{slug}).
    const inhire = href.match(/^https?:\/\/([a-z0-9-]+)\.inhire\.(?:app|com\.br)\/vagas\/([0-9a-f-]{36})\/?$/i);
    if (inhire) return `https://${inhire[1]}.inhire.app/vagas/${inhire[2]}/-`;
    if (/linkedin\.com$/.test(u.hostname) && u.pathname.startsWith('/jobs/view')) return `https://www.linkedin.com${u.pathname}`;
    return href;
  } catch {
    return null;
  }
}

// Ordem de preferência: página direta da vaga (ATS ou card de preview) → primeiro lnkd.in do texto.
function applyLinks(post) {
  const links = [...new Set((post.links ?? []).map(normalizeLink).filter(Boolean))]
    .filter((l) => !NOISE_LINK.test(l) && !PROMO_LINK.test(l))
    .filter((l) => JOB_LINK.test(l) || JOB_POST.test(post.text));
  const shortPos = (l) => {
    const i = post.text.indexOf(l.replace(/^https?:\/\//, ''));
    return i < 0 ? Infinity : i;
  };
  // Encurtado cujo texto ao redor fala de grupo/WhatsApp/hub é divulgação.
  const promoInText = (l) => {
    const i = shortPos(l);
    return i !== Infinity && PROMO_CONTEXT.test(post.text.slice(Math.max(0, i - 120), i));
  };
  const direct = links.filter((l) => !/lnkd\.in/.test(l));
  const short = links.filter((l) => /lnkd\.in/.test(l) && !promoInText(l)).sort((a, b) => shortPos(a) - shortPos(b));
  return [...direct.filter((l) => JOB_LINK.test(l)), ...direct.filter((l) => !JOB_LINK.test(l)), ...short];
}
const PROMO_CONTEXT = /grupo|whats|telegram|hub de vagas|curr[ií]culo e linkedin|me chame|siga|inscreva|mentoria|pode te interessar/i;

// Link para reencontrar o post de origem. Texto colado/print não tem origem conhecida.
function postSearchUrl(post, title) {
  if (!post.url) return null;
  if (/\/feed\/update\/|\/posts\//.test(post.url)) return post.url;
  if (!/linkedin\.com/.test(post.url)) return post.url;
  // O novo LinkedIn não expõe o link do post: uma busca pelo título acha o post.
  const q = (title || post.text.split('\n').find((l) => l.length > 20) || '').replace(/[^\wÀ-ú\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}&sortBy=%22date_posted%22`;
}
const END_OF_POST = /^(gostar|curtir|comentar|compartilhar|enviar|like|comment|repost|send|reagir|publicação no feed|feed post|-{3,})$/i;

// Texto cru (Ctrl+A/Ctrl+C) → posts, usando os botões de reação como separador.
export function splitCopiedText(raw) {
  const posts = [];
  let current = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim())) {
    if (END_OF_POST.test(line)) {
      if (current.length) posts.push({ text: current.join('\n') });
      current = [];
    } else if (line) current.push(line);
  }
  if (current.length) posts.push({ text: current.join('\n') });
  return posts;
}

const FEED_MARK = /^\s*(publicação no feed|feed post)\s*$/im;

// Um "post" que contém vários marcadores de feed é uma página inteira: separa.
function splitFeedPage(post) {
  if ((post.text.match(new RegExp(FEED_MARK.source, 'gim')) ?? []).length < 2) return [post];
  return post.text.split(new RegExp(FEED_MARK.source, 'gim'))
    .filter((t) => t && !FEED_MARK.test(t) && t.trim().length > 40)
    .map((text) => ({ text: text.trim(), url: post.url, links: post.links?.filter((l) => text.includes(l)) ?? [] }));
}


export function parseCaptured(raw) {
  return splitCopiedText(raw).flatMap(splitFeedPage);
}

// Ignora o "há 6 min" e o "Editado" do cabeçalho, que mudam entre capturas.
const postKey = (p) => p.urn || p.text.replace(/\d+\s*(min|h|d|sem|m|a)\b/gi, '').replace(/[•…\s]+/g, ' ').replace(/Editado/gi, '').slice(0, 400);
const postId = (p) => `post:${createHash('sha1').update(postKey(p)).digest('hex').slice(0, 12)}`;

// Texto colado/print traz os links como texto: "https://..." ou só "lnkd.in/abc", "x.gupy.io/job/...".
const TEXT_URL = /https?:\/\/[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)*(?:gupy\.io|inhire\.app|lever\.co|greenhouse\.io|solides\.com\.br|lnkd\.in|forms\.gle)\/[^\s<>"')\]]*/gi;
const urlsInText = (text) => (text.match(TEXT_URL) ?? []).map((u) => (/^https?:/i.test(u) ? u : `https://${u}`).replace(/[.,;:]+$/, ''));

function buildJob(p, id, now, force) {
  const links = applyLinks({ ...p, links: [...(p.links ?? []), ...urlsInText(p.text)] });
  const hasEmail = /@[\w-]+\.[\w.]+/.test(p.text);
  const titleLine = cleanRole(p.title) ?? extractRole(p.text) ?? 'Vaga de desenvolvimento';
  const job = evaluate({
    source: 'captura', id, title: titleLine.replace(/^[^\wÀ-ú]+/, '').slice(0, 120),
    company: p.text.match(/\bna empresa\s+([A-ZÀ-Ú0-9][\w&.\- ]{1,40}?)\s*[!.\n]/)?.[1].trim() ?? null,
    text: [p.text, ...links].join('\n'), url: links[0] ?? p.url ?? '(vaga capturada)',
    remote: null, country: null, publishedAt: now,
  }, config, { allowUnknownStack: links.length > 0 && !hasEmail, force });
  return { job, links, hasEmail };
}

const MAX_DISCARDED = 300;

export function importPosts(store, posts) {
  const stats = { lidos: posts.length, email: 0, plataforma: 0, repetidas: 0, rejeitadas: {} };
  const now = new Date().toISOString();
  store.discarded ??= {};
  const count = (reason) => (stats.rejeitadas[reason] = (stats.rejeitadas[reason] ?? 0) + 1);
  for (const p of posts) {
    const id = postId(p);
    if (store.jobs[id]) { stats.repetidas++; continue; }
    const { job, links, hasEmail } = buildJob(p, id, now, false);
    if (!hasEmail && !links.length) { count('sem e-mail/link'); continue; }
    if (job.rejected) {
      count(job.rejected);
      // Guarda para a aba "Descartadas": você pode discordar do filtro.
      store.discarded[id] = { id, reason: job.rejected, post: p, at: now, title: cleanRole(p.title) ?? extractRole(p.text), hasEmail, links };
      stats.descartadasComContato = (stats.descartadasComContato ?? 0) + 1;
      continue;
    }
    // Mesmo e-mail + mesmo cargo = o mesmo post compartilhado por outra pessoa.
    if (Object.values(store.jobs).some((j) => j.emails?.length && j.emails[0] === job.emails[0] && j.title === job.title)) {
      stats.repetidas++;
      continue;
    }
    store.jobs[id] = { ...job, postUrl: postSearchUrl(p, job.title), author: p.author, firstSeenAt: now, lastSeenAt: now, status: 'nova' };
    job.channel === 'email' ? stats.email++ : stats.plataforma++;
  }
  // Mantém só os descartes mais recentes.
  const recent = Object.values(store.discarded).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_DISCARDED);
  store.discarded = Object.fromEntries(recent.map((d) => [d.id, d]));
  return stats;
}

// "Incluir mesmo assim": vira vaga sem passar pelos filtros.
export function forceImport(store, id) {
  const d = store.discarded?.[id];
  if (!d) throw new Error('Descarte não encontrado');
  const now = new Date().toISOString();
  const { job } = buildJob(d.post, id, now, true);
  store.jobs[id] = { ...job, postUrl: postSearchUrl(d.post, job.title), author: d.post.author, firstSeenAt: now, lastSeenAt: now, status: 'nova', forced: d.reason };
  delete store.discarded[id];
  return job.channel;
}
