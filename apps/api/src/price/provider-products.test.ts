import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pricesFromProducts, type ProviderProduct } from './price-data.js';

const p = (over: Partial<ProviderProduct>): ProviderProduct => ({
  foodId: 'milk',
  storeId: 'lidl',
  name: 'Latte',
  brand: null,
  packPrice: 1,
  unitPrice: 1,
  baseUnit: 'l',
  ...over,
});

test('pricesFromProducts: tiene il più conveniente per alimento×negozio', () => {
  const recs = pricesFromProducts(
    [
      p({ foodId: 'milk', unitPrice: 1.2 }),
      p({ foodId: 'milk', unitPrice: 0.9 }),
      p({ foodId: 'pasta', unitPrice: 1.1 }),
    ],
    'lidl-offers',
  );
  const milk = recs.find((r) => r.foodId === 'milk');
  assert.equal(milk?.unitPrice, 0.9);
  assert.equal(milk?.source, 'lidl-offers');
  assert.equal(recs.length, 2);
});

test('pricesFromProducts: stesso foodId in negozi diversi resta separato', () => {
  const recs = pricesFromProducts(
    [p({ storeId: 'lidl', unitPrice: 1.0 }), p({ storeId: 'eurospin', unitPrice: 1.5 })],
    'x',
  );
  assert.equal(recs.length, 2);
});
