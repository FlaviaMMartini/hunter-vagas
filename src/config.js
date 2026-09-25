import { loadProfile } from './profile.js';

// Suas preferências de busca vêm de perfil/perfil.json (seção "busca").
const { search } = loadProfile();

export const config = {
  search,
  // Termos buscados nas plataformas que pesquisam por palavra (Gupy, Sólides).
  // O filtro final olha título + corpo, então termos amplos são bons.
  gupyTerms: search.termos,
  solidesTerms: search.termos,
  maxAgeDays: search.idadeMaximaDias,
  // Empresas com página pública no Lever. Adicione slugs à vontade.
  leverCompanies: ['ciandt'],
  // Empresas no Greenhouse (job-boards.greenhouse.io/empresa). A lista cresce sozinha em
  // data/greenhouse-empresas.json (capturas, Empregos Tech, e-mails do Greenhouse).
  greenhouseBoards: [
    'btgpactual', 'xpinc', 'gympass', 'gitlab', 'vercel', 'canonical', 'stone', 'inter', 'vtex',
    'arcotech', 'rdsourcing', 'zupinnovation', 'quintoandar', 'c6bank', 'ebanx', 'wildlifestudios',
  ],
  // Empresas na InHire (empresa.inhire.app). A lista cresce sozinha em data/inhire-empresas.json
  // com empresas vistas nas capturas, no Empregos Tech e nos e-mails da InHire no seu Gmail.
  inhireTenants: [
    'mazzatech', 'winnin', 'grupotaking', 'monkey', 'extremegroup', 'globalsystem', 'radix', 'solutis',
    'pantheon', 'platformbuilders', 'nava', 'kooperecooperativa', 'vonbz', 'tqi', 'kstack', 'teclat',
    'skopiadigital', 'doc9', 'exati', 'solfacil', 'tinnova', 'tecer', 'rentbrella', 'iconit', 'rpo-vr',
    'cerc', 'nstech', 'nuvemshop-tiendanube', 'programmers', 'mblabs', 'auvotecnologia', 'frameworkdigital',
    'ipnet', 'poncetech', 'carreiras', 'dtlabs', 'venturus', 'toroinvestimentos', 'dotgroup', 'inbazz',
    'liber', 'involves', 'sevenred', 'lwsa', 'lighthouseit', '7comm', 'bixtecnologia', 'sittax', 'gx2',
  ],
};
