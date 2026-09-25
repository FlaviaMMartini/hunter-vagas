const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Para páginas HTML (ex.: Sólides, que embute os dados na própria página).
export async function getText(url, { headers = {}, delayMs = 400 } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(delayMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (agente-hunter)', ...headers } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ! falhou ${url}: ${err.message}`);
        return null;
      }
      await sleep(1500 * attempt);
    }
  }
}

// Educado com as fontes: intervalo entre chamadas e poucas tentativas.
export async function getJson(url, { headers = {}, delayMs = 400 } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(delayMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'agente-hunter/0.1', ...headers } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  ! falhou ${url}: ${err.message}`);
        return null;
      }
      await sleep(1500 * attempt);
    }
  }
}
