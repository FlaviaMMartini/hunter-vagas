import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptured, importPosts, normalizeLink } from '../src/posts.js';

test('texto colado vira vagas separadas por ---, com e-mail e link sem https', () => {
  const text = [
    'Vaga: Desenvolvedora Front-end React Sênior | 100% remoto',
    'Envie o CV para talentos@empresax.com.br com o assunto "Front Sênior - Seu Nome"',
    '---',
    'Vaga Fullstack React Pleno - remoto',
    'Candidate-se: empresa.gupy.io/job/eyJqb2JJZCI6MTIzfQ==',
    '---',
    'Hoje completo 5 anos de casa! Obrigada a todos.',
  ].join('\n');
  const store = { jobs: {} };
  const stats = importPosts(store, parseCaptured(text));
  assert.equal(stats.lidos, 3);
  assert.equal(stats.email, 1);
  assert.equal(stats.plataforma, 1);
  const jobs = Object.values(store.jobs);
  assert.equal(jobs.find((j) => j.channel === 'email').emails[0], 'talentos@empresax.com.br');
  assert.equal(jobs.find((j) => j.channel === 'plataforma').url, 'https://empresa.gupy.io/job/eyJqb2JJZCI6MTIzfQ==');
});

test('a mesma vaga colada duas vezes não duplica', () => {
  const store = { jobs: {} };
  const text = 'Vaga React Sênior remoto. CV para rh@acme.com.br';
  importPosts(store, parseCaptured(text));
  const again = importPosts(store, parseCaptured(text));
  assert.equal(again.repetidas, 1);
  assert.equal(Object.keys(store.jobs).length, 1);
});

test('vaga barrada pelo filtro vai para Descartadas com o motivo', () => {
  const store = { jobs: {} };
  const stats = importPosts(store, parseCaptured('Vaga Desenvolvedor Angular Sênior remoto. CV para rh@x.com.br'));
  assert.equal(stats.descartadasComContato, 1);
  assert.equal(Object.values(store.discarded)[0].reason, 'sem React');
});

test('normalizeLink desembrulha redirecionamentos e acerta links da InHire', () => {
  assert.equal(normalizeLink('https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fx.gupy.io%2Fjob%2F1&urlhash=a'), 'https://x.gupy.io/job/1');
  assert.equal(normalizeLink('https://acme.inhire.com.br/vagas/3cc68d08-5ccb-445d-a2c8-ac35dc8157ba'), 'https://acme.inhire.app/vagas/3cc68d08-5ccb-445d-a2c8-ac35dc8157ba/-');
});
