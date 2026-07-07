import { PrismaClient } from '@prisma/client';
import { PriceService } from '../dist/price/price.service.js';
import { CategoryService } from '../dist/category/category.service.js';

const prisma = new PrismaClient();
const svc = new PriceService(prisma, new CategoryService(prisma));

async function snapshot(label) {
  const total = await prisma.price.count();
  const bySource = await prisma.price.groupBy({ by: ['source'], _count: { _all: true }, _max: { fetchedAt: true } });
  console.log(`\n--- ${label}: Price totali = ${total} ---`);
  for (const r of bySource.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${r.source.padEnd(16)} ${String(r._count._all).padStart(3)}  ultimo: ${r._max.fetchedAt?.toISOString() ?? '-'}`);
  }
  return total;
}

console.log('== Refresh multi-catena HTTP (conad-catalog, lidl, oasi, eurospin) ==');
console.log('Provider attivi (PRICE_PROVIDER):', process.env.PRICE_PROVIDER ?? '(default)');

await snapshot('PRIMA');

try {
  const r = await svc.refresh();
  console.log(`\n>>> refresh(): provider=[${r.providers.join(', ')}] aggiornati=${r.updated} mantenuti-in-offerta=${r.skippedForOffer} @ ${r.fetchedAt.toISOString()}`);
} catch (e) {
  console.error('refresh() FALLITO:', e?.stack ?? e?.message ?? e);
}

await snapshot('DOPO');

// Campione: prezzi più freschi per qualche staple, per insegna
const sampleFoods = ['pasta', 'milk', 'chicken', 'tuna', 'yogurt', 'parmesan', 'oil', 'eggs'];
console.log('\n--- Campione "dove conviene" (per alimento, prezzo unitario crescente) ---');
for (const foodId of sampleFoods) {
  const rows = await prisma.price.findMany({ where: { foodId }, include: { store: true }, orderBy: { unitPrice: 'asc' } });
  if (rows.length === 0) { console.log(`  ${foodId.padEnd(12)} (nessun prezzo)`); continue; }
  const parts = rows.map((p) => `${p.store?.name ?? p.storeId} ${p.unitPrice.toFixed(2)} [${p.source}]`);
  console.log(`  ${foodId.padEnd(12)} ${parts.join('  |  ')}`);
}

const vpTotal = await prisma.volantinoProduct.count();
const vpBySource = await prisma.volantinoProduct.groupBy({ by: ['source'], _count: { _all: true }, _max: { fetchedAt: true } });
console.log(`\n--- VolantinoProduct (vision) totali = ${vpTotal} ---`);
for (const r of vpBySource) {
  console.log(`  ${r.source.padEnd(18)} ${String(r._count._all).padStart(3)}  ultimo: ${r._max.fetchedAt?.toISOString() ?? '-'}`);
}

await prisma.$disconnect();
