import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCategories, normalizeName, type ResolveDeps } from './resolve.js';

function deps() {
  const aiCalls: string[][] = [];
  const persisted: Array<{ nameNorm: string; category: string | null; source: 'ai' }> = [];
  const d: ResolveDeps = {
    staticLookup: (n: string) => (n.toLowerCase() === 'frittata' ? 'eggs' : null),
    cacheLookup: async (norms: string[]) => {
      const m = new Map<string, string | null>();
      for (const x of norms) if (x === 'marmellata') m.set(x, 'marmellata');
      return m;
    },
    aiResolve: async (names: string[]) => {
      aiCalls.push(names);
      const m = new Map<string, string | null>();
      for (const n of names) m.set(n, n === 'Cosa nuova' ? 'biscotti' : null);
      return m;
    },
    persist: async (e) => {
      persisted.push(...e);
    },
  };
  return { d, aiCalls, persisted };
}

test('dict-first: non chiama AI per nomi noti al dizionario', async () => {
  const { d, aiCalls } = deps();
  const r = await resolveCategories(['Frittata'], d);
  assert.equal(r.get('Frittata'), 'eggs');
  assert.equal(aiCalls.length, 0);
});

test('cache copre i miss del dizionario, niente AI', async () => {
  const { d, aiCalls } = deps();
  const r = await resolveCategories(['Marmellata'], d);
  assert.equal(r.get('Marmellata'), 'marmellata');
  assert.equal(aiCalls.length, 0);
});

test('AI solo sui miss residui, UNA chiamata batch, e persiste', async () => {
  const { d, aiCalls, persisted } = deps();
  const r = await resolveCategories(['Frittata', 'Marmellata', 'Cosa nuova', 'Altro ignoto'], d);
  assert.equal(r.get('Cosa nuova'), 'biscotti');
  assert.equal(r.get('Altro ignoto'), null);
  assert.equal(aiCalls.length, 1);
  assert.deepEqual(aiCalls[0]!.slice().sort(), ['Altro ignoto', 'Cosa nuova']);
  assert.equal(persisted.length, 2);
});

test('zero nomi-miss → zero chiamate AI', async () => {
  const { d, aiCalls } = deps();
  await resolveCategories(['Frittata', 'Marmellata'], d);
  assert.equal(aiCalls.length, 0);
});

test('normalizeName: trim, lowercase, niente accenti/spazi multipli', () => {
  assert.equal(normalizeName('  Caffè   Lungo '), 'caffe lungo');
});
