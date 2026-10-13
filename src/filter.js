import { fold } from './profile.js';

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bull: '•', middot: '·', ndash: '–', mdash: '—',
  hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ordf: 'ª', ordm: 'º', deg: '°', euro: '€', rarr: '→', larr: '←', zwj: '', zwnj: '', shy: '',
};
// &ecirc; &ccedil; &atilde; … → letra + acento (a InHire manda descrições assim).
const ACCENTS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
const decodeEntity = (m, e) => {
  if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
  if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
  if (ENTITIES[e]) return ENTITIES[e];
  const acc = e.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/);
  return acc ? (acc[1] + ACCENTS[acc[2]]).normalize('NFC') : m;
};

export function cleanText(s) {
  return s
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const ON_SITE = /\b(presencial|h[ií]brid[oa]|hybrid|on-?site)\b/i;
const REMOTE = /\b(remot[oa]|remote|home ?office|100% remoto|anywhere)\b/i;
const HYBRID = /h[ií]brid|hybrid/i;
const WEB_DEV = /front-?\s?end|full-?\s?stack|\bweb\b|software engineer|engenheir[oa] de software|desenvolvedor[a]?|developer|javascript|typescript/i;
const BRAZIL = /\b(br|brasil|brazil|latam|remote|remoto)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const BAD_EMAIL = /noreply|no-reply|example|github\.com|users\.noreply|sentry|\.(png|jpe?g|gif)$/i;

// ---- Inglês: a vaga exige fluência? (a chave "aceitar inglês fluente" do painel usa isto) ----
const FLUENT_EN = /ingl[eê]s\s*(?:\(|-|:)?\s*(?:fluente|avan[cç]ado|nativo|conversa[cç][aã]o|intermedi[aá]rio[\s/-]*avan[cç]ado)|flu[eê]ncia\s+(?:em|no)\s+ingl[eê]s|fluent\s+(?:in\s+)?english|english\s*(?:\(|-|:)?\s*(?:fluent|fluency|advanced|proficient|proficiency|c1|c2|native)|advanced\s+english|(?:full\s+)?professional\s+(?:working\s+)?proficiency\s+in\s+english|strong\s+(?:written\s+and\s+verbal\s+)?english|excellent\s+english/i;
const EN_WORDS = /\b(the|and|you|with|for|our|will|are|we|your|team|experience|skills|work|this|have|about|role)\b/gi;
const PT_WORDS = /\b(de|e|com|para|voc[eê]|nossa?|experi[eê]ncia|que|uma?|em|vaga|equipe|conhecimento|atua[cç][aã]o|desenvolvimento)\b/gi;

// Exige inglês fluente: diz isso explicitamente, ou o anúncio inteiro está em inglês.
export function englishRequired(job, text) {
  if (job.englishHint === true) return true;
  if (FLUENT_EN.test(`${job.title}\n${text}`)) return true;
  const en = (text.match(EN_WORDS) ?? []).length;
  const pt = (text.match(PT_WORDS) ?? []).length;
  return en >= 15 && en > pt * 1.5;
}

// Vaga já guardada (de antes desta checagem ou capturada por você): calcula na hora.
export const needsEnglish = (j) => !j.spontaneous && (j.englishRequired ?? englishRequired(j, j.text ?? ''));
// Chave do painel: false = esconder vagas que exigem inglês fluente (da fila e da plataforma).
export const acceptsFluentEnglish = (perfil) => perfil?.busca?.aceitaInglesFluente !== false;

// ---- Contrato: freelance/temporário ou prazo indeterminado (+ regime CLT/PJ quando der) ----
const TEMP = /freela(?:ncer?)?\b|freelance|\bfreela\b|tempor[aá]ri[oa]|prazo determinado|contrato de \d+\s*(?:meses|m[eê]s)|por projeto|projeto (?:pontual|fechado|freela)|job pontual|\bcontract(?:or)?\b(?!\s*(?:de|com))|short[- ]term|\d+[- ]months?\s+contract|hourly|part[- ]time|meio per[ií]odo/i;
export function contractOf(job, text) {
  const hint = job.contractHint ?? '';
  const all = `${hint}\n${job.title}\n${text}`;
  const kind = /freela|temporar|contract|part[_ -]?time|projeto|hourly|fixed/i.test(hint) || TEMP.test(all) ? 'temporario' : 'indeterminado';
  const regime = /\bclt\b/i.test(all) && /\bpj\b|pessoa jur[ií]dica/i.test(all) ? 'CLT ou PJ'
    : /\bclt\b|efetiv/i.test(all) ? 'CLT'
    : /\bpj\b|pessoa jur[ií]dica/i.test(all) ? 'PJ'
    : kind === 'temporario' && /freela|freelance|fixed|hourly|projeto/i.test(all) ? 'Freelance' : null;
  return { kind, regime };
}
export const contractOfJob = (j) => j.contract ?? (j.spontaneous ? { kind: 'indeterminado', regime: null } : contractOf(j, j.text ?? ''));

function level(title, text) {
  const t = `${title}
${text}`;
  if (/\b(tech ?lead|l[ií]der t[eé]cnic|staff|principal)\b/i.test(title)) return 'lead';
  if (/\b(s[eê]nior|sr\.?|senior|especialista|specialist)\b/i.test(title)) return 'senior';
  if (/\b(pleno|pl\b|mid-?level|middle)\b/i.test(title)) return 'pleno';
  if (/\b(s[eê]nior|senior)\b/i.test(t)) return 'senior?';
  if (/\bpleno\b/i.test(t)) return 'pleno?';
  return '?';
}

// Devolve a vaga enriquecida, ou { rejected: motivo }. As regras vêm de perfil.json → "busca".
// allowUnknownStack: aceita vaga de dev sem a sua stack no texto (a stack pode estar só no link).
// force: você mandou incluir mesmo assim — nenhum filtro recusa.
export function evaluate(job, { maxAgeDays, search }, { allowUnknownStack = false, force = false } = {}) {
  const text = cleanText(job.text);
  const all = `${job.title}
${text}`;
  // Sem acento e sem as frases a ignorar (ex.: "react native" não conta como "react").
  const folded = fold(all);
  const stackText = search.ignorarRe ? folded.replace(search.ignorarRe, ' ') : folded;

  const ageDays = (Date.now() - new Date(job.publishedAt)) / 864e5;
  // stillOpen: a plataforma diz que a vaga segue aberta — aceita até 1 ano (mais que isso é vaga esquecida).
  if (ageDays > (job.stillOpen ? 365 : maxAgeDays) && !force) return { rejected: 'antiga' };
  const hasStack = search.stackRe.test(stackText);
  const otherStackOnly = search.otherStackRe.test(folded);
  if (!hasStack && !force && (!allowUnknownStack || otherStackOnly || !WEB_DEV.test(all))) return { rejected: `sem ${search.label}` };
  if (search.niveisRe.test(fold(job.title)) && !force) return { rejected: 'nível excluído' };

  const remote = job.remote === true
    ? !ON_SITE.test(job.title)
    : REMOTE.test(job.title) || (REMOTE.test(text) && !ON_SITE.test(job.title));
  // Híbrido/presencial só vale nas cidades de "hibridoEm".
  const nearby = Boolean(search.hibridoRe) && (search.hibridoRe.test(fold(job.city ?? '')) || search.hibridoRe.test(fold(job.title)) ||
    (job.city == null && search.hibridoRe.test(fold(text)) && HYBRID.test(all)));
  if (!(remote && search.remoto) && !nearby && !force) return { rejected: 'não remota' };
  if (job.country && !BRAZIL.test(job.country) && !force) return { rejected: 'fora do Brasil' };

  const emails = [...new Set((all.match(EMAIL) ?? []).map((e) => e.toLowerCase().replace(/\.$/, '')))]
    .filter((e) => !BAD_EMAIL.test(e));
  const extras = search.extrasList.filter((x) => x.re.test(folded)).map((x) => x.term);
  const lvl = level(job.title, text);
  const score =
    (search.stackRe.test(fold(job.title)) ? 2 : 0) + (extras.length ? 2 : 0) + (emails.length ? 2 : 0) +
    (/^(senior|pleno|lead)$/.test(lvl) ? 1 : 0) + (ageDays < 3 ? 1 : 0);

  return {
    ...job,
    text,
    modality: remote ? 'remoto' : nearby ? 'híbrido/local' : 'não informado',
    stackUnknown: !hasStack,
    englishRequired: englishRequired(job, text),
    contract: contractOf(job, text),
    extras,
    level: lvl,
    emails,
    channel: emails.length ? 'email' : 'plataforma',
    ageDays: Math.floor(ageDays),
    score,
  };
}

export const dedupKey = (j) =>
  `${(j.company ?? '').toLowerCase()}|${j.title.toLowerCase().normalize('NFD').replace(/[^\w]+/g, ' ').trim()}`;
