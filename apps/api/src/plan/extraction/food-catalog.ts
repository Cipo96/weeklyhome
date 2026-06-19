/**
 * Mappa nomi di alimenti (IT) verso gli id canonici del catalogo, così che gli
 * alimenti estratti dal PDF si aggancino al listino prezzi quando possibile.
 * Gli alimenti non riconosciuti ottengono un id derivato dal nome (slug).
 */
const NAME_TO_ID: Record<string, string> = {
  pasta: 'pasta',
  riso: 'rice',
  pollo: 'chicken',
  'petto di pollo': 'chicken',
  tonno: 'tuna',
  uova: 'eggs',
  uovo: 'eggs',
  latte: 'milk',
  avena: 'oats',
  "fiocchi d'avena": 'oats',
  'fiocchi davena': 'oats',
  banana: 'banana',
  banane: 'banana',
  mela: 'apple',
  mele: 'apple',
  yogurt: 'yogurt',
  'yogurt greco': 'yogurt',
  pane: 'bread',
  'pane integrale': 'bread',
  insalata: 'salad',
  // 'oil' nel piano = olio d'oliva/EVO (condimento). L'olio di semi è un alimento
  // diverso e più economico: va tenuto separato per non falsare il "più conveniente".
  olio: 'oil',
  'olio evo': 'oil',
  'olio extra vergine': 'oil',
  'olio extravergine': 'oil',
  "olio d'oliva": 'oil',
  'olio di oliva': 'oil',
  'olio di semi': 'x-olio-semi',
  'olio di girasole': 'x-olio-semi',
  passata: 'sauce',
  'passata di pomodoro': 'sauce',
  pomodoro: 'sauce',
  pomodori: 'sauce',
  parmigiano: 'parmesan',
  grana: 'parmesan',
  mandorle: 'almonds',
};

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Alias ordinati per lunghezza decrescente: il match più specifico vince
 * (es. "olio di semi" prima di "olio", "yogurt greco" prima di "yogurt"). */
const ALIASES_BY_LENGTH = Object.keys(NAME_TO_ID).sort((a, b) => b.length - a.length);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Alias → categoria canonica per la normalizzazione semantica (dict-first).
 * Estende NAME_TO_ID con: piatto→ingrediente, sinonimi, macro-gruppi.
 * Le categorie devono appartenere alla tassonomia (taxonomy.ts).
 */
const NAME_TO_CATEGORY: Record<string, string> = {
  ...NAME_TO_ID,
  // piatto → ingrediente
  frittata: 'eggs',
  'uova strapazzate': 'eggs',
  omelette: 'eggs',
  cappuccino: 'milk',
  // sinonimi di categoria
  confettura: 'marmellata',
  marmellata: 'marmellata',
  // macro-gruppo frutta secca (mandorle resta staple 'almonds')
  noci: 'frutta-secca',
  nocciole: 'frutta-secca',
  anacardi: 'frutta-secca',
  pistacchi: 'frutta-secca',
  'frutta secca': 'frutta-secca',
  // altre categorie ricorrenti nel piano
  'frutta fresca': 'frutta-fresca',
  verdure: 'verdure',
  verdura: 'verdure',
  'pesce bianco': 'pesce-bianco',
  merluzzo: 'pesce-bianco',
  platessa: 'pesce-bianco',
  nasello: 'pesce-bianco',
  salmone: 'salmone',
  formaggio: 'formaggio',
  mozzarella: 'formaggio',
  philadelphia: 'formaggio',
  pizza: 'pizza',
  'burro di arachidi': 'burro-arachidi',
  cioccolato: 'cioccolato',
  biscotti: 'biscotti',
  biscottini: 'biscotti',
  'fette biscottate': 'fette-biscottate',
  gallette: 'gallette',
  granola: 'granola',
  legumi: 'legumi',
  ceci: 'legumi',
  fagioli: 'legumi',
  patate: 'patate',
  'prosciutto cotto': 'prosciutto',
  'fesa di tacchino': 'tacchino',
  mais: 'mais',
  cocco: 'cocco',
  ketchup: 'ketchup',
  pomodorini: 'pomodorini',
  avocado: 'avocado',
  hummus: 'hummus',
  acqua: 'acqua',
  farina: 'farina',
  pangrattato: 'pangrattato',
  carote: 'verdure',
};

const CATEGORY_ALIASES_BY_LENGTH = Object.keys(NAME_TO_CATEGORY).sort(
  (a, b) => b.length - a.length,
);

/**
 * Risolve un nome verso una CATEGORIA canonica via dizionario statico
 * (dict-first), o null se sconosciuto. Match a confine di parola, alias più
 * lungo prima (es. "burro di arachidi" prima di "arachidi").
 */
export function categorizeStatic(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (NAME_TO_CATEGORY[key]) return NAME_TO_CATEGORY[key]!;
  for (const known of CATEGORY_ALIASES_BY_LENGTH) {
    if (new RegExp(`\\b${escapeRe(known)}\\b`).test(key)) return NAME_TO_CATEGORY[known]!;
  }
  return null;
}

/** Risolve un nome alimento verso l'id canonico (o uno slug se sconosciuto).
 * Il match dell'alias è a CONFINE DI PAROLA: "mela" NON aggancia "melanzane",
 * "grana" non aggancia "granarolo" — evita falsi positivi (eggplant→mela, latte→grana). */
export function canonicalFoodId(name: string): string {
  const key = name.trim().toLowerCase();
  if (NAME_TO_ID[key]) return NAME_TO_ID[key]!;
  for (const known of ALIASES_BY_LENGTH) {
    if (new RegExp(`\\b${escapeRe(known)}\\b`).test(key)) return NAME_TO_ID[known]!;
  }
  return `x-${slug(name)}`;
}

/**
 * Termini che indicano un PIATTO/DERIVATO, non l'ingrediente base: un volantino
 * pieno di nomi commerciali manda fuori strada il match a substring ("Arancini
 * di riso" → riso, "Pomodori essiccati" → passata, "Tonno all'olio" → olio).
 * Per i prezzi da scraper questi non devono agganciarsi allo staple.
 */
const DERIVATIVE =
  /arancin|risott|polpett|burger|hamburger|spiedin|kebab|w[ü u]rstel|salsicc|snack|panat|crocchett|crocchet|nugget|gelat|biscott|merend|crema|cremoso|dolce|dessert|essiccat|all'?\s?olio|sott'?\s?olio|\bsugo\b|al\s+sugo|pront|condit|zuppa|brod|fritt|impanat|ripien|bevand|succo|smoothie|sfogliat|focacc|grissin|cracker|tortellin|raviol|gnocch|cantuccin|barrett|taralli|cous\s?cous|salmone|bocconcin|\bpizza\b|grana\s+(media|fine|grossa)|solare|\bspf\b|detergent|shampoo|bagnoschiuma|\bsapone|dentifric|deodorant|al\s+forno|gratinat|in\s+umido|\be\s+(broccoli|verdur|legum|pisell|spinaci|zucchin|funghi|melanzan|patate|ceci|fagiol|riso|pasta|tonno|salmone)/i;

/**
 * Variante per i listini/volantini scrapati: come {@link canonicalFoodId} ma
 * scarta i nomi che sono palesemente piatti/derivati, per non falsare il prezzo
 * dello staple. L'import PDF continua a usare il match morbido.
 */
export function catalogFoodId(name: string): string {
  const id = canonicalFoodId(name);
  if (id.startsWith('x-')) return id;
  if (DERIVATIVE.test(name.toLowerCase())) return `x-${slug(name)}`;
  return id;
}
