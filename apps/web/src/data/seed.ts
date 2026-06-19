import type { DayOfWeek, Food, Member, PlanItem, WeeklyPlan } from '@weeklyhome/domain';

/** Alimento con metadati per la UI (emoji) e stima calorica.
 * `kcal` = kcal di riferimento per 100 g / 100 ml (alimenti a massa/volume)
 * oppure per 1 pezzo (unità a conteggio, es. uova). Valori medi approssimativi. */
export interface FoodMeta extends Food {
  emoji: string;
  kcal?: number;
}

/** Punto vendita nel raggio dell'utente. */
export interface Store {
  id: string;
  name: string;
  brandColor: string;
  distanceKm: number;
}

/**
 * Prezzo di riferimento per unità di prezzo:
 * €/kg per gli alimenti a massa, €/l per i volumi, €/pz per i conteggi.
 * Una voce mancante = quell'alimento non è in offerta in quel negozio.
 */
export type PriceTable = Record<string, Record<string, number>>;

export const FOODS: Record<string, FoodMeta> = {
  oats: { id: 'oats', name: 'Fiocchi d’avena', unit: 'g', category: 'Cereali', emoji: '🌾', kcal: 380 },
  milk: { id: 'milk', name: 'Latte', unit: 'ml', category: 'Latticini', emoji: '🥛', kcal: 47 },
  eggs: { id: 'eggs', name: 'Uova', unit: 'pz', category: 'Proteici', emoji: '🥚', kcal: 72 },
  chicken: { id: 'chicken', name: 'Petto di pollo', unit: 'g', category: 'Carne', emoji: '🍗', kcal: 110 },
  pasta: { id: 'pasta', name: 'Pasta', unit: 'g', category: 'Cereali', emoji: '🍝', kcal: 350 },
  rice: { id: 'rice', name: 'Riso', unit: 'g', category: 'Cereali', emoji: '🍚', kcal: 350 },
  sauce: { id: 'sauce', name: 'Passata di pomodoro', unit: 'g', category: 'Dispensa', emoji: '🍅', kcal: 30 },
  oil: { id: 'oil', name: 'Olio EVO', unit: 'ml', category: 'Dispensa', emoji: '🫒', kcal: 884 },
  apple: { id: 'apple', name: 'Mele', unit: 'g', category: 'Frutta', emoji: '🍎', kcal: 52 },
  banana: { id: 'banana', name: 'Banane', unit: 'g', category: 'Frutta', emoji: '🍌', kcal: 89 },
  yogurt: { id: 'yogurt', name: 'Yogurt greco', unit: 'g', category: 'Latticini', emoji: '🥣', kcal: 60 },
  tuna: { id: 'tuna', name: 'Tonno', unit: 'g', category: 'Proteici', emoji: '🐟', kcal: 116 },
  bread: { id: 'bread', name: 'Pane integrale', unit: 'g', category: 'Panetteria', emoji: '🍞', kcal: 250 },
  salad: { id: 'salad', name: 'Insalata', unit: 'g', category: 'Verdura', emoji: '🥗', kcal: 20 },
  parmesan: { id: 'parmesan', name: 'Parmigiano', unit: 'g', category: 'Latticini', emoji: '🧀', kcal: 392 },
  almonds: { id: 'almonds', name: 'Mandorle', unit: 'g', category: 'Frutta secca', emoji: '🌰', kcal: 600 },
};

export const STORES: Store[] = [
  { id: 'conad', name: 'Conad', brandColor: '#e2231a', distanceKm: 0.8 },
  { id: 'lidl', name: 'Lidl', brandColor: '#0050aa', distanceKm: 1.4 },
  { id: 'eurospin', name: 'Eurospin', brandColor: '#ff8a00', distanceKm: 2.1 },
  { id: 'todis', name: 'Todis', brandColor: '#e10098', distanceKm: 2.6 },
  { id: 'tigre', name: 'Tigre', brandColor: '#f5a800', distanceKm: 3.2 },
  { id: 'oasi', name: 'Oasi', brandColor: '#009640', distanceKm: 3.9 },
];

/** Prezzi (€) per kg / l / pz a seconda dell'unità dell'alimento. */
export const PRICES: PriceTable = {
  oats: { conad: 3.2, lidl: 2.4, eurospin: 2.6, oasi: 3.0 },
  milk: { conad: 1.4, lidl: 1.1, eurospin: 1.0, todis: 1.2, tigre: 1.3 },
  eggs: { conad: 0.32, lidl: 0.26, eurospin: 0.24, todis: 0.28, oasi: 0.3 },
  chicken: { conad: 9.5, lidl: 7.9, tigre: 8.4, oasi: 8.9 },
  pasta: { conad: 1.6, lidl: 1.1, eurospin: 1.2, todis: 1.3, tigre: 1.4, oasi: 1.5 },
  rice: { conad: 2.8, lidl: 2.1, eurospin: 2.3, todis: 2.5 },
  sauce: { conad: 1.9, lidl: 1.3, eurospin: 1.4, todis: 1.5, oasi: 1.8 },
  oil: { conad: 8.9, lidl: 6.9, tigre: 7.8, oasi: 8.2 },
  apple: { conad: 2.3, lidl: 1.8, eurospin: 1.9, tigre: 2.1, oasi: 2.2 },
  banana: { conad: 1.9, lidl: 1.4, eurospin: 1.5, todis: 1.6 },
  yogurt: { conad: 6.5, lidl: 4.9, eurospin: 5.2, todis: 5.6 },
  tuna: { conad: 14.0, lidl: 10.5, tigre: 12.0, oasi: 12.8 },
  bread: { conad: 3.4, lidl: 2.6, todis: 2.9, tigre: 3.1 },
  salad: { conad: 6.0, lidl: 4.5, eurospin: 4.8, oasi: 5.4 },
  parmesan: { conad: 19.0, lidl: 14.5, tigre: 16.0, oasi: 17.2 },
  almonds: { conad: 16.0, lidl: 12.0, eurospin: 13.0 },
};

export const MEMBERS_SEED: Member[] = [
  { id: 'andrea', name: 'Andrea', doseFactor: 1 },
  { id: 'alessia', name: 'Alessia', doseFactor: 1.2 },
];

const g = (foodId: string, value: number): PlanItem => ({ foodId, quantity: { value, unit: 'g' } });
const ml = (foodId: string, value: number): PlanItem => ({ foodId, quantity: { value, unit: 'ml' } });
const pz = (foodId: string, value: number): PlanItem => ({ foodId, quantity: { value, unit: 'pz' } });

/** Carboidrato e proteina ruotano per dare varietà alla settimana. */
const CARBS = ['pasta', 'rice', 'pasta', 'rice', 'pasta', 'rice', 'pasta'] as const;
const PROTEINS = ['chicken', 'tuna', 'chicken', 'eggs', 'chicken', 'tuna', 'chicken'] as const;

/** Costruisce un piano settimanale di esempio realistico (7 giorni × 4 pasti). */
export function buildSamplePlan(): WeeklyPlan {
  const meals = [];
  for (let d = 0 as DayOfWeek; d <= 6; d = (d + 1) as DayOfWeek) {
    meals.push({
      day: d,
      type: 'BREAKFAST' as const,
      items: [g('oats', 70), ml('milk', 200), g('banana', 120)],
    });
    const protein = PROTEINS[d]!;
    meals.push({
      day: d,
      type: 'LUNCH' as const,
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
      type: 'SNACK' as const,
      items: d % 2 === 0 ? [g('yogurt', 150), g('almonds', 20)] : [g('apple', 150)],
    });
    meals.push({
      day: d,
      type: 'DINNER' as const,
      items: [g('chicken', 120), g('salad', 100), g('bread', 60), ml('oil', 10)],
    });
  }
  return { id: 'sample-week', meals };
}
