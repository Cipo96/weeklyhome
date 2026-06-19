/**
 * Tipi di dominio condivisi per WeeklyHome.
 * Modellano il piano nutrizionale, i membri del nucleo, le dosi,
 * il consumo condiviso, la lista della spesa e le offerte di prezzo.
 */

/** Unità di misura supportate. `pz` = pezzi (conteggio). */
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pz';

/**
 * Tipo di pasto della giornata. Spuntino (metà mattina) e merenda (pomeriggio)
 * sono occasioni DISTINTE: collassarle in un unico SNACK fa collidere le due
 * occorrenze (consumo e UI ne perdono una). `SNACK` resta solo per retro-compatibilità
 * con i piani importati prima della distinzione.
 */
export type MealType =
  | 'BREAKFAST'
  | 'MORNING_SNACK'
  | 'LUNCH'
  | 'AFTERNOON_SNACK'
  | 'DINNER'
  | 'SNACK';

/** Giorno della settimana, 0 = lunedì ... 6 = domenica. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Alimento canonico del catalogo. */
export interface Food {
  id: string;
  name: string;
  /** Unità di riferimento dell'alimento. */
  unit: Unit;
  category?: string;
}

/** Una quantità con la sua unità. */
export interface Quantity {
  value: number;
  unit: Unit;
}

/** Una voce di un pasto del piano: un alimento con la quantità "per porzione". */
export interface PlanItem {
  foodId: string;
  quantity: Quantity;
}

/** Un pasto del piano in un giorno specifico. */
export interface Meal {
  day: DayOfWeek;
  type: MealType;
  items: PlanItem[];
}

/** Piano settimanale attivo del nucleo. */
export interface WeeklyPlan {
  id: string;
  meals: Meal[];
}

/**
 * Membro del nucleo famiglia.
 * `doseFactor` scala le porzioni "per 1" del piano (1 = porzione base).
 */
export interface Member {
  id: string;
  name: string;
  doseFactor: number;
}

/**
 * Correzione di un pasto rispetto al reale (US-008).
 * Rappresenta ciò che è stato *effettivamente* mangiato in quell'occorrenza:
 * le quantità sono ASSOLUTE (non scalate dal doseFactor).
 * - se `memberId` è valorizzato, vale solo per quel membro;
 * - se è assente, sostituisce il pasto per tutti i membri del nucleo.
 */
export interface MealOverride {
  day: DayOfWeek;
  type: MealType;
  memberId?: string;
  items: PlanItem[];
}

/** Riga di consumo aggregato per alimento. */
export interface ConsumptionLine {
  foodId: string;
  quantity: Quantity;
}

/** Riga della lista della spesa. */
export interface ShoppingListRow {
  foodId: string;
  quantity: Quantity;
}

/**
 * Offerta di prezzo per un alimento in un negozio.
 * `price` è il costo TOTALE per acquistare la quantità necessaria di quell'alimento
 * in quel negozio (il calcolo prezzo×quantità è a monte dell'ottimizzatore).
 */
export interface PriceOffer {
  foodId: string;
  storeId: string;
  price: number;
}

/** Assegnazione di un alimento a un negozio nel risultato di ottimizzazione. */
export interface Assignment {
  foodId: string;
  storeId: string;
  price: number;
}

/** Risultato di una strategia di ottimizzazione della spesa. */
export interface OptimizationResult {
  assignments: Assignment[];
  /** Costo totale degli alimenti acquistabili. */
  total: number;
  /** Numero di negozi distinti da visitare. */
  storeCount: number;
  /** Alimenti senza alcuna offerta disponibile. */
  unavailable: string[];
}
