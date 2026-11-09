import { Logger } from '@nestjs/common';
import { catalogFoodId } from '../../plan/extraction/food-catalog.js';
import {
  pricesFromProducts,
  type PriceProvider,
  type PriceRecord,
  type ProviderProduct,
} from '../price-data.js';

const HOME = 'https://www.lidl.it/';
const BASE = 'https://www.lidl.it';

/** Slug delle raccolte offerte a tema alimentare (le altre — moda, fai-da-te,
 * casa, giocattoli — vengono ignorate). Il filtro categoria "Food" sul singolo
 * prodotto resta comunque la rete di sicurezza. */
const FOOD_SLUG =
  /frutta-e-verdura|carne-e-pesce|super-offerte|inflazione-zero|italiamo|mega-offerte|food-festival|grandi-marche|el-tequito|latticini|colazione|dispensa|bevande|surgelat|pane|dolc|sottocosto|deluxe|favorina/i;

interface LidlCurrentPrice {
  price?: number;
  endDate?: string;
  basePrice?: { text?: string };
  packaging?: { text?: string };
}
interface LidlGrid {
  title?: string;
  fullTitle?: string;
  category?: string;
  havingPrice?: boolean;
  regionsPrices?: Record<string, { currentPrice?: LidlCurrentPrice }>;
}

/**
 * Categorie alimentari nel `data-grid-data`. Lidl marca la frutta e verdura come
 * "F+V", NON come "Food": confrontare con la sola stringa 'Food' escludeva il
 * 100% dell'ortofrutta, che quindi non e' mai finita in database.
 */
const LIDL_FOOD_CATEGORY = /^(food|f\+v)$/i;

/** Esportata per i test: e' il predicato che ha escluso l'ortofrutta per mesi. */
export function isLidlFoodCategory(category: string | undefined): boolean {
  return !category || LIDL_FOOD_CATEGORY.test(category);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * €/kg | €/l | €/pz per un prodotto Lidl, da basePrice (pronto) o da
 * prezzo+confezione, con l'unità di riferimento. null se non normalizzabile.
 */
/**
 * Confezioni "sfuse": l'ortofrutta venduta a peso non porta una quantita' nel
 * testo ("Al kg"), quindi il parsing numerico falliva e il prodotto veniva
 * scartato — sparendo anche dalla ricerca. In questi casi il prezzo esposto E'
 * gia' quello unitario, quindi non c'e' nulla da dividere.
 */
const LIDL_SFUSO = /\bal(?:la)?\s+(kg|chilo|kilo|litro|l|pezzo|pz|confezione)\b/i;

export function lidlPack(cp: LidlCurrentPrice): {
  unitPrice: number;
  baseUnit: 'kg' | 'l' | 'pz';
} | null {
  if (!(typeof cp.price === 'number' && cp.price > 0)) return null;

  // 1) basePrice già calcolato da Lidl: "1 kg = 27.38 €" / "1 l = 5.00 €"
  const bp = cp.basePrice?.text;
  if (bp) {
    const m = bp.match(/1\s*(kg|l)\s*=\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (m) {
      return {
        unitPrice: round2(parseFloat(m[2].replace(',', '.'))),
        baseUnit: m[1].toLowerCase() === 'kg' ? 'kg' : 'l',
      };
    }
  }

  // 2) fallback: dalla confezione (es. "80 g confezione", "4x 80 g", "1 l bottiglia", "6 pz")
  const pack = cp.packaging?.text;
  if (pack) {
    const mult = pack.match(/(\d+)\s*x\s*([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|l|ml|cl)/i);
    const single = pack.match(/([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|l|ml|cl)\b/i);
    const pieces = pack.match(/(\d+)\s*(pz|pezzi|piece|x\b)/i);
    let grams = 0,
      millil = 0;
    const toG = (v: number, u: string) =>
      u === 'kg' ? v * 1000 : u === 'g' ? v : 0;
    const toMl = (v: number, u: string) =>
      u === 'l' ? v * 1000 : u === 'ml' ? v : u === 'cl' ? v * 10 : 0;
    if (mult) {
      const n = Number(mult[1]);
      const v = parseFloat(mult[2].replace(',', '.'));
      grams = n * toG(v, mult[3].toLowerCase());
      millil = n * toMl(v, mult[3].toLowerCase());
    } else if (single) {
      const v = parseFloat(single[1].replace(',', '.'));
      grams = toG(v, single[2].toLowerCase());
      millil = toMl(v, single[2].toLowerCase());
    }
    if (grams > 0) return { unitPrice: round2(cp.price / (grams / 1000)), baseUnit: 'kg' };
    if (millil > 0) return { unitPrice: round2(cp.price / (millil / 1000)), baseUnit: 'l' };
    if (pieces) {
      const n = Number(pieces[1]);
      if (n > 0) return { unitPrice: round2(cp.price / n), baseUnit: 'pz' };
    }

    // 3) sfuso a peso/volume/pezzo: il prezzo mostrato e' gia' quello unitario.
    const sfuso = pack.match(LIDL_SFUSO);
    if (sfuso) {
      const u = sfuso[1].toLowerCase();
      const baseUnit = u === 'l' || u === 'litro' ? 'l' : u.startsWith('k') || u === 'chilo' ? 'kg' : 'pz';
      return { unitPrice: round2(cp.price), baseUnit };
    }
  }
  return null;
}

/**
 * Provider delle OFFERTE Lidl: le pagine raccolta (`/c/...-kw-NN-AA/...`) sono
 * SSR e incorporano i prodotti in attributi `data-grid-data` con prezzo, prezzo
 * base (€/kg) e validità. Niente AI, niente token, niente upload.
 */
export class LidlOffersProvider implements PriceProvider {
  readonly name = 'lidl-offers';
  private readonly logger = new Logger(LidlOffersProvider.name);

  async fetchPrices(): Promise<PriceRecord[]> {
    return pricesFromProducts(await this.fetchProducts(), this.name);
  }

  /** Tutti i prodotti in offerta agganciati al catalogo (per il dettaglio marche). */
  async fetchProducts(): Promise<ProviderProduct[]> {
    const pages = await this.discoverFoodPages();
    const products: ProviderProduct[] = [];
    const now = Date.now();
    for (const path of pages) {
      try {
        const html = await this.get(`${BASE}${path}`);
        for (const m of html.matchAll(/data-grid-data="([^"]+)"/g)) {
          let o: LidlGrid;
          try {
            o = JSON.parse(decodeEntities(m[1])) as LidlGrid;
          } catch {
            continue;
          }
          if (!o.havingPrice || !isLidlFoodCategory(o.category)) continue;
          const cp = Object.values(o.regionsPrices ?? {})[0]?.currentPrice;
          if (!cp) continue;
          if (cp.endDate && Date.parse(cp.endDate) < now) continue; // offerta scaduta
          const name = (o.title ?? o.fullTitle ?? '').trim();
          if (!name) continue;
          // Niente filtro sul catalogo staple: i prodotti fuori catalogo servono
          // alla ricerca prodotti. L'ottimizzatore li scarta in pricesFromProducts.
          const foodId = catalogFoodId(name);
          const pack = lidlPack(cp);
          if (pack == null) continue;
          products.push({
            foodId,
            storeId: 'lidl',
            name,
            brand: null,
            packPrice: typeof cp.price === 'number' ? cp.price : null,
            unitPrice: pack.unitPrice,
            baseUnit: pack.baseUnit,
          });
        }
      } catch (e) {
        this.logger.warn(`Pagina ${path} fallita: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(500);
    }
    this.logger.log(`Offerte Lidl: ${products.length} prodotti da ${pages.length} pagine.`);
    return products;
  }

  /** Scopre le pagine raccolta offerte a tema alimentare dalla home Lidl. */
  private async discoverFoodPages(): Promise<string[]> {
    const html = await this.get(HOME);
    const all = new Set<string>();
    for (const m of html.matchAll(/\/c\/(?:store\/)?[a-z0-9-]+-kw-\d+-\d+\/[as]\d+/gi)) {
      if (FOOD_SLUG.test(m[0])) all.add(m[0]);
    }
    return [...all];
  }

  private async get(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}
