// Lê perfil/perfil.json: seus dados, a carta e as palavras-chave que guiam a busca.
// Tudo que é pessoal mora lá — o código não sabe nada sobre você.
// Sem perfil ainda (primeira execução)? Usa o exemplo e o painel abre o assistente de configuração.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';

const FILE = new URL('../perfil/perfil.json', import.meta.url);
const EXAMPLE = new URL('../perfil/perfil.example.json', import.meta.url);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Tira acentos: "Florianópolis" e "Florianopolis" viram a mesma coisa. Use nos dois lados.
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NEVER = /(?!)/;
// Palavra-chave → regex tolerante: "react.js" casa "React.js" e "reactjs"; espaço casa hífen.
// whole: palavra inteira ("intern" não casa "internacional"); sem whole, "llm" casa "LLMs".
// Lista vazia nunca casa (em vez de casar tudo).
export const termRegex = (terms, flags = 'i', { whole = true } = {}) => {
  const list = (terms ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (!list.length) return NEVER;
  return new RegExp(
    `(?:^|[^\\p{L}\\d])(?:${list.map((t) => esc(fold(t)).replace(/\\\./g, '\\.?').replace(/ /g, '[\\s-]?')).join('|')})${whole ? '(?=$|[^\\p{L}\\d])' : ''}`,
    `${flags}u`,
  );
};

const DEFAULT_BUSCA = {
  stack: ['react', 'react.js', 'reactjs'],
  ignorar: ['react native'],
  diferenciais: ['typescript', 'next.js'],
  termos: ['react', 'frontend', 'front-end', 'fullstack', 'full stack', 'typescript', 'desenvolvedor', 'software engineer'],
  remoto: true,
  hibridoEm: [],
  niveisExcluidos: ['júnior', 'junior', 'jr', 'estágio', 'estagio', 'estagiário', 'trainee', 'intern', 'aprendiz'],
  idadeMaximaDias: 45,
};

// Outras stacks: se a vaga só fala delas (e não da sua), é descartada.
const OTHER_STACKS = ['angular', 'vue', 'java', '.net', 'c#', 'php', 'python', 'golang', 'ruby', 'kotlin', 'flutter', 'react native', 'ios', 'android'];

function compile(perfil) {
  const busca = { ...DEFAULT_BUSCA, ...perfil.busca };
  const own = busca.stack.map((s) => s.toLowerCase());
  return {
    ...busca,
    label: busca.rotulo || (busca.stack[0] ?? 'stack').replace(/^\w/, (c) => c.toUpperCase()),
    stackRe: termRegex(busca.stack),
    ignorarRe: busca.ignorar.length ? termRegex(busca.ignorar, 'gi') : null,
    extrasList: busca.diferenciais.map((t) => ({ term: t, re: termRegex([t]) })),
    otherStackRe: termRegex(OTHER_STACKS.filter((s) => !own.includes(s))),
    niveisRe: termRegex(busca.niveisExcluidos),
    hibridoRe: busca.hibridoEm.length ? termRegex(busca.hibridoEm) : null,
  };
}

// Relê o arquivo só quando ele muda: o assistente salva e tudo passa a usar o novo perfil na hora.
let cache = null;
export function loadProfile() {
  const configured = existsSync(FILE);
  const file = configured ? FILE : EXAMPLE;
  const mtime = statSync(file).mtimeMs;
  if (cache?.href === file.href && cache.mtime === mtime) return cache.value;
  const perfil = JSON.parse(readFileSync(file, 'utf8'));
  const value = { perfil, search: compile(perfil), configured };
  cache = { href: file.href, mtime, value };
  return value;
}

// Para scripts sem tela (busca agendada, respostas): sem perfil não há o que fazer.
export function requireProfile() {
  const p = loadProfile();
  if (!p.configured) {
    console.error('\n✖ Falta o seu perfil. Abra o painel (npm run painel) e siga o assistente de configuração,\n  ou copie perfil/perfil.example.json para perfil/perfil.json e preencha.\n');
    process.exit(1);
  }
  return p;
}

export function saveProfile(perfil) {
  mkdirSync(new URL('../perfil/', import.meta.url), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(perfil, null, 2)}\n`);
  cache = null;
}
