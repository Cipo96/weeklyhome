import { describe, expect, it } from 'vitest';
import { optimizeCheapest, optimizeFewestStops } from '../src/optimization.js';
import type { PriceOffer } from '../src/types.js';

const offers: PriceOffer[] = [
  { foodId: 'A', storeId: 's1', price: 2.0 },
  { foodId: 'A', storeId: 's2', price: 1.5 },
  { foodId: 'B', storeId: 's1', price: 3.0 },
  { foodId: 'B', storeId: 's2', price: 3.5 },
  { foodId: 'C', storeId: 's2', price: 1.0 },
];

describe('optimizeCheapest', () => {
  it('assegna ogni alimento al negozio più economico', () => {
    const r = optimizeCheapest(['A', 'B', 'C'], offers);
    expect(r.assignments).toEqual([
      { foodId: 'A', storeId: 's2', price: 1.5 },
      { foodId: 'B', storeId: 's1', price: 3.0 },
      { foodId: 'C', storeId: 's2', price: 1.0 },
    ]);
    expect(r.total).toBe(5.5);
    expect(r.storeCount).toBe(2);
    expect(r.unavailable).toEqual([]);
  });

  it('segnala gli alimenti senza offerta', () => {
    const r = optimizeCheapest(['A', 'D'], offers);
    expect(r.unavailable).toEqual(['D']);
    expect(r.assignments).toEqual([{ foodId: 'A', storeId: 's2', price: 1.5 }]);
  });

  it('gestisce alimenti tutti non disponibili', () => {
    const r = optimizeCheapest(['X', 'Y'], offers);
    expect(r.total).toBe(0);
    expect(r.storeCount).toBe(0);
    expect(r.unavailable).toEqual(['X', 'Y']);
  });
});

describe('optimizeFewestStops', () => {
  it('preferisce un solo negozio anche se più costoso', () => {
    // s2 copre A, B e C: 1 sola tappa a 6.0; "spendo meno" farebbe 5.5 su 2 negozi.
    const r = optimizeFewestStops(['A', 'B', 'C'], offers, 2);
    expect(r.storeCount).toBe(1);
    expect(r.assignments.every((a) => a.storeId === 's2')).toBe(true);
    expect(r.total).toBe(6.0);
  });

  it('usa due negozi quando nessuno da solo copre tutto', () => {
    const split: PriceOffer[] = [
      { foodId: 'A', storeId: 's1', price: 2.0 },
      { foodId: 'A', storeId: 's2', price: 1.5 },
      { foodId: 'B', storeId: 's1', price: 3.0 },
      { foodId: 'B', storeId: 's2', price: 3.5 },
      { foodId: 'C', storeId: 's3', price: 1.0 },
    ];
    const r = optimizeFewestStops(['A', 'B', 'C'], split, 2);
    expect(r.storeCount).toBe(2);
    expect(r.unavailable).toEqual([]);
    expect(r.assignments).toHaveLength(3);
    expect(r.total).toBe(6.0);
  });

  it('ignora gli alimenti non disponibili nella copertura', () => {
    const r = optimizeFewestStops(['A', 'B', 'C', 'Z'], offers, 2);
    expect(r.unavailable).toEqual(['Z']);
    expect(r.storeCount).toBe(1);
  });

  it('ricade su "spendo meno" se maxStops è insufficiente a coprire tutto', () => {
    const oneEach: PriceOffer[] = [
      { foodId: 'A', storeId: 's1', price: 1.0 },
      { foodId: 'B', storeId: 's2', price: 1.0 },
      { foodId: 'C', storeId: 's3', price: 1.0 },
    ];
    const r = optimizeFewestStops(['A', 'B', 'C'], oneEach, 2);
    // Servono 3 negozi: il fallback assegna comunque tutto.
    expect(r.assignments).toHaveLength(3);
    expect(r.storeCount).toBe(3);
    expect(r.total).toBe(3.0);
  });
});
