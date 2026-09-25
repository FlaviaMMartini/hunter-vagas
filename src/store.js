import { readFile, writeFile, mkdir } from 'node:fs/promises';

const FILE = new URL('../data/jobs.json', import.meta.url);

export async function loadStore() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return { jobs: {}, runs: [] };
  }
}

export async function saveStore(store) {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(FILE, JSON.stringify(store, null, 2));
}
