import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealsFromRaw, type RawMeal } from './options.js';

test('mappa più alternative in optionIndex distinti con etichetta', () => {
  const raw: RawMeal[] = [
    {
      day: 0,
      type: 'BREAKFAST',
      options: [
        { label: 'Porridge', items: [{ name: 'Avena', value: 70, unit: 'g' }, { name: 'Latte', value: 200, unit: 'ml' }] },
        { label: 'Yogurt', items: [{ name: 'Yogurt', value: 150, unit: 'g' }] },
      ],
    },
  ];
  const [meal] = mealsFromRaw(raw);
  assert.equal(meal.items.length, 3);
  const opt0 = meal.items.filter((i) => i.optionIndex === 0);
  const opt1 = meal.items.filter((i) => i.optionIndex === 1);
  assert.equal(opt0.length, 2);
  assert.equal(opt1.length, 1);
  assert.equal(opt0[0]!.optionLabel, 'Porridge');
  assert.equal(opt1[0]!.optionLabel, 'Yogurt');
  // ogni item ha un foodId di catalogo non vuoto
  assert.ok(meal.items.every((i) => typeof i.foodId === 'string' && i.foodId.length > 0));
});

test('scarta le opzioni vuote PRIMA di indicizzare: l\'opzione 0 ha sempre item', () => {
  const raw: RawMeal[] = [
    {
      day: 1,
      type: 'LUNCH',
      options: [
        { label: 'Vuota', items: [] },
        { label: 'Piena', items: [{ name: 'Pasta', value: 90, unit: 'g' }] },
      ],
    },
  ];
  const [meal] = mealsFromRaw(raw);
  const indexes = [...new Set(meal.items.map((i) => i.optionIndex))];
  assert.deepEqual(indexes, [0]);
  assert.equal(meal.items[0]!.optionLabel, 'Piena');
});

test('forma legacy senza options: items come unica opzione 0', () => {
  const raw: RawMeal[] = [
    { day: 2, type: 'DINNER', items: [{ name: 'Pollo', value: 120, unit: 'g' }] },
  ];
  const [meal] = mealsFromRaw(raw);
  assert.equal(meal.items.length, 1);
  assert.equal(meal.items[0]!.optionIndex, 0);
  assert.equal(meal.items[0]!.optionLabel, undefined);
});

test('omette i pasti senza alcun item valido', () => {
  const raw: RawMeal[] = [
    { day: 3, type: 'SNACK', options: [{ items: [] }] },
    { day: 3, type: 'BREAKFAST', items: [] },
  ];
  assert.equal(mealsFromRaw(raw).length, 0);
});

test('filtra item con nome vuoto o quantità non positiva', () => {
  const raw: RawMeal[] = [
    {
      day: 4,
      type: 'SNACK',
      options: [
        {
          items: [
            { name: 'Mela', value: 150, unit: 'g' },
            { name: '', value: 10, unit: 'g' },
            { name: 'Niente', value: 0, unit: 'g' },
          ],
        },
      ],
    },
  ];
  const [meal] = mealsFromRaw(raw);
  assert.equal(meal.items.length, 1);
  assert.equal(meal.items[0]!.name, 'Mela');
});
