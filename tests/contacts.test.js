import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContacts, personName, fitOf, writeSpontaneous, queueContacts } from '../src/contacts.js';

const LIST = [
  'Datum\t—\tdatum@job.recrut.ai\tReact, React Native, Fullstack, IA, Cloud, DevOps',
  'Protech Solutions\tJoão Paulo\tjoaopaulo@protechsolutions.com.br\tdesenvolvimento, manutenção, testes, TI',
  'Minsait\tCarolina Costa / recrutamento\ttcosta@minsait.com / gtauan@minsait.com\ttecnologia, SAP, cloud, dados',
  'Capgemini\t—\tcandidatura pelo portal\tcloud, digital',
  'HUNT IT\t—\tcomercial@huntit.com.br\tTI, hunting',
  'Datum (de novo)\t—\tdatum@job.recrut.ai\tReact',
].join('\n');

test('lê a tabela, fica com um e-mail por empresa e explica o que ficou de fora', () => {
  const { rows, skipped } = parseContacts(LIST);
  assert.deepEqual(rows.map((r) => r.email), ['datum@job.recrut.ai', 'joaopaulo@protechsolutions.com.br', 'tcosta@minsait.com']);
  assert.equal(skipped.length, 3);
  assert.match(skipped.map((s) => s.reason).join(' | '), /sem e-mail.*não é canal.*repetido/);
});

test('saudação: nome de pessoa ou "equipe"', () => {
  assert.equal(personName('João Paulo'), 'João Paulo');
  assert.equal(personName('Carolina Costa / recrutamento'), 'Carolina Costa');
  for (const x of ['—', 'RH', 'Recrutamento e Seleção', 'Atração / RH', '']) assert.equal(personName(x), null);
});

test('aderência pelas palavras-chave', () => {
  assert.equal(fitOf(['React', 'Fullstack', 'IA']).level, 'alta');
  assert.equal(fitOf(['desenvolvimento', 'QA', 'tecnologia']).level, 'média');
  assert.equal(fitOf(['TI', 'suporte', 'infraestrutura']).level, 'baixa');
});

const perfil = {
  nome: 'Maria Teste', email: 'maria@exemplo.com', cidade: 'Recife, PE', telefone: '81999999999',
  linkedin: 'https://linkedin.com/in/maria', github: 'https://github.com/maria',
  skills: ['React', 'JavaScript', 'Node.js', 'IA Generativa'],
  carta: { apresentacao: 'sou Desenvolvedora Front-end.', especialidade: 'React é minha especialidade.', despedida: 'Obrigada!' },
  destaques: [{ sempre: true, texto: 'DESTAQUE-SEMPRE' }, { quando: ['ia generativa'], texto: 'DESTAQUE-IA' }],
};

test('carta espontânea: saudação, empresa, skills em comum (palavra inteira) e contatos', () => {
  const w = writeSpontaneous({ empresa: 'Datum', responsavel: '—', keywords: ['React', 'Node', 'Java', 'IA'] }, perfil, 'CANDIDATURA | Front End');
  assert.equal(w.subject, 'CANDIDATURA | Front End');
  assert.match(w.body, /^Olá, equipe Datum!/);
  assert.match(w.body, /vagas em aberto da empresa Datum/);
  assert.match(w.body, /Trabalho no dia a dia com React, Node\.js, IA Generativa\./);
  assert.doesNotMatch(w.body, /JavaScript/, '"Java" não pode virar "JavaScript"');
  assert.match(w.body, /DESTAQUE-IA/);
  assert.match(w.body, /https:\/\/linkedin\.com\/in\/maria/);
});

test('coloca na fila uma vez só e não reenvia quem já recebeu', () => {
  const store = { jobs: {} };
  const rows = parseContacts(LIST).rows;
  assert.equal(queueContacts(store, rows, 'X').added, 3);
  store.jobs['lista:datum@job.recrut.ai'].status = 'enviada';
  const again = queueContacts(store, rows, 'X');
  assert.deepEqual(again.alreadySent, ['Datum']);
  assert.equal(again.updated, 2);
});
