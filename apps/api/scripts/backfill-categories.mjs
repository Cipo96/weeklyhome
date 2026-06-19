import { PrismaService } from '../dist/prisma/prisma.service.js';
import { CategoryService } from '../dist/category/category.service.js';

const prisma = new PrismaService();
await prisma.$connect();
const svc = new CategoryService(prisma);

// 1) VolantinoProduct senza categoria
const vps = await prisma.volantinoProduct.findMany({
  where: { category: null },
  select: { id: true, name: true },
});
// 2) MealItem senza categoria
const items = await prisma.mealItem.findMany({
  where: { category: null },
  select: { id: true, name: true, foodId: true },
});

const allNames = [
  ...new Set([...vps.map((v) => v.name), ...items.map((it) => it.name ?? it.foodId)]),
];
console.log(`Nomi distinti da categorizzare: ${allNames.length}`);
const cat = await svc.categorizeMany(allNames);

let upV = 0;
for (const v of vps) {
  const c = cat.get(v.name) ?? null;
  if (c) {
    await prisma.volantinoProduct.update({ where: { id: v.id }, data: { category: c } });
    upV++;
  }
}
let upI = 0;
for (const it of items) {
  const c = cat.get(it.name ?? it.foodId) ?? null;
  if (c) {
    await prisma.mealItem.update({ where: { id: it.id }, data: { category: c } });
    upI++;
  }
}
console.log(`Aggiornati: ${upV}/${vps.length} prodotti, ${upI}/${items.length} item piano.`);
await prisma.$disconnect();
