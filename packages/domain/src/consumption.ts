import type {
  ConsumptionLine,
  DayOfWeek,
  Meal,
  MealOverride,
  MealType,
  Member,
  PlanItem,
  WeeklyPlan,
} from './types.js';
import { dimensionOf, normalizeForDisplay, toBase } from './units.js';

type OccurrenceKey = `${DayOfWeek}:${MealType}`;

function key(day: DayOfWeek, type: MealType): OccurrenceKey {
  return `${day}:${type}`;
}

interface Acc {
  base: number;
  dimension: ReturnType<typeof dimensionOf>;
}

/**
 * Calcola il consumo settimanale CONDIVISO del nucleo (US-007).
 *
 * Regola: per ogni membro e per ogni occorrenza di pasto si considera
 * - la correzione reale (override) se presente — quantità ASSOLUTE;
 * - altrimenti il pasto del piano scalato dal `doseFactor` del membro.
 * I contributi di tutti i membri vengono sommati per alimento.
 *
 * @param plan piano settimanale attivo
 * @param members membri del nucleo con le rispettive dosi
 * @param overrides correzioni temporanee/permanenti dei pasti (default: nessuna)
 */
export function computeConsumption(
  plan: WeeklyPlan,
  members: Member[],
  overrides: MealOverride[] = [],
): ConsumptionLine[] {
  const acc = new Map<string, Acc>();

  const mealByKey = new Map<OccurrenceKey, Meal>();
  for (const meal of plan.meals) {
    mealByKey.set(key(meal.day, meal.type), meal);
  }

  // Insieme di tutte le occorrenze rilevanti: pasti del piano + occorrenze
  // introdotte da override (es. un pasto aggiunto che non era nel piano).
  const occurrences = new Set<OccurrenceKey>(mealByKey.keys());
  for (const ov of overrides) {
    occurrences.add(key(ov.day, ov.type));
  }

  const addItems = (items: PlanItem[], factor: number): void => {
    for (const item of items) {
      const dimension = dimensionOf(item.quantity.unit);
      const current = acc.get(item.foodId);
      if (current && current.dimension !== dimension) {
        throw new Error(
          `Alimento ${item.foodId} usato con dimensioni incoerenti ` +
            `(${current.dimension} vs ${dimension})`,
        );
      }
      const base = toBase(item.quantity) * factor;
      if (current) {
        current.base += base;
      } else {
        acc.set(item.foodId, { base, dimension });
      }
    }
  };

  for (const member of members) {
    for (const occ of occurrences) {
      const [dayStr, type] = occ.split(':') as [string, MealType];
      const day = Number(dayStr) as DayOfWeek;
      const override =
        findOverride(overrides, day, type, member.id) ??
        findOverride(overrides, day, type, undefined);

      if (override) {
        addItems(override.items, 1); // quantità reali, non scalate
        continue;
      }
      const meal = mealByKey.get(occ);
      if (meal) {
        addItems(meal.items, member.doseFactor);
      }
    }
  }

  return [...acc.entries()]
    .map(([foodId, { base, dimension }]) => ({
      foodId,
      quantity: normalizeForDisplay(base, dimension),
    }))
    .filter((line) => line.quantity.value > 0)
    .sort((a, b) => a.foodId.localeCompare(b.foodId));
}

/**
 * Trova l'override applicabile a un membro per un'occorrenza.
 * Con `memberId` undefined cerca l'override globale (valido per tutti).
 */
function findOverride(
  overrides: MealOverride[],
  day: DayOfWeek,
  type: MealType,
  memberId: string | undefined,
): MealOverride | undefined {
  return overrides.find(
    (o) => o.day === day && o.type === type && o.memberId === memberId,
  );
}
