import { Injectable, Logger } from '@nestjs/common';
import {
  buildShoppingList,
  computeConsumption,
  optimizeCheapest,
  optimizeFewestStops,
  type DayOfWeek,
  type Meal as DomainMeal,
  type MealOverride,
  type MealType,
  type Member as DomainMember,
  type Unit,
} from '@weeklyhome/domain';
import { FamilyService } from '../family/family.service.js';
import { PlanService } from '../plan/plan.service.js';
import { PriceService, type GeoPoint } from '../price/price.service.js';

export type OptimizeMode = 'cheapest' | 'fewest';

/** Dimensione fisica di un'unità (massa/volume/conteggio). */
const DIMENSION: Record<string, 'mass' | 'volume' | 'count'> = {
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
  pz: 'count',
};
/** Priorità: massa/volume vincono sul conteggio (i piani usano grammi/ml; "pz" su
 *  spalmabili/yogurt/carne è quasi sempre un errore di estrazione). */
const DIM_PRIORITY: Record<'mass' | 'volume' | 'count', number> = {
  mass: 0,
  volume: 1,
  count: 2,
};
const dimOf = (unit: string) => DIMENSION[unit] ?? 'count';

@Injectable()
export class ShoppingService {
  private readonly logger = new Logger(ShoppingService.name);

  constructor(
    private readonly family: FamilyService,
    private readonly plan: PlanService,
    private readonly price: PriceService,
  ) {}

  /**
   * Calcola consumo condiviso, lista della spesa e ottimizzazione per il nucleo,
   * riusando @weeklyhome/domain. I prezzi arrivano dal PriceService (DB, filtrati
   * per raggio e freschezza).
   */
  async compute(userId: string, mode: OptimizeMode, radiusKm?: number, user?: GeoPoint) {
    const family = await this.family.getFamily(userId);
    const plan = await this.plan.getActive(userId);
    if (!family || !plan) {
      return {
        mode,
        radiusKm,
        list: [],
        offers: [],
        result: null,
        stores: [],
        hasPlan: false,
        pricesUpdatedAt: null,
      };
    }

    const members: DomainMember[] = family.members.map((m) => ({
      id: m.id,
      name: m.name,
      doseFactor: m.doseFactor,
    }));

    // Solo gli item dell'opzione (alternativa) selezionata contano per il
    // consumo/lista: le altre alternative restano nel piano ma non si comprano.
    const meals: DomainMeal[] = plan.meals.map((meal) => ({
      day: meal.day as DayOfWeek,
      type: meal.type as MealType,
      items: meal.items
        .filter((it) => it.optionIndex === meal.selectedOption)
        .map((it) => ({
          foodId: it.foodId,
          quantity: { value: it.value, unit: it.unit as Unit },
        })),
    }));

    const overrides: MealOverride[] = plan.overrides.map((o) => ({
      day: o.day as DayOfWeek,
      type: o.type as MealType,
      memberId: o.memberId ?? undefined,
      items: o.items.map((it) => ({
        foodId: it.foodId,
        quantity: { value: it.value, unit: it.unit as Unit },
      })),
    }));

    // Riconcilia gli alimenti usati con unità di dimensione incoerente (es.
    // "marmellata 10 g" e "marmellata 1 pz"): senza questo, computeConsumption
    // lancia e l'INTERA spesa va a zero. Qui scegliamo una dimensione per
    // alimento e scartiamo gli item delle altre, segnalandoli (unitConflicts).
    const { meals: safeMeals, overrides: safeOverrides, unitConflicts } =
      this.reconcileDimensions(meals, overrides);
    if (unitConflicts.length > 0) {
      this.logger.warn(
        `Spesa: ${unitConflicts.length} alimenti con unità incoerenti, riconciliati: ${unitConflicts.join(', ')}`,
      );
    }

    const consumption = computeConsumption({ id: plan.id, meals: safeMeals }, members, safeOverrides);
    // Nome leggibile per alimento (dal piano): la lista del dominio porta solo il
    // foodId, ma per gli alimenti fuori catalogo (id `x-…`) il foodId non è
    // presentabile. Recuperiamo il nome originale estratto dal PDF.
    const nameByFood = new Map<string, string>();
    const categoryByFood = new Map<string, string | null>();
    for (const meal of plan.meals)
      for (const it of meal.items) {
        if (it.name) nameByFood.set(it.foodId, it.name);
        categoryByFood.set(it.foodId, it.category ?? null);
      }
    for (const o of plan.overrides)
      for (const it of o.items) {
        if (it.name) nameByFood.set(it.foodId, it.name);
        categoryByFood.set(it.foodId, it.category ?? null);
      }
    const list = buildShoppingList(consumption).map((r) => ({
      ...r,
      name: nameByFood.get(r.foodId) ?? null,
      category: categoryByFood.get(r.foodId) ?? null,
    }));
    const offers = await this.price.buildOffers(list, radiusKm, user);
    const stores = await this.price.getStores(radiusKm, user);
    const foodIds = list.map((r) => r.foodId);
    const result =
      mode === 'fewest'
        ? optimizeFewestStops(foodIds, offers, 2)
        : optimizeCheapest(foodIds, offers);

    const pricesUpdatedAt =
      offers.reduce((max, o) => (o.fetchedAt > max ? o.fetchedAt : max), '') || null;

    return {
      mode,
      radiusKm,
      list,
      offers,
      result,
      stores,
      hasPlan: true,
      pricesUpdatedAt,
      unitConflicts,
    };
  }

  /**
   * Garantisce che ogni alimento sia misurato in UNA sola dimensione fisica
   * prima dell'aggregazione del dominio (che altrimenti lancerebbe). Per gli
   * alimenti con dimensioni miste sceglie quella a priorità più alta
   * (massa > volume > conteggio) e scarta gli item delle altre. Restituisce
   * i foodId riconciliati così la UI può segnalarli per la revisione.
   */
  private reconcileDimensions(meals: DomainMeal[], overrides: MealOverride[]) {
    const dimsByFood = new Map<string, Set<'mass' | 'volume' | 'count'>>();
    const note = (foodId: string, unit: string) => {
      const set = dimsByFood.get(foodId) ?? new Set();
      set.add(dimOf(unit));
      dimsByFood.set(foodId, set);
    };
    for (const m of meals) for (const it of m.items) note(it.foodId, it.quantity.unit);
    for (const o of overrides) for (const it of o.items) note(it.foodId, it.quantity.unit);

    const keepDim = new Map<string, 'mass' | 'volume' | 'count'>();
    const unitConflicts: string[] = [];
    for (const [foodId, dims] of dimsByFood) {
      if (dims.size <= 1) continue;
      const chosen = [...dims].sort((a, b) => DIM_PRIORITY[a] - DIM_PRIORITY[b])[0]!;
      keepDim.set(foodId, chosen);
      unitConflicts.push(foodId);
    }
    if (keepDim.size === 0) return { meals, overrides, unitConflicts };

    const keep = <T extends { foodId: string; quantity: { unit: string } }>(items: T[]) =>
      items.filter((it) => {
        const k = keepDim.get(it.foodId);
        return !k || dimOf(it.quantity.unit) === k;
      });
    return {
      meals: meals.map((m) => ({ ...m, items: keep(m.items) })),
      overrides: overrides.map((o) => ({ ...o, items: keep(o.items) })),
      unitConflicts,
    };
  }
}
