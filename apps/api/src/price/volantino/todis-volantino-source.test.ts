import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTodisVolantino,
  volantinoTitle,
  type WpVolantino,
} from './todis-volantino-source.js';

/**
 * Questa selezione decide QUALE PDF paghiamo di estrazione AI. Quando ha
 * sbagliato bersaglio Todis e' rimasto una settimana senza offerte, senza che
 * nulla lo segnalasse: i casi qui sotto sono presi dai post reali del sito.
 */

const post = (id: number, modified: string, title: string): WpVolantino => ({
  id,
  modified_gmt: modified,
  title: { rendered: title },
  link: `https://www.todis.it/volantini/${id}`,
});

/** Fotografia di www.todis.it/wp-json/wp/v2/volantini del 18/08/2026. */
const REALI: WpVolantino[] = [
  post(103733, '2026-08-17T14:37:04', 'Volantino Bassi e Bloccati Abruzzo-Marche-Molise-Puglia'),
  post(103700, '2026-08-17T01:46:08', 'Abruzzo Marche Molise Pescheria'),
  post(103699, '2026-08-17T01:41:57', 'Abruzzo Marche Molise'),
  post(103650, '2026-08-17T01:40:00', 'Lazio Umbria'),
];

test('caso reale: sceglie il settimanale, non "Bassi e Bloccati" piu’ recente', () => {
  // Il listino a prezzi bloccati viene ritoccato di continuo, quindi ordinando
  // per modified_gmt vinceva sempre lui: e' il bug che ha svuotato Todis.
  const scelto = selectTodisVolantino(REALI);
  assert.equal(volantinoTitle(scelto!), 'Abruzzo Marche Molise');
});

test('esclude i volantini di reparto anche se piu’ recenti del generale', () => {
  const scelto = selectTodisVolantino([
    post(1, '2026-08-17T09:00:00', 'Abruzzo Marche Molise Pescheria'),
    post(2, '2026-08-17T08:00:00', 'Abruzzo Marche Molise'),
  ]);
  assert.equal(volantinoTitle(scelto!), 'Abruzzo Marche Molise');
});

test('varianti di "prezzi bloccati" tutte escluse', () => {
  for (const titolo of [
    'Volantino Bassi e Bloccati Abruzzo',
    'Abruzzo Prezzi Bloccati',
    'Abruzzo Sempre Bassi',
    'Bassi   e   Bloccati Abruzzo',
  ]) {
    assert.equal(
      selectTodisVolantino([post(1, '2026-08-17T10:00:00', titolo)]),
      null,
      `non doveva essere scelto: ${titolo}`,
    );
  }
});

test('a parita’ di esclusioni vince comunque il piu’ recente', () => {
  const scelto = selectTodisVolantino([
    post(1, '2026-08-10T08:00:00', 'Abruzzo Marche Molise'),
    post(2, '2026-08-17T08:00:00', 'Abruzzo Marche Molise'),
  ]);
  assert.equal(scelto?.id, 2);
});

test('regione diversa non viene mai scelta', () => {
  assert.equal(selectTodisVolantino([post(1, '2026-08-17T10:00:00', 'Lazio Umbria')]), null);
});

test('nessun candidato valido → null invece di un volantino a caso', () => {
  // Meglio non estrarre nulla che pagare la vision sul documento sbagliato.
  assert.equal(selectTodisVolantino([]), null);
  assert.equal(
    selectTodisVolantino([post(1, '2026-08-17T10:00:00', 'Abruzzo Marche Molise Enoteca')]),
    null,
  );
});

test('titolo con markup WP viene ripulito', () => {
  assert.equal(
    volantinoTitle(post(1, '2026-08-17T10:00:00', 'Abruzzo &#8211; <b>Marche</b> Molise')),
    'Abruzzo &#8211; Marche Molise',
  );
});
