import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRole, extractRole, writeApplication } from '../src/writer.js';

test('limpa títulos de post e de ATS', () => {
  assert.equal(extractRole('🚀 Vaga Desenvolvedor(a) Fullstack Pleno/Sênior (Node.js / React) | ília | 100% remoto'), 'Desenvolvedora Fullstack Pleno/Sênior');
  assert.equal(extractRole('Vaga aberta na Bradata: Desenvolvedor Fullstack Sênior (Node.js + React) Modelo: 100% Remoto | PJ'), 'Desenvolvedor Fullstack Sênior');
  assert.equal(cleanRole('Software Engineer FrontEnd (React) '), 'Software Engineer FrontEnd');
});

test('respeita maiúsculas ao flexionar o gênero', () => {
  assert.equal(cleanRole('DESENVOLVEDOR(A) FULL STACK SÊNIOR'), 'DESENVOLVEDORA FULL STACK SÊNIOR');
});

test('não confunde título de página ou link com cargo', () => {
  assert.equal(cleanRole('Feed | LinkedIn'), null);
  assert.equal(extractRole('https://empresa.inhire.app/vagas/123/dev-react\nObrigado a todos!'), null);
});

const perfil = {
  nome: 'Maria Teste', email: 'maria@exemplo.com', cidade: 'Recife, PE',
  pretensao: { pj: 'R$ 12.000', clt: 'R$ 10.000' },
  skills: ['React', 'TypeScript', 'Jest'],
  carta: { apresentacao: 'sou Desenvolvedora Front-end.', especialidade: 'React é minha especialidade.', despedida: 'Obrigada!' },
  destaques: [
    { sempre: true, texto: 'DESTAQUE-SEMPRE' },
    { quando: ['design system'], texto: 'DESTAQUE-DS' },
    { texto: 'DESTAQUE-RESERVA' },
  ],
};
const job = (over = {}) => ({ title: 'Desenvolvedora React Sênior', text: '', emails: ['rh@empresa.com.br'], company: null, ...over });

test('usa o assunto pedido pela vaga, com o nome da pessoa', () => {
  const w = writeApplication(job({ text: 'Envie com o assunto "Front Sênior - Seu Nome".' }), perfil);
  assert.equal(w.subject, 'Front Sênior - Maria Teste');
});

test('carta cita só skills do perfil que aparecem na vaga e escolhe destaques por gatilho', () => {
  const w = writeApplication(job({ text: 'React, TypeScript e Design System. Contrato PJ.' }), perfil);
  assert.match(w.body, /Vi que a vaga envolve React, TypeScript/);
  assert.doesNotMatch(w.body, /Jest/);
  assert.match(w.body, /DESTAQUE-SEMPRE/);
  assert.match(w.body, /DESTAQUE-DS/);
  assert.match(w.body, /R\$ 12\.000 mensais no modelo PJ/);
  assert.equal(w.to, 'rh@empresa.com.br');
});

test('sem cargo confiável, o assunto usa o cargo padrão do perfil', () => {
  const w = writeApplication(job({ title: 'Feed | LinkedIn' }), { ...perfil, carta: { ...perfil.carta, cargoPadrao: 'Desenvolvedora Front-end' } });
  assert.equal(w.subject, 'Candidatura — Desenvolvedora Front-end | Maria Teste');
});
