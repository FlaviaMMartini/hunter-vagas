// Painel local: http://localhost:4321
import http from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { loadStore, saveStore } from './store.js';
import { loadPerfil, buildQueue, sendApplication } from './queue.js';
import { parseCaptured, importPosts, forceImport, normalizeLink } from './posts.js';
import { addTenants, tenantsInLinks } from './sources/inhire.js';
import { addBoards, boardsInText } from './sources/greenhouse.js';
import { syncInbox, discoverInhireTenants } from './inbox.js';
import { loadResponses, checkResponses, markSeen, trashResponses } from './responses.js';

const PORT = Number(process.env.PORT ?? 4321);
const INTERVAL_SEC = Number(process.env.SEND_INTERVAL_SEC ?? 90);
const pub = (f) => new URL(`../public/${f}`, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Envio em lote roda no servidor: continua mesmo se você fechar a aba.
const batch = { running: false, total: 0, done: 0, failed: 0, nextAt: null };
let hunting = false;
const SENT_STATUSES = ['enviada', 'devolvida', 'respondida'];
// Vagas trazidas por você (print/texto): não somem por não aparecerem na busca automática.
const CAPTURED = ['captura', 'linkedin'];

// Confere devoluções e respostas no Gmail a cada 3 minutos.
let lastSync = null;
async function sync() {
  try {
    const [store, perfil] = await Promise.all([loadStore(), loadPerfil()]);
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    if (!pass) return;
    if (await syncInbox(store, { user: perfil.email, pass })) await saveStore(store);
    lastSync = new Date().toISOString();
  } catch (err) {
    console.warn('sync Gmail falhou:', err.message);
  }
}
sync();
setInterval(sync, 3 * 60 * 1000);

// Descobre empresas da InHire pelos e-mails que você já recebeu delas (a cada 6h).
async function discoverTenants() {
  try {
    const perfil = await loadPerfil();
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    if (!pass) return;
    const novas = await addTenants(await discoverInhireTenants({ user: perfil.email, pass }));
    if (novas.length) console.log('InHire: novas empresas pelo Gmail:', novas.join(', '));
  } catch (err) {
    console.warn('descoberta InHire falhou:', err.message);
  }
}
discoverTenants();
setInterval(discoverTenants, 6 * 60 * 60 * 1000);

// Ordena do mais novo para o mais antigo; registro sem data vai para o fim em vez de derrubar o painel.
const byDesc = (a, b) => String(b ?? '').localeCompare(String(a ?? ''));

async function state() {
  const [store, perfil, resp] = await Promise.all([loadStore(), loadPerfil(), loadResponses()]);
  const responses = Object.values(resp?.items ?? {}).filter((r) => r.category !== 'ruido' && !r.trashed)
    .sort((a, b) => byDesc(a.date, b.date))
    .map(({ text, notified, ...r }) => r);
  const jobs = Object.values(store.jobs);
  const pick = (j) => ({ id: j.id, title: j.title, company: j.company, url: j.url, postUrl: j.postUrl, source: j.source, level: j.level, modality: j.modality, extras: j.extras ?? (j.typescript ? ['typescript'] : []), score: j.score, firstSeenAt: j.firstSeenAt, lastError: j.lastError, stackUnknown: j.stackUnknown });
  return {
    sent: jobs.filter((j) => SENT_STATUSES.includes(j.status)).sort((a, b) => byDesc(a.sentAt, b.sentAt))
      .map((j) => ({ ...pick(j), status: j.status, statusAt: j.statusAt, sentAt: j.sentAt, sentTo: j.sentTo, subject: j.subject, message: j.message })),
    queue: buildQueue(store, perfil).map((l) => ({ ...pick(l.job), to: l.to, origTo: l.to, subject: l.subject, body: l.body, matched: l.matched })),
    lastSync,
    responses,
    responsesCheckedAt: resp?.lastCheck ?? null,
    email: perfil.email,
    nome: perfil.nome,
    // Vaga que a busca automática não encontra há 2 dias provavelmente foi encerrada: some da lista.
    // (As que você capturou ficam, porque não são revistas pela busca.)
    platform: jobs.filter((j) => j.channel === 'plataforma' && j.status === 'nova'
      && (CAPTURED.includes(j.source) || Date.now() - new Date(j.lastSeenAt ?? j.firstSeenAt) < 2 * 864e5))
      .sort((a, b) => b.score - a.score || (b.firstSeenAt ?? '').localeCompare(a.firstSeenAt ?? '')).map(pick),
    applied: jobs.filter((j) => j.status === 'candidatada').length,
    // Descartes com e-mail primeiro: são os que mais valem uma segunda olhada.
    discarded: Object.values(store.discarded ?? {})
      .sort((a, b) => Number(b.hasEmail) - Number(a.hasEmail) || byDesc(a.at, b.at))
      .map((d) => ({
        id: d.id, reason: d.reason, at: d.at, title: d.title, hasEmail: d.hasEmail,
        emails: [...new Set(d.post.text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])],
        link: d.links?.[0], author: d.post.author, text: d.post.text.slice(0, 1500),
      })),
    lastRun: store.runs.at(-1) ?? null,
    batch, hunting,
    hasPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
  };
}

// O lote fica salvo em disco: se o painel reiniciar (ou o PC desligar), ele continua de onde parou.
const BATCH_FILE = new URL('../data/envio-em-lote.json', import.meta.url);
const saveBatchFile = (items) => writeFile(BATCH_FILE, JSON.stringify({ savedAt: new Date().toISOString(), items }, null, 2));

async function runBatch(items, { resumed = false } = {}) {
  Object.assign(batch, { running: true, total: items.length, done: 0, failed: 0, resumed });
  await saveBatchFile(items);
  const perfil = await loadPerfil();
  for (const [i, item] of items.entries()) {
    const store = await loadStore();
    // Já enviada (ou descartada) desde que o lote começou: pula — nunca envia duas vezes.
    if (store.jobs[item.id]?.status !== 'nova') { await saveBatchFile(items.slice(i + 1)); continue; }
    try {
      await sendApplication(store, perfil, { jobId: item.id, to: item.to, subject: item.subject, body: item.body });
      batch.done++;
    } catch (err) {
      batch.failed++;
      if (/535|534|auth/i.test(err.message)) break;
    }
    await saveBatchFile(items.slice(i + 1));
    if (i < items.length - 1) {
      const wait = (INTERVAL_SEC + Math.random() * INTERVAL_SEC) * 1000;
      batch.nextAt = new Date(Date.now() + wait).toISOString();
      await sleep(wait);
    }
  }
  await rm(BATCH_FILE, { force: true });
  Object.assign(batch, { running: false, nextAt: null });
}

// Ao iniciar: havia um lote pela metade? Continua.
readFile(BATCH_FILE, 'utf8').then((raw) => {
  const { items = [] } = JSON.parse(raw);
  if (!items.length) return rm(BATCH_FILE, { force: true });
  console.log(`↻ Retomando envio em lote: ${items.length} candidatura(s) pendente(s).`);
  runBatch(items, { resumed: true });
}).catch(() => {});

const body = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => (s += c)).on('end', () => resolve(s ? JSON.parse(s) : {}));
});

async function setStatus(id, status) {
  const store = await loadStore();
  if (store.jobs[id]) store.jobs[id].status = status;
  await saveStore(store);
}

const routes = {
  'GET /': async (req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await readFile(pub('index.html'))),
  'GET /api/state': async () => state(),
  'POST /api/send': async (req) => {
    const { id, to, subject, body: text } = await body(req);
    const [store, perfil] = await Promise.all([loadStore(), loadPerfil()]);
    const result = await sendApplication(store, perfil, { jobId: id, to, subject, body: text });
    setTimeout(sync, 60 * 1000); // devoluções chegam em segundos
    return { ok: true, test: Boolean(result?.test) };
  },
  'POST /api/sync': async () => { await sync(); return { ok: true }; },
  'POST /api/send-all': async (req) => {
    if (batch.running) throw new Error('Já existe um envio em andamento.');
    const { items } = await body(req);
    runBatch(items);
    return { ok: true };
  },
  'POST /api/status': async (req) => {
    const { id, status } = await body(req);
    await setStatus(id, status);
    return { ok: true };
  },
  'POST /api/import': async (req) => {
    const { text } = await body(req);
    let raw = text;
    if (!raw?.trim()) throw new Error('Nada para importar. Cole o texto ou um print da vaga e tente de novo.');
    const posts = parseCaptured(raw);
    if (!posts.length) throw new Error('Não encontrei posts no que foi copiado. Use o botão 📌 Capturar vagas.');
    // Cada captura fica guardada com data/hora: nenhuma se perde.
    await mkdir(new URL('../data/capturas/', import.meta.url), { recursive: true });
    await writeFile(new URL(`../data/capturas/${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url), raw);
    const store = await loadStore();
    const stats = importPosts(store, posts);
    // Empresas da InHire vistas nos posts entram na busca automática.
    const links = posts.flatMap((p) => (p.links ?? []).map((l) => normalizeLink(l) ?? l));
    const novas = await addTenants(tenantsInLinks(links));
    if (novas.length) stats.inhireNovas = novas;
    // Idem para empresas do Greenhouse.
    const boards = await addBoards(boardsInText(links.join(' ')));
    if (boards.length) stats.greenhouseNovas = boards;
    try { stats.total = JSON.parse(raw).total; } catch {}
    await saveStore(store);
    return stats;
  },
  'POST /api/responses/seen': async (req) => {
    const { uids } = await body(req);
    await markSeen(uids);
    return { ok: true };
  },
  'POST /api/responses/trash': async (req) => {
    const { uids } = await body(req);
    const perfil = await loadPerfil();
    const moved = await trashResponses(uids, { user: perfil.email, pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '') });
    return { ok: true, moved };
  },
  'POST /api/responses/check': async () => {
    const [store, perfil] = await Promise.all([loadStore(), loadPerfil()]);
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    const { novas } = await checkResponses({ user: perfil.email, pass, jobs: Object.values(store.jobs) });
    return { ok: true, novas: novas.length };
  },
  'POST /api/force': async (req) => {
    const { id } = await body(req);
    const store = await loadStore();
    const channel = forceImport(store, id);
    await saveStore(store);
    return { ok: true, channel };
  },
  'POST /api/discard-remove': async (req) => {
    const { id } = await body(req);
    const store = await loadStore();
    delete store.discarded?.[id];
    await saveStore(store);
    return { ok: true };
  },
  'POST /api/hunt': async () => {
    if (hunting) return { ok: true };
    hunting = true;
    await new Promise((resolve) => spawn(process.execPath, ['src/hunt.js'], { stdio: 'inherit' }).on('exit', resolve));
    hunting = false;
    return { ok: true };
  },
};

http.createServer(async (req, res) => {
  const route = routes[`${req.method} ${req.url.split('?')[0]}`];
  if (!route) return res.writeHead(404).end();
  try {
    const result = await route(req, res);
    if (!res.headersSent) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`🎯 Painel do Hunter: http://localhost:${PORT}`));
