// Candidatura espontânea para uma lista de contatos (empresa, responsável, e-mail, palavras-chave).
// Cada linha vira um e-mail personalizado que entra na fila normal — mesmo envio espaçado.
import { termRegex, fold } from './profile.js';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
// "RH", "—", "Recrutamento"… não são nomes de pessoa: a saudação vira "equipe Empresa".
const NOT_A_PERSON = /^(?:[—–-]+$|(?:rh|r\.h\.|recrutamento|recrutamento e sele[cç][aã]o|talentos|vagas|atra[cç][aã]o|carreiras|recursos humanos|people|gente|contato|comercial|sele[cç][aã]o)\b)/i;
// Endereços que não são de candidatura: melhor não usar.
const NOT_FOR_CANDIDATES = /^(comercial|vendas|financeiro|suporte|sac|noreply|no-reply)@/i;

// Aderência: palavras-chave da empresa contra o seu perfil e o tipo de vaga que você busca.
const STRONG = ['react', 'frontend', 'front-end', 'front end', 'fullstack', 'full stack', 'javascript', 'typescript', 'node', 'next.js',
  'web', 'ia', 'agents', 'rag', 'llm', 'apis', 'ux/ui', 'ui', 'mobile', 'clean code', 'engenharia de software', 'software engineer'];
const MEDIUM = ['desenvolvimento', 'software', 'tecnologia', 'ti', 'engenharia', 'fábrica de software', 'squads', 'alocação', 'outsourcing',
  'hunting', 'inovação', 'transformação digital', 'cloud', 'remoto', 'pj', 'banco de talentos', 'bodyshop', 'tech lead', 'product', 'e-commerce', 'digital'];
const OFF = ['sap', 'infraestrutura', 'suporte', 'redes', 'segurança', 'qa', 'testes', 'bi', '.net', 'c#', 'java', 'python', 'golang', 'go',
  'rpa', 'erp', 't-sql', 'big data', 'dados', 'android', 'devops', 'requisitos'];

const splitList = (s) => String(s ?? '').split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
const inList = (kw, list) => list.some((t) => fold(kw).toLowerCase() === fold(t).toLowerCase());

export function fitOf(keywords) {
  const strong = keywords.filter((k) => inList(k, STRONG));
  const medium = keywords.filter((k) => inList(k, MEDIUM));
  const off = keywords.filter((k) => inList(k, OFF));
  const level = strong.length ? 'alta' : medium.length > off.length ? 'média' : 'baixa';
  return { level, strong, medium, off };
}

// Uma linha por empresa. Aceita tabela colada (tab), "|", ";" ou 2+ espaços entre colunas.
export function parseContacts(text) {
  const rows = [];
  const skipped = [];
  const seen = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = (line.includes('\t') ? line.split('\t') : line.split(/\s*\|\s*|\s*;\s*|\s{2,}/)).map((c) => c.trim());
    const emailCol = cols.findIndex((c) => EMAIL.test(c));
    const empresa = cols[0] || '(sem nome)';
    if (emailCol < 0) { skipped.push({ empresa, reason: `sem e-mail (${cols[2] || cols[1] || 'vazio'})` }); continue; }
    // "a@x.com / b@x.com" → o primeiro (um e-mail por empresa).
    const email = cols[emailCol].match(EMAIL)[0].toLowerCase();
    if (NOT_FOR_CANDIDATES.test(email)) { skipped.push({ empresa, reason: `${email} não é canal de candidatura` }); continue; }
    if (seen.has(email)) { skipped.push({ empresa, reason: `${email} repetido na lista` }); continue; }
    seen.add(email);
    const responsavel = emailCol > 1 ? cols[1] : '';
    const keywords = splitList(cols.slice(emailCol + 1).join(', '));
    rows.push({ empresa, responsavel, email, keywords, fit: fitOf(keywords) });
  }
  return { rows, skipped };
}

// "Carolina Costa / recrutamento" → "Carolina Costa"; "RH" → null.
export function personName(responsavel) {
  const first = String(responsavel ?? '').split('/')[0].trim();
  if (!first || NOT_A_PERSON.test(first)) return null;
  return first;
}

// Palavra-chave curta → termos que aparecem nos gatilhos dos seus destaques.
const EXPAND = {
  ia: 'ia generativa llm ai agent agentes de ia', agents: 'ai agent agentes de ia', rag: 'rag llm',
  fullstack: 'full stack node api', 'full stack': 'full stack node api', backend: 'back end api', apis: 'api',
  frontend: 'front end design system', 'front-end': 'front end', 'ux/ui': 'design system', ui: 'design system',
};

export function writeSpontaneous({ empresa, responsavel, keywords }, perfil, subject) {
  const carta = perfil.carta ?? {};
  const kwText = keywords.map((k) => `${k} ${EXPAND[fold(k).toLowerCase()] ?? ''}`).join(' \n ');
  // Suas tecnologias que a empresa citou. Palavra inteira: "Node" → "Node.js" e "IA" → "IA Generativa",
  // mas "Java" NÃO vira "JavaScript".
  const norm = (s) => fold(s).toLowerCase().trim();
  const matched = (perfil.skills ?? []).filter((s) => keywords.some((k) => {
    const [sk, kw] = [norm(s), norm(k)];
    return sk === kw || sk.startsWith(`${kw} `) || sk.startsWith(`${kw}.`);
  }));
  const highlights = (() => {
    const d = perfil.destaques ?? [];
    const always = d.filter((x) => x.sempre);
    const triggered = d.filter((x) => !x.sempre && x.quando?.length && termRegex(x.quando, 'i', { whole: false }).test(fold(kwText)));
    const reserve = d.filter((x) => !x.sempre && !x.quando?.length);
    return [...always, ...triggered, ...reserve].slice(0, 3).map((x) => x.texto);
  })();
  const name = personName(responsavel);
  const fronts = keywords.filter((k) => inList(k, STRONG) || inList(k, MEDIUM)).slice(0, 4);
  const contacts = [perfil.telefone, perfil.linkedin, perfil.github].filter(Boolean);

  const body = [
    name ? `Olá, ${name.split(' ')[0]}!` : `Olá, equipe ${empresa}!`,
    `Meu nome é ${perfil.nome}, ${carta.apresentacao}`,
    // "da empresa X" funciona com qualquer nome ("na Datum", mas "no Grupo Sysplan").
    `Gostaria de me candidatar às vagas em aberto da empresa ${empresa} que tenham aderência com o meu perfil${fronts.length ? `, especialmente em ${fronts.join(', ')}` : ''}.`,
    matched.length >= 2 ? `Trabalho no dia a dia com ${matched.slice(0, 6).join(', ')}.` : carta.especialidade,
    ...highlights,
    carta.fechamento ?? 'Envio meu currículo em anexo e fico à disposição para uma conversa.',
    [carta.despedida ?? 'Obrigado(a)!', perfil.nome, perfil.cidade, perfil.email, ...contacts].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n');

  return { subject, body, matched };
}

// Coloca as linhas escolhidas na fila de e-mail (uma "vaga" por empresa).
// Quem já recebeu candidatura espontânea antes não entra de novo.
export function queueContacts(store, rows, subject) {
  const now = new Date().toISOString();
  const result = { added: 0, updated: 0, alreadySent: [] };
  for (const r of rows) {
    const id = `lista:${r.email}`;
    const prev = store.jobs[id];
    if (prev && prev.status !== 'nova') { result.alreadySent.push(r.empresa); continue; }
    store.jobs[id] = {
      ...prev,
      id, source: 'lista', title: `Candidatura espontânea — ${r.empresa}`, company: r.empresa,
      text: r.keywords.join(', '), url: '', emails: [r.email], channel: 'email', status: 'nova',
      // Alta aderência primeiro na fila.
      score: { alta: 3, média: 2, baixa: 1 }[r.fit?.level ?? fitOf(r.keywords).level],
      spontaneous: { responsavel: r.responsavel, keywords: r.keywords, subject },
      firstSeenAt: prev?.firstSeenAt ?? now, lastSeenAt: now,
    };
    prev ? result.updated++ : result.added++;
  }
  return result;
}

// Assunto padrão: carta.assuntoEspontanea do perfil, ou "CANDIDATURA | <cargo padrão>".
export const defaultSubject = (perfil) =>
  perfil.carta?.assuntoEspontanea || `CANDIDATURA | ${perfil.carta?.cargoPadrao || 'Pessoa Desenvolvedora'}`;
