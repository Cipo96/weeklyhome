import { dimensionOf, toBase, type Unit } from '@weeklyhome/domain';
import type { FoodMeta } from '../data/seed';

export interface KcalItem {
  foodId: string;
  value: number;
  unit: Unit;
}

export interface KcalEstimate {
  /** Calorie stimate (arrotondate). */
  kcal: number;
  /** True se almeno un alimento non aveva un valore kcal noto (stima parziale). */
  partial: boolean;
}

/**
 * Stima approssimativa delle calorie di un insieme di alimenti, dai valori di
 * riferimento del catalogo (`FoodMeta.kcal`: per 100 g/ml, o per pezzo). Gli
 * alimenti senza kcal nota vengono saltati e segnalati con `partial`.
 */
export function estimateKcal(
  items: KcalItem[],
  metaOf: (foodId: string) => FoodMeta,
): KcalEstimate {
  let kcal = 0;
  let partial = false;
  for (const it of items) {
    const ref = metaOf(it.foodId).kcal;
    if (ref == null) {
      partial = true;
      continue;
    }
    const base = toBase({ value: it.value, unit: it.unit }); // g, ml oppure pz
    kcal += dimensionOf(it.unit) === 'count' ? ref * base : (ref * base) / 100;
  }
  return { kcal: Math.round(kcal), partial };
}
