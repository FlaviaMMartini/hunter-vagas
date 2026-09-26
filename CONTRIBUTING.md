# Como contribuir

Obrigada pelo interesse! O Hunter é pequeno de propósito: Node.js puro, sem dependências de npm e com os
dados de cada pessoa só no computador dela. Contribuições que mantêm isso são muito bem-vindas.

## Rodando localmente

```bash
git clone https://github.com/FlaviaMMartini/hunter-vagas.git
cd hunter-vagas
npm start          # abre o painel; o assistente cria o seu perfil
npm test           # testes (node:test, sem instalar nada)
```

Requisito: Node.js 20 ou mais novo.

## Boas primeiras contribuições

- **Nova fonte de vagas** — veja abaixo. Use o modelo de issue "Sugerir fonte de vagas" antes, para combinarmos o caminho.
- **Melhorar o classificador de respostas** (`src/responses.js`) com e-mails reais que caíram na categoria errada
  (tire os dados pessoais antes de colar na issue).
- **Casos de título de vaga** que o `cleanRole`/`extractRole` (`src/writer.js`) limpa errado — venha com um teste.

## Adicionando uma fonte de vagas

Cada fonte é um arquivo em `src/sources/` que devolve vagas neste formato:

```js
{
  source: 'minhafonte',          // nome curto
  id: 'minhafonte:123',          // único e estável
  title: 'Desenvolvedora React Sênior',
  company: 'Empresa',
  text: 'descrição completa (HTML ou texto)',
  url: 'https://link-para-se-candidatar',
  remote: true,                  // true/false/null (null = o filtro decide pelo texto)
  city: 'São Paulo, SP',         // opcional
  country: 'BR',                 // opcional
  publishedAt: '2026-09-25T12:00:00Z',
  stillOpen: true,               // opcional: a plataforma garante que a vaga está aberta
}
```

Depois registre a fonte em `src/hunt.js` (ela recebe `step(feitos, total, rótulo)` para o progresso no painel).
O filtro, a deduplicação e as cartas funcionam sem mudar mais nada.

**Regras para fontes:**
- Prefira APIs públicas oficiais, feeds (RSS) ou dados estruturados que a própria página publica.
- Nada que exija login com a conta de alguém, contorne bloqueios ou automatize redes sociais.
- Requisições espaçadas (use `getJson`/`getText` de `src/http.js`) e cache quando a página não muda.

## Antes de abrir o PR

- [ ] `npm test` passando (e um teste novo para o que você mudou, quando fizer sentido)
- [ ] Nenhum dado pessoal: nada de `perfil/perfil.json`, `.env`, `data/` ou currículos
- [ ] Sem dependências novas de npm (se for inevitável, explique no PR)
- [ ] Comentários e mensagens para a pessoa usuária em português
