import { Logger } from '@nestjs/common';
import { catalogFoodId } from '../../plan/extraction/food-catalog.js';
import {
  pricesFromProducts,
  type PriceProvider,
  type PriceRecord,
  type ProviderProduct,
} from '../price-data.js';

/**
 * Provider offerte Eurospin. Il volantino è un "digital flyer" con API REST
 * strutturata (digitalflyer.eurospin.it): OAuth client-credentials → store →
 * promozione attiva → prodotti con prezzo e prezzo/kg. Niente AI, niente upload.
 * Il volantino è nazionale, quindi lo store scelto è ininfluente sui prezzi.
 */
const SERVER = 'https://digitalflyer.eurospin.it';
const API = `${SERVER}/api/eurospin/eurospin-italia`;
const AUTH_CODE = '850bdb5c-a86d-40b2-a8fb-a7bb61823a24:Interlacedit0';
const DEFAULT_STORE = 'montesilvano-1'; // Eurospin PE, vicino a Spoltore

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface EsProperty {
  code: string;
  values?: (number | string)[];
}
interface EsProduct {
  description?: string;
  properties?: EsProperty[];
}

export class EurospinOffersProvider implements PriceProvider {
  readonly name = 'eurospin-flyer';
  private readonly logger = new Logger(EurospinOffersProvider.name);
  private readonly storeAlias = process.env.EUROSPIN_STORE ?? DEFAULT_STORE;

  async fetchPrices(): Promise<PriceRecord[]> {
    return pricesFromProducts(await this.fetchProducts(), this.name);
  }

  /** Tutti i prodotti in promozione agganciati al catalogo (per il dettaglio marche). */
  async fetchProducts(): Promise<ProviderProduct[]> {
    const token = await this.token();
    const promos = await this.activePromotions(token);
    const products: ProviderProduct[] = [];

    for (const promo of promos) {
      let page = 0;
      for (;;) {
        const j = await this.api(
          `/promotions/${promo}/stores/${this.storeAlias}/products?page=${page}&size=100`,
          token,
        );
        for (const p of (j.elements ?? []) as EsProduct[]) {
          const name = String(p.description ?? this.prop(p, 'TITLE') ?? '').trim();
          if (!name) continue;
          const foodId = catalogFoodId(name);
          if (foodId.startsWith('x-')) continue;
          const product = this.product(p, foodId);
          if (product) products.push(product);
        }
        if (j.last !== false) break;
        page++;
        if (page > 20) break; // guardia
      }
    }

    this.logger.log(`Offerte Eurospin: ${products.length} prodotti da ${promos.length} promozioni.`);
    return products;
  }

  /** Prodotto normalizzato: preferisce il prezzo/kg-lt; altrimenti END-PRICE se venduto a kg/l. */
  private product(p: EsProduct, foodId: string): ProviderProduct | null {
    const name = String(p.description ?? this.prop(p, 'TITLE') ?? '').trim();
    const brand = String(this.prop(p, 'BRAND') ?? '').trim() || null;
    const end = Number(this.prop(p, 'END-PRICE'));
    const packPrice = end > 0 ? round2(end) : null;
    const sell = String(this.prop(p, 'SELL-UNIT') ?? this.prop(p, 'MEASURE-UNIT') ?? '').toUpperCase();
    const baseUnit: 'kg' | 'l' = sell === 'LT' || sell === 'L' ? 'l' : 'kg';

    const kglt = Number(this.prop(p, 'END-KG-LT-PRICE'));
    if (kglt > 0) {
      return { foodId, storeId: 'eurospin', name, brand, packPrice, unitPrice: round2(kglt), baseUnit };
    }
    if (end > 0 && (sell === 'KG' || sell === 'LT' || sell === 'L')) {
      // venduto già a kg/l: END-PRICE è anche il prezzo unitario (confezione = 1)
      return { foodId, storeId: 'eurospin', name, brand, packPrice, unitPrice: round2(end), baseUnit };
    }
    return null; // confezioni "a pezzo" senza prezzo/kg: non normalizzabili in modo affidabile
  }

  private prop(p: EsProduct, code: string): number | string | undefined {
    return p.properties?.find((x) => x.code === code)?.values?.[0];
  }

  private async activePromotions(token: string): Promise<string[]> {
    const j = await this.api(`/stores/${this.storeAlias}/promotions`, token);
    const list: { alias?: string; startDate?: string; endDate?: string }[] = Array.isArray(j)
      ? j
      : (j.elements ?? j.content ?? []);
    const now = Number(
      new Date().toISOString().slice(0, 10).replace(/-/g, '') + '000000',
    );
    return list
      .filter((p) => {
        const s = Number(p.startDate ?? 0);
        const e = Number(p.endDate ?? 0);
        return p.alias && (!e || (s <= now && now <= e));
      })
      .map((p) => p.alias!);
  }

  private async token(): Promise<string> {
    const res = await fetch(`${SERVER}/oauth/token`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Authorization: `Basic ${Buffer.from(AUTH_CODE).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OAuth ${res.status}`);
    const t = (await res.json()) as { access_token?: string };
    if (!t.access_token) throw new Error('token mancante');
    return t.access_token;
  }

  private async api(path: string, token: string): Promise<any> {
    const res = await fetch(`${API}${path}`, {
      headers: { 'User-Agent': UA, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
    return res.json();
  }
}
