// Lê o Gmail (IMAP, só leitura) para atualizar o status das candidaturas:
// e-mail devolvido (bounce) e resposta do recrutador.
import tls from 'node:tls';

function connect(user, pass) {
  const socket = tls.connect(993, 'imap.gmail.com', { servername: 'imap.gmail.com' });
  socket.setEncoding('utf8');
  let buffer = '', tag = 0, pending = null;
  let fail = null;
  const ready = new Promise((resolve, reject) => { socket.once('data', resolve); fail = reject; });
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (pending && new RegExp(`^A${tag} (OK|NO|BAD)`, 'm').test(buffer)) {
      const r = buffer; buffer = ''; const p = pending; pending = null; p.resolve(r);
    }
  });
  // Queda de rede (ECONNRESET etc.) falha só o comando em andamento — nunca derruba o painel.
  const onFail = (err) => { (pending?.reject ?? fail)?.(err); pending = null; };
  socket.on('error', onFail);
  socket.on('close', () => onFail(new Error('Conexão com o Gmail fechada')));
  const cmd = (c) => new Promise((resolve, reject) => { pending = { resolve, reject }; socket.write(`A${++tag} ${c}\r\n`); });
  return { ready, cmd, close: () => socket.end(), user, pass };
}

async function search(imap, query) {
  const r = await imap.cmd(`UID SEARCH X-GM-RAW "${query}"`);
  return r.match(/SEARCH([\d ]*)/)?.[1].trim().split(' ').filter(Boolean) ?? [];
}

// E-mails da InHire chegam de "empresa@ses-mail.inhire.app": o remetente revela a empresa.
export async function discoverInhireTenants({ user, pass }) {
  const imap = connect(user, pass);
  await imap.ready;
  try {
    const login = await imap.cmd(`LOGIN ${user} ${pass}`);
    if (!/^A\d+ OK/m.test(login)) throw new Error('IMAP: login recusado');
    await imap.cmd('SELECT "[Gmail]/Todos os e-mails"');
    const uids = (await search(imap, 'from:ses-mail.inhire.app newer_than:365d')).slice(-500);
    if (!uids.length) return [];
    const r = await imap.cmd(`UID FETCH ${uids.join(',')} (BODY.PEEK[HEADER.FIELDS (FROM)])`);
    await imap.cmd('LOGOUT').catch(() => {});
    return [...new Set([...r.matchAll(/([a-z0-9-]+)@ses-mail\.inhire\.app/gi)].map((m) => m[1].toLowerCase()))];
  } finally {
    imap.close();
  }
}

// Atualiza status em store.jobs; devolve quantas mudaram.
export async function syncInbox(store, { user, pass }) {
  const sent = Object.values(store.jobs).filter((j) => j.status === 'enviada' && j.sentTo);
  if (!sent.length) return 0;
  const imap = connect(user, pass);
  await imap.ready;
  let changed = 0;
  try {
    const login = await imap.cmd(`LOGIN ${user} ${pass}`);
    if (!/^A\d+ OK/m.test(login)) throw new Error('IMAP: login recusado');
    await imap.cmd('SELECT "[Gmail]/Todos os e-mails"');

    // Gmail marca devoluções com o cabeçalho X-Failed-Recipients.
    for (const uid of await search(imap, 'from:mailer-daemon newer_than:14d')) {
      const h = await imap.cmd(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (X-FAILED-RECIPIENTS DATE)])`);
      const failed = h.match(/X-Failed-Recipients:\s*([^\r\n]+)/i)?.[1].toLowerCase().split(/[,\s]+/) ?? [];
      const date = new Date(h.match(/Date:\s*([^\r\n]+)/i)?.[1]);
      for (const j of sent) {
        if (failed.includes(j.sentTo.toLowerCase()) && date >= new Date(j.sentAt) && j.status === 'enviada') {
          Object.assign(j, { status: 'devolvida', statusAt: date.toISOString() });
          changed++;
        }
      }
    }
    // Qualquer e-mail vindo do endereço (ou domínio corporativo) para quem você escreveu.
    for (const j of sent.filter((j) => j.status === 'enviada')) {
      const domain = j.sentTo.split('@')[1];
      const from = /gmail|hotmail|outlook|yahoo|live\./i.test(domain) ? j.sentTo : `@${domain}`;
      const uids = await search(imap, `from:${from} after:${j.sentAt.slice(0, 10).replace(/-/g, '/')}`);
      if (uids.length) {
        Object.assign(j, { status: 'respondida', statusAt: new Date().toISOString() });
        changed++;
      }
    }
    await imap.cmd('LOGOUT').catch(() => {});
  } finally {
    imap.close();
  }
  return changed;
}
