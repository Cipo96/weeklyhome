import type { Assignment, OptimizationResult, PriceOffer } from './types.js';

/**
 * Strategia "spendo meno" (US-013): per ogni alimento sceglie il negozio
 * con il prezzo più basso, indipendentemente da quanti negozi servano.
 *
 * @param foodIds alimenti della lista della spesa
 * @param offers offerte di prezzo (food × negozio)
 */
export function optimizeCheapest(
  foodIds: string[],
  offers: PriceOffer[],
): OptimizationResult {
  const byFood = groupByFood(offers);
  const assignments: Assignment[] = [];
  const unavailable: string[] = [];

  for (const foodId of unique(foodIds)) {
    const candidates = byFood.get(foodId);
    if (!candidates || candidates.length === 0) {
      unavailable.push(foodId);
      continue;
    }
    const best = candidates.reduce((min, o) => (o.price < min.price ? o : min));
    assignments.push({ foodId, storeId: best.storeId, price: best.price });
  }

  return summarize(assignments, unavailable);
}

/**
 * Strategia "meno tappe" (US-013): minimizza il numero di negozi da visitare
 * (fino a `maxStops`) e, a parità di negozi, il costo totale.
 *
 * Esplora i sottoinsiemi di negozi di dimensione 1..maxStops che coprono tutti
 * gli alimenti disponibili. Il numero di negozi nel raggio è limitato, quindi
 * la ricerca esaustiva è praticabile per `maxStops` piccolo (2-3).
 *
 * Se nessun sottoinsieme entro `maxStops` copre tutti gli alimenti, ricade
 * sulla strategia "spendo meno" (che garantisce sempre copertura massima).
 */
export function optimizeFewestStops(
  foodIds: string[],
  offers: PriceOffer[],
  maxStops = 2,
): OptimizationResult {
  const foods = unique(foodIds);
  const byFood = groupByFood(offers);

  const available = foods.filter((f) => (byFood.get(f)?.length ?? 0) > 0);
  const unavailable = foods.filter((f) => (byFood.get(f)?.length ?? 0) === 0);

  if (available.length === 0) {
    return summarize([], unavailable);
  }

  const stores = unique(offers.map((o) => o.storeId));
  const limit = Math.max(1, Math.min(maxStops, stores.length));

  let best: { assignments: Assignment[]; storeCount: number; total: number } | null = null;

  for (let size = 1; size <= limit; size++) {
    for (const subset of combinations(stores, size)) {
      const subsetSet = new Set(subset);
      const assignments: Assignment[] = [];
      let covers = true;

      for (const foodId of available) {
        const candidates = (byFood.get(foodId) ?? []).filter((o) =>
          subsetSet.has(o.storeId),
        );
        if (candidates.length === 0) {
          covers = false;
          break;
        }
        const cheapest = candidates.reduce((min, o) => (o.price < min.price ? o : min));
        assignments.push({ foodId, storeId: cheapest.storeId, price: cheapest.price });
      }

      if (!covers) continue;

      const usedStores = new Set(assignments.map((a) => a.storeId)).size;
      const total = assignments.reduce((sum, a) => sum + a.price, 0);

      if (
        best === null ||
        usedStores < best.storeCount ||
        (usedStores === best.storeCount && total < best.total)
      ) {
        best = { assignments, storeCount: usedStores, total };
      }
    }
    // Trovata copertura completa con `size` negozi: non serve cercarne di più.
    if (best !== null) break;
  }

  if (best === null) {
    // Nessuna combinazione entro maxStops copre tutto: fallback al minimo prezzo.
    return optimizeCheapest(foods, offers);
  }

  return {
    assignments: best.assignments.sort((a, b) => a.foodId.localeCompare(b.foodId)),
    total: round(best.total),
    storeCount: best.storeCount,
    unavailable,
  };
}

function groupByFood(offers: PriceOffer[]): Map<string, PriceOffer[]> {
  const map = new Map<string, PriceOffer[]>();
  for (const offer of offers) {
    const list = map.get(offer.foodId);
    if (list) list.push(offer);
    else map.set(offer.foodId, [offer]);
  }
  return map;
}

function summarize(assignments: Assignment[], unavailable: string[]): OptimizationResult {
  const total = assignments.reduce((sum, a) => sum + a.price, 0);
  const storeCount = new Set(assignments.map((a) => a.storeId)).size;
  return {
    assignments: assignments.sort((a, b) => a.foodId.localeCompare(b.foodId)),
    total: round(total),
    storeCount,
    unavailable,
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Genera tutti i sottoinsiemi di dimensione esatta `k` di `items`. */
function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const n = items.length;
  if (k > n || k <= 0) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map((i) => items[i]!);
    let i = k - 1;
    while (i >= 0 && indices[i] === i + n - k) i--;
    if (i < 0) return;
    indices[i]!++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1]! + 1;
  }
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100 || 0;
}
