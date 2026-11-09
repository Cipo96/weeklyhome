import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CronController } from './cron.controller.js';
import { PriceService } from './price/price.service.js';

/**
 * Il controller cron e' l'unica superficie pubblica senza JWT: se il controllo
 * del token si rompe, chiunque puo' bruciare la quota AI. Questi test coprono
 * la guardia e la logica di freschezza che decide se lo scheduler esterno
 * considera il refresh riuscito o fallito.
 */

/**
 * Esegue `fn` con le env sostituite e le ripristina dopo. E' async di proposito:
 * una versione sincrona ripristinerebbe nel finally prima che una fn asincrona
 * abbia letto process.env, e il test passerebbe/fallirebbe per il motivo sbagliato.
 */
const withEnv = async <T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = Object.entries(vars).map(([k]) => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const controller = (): CronController =>
  new CronController(null as unknown as PriceService);

test('token: senza CRON_SECRET configurato risponde 503, non 403', async () => {
  await withEnv({ CRON_SECRET: undefined }, () =>
    // Distinguere i due casi e' cio' che permette al workflow di dire
    // "manca la env su Render" invece di "token sbagliato".
    assert.rejects(() => controller().status('qualsiasi'), /CRON_SECRET non configurato/),
  );
});

test('token: segreto configurato ma token errato viene rifiutato', async () => {
  await withEnv({ CRON_SECRET: 'segreto-vero' }, () =>
    assert.rejects(() => controller().status('segreto-falso'), /non valido/),
  );
});

test('token: assente del tutto viene rifiutato anche se il segreto esiste', async () => {
  await withEnv({ CRON_SECRET: 'segreto-vero' }, () =>
    assert.rejects(() => controller().status(undefined), /non valido/),
  );
});

test('weekly: risponde immediatamente con started: true e avvia in background', async () => {
  let refreshCalled = false;
  let startVolantiniCalled = false;
  const mockPrice = {
    refresh: async () => {
      refreshCalled = true;
      return {} as never;
    },
    startVolantiniRefresh: () => {
      startVolantiniCalled = true;
    },
  } as unknown as PriceService;

  const ctrl = new CronController(mockPrice);
  await withEnv({ CRON_SECRET: 'segreto-vero' }, async () => {
    const res = await ctrl.weekly('segreto-vero', undefined, 'true');
    assert.deepEqual(res, { started: true, force: true });
    await new Promise((r) => setImmediate(r));
    assert.equal(refreshCalled, true);
    assert.equal(startVolantiniCalled, true);
  });
});

// --- freschezza dei volantini -------------------------------------------------

const HOUR = 3_600_000;

/** Prisma finto: risponde alle due sole groupBy usate da volantiniStatus. */
function fakePrisma(rows: { storeId: string; agoHours: number; active: number }[]) {
  return {
    volantinoProduct: {
      groupBy: async (args: { _max?: unknown; _count?: unknown }) => {
        if (args._max) {
          return rows.map((r) => ({
            storeId: r.storeId,
            _max: { fetchedAt: new Date(Date.now() - r.agoHours * HOUR) },
          }));
        }
        return rows
          .filter((r) => r.active > 0)
          .map((r) => ({ storeId: r.storeId, _count: { _all: r.active } }));
      },
    },
  };
}

const serviceWith = (rows: { storeId: string; agoHours: number; active: number }[]) =>
  new PriceService(fakePrisma(rows) as never, null as never);

test('status: entrambe le insegne fresche e con offerte attive → ok', async () => {
  const res = await serviceWith([
    { storeId: 'conad', agoHours: 2, active: 40 },
    { storeId: 'todis', agoHours: 3, active: 25 },
  ]).volantiniStatus();
  assert.equal(res.ok, true);
  assert.equal(res.stores.length, 2);
  assert.equal(res.stores.every((s) => s.fresh), true);
});

test("status: un'insegna mai estratta → non ok, con lastFetchedAt null", async () => {
  const res = await serviceWith([{ storeId: 'conad', agoHours: 2, active: 40 }]).volantiniStatus();
  const todis = res.stores.find((s) => s.storeId === 'todis');
  assert.equal(res.ok, false);
  assert.equal(todis?.lastFetchedAt, null);
  assert.equal(todis?.ageHours, null);
  assert.equal(todis?.fresh, false);
});

test('status: estrazione recente ma senza offerte valide NON e’ un successo', async () => {
  // Caso reale: la vision gira, non estrae nulla di utilizzabile e i dati
  // restano vuoti. Guardare solo fetchedAt direbbe "tutto a posto".
  const res = await serviceWith([
    { storeId: 'conad', agoHours: 1, active: 0 },
    { storeId: 'todis', agoHours: 1, active: 10 },
  ]).volantiniStatus();
  assert.equal(res.ok, false);
  assert.equal(res.stores.find((s) => s.storeId === 'conad')?.fresh, false);
});

test('status: volantino quindicinale saltato legittimamente resta fresco a 13 giorni', async () => {
  // Con force=false un volantino ancora valido viene saltato, quindi fetchedAt
  // invecchia: la soglia a 7 giorni avrebbe dato un falso allarme.
  const res = await serviceWith([
    { storeId: 'conad', agoHours: 13 * 24, active: 30 },
    { storeId: 'todis', agoHours: 13 * 24, active: 30 },
  ]).volantiniStatus();
  assert.equal(res.ok, true);
});

test('status: oltre i 14 giorni la pipeline e’ considerata rotta', async () => {
  const res = await serviceWith([
    { storeId: 'conad', agoHours: 15 * 24, active: 30 },
    { storeId: 'todis', agoHours: 2, active: 30 },
  ]).volantiniStatus();
  assert.equal(res.ok, false);
  assert.equal(res.stores.find((s) => s.storeId === 'conad')?.fresh, false);
});

test('status: aiKeyConfigured riflette le env senza esporre la chiave', async () => {
  const rows = [
    { storeId: 'conad', agoHours: 1, active: 5 },
    { storeId: 'todis', agoHours: 1, active: 5 },
  ];
  const senza = await withEnv(
    { GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
    () => serviceWith(rows).volantiniStatus(),
  );
  assert.equal(senza.aiKeyConfigured, false);

  const con = await withEnv({ GEMINI_API_KEY: 'chiave-finta' }, () =>
    serviceWith(rows).volantiniStatus(),
  );
  assert.equal(con.aiKeyConfigured, true);
  assert.equal(JSON.stringify(con).includes('chiave-finta'), false);
});
