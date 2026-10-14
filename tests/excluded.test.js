import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprints } from '../src/excluded.js';

const same = (a, b) => fingerprints(a).some((f) => fingerprints(b).includes(f));
const gupyLink = (id) => `https://x.gupy.io/job/${Buffer.from(JSON.stringify({ jobId: id, source: 'gupy_portal' })).toString('base64')}?jobBoardSource=gupy_portal`;

test('mesma vaga com o nome da empresa escrito diferente', () => {
  assert.ok(same({ id: 'a', company: 'FCamara', title: 'Desenvolvedor Fullstack Senior' }, { id: 'b', company: 'Grupo FCamara', title: 'Desenvolvedor Full Stack Sênior (Remoto)' }));
  assert.ok(same({ id: 'a', company: 'Stefanini', title: 'DESENVOLVEDOR FULL STACK SR' }, { id: 'b', company: 'Stefanini Group', title: 'Desenvolvedor Full Stack Sênior' }));
  assert.ok(same({ id: 'a', company: '4SMART CLOUD LTDA', title: 'Desenvolvedor(a) FullStack Sênior' }, { id: 'b', company: '4 Smart Cloud', title: 'Desenvolvedor FullStack Sênior' }));
});

test('mesma vaga da Gupy por link em formatos diferentes', () => {
  assert.ok(same({ id: 'a', url: gupyLink(123) }, { id: 'b', url: 'https://x.gupy.io/jobs/123?jobBoardSource=gupy_portal' }));
});

test('vagas diferentes não se confundem', () => {
  assert.ok(!same({ id: 'a', company: 'FCamara', title: 'Desenvolvedor Fullstack Senior' }, { id: 'b', company: 'FCamara', title: 'Desenvolvedor Fullstack Pleno' }));
  assert.ok(!same({ id: 'a', company: 'Acme', title: 'Dev React Sênior' }, { id: 'b', company: 'Outra', title: 'Dev React Sênior' }));
  // Captura: link do feed/encurtador não identifica a vaga.
  assert.ok(!same({ id: 'a', source: 'captura', title: 'Vaga 1', url: 'https://lnkd.in/abc' }, { id: 'b', source: 'captura', title: 'Vaga 2', url: 'https://lnkd.in/abc' }));
});
