import { PrismaClient } from '@prisma/client';
import { PriceService } from '../dist/price/price.service.js';
import { CategoryService } from '../dist/category/category.service.js';

const prisma = new PrismaClient();
const svc = new PriceService(prisma, new CategoryService(prisma));

console.log('== Refresh volantino CONAD (force) ==');
try {
  const r = await svc.refreshConadVolantino('conad', true);
  console.log('Conad:', JSON.stringify({ volantini: r.volantini, extracted: r.extracted, matched: r.matched }));
} catch (e) {
  console.error('Conad FALLITO:', e?.message ?? e);
}

console.log('== Refresh volantino TODIS (force) ==');
try {
  const r = await svc.refreshTodisVolantino('todis', true);
  console.log('Todis:', JSON.stringify({ title: r.title, extracted: r.extracted, matched: r.matched }));
} catch (e) {
  console.error('Todis FALLITO:', e?.message ?? e);
}

const total = await prisma.volantinoProduct.count();
const withBrand = await prisma.volantinoProduct.count({ where: { brand: { not: null } } });
console.log(`\nVolantinoProduct in DB: ${total} (con marca: ${withBrand})`);
await prisma.$disconnect();
