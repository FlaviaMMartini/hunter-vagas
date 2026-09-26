// Confere o Gmail e avisa (notificação do Windows) sobre entrevistas e etapas pendentes.
// Roda pelo Agendador de Tarefas a cada 10 min — funciona com o painel fechado.
import { loadStore } from './store.js';
import { loadPerfil } from './queue.js';
import { checkResponses, markNotified } from './responses.js';
import { notify } from './notify.js';
import { requireProfile } from './profile.js';

// Sem tela: sem perfil configurado, avisa e sai.
requireProfile();

const NOTIFY = {
  entrevista: '🟢 Convite / próxima etapa',
  acao: '🟡 Etapa pendente para você',
};

const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
if (!pass) {
  console.error('Falta GMAIL_APP_PASSWORD no .env');
  process.exit(1);
}
const [store, perfil] = await Promise.all([loadStore(), loadPerfil()]);
const { novas } = await checkResponses({ user: perfil.email, pass, jobs: Object.values(store.jobs) });

const importantes = novas.filter((r) => NOTIFY[r.category]);
// Muitas de uma vez viram um resumo só, para não encher a tela.
if (importantes.length > 3) {
  await notify(`🎯 Hunter: ${importantes.length} respostas importantes`, importantes.map((r) => `• ${r.fromName}: ${r.subject}`).slice(0, 4).join('\n'), 'http://localhost:4321/#respostas');
} else {
  for (const r of importantes) await notify(`${NOTIFY[r.category]} — ${r.fromName}`, r.subject, r.link);
}
await markNotified(novas.map((r) => r.uid));
console.log(`${new Date().toISOString()} · ${novas.length} novas · ${importantes.length} notificadas`);
