import { test } from 'node:test';
import assert from 'node:assert/strict';
import { englishRequired, contractOf, needsEnglish, acceptsFluentEnglish } from '../src/filter.js';
import { buildQueue } from '../src/queue.js';

const job = (over = {}) => ({ title: 'Desenvolvedora React Sênior', text: '', ...over });

test('inglês: técnico/leitura não conta; fluente/avançado conta', () => {
  assert.equal(englishRequired(job(), 'Inglês técnico para leitura de documentação.'), false);
  assert.equal(englishRequired(job(), 'Requisitos: inglês avançado.'), true);
  assert.equal(englishRequired(job(), 'Fluência em inglês é obrigatória.'), true);
  assert.equal(englishRequired(job(), 'Desejável: English (C1).'), true);
});

test('inglês: anúncio todo em inglês conta; dica da fonte também', () => {
  const en = 'We are looking for a React developer to join our team. You will work with the product team and have experience with TypeScript. This role is about building our web app and your skills will grow with the team for our users.';
  assert.equal(englishRequired(job(), en), true);
  assert.equal(englishRequired(job({ englishHint: true }), 'Vaga em português.'), true);
});

test('contrato: freela/temporário × prazo indeterminado, com regime', () => {
  assert.deepEqual(contractOf(job(), 'Contratação CLT, benefícios.'), { kind: 'indeterminado', regime: 'CLT' });
  assert.deepEqual(contractOf(job(), 'Contrato de 6 meses, PJ.'), { kind: 'temporario', regime: 'PJ' });
  assert.deepEqual(contractOf(job({ contractHint: 'freelance projeto' }), 'Landing page em React.'), { kind: 'temporario', regime: 'Freelance' });
  assert.deepEqual(contractOf(job(), 'CLT ou PJ, você escolhe.'), { kind: 'indeterminado', regime: 'CLT ou PJ' });
  // "contrato de trabalho" não é contrato temporário
  assert.equal(contractOf(job(), 'Seu contrato de trabalho será CLT.').kind, 'indeterminado');
});

test('chave "inglês fluente" desligada tira a vaga da fila (sem apagar)', () => {
  const perfil = (accept) => ({ nome: 'Ana Souza', email: 'ana@x.com', genero: 'feminino', skills: ['React'], carta: {}, busca: { aceitaInglesFluente: accept } });
  const store = { jobs: {
    a: { id: 'a', title: 'Dev React', company: 'A', text: 'Inglês fluente.', channel: 'email', status: 'nova', emails: ['rh@a.com'], score: 1 },
    b: { id: 'b', title: 'Dev React', company: 'B', text: 'Vaga CLT.', channel: 'email', status: 'nova', emails: ['rh@b.com'], score: 1 },
  } };
  assert.equal(acceptsFluentEnglish({}), true);
  assert.equal(needsEnglish(store.jobs.a), true);
  assert.deepEqual(buildQueue(store, perfil(true)).map((l) => l.job.id).sort(), ['a', 'b']);
  assert.deepEqual(buildQueue(store, perfil(false)).map((l) => l.job.id), ['b']);
  assert.ok(store.jobs.a);
});
