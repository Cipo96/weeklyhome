import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLidlFoodCategory, lidlPack } from './catalog/lidl-offers.js';
import { pricesFromProducts, type ProviderProduct } from './price-data.js';

/**
 * La ricerca prodotti deve vedere TUTTO cio' che scrapiamo, non solo gli
 * alimenti del piano: cercare "anguria" non trovava nulla perche' i provider
 * scartavano all'ingestione tutto il fuori-catalogo, cancellandolo anche dalla
 * ricerca. Il filtro staple vive ora solo dove si costruiscono le righe prezzo
 * per l'ottimizzatore. Questi test presidiano quel confine.
 */

const prod = (foodId: string, name: string, unitPrice: number): ProviderProduct => ({
  foodId,
  storeId: 'lidl',
  name,
  brand: null,
  packPrice: unitPrice,
  unitPrice,
  baseUnit: 'kg',
});

// --- categoria Lidl ----------------------------------------------------------

test('categoria: "F+V" e’ cibo — e’ il bug che escludeva tutta l’ortofrutta', () => {
  // Lidl marca la frutta e verdura come "F+V", non "Food". Il confronto con la
  // sola stringa 'Food' buttava via il 100% dell'ortofrutta, anguria inclusa.
  assert.equal(isLidlFoodCategory('F+V'), true);
});

test('categoria: "Food" resta accettata', () => {
  assert.equal(isLidlFoodCategory('Food'), true);
});

test('categoria: confronto insensibile alle maiuscole', () => {
  assert.equal(isLidlFoodCategory('f+v'), true);
  assert.equal(isLidlFoodCategory('FOOD'), true);
});

test('categoria: assente → accettata (il filtro pagina e’ gia’ la rete)', () => {
  assert.equal(isLidlFoodCategory(undefined), true);
});

test('categoria: le non alimentari restano escluse', () => {
  for (const c of ['Nonfood', 'Household', 'Garden', 'Toys', '']) {
    if (c === '') continue; // stringa vuota = categoria assente, gia' coperta
    assert.equal(isLidlFoodCategory(c), false, `doveva essere escluso: ${c}`);
  }
});

// --- confine ricerca / ottimizzatore -----------------------------------------

test('ottimizzatore: i prodotti fuori catalogo non generano righe prezzo', () => {
  const righe = pricesFromProducts(
    [
      prod('x-anguria', 'Anguria Perla baby', 0.79),
      prod('x-bagel', 'Bagel', 2.1),
      prod('chicken', 'Arrosticini di pollo', 12.4),
    ],
    'lidl-offers',
  );
  assert.deepEqual(
    righe.map((r) => r.foodId),
    ['chicken'],
  );
});

test('ottimizzatore: un fuori-catalogo piu’ economico non falsa il prezzo staple', () => {
  // Il rischio del nuovo confine: ora i provider passano anche il fuori-catalogo
  // a pricesFromProducts, che non deve mai lasciarlo vincere come "piu' conveniente".
  const righe = pricesFromProducts(
    [prod('chicken', 'Arrosticini di pollo', 12.4), prod('x-snack', 'Snack di pollo panato', 3.0)],
    'lidl-offers',
  );
  assert.equal(righe.length, 1);
  assert.equal(righe[0]!.unitPrice, 12.4);
});

test('ottimizzatore: fra due staple uguali vince il piu’ conveniente', () => {
  const righe = pricesFromProducts(
    [prod('chicken', 'Cotoletta di pollo', 9.9), prod('chicken', 'Arrosticini di pollo', 12.4)],
    'lidl-offers',
  );
  assert.equal(righe.length, 1);
  assert.equal(righe[0]!.unitPrice, 9.9);
});

test('ottimizzatore: solo fuori catalogo → nessuna riga, nessun crash', () => {
  assert.deepEqual(pricesFromProducts([prod('x-bagel', 'Bagel', 2.1)], 'lidl-offers'), []);
});

// --- quantita' della confezione ----------------------------------------------

test('confezione: "Al kg" — lo sfuso a peso ha gia’ il prezzo unitario', () => {
  // L'ortofrutta venduta a peso non porta una quantita' nel testo: il parsing
  // numerico falliva e il prodotto spariva. E' il caso dell'anguria.
  assert.deepEqual(lidlPack({ price: 1.09, packaging: { text: 'Al kg' } }), {
    unitPrice: 1.09,
    baseUnit: 'kg',
  });
});

test('confezione: "Al pezzo" e "Alla confezione" → unita’ a pezzi', () => {
  assert.equal(lidlPack({ price: 2.5, packaging: { text: 'Al pezzo' } })?.baseUnit, 'pz');
  assert.equal(lidlPack({ price: 2.5, packaging: { text: 'Alla confezione' } })?.baseUnit, 'pz');
});

test('confezione: "Al litro" → unita’ a volume', () => {
  assert.equal(lidlPack({ price: 1.2, packaging: { text: 'Al litro' } })?.baseUnit, 'l');
});

test('confezione: la quantita’ numerica ha la precedenza sullo sfuso', () => {
  // "2 kg confezione" a 1.99 fa 1.00 €/kg: il ramo sfuso non deve intercettarlo
  // e restituire 1.99, che sarebbe il prezzo della confezione intera.
  assert.deepEqual(lidlPack({ price: 1.99, packaging: { text: '2 kg confezione' } }), {
    unitPrice: 1,
    baseUnit: 'kg',
  });
});

test('confezione: basePrice di Lidl resta la fonte preferita', () => {
  assert.deepEqual(
    lidlPack({
      price: 1.99,
      basePrice: { text: '1 kg = 1.00 €' },
      packaging: { text: '2 kg confezione' },
    }),
    { unitPrice: 1, baseUnit: 'kg' },
  );
});

test('confezione: testo non interpretabile → null, nessun prezzo inventato', () => {
  assert.equal(lidlPack({ price: 1.99, packaging: { text: 'confezione' } }), null);
  assert.equal(lidlPack({ price: 1.99 }), null);
  assert.equal(lidlPack({ packaging: { text: 'Al kg' } }), null);
});
