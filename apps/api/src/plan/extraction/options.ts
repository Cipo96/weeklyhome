import { canonicalFoodId } from './food-catalog.js';
import type { ExtractedItem, ExtractedMeal } from './pdf-extractor.js';

/** Item grezzo restituito dall'AI (prima del mapping al catalogo). */
export interface RawItem {
  name: string;
  value: number;
  unit: string;
}

/** Un'alternativa di pasto (es. "Tortino yogurt") con i suoi item. */
export interface RawOption {
  label?: string;
  items?: RawItem[];
}

/**
 * Pasto grezzo dall'AI. Forma a opzioni (`options`) oppure legacy (`items`,
 * unica alternativa) per retro-compatibilità con risposte senza alternative.
 */
export interface RawMeal {
  day: number;
  type: string;
  options?: RawOption[];
  items?: RawItem[];
}

/**
 * Normalizza i pasti grezzi dell'AI nella forma con opzioni: ogni alternativa
 * diventa un gruppo di item con lo stesso `optionIndex` (0 = predefinita) e una
 * `optionLabel` condivisa. Le opzioni vuote vengono scartate PRIMA di assegnare
 * gli indici, così l'opzione 0 ha sempre almeno un alimento (è quella che, di
 * default, finisce nella spesa). I pasti senza alcun item vengono omessi.
 */
export function mealsFromRaw(raw: RawMeal[]): ExtractedMeal[] {
  const meals: ExtractedMeal[] = [];
  for (const m of raw) {
    const rawOptions: RawOption[] =
      m.options && m.options.length > 0 ? m.options : [{ items: m.items ?? [] }];

    // tieni solo le opzioni con almeno un item valido
    const options = rawOptions
      .map((o) => ({ label: o.label?.trim() || undefined, items: cleanItems(o.items) }))
      .filter((o) => o.items.length > 0);
    if (options.length === 0) continue;

    const items: ExtractedItem[] = [];
    options.forEach((opt, idx) => {
      for (const it of opt.items) {
        items.push({
          foodId: canonicalFoodId(it.name),
          name: it.name,
          value: it.value,
          unit: it.unit,
          optionIndex: idx,
          optionLabel: opt.label,
        });
      }
    });
    meals.push({ day: m.day, type: m.type, items });
  }
  return meals;
}

/** Scarta item senza nome o con quantità non positiva (l'AI a volte sbaglia). */
function cleanItems(items: RawItem[] | undefined): RawItem[] {
  return (items ?? []).filter(
    (it) => typeof it?.name === 'string' && it.name.trim().length > 0 && it.value > 0 && !!it.unit,
  );
}
