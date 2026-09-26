import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlight } from '../src/sources/solides.js';
import { decodeHeader, findTextParts, decodeBody } from '../src/imap.js';
import { classify } from '../src/responses.js';
import { termRegex, fold } from '../src/profile.js';

test('Sólides: lê as vagas embutidas na página (Next.js) e resolve a descrição', () => {
  const description = '<p>Buscamos pessoa desenvolvedora React.</p>';
  const job = { id: '927012', title: 'Tech Lead - REMOTE', companyName: 'ACME', description: '$1e', jobType: 'remoto' };
  const flight = `1e:T${Buffer.byteLength(description).toString(16)},${description}5:${JSON.stringify([{ data: [job], totalPages: 3 }])}\n`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const { jobs, totalPages } = parseFlight(html);
  assert.equal(totalPages, 3);
  assert.equal(jobs[0].title, 'Tech Lead - REMOTE');
  assert.equal(jobs[0].description, description);
});

test('IMAP: decodifica assuntos em várias partes (RFC 2047)', () => {
  assert.equal(
    decodeHeader('Subject: =?UTF-8?Q?Flavia,_sua_candidatura_foi_en?=\r\n =?UTF-8?Q?viada_=C3=A0_INDI?='),
    'Subject: Flavia, sua candidatura foi enviada à INDI',
  );
});

test('IMAP: acha as partes de texto e decodifica quoted-printable', () => {
  const bs = [['TEXT', 'PLAIN', ['CHARSET', 'UTF-8'], null, null, 'QUOTED-PRINTABLE', '10'], ['TEXT', 'HTML', ['CHARSET', 'UTF-8'], null, null, 'BASE64', '20'], 'ALTERNATIVE'];
  const parts = findTextParts(bs);
  assert.deepEqual(parts.map((p) => [p.path, p.html]), [['1', false], ['2', true]]);
  assert.equal(decodeBody('Ol=C3=A1, tudo bem?', parts[0]), 'Olá, tudo bem?');
});

test('classifica respostas de recrutamento', () => {
  assert.equal(classify('Entrevista para a vaga Front End SR', 'Gostaríamos de agendar uma conversa.'), 'entrevista');
  assert.equal(classify('Retorno do processo', 'Infelizmente seguiremos com outro perfil.'), 'negativa');
  assert.equal(classify('Candidatura efetuada em Dev React', 'Você pode ser chamada para entrevista.'), 'recebida');
  assert.equal(classify('Etapa Mapeamento Comportamental desbloqueada', ''), 'acao');
});

test('palavras-chave: sem acento, palavra inteira, lista vazia nunca casa', () => {
  assert.ok(termRegex(['florianópolis']).test(fold('Híbrido em Florianopolis')));
  assert.ok(!termRegex(['intern']).test('Projeto Internacional'));
  assert.ok(!termRegex([]).test('qualquer coisa'));
});
