export interface StoreSeed {
  id: string;
  name: string;
  brandColor: string;
  /** Distanza di default (km), usata quando manca la posizione del dispositivo. */
  distanceKm: number;
  /** Coordinate reali del punto vendita (per il calcolo distanza dalla posizione utente). */
  lat: number;
  lon: number;
}

/**
 * Punti vendita reali vicino a Spoltore (PE). Le coordinate sono quelle effettive
 * dei negozi; `distanceKm` è la distanza di default da Via Federico Fellini 2
 * (Spoltore), usata solo se il dispositivo non fornisce la posizione.
 */
export const STORES: StoreSeed[] = [
  { id: 'conad', name: 'Conad Superstore', brandColor: '#e2231a', distanceKm: 0.2, lat: 42.45566, lon: 14.17783 },
  { id: 'oasi', name: 'Oasi', brandColor: '#009640', distanceKm: 0.9, lat: 42.45416, lon: 14.18878 },
  { id: 'lidl', name: 'Lidl', brandColor: '#0050aa', distanceKm: 2.4, lat: 42.45658, lon: 14.20751 },
  { id: 'eurospin', name: 'Eurospin', brandColor: '#ff8a00', distanceKm: 3.2, lat: 42.484, lon: 14.188 },
  { id: 'todis', name: 'Todis', brandColor: '#e10098', distanceKm: 3.4, lat: 42.46702, lon: 14.21604 },
  { id: 'tigre', name: 'Tigre', brandColor: '#f5a800', distanceKm: 3.5, lat: 42.42665, lon: 14.16034 },
];

/** Listino di riferimento (€ per kg / l / pz). */
export const PRICES: Record<string, Record<string, number>> = {
  oats: { conad: 3.2, lidl: 2.4, eurospin: 2.6, oasi: 3.0 },
  milk: { conad: 1.4, lidl: 1.1, eurospin: 1.0, todis: 1.2, tigre: 1.3 },
  eggs: { conad: 0.32, lidl: 0.26, eurospin: 0.24, todis: 0.28, oasi: 0.3 },
  chicken: { conad: 9.5, lidl: 7.9, tigre: 8.4, oasi: 8.9 },
  pasta: { conad: 1.6, lidl: 1.1, eurospin: 1.2, todis: 1.3, tigre: 1.4, oasi: 1.5 },
  rice: { conad: 2.8, lidl: 2.1, eurospin: 2.3, todis: 2.5 },
  sauce: { conad: 1.9, lidl: 1.3, eurospin: 1.4, todis: 1.5, oasi: 1.8 },
  oil: { conad: 8.9, lidl: 6.9, tigre: 7.8, oasi: 8.2 },
  apple: { conad: 2.3, lidl: 1.8, eurospin: 1.9, tigre: 2.1, oasi: 2.2 },
  banana: { conad: 1.9, lidl: 1.4, eurospin: 1.5, todis: 1.6 },
  yogurt: { conad: 6.5, lidl: 4.9, eurospin: 5.2, todis: 5.6 },
  tuna: { conad: 14.0, lidl: 10.5, tigre: 12.0, oasi: 12.8 },
  bread: { conad: 3.4, lidl: 2.6, todis: 2.9, tigre: 3.1 },
  salad: { conad: 6.0, lidl: 4.5, eurospin: 4.8, oasi: 5.4 },
  parmesan: { conad: 19.0, lidl: 14.5, tigre: 16.0, oasi: 17.2 },
  almonds: { conad: 16.0, lidl: 12.0, eurospin: 13.0 },
};

export interface PriceRecord {
  foodId: string;
  storeId: string;
  unitPrice: number;
  source: string;
}

/**
 * Prodotto reale (marca) di un provider, con il prezzo della confezione: serve
 * al DETTAGLIO marche in lista (tabella VolantinoProduct), oltre al prezzo
 * aggregato per l'ottimizzatore. `packPrice` è null quando il provider espone
 * solo il prezzo unitario (in quel caso il prodotto alimenta l'ottimizzatore ma
 * non il dettaglio).
 */
export interface ProviderProduct {
  foodId: string;
  storeId: string;
  name: string;
  brand: string | null;
  /** Prezzo confezione, in € (null se non disponibile). */
  packPrice: number | null;
  /** Prezzo normalizzato €/kg · €/l · €/pz. */
  unitPrice: number;
  /** Unità del prezzo normalizzato. */
  baseUnit: 'kg' | 'l' | 'pz';
}

/** Riduce i prodotti al più conveniente per alimento×negozio (prezzo ottimizzatore). */
export function pricesFromProducts(products: ProviderProduct[], source: string): PriceRecord[] {
  const cheapest = new Map<string, ProviderProduct>();
  for (const p of products) {
    // I prodotti fuori dal catalogo staple non servono all'ottimizzatore, che
    // ragiona solo sugli alimenti del piano. Il filtro vive QUI e non nei
    // provider: scartarli all'ingestione li cancellava anche dalla ricerca
    // prodotti, che invece deve vedere tutto cio' che scrapiamo.
    if (p.foodId.startsWith('x-')) continue;
    const key = `${p.foodId}|${p.storeId}`;
    const cur = cheapest.get(key);
    if (!cur || p.unitPrice < cur.unitPrice) cheapest.set(key, p);
  }
  return [...cheapest.values()].map((p) => ({
    foodId: p.foodId,
    storeId: p.storeId,
    unitPrice: p.unitPrice,
    source,
  }));
}

/**
 * Sorgente prezzi sostituibile. Gli adapter reali (siti supermercati →
 * aggregatori) implementano questa interfaccia; il `PriceService` li interroga
 * su schedule e ne persiste i risultati con metadati di freschezza.
 *
 * `fetchProducts` è opzionale: i provider che lo implementano forniscono anche
 * il DETTAGLIO marche (nome/prezzo confezione) salvato in VolantinoProduct; il
 * prezzo aggregato per l'ottimizzatore si deriva con {@link pricesFromProducts}.
 */
export interface PriceProvider {
  readonly name: string;
  fetchPrices(): Promise<PriceRecord[]>;
  fetchProducts?(): Promise<ProviderProduct[]>;
}

/** Provider attivo di default: usa il listino di riferimento. */
export class MockPriceProvider implements PriceProvider {
  readonly name = 'mock';
  async fetchPrices(): Promise<PriceRecord[]> {
    const records: PriceRecord[] = [];
    for (const [foodId, byStore] of Object.entries(PRICES)) {
      for (const [storeId, unitPrice] of Object.entries(byStore)) {
        records.push({ foodId, storeId, unitPrice, source: 'mock' });
      }
    }
    return records;
  }
}

/*
 * Esempio di adapter reale (NON attivo). La strada scelta per affidabilità e
 * conformità: interrogare prima le fonti ufficiali/strutturate dei supermercati
 * (quando disponibili), poi gli aggregatori, rispettando robots.txt e rate
 * limit, salvando ogni prezzo con `source` e `validTo`. Attivare impostando
 * PRICE_PROVIDER e iniettando l'adapter nel PriceService.
 *
 * export class SiteScrapingProvider implements PriceProvider {
 *   readonly name = 'site:conad';
 *   async fetchPrices(): Promise<PriceRecord[]> { ... fetch + parse ... }
 * }
 */
