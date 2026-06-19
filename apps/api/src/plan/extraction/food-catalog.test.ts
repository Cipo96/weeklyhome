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
  assert.equal(categoriesMatch('frutta-secca', 'almonds'), true);
  assert.equal(categoriesMatch('almonds', 'frutta-secca'), true);
  assert.equal(categoriesMatch('marmellata', 'eggs'), false);
});

test('effectiveKey: categoria se presente, altrimenti foodId', () => {
  assert.equal(effectiveKey('x-marmellata-albicocca', 'marmellata'), 'marmellata');
  assert.equal(effectiveKey('eggs', 'eggs'), 'eggs');
  assert.equal(effectiveKey('x-cosa-strana', null), 'x-cosa-strana');
});
