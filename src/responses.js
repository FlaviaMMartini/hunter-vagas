// Lê o Gmail atrás de respostas às suas candidaturas e classifica cada uma
// (entrevista, negativa, confirmação) só com palavras-chave — sem IA.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { openGmail, decodeHeader, findTextParts, decodeBody } from './imap.js';

const FILE = new URL('../data/respostas.json', import.meta.url);
const DAYS = 30;

// Plataformas de recrutamento + palavras de assunto. LinkedIn só as atualizações de candidatura.
const SENDERS = ['gupy.io', 'inhire.app', 'solides.com', 'solides.com.br', 'lever.co', 'greenhouse.io', 'ashbyhq.com',
  'workable.com', 'recrutei.com.br', 'kenoby.com', 'abler.com.br', '99jobs.com', 'pandape.com.br', 'smartrecruiters.com',
  'breezy.hr', 'jobs-noreply@linkedin.com'];
const SUBJECTS = ['entrevista', 'candidatura', '"processo seletivo"', '"próxima etapa"', 'vaga', 'interview', 'application'];
// Alertas e divulgação de vagas não são resposta a candidatura.
const NOISE = /novas vagas|vagas (recomendadas|para voc[eê])|alerta de vaga|job alert|newsletter|webinar|vagas? da semana|oportunidades para voc[eê]|jobs you may|recommended jobs|curso|promo[cç][aã]o|data privacy|privacidade de dados|pol[ií]tica de privacidade|lgpd|candidate-se agora|est[aá] contratando|vaga remota em |abriu vaga|vaga expira|sua opini[aã]o|pesquisa de satisfa/i;

const NEGATIVE = /infelizmente|n[aã]o (seguiremos|vamos seguir|avan[cç]ar(á|emos)|foi (poss[ií]vel|selecionad)|ser[aá] poss[ií]vel|seguir[aá]|prosseguir|avan[cç]ou)|outr[oa]s? (candidat|perfil|pessoa)|optamos por|decidimos (seguir|prosseguir)|processo (foi )?encerrado|vaga (foi )?(encerrada|cancelada|congelada)|unfortunately|regret to inform|not (be )?(moving|advancing|progressing)|will not be (moving|advancing|progressing)|won'?t be (moving|advancing)|decided (to|not to) (move|proceed|advance)|other candidates|looking for (professionals|candidates) with|lamentablemente|hemos decidido|no (continuaremos|avanzaremos)|agradecimiento/i;
const INTERVIEW = /entrevista|agendar|agendamento|marcar (uma|um) (conversa|papo|hor[aá]rio)|teste t[eé]cnico|desafio t[eé]cnico|case t[eé]cnico|live coding|bate-?papo|sua disponibilidade|calendly|meet\.google|teams\.microsoft|interview|schedule a (call|chat)|take-?home/i;
const RECEIVED = /recebemos (a )?sua (candidatura|inscri)|sua candidatura chegou|(candidatura|inscri[cç][aã]o) (foi )?(recebida|enviada|realizada|efetuada|confirmada|registrada)|confirma[cç][aã]o de (inscri|candidatura)|obrigad[oa] (por (se )?candidatar|pelo (seu )?interesse)|agradecemos (o seu|seu|pelo) interesse|interesse em fazer parte|sua candidatura (foi )?(visualizada|vista)|thank(s| you) for (your )?(appl|interest)|application (has been |was )?(received|submitted)|has been received/i;
// Etapa que depende de VOCÊ (teste comportamental, formulário, vídeo).
const ACTION = /etapa .{0,60}desbloquead|confirme sua candidatura|mapeamento comportamental|teste (de perfil|comportamental|online|de l[oó]gica)|question[aá]rio|formul[aá]rio|grave (um|seu) v[ií]deo|v[ií]deo de apresenta|complete (a|o|sua|seu)|finalize (a|o|sua|seu)|responda (a|o|ao|às)|pendente|assessment|complete your/i;
const NEXT_STEP = /pr[oó]xima (etapa|fase)|avan[cç]ou|foi (aprovad|selecionad)|parab[eé]ns|next (step|stage|round)/i;

export function classify(subject, body) {
  const t = `${subject}\n${body}`;
  if (NEGATIVE.test(t)) return 'negativa';
  if (ACTION.test(subject)) return 'acao';
  // Assunto de confirmação vence: o corpo costuma dizer "você pode ser chamada para entrevista".
  if (RECEIVED.test(subject)) return 'recebida';
  if (INTERVIEW.test(t)) return 'entrevista';
  if (ACTION.test(body)) return 'acao';
  if (RECEIVED.test(body)) return 'recebida';
  if (NEXT_STEP.test(t)) return 'entrevista';
  return 'outro';
}

export async function loadResponses() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return null; }
}

async function saveResponses(data) {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(FILE, JSON.stringify(data, null, 2));
}

const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w@.]+/g, ' ').trim();
const companyKey = (c) => norm(c).replace(/\b(ltda|s ?a|eireli|me|tecnologia|sistemas|servicos|solucoes|consultoria|digital|group|grupo|inc|brasil)\b/g, '').trim();

// Tenta ligar a resposta a uma vaga: pelo domínio do e-mail enviado, pelo cargo ou pela empresa.
function matchJob(jobs, r) {
  const fromDomain = r.fromEmail.split('@')[1] ?? '';
  const hay = norm(`${r.subject} ${r.fromName} ${r.snippet}`);
  return jobs.find((j) => j.sentTo && !/gmail|hotmail|outlook|yahoo/.test(fromDomain) && j.sentTo.endsWith(`@${fromDomain}`))
    ?? jobs.find((j) => norm(j.title).length > 12 && hay.includes(norm(j.title)))
    ?? jobs.find((j) => companyKey(j.company).length >= 4 && hay.includes(companyKey(j.company)));
}

// Busca respostas novas; devolve { data, novas } (novas = ainda não notificadas).
export async function checkResponses({ user, pass, jobs = [] }) {
  const data = (await loadResponses()) ?? { firstRun: true, items: {} };
  const extraDomains = [...new Set(jobs.map((j) => j.sentTo?.split('@')[1]).filter((d) => d && !/gmail|hotmail|outlook|yahoo|live\./.test(d)))];
  const query = `newer_than:${DAYS}d -from:me -from:jobalerts-noreply@linkedin.com `
    + `{${[...SENDERS, ...extraDomains].map((s) => `from:${s}`).join(' ')} ${SUBJECTS.map((s) => `subject:${s}`).join(' ')}}`;

  const gmail = await openGmail({ user, pass });
  try {
    const uids = (await gmail.search(query)).filter((u) => !data.items[u]);
    for (let k = 0; k < uids.length; k += 25) {
      const batch = uids.slice(k, k + 25);
      const metas = await gmail.fetch(batch, 'UID X-GM-THRID BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)]');
      for (const m of metas) {
        const headers = decodeHeader(Object.entries(m).find(([key]) => key.startsWith('BODY['))?.[1] ?? '');
        const subject = headers.match(/^Subject:\s*(.*)$/im)?.[1].trim() ?? '(sem assunto)';
        const fromRaw = headers.match(/^From:\s*(.*)$/im)?.[1].trim() ?? '';
        const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).toLowerCase().trim();
        const fromName = fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || fromEmail;
        const date = new Date(headers.match(/^Date:\s*(.*)$/im)?.[1] ?? Date.now()).toISOString();
        // Lê texto e HTML: alguns e-mails (ex.: LinkedIn) só dizem o que importa no HTML.
        let body = '';
        if (!NOISE.test(subject)) {
          for (const part of findTextParts(m.BODYSTRUCTURE)) {
            const [b] = await gmail.fetch([m.UID], `BODY.PEEK[${part.path}]<0.${part.html ? 120000 : 30000}>`);
            const raw = b && Object.entries(b).find(([key]) => key.startsWith('BODY['))?.[1];
            if (raw) body += `\n${decodeBody(raw, part)}`;
          }
          body = body.trim();
        }
        const item = {
          uid: m.UID, date, subject, fromName, fromEmail,
          category: NOISE.test(subject) ? 'ruido' : classify(subject, body),
          snippet: body.replace(/\s+/g, ' ').slice(0, 400),
          // Guardado para reclassificar sem baixar de novo quando as regras mudarem.
          text: body.replace(/\s+/g, ' ').slice(0, 4000),
          link: `https://mail.google.com/mail/u/0/#all/${BigInt(m['X-GM-THRID']).toString(16)}`,
          seen: false,
          // Na primeira execução não notificamos o histórico inteiro.
          notified: Boolean(data.firstRun),
        };
        const job = matchJob(jobs, item);
        if (job) Object.assign(item, { jobId: job.id, jobTitle: job.title, jobCompany: job.company });
        data.items[item.uid] = item;
      }
    }
  } finally {
    await gmail.close();
  }
  data.firstRun = false;
  data.lastCheck = new Date().toISOString();
  await saveResponses(data);
  const novas = Object.values(data.items).filter((r) => !r.notified && r.category !== 'ruido');
  return { data, novas };
}

// Reaplica as regras atuais nos e-mails já lidos (rápido, sem acessar o Gmail).
export async function reclassifyAll() {
  const data = await loadResponses();
  if (!data) return 0;
  let changed = 0;
  for (const r of Object.values(data.items)) {
    const category = NOISE.test(r.subject) ? 'ruido' : classify(r.subject, r.text ?? r.snippet);
    if (category !== r.category) { r.category = category; changed++; }
  }
  await saveResponses(data);
  return changed;
}

// Manda os e-mails para a Lixeira do Gmail e some com eles do painel.
export async function trashResponses(uids, { user, pass }) {
  const data = await loadResponses();
  const valid = uids.filter((u) => data?.items[u] && !data.items[u].trashed);
  if (!valid.length) return 0;
  const gmail = await openGmail({ user, pass });
  try {
    await gmail.moveToTrash(valid);
  } finally {
    await gmail.close();
  }
  for (const u of valid) Object.assign(data.items[u], { trashed: true, trashedAt: new Date().toISOString() });
  await saveResponses(data);
  return valid.length;
}

export async function markNotified(uids) {
  const data = await loadResponses();
  if (!data) return;
  for (const u of uids) if (data.items[u]) data.items[u].notified = true;
  await saveResponses(data);
}

export async function markSeen(uids) {
  const data = await loadResponses();
  if (!data) return;
  for (const u of uids) if (data.items[u]) data.items[u].seen = true;
  await saveResponses(data);
}
