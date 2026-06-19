export interface SampleItem {
  foodId: string;
  value: number;
  unit: string;
  /** Indice dell'alternativa di pasto (0 = predefinita). */
  optionIndex?: number;
  /** Etichetta dell'alternativa, mostrata nella UI di revisione. */
  optionLabel?: string;
}
export interface SampleMeal {
  day: number;
  type: string;
  /** Opzione predefinita pianificata (indice). */
  selectedOption?: number;
  items: SampleItem[];
}

const CARBS = ['pasta', 'rice', 'pasta', 'rice', 'pasta', 'rice', 'pasta'];
const PROTEINS = ['chicken', 'tuna', 'chicken', 'eggs', 'chicken', 'tuna', 'chicken'];

const g = (foodId: string, value: number): SampleItem => ({ foodId, value, unit: 'g' });
const ml = (foodId: string, value: number): SampleItem => ({ foodId, value, unit: 'ml' });
const pz = (foodId: string, value: number): SampleItem => ({ foodId, value, unit: 'pz' });

/** Tagga un insieme di item come una specifica alternativa (opzione) di pasto. */
function option(index: number, label: string, items: SampleItem[]): SampleItem[] {
  return items.map((it) => ({ ...it, optionIndex: index, optionLabel: label }));
}

/**
 * Piano settimanale di esempio (mock dell'estrazione AI del PDF).
 * 7 giorni × 5 pasti (colazione, spuntino, pranzo, merenda, cena), con
 * carboidrato/proteina che ruotano. Colazione e merenda propongono ALTERNATIVE
 * (opzioni) come nei piani reali del nutrizionista: la prima è quella pianificata
 * di default, modificabile in revisione.
 */
export function buildSampleMeals(): SampleMeal[] {
  const meals: SampleMeal[] = [];
  for (let d = 0; d <= 6; d++) {
    meals.push({
      day: d,
      type: 'BREAKFAST',
      selectedOption: 0,
      items: [
        ...option(0, 'Porridge', [g('oats', 70), ml('milk', 200), g('banana', 120)]),
        ...option(1, 'Yogurt e pane', [g('yogurt', 150), g('bread', 50), g('almonds', 10)]),
      ],
    });
    meals.push({
      day: d,
      type: 'MORNING_SNACK',
      items: [g('almonds', 15), g('apple', 150)],
    });
    const protein = PROTEINS[d]!;
    meals.push({
      day: d,
      type: 'LUNCH',
      items: [
        g(CARBS[d]!, 90),
        protein === 'eggs' ? pz('eggs', 2) : g(protein, 130),
        g('sauce', 80),
        ml('oil', 10),
        g('parmesan', 10),
      ],
    });
    meals.push({
      day: d,
      type: 'AFTERNOON_SNACK',
      selectedOption: 0,
      items: [
        ...option(0, 'Yogurt e frutta secca', [g('yogurt', 150), g('almonds', 20)]),
        ...option(1, 'Frutta fresca', [g('apple', 150)]),
      ],
    });
    meals.push({
      day: d,
      type: 'DINNER',
      items: [g('chicken', 120), g('salad', 100), g('bread', 60), ml('oil', 10)],
    });
  }
  return meals;
}
