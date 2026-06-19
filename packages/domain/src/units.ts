import type { Quantity, Unit } from './types.js';

/** Dimensione fisica di un'unità. */
type Dimension = 'mass' | 'volume' | 'count';

const DIMENSION: Record<Unit, Dimension> = {
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
  pz: 'count',
};

/** Unità base canonica per dimensione (in cui si fanno i conti). */
const BASE_UNIT: Record<Dimension, Unit> = {
  mass: 'g',
  volume: 'ml',
  count: 'pz',
};

/** Fattore di conversione verso l'unità base. */
const TO_BASE: Record<Unit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  pz: 1,
};

export function dimensionOf(unit: Unit): Dimension {
  return DIMENSION[unit];
}

/** Converte una quantità nell'unità base della sua dimensione. */
export function toBase(q: Quantity): number {
  return q.value * TO_BASE[q.unit];
}

/**
 * Normalizza un valore in unità base verso un'unità leggibile:
 * 1000 g -> 1 kg, 1500 ml -> 1.5 l. I pezzi restano `pz`.
 */
export function normalizeForDisplay(baseValue: number, dimension: Dimension): Quantity {
  if (dimension === 'mass') {
    return baseValue >= 1000
      ? { value: round(baseValue / 1000), unit: 'kg' }
      : { value: round(baseValue), unit: 'g' };
  }
  if (dimension === 'volume') {
    return baseValue >= 1000
      ? { value: round(baseValue / 1000), unit: 'l' }
      : { value: round(baseValue), unit: 'ml' };
  }
  return { value: round(baseValue), unit: 'pz' };
}

/**
 * Somma due quantità. Devono appartenere alla stessa dimensione,
 * altrimenti viene lanciato un errore (un alimento non può essere
 * misurato in g e in ml contemporaneamente).
 */
export function addQuantities(a: Quantity, b: Quantity): Quantity {
  const da = DIMENSION[a.unit];
  const db = DIMENSION[b.unit];
  if (da !== db) {
    throw new Error(
      `Impossibile sommare quantità di dimensioni diverse: ${a.unit} (${da}) + ${b.unit} (${db})`,
    );
  }
  const baseSum = toBase(a) + toBase(b);
  return normalizeForDisplay(baseSum, da);
}

/** Moltiplica una quantità per un fattore scalare (es. il doseFactor). */
export function scaleQuantity(q: Quantity, factor: number): Quantity {
  return normalizeForDisplay(toBase(q) * factor, DIMENSION[q.unit]);
}

function round(value: number): number {
  // Due decimali, evitando -0 e gli artefatti in virgola mobile.
  return Math.round((value + Number.EPSILON) * 100) / 100 || 0;
}

export { BASE_UNIT };
