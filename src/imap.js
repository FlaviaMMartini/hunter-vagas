// Cliente IMAP mínimo para o Gmail (só leitura), sem dependências.
import tls from 'node:tls';
import { cleanText } from './filter.js';

export async function openGmail({ user, pass }) {
  const socket = tls.connect(993, 'imap.gmail.com', { servername: 'imap.gmail.com' });
  // Trabalhamos em latin1: 1 caractere = 1 byte, então os tamanhos {n} dos literais batem.
  let buffer = Buffer.alloc(0), tag = 0, pending = null;
  let fail = null;
  const ready = new Promise((resolve, reject) => { socket.once('data', resolve); fail = reject; });
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const text = buffer.toString('latin1');
    if (pending && new RegExp(`(^|\\r\\n)A${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n$`).test(text)) {
      buffer = Buffer.alloc(0);
      const p = pending; pending = null; p.resolve(text);
    }
  });
  // Queda de rede (ECONNRESET etc.) falha só o comando em andamento — nunca derruba o painel.
  const onFail = (err) => { (pending?.reject ?? fail)?.(err); pending = null; };
  socket.on('error', onFail);
  socket.on('close', () => onFail(new Error('Conexão com o Gmail fechada')));
  const cmd = (c) => new Promise((resolve, reject) => { pending = { resolve, reject }; socket.write(`A${++tag} ${c}\r\n`); });
  await ready;
  buffer = Buffer.alloc(0);
  const login = await cmd(`LOGIN ${user} ${pass}`);
  if (!/A\d+ OK/.test(login)) throw new Error('Gmail recusou o login (confira GMAIL_APP_PASSWORD)');
  await cmd('SELECT "[Gmail]/Todos os e-mails"');
  return {
    cmd,
    async search(query) {
      // IMAP recusa acento dentro da busca ("Could not parse"); o Gmail acha "próxima" buscando "proxima".
      const ascii = query.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const r = await cmd(`UID SEARCH X-GM-RAW "${ascii.replace(/"/g, '\\"')}"`);
      return r.match(/SEARCH([\d ]*)/)?.[1].trim().split(' ').filter(Boolean) ?? [];
    },
    // Devolve um objeto por mensagem: { UID: '…', 'X-GM-THRID': '…', BODYSTRUCTURE: [...], 'BODY[...]': '…' }
    async fetch(uids, items) {
      if (!uids.length) return [];
      return parseFetch(await cmd(`UID FETCH ${uids.join(',')} (${items})`));
    },
    // Move para a Lixeira do Gmail (recuperável por 30 dias). O nome da pasta muda com o idioma.
    async moveToTrash(uids) {
      if (!uids.length) return;
      const list = await cmd('LIST "" "*"');
      const trash = list.match(/\(([^)]*\\Trash[^)]*)\) "[^"]*" "?([^"\r\n]+)"?/)?.[2];
      if (!trash) throw new Error('Não achei a pasta Lixeira no Gmail');
      const r = await cmd(`UID MOVE ${uids.join(',')} "${trash}"`);
      if (!/A\d+ OK/.test(r)) throw new Error(`Gmail recusou mover para a lixeira: ${r.trim().split('\r\n').at(-1)}`);
    },
    async close() {
      await cmd('LOGOUT').catch(() => {});
      socket.end();
    },
  };
}

// ---- Parser de respostas FETCH (listas, strings, literais {n}) ----
function parseValue(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '(') {
    const list = [];
    i++;
    while (true) {
      while (s[i] === ' ' || s[i] === '\r' || s[i] === '\n') i++;
      if (s[i] === ')' || i >= s.length) return [list, i + 1];
      const [v, next] = parseValue(s, i);
      list.push(v);
      i = next;
    }
  }
  if (s[i] === '"') {
    let out = '';
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') i++;
      out += s[i++];
    }
    return [out, i + 1];
  }
  const lit = s.slice(i).match(/^\{(\d+)\}\r\n/);
  if (lit) {
    const start = i + lit[0].length;
    return [s.slice(start, start + Number(lit[1])), start + Number(lit[1])];
  }
  // Átomo; colchetes podem conter espaços e parênteses: BODY[HEADER.FIELDS (FROM)]
  let out = '';
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (depth === 0 && (c === ' ' || c === '(' || c === ')' || c === '\r')) break;
    out += c;
    i++;
  }
  return [out === 'NIL' ? null : out, i];
}

function parseFetch(resp) {
  const out = [];
  const re = /\* \d+ FETCH \(/g;
  let m;
  while ((m = re.exec(resp))) {
    const [list, end] = parseValue(resp, m.index + m[0].length - 1);
    const msg = {};
    for (let k = 0; k < list.length; k += 2) msg[String(list[k]).replace(/<\d+>$/, '')] = list[k + 1];
    out.push(msg);
    re.lastIndex = end;
  }
  return out;
}

// ---- Decodificação ----
const bytes = (latin1) => Buffer.from(latin1, 'latin1');
const decodeCharset = (buf, charset = 'utf-8') => {
  try { return new TextDecoder(charset.toLowerCase().replace(/^us-ascii$/, 'utf-8')).decode(buf); } catch { return buf.toString('utf8'); }
};
const qp = (s) => bytes(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));

// "=?UTF-8?Q?Flavia,_sua?= =?UTF-8?B?...?=" → texto
export function decodeHeader(raw = '') {
  const text = decodeCharset(bytes(raw), 'utf-8');
  return text
    .replace(/\r?\n[ \t]+/g, ' ')
    .replace(/(=\?[^?]+\?[BQ]\?[^?]*\?=)\s+(?==\?)/gi, '$1')
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs, enc, data) => decodeCharset(
      enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : qp(data.replace(/_/g, ' ')), cs))
    .trim();
}

// Lista as partes de texto (text/plain e text/html) da BODYSTRUCTURE: { path, encoding, charset, html }.
export function findTextParts(bs, path = '') {
  if (!Array.isArray(bs)) return [];
  if (Array.isArray(bs[0])) {
    const parts = [];
    for (let k = 0; k < bs.length && Array.isArray(bs[k]); k++) parts.push(...findTextParts(bs[k], path ? `${path}.${k + 1}` : String(k + 1)));
    // Uma de cada tipo basta (a primeira text/plain e a primeira text/html).
    return [parts.find((p) => !p.html), parts.find((p) => p.html)].filter(Boolean);
  }
  const [type, subtype, params, , , encoding] = bs;
  if (String(type).toUpperCase() !== 'TEXT') return [];
  const charset = Array.isArray(params) ? params[params.findIndex((x) => String(x).toUpperCase() === 'CHARSET') + 1] : null;
  return [{ path: path || '1', encoding: String(encoding ?? '7BIT').toUpperCase(), charset: charset ?? 'utf-8', html: String(subtype).toUpperCase() === 'HTML' }];
}

export function decodeBody(raw, part) {
  const buf = part.encoding === 'BASE64' ? Buffer.from(raw.replace(/\s+/g, ''), 'base64')
    : part.encoding === 'QUOTED-PRINTABLE' ? qp(raw) : bytes(raw);
  const text = decodeCharset(buf, part.charset);
  return cleanText(part.html ? text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ') : text);
}
