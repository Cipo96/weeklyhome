import { describe, expect, it } from 'vitest';
import { buildShoppingList } from '../src/shopping-list.js';
import type { ConsumptionLine } from '../src/types.js';

describe('buildShoppingList', () => {
  it('produce una riga per alimento, ordinata per foodId', () => {
    const consumption: ConsumptionLine[] = [
      { foodId: 'pasta', quantity: { value: 250, unit: 'g' } },
      { foodId: 'milk', quantity: { value: 200, unit: 'ml' } },
    ];
    expect(buildShoppingList(consumption)).toEqual([
      { foodId: 'milk', quantity: { value: 200, unit: 'ml' } },
      { foodId: 'pasta', quantity: { value: 250, unit: 'g' } },
    ]);
  });

  it('aggrega righe duplicate dello stesso alimento', () => {
    const consumption: ConsumptionLine[] = [
      { foodId: 'oats', quantity: { value: 800, unit: 'g' } },
      { foodId: 'oats', quantity: { value: 0.5, unit: 'kg' } },
    ];
    expect(buildShoppingList(consumption)).toEqual([
      { foodId: 'oats', quantity: { value: 1.3, unit: 'kg' } },
    ]);
  });

  it('gestisce una lista vuota', () => {
    expect(buildShoppingList([])).toEqual([]);
  });
});
