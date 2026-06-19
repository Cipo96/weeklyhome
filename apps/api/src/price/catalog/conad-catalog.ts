import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { PriceProvider, PriceRecord } from '../price-data.js';

const BASE_URL = 'https://spesaonline.conad.it';

/**
 * Mappa categoria → alimento del nostro catalogo. Ogni categoria emette UN solo
 * foodId; un'eventuale `match` filtra per nome quando la categoria contiene più
 * prodotti ma a noi serve un sottoinsieme preciso (es. solo il parmigiano fra i
 * formaggi, solo le mandorle nella frutta secca, solo l'olio d'oliva fra i
 * condimenti). Niente matching a substring globale → niente falsi positivi tipo
 * "Tonno all'olio" classificato come olio.
 */
interface CategoryMap {
  path: string;
  foodId: string;
  /** Se presente, il nome del prodotto deve soddisfarla per essere accettato. */
  match?: RegExp;
  /** Se presente, scarta i nomi che la soddisfano (es. olio di semi fra gli oli). */
  exclude?: RegExp;
  /** Pagine SSR da scorrere (?page=N) quando il prodotto utile non è in prima
   * pagina, es. il parmigiano fra i formaggi. Default 1. */
  pages?: number;
  /** L'alimento si conta a pezzi: il catalogo dà la quantità a peso, quindi il
   * numero di pezzi va letto dal nome (es. "6 Uova", "x 10") → prezzo €/pz. */
  countUnit?: boolean;
}

const CATEGORIES: CategoryMap[] = [
  { path: '/c/pasta-di-semola--1004', foodId: 'pasta' },
  { path: '/c/riso--1005', foodId: 'rice' },
  { path: '/c/latte--0404', foodId: 'milk', match: /\blatte\b/i },
  { path: '/c/yogurt-e-probiotici--0403', foodId: 'yogurt', match: /yogurt/i },
  {
    path: '/c/formaggi--0401',
    foodId: 'parmesan',
    match: /parmigiano|grana\s+padano/i,
    exclude: /formaggin|snack|bocconcin|scaglie/i,
    pages: 3,
  },
  { path: '/c/uova-di-gallina--0406', foodId: 'eggs', match: /uova/i, countUnit: true },
  { path: '/c/carne-di-pollo-e-tacchino--0204', foodId: 'chicken', match: /pollo/i },
  { path: '/c/tonno-e-altro-pesce-conservato--0809', foodId: 'tuna', match: /tonno/i },
  {
    path: '/c/sughi-pronti-passate-pomodoro--0804',
    foodId: 'sauce',
    match: /passata|polpa|pomodor|sugo|sughi/i,
  },
  {
    path: '/c/olio-aceto-condimenti--0801',
    foodId: 'oil',
    match: /olio.*oliva|olio\s+(extra\s?vergine|evo|d['’]oliva)/i,
    exclude: /semi|girasole|arachide|mais|aromatizzat/i,
    pages: 3,
  },
  { path: '/c/frutta-secca--0102', foodId: 'almonds', match: /mandorl/i },
  { path: '/c/prodotti-da-forno--09', foodId: 'bread', match: /pane|pancarr|bauletto|pan\s+carr/i },
];

interface DataProduct {
  nome?: string;
  basePrice?: number;
  netQuantity?: number;
  netQuantityUm?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Estrae il numero di pezzi da un nome tipo "6 Uova…" o "Uova … x 10". */
function pieceCountFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*uova|uova[^0-9]*x?\s*(\d+)|x\s*(\d+)/i);
  const n = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Calcola €/kg | €/l | €/pz da basePrice e quantità netta (con la sua unità). */
function unitPriceFromBase(basePrice: number, qty: number, um: string): number | null {
  if (!(basePrice > 0) || !(qty > 0)) return null;
  switch (um.toUpperCase()) {
    case 'KG':
    case 'LT':
    case 'L':
      return round2(basePrice / qty); // qty già in kg o l
    case 'GR':
    case 'G':
    case 'ML':
      return round2(basePrice / (qty / 1000));
    case 'CL':
      return round2(basePrice / (qty / 100));
    case 'PZ':
    case 'NR':
    case 'CT':
    case 'PE':
      return round2(basePrice / qty);
    default:
      return null;
  }
}

/**
 * Provider prezzi che legge il catalogo e-commerce Conad via HTTP GET.
 * Ogni card di prodotto espone un attributo `data-product` con JSON strutturato
 * (nome, basePrice, netQuantity, netQuantityUm) → niente browser/token/OCR.
 * NB: alcuni prodotti (es. olio EVO, freschi) hanno `basePrice` 0 finché non si
 * fissa un punto vendita: vengono semplicemente saltati (meglio nessun prezzo
 * che un prezzo sbagliato).
 */
export class ConadCatalogProvider implements PriceProvider {
  readonly name = 'conad-online';
  private readonly logger = new Logger(ConadCatalogProvider.name);

  async fetchPrices(): Promise<PriceRecord[]> {
    const cheapest = new Map<string, number>();
    for (const cat of CATEGORIES) {
      try {
        const price = await this.fetchCategory(cat);
        if (price != null) {
          const cur = cheapest.get(cat.foodId);
          if (cur == null || price < cur) cheapest.set(cat.foodId, price);
        }
      } catch (e) {
        this.logger.warn(`Categoria ${cat.path} fallita: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(800);
    }
    const records: PriceRecord[] = [...cheapest.entries()].map(([foodId, unitPrice]) => ({
      foodId,
      storeId: 'conad',
      unitPrice,
      source: 'conad-online',
    }));
    this.logger.log(`Catalogo Conad: ${records.length} alimenti con prezzo.`);
    return records;
  }

  /** Ritorna il prezzo unitario minimo (€/kg|l|pz) per l'alimento della categoria,
   * scorrendo le pagine SSR richieste finché non trova un prezzo valido. */
  private async fetchCategory(cat: CategoryMap): Promise<number | null> {
    let best: number | null = null;
    let kept = 0;
    const pages = Math.max(1, cat.pages ?? 1);
    for (let page = 1; page <= pages; page++) {
      const url = page === 1 ? `${BASE_URL}${cat.path}` : `${BASE_URL}${cat.path}?page=${page}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeeklyHome/0.1',
          'Accept-Language': 'it-IT,it;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const $ = cheerio.load(await res.text());

      $('[data-product]').each((_, el) => {
        let p: DataProduct;
        try {
          p = JSON.parse($(el).attr('data-product') ?? '') as DataProduct;
        } catch {
          return;
        }
        const name = (p.nome ?? '').trim();
        if (!name) return;
        if (cat.match && !cat.match.test(name)) return;
        if (cat.exclude && cat.exclude.test(name)) return;

        const basePrice = Number(p.basePrice ?? 0);
        let unitPrice: number | null;
        if (cat.countUnit) {
          // alimento a pezzi: il catalogo dà il peso, i pezzi sono nel nome
          const count = pieceCountFromName(name);
          unitPrice = count && basePrice > 0 ? round2(basePrice / count) : null;
        } else {
          unitPrice = unitPriceFromBase(
            basePrice,
            Number(p.netQuantity ?? 0),
            String(p.netQuantityUm ?? ''),
          );
        }
        if (unitPrice == null) return;
        kept++;
        if (best == null || unitPrice < best) best = unitPrice;
      });

      if (page < pages) await sleep(400);
    }
    this.logger.log(`  ${cat.path} (${cat.foodId}): ${kept} match, min ${best ?? '—'}.`);
    return best;
  }
}
