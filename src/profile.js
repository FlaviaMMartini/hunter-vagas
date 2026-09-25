// Lê perfil/perfil.json: seus dados, a carta e as palavras-chave que guiam a busca.
// Tudo que é pessoal mora lá — o código não sabe nada sobre você.
import { readFileSync, existsSync } from 'node:fs';

const FILE = new URL('../perfil/perfil.json', import.meta.url);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Tira acentos: "Florianópolis" e "Florianopolis" viram a mesma coisa. Use nos dois lados.
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Palavra-chave → regex tolerante: "react.js" casa "React.js" e "reactjs"; espaço casa hífen.
// whole: palavra inteira ("intern" não casa "internacional"); sem whole, "llm" casa "LLMs".
export const termRegex = (terms, flags = 'i', { whole = true } = {}) => new RegExp(
  `(?:^|[^\\p{L}\\d])(?:${terms.map((t) => esc(fold(t)).replace(/\\\./g, '\\.?').replace(/ /g, '[\\s-]?')).join('|')})${whole ? '(?=$|[^\\p{L}\\d])' : ''}`,
  `${flags}u`,
);

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

export function loadProfile() {
  if (!existsSync(FILE)) {
    throw new Error('Falta perfil/perfil.json. Copie perfil/perfil.example.json para perfil/perfil.json e preencha com seus dados.');
  }
  const perfil = JSON.parse(readFileSync(FILE, 'utf8'));
  const busca = { ...DEFAULT_BUSCA, ...perfil.busca };
  const own = busca.stack.map((s) => s.toLowerCase());
  const search = {
    ...busca,
    label: busca.rotulo ?? busca.stack[0].replace(/^\w/, (c) => c.toUpperCase()),
    stackRe: termRegex(busca.stack),
    ignorarRe: busca.ignorar.length ? termRegex(busca.ignorar, 'gi') : null,
    extrasList: busca.diferenciais.map((t) => ({ term: t, re: termRegex([t]) })),
    otherStackRe: termRegex(OTHER_STACKS.filter((s) => !own.includes(s))),
    niveisRe: termRegex(busca.niveisExcluidos),
    hibridoRe: busca.hibridoEm.length ? termRegex(busca.hibridoEm) : null,
  };
  return { perfil, search };
}
