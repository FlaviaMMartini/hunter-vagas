import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, cleanText } from '../src/filter.js';
import { compile } from '../src/profile.js';

// Regras de teste independentes do perfil de quem roda os testes.
const search = compile({
  busca: {
    stack: ['react', 'react.js', 'reactjs'],
    ignorar: ['react native'],
    diferenciais: ['typescript', 'next.js'],
    remoto: true,
    hibridoEm: ['florianópolis'],
    niveisExcluidos: ['júnior', 'jr', 'estágio', 'intern'],
  },
});
const config = { maxAgeDays: 45, search };
const job = (over = {}) => ({
  title: 'Desenvolvedora Front-end Sênior', text: 'Stack React e TypeScript. 100% remoto.', remote: null,
  country: 'BR', publishedAt: new Date().toISOString(), ...over,
});

test('aprova vaga remota com a stack e marca os diferenciais', () => {
  const r = evaluate(job(), config);
  assert.equal(r.rejected, undefined);
  assert.equal(r.modality, 'remoto');
  assert.deepEqual(r.extras, ['typescript']);
  assert.equal(r.level, 'senior');
});

test('"react native" sozinho não conta como react', () => {
  const r = evaluate(job({ text: 'Vaga React Native para app mobile. Remoto.' }), config);
  assert.equal(r.rejected, 'sem React');
});

test('nível excluído vale palavra inteira ("intern" não barra "internacional")', () => {
  assert.equal(evaluate(job({ title: 'Desenvolvedor React Júnior' }), config).rejected, 'nível excluído');
  assert.equal(evaluate(job({ title: 'Dev React Sênior - Projeto Internacional' }), config).rejected, undefined);
});

test('híbrido só entra na cidade aceita (sem depender de acento)', () => {
  const floripa = evaluate(job({ text: 'React. Híbrido em Florianopolis/SC.', remote: false, city: 'Florianopolis, SC' }), config);
  assert.equal(floripa.rejected, undefined);
  const sp = evaluate(job({ text: 'React. Híbrido em São Paulo.', remote: false, city: 'São Paulo, SP' }), config);
  assert.equal(sp.rejected, 'não remota');
});

test('vaga antiga é descartada, a não ser que a plataforma diga que segue aberta', () => {
  const old = new Date(Date.now() - 100 * 864e5).toISOString();
  assert.equal(evaluate(job({ publishedAt: old }), config).rejected, 'antiga');
  assert.equal(evaluate(job({ publishedAt: old, stillOpen: true }), config).rejected, undefined);
});

test('extrai e-mail da vaga e define o canal', () => {
  const r = evaluate(job({ text: 'React remoto. Envie o CV para RH@Empresa.com.br.' }), config);
  assert.deepEqual(r.emails, ['rh@empresa.com.br']);
  assert.equal(r.channel, 'email');
});

test('force inclui mesmo o que o filtro recusaria', () => {
  const r = evaluate(job({ title: 'Dev Angular Júnior', text: 'Angular. Presencial.' }), config, { force: true });
  assert.equal(r.rejected, undefined);
});

test('cleanText decodifica acentos em HTML e tira tags', () => {
  assert.equal(cleanText('<p>Experi&ecirc;ncia com React &amp; Comunica&ccedil;&atilde;o</p>'), 'Experiência com React & Comunicação');
});
