# Matching semantico per categorie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agganciare gli item del piano (categorie/piatti come "Frittata", "Marmellata", "Frutta secca") ai prodotti dei volantini tramite una normalizzazione semantica per categorie, calcolata all'ingestione e messa in cache.

**Architecture:** Tassonomia canonica fissa + dizionario statico in codice (dict-first) + cache DB appresa dall'AI (`NameCategory`). L'AI gira solo all'ingestione, in batch, sui soli nomi nuovi. Il matching a runtime (`buildOffers`) confronta una "chiave effettiva" per categoria (con relazione macro-gruppo→staple), deterministico e gratuito.

**Tech Stack:** NestJS 11, Prisma 6 (Postgres/Neon), `@google/genai` (Gemini), `node:test` per i test, TypeScript ESM (import con estensione `.js`).

## Global Constraints

- Runtime ESM: gli import relativi usano l'estensione **`.js`** anche da file `.ts`.
- Test: **`node:test` + `node:assert/strict`**, file `*.test.ts` accanto al sorgente che importano il sibling `.js`; si eseguono con `npm --workspace @weeklyhome/api run test` (`tsc -p tsconfig.json && node --test dist`).
- Quota AI: l'AI di categorizzazione gira **solo all'ingestione**, **mai** a runtime sulla lista spesa; per N nomi-miss fa **una sola** chiamata batch; **zero** chiamate se tutto è coperto da dizionario/cache.
- Slug categorie: **staple in inglese** (id catalogo esistenti, non rinominare), **nuove categorie in italiano**.
- Nessuna regressione: per gli staple `category == foodId`, quindi la chiave effettiva non cambia.
- Il repo **non è inizializzato con git**: gli step "Commit" sono opzionali. Se si vuole il versioning, eseguire prima `git init` nella root del progetto; altrimenti saltare gli step di commit.
- AI assente / quota esaurita: i nomi-miss restano `category = null` (fallback `x-slug`), nessun crash; verranno ritentati al prossimo refresh/backfill.

---

### Task 1: Tassonomia + dizionario statico (puro, no DB/AI)

**Files:**
- Create: `apps/api/src/category/taxonomy.ts`
- Modify: `apps/api/src/plan/extraction/food-catalog.ts`
- Test: `apps/api/src/plan/extraction/food-catalog.test.ts`

**Interfaces:**
- Produces:
  - `taxonomy.ts`: `CANONICAL_CATEGORIES: ReadonlySet<string>`, `CATEGORY_PARENT: Readonly<Record<string,string>>`, `isCanonicalCategory(s: string): boolean`, `categoriesMatch(a: string|null, b: string|null): boolean`, `effectiveKey(foodId: string, category: string|null): string`.
  - `food-catalog.ts`: `categorizeStatic(name: string): string | null` (oltre agli esistenti `canonicalFoodId`, `catalogFoodId`, `slug`).

- [ ] **Step 1: Scrivi il test che fallisce** — `apps/api/src/plan/extraction/food-catalog.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeStatic } from './food-catalog.js';
import { categoriesMatch, effectiveKey } from '../../category/taxonomy.js';

test('piatto → ingrediente: frittata e uova strapazzate → eggs', () => {
  assert.equal(categorizeStatic('Frittata'), 'eggs');
  assert.equal(categorizeStatic('Uova strapazzate'), 'eggs');
  assert.equal(categorizeStatic('Cappuccino'), 'milk');
});

test('sinonimi di categoria: confettura → marmellata', () => {
  assert.equal(categorizeStatic('Confettura di albicocche'), 'marmellata');
  assert.equal(categorizeStatic('Marmellata pesca'), 'marmellata');
});

test('macro-gruppo: noci/nocciole → frutta-secca, mandorle → almonds (staple)', () => {
  assert.equal(categorizeStatic('Noci sgusciate'), 'frutta-secca');
  assert.equal(categorizeStatic('Nocciole'), 'frutta-secca');
  assert.equal(categorizeStatic('Mandorle'), 'almonds');
});

test('staple esistenti invariati', () => {
  assert.equal(categorizeStatic('Petto di pollo'), 'chicken');
  assert.equal(categorizeStatic('Passata di pomodoro'), 'sauce');
  assert.equal(categorizeStatic('Latte parzialmente scremato senza lattosio'), 'milk');
});

test('nome sconosciuto → null', () => {
  assert.equal(categorizeStatic('Polvere di stelle'), null);
});

test('macro-gruppo aggancia lo staple figlio via parent', () => {
  // "Frutta secca" (piano) deve agganciare "Mandorle" (prodotto, almonds)
  assert.equal(categoriesMatch('frutta-secca', 'almonds'), true);
  assert.equal(categoriesMatch('almonds', 'frutta-secca'), true);
  assert.equal(categoriesMatch('marmellata', 'eggs'), false);
});

test('effectiveKey: categoria se presente, altrimenti foodId', () => {
  assert.equal(effectiveKey('x-marmellata-albicocca', 'marmellata'), 'marmellata');
  assert.equal(effectiveKey('eggs', 'eggs'), 'eggs');
  assert.equal(effectiveKey('x-cosa-strana', null), 'x-cosa-strana');
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npm --workspace @weeklyhome/api run test`
Expected: FAIL (modulo `../../category/taxonomy.js` inesistente, `categorizeStatic` non esportato).

- [ ] **Step 3: Crea `apps/api/src/category/taxonomy.ts`**

```ts
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

/** Chiave di raggruppamento offerta: la categoria se presente, altrimenti il foodId. */
export function effectiveKey(foodId: string, category: string | null): string {
  return category ?? foodId;
}
```

- [ ] **Step 4: Aggiungi `categorizeStatic` in `apps/api/src/plan/extraction/food-catalog.ts`**

In testa al file, dopo `NAME_TO_ID`, aggiungi una mappa di alias→categoria che estende gli staple con piatti→ingrediente, sinonimi e macro-gruppi (le chiavi sono confrontate a confine di parola, ordinate per lunghezza decrescente come già fa `canonicalFoodId`):

```ts
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
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS (tutti i test di `food-catalog.test.ts`).

- [ ] **Step 6 (opzionale): Commit**

```bash
git add apps/api/src/category/taxonomy.ts apps/api/src/plan/extraction/food-catalog.ts apps/api/src/plan/extraction/food-catalog.test.ts
git commit -m "feat(category): tassonomia canonica + dizionario statico categorizeStatic"
```

---

### Task 2: Logica pura di risoluzione (dict→cache→AI), iniettabile

**Files:**
- Create: `apps/api/src/category/resolve.ts`
- Test: `apps/api/src/category/resolve.test.ts`

**Interfaces:**
- Consumes: `categorizeStatic` (Task 1).
- Produces: `normalizeName(name: string): string`; `resolveCategories(names: string[], deps: ResolveDeps): Promise<Map<string, string | null>>` con
  `ResolveDeps = { staticLookup: (name: string) => string | null; cacheLookup: (norms: string[]) => Promise<Map<string, string | null>>; aiResolve: (names: string[]) => Promise<Map<string, string | null>>; persist: (entries: Array<{ nameNorm: string; category: string | null; source: 'ai' }>) => Promise<void> }`.
  La mappa di ritorno è indicizzata per **nome originale**.

- [ ] **Step 1: Scrivi il test che fallisce** — `apps/api/src/category/resolve.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCategories, normalizeName } from './resolve.js';

function deps(over = {}) {
  const aiCalls: string[][] = [];
  const persisted: any[] = [];
  return {
    aiCalls,
    persisted,
    d: {
      staticLookup: (n: string) => (n.toLowerCase() === 'frittata' ? 'eggs' : null),
      cacheLookup: async (norms: string[]) => {
        const m = new Map<string, string | null>();
        for (const x of norms) if (x === 'marmellata') m.set(x, 'marmellata');
        return m;
      },
      aiResolve: async (names: string[]) => {
        aiCalls.push(names);
        const m = new Map<string, string | null>();
        for (const n of names) m.set(n, n === 'Cosa nuova' ? 'biscotti' : null);
        return m;
      },
      persist: async (e: any[]) => { persisted.push(...e); },
      ...over,
    },
  };
}

test('dict-first: non chiama cache né AI per nomi noti al dizionario', async () => {
  const { d, aiCalls } = deps();
  const r = await resolveCategories(['Frittata'], d);
  assert.equal(r.get('Frittata'), 'eggs');
  assert.equal(aiCalls.length, 0);
});

test('cache copre i miss del dizionario, niente AI', async () => {
  const { d, aiCalls } = deps();
  const r = await resolveCategories(['Marmellata'], d);
  assert.equal(r.get('Marmellata'), 'marmellata');
  assert.equal(aiCalls.length, 0);
});

test('AI solo sui miss residui, UNA chiamata batch, e persiste', async () => {
  const { d, aiCalls, persisted } = deps();
  const r = await resolveCategories(['Frittata', 'Marmellata', 'Cosa nuova', 'Altro ignoto'], d);
  assert.equal(r.get('Cosa nuova'), 'biscotti');
  assert.equal(r.get('Altro ignoto'), null);
  assert.equal(aiCalls.length, 1); // una sola chiamata batch
  assert.deepEqual(aiCalls[0]!.sort(), ['Altro ignoto', 'Cosa nuova']);
  assert.equal(persisted.length, 2); // entrambi i risultati AI in cache (anche il null)
});

test('zero nomi-miss → zero chiamate AI', async () => {
  const { d, aiCalls } = deps();
  await resolveCategories(['Frittata', 'Marmellata'], d);
  assert.equal(aiCalls.length, 0);
});

test('normalizeName: trim, lowercase, niente accenti/spazi multipli', () => {
  assert.equal(normalizeName('  Caffè   Lungo '), 'caffe lungo');
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npm --workspace @weeklyhome/api run test`
Expected: FAIL (`./resolve.js` inesistente).

- [ ] **Step 3: Crea `apps/api/src/category/resolve.ts`**

```ts
/** Normalizza un nome per la cache: trim, lowercase, no accenti, spazi singoli. */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export interface ResolveDeps {
  staticLookup: (name: string) => string | null;
  cacheLookup: (norms: string[]) => Promise<Map<string, string | null>>;
  aiResolve: (names: string[]) => Promise<Map<string, string | null>>;
  persist: (
    entries: Array<{ nameNorm: string; category: string | null; source: 'ai' }>,
  ) => Promise<void>;
}

/**
 * Risolve i nomi in categorie con strategia dict → cache DB → AI (batch unica
 * sui soli miss), indicizzando per nome ORIGINALE. I risultati AI (anche i null)
 * vengono persistiti in cache per non ripagarli.
 */
export async function resolveCategories(
  names: string[],
  deps: ResolveDeps,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unresolved: string[] = [];

  // 1) dizionario statico
  for (const name of names) {
    const hit = deps.staticLookup(name);
    if (hit) out.set(name, hit);
    else unresolved.push(name);
  }
  if (unresolved.length === 0) return out;

  // 2) cache DB (per nome normalizzato)
  const normOf = new Map(unresolved.map((n) => [n, normalizeName(n)]));
  const cache = await deps.cacheLookup([...new Set(normOf.values())]);
  const stillMiss: string[] = [];
  for (const name of unresolved) {
    const norm = normOf.get(name)!;
    if (cache.has(norm)) out.set(name, cache.get(norm) ?? null);
    else stillMiss.push(name);
  }
  if (stillMiss.length === 0) return out;

  // 3) AI batch (una chiamata) sui miss residui distinti
  const distinct = [...new Set(stillMiss)];
  const ai = await deps.aiResolve(distinct);
  const toPersist = new Map<string, string | null>();
  for (const name of stillMiss) {
    const cat = ai.get(name) ?? null;
    out.set(name, cat);
    toPersist.set(normOf.get(name)!, cat);
  }
  await deps.persist(
    [...toPersist.entries()].map(([nameNorm, category]) => ({ nameNorm, category, source: 'ai' })),
  );
  return out;
}
```

- [ ] **Step 4: Esegui i test e verifica che passano**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS.

- [ ] **Step 5 (opzionale): Commit**

```bash
git add apps/api/src/category/resolve.ts apps/api/src/category/resolve.test.ts
git commit -m "feat(category): logica pura resolveCategories (dict→cache→AI batch)"
```

---

### Task 3: Schema Prisma — NameCategory + colonne category

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `VolantinoProduct` ~124-145, `MealItem` ~95-107; nuovo model in coda)

**Interfaces:**
- Produces: tabella `NameCategory`, colonne `VolantinoProduct.category`, `MealItem.category` disponibili nel client Prisma.

- [ ] **Step 1: Aggiungi il model `NameCategory` in coda a `schema.prisma`**

```prisma
/// Cache appresa nome→categoria canonica, popolata dall'AI all'ingestione per i
/// nomi non coperti dal dizionario statico. `source` distingue dict/ai.
model NameCategory {
  nameNorm  String   @id
  category  String?  // slug della tassonomia, o null se l'AI non sa collocarlo
  source    String   @default("ai") // 'dict' | 'ai'
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Aggiungi `category` a `VolantinoProduct`** (dopo `foodId String?`, riga ~137)

```prisma
  /// Categoria canonica (tassonomia) per il match con il piano; null se ignota.
  category      String?
```

- [ ] **Step 3: Aggiungi `category` a `MealItem`** (dopo `optionLabel String?`, riga ~106)

```prisma
  /// Categoria canonica (tassonomia) calcolata all'import per il match prezzi.
  category    String?
```

- [ ] **Step 4: Genera client e applica lo schema al DB**

Run: `npm --workspace @weeklyhome/api run prisma:generate && npm --workspace @weeklyhome/api run db:push`
Expected: `prisma generate` OK e `db push` riporta lo schema in sync (colonne/tabella create).

- [ ] **Step 5 (opzionale): Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(db): NameCategory + colonne category su VolantinoProduct/MealItem"
```

---

### Task 4: AI categorizer + CategoryService + CategoryModule

**Files:**
- Create: `apps/api/src/category/ai-categorizer.ts`
- Create: `apps/api/src/category/category.service.ts`
- Create: `apps/api/src/category/category.module.ts`
- Test: `apps/api/src/category/category.service.test.ts`

**Interfaces:**
- Consumes: `resolveCategories`, `normalizeName` (Task 2); `categorizeStatic` (Task 1); `CANONICAL_CATEGORIES`, `isCanonicalCategory` (Task 1); `geminiExtractJson`, `geminiModel` (`../ai/gemini.js`); `PrismaService`.
- Produces:
  - `ai-categorizer.ts`: `aiCategorize(names: string[]): Promise<Map<string, string | null>>` (usa Gemini; restituisce mappa vuota se manca la chiave o in errore/quota).
  - `category.service.ts`: classe `CategoryService` con `categorizeMany(names: string[]): Promise<Map<string, string | null>>` e `categoryFor(name: string): Promise<string | null>`.
  - `category.module.ts`: `CategoryModule` (`@Global`, `exports: [CategoryService]`).

- [ ] **Step 1: Scrivi il test che fallisce** — `apps/api/src/category/category.service.test.ts`

Il test costruisce il service con un Prisma finto (solo i metodi usati) e verifica l'integrazione dict+cache senza AI reale.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CategoryService } from './category.service.js';

function fakePrisma(seed: Record<string, string | null> = {}) {
  const rows = new Map<string, { nameNorm: string; category: string | null }>(
    Object.entries(seed).map(([k, v]) => [k, { nameNorm: k, category: v }]),
  );
  return {
    nameCategory: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where.nameNorm.in;
        return ids.filter((i) => rows.has(i)).map((i) => rows.get(i)!);
      },
      createMany: async ({ data }: any) => {
        for (const r of data) rows.set(r.nameNorm, { nameNorm: r.nameNorm, category: r.category });
        return { count: data.length };
      },
    },
    __rows: rows,
  };
}

test('categorizeMany: dizionario e cache, niente AI quando non serve', async () => {
  const prisma = fakePrisma({ marmellata: 'marmellata' });
  const svc = new CategoryService(prisma as any);
  const r = await svc.categorizeMany(['Frittata', 'Marmellata']);
  assert.equal(r.get('Frittata'), 'eggs');     // dizionario
  assert.equal(r.get('Marmellata'), 'marmellata'); // cache
});

test('categoryFor: scorciatoia per nome singolo', async () => {
  const svc = new CategoryService(fakePrisma() as any);
  assert.equal(await svc.categoryFor('Petto di pollo'), 'chicken');
  assert.equal(await svc.categoryFor('Oggetto misterioso'), null); // senza chiave AI → null
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npm --workspace @weeklyhome/api run test`
Expected: FAIL (`./category.service.js` inesistente).

- [ ] **Step 3: Crea `apps/api/src/category/ai-categorizer.ts`**

```ts
import { Logger } from '@nestjs/common';
import { geminiExtractJson, geminiModel } from '../ai/gemini.js';
import { CANONICAL_CATEGORIES, isCanonicalCategory } from './taxonomy.js';

const logger = new Logger('AiCategorizer');

const SYSTEM = `Sei un classificatore di nomi di prodotti/alimenti italiani.
Ricevi una lista di nomi e una lista CHIUSA di categorie ammesse.
Per ogni nome scegli la categoria più adatta SOLO da quelle ammesse, ragionando
per ingrediente principale (es. "Frittata" → eggs, "Cappuccino" → milk) e per
macro-gruppo (es. "Noci" → frutta-secca). Se nessuna categoria calza, usa null.
Rispondi SOLO con JSON: { "items": [ { "name": "<nome esatto>", "category": "<slug|null>" } ] }`;

interface AiOut {
  items?: Array<{ name?: string; category?: string | null }>;
}

/**
 * Categorizza i nomi via Gemini scegliendo dalla tassonomia chiusa. Restituisce
 * una mappa vuota se manca la chiave o in caso di errore/quota: i chiamanti
 * trattano i miss come `null` (fallback x-slug), nessun crash.
 */
export async function aiCategorize(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || names.length === 0) return out;
  const allowed = [...CANONICAL_CATEGORIES].join(', ');
  const prompt = `Categorie ammesse: ${allowed}\nNomi da classificare:\n${names
    .map((n) => `- ${n}`)
    .join('\n')}`;
  try {
    const res = await geminiExtractJson<AiOut>({
      apiKey,
      model: geminiModel(),
      system: SYSTEM,
      prompt,
      files: [],
    });
    for (const it of res.items ?? []) {
      if (!it.name) continue;
      const cat = it.category && isCanonicalCategory(it.category) ? it.category : null;
      out.set(it.name, cat);
    }
  } catch (e) {
    logger.warn(`Categorizzazione AI fallita: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}
```

- [ ] **Step 4: Crea `apps/api/src/category/category.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { categorizeStatic } from '../plan/extraction/food-catalog.js';
import { resolveCategories } from './resolve.js';
import { aiCategorize } from './ai-categorizer.js';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Categorizza più nomi (dict→cache→AI batch). Mappa indicizzata per nome originale. */
  async categorizeMany(names: string[]): Promise<Map<string, string | null>> {
    return resolveCategories(names, {
      staticLookup: (name) => categorizeStatic(name),
      cacheLookup: async (norms) => {
        const rows = await this.prisma.nameCategory.findMany({
          where: { nameNorm: { in: norms } },
        });
        return new Map(rows.map((r) => [r.nameNorm, r.category]));
      },
      aiResolve: (n) => aiCategorize(n),
      persist: async (entries) => {
        if (entries.length === 0) return;
        await this.prisma.nameCategory.createMany({ data: entries, skipDuplicates: true });
      },
    });
  }

  /** Categoria di un singolo nome. */
  async categoryFor(name: string): Promise<string | null> {
    const m = await this.categorizeMany([name]);
    return m.get(name) ?? null;
  }
}
```

- [ ] **Step 5: Crea `apps/api/src/category/category.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { CategoryService } from './category.service.js';

@Global()
@Module({
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
```

- [ ] **Step 6: Registra `CategoryModule` in `app.module.ts`**

Aggiungi l'import del modulo e inseriscilo nell'array `imports` di `AppModule`
(insieme agli altri moduli applicativi).

```ts
import { CategoryModule } from './category/category.module.js';
// ... nell'array imports di @Module({ imports: [...] }) aggiungi: CategoryModule,
```

- [ ] **Step 7: Esegui i test e verifica che passano**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS (`category.service.test.ts`).

- [ ] **Step 8 (opzionale): Commit**

```bash
git add apps/api/src/category/ apps/api/src/app.module.ts
git commit -m "feat(category): CategoryService (dict+cache+AI) e CategoryModule globale"
```

---

### Task 5: Categorizzazione all'ingestione volantino

**Files:**
- Modify: `apps/api/src/price/price.service.ts` (costruttore; `refreshConadVolantino`; `refreshTodisVolantino`; `ingestVolantino`; helper `persistVolantinoProducts`/`vpRow`)
- Modify: `apps/api/src/price/price.module.ts`

**Interfaces:**
- Consumes: `CategoryService.categorizeMany` (Task 4).
- Produces: i `VolantinoProduct` salvati hanno `category` valorizzata (o null).

- [ ] **Step 1: Inietta `CategoryService` nel costruttore di `PriceService`**

```ts
import { CategoryService } from '../category/category.service.js';
// ...
  constructor(
    private readonly prisma: PrismaService,
    private readonly category: CategoryService,
  ) {}
```

- [ ] **Step 2: Aggiungi `category` alla riga prodotto (`vpRow`)**

In `vpRow(...)` aggiungi il parametro `category` e includilo nell'oggetto restituito:

```ts
  private vpRow(
    storeId: string,
    source: string,
    p: ExtractedProduct,
    validTo: Date,
    category: string | null,
  ) {
    const unitPrice = computeUnitPrice(p);
    if (unitPrice == null) return null;
    return {
      storeId, source,
      name: p.name.trim(),
      brand: p.brand?.trim() || null,
      price: round2(p.price),
      quantityValue: p.quantityValue,
      quantityUnit: p.quantityUnit,
      unitPrice,
      foodId: catalogFoodId(p.name),
      category,
      validTo,
    };
  }
```

- [ ] **Step 3: Categorizza i nomi nei tre flussi di ingestione**

In `refreshConadVolantino`, `refreshTodisVolantino` e `ingestVolantino`, dopo aver
raccolto i `products` e PRIMA di costruire le `vpRows`, calcola le categorie una
volta sola e passale a `vpRow`. Esempio per Todis/ingest (lista `products` unica):

```ts
const catByName = await this.category.categorizeMany(products.map((p) => p.name));
const vpRows = products
  .map((p) => this.vpRow(storeId, source, p, validTo, catByName.get(p.name) ?? null))
  .filter((r): r is NonNullable<typeof r> => r != null);
```

Per Conad (i `products` si accumulano per volantino in un ciclo): raccogli tutti i
prodotti in un array, categorizza una volta dopo il ciclo, poi costruisci `vpRows`
mappando `catByName.get(p.name)`. Mantieni invariata la logica `best`/staple.

- [ ] **Step 4: Importa `CategoryModule` in `price.module.ts`**

```ts
import { CategoryModule } from '../category/category.module.js';
// @Module({ imports: [CategoryModule], providers: [PriceService], ... })
```

- [ ] **Step 5: Verifica build e test**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS (compila e i test esistenti restano verdi).

- [ ] **Step 6 (opzionale): Commit**

```bash
git add apps/api/src/price/price.service.ts apps/api/src/price/price.module.ts
git commit -m "feat(price): scrivi category sui VolantinoProduct all'ingestione"
```

---

### Task 6: Matching per categoria in buildOffers + passaggio category dalla spesa

**Files:**
- Modify: `apps/api/src/price/price.service.ts` (`buildOffers`)
- Modify: `apps/api/src/shopping/shopping.service.ts` (`compute`)
- Test: `apps/api/src/price/build-offers-match.test.ts`

**Interfaces:**
- Consumes: `categoriesMatch`, `effectiveKey` (Task 1).
- Produces: `buildOffers` aggancia i prodotti per categoria oltre che per foodId; la lista spesa porta `category` per riga.

- [ ] **Step 1: Estrai e testa la regola di match** — crea `apps/api/src/price/offer-match.ts`

```ts
import { categoriesMatch } from '../category/taxonomy.js';

/** True se un VolantinoProduct (foodId/category) appartiene a una riga di piano
 *  (foodId/category): match per categoria (con macro-gruppo) o per foodId. */
export function productMatchesРlanRow(
  planFoodId: string,
  planCategory: string | null,
  prodFoodId: string | null,
  prodCategory: string | null,
): boolean {
  if (planCategory && prodCategory && categoriesMatch(planCategory, prodCategory)) return true;
  if (prodFoodId && prodFoodId === planFoodId) return true;
  return false;
}
```

(Nota: rinomina la funzione in `productMatchesPlanRow` — ASCII puro — al momento della scrittura.)

- [ ] **Step 2: Scrivi il test che fallisce** — `apps/api/src/price/build-offers-match.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productMatchesPlanRow } from './offer-match.js';

test('match per categoria: piano Marmellata ↔ prodotto categoria marmellata', () => {
  assert.equal(productMatchesPlanRow('x-marmellata', 'marmellata', 'x-conf-albicocca', 'marmellata'), true);
});

test('macro-gruppo: piano Frutta secca ↔ prodotto Mandorle (almonds)', () => {
  assert.equal(productMatchesPlanRow('x-frutta-secca', 'frutta-secca', 'almonds', 'almonds'), true);
});

test('staple invariato: match per foodId quando categoria assente', () => {
  assert.equal(productMatchesPlanRow('eggs', 'eggs', 'eggs', 'eggs'), true);
  assert.equal(productMatchesPlanRow('x-a', null, 'x-a', null), true);
});

test('nessun falso positivo tra categorie diverse', () => {
  assert.equal(productMatchesPlanRow('x-pizza', 'pizza', 'sauce', 'sauce'), false);
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisce**

Run: `npm --workspace @weeklyhome/api run test`
Expected: FAIL (`./offer-match.js` inesistente / funzione non definita).

- [ ] **Step 4: Implementa `offer-match.ts`** (vedi Step 1, con nome `productMatchesPlanRow`).

- [ ] **Step 5: Usa il match per categoria in `buildOffers`**

In `price.service.ts`, estendi il tipo del parametro `list` per accettare la
categoria per riga e usa `productMatchesPlanRow` per associare i `VolantinoProduct`
alle righe del piano. Punti chiave:
- firma: `buildOffers(list: Array<ShoppingListRow & { category?: string | null }>, ...)`.
- la query `vps` oggi filtra `where: { foodId: { in: foodIds } }`: ampliala per
  prendere anche i prodotti la cui `category` è tra quelle del piano:
  `where: { OR: [{ foodId: { in: foodIds } }, { category: { in: categories } }], AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }] }`
  dove `categories = [...new Set(list.map(r => r.category).filter(Boolean))]`.
- per ogni `vp`, trova le righe del piano che matchano con `productMatchesPlanRow`
  (per ciascuna riga usa `effectiveKey(row.foodId, row.category)` come chiave di
  `byKey`/`productsByKey`, e `consider(effectiveKey(...), storeId, vp.unitPrice, ...)`).
- mantieni la logica di prezzo (più conveniente) e l'allegato `products[]`.
- `consider` deve continuare a chiudersi sulla **chiave effettiva**; aggiorna gli
  usi di `p.foodId` (tabella Price) per usare `effectiveKey(p.foodId, null)` = `p.foodId`
  (gli staple hanno category implicita = foodId, quindi nessun cambiamento).

- [ ] **Step 6: Passa la `category` dalla lista spesa** in `shopping.service.ts`

Dopo aver costruito `nameByFood`, costruisci anche `categoryByFood` dagli item del
piano e allega la categoria a ogni riga prima di chiamare `buildOffers`:

```ts
const categoryByFood = new Map<string, string | null>();
for (const meal of plan.meals)
  for (const it of meal.items) categoryByFood.set(it.foodId, it.category ?? null);
for (const o of plan.overrides)
  for (const it of o.items) categoryByFood.set(it.foodId, it.category ?? null);
const list = buildShoppingList(consumption).map((r) => ({
  ...r,
  name: nameByFood.get(r.foodId) ?? null,
  category: categoryByFood.get(r.foodId) ?? null,
}));
```

- [ ] **Step 7: Esegui i test e verifica che passano**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS (match test + esistenti).

- [ ] **Step 8 (opzionale): Commit**

```bash
git add apps/api/src/price/offer-match.ts apps/api/src/price/build-offers-match.test.ts apps/api/src/price/price.service.ts apps/api/src/shopping/shopping.service.ts
git commit -m "feat(price): buildOffers aggancia i prodotti per categoria (macro-gruppo)"
```

---

### Task 7: Categorizzazione degli item del piano all'import/modifica

**Files:**
- Modify: `apps/api/src/plan/plan.service.ts` (`importPlan`, `confirm` espansione, `addDraftItem`, `updateDraftItem`, `setOverride`)
- Modify: `apps/api/src/plan/plan.module.ts`

**Interfaces:**
- Consumes: `CategoryService.categorizeMany`/`categoryFor` (Task 4).
- Produces: i `MealItem` (e item override) salvati hanno `category`.

- [ ] **Step 1: Inietta `CategoryService` in `PlanService`**

```ts
import { CategoryService } from '../category/category.service.js';
// costruttore: aggiungi  private readonly category: CategoryService,
```

- [ ] **Step 2: Valorizza `category` all'import** (`importPlan`)

Dopo aver costruito `meals` (NormalizedMeal[]) e prima di `prisma.plan.create`,
raccogli i nomi distinti (`it.name ?? it.foodId`) e categorizzali; nel `create`
degli item aggiungi `category: catByName.get(it.name ?? it.foodId) ?? null`.
Applica lo stesso nei rami: ramo PDF e ramo sample (per il sample puoi usare
`categorizeStatic` direttamente per evitare AI, o `categorizeMany`).

- [ ] **Step 3: Propaga `category` nell'espansione 7 giorni** (`confirm`)

Nell'oggetto `items.create` dell'espansione aggiungi `category: it.category`
(copia il valore già calcolato sui meal template).

- [ ] **Step 4: Valorizza `category` su add/update/override**

- `addDraftItem`: `category: await this.category.categoryFor(body.name)`.
- `updateDraftItem`: se `patch.name` cambia, ricalcola `category: patch.name ? await this.category.categoryFor(name!) : item.category`.
- `setOverride`: per ogni item `category: it.name ? await this.category.categoryFor(it.name) : null` (oppure `categorizeMany` sui nomi del batch).

- [ ] **Step 5: Importa `CategoryModule` in `plan.module.ts`**

```ts
import { CategoryModule } from '../category/category.module.js';
// @Module({ imports: [FamilyModule, CategoryModule], ... })
```

- [ ] **Step 6: Verifica build e test**

Run: `npm --workspace @weeklyhome/api run test`
Expected: PASS.

- [ ] **Step 7 (opzionale): Commit**

```bash
git add apps/api/src/plan/plan.service.ts apps/api/src/plan/plan.module.ts
git commit -m "feat(plan): calcola category sugli item all'import e modifica"
```

---

### Task 8: Script di backfill dei dati esistenti

**Files:**
- Create: `apps/api/scripts/backfill-categories.mjs`

**Interfaces:**
- Consumes: client Prisma compilato (`dist`) e i moduli categoria compilati.

- [ ] **Step 1: Crea `apps/api/scripts/backfill-categories.mjs`**

```js
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { CategoryService } from '../dist/category/category.service.js';

const prisma = new PrismaService();
await prisma.$connect();
const svc = new CategoryService(prisma);

// 1) VolantinoProduct senza categoria
const vps = await prisma.volantinoProduct.findMany({ where: { category: null }, select: { id: true, name: true } });
// 2) MealItem senza categoria
const items = await prisma.mealItem.findMany({ where: { category: null }, select: { id: true, name: true, foodId: true } });

const allNames = [...new Set([
  ...vps.map((v) => v.name),
  ...items.map((it) => it.name ?? it.foodId),
])];
console.log(`Nomi distinti da categorizzare: ${allNames.length}`);
const cat = await svc.categorizeMany(allNames);

let upV = 0;
for (const v of vps) {
  const c = cat.get(v.name) ?? null;
  if (c) { await prisma.volantinoProduct.update({ where: { id: v.id }, data: { category: c } }); upV++; }
}
let upI = 0;
for (const it of items) {
  const c = cat.get(it.name ?? it.foodId) ?? null;
  if (c) { await prisma.mealItem.update({ where: { id: it.id }, data: { category: c } }); upI++; }
}
console.log(`Aggiornati: ${upV}/${vps.length} prodotti, ${upI}/${items.length} item piano.`);
await prisma.$disconnect();
```

- [ ] **Step 2: Builda e lancia il backfill**

Run:
```bash
npm --workspace @weeklyhome/api run build
node --env-file=apps/api/.env apps/api/scripts/backfill-categories.mjs
```
Expected: stampa il numero di nomi distinti e i record aggiornati; al massimo **una** chiamata AI per i miss (o zero se tutto in dizionario/cache).

- [ ] **Step 3 (opzionale): Commit**

```bash
git add apps/api/scripts/backfill-categories.mjs
git commit -m "chore(category): script di backfill categorie sui dati esistenti"
```

---

### Task 9: Script diagnostico di copertura

**Files:**
- Create: `apps/api/scripts/coverage-report.mjs`

- [ ] **Step 1: Crea `apps/api/scripts/coverage-report.mjs`**

```js
import { PrismaClient } from '@prisma/client';
import { categoriesMatch, effectiveKey } from '../dist/category/taxonomy.js';

const prisma = new PrismaClient();
const now = new Date();

const plan = await prisma.plan.findFirst({ where: { status: 'ACTIVE' }, include: { meals: { include: { items: true } } } });
const planRows = new Map(); // effectiveKey -> { name, foodId, category }
for (const m of plan?.meals ?? []) for (const it of m.items) {
  planRows.set(effectiveKey(it.foodId, it.category ?? null), { name: it.name ?? it.foodId, foodId: it.foodId, category: it.category ?? null });
}
const vps = await prisma.volantinoProduct.findMany({ where: { OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { name: true, foodId: true, category: true, storeId: true } });

for (const [key, row] of planRows) {
  const matched = vps.filter((v) =>
    (row.category && v.category && categoriesMatch(row.category, v.category)) ||
    (v.foodId && v.foodId === row.foodId),
  );
  const status = matched.length > 0 ? `IN OFFERTA (${matched.length})` : 'ASSENTE nel volantino';
  console.log(`${row.name}  [cat=${row.category ?? '-'}]  -> ${status}`);
}
await prisma.$disconnect();
```

- [ ] **Step 2: Lancia il report**

Run: `node --env-file=apps/api/.env apps/api/scripts/coverage-report.mjs`
Expected: per ogni item del piano stampa `IN OFFERTA (n)` o `ASSENTE nel volantino`.

- [ ] **Step 3 (opzionale): Commit**

```bash
git add apps/api/scripts/coverage-report.mjs
git commit -m "chore(category): report diagnostico copertura piano↔volantino"
```

---

### Task 10: Verifica end-to-end

**Files:** nessuno (solo esecuzione e osservazione).

- [ ] **Step 1: Build completa API**

Run: `npm --workspace @weeklyhome/api run build`
Expected: nessun errore TypeScript.

- [ ] **Step 2: Suite di test API**

Run: `npm --workspace @weeklyhome/api run test`
Expected: tutti i test verdi (food-catalog, resolve, category.service, offer-match, esistenti).

- [ ] **Step 3: Backfill + coverage** (vedi Task 8/9) e verifica che item come
  "Marmellata"/"Frutta secca"/"Pizza" passino da ASSENTE a IN OFFERTA quando i
  prodotti corrispondenti sono presenti nel volantino.

- [ ] **Step 4: Verifica runtime (facoltativa)**

Con API avviata, ricostruisci la spesa (`GET /api/shopping?...`) e controlla che gli
item-categoria mostrino offerte e marche dei prodotti agganciati per categoria.

---

## Self-Review (eseguita)

- **Copertura spec:** tassonomia (Task 1), cache 2 livelli (Task 1 dizionario + Task 3/4 DB), AI solo ingestione batch (Task 4/5/7), matching per categoria con macro-gruppo (Task 1/6), backfill (Task 8), diagnostico copertura (Task 9), test (Task 1/2/4/6) — tutte mappate.
- **Placeholder:** nessun TBD/TODO; codice completo nei nuovi file, diff precisi sugli esistenti.
- **Coerenza tipi:** `category: string | null` ovunque; `categorizeMany`/`categoryFor` (CategoryService), `resolveCategories`/`normalizeName` (resolve), `productMatchesPlanRow` (offer-match), `categoriesMatch`/`effectiveKey` (taxonomy) — nomi e firme coerenti tra i task.
- **Nota refuso:** lo Step 1 di Task 6 contiene un carattere non-ASCII nel nome funzione di esempio; usare `productMatchesPlanRow` come indicato.
```
