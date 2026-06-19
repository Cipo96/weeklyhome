import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productMatchesPlanRow } from './offer-match.js';

test('match per categoria: piano Marmellata ↔ prodotto categoria marmellata', () => {
  assert.equal(
    productMatchesPlanRow('x-marmellata', 'Marmellata albicocche', 'marmellata', 'x-conf-albicocca', 'marmellata'),
    true,
  );
});

test('macro-gruppo generico: piano "Frutta secca" ↔ prodotto Mandorle (almonds)', () => {
  assert.equal(
    productMatchesPlanRow('x-frutta-secca', 'Frutta secca', 'frutta-secca', 'almonds', 'almonds'),
    true,
  );
});

test('macro-gruppo generico: piano "Verdure miste" ↔ prodotto Patate', () => {
  assert.equal(
    productMatchesPlanRow('x-verdure', 'Verdure miste', 'verdure', 'x-patate', 'patate'),
    true,
  );
});

test('NIENTE falso positivo macro: piano "Zucchine" (verdure) ✗ prodotto Patate', () => {
  // Zucchine non ha categoria propria → finisce in `verdure` (macro), ma è un
  // alimento SPECIFICO: non deve agganciare le patate (altro figlio di verdure).
  assert.equal(
    productMatchesPlanRow('x-zucchine', 'Zucchine', 'verdure', 'x-patate', 'patate'),
    false,
  );
});

test('staple invariato: match per foodId quando categoria assente', () => {
  assert.equal(productMatchesPlanRow('eggs', 'Uova', 'eggs', 'eggs', 'eggs'), true);
  assert.equal(productMatchesPlanRow('x-a', 'Roba', null, 'x-a', null), true);
});

test('nessun falso positivo tra categorie diverse', () => {
  assert.equal(productMatchesPlanRow('x-pizza', 'Pizza margherita', 'pizza', 'sauce', 'sauce'), false);
});
