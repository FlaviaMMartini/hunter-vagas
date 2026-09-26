// Gera assunto + mensagem por vaga sem LLM: só usa fatos do perfil que aparecem na vaga.
// Textos e gatilhos vêm de perfil.json ("carta" e "destaques").
import { loadProfile, termRegex } from './profile.js';

// "Desenvolvedor(a)" vira o gênero do perfil ("feminino" → Desenvolvedora).
const FEMININO = (loadProfile().perfil.genero ?? 'feminino') === 'feminino';
const SKILL_PATTERNS = {
  'Next.js': /next\.?js/i, 'Node.js': /node(\.?js)?\b/i, 'CI/CD': /ci\s?\/\s?cd|pipeline/i,
  'REST': /\brest(ful)?\b/i, 'Design System': /design system/i, 'Microfrontends': /micro-?\s?front/i,
  'LLM': /\bllms?\b/i, 'AI Agents': /agentes? de ia|ai agents?/i, 'MCP': /\bmcp\b/i,
  'IA Generativa': /ia generativa|generative ai|genai/i, 'BFF': /\bbff\b/i,
  'Testing Library': /testing library/i, 'Styled Components': /styled-?\s?components/i,
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const skillRegex = (s) => SKILL_PATTERNS[s] ?? new RegExp(`\\b${esc(s)}\\b`, 'i');

export function companyOf(job) {
  if (job.company) return job.company;
  const na = job.title.match(/\s(?:na|no|at|@)\s+([A-ZÀ-Ú][\w&.\- ]{1,40})$/);
  if (na) return na[1].trim();
  const domain = job.emails[0]?.split('@')[1];
  if (domain && !/gmail|hotmail|outlook|yahoo|live\./i.test(domain)) {
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}

const ROLE_WORD = /(desenvolvedor|desenvolvedora|developer|engenheir[oa]|engineer|front-?\s?end|full-?\s?stack|software|programador|tech lead|arquitet)/i;
const NOT_A_ROLE = /linkedin|\bfeed\b|gupy|p[aá]gina inicial|notifica|mensagens|recruiter|recrutador|talent acquisition|headhunter/i;

// "🚀 Vaga: Dev Fullstack Pleno/Sênior (Node / React) | 100% remoto" → "Dev Fullstack Pleno/Sênior".
// Devolve null quando o texto não parece um cargo.
export function cleanRole(raw, company) {
  if (!raw) return null;
  let role = raw.replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();
  if (company) {
    const c = esc(company);
    role = role.replace(new RegExp(`\\s(?:na|no|at|@)\\s+${c}$`, 'i'), '')
      .replace(new RegExp(`^${c}(?:\\s+\\w+)?\\s*[-–|:]\\s*`, 'i'), '');
  }
  // Respeita maiúsculas: "DESENVOLVEDOR(A)" → "DESENVOLVEDORA", não "DESENVOLVEDOra".
  const suffix = (word, s) => word + (word === word.toUpperCase() ? s.toUpperCase() : s);
  role = (FEMININO
    ? role.replace(/(\w+)o\(a\)/gi, (_, w) => suffix(w, 'a')).replace(/(\w+r)\(a\)/gi, (_, w) => suffix(w, 'a'))
    : role.replace(/\((a|as)\)/gi, ''))
    .replace(/^[^\wÀ-ú]+/, '')
    .replace(/^(nova\s+)?vaga\s*(aberta\s*)?(home office|remota)?\s*(de\s|para\s|:|–|-)?\s*/i, '')
    .replace(/^(home office|remoto|100% remoto)\s*[:\-–]\s*/i, '')
    // "na Bradata: Dev Fullstack" → "Dev Fullstack"
    .replace(/^(na|no|da|do|em)\s+[^:]{2,40}:\s*/i, '')
    // Campos que vêm colados no título: "… Modelo: 100% Remoto | PJ", "… Remuneração: R$ …"
    .replace(/\s+(modelo|modalidade|local|regime|contrata[çc][ãa]o|sal[aá]rio|remunera[çc][ãa]o|formato)\s*:.*$/i, '')
    .replace(/\s+na empresa\s+.+$/i, '')
    .split(/[!]|\.\s|,\s|\s[–—|]\s(?=\S)/)[0]
    .replace(/\s+(100%\s*)?\b(remot[oa]|remote|home office|h[ií]brid[oa])\b.*$/i, '')
    .replace(/\s*[|–—-]\s*(100%\s*)?(remot|h[ií]brid|presencial).*$/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[\s\-–|:,]+$/, '')
    .trim();
  if (role.length < 5 || role.length > 90 || !ROLE_WORD.test(role) || NOT_A_ROLE.test(role)) return null;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Acha o cargo no corpo de um post: "Vaga: X", "Buscamos X", ou a 1ª linha com cara de cargo.
export function extractRole(text, company) {
  // Linhas que são links não têm cargo ("…/vagas/123/dev-react" enganava a busca por "vaga").
  const lines = (text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/https?:\/\/|www\.|\.\w{2,4}\/\S/.test(l));
  const patterns = [
    /\bvaga\b\s*(?:aberta\s*)?(?:de\s|para\s|:|–|-)?\s*(.+)/i,
    /\b(?:procuramos|buscamos|contratando|contratamos|hiring|oportunidade(?:\s+para|\s+de|:)?)\s*(?:um\(a\)|uma?|pessoa)?\s*(.+)/i,
  ];
  for (const re of patterns) {
    for (const l of lines) {
      const role = cleanRole(l.match(re)?.[1], company);
      if (role) return role;
    }
  }
  for (const l of lines.filter((l) => l.length < 120 && !/\s(at|na|no|em)\s.*\|/.test(l))) {
    const role = cleanRole(l, company);
    if (role) return role;
  }
  return null;
}

// Recrutador que pede assunto específico filtra a caixa por ele.
function requestedSubject(text) {
  const m = text.match(/assunto(?: do e-?mail)?\s*[:\-–]?\s*["“']([^"”'\n]{3,120})["”']/i)
    ?? text.match(/assunto\s*:\s*([^\n]{3,120})/i);
  return m?.[1].trim();
}

function salaryLine(text, { pj, clt }) {
  const isPj = /\bpj\b|pessoa jur[ií]dica/i.test(text);
  const isClt = /\bclt\b/i.test(text);
  if (isPj && !isClt) return `Minha pretensão salarial é de ${pj} mensais no modelo PJ, aberta a negociação conforme escopo e benefícios.`;
  if (isClt && !isPj) return `Minha pretensão salarial é de ${clt} mensais no regime CLT, aberta a negociação conforme o pacote de benefícios.`;
  return `Minha pretensão salarial é de ${pj} mensais como PJ ou ${clt} em regime CLT, aberta a negociação conforme escopo e benefícios.`;
}

// Até 3 destaques: os "sempre", depois os cujo gatilho aparece na vaga, depois os de reserva.
function pickHighlights(destaques = [], text) {
  const always = destaques.filter((d) => d.sempre);
  const triggered = destaques.filter((d) => !d.sempre && d.quando?.length && termRegex(d.quando, 'i', { whole: false }).test(text));
  const reserve = destaques.filter((d) => !d.sempre && !d.quando?.length);
  return [...always, ...triggered, ...reserve].slice(0, 3).map((d) => d.texto);
}

export function writeApplication(job, perfil) {
  const text = `${job.title}\n${job.text}`;
  const carta = perfil.carta ?? {};
  const company = companyOf(job);
  const matched = perfil.skills.filter((s) => skillRegex(s).test(text));

  const skillsLine = matched.length >= 2
    ? `Vi que a vaga envolve ${matched.slice(0, 6).join(', ')}, tecnologias com as quais trabalho no dia a dia.`
    : carta.especialidade;

  const role = cleanRole(job.title, company) ?? extractRole(job.text, company);
  // Sem cargo confiável, o assunto descreve o seu perfil — nunca o título de uma página.
  const subject = requestedSubject(job.text)?.replace(/\[?\b(seu nome( completo)?|nome completo|nome)\b\]?/i, perfil.nome)
    ?? `Candidatura — ${role ?? carta.cargoPadrao ?? 'Pessoa Desenvolvedora'} | ${perfil.nome}`;
  const contacts = [perfil.telefone, perfil.linkedin, perfil.github].filter(Boolean);

  const body = [
    `Olá${company ? `, equipe ${company}` : ''}!`,
    `Meu nome é ${perfil.nome}, ${carta.apresentacao} ${role ? `Tenho interesse na vaga de ${role}.` : 'Tenho interesse na oportunidade de desenvolvimento divulgada por vocês.'}`,
    skillsLine,
    ...pickHighlights(perfil.destaques, text),
    perfil.pretensao ? salaryLine(text, perfil.pretensao) : null,
    carta.fechamento ?? 'Envio meu currículo em anexo e fico à disposição para uma conversa.',
    [carta.despedida ?? 'Obrigado(a)!', perfil.nome, perfil.cidade, perfil.email, ...contacts].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n');

  return { to: job.emails[0], subject, body, company, matched };
}
