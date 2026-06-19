import { PrismaClient } from '@prisma/client';
import { categoriesMatch, effectiveKey } from '../dist/category/taxonomy.js';

const prisma = new PrismaClient();
const now = new Date();

const plan = await prisma.plan.findFirst({
  where: { status: 'ACTIVE' },
  include: { meals: { include: { items: true } } },
});
const planRows = new Map(); // effectiveKey -> { name, foodId, category }
for (const m of plan?.meals ?? [])
  for (const it of m.items) {
    planRows.set(effectiveKey(it.foodId, it.category ?? null), {
      name: it.name ?? it.foodId,
      foodId: it.foodId,
      category: it.category ?? null,
    });
  }

const vps = await prisma.volantinoProduct.findMany({
  where: { OR: [{ validTo: null }, { validTo: { gt: now } }] },
  select: { name: true, foodId: true, category: true, storeId: true },
});

let inOffer = 0;
let absent = 0;
for (const [, row] of planRows) {
  const matched = vps.filter(
    (v) =>
      (row.category && v.category && categoriesMatch(row.category, v.category)) ||
      (v.foodId && v.foodId === row.foodId),
  );
  const status = matched.length > 0 ? `IN OFFERTA (${matched.length})` : 'ASSENTE nel volantino';
  if (matched.length > 0) inOffer++;
  else absent++;
  console.log(`${row.name.padEnd(40)} [cat=${row.category ?? '-'}] -> ${status}`);
}
console.log(`\nTotale: ${inOffer} in offerta, ${absent} assenti su ${planRows.size} item.`);
await prisma.$disconnect();
