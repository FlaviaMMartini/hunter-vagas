// Cliente SMTP mínimo para o Gmail (TLS 465 + AUTH PLAIN), sem dependências.
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encHeader = (s) => `=?UTF-8?B?${b64(s)}?=`;
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');

async function buildMime({ from, fromName, to, subject, text, attachment }) {
  const boundary = `----hunter${Date.now().toString(36)}`;
  const file = await readFile(attachment);
  return [
    `From: ${encHeader(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(text)),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${basename(attachment)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${basename(attachment)}"`,
    '',
    wrap(file.toString('base64')),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export async function sendMail({ user, pass, ...msg }) {
  const mime = await buildMime({ from: user, ...msg });
  const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
  socket.setEncoding('utf8');
  let buffer = '';
  let pending = null;
  socket.on('data', (chunk) => {
    buffer += chunk;
    // Resposta completa = última linha "NNN texto" (sem hífen após o código).
    if (/(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buffer) && pending) {
      const r = buffer;
      buffer = '';
      pending.resolve(r);
    }
  });
  socket.on('error', (e) => pending?.reject(e));
  const cmd = (line, expect) => new Promise((resolve, reject) => {
    pending = { resolve, reject };
    if (line !== null) socket.write(`${line}\r\n`);
  }).then((r) => {
    if (!r.startsWith(String(expect))) throw new Error(`SMTP: ${r.trim()}`);
    return r;
  });
  try {
    await cmd(null, 220);
    await cmd('EHLO localhost', 250);
    await cmd(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`, 235);
    await cmd(`MAIL FROM:<${user}>`, 250);
    await cmd(`RCPT TO:<${msg.to}>`, 250);
    await cmd('DATA', 354);
    await cmd(`${mime.replace(/^\./gm, '..')}\r\n.`, 250);
    await cmd('QUIT', 221).catch(() => {});
  } finally {
    socket.end();
  }
}
