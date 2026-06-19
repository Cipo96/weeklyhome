/**
 * Vocabolario CHIUSO di categorie canoniche per il match piano↔volantino.
 * Gli staple (id catalogo, in inglese) e le categorie nuove (in italiano)
 * convivono qui. Alcune categorie sono "figlie" di un macro-gruppo
 * (CATEGORY_PARENT): es. `almonds` ⊂ `frutta-secca`, così "Frutta secca" nel
 * piano aggancia anche un prodotto "Mandorle".
 */
export const CANONICAL_CATEGORIES: ReadonlySet<string> = new Set([
  // staple (= id catalogo Price, in inglese)
  'pasta', 'rice', 'chicken', 'tuna', 'eggs', 'milk', 'oats', 'banana',
  'apple', 'yogurt', 'bread', 'salad', 'oil', 'sauce', 'parmesan', 'almonds',
  // macro-gruppi e categorie nuove (in italiano)
  'marmellata', 'frutta-secca', 'frutta-fresca', 'verdure', 'pesce-bianco',
  'salmone', 'formaggio', 'pizza', 'burro-arachidi', 'cioccolato', 'biscotti',
  'fette-biscottate', 'gallette', 'granola', 'legumi', 'patate', 'prosciutto',
  'tacchino', 'mais', 'cocco', 'ketchup', 'pomodorini', 'avocado', 'hummus',
  'acqua', 'farina', 'pangrattato', 'carote',
]);

/** Categoria → macro-gruppo padre (per il match macro↔staple). */
export const CATEGORY_PARENT: Readonly<Record<string, string>> = {
  almonds: 'frutta-secca',
  apple: 'frutta-fresca',
  banana: 'frutta-fresca',
  pomodorini: 'verdure',
  carote: 'verdure',
  patate: 'verdure',
  parmesan: 'formaggio',
};

export function isCanonicalCategory(s: string): boolean {
  return CANONICAL_CATEGORIES.has(s);
}

/** True se due categorie sono uguali o in relazione macro-gruppo↔figlio. */
export function categoriesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return CATEGORY_PARENT[a] === b || CATEGORY_PARENT[b] === a;
}

/**
 * Termini generici che identificano un macro-gruppo in un nome di alimento.
 * Servono a distinguere una riga di piano DAVVERO generica ("Frutta secca",
 * "Verdure miste") da un alimento specifico finito nel macro per mancanza di
 * categoria propria ("Zucchine" → `verdure`): solo la prima deve agganciare
 * tutti i figli del gruppo.
 */
const MACRO_GENERIC_NAME: Readonly<Record<string, RegExp>> = {
  'frutta-secca': /frutta\s+secca/i,
  'frutta-fresca': /\bfrutta\b(?!\s+secca)/i,
  verdure: /\bverdur/i,
  formaggio: /\bformagg/i,
};

/** True se `name` denota genericamente il macro-gruppo `macro` (non un suo figlio). */
export function isGenericMacroName(name: string | null, macro: string): boolean {
  if (!name) return false;
  const re = MACRO_GENERIC_NAME[macro];
  return re ? re.test(name) : false;
}

/** Chiave di raggruppamento offerta: la categoria se presente, altrimenti il foodId. */
export function effectiveKey(foodId: string, category: string | null): string {
  return category ?? foodId;
}
