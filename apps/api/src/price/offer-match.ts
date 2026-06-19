import { CATEGORY_PARENT, isGenericMacroName } from '../category/taxonomy.js';

/**
 * True se un VolantinoProduct (foodId/category) appartiene a una riga di piano
 * (foodId/name/category). Match in ordine:
 *  1. stesso foodId (staple);
 *  2. stessa categoria canonica;
 *  3. espansione macro-gruppo: il piano è il PADRE del prodotto (es. piano
 *     `verdure` ↔ prodotto `patate`), ma SOLO se il nome del piano è davvero
 *     generico ("Frutta secca", "Verdure miste"). Così "Zucchine" — che senza
 *     categoria propria finisce nel macro `verdure` — non aggancia le patate.
 */
export function productMatchesPlanRow(
  planFoodId: string,
  planName: string | null,
  planCategory: string | null,
  prodFoodId: string | null,
  prodCategory: string | null,
): boolean {
  if (prodFoodId && prodFoodId === planFoodId) return true;
  if (!planCategory || !prodCategory) return false;
  if (planCategory === prodCategory) return true;
  if (CATEGORY_PARENT[prodCategory] === planCategory && isGenericMacroName(planName, planCategory))
    return true;
  return false;
}
