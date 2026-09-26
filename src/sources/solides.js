// Sólides Vagas (vagas.solides.com.br): não tem API pública, mas cada página de busca
// já traz as vagas completas (inclusive a descrição) embutidas nos dados do Next.js.
import { getText } from '../http.js';

const BASE = 'https://vagas.solides.com.br/vagas';
const MAX_PAGES = 8;

// Junta os pedaços self.__next_f.push([1,"..."]) e separa as linhas "id:json" e os
// blocos de texto "id:T<tamanho hex>,<texto>" (é onde fica a descrição da vaga).
export function parseFlight(html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => JSON.parse(m[1])).join('');
  const buf = Buffer.from(flight, 'utf8');
  const rows = [];
  const texts = {};
  let pos = 0;
  while (pos < buf.length) {
    const colon = buf.indexOf(0x3a, pos);
    if (colon < 0) break;
    const id = buf.subarray(pos, colon).toString();
    if (buf[colon + 1] === 0x54 && /^[0-9a-f]+$/.test(id)) {
      const comma = buf.indexOf(0x2c, colon);
      const len = parseInt(buf.subarray(colon + 2, comma).toString(), 16);
      texts[id] = buf.subarray(comma + 1, comma + 1 + len).toString('utf8');
      pos = comma + 1 + len;
    } else {
      const nl = buf.indexOf(0x0a, colon);
      const end = nl < 0 ? buf.length : nl;
      rows.push(buf.subarray(colon + 1, end).toString('utf8'));
      pos = end + 1;
    }
  }
  const jobs = [];
  let totalPages = 1;
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (typeof o.totalPages === 'number') totalPages = Math.max(totalPages, o.totalPages);
    if (o.title && o.companyName && o.id) jobs.push(o);
    else Object.values(o).forEach(walk);
  };
  for (const r of rows) {
    try { walk(JSON.parse(r)); } catch {}
  }
  const resolve = (v) => (typeof v === 'string' && /^\$[0-9a-f]+$/.test(v) ? texts[v.slice(1)] ?? '' : v ?? '');
  return { totalPages, jobs: jobs.map((j) => ({ ...j, description: resolve(j.description) })) };
}

const names = (list) => (Array.isArray(list) ? list.map((x) => x.name).join(', ') : '');

function toJob(j) {
  const city = [j.city?.name, j.state?.code].filter(Boolean).join(', ');
  return {
    source: 'solides',
    id: `solides:${j.id}`,
    title: String(j.title).trim(),
    company: j.companyName,
    text: [
      j.description,
      `Modalidade: ${j.jobType ?? ''}`,
      `Senioridade: ${names(j.seniority)}`,
      `Contratação: ${names(j.recruitmentContractType)}`,
      `Competências: ${names(j.hardSkills)}`,
    ].join('\n'),
    url: `https://vagas.solides.com.br/vaga/${j.id}`,
    remote: j.jobType === 'remoto' || j.homeOffice === true,
    workplace: j.jobType,
    city,
    country: 'BR',
    publishedAt: j.createdAt,
    stillOpen: j.currentState === 'em_andamento',
  };
}

export async function fetchSolides(terms, step = () => {}) {
  const byId = new Map();
  // Remoto em qualquer lugar + qualquer modalidade em Florianópolis (o filtro decide o híbrido).
  const searches = terms.flatMap((t) => [[t, 'remoto'], [t, 'florianopolis-sc']]);
  for (const [i, [term, where]] of searches.entries()) {
    step(i + 1, searches.length, `buscando "${term}"`);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await getText(`${BASE}/${encodeURIComponent(term)}/${where}?page=${page}`, { delayMs: 500 });
      if (!html) break;
      const { jobs, totalPages } = parseFlight(html);
      for (const j of jobs) if (j.currentState !== 'encerrada' && j.isDisabled !== true) byId.set(j.id, j);
      if (!jobs.length || page >= totalPages) break;
    }
  }
  return [...byId.values()].map(toJob);
}
