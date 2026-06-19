import type { ConsumptionLine, ShoppingListRow } from './types.js';
import { addQuantities } from './units.js';

/**
 * Costruisce la lista della spesa aggregata (US-010) a partire dal consumo.
 *
 * Garantisce un'unica riga per alimento sommando eventuali duplicati e
 * ordina le righe per `foodId` per un output stabile. Le quantità sono già
 * normalizzate per la visualizzazione (g/kg, ml/l, pz).
 */
export function buildShoppingList(consumption: ConsumptionLine[]): ShoppingListRow[] {
  const byFood = new Map<string, ShoppingListRow>();

  for (const line of consumption) {
    const existing = byFood.get(line.foodId);
    if (existing) {
      existing.quantity = addQuantities(existing.quantity, line.quantity);
    } else {
      byFood.set(line.foodId, { foodId: line.foodId, quantity: { ...line.quantity } });
    }
  }

  return [...byFood.values()].sort((a, b) => a.foodId.localeCompare(b.foodId));
}
