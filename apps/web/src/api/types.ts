import type { DayOfWeek, MealType, Quantity, Unit } from '@weeklyhome/domain';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  familyId: string | null;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface ApiMember {
  id: string;
  name: string;
  doseFactor: number;
}

export interface ApiFamily {
  id: string;
  name: string;
  inviteCode: string;
  members: ApiMember[];
}

export interface ApiPlanItem {
  id: string;
  foodId: string;
  name: string | null;
  value: number;
  unit: Unit;
  /** Alternativa di pasto a cui appartiene (0 = predefinita). */
  optionIndex: number;
  /** Etichetta dell'alternativa (es. "Tortino yogurt"). */
  optionLabel: string | null;
}

export interface ApiMeal {
  id: string;
  day: DayOfWeek;
  type: MealType;
  /** Indice dell'alternativa pianificata. */
  selectedOption: number;
  items: ApiPlanItem[];
}

export interface ApiOverrideItem {
  id: string;
  foodId: string;
  name: string | null;
  value: number;
  unit: Unit;
}

export interface ApiMealOverride {
  id: string;
  day: DayOfWeek;
  type: MealType;
  memberId: string | null;
  items: ApiOverrideItem[];
}

export interface ApiPlan {
  id: string;
  status: string;
  /** Inizio validità (ISO) — impostato alla conferma. */
  validFrom: string | null;
  /** Fine validità (ISO) — impostata quando un nuovo piano lo sostituisce. */
  validTo: string | null;
  meals: ApiMeal[];
  overrides: ApiMealOverride[];
}

/** Item inviato per impostare una correzione di pasto. Se `foodId` manca, il
 * server lo deriva dal `name` (item inseriti a mano nella sostituzione). */
export interface OverrideItemInput {
  foodId?: string;
  name?: string;
  value: number;
  unit: Unit;
}

export interface ApiStore {
  id: string;
  name: string;
  brandColor: string;
  distanceKm: number;
}

export interface ApiShoppingRow {
  foodId: string;
  /** Nome leggibile dell'alimento (dal piano), per gli id fuori catalogo `x-…`. */
  name?: string | null;
  quantity: Quantity;
}

export interface ApiAssignment {
  foodId: string;
  storeId: string;
  price: number;
}

export interface ApiOptimization {
  assignments: ApiAssignment[];
  total: number;
  storeCount: number;
  unavailable: string[];
}

export type OfferKind = 'offerta' | 'listino' | 'stima';

/** Un prodotto reale (marca) in offerta per un alimento in un negozio. */
export interface ApiOfferProduct {
  name: string;
  brand: string | null;
  price: number;
  unitPrice: number;
}

export interface ApiPriceOffer {
  foodId: string;
  storeId: string;
  /** Costo totale per la quantità necessaria, in €. */
  price: number;
  /** Prezzo unitario (€/kg · €/l · €/pz). */
  unitPrice: number;
  source: string;
  kind: OfferKind;
  fetchedAt: string;
  /** Marche in offerta per questo alimento in questo negozio (volantini). */
  products?: ApiOfferProduct[];
}

/** Risultato della ricerca prodotti nei volantini. */
export interface ApiProductSearchResult {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  quantityValue: number;
  quantityUnit: string;
  unitPrice: number;
  storeId: string;
  storeName: string;
  brandColor: string;
  validTo: string | null;
}

export interface ApiVariantItem {
  foodId: string;
  name: string;
  value: number;
  unit: Unit;
}

export interface ApiMealVariant {
  label: string;
  note: string;
  items: ApiVariantItem[];
}

export type OptimizeMode = 'cheapest' | 'fewest';

export interface ApiShopping {
  mode: OptimizeMode;
  radiusKm?: number;
  list: ApiShoppingRow[];
  offers: ApiPriceOffer[];
  result: ApiOptimization | null;
  stores: ApiStore[];
  hasPlan: boolean;
  pricesUpdatedAt: string | null;
  /** Alimenti (foodId) usati con unità incoerenti nel piano e riconciliati per
   *  poter calcolare la spesa: vanno corretti nella revisione del piano. */
  unitConflicts?: string[];
}
