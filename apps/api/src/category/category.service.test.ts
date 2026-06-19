import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CategoryService } from './category.service.js';

function fakePrisma(seed: Record<string, string | null> = {}) {
  const rows = new Map<string, { nameNorm: string; category: string | null }>(
    Object.entries(seed).map(([k, v]) => [k, { nameNorm: k, category: v }]),
  );
  return {
    nameCategory: {
      findMany: async ({ where }: { where: { nameNorm: { in: string[] } } }) => {
        const ids = where.nameNorm.in;
        return ids.filter((i) => rows.has(i)).map((i) => rows.get(i)!);
      },
      createMany: async ({ data }: { data: Array<{ nameNorm: string; category: string | null }> }) => {
        for (const r of data) rows.set(r.nameNorm, { nameNorm: r.nameNorm, category: r.category });
        return { count: data.length };
      },
    },
  };
}

test('categorizeMany: dizionario e cache, niente AI quando non serve', async () => {
  const prisma = fakePrisma({ marmellata: 'marmellata' });
  const svc = new CategoryService(prisma as never);
  const r = await svc.categorizeMany(['Frittata', 'Marmellata']);
  assert.equal(r.get('Frittata'), 'eggs');
  assert.equal(r.get('Marmellata'), 'marmellata');
});

test('categoryFor: scorciatoia per nome singolo', async () => {
  const svc = new CategoryService(fakePrisma() as never);
  assert.equal(await svc.categoryFor('Petto di pollo'), 'chicken');
  assert.equal(await svc.categoryFor('Oggetto misterioso'), null);
});
