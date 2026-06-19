import { describe, expect, it } from 'vitest';
import { addQuantities, normalizeForDisplay, scaleQuantity, toBase } from '../src/units.js';

describe('units', () => {
  it('converte verso l\'unità base', () => {
    expect(toBase({ value: 2, unit: 'kg' })).toBe(2000);
    expect(toBase({ value: 1.5, unit: 'l' })).toBe(1500);
    expect(toBase({ value: 3, unit: 'pz' })).toBe(3);
  });

  it('normalizza grammi in kg oltre i 1000', () => {
    expect(normalizeForDisplay(1500, 'mass')).toEqual({ value: 1.5, unit: 'kg' });
    expect(normalizeForDisplay(800, 'mass')).toEqual({ value: 800, unit: 'g' });
  });

  it('normalizza millilitri in litri oltre i 1000', () => {
    expect(normalizeForDisplay(2000, 'volume')).toEqual({ value: 2, unit: 'l' });
    expect(normalizeForDisplay(250, 'volume')).toEqual({ value: 250, unit: 'ml' });
  });

  it('somma quantità della stessa dimensione e normalizza', () => {
    expect(addQuantities({ value: 800, unit: 'g' }, { value: 0.5, unit: 'kg' })).toEqual({
      value: 1.3,
      unit: 'kg',
    });
  });

  it('rifiuta la somma fra dimensioni diverse', () => {
    expect(() => addQuantities({ value: 1, unit: 'kg' }, { value: 1, unit: 'l' })).toThrow();
  });

  it('scala una quantità per un fattore', () => {
    expect(scaleQuantity({ value: 100, unit: 'g' }, 2.5)).toEqual({ value: 250, unit: 'g' });
    expect(scaleQuantity({ value: 600, unit: 'g' }, 2)).toEqual({ value: 1.2, unit: 'kg' });
  });
});
