import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  dimensionOf,
  toBase,
  type PriceOffer,
  type ShoppingListRow,
  type Unit,
} from '@weeklyhome/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MockPriceProvider,
  pricesFromProducts,
  STORES,
  type PriceProvider,
  type PriceRecord,
  type ProviderProduct,
} from './price-data.js';
import { isCanonicalCategory } from '../category/taxonomy.js';
import { ConadCatalogProvider } from './catalog/conad-catalog.js';
import { LidlOffersProvider } from './catalog/lidl-offers.js';
import { OasiOffersProvider } from './catalog/oasi-offers.js';
import { EurospinOffersProvider } from './catalog/eurospin-offers.js';
import { catalogFoodId } from '../plan/extraction/food-catalog.js';
import {
  createVolantinoExtractor,
  type ExtractedProduct,
  type VolantinoPage,
} from './volantino/volantino-extractor.js';
import {
  activeFoodVolantini,
  discoverConadVolantini,
} from './volantino/conad-volantino-source.js';
import { downloadYumpuPages, fetchYumpuDoc } from './volantino/yumpu.js';
import { discoverTodisVolantino, downloadPdf } from './volantino/todis-volantino-source.js';
import { CategoryService } from '../category/category.service.js';
import { productMatchesPlanRow } from './offer-match.js';

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // i prezzi valgono 7 giorni
const VOLANTINO_SOURCE_PREFIX = 'volantino:';
/** Pagine max per volantino da inviare alla vision (controllo costo/quota). */
const MAX_VOLANTINO_PAGES = 30;
/**
 * Pagine per chiamata di estrazione. Volutamente ALTO: il free tier Gemini
 * limita a ~20 richieste/giorno, quindi conviene minimizzare il numero di
 * chiamate (un volantino in 1-2 richieste) anziché frammentarlo.
 */
const VOLANTINO_PAGE_CHUNK = 14;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * True se l'errore del provider AI è l'esaurimento della quota GIORNALIERA
 * (Gemini free tier 20/dì), distinto dal 503 "high demand" o dal 429 per-minuto:
 * questo non si recupera ritentando, ma solo al reset del giorno.
 */
function isDailyQuotaError(e: unknown): boolean {
  const m = String(e);
  return /PerDay|per day|generate_content_free_tier_requests/i.test(m);
}

/** Natura di un prezzo per la UI: offerta volantino, listino base, o stima. */
export type OfferKind = 'offerta' | 'listino' | 'stima';

/** Un prodotto reale (marca) in offerta per un alimento in un negozio. */
export interface OfferProduct {
  name: string;
  brand: string | null;
  /** Prezzo confezione, in €. */
  price: number;
  unitPrice: number;
}

/** Offerta arricchita per la lista della spesa (oltre al minimo per l'ottimizzatore). */
export interface EnrichedOffer extends PriceOffer {
  /** Prezzo unitario (€/kg · €/l · €/pz). */
  unitPrice: number;
  source: string;
  kind: OfferKind;
  /** ISO timestamp dell'ultimo aggiornamento del prezzo. */
  fetchedAt: string;
  /** Prodotti reali (marche) in offerta per questo alimento in questo negozio. */
  products?: OfferProduct[];
}

/** Risultato di ricerca prodotti nei volantini (per la sezione "Cerca"). */
export interface ProductSearchResult {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  quantityValue: number;
  quantityUnit: string;
  unitPrice: number;
  storeId: string;
  storeName: string;
  brandColor: string;
  validTo: string | null;
}

/** Sorgenti che rappresentano offerte attive (volantino/promo) vs listino/stima. */
const OFFER_SOURCES = new Set(['lidl-offers', 'oasi-doofinder', 'eurospin-flyer']);
function offerKind(source: string): OfferKind {
  if (source === 'mock') return 'stima';
  if (source.startsWith(VOLANTINO_SOURCE_PREFIX) || OFFER_SOURCES.has(source)) return 'offerta';
  return 'listino';
}

/** Posizione geografica dell'utente (dal dispositivo). */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Distanza in km tra due coordinate (formula dell'emisenoverso / haversine). */
function haversineKm(a: GeoPoint, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

function quantityInPriceUnit(row: ShoppingListRow): number {
  const base = toBase(row.quantity);
  return dimensionOf(row.quantity.unit) === 'count' ? base : base / 1000;
}

/** Converte il prezzo di una voce di volantino in €/kg, €/l o €/pz. */
function computeUnitPrice(p: ExtractedProduct): number | null {
  const unit = p.quantityUnit as Unit;
  const dim = dimensionOf(unit);
  if (!dim) {
    return p.pricePerUnit && p.pricePerUnit > 0 ? round2(p.pricePerUnit) : null;
  }
  const base = toBase({ value: p.quantityValue, unit });
  if (base > 0 && p.price > 0) {
    const value = dim === 'count' ? p.price / base : p.price / (base / 1000);
    return round2(value);
  }
  if (p.pricePerUnit && p.pricePerUnit > 0) return round2(p.pricePerUnit);
  return null;
}

/**
 * Sceglie i provider di refresh in base a PRICE_PROVIDER (lista separata da
 * virgole, es. "conad-catalog,lidl-offers"). Ogni catena è un provider; default
 * il listino mock se nessuno è configurato.
 */
function selectPriceProviders(): PriceProvider[] {
  const which = (process.env.PRICE_PROVIDER ?? 'mock').toLowerCase();
  const providers: PriceProvider[] = [];
  if (which.includes('conad')) providers.push(new ConadCatalogProvider());
  if (which.includes('lidl')) providers.push(new LidlOffersProvider());
  if (which.includes('oasi') || which.includes('tigre')) providers.push(new OasiOffersProvider());
  if (which.includes('eurospin')) providers.push(new EurospinOffersProvider());
  if (providers.length === 0) providers.push(new MockPriceProvider());
  return providers;
}

@Injectable()
export class PriceService implements OnModuleInit {
  private readonly logger = new Logger(PriceService.name);
  private readonly providers: PriceProvider[] = selectPriceProviders();

  constructor(
    private readonly prisma: PrismaService,
    private readonly category: CategoryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    if ((await this.prisma.store.count()) === 0) {
      await this.prisma.store.createMany({ data: STORES });
    }
    if ((await this.prisma.price.count()) === 0) {
      // seed di base sempre col listino mock (boot rapido e offline)
      const baseline = await new MockPriceProvider().fetchPrices();
      await this.applyRecords(baseline);
      this.logger.log(`Seed iniziale: ${baseline.length} prezzi (listino base).`);
    }
  }

  /** Refresh schedulato giornaliero dei prezzi base dal provider attivo. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduledRefresh(): Promise<void> {
    this.logger.log('Refresh prezzi base schedulato…');
    await this.refresh();
  }

  /**
   * Refresh schedulato settimanale delle offerte volantino Conad (la vision AI è
   * costosa e i volantini cambiano ~settimanalmente). Salta in assenza di chiave AI.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async scheduledVolantinoRefresh(): Promise<void> {
    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return;
    this.logger.log('Refresh volantini schedulato…');
    try {
      await this.refreshConadVolantino();
    } catch (e) {
      this.logger.warn(`Refresh volantino Conad fallito: ${e instanceof Error ? e.message : e}`);
    }
    try {
      await this.refreshTodisVolantino();
    } catch (e) {
      this.logger.warn(`Refresh volantino Todis fallito: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Riacquisisce i prezzi base dal provider attivo (catalogo) e li upserta, ma
   * NON tocca gli alimenti che hanno un'offerta volantino ancora valida: il
   * prezzo in offerta ha sempre la priorità sul listino base.
   */
  async refresh(): Promise<{ providers: string[]; updated: number; skippedForOffer: number; fetchedAt: Date }> {
    const protectedFoods = await this.foodsWithActiveOffer();
    const all: PriceRecord[] = [];
    // I provider che espongono fetchProducts forniscono anche il dettaglio marche
    // (VolantinoProduct), oltre al prezzo aggregato per l'ottimizzatore.
    const productSets: { source: string; products: ProviderProduct[] }[] = [];
    for (const provider of this.providers) {
      try {
        if (provider.fetchProducts) {
          const products = await provider.fetchProducts();
          all.push(...pricesFromProducts(products, provider.name));
          productSets.push({ source: provider.name, products });
        } else {
          all.push(...(await provider.fetchPrices()));
        }
      } catch (e) {
        this.logger.warn(`Provider ${provider.name} fallito: ${e instanceof Error ? e.message : e}`);
      }
    }
    const toApply = all.filter((r) => !protectedFoods.has(`${r.foodId}|${r.storeId}`));
    const fetchedAt = await this.applyRecords(toApply);
    for (const { source, products } of productSets) {
      try {
        await this.persistProviderProducts(source, products, fetchedAt);
      } catch (e) {
        this.logger.warn(`Dettaglio marche ${source} fallito: ${e instanceof Error ? e.message : e}`);
      }
    }
    const skipped = all.length - toApply.length;
    const names = this.providers.map((p) => p.name);
    this.logger.log(
      `Aggiornati ${toApply.length} prezzi (provider: ${names.join(', ')}); ${skipped} mantenuti in offerta.`,
    );
    return { providers: names, updated: toApply.length, skippedForOffer: skipped, fetchedAt };
  }

  /**
   * Estrazione con retry sui 503 transitori ("high demand") e sui 429 per-minuto
   * del provider AI. NON ritenta sul 429 di quota GIORNALIERA (free tier 20/dì):
   * è un tetto fisso e ogni tentativo sprecherebbe una delle poche richieste
   * rimaste quando la quota tornerà → fallisce subito (vedi {@link isDailyQuotaError}).
   */
  private async extractWithRetry(
    extractor: ReturnType<typeof createVolantinoExtractor>,
    pages: VolantinoPage[],
    attempts = 3,
  ): Promise<ExtractedProduct[]> {
    for (let a = 1; a <= attempts; a++) {
      try {
        return await extractor.extract(pages);
      } catch (e) {
        const msg = String(e);
        const transient =
          !isDailyQuotaError(e) &&
          (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429'));
        if (!transient || a === attempts) throw e;
        this.logger.warn(`Estrazione 503/quota per-minuto (tentativo ${a}), riprovo…`);
        await sleep(3000 * a);
      }
    }
    return [];
  }

  /** Chiavi `foodId|storeId` con un'offerta volantino non ancora scaduta. */
  private async foodsWithActiveOffer(): Promise<Set<string>> {
    const now = new Date();
    const offers = await this.prisma.price.findMany({
      where: { source: { startsWith: VOLANTINO_SOURCE_PREFIX }, validTo: { gt: now } },
      select: { foodId: true, storeId: true },
    });
    return new Set(offers.map((o) => `${o.foodId}|${o.storeId}`));
  }

  /** True se il negozio ha già offerte volantino fresche (per evitare di sprecare
   * chiamate AI ri-estraendo un volantino già acquisito — il free tier è limitato). */
  private async hasActiveVolantino(storeId: string): Promise<boolean> {
    const count = await this.prisma.price.count({
      where: {
        storeId,
        source: { startsWith: VOLANTINO_SOURCE_PREFIX },
        validTo: { gt: new Date() },
      },
    });
    return count > 0;
  }

  /**
   * Recupero AUTOMATICO delle offerte dal volantino Conad del punto vendita:
   * scopre i volantini attivi dalla pagina dello store → scarica le pagine da
   * Yumpu (immagini pubbliche) → estrae i prezzi con la vision AI → salva il più
   * conveniente per alimento con `source: volantino:conad` e scadenza pari alla
   * validità del volantino. Nessun upload manuale.
   */
  async refreshConadVolantino(
    storeId = 'conad',
    force = false,
  ): Promise<{
    volantini: number;
    extracted: number;
    matched: number;
    foods: string[];
    skipped?: boolean;
  }> {
    if (!force && (await this.hasActiveVolantino(storeId))) {
      this.logger.log('Volantino Conad già aggiornato e valido: estrazione saltata (risparmio quota AI).');
      return { volantini: 0, extracted: 0, matched: 0, foods: [], skipped: true };
    }
    const active = activeFoodVolantini(await discoverConadVolantini());
    const extractor = createVolantinoExtractor();
    const source = `${VOLANTINO_SOURCE_PREFIX}${storeId}`;
    const best = new Map<string, { unitPrice: number; validTo: number }>();
    // Raccogliamo i prodotti estratti (con la validità del loro volantino) e li
    // categorizziamo UNA volta dopo il ciclo, così l'AI di categorizzazione fa al
    // più una chiamata batch per l'intero refresh (risparmio quota).
    const collected: { p: ExtractedProduct; validTo: number }[] = [];
    let extracted = 0;
    let quotaExhausted = false;

    for (const ref of active) {
      if (quotaExhausted) break;
      try {
        const doc = await fetchYumpuDoc(ref.yumpuId);
        const pages = await downloadYumpuPages(doc, MAX_VOLANTINO_PAGES);
        if (pages.length === 0) continue;
        // estrazione a blocchi: payload più piccoli, più robusti a 503/timeout.
        // Ogni blocco è ISOLATO: se un chunk fallisce (503/quota) i prodotti dei
        // blocchi già riusciti — e già pagati in quota — non vengono scartati.
        const products: ExtractedProduct[] = [];
        for (let i = 0; i < pages.length; i += VOLANTINO_PAGE_CHUNK) {
          const chunk = pages.slice(i, i + VOLANTINO_PAGE_CHUNK);
          try {
            products.push(...(await this.extractWithRetry(extractor, chunk)));
          } catch (e) {
            this.logger.warn(
              `Volantino "${ref.title}" blocco pagine ${i + 1}-${i + chunk.length} fallito: ${
                e instanceof Error ? e.message : e
              }`,
            );
            // Quota giornaliera esaurita: ogni chiamata successiva darebbe 429.
            // Interrompo subito (i parziali già estratti restano e vengono salvati).
            if (isDailyQuotaError(e)) {
              this.logger.warn('Quota giornaliera Gemini esaurita: interrompo il refresh volantino Conad.');
              quotaExhausted = true;
              break;
            }
          }
        }
        extracted += products.length;
        for (const p of products) {
          // tutti i prodotti (anche fuori catalogo) finiscono in VolantinoProduct
          collected.push({ p, validTo: ref.validTo });
          // ma solo gli staple alimentano il prezzo "ottimizzatore" (tabella Price)
          const foodId = catalogFoodId(p.name);
          if (foodId.startsWith('x-')) continue;
          const unitPrice = computeUnitPrice(p);
          if (unitPrice == null) continue;
          const cur = best.get(foodId);
          if (!cur || unitPrice < cur.unitPrice) best.set(foodId, { unitPrice, validTo: ref.validTo });
        }
      } catch (e) {
        this.logger.warn(
          `Volantino "${ref.title}" (${ref.yumpuId}) fallito: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    const seed = STORES.find((s) => s.id === storeId);
    await this.prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: seed ?? { id: storeId, name: storeId, brandColor: '#888888', distanceKm: 0 },
    });
    const fetchedAt = new Date();
    for (const [foodId, { unitPrice, validTo }] of best) {
      await this.prisma.price.upsert({
        where: { foodId_storeId: { foodId, storeId } },
        update: { unitPrice, source, fetchedAt, validTo: new Date(validTo) },
        create: { foodId, storeId, unitPrice, source, fetchedAt, validTo: new Date(validTo) },
      });
    }
    const catByName = await this.category.categorizeMany(collected.map((c) => c.p.name));
    const vpRows = collected
      .map((c) =>
        this.vpRow(storeId, source, c.p, new Date(c.validTo), catByName.get(c.p.name) ?? null),
      )
      .filter((r): r is NonNullable<typeof r> => r != null);
    await this.persistVolantinoProducts(storeId, source, vpRows);
    this.logger.log(
      `Volantino Conad: ${active.length} volantini, ${extracted} estratti, ${vpRows.length} prodotti salvati, ${best.size} offerte staple.`,
    );
    return {
      volantini: active.length,
      extracted,
      matched: best.size,
      foods: [...best.keys()],
    };
  }

  /**
   * Recupero AUTOMATICO delle offerte dal volantino Todis (PDF regionale): scopre
   * il volantino della zona dalla REST WP, scarica il PDF e lo estrae con la
   * vision AI. `source: volantino:todis`, scadenza = freschezza standard.
   */
  async refreshTodisVolantino(
    storeId = 'todis',
    force = false,
  ): Promise<{
    title: string | null;
    extracted: number;
    matched: number;
    foods: string[];
    skipped?: boolean;
  }> {
    if (!force && (await this.hasActiveVolantino(storeId))) {
      this.logger.log('Volantino Todis già aggiornato e valido: estrazione saltata (risparmio quota AI).');
      return { title: null, extracted: 0, matched: 0, foods: [], skipped: true };
    }
    const vol = await discoverTodisVolantino();
    if (!vol) return { title: null, extracted: 0, matched: 0, foods: [] };

    const pdf = await downloadPdf(vol.pdfUrl);
    const extractor = createVolantinoExtractor();
    const products = await this.extractWithRetry(extractor, [
      { data: pdf, mediaType: 'application/pdf' },
    ]);

    const validTo = Date.now() + FRESHNESS_MS;
    const source = `${VOLANTINO_SOURCE_PREFIX}${storeId}`;
    const best = new Map<string, { unitPrice: number; validTo: number }>();
    for (const p of products) {
      const foodId = catalogFoodId(p.name);
      if (foodId.startsWith('x-')) continue;
      const unitPrice = computeUnitPrice(p);
      if (unitPrice == null) continue;
      const cur = best.get(foodId);
      if (!cur || unitPrice < cur.unitPrice) best.set(foodId, { unitPrice, validTo });
    }
    const catByName = await this.category.categorizeMany(products.map((p) => p.name));
    const vpRows = products
      .map((p) => this.vpRow(storeId, source, p, new Date(validTo), catByName.get(p.name) ?? null))
      .filter((r): r is NonNullable<typeof r> => r != null);
    await this.saveOffers(storeId, best);
    await this.persistVolantinoProducts(storeId, source, vpRows);
    this.logger.log(
      `Volantino Todis "${vol.title}": ${products.length} estratti, ${vpRows.length} prodotti salvati, ${best.size} offerte staple.`,
    );
    return { title: vol.title, extracted: products.length, matched: best.size, foods: [...best.keys()] };
  }

  /** Salva le offerte (più conveniente per alimento) per un negozio. */
  private async saveOffers(
    storeId: string,
    best: Map<string, { unitPrice: number; validTo: number }>,
  ): Promise<void> {
    const seed = STORES.find((s) => s.id === storeId);
    await this.prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: seed ?? { id: storeId, name: storeId, brandColor: '#888888', distanceKm: 0 },
    });
    const fetchedAt = new Date();
    const source = `${VOLANTINO_SOURCE_PREFIX}${storeId}`;
    for (const [foodId, { unitPrice, validTo }] of best) {
      await this.prisma.price.upsert({
        where: { foodId_storeId: { foodId, storeId } },
        update: { unitPrice, source, fetchedAt, validTo: new Date(validTo) },
        create: { foodId, storeId, unitPrice, source, fetchedAt, validTo: new Date(validTo) },
      });
    }
  }

  /** Costruisce una riga `VolantinoProduct` da un prodotto estratto (null se il
   *  prezzo unitario non è calcolabile). Tiene ANCHE i prodotti fuori catalogo
   *  (foodId `x-…`): servono per il dettaglio marca e la ricerca. */
  private vpRow(
    storeId: string,
    source: string,
    p: ExtractedProduct,
    validTo: Date,
    category: string | null,
  ) {
    const unitPrice = computeUnitPrice(p);
    if (unitPrice == null) return null;
    return {
      storeId,
      source,
      name: p.name.trim(),
      brand: p.brand?.trim() || null,
      price: round2(p.price),
      quantityValue: p.quantityValue,
      quantityUnit: p.quantityUnit,
      unitPrice,
      foodId: catalogFoodId(p.name),
      category,
      validTo,
    };
  }

  /**
   * Salva il DETTAGLIO marche dei provider non-AI (Lidl/Oasi/Eurospin) in
   * VolantinoProduct, così la lista mostra i prodotti reali anche per quei
   * negozi (non solo Conad/Todis). La categoria si deriva GRATIS dal foodId
   * (sono tutti staple → categoria canonica), senza chiamare l'AI. I prodotti
   * senza prezzo confezione (solo €/kg) alimentano l'ottimizzatore ma non il
   * dettaglio, quindi qui vengono saltati.
   */
  private async persistProviderProducts(
    source: string,
    products: ProviderProduct[],
    fetchedAt: Date,
  ): Promise<void> {
    const validTo = new Date(fetchedAt.getTime() + FRESHNESS_MS);
    const byStore = new Map<string, NonNullable<ReturnType<PriceService['vpRow']>>[]>();
    for (const p of products) {
      if (p.packPrice == null || p.packPrice <= 0 || p.unitPrice <= 0) continue;
      const rows = byStore.get(p.storeId) ?? [];
      rows.push({
        storeId: p.storeId,
        source,
        name: p.name.trim(),
        brand: p.brand?.trim() || null,
        price: round2(p.packPrice),
        quantityValue: round2(p.packPrice / p.unitPrice),
        quantityUnit: p.baseUnit,
        unitPrice: round2(p.unitPrice),
        foodId: p.foodId,
        category: isCanonicalCategory(p.foodId) ? p.foodId : null,
        validTo,
      });
      byStore.set(p.storeId, rows);
    }
    for (const [storeId, rows] of byStore) {
      await this.persistVolantinoProducts(storeId, source, rows);
    }
  }

  /** Sostituisce i prodotti volantino di un negozio+sorgente con quelli nuovi. */
  private async persistVolantinoProducts(
    storeId: string,
    source: string,
    rows: NonNullable<ReturnType<PriceService['vpRow']>>[],
  ): Promise<void> {
    await this.prisma.volantinoProduct.deleteMany({ where: { storeId, source } });
    for (let i = 0; i < rows.length; i += 500) {
      await this.prisma.volantinoProduct.createMany({ data: rows.slice(i, i + 500) });
    }
  }

  /**
   * Ricerca prodotti nei volantini (per la sezione "Cerca"): match su nome o
   * marca, solo offerte ancora valide, più economiche prima.
   */
  async searchProducts(q: string, limit = 40): Promise<ProductSearchResult[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const now = new Date();
    const rows = await this.prisma.volantinoProduct.findMany({
      where: {
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        AND: [
          {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { brand: { contains: term, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: { store: true },
      orderBy: { unitPrice: 'asc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      price: r.price,
      quantityValue: r.quantityValue,
      quantityUnit: r.quantityUnit,
      unitPrice: r.unitPrice,
      storeId: r.storeId,
      storeName: r.store.name,
      brandColor: r.store.brandColor,
      validTo: r.validTo ? r.validTo.toISOString() : null,
    }));
  }

  /** Upsert di un insieme di prezzi con metadati di freschezza. */
  private async applyRecords(records: PriceRecord[]): Promise<Date> {
    const fetchedAt = new Date();
    const validTo = new Date(fetchedAt.getTime() + FRESHNESS_MS);
    for (const store of STORES) {
      await this.prisma.store.upsert({
        where: { id: store.id },
        update: {
          name: store.name,
          brandColor: store.brandColor,
          distanceKm: store.distanceKm,
          lat: store.lat,
          lon: store.lon,
        },
        create: store,
      });
    }
    for (const r of records) {
      await this.prisma.price.upsert({
        where: { foodId_storeId: { foodId: r.foodId, storeId: r.storeId } },
        update: { unitPrice: r.unitPrice, source: r.source, fetchedAt, validTo },
        create: {
          foodId: r.foodId,
          storeId: r.storeId,
          unitPrice: r.unitPrice,
          source: r.source,
          fetchedAt,
          validTo,
        },
      });
    }
    return fetchedAt;
  }

  /**
   * Ingestione di un volantino (immagini/PDF): estrae i prezzi con Claude vision,
   * li mappa al catalogo, normalizza in €/unità e li salva (il più economico per
   * alimento). Richiede ANTHROPIC_API_KEY.
   */
  async ingestVolantino(pages: VolantinoPage[], storeId = 'conad') {
    const extractor = createVolantinoExtractor();
    const products = await extractor.extract(pages);

    const byFood = new Map<string, number>();
    for (const p of products) {
      const foodId = catalogFoodId(p.name);
      if (foodId.startsWith('x-')) continue; // non nel catalogo
      const unitPrice = computeUnitPrice(p);
      if (unitPrice == null) continue;
      const current = byFood.get(foodId);
      if (current == null || unitPrice < current) byFood.set(foodId, unitPrice);
    }

    const fetchedAt = new Date();
    const validTo = new Date(fetchedAt.getTime() + FRESHNESS_MS);
    const source = `${VOLANTINO_SOURCE_PREFIX}${storeId}`;
    const seed = STORES.find((s) => s.id === storeId);
    await this.prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: seed ?? { id: storeId, name: storeId, brandColor: '#888888', distanceKm: 0 },
    });
    for (const [foodId, unitPrice] of byFood) {
      await this.prisma.price.upsert({
        where: { foodId_storeId: { foodId, storeId } },
        update: { unitPrice, source, fetchedAt, validTo },
        create: { foodId, storeId, unitPrice, source, fetchedAt, validTo },
      });
    }
    const catByName = await this.category.categorizeMany(products.map((p) => p.name));
    const vpRows = products
      .map((p) => this.vpRow(storeId, source, p, validTo, catByName.get(p.name) ?? null))
      .filter((r): r is NonNullable<typeof r> => r != null);
    await this.persistVolantinoProducts(storeId, source, vpRows);
    this.logger.log(
      `Volantino ${storeId}: ${products.length} estratti, ${vpRows.length} prodotti salvati, ${byFood.size} offerte staple.`,
    );
    return { storeId, extracted: products.length, matched: byFood.size, foods: [...byFood.keys()] };
  }

  /**
   * Negozi entro il raggio. Se è nota la posizione del dispositivo, la distanza
   * è quella REALE (haversine dalle coordinate del negozio); altrimenti si usa
   * la `distanceKm` di default del seed.
   */
  async getStores(radiusKm?: number, user?: GeoPoint) {
    const stores = await this.prisma.store.findMany();
    const withDistance = stores.map((s) => ({
      ...s,
      distanceKm:
        user && s.lat != null && s.lon != null
          ? haversineKm(user, { lat: s.lat, lon: s.lon })
          : s.distanceKm,
    }));
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    return radiusKm ? withDistance.filter((s) => s.distanceKm <= radiusKm) : withDistance;
  }

  /**
   * Offerte (alimento × negozio) per la lista, considerando solo i negozi entro
   * il raggio e i prezzi ancora freschi (`validTo` futuro). Ogni offerta porta
   * la fonte e la natura (offerta volantino / listino / stima) e il prezzo
   * unitario, così la lista della spesa può distinguerle.
   */
  async buildOffers(
    list: ReadonlyArray<ShoppingListRow & { name?: string | null; category?: string | null }>,
    radiusKm?: number,
    user?: GeoPoint,
  ): Promise<EnrichedOffer[]> {
    const now = new Date();
    const stores = await this.getStores(radiusKm, user);
    const storeIds = new Set(stores.map((s) => s.id));
    const foodIds = list.map((r) => r.foodId);
    const categories = [...new Set(list.map((r) => r.category).filter((c): c is string => !!c))];
    const qtyByFood = new Map(list.map((r) => [r.foodId, quantityInPriceUnit(r)]));

    const prices = await this.prisma.price.findMany({ where: { foodId: { in: foodIds } } });
    // I prodotti volantino estendono la copertura agli alimenti fuori catalogo
    // (id `x-…`, che nella tabella Price non ci sono) e portano marca/prezzo reali.
    // Match per foodId OPPURE per categoria (così "Marmellata"/"Frutta secca"
    // agganciano i prodotti della stessa categoria/macro-gruppo).
    const vps = await this.prisma.volantinoProduct.findMany({
      where: {
        AND: [
          { OR: [{ foodId: { in: foodIds } }, { category: { in: categories } }] },
          { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        ],
      },
    });

    // Offerta per l'ottimizzatore: la più conveniente per alimento×negozio.
    const byKey = new Map<string, EnrichedOffer>();
    const consider = (
      foodId: string,
      storeId: string,
      unitPrice: number,
      source: string,
      fetchedAt: Date | null,
    ): void => {
      if (!storeIds.has(storeId)) return;
      const u = round2(unitPrice);
      const key = `${foodId}|${storeId}`;
      const cur = byKey.get(key);
      if (cur && cur.unitPrice <= u) return;
      const qty = qtyByFood.get(foodId) ?? 0;
      byKey.set(key, {
        foodId,
        storeId,
        unitPrice: u,
        price: round2(u * qty),
        source,
        kind: offerKind(source),
        fetchedAt: (fetchedAt ?? now).toISOString(),
        products: cur?.products,
      });
    };

    for (const p of prices) {
      if (p.validTo && p.validTo < now) continue;
      consider(p.foodId, p.storeId, p.unitPrice, p.source, p.fetchedAt ?? null);
    }

    // Marche in offerta per alimento×negozio (più prodotti nello stesso negozio).
    // Ogni prodotto viene attribuito alla/e riga/righe del piano che matcha (per
    // categoria o foodId), così l'offerta resta indicizzata sul foodId del piano
    // (l'ottimizzatore lavora su quei foodId).
    const productsByKey = new Map<string, OfferProduct[]>();
    for (const vp of vps) {
      if (!storeIds.has(vp.storeId)) continue;
      for (const row of list) {
        if (!productMatchesPlanRow(row.foodId, row.name ?? null, row.category ?? null, vp.foodId, vp.category))
          continue;
        const key = `${row.foodId}|${vp.storeId}`;
        const arr = productsByKey.get(key) ?? [];
        arr.push({ name: vp.name, brand: vp.brand, price: round2(vp.price), unitPrice: round2(vp.unitPrice) });
        productsByKey.set(key, arr);
        consider(row.foodId, vp.storeId, vp.unitPrice, vp.source, vp.fetchedAt ?? null);
      }
    }
    for (const [key, arr] of productsByKey) {
      const offer = byKey.get(key);
      if (offer) {
        arr.sort((a, b) => a.unitPrice - b.unitPrice);
        offer.products = arr;
      }
    }

    return [...byKey.values()];
  }
}
