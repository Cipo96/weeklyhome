import { Logger } from '@nestjs/common';
import { catalogFoodId } from '../../plan/extraction/food-catalog.js';
import {
  pricesFromProducts,
  type PriceProvider,
  type PriceRecord,
  type ProviderProduct,
} from '../price-data.js';

/**
 * Provider Oasi/Tigre (Gruppo Gabrielli). I prezzi del catalogo + volantino sono
 * indicizzati su Doofinder con i prezzi PER NEGOZIO: `priceValue<storeId>` (base)
 * e `pricePromoValue<storeId>` (offerta) + validità promo. Niente AI.
 *
 * NB: il punto vendita di Spoltore (566) non fa e-commerce → non è nell'indice;
 * usiamo come riferimento di zona lo store Oasi indicizzato più vicino
 * (410 = Oasi Montesilvano, stessa insegna e provincia, ~10 km). Le promo sono
 * regionali, quindi i prezzi sono rappresentativi.
 */
const DOOFINDER_BASE = 'https://eu1-search.doofinder.com/6';
const DEFAULT_HASHID = '45775f4f6633e3a77192e0993ccf9eb7';
const DEFAULT_STORE = '410';

/** Query mirate → foodId atteso (si accettano solo i risultati che mappano lì,
 * per evitare contaminazioni tipo "risoni"→rice o "tonno e riso"→tuna). */
const QUERIES: { q: string; food: string }[] = [
  { q: 'latte', food: 'milk' },
  { q: 'pasta di semola', food: 'pasta' },
  { q: 'riso', food: 'rice' },
  { q: 'tonno', food: 'tuna' },
  { q: 'petto di pollo', food: 'chicken' },
  { q: 'yogurt', food: 'yogurt' },
  { q: 'parmigiano reggiano', food: 'parmesan' },
  { q: 'olio extra vergine oliva', food: 'oil' },
  { q: 'pane', food: 'bread' },
  { q: 'passata di pomodoro', food: 'sauce' },
  { q: 'mandorle', food: 'almonds' },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DoofResult {
  title?: string;
  brand?: string;
  qty?: number | string;
  unitMeasure?: string;
  [field: string]: unknown;
}

export class OasiOffersProvider implements PriceProvider {
  readonly name = 'oasi-doofinder';
  private readonly logger = new Logger(OasiOffersProvider.name);
  private readonly hashId = process.env.OASI_DOOFINDER_HASHID ?? DEFAULT_HASHID;
  private readonly storeId = process.env.OASI_STORE_ID ?? DEFAULT_STORE;

  async fetchPrices(): Promise<PriceRecord[]> {
    return pricesFromProducts(await this.fetchProducts(), this.name);
  }

  /** Tutti i prodotti agganciati al catalogo (per il dettaglio marche). */
  async fetchProducts(): Promise<ProviderProduct[]> {
    const now = Date.now();
    const products: ProviderProduct[] = [];
    for (const { q, food } of QUERIES) {
      try {
        const results = await this.search(q);
        for (const r of results) {
          if (catalogFoodId(String(r.title ?? '')) !== food) continue; // vincolo foodId
          const p = this.product(r, food, now);
          if (p) products.push(p);
        }
      } catch (e) {
        this.logger.warn(`Query "${q}" fallita: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(300);
    }
    this.logger.log(`Oasi/Tigre (store ${this.storeId}): ${products.length} prodotti.`);
    return products;
  }

  /** Prodotto normalizzato (€/kg|€/l) per lo store di riferimento, promo se attiva. */
  private product(r: DoofResult, food: string, now: number): ProviderProduct | null {
    const s = this.storeId;
    const base = r[`priceValue${s}`] as number | undefined;
    const promo = r[`pricePromoValue${s}`] as number | undefined;
    const end = r[`promodtEnd${s}`] as string | undefined;
    const promoActive = typeof promo === 'number' && promo > 0 && (!end || Date.parse(end) >= now);
    const price = promoActive ? promo! : typeof base === 'number' ? base : NaN;
    if (!(price > 0)) return null;

    // normalizziamo solo peso/volume con quantità nota (no pesi variabili)
    const um = String(r.unitMeasure ?? '').toUpperCase();
    const qty = Number(r.qty);
    if (!(qty > 0)) return null;
    if (um !== 'KG' && um !== 'LT' && um !== 'L') return null;
    return {
      foodId: food,
      storeId: 'oasi',
      name: String(r.title ?? '').trim(),
      brand: r.brand?.trim() || null,
      packPrice: round2(price),
      unitPrice: round2(price / qty),
      baseUnit: um === 'KG' ? 'kg' : 'l',
    };
  }

  private async search(query: string): Promise<DoofResult[]> {
    const url = `${DOOFINDER_BASE}/${this.hashId}/_search?query=${encodeURIComponent(query)}&rpp=30`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
        Accept: 'application/json',
        Origin: 'https://www.oasitigre.it',
        Referer: 'https://www.oasitigre.it/',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { results?: DoofResult[] };
    return j.results ?? [];
  }
}
