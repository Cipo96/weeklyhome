# Design — Normalizzazione semantica per categorie (fattore spesa)

Data: 2026-06-19
Stato: proposto (in attesa di revisione utente prima del piano implementativo)

## Problema

Il matching tra i nomi del **piano nutrizionale** e i **prodotti dei volantini** è
oggi troppo letterale (`food-catalog.ts`: dizionario di ~25 alias + match a
substring a confine di parola). Conseguenze osservate sui dati reali:

- Il piano usa in larga parte **categorie** ("Frutta secca" ×19, "Marmellata" ×19,
  "Verdure", "Frutta fresca", "Pesce bianco") e **piatti** ("Frittata", "Uova
  strapazzate", "Cappuccino", "Pancakes"); solo una manciata coincide con i 16
  staple del catalogo.
- Nei volantini, **273 prodotti su 325 finiscono in `x-`** (fuori catalogo):
  offerte potenzialmente invisibili perché anche il lato-piano è `x-…` e gli slug
  non combaciano.
- Esempi che falliscono oggi: "Frittata" non aggancia le uova; "Marmellata" non
  trova le confetture; "Frutta secca" non trova noci/mandorle; "Pizza" non
  aggancia i 6 prodotti pizza presenti (foodId tutti diversi).
- Falsi positivi: ingredienti dentro nomi compositi agganciano lo staple sbagliato
  ("Fusilli … e mandorle" → `sauce`; "Pizzarollo mozzarella e pomodoro" → `sauce`).

Gli esempi (marmellata, frutta secca, pizza) sono **rappresentativi, non
esaustivi**: la soluzione deve coprire l'intero vocabolario del piano ed essere
estensibile.

## Obiettivo

Un **layer di normalizzazione semantica per categorie** che faccia: piatto→
ingrediente, categoria→famiglia di prodotti, sinonimi/assonanze. L'"intelligenza"
è AI, ma **congelata all'ingestione** e messa in **cache**, così il matching a
runtime è deterministico e gratuito e non si tocca la quota Gemini (free tier
20/dì).

## Decisioni prese (brainstorming)

1. Meccanismo: **AI** per la categorizzazione.
2. Timing: l'AI gira **solo all'ingestione** (estrazione volantino + import piano),
   **mai** a runtime sulla lista spesa.
3. Cache: **a due livelli** — dizionario statico in codice (valori noti, rivisti a
   mano) + cache DB appresa dall'AI per i nomi nuovi. L'AI è l'ultima spiaggia.

## Architettura

### 1. Tassonomia canonica (vocabolario fisso)

Elenco curato di **categorie canoniche** (slug stabili) da cui *entrambi* i lati
del match devono pescare — è ciò che rende il join deterministico. Bozza iniziale
derivata dai ~70 nomi reali del piano + categorie comuni da supermercato:

- Staple esistenti (con prezzo per l'ottimizzatore): `eggs`, `milk`, `chicken`,
  `tuna`, `oats`, `banana`, `apple`, `yogurt`, `bread`, `salad`, `oil`, `sauce`,
  `parmesan`, `almonds`, `rice`, `pasta`.
- Nuove categorie (per agganciare prodotti↔item, senza necessità di prezzo staple):
  `marmellata`, `frutta-secca`, `frutta-fresca`, `verdure`, `pesce-bianco`,
  `salmone`, `formaggio`, `pizza`, `burro-arachidi`, `cioccolato`, `biscotti`,
  `fette-biscottate`, `gallette`, `granola`, `legumi`, `patate`, `prosciutto`,
  `tacchino`, `mais`, `cocco`, `ketchup`, `pomodorini`, `avocado`, `hummus`,
  `acqua`, `farina`, `pangrattato`, … (estendibile).

Regole:
- Per gli staple `category == foodId` (es. `eggs`).
- Per il resto, `category` è la categoria-tassonomia (es. `marmellata`) mentre
  `foodId` resta lo slug `x-…` univoco del prodotto.
- Nome non riconducibile ad alcuna categoria → `category = null`, `foodId = x-slug`
  (comportamento attuale, **nessuna regressione**).
- La lista canonica vive in codice (versionata) come fonte di verità; viene passata
  all'AI come insieme ammesso quando deve categorizzare un nome nuovo.

### 2. Cache a due livelli

- **Dizionario statico** (evoluzione di `food-catalog.ts`): mappature ovvie e
  riviste a mano. Include:
  - le mappe staple attuali (`NAME_TO_ID`);
  - **piatto→ingrediente**: `frittata→eggs`, `uova strapazzate→eggs`,
    `cappuccino→milk`, …;
  - **sinonimi categoria**: `confettura→marmellata`, `noci|mandorle|nocciole|
    anacardi|pistacchi→frutta-secca`, `merluzzo|platessa|nasello→pesce-bianco`, …
  - Deterministico, **zero AI**.
- **Tabella DB `NameCategory`**: cache appresa.
  - Campi: `nameNorm` (PK, nome normalizzato), `category` (slug della tassonomia o
    `null` se l'AI non sa collocarlo), `source` (`dict` | `ai`), `createdAt`.
  - Persiste tra i refresh: alla seconda settimana gli stessi nomi sono già in
    cache → niente AI. `source` permette di promuovere a mano i casi `ai`
    frequenti nel dizionario statico.

**Ordine di lookup di `categorize(name)`:**
1. dizionario statico → 2. cache DB → 3. (miss) AI batch → salva in cache DB.

### 3. Servizio di categorizzazione

Nuovo modulo condiviso `apps/api/src/category/category.service.ts` (usato sia da
`price` che da `plan`, con `CategoryModule` esportato e importato dai due moduli):
- `categorize(name): Promise<{ category: string | null; foodId: string }>` —
  cache-first; **non** chiama l'AI per nome singolo.
- `categorizeBatch(names: string[]): Promise<Map<name, category>>` — risolve via
  dizionario+cache; per i soli **miss** fa **una** chiamata AI batch
  ("categorizza questi N nomi scegliendo SOLO dalla tassonomia fornita; restituisci
  `null` se nessuna calza"); persiste i risultati in `NameCategory`.
- Riusa l'estrattore/SDK già presenti (Gemini-first, fallback Anthropic).

### 4. Integrazione all'ingestione

- **Estrazione volantino** (`price.service.ts` → `refreshConad/Todis/ingest`):
  dopo l'estrazione dei prodotti, `categorizeBatch(distinctNames)` e si scrive
  `category` su ogni `VolantinoProduct`. La chiamata AI di categorizzazione è
  separata da quella di estrazione e parte **solo se ci sono miss**.
- **Import piano** (`plan.service.ts`): per gli item estratti, `categorizeBatch`
  e si scrive `category` su `MealItem`.

### 5. Matching a runtime (`buildOffers`)

La **chiave di raggruppamento** dell'offerta passa da `foodId` a una **chiave
effettiva** = `category` se non-null, altrimenti `foodId` (fallback per gli item
senza categoria). Regola precisa:
- ogni riga della lista spesa porta con sé `foodId` **e** `category` (da `MealItem`);
- un `VolantinoProduct` aggancia una riga del piano se hanno la **stessa chiave
  effettiva** (stessa `category`, oppure stesso `foodId` quando `category` è null su
  entrambi);
- esempi: "Marmellata" → tutti i `category=marmellata`; "Frutta secca" → tutti i
  `frutta-secca`; "Frittata" → `category=eggs` → offerte uova;
- gli staple continuano a funzionare perché per loro `category == foodId`, quindi la
  chiave effettiva non cambia → **nessuna regressione**.
- Deterministico e gratuito (nessuna AI a runtime). La logica "più conveniente per
  alimento×negozio" e `products[]` (marche) resta; cambia solo la chiave con cui si
  raggruppa.

### 6. Backfill dei dati esistenti

Script una-tantum (`node --env-file=.env scripts/backfill-categories.mjs`):
- raccoglie i **nomi distinti** già presenti (325 `VolantinoProduct` + item del
  piano attivo);
- `categorizeBatch`: la gran parte si risolve via dizionario (gratis), i pochi miss
  in **una** chiamata AI;
- aggiorna `category` sui record esistenti.

Costo: pochissime richieste, una volta sola. In assenza di chiave AI, lo script
fa solo la parte dizionario+cache e logga i nomi rimasti non categorizzati.

### 7. Copertura (problema B) — limiti espliciti

- Il matching per categoria **da solo** sblocca i 273 prodotti `x-` oggi invisibili:
  gran parte del "non trovo nulla" è matching, non estrazione.
- L'AI **non** può inventare prodotti assenti dal volantino (es. marmellata se non
  c'è in quel volantino → resta giustamente assente).
- **Diagnostico** (`scripts/coverage-report.mjs` o log dedicato): per ogni categoria
  del piano riporta lo stato — `in offerta` / `estratto-ma-non-matchato` /
  `assente nel volantino` — per distinguere un bug di matching da un buco di
  sorgente senza tirare a indovinare.

## Componenti e confini

| Unità | Responsabilità | Dipende da |
|---|---|---|
| `taxonomy.ts` | elenco categorie canoniche + staple set | — |
| `food-catalog.ts` (evoluto) | dizionario statico nome→categoria (dict-first) | taxonomy |
| `NameCategory` (Prisma) | cache DB appresa | — |
| `category.service.ts` | `categorize`/`categorizeBatch` (dict→cache→AI) | dizionario, cache, estrattore AI |
| `price.service.ts` | scrive `category` su VolantinoProduct; join per categoria | category.service |
| `plan.service.ts` | scrive `category` su MealItem | category.service |
| `buildOffers` | match per categoria oltre che foodId | — |
| script backfill / coverage | una-tantum / diagnostica | category.service |

## Modello dati (migrazioni Prisma)

- `VolantinoProduct`: `+ category String?`
- `MealItem`: `+ category String?`
- nuovo model `NameCategory { nameNorm String @id; category String?; source String; createdAt DateTime @default(now()) }`

## Gestione errori

- AI non disponibile / quota esaurita in `categorizeBatch`: i miss restano
  `category=null` (fallback x-slug), nessun crash; verranno ritentati al prossimo
  refresh (o backfill) quando la quota torna. Coerente con la gestione quota
  esistente (`isDailyQuotaError`).
- AI restituisce una categoria fuori tassonomia: scartata → `null`.

## Strategia di test (`node:test`, pattern API)

1. **Categorizzazione**: `frittata→eggs`, `confettura→marmellata`,
   `noci→frutta-secca`, hit dizionario, hit cache, fallback `x-` con AI mockata,
   categoria-fuori-tassonomia→null.
2. **Regressione vocabolario**: i ~70 nomi reali del piano → categoria attesa (o
   `null` documentato).
3. **`buildOffers`**: item "Marmellata" aggancia prodotti `category=marmellata`;
   nessun falso positivo (es. "Pizzarollo mozzarella e pomodoro" non → `sauce`).
4. **Batch/quota**: `categorizeBatch` fa **una sola** chiamata AI per N miss e
   **zero** se tutto è in dizionario/cache.

## Fuori scope (YAGNI)

- AI a runtime sulla lista spesa.
- Re-estrazione dei volantini per "cercare" prodotti assenti.
- UI di gestione tassonomia (per ora si edita il dizionario in codice).

## Rischi

- Drift della tassonomia se l'AI inventa slug: mitigato dal **set chiuso** passato
  all'AI e dallo scarto dei fuori-lista.
- Manutenzione del dizionario statico: mitigata dalla cache DB (`source=ai`) che
  segnala cosa promuovere.
