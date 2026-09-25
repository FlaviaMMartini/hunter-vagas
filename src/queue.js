import { readFile } from 'node:fs/promises';
import { writeApplication } from './writer.js';
import { sendMail } from './mailer.js';
import { saveStore } from './store.js';

const SAME_RECIPIENT_DAYS = 7;

export const loadPerfil = async () =>
  JSON.parse(await readFile(new URL('../perfil/perfil.json', import.meta.url), 'utf8'));

// Vagas com e-mail ainda não enviadas, sem repetir destinatário em poucos dias.
export function buildQueue(store, perfil) {
  const jobs = Object.values(store.jobs);
  // Conta tanto o e-mail original da vaga quanto o endereço efetivamente usado.
  const contacted = new Set(
    jobs.filter((j) => j.sentAt && Date.now() - new Date(j.sentAt) < SAME_RECIPIENT_DAYS * 864e5)
      .flatMap((j) => [j.sentTo, j.emails?.[0]]),
  );
  const queue = [];
  for (const j of jobs.filter((j) => j.channel === 'email' && j.status === 'nova').sort((a, b) => b.score - a.score)) {
    if (contacted.has(j.emails[0])) continue;
    contacted.add(j.emails[0]);
    queue.push({ job: j, ...writeApplication(j, perfil) });
  }
  return queue;
}

const VALID_EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

// Envio para o seu próprio e-mail é TESTE: chega com [TESTE] e a vaga continua na fila.
export async function sendApplication(store, perfil, { jobId, to, subject, body }) {
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!pass) throw new Error('Falta GMAIL_APP_PASSWORD no .env');
  to = to.trim();
  if (!VALID_EMAIL.test(to)) throw new Error(`E-mail inválido: ${to}`);
  if (to.toLowerCase() === perfil.email.toLowerCase()) {
    await sendMail({ user: perfil.email, pass, fromName: perfil.nome, attachment: perfil.cv, to, subject: `[TESTE] ${subject}`, text: body });
    return { test: true };
  }
  const job = store.jobs[jobId];
  try {
    await sendMail({ user: perfil.email, pass, fromName: perfil.nome, attachment: perfil.cv, to, subject, text: body });
    Object.assign(job, { status: 'enviada', sentAt: new Date().toISOString(), sentTo: to, subject, message: body, lastError: null });
  } catch (err) {
    job.lastError = err.message;
    throw err;
  } finally {
    await saveStore(store);
  }
}
