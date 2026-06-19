import { Logger } from '@nestjs/common';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * True se l'errore del provider AI è l'esaurimento della quota GIORNALIERA
 * (Gemini free tier ~20/dì), distinto dal 503 "high demand" o dal 429 per-minuto:
 * non si recupera ritentando, ma solo al reset del giorno → inutile insistere.
 */
export function isDailyQuotaError(e: unknown): boolean {
  return /PerDay|per day|generate_content_free_tier_requests/i.test(String(e));
}

/**
 * Esegue una chiamata AI ritentando sui 503 transitori ("high demand") e sui 429
 * per-minuto, con backoff lineare. NON ritenta sul 429 di quota GIORNALIERA
 * (tetto fisso): fallisce subito per non sprecare i tentativi rimasti.
 */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; label?: string; logger?: Logger } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const logger = opts.logger;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e);
      const transient =
        !isDailyQuotaError(e) &&
        (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429'));
      if (!transient || a === attempts) throw e;
      logger?.warn(
        `${opts.label ?? 'AI'}: 503/quota per-minuto (tentativo ${a}/${attempts}), riprovo…`,
      );
      await sleep(3000 * a);
    }
  }
  // irraggiungibile: l'ultimo tentativo o rilancia o ritorna sopra.
  throw new Error('withAiRetry: tentativi esauriti');
}
