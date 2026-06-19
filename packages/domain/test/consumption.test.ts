import { describe, expect, it } from 'vitest';
import { computeConsumption } from '../src/consumption.js';
import type { Member, WeeklyPlan } from '../src/types.js';

const plan: WeeklyPlan = {
  id: 'p1',
  meals: [
    {
      day: 0,
      type: 'BREAKFAST',
      items: [
        { foodId: 'oats', quantity: { value: 80, unit: 'g' } },
        { foodId: 'milk', quantity: { value: 200, unit: 'ml' } },
      ],
    },
    {
      day: 0,
      type: 'LUNCH',
      items: [{ foodId: 'pasta', quantity: { value: 100, unit: 'g' } }],
    },
  ],
};

const andrea: Member = { id: 'andrea', name: 'Andrea', doseFactor: 1 };
const alessia: Member = { id: 'alessia', name: 'Alessia', doseFactor: 1.5 };

describe('computeConsumption', () => {
  it('per un solo membro con dose 1 segue il piano', () => {
    const result = computeConsumption(plan, [andrea]);
    expect(result).toEqual([
      { foodId: 'milk', quantity: { value: 200, unit: 'ml' } },
      { foodId: 'oats', quantity: { value: 80, unit: 'g' } },
      { foodId: 'pasta', quantity: { value: 100, unit: 'g' } },
    ]);
  });

  it('somma le dosi di più membri (consumo condiviso)', () => {
    const result = computeConsumption(plan, [andrea, alessia]);
    // pasta: 100*1 + 100*1.5 = 250 g
    const pasta = result.find((r) => r.foodId === 'pasta');
    expect(pasta).toEqual({ foodId: 'pasta', quantity: { value: 250, unit: 'g' } });
    // oats: 80*1 + 80*1.5 = 200 g
    const oats = result.find((r) => r.foodId === 'oats');
    expect(oats).toEqual({ foodId: 'oats', quantity: { value: 200, unit: 'g' } });
  });

  it('una correzione per-membro sostituisce il pasto con quantità reali', () => {
    // Alessia a pranzo del lunedì ha mangiato riso al posto della pasta.
    const result = computeConsumption(plan, [andrea, alessia], [
      {
        day: 0,
        type: 'LUNCH',
        memberId: 'alessia',
        items: [{ foodId: 'rice', quantity: { value: 90, unit: 'g' } }],
      },
    ]);
    // pasta: solo Andrea -> 100 g
    expect(result.find((r) => r.foodId === 'pasta')).toEqual({
      foodId: 'pasta',
      quantity: { value: 100, unit: 'g' },
    });
    // rice: solo Alessia, quantità assoluta (non scalata) -> 90 g
    expect(result.find((r) => r.foodId === 'rice')).toEqual({
      foodId: 'rice',
      quantity: { value: 90, unit: 'g' },
    });
  });

  it('una correzione globale vale per tutti i membri', () => {
    const result = computeConsumption(plan, [andrea, alessia], [
      {
        day: 0,
        type: 'BREAKFAST',
        items: [{ foodId: 'eggs', quantity: { value: 2, unit: 'pz' } }],
      },
    ]);
    // eggs: 2 (assoluti) per ciascun membro -> 4 pz
    expect(result.find((r) => r.foodId === 'eggs')).toEqual({
      foodId: 'eggs',
      quantity: { value: 4, unit: 'pz' },
    });
    // niente più oats/milk in quel pasto
    expect(result.find((r) => r.foodId === 'oats')).toBeUndefined();
  });

  it('un override per-membro ha precedenza su quello globale', () => {
    const result = computeConsumption(plan, [andrea, alessia], [
      {
        day: 0,
        type: 'LUNCH',
        items: [{ foodId: 'soup', quantity: { value: 300, unit: 'ml' } }], // globale
      },
      {
        day: 0,
        type: 'LUNCH',
        memberId: 'andrea',
        items: [{ foodId: 'pizza', quantity: { value: 1, unit: 'pz' } }], // solo Andrea
      },
    ]);
    // Andrea -> pizza, Alessia -> soup
    expect(result.find((r) => r.foodId === 'pizza')).toEqual({
      foodId: 'pizza',
      quantity: { value: 1, unit: 'pz' },
    });
    expect(result.find((r) => r.foodId === 'soup')).toEqual({
      foodId: 'soup',
      quantity: { value: 300, unit: 'ml' },
    });
    expect(result.find((r) => r.foodId === 'pasta')).toBeUndefined();
  });

  it('un override può aggiungere un pasto non presente nel piano', () => {
    const result = computeConsumption(plan, [andrea], [
      {
        day: 0,
        type: 'SNACK',
        items: [{ foodId: 'yogurt', quantity: { value: 125, unit: 'g' } }],
      },
    ]);
    expect(result.find((r) => r.foodId === 'yogurt')).toEqual({
      foodId: 'yogurt',
      quantity: { value: 125, unit: 'g' },
    });
  });

  it('lancia errore se un alimento è usato con dimensioni incoerenti', () => {
    const bad: WeeklyPlan = {
      id: 'bad',
      meals: [
        { day: 0, type: 'LUNCH', items: [{ foodId: 'x', quantity: { value: 1, unit: 'g' } }] },
        { day: 1, type: 'LUNCH', items: [{ foodId: 'x', quantity: { value: 1, unit: 'ml' } }] },
      ],
    };
    expect(() => computeConsumption(bad, [andrea])).toThrow();
  });
});
