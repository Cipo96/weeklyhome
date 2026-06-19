import { Logger } from '@nestjs/common';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
const logger = new Logger('ConadVolantinoSource');

/** Pagina del punto vendita Conad di Spoltore (PE) — store 009890. */
export const CONAD_SPOLTORE_STORE_URL =
  'https://www.conad.it/ricerca-negozi/conad-superstore-via-federico-fellini-2-65010-spoltore--009890';

export interface VolantinoRef {
  yumpuId: string;
  title: string;
  slug: string;
  validFrom: number;
  validTo: number;
  promotions: string;
}

/** Titoli che NON sono volantini di prodotti alimentari (polizze, carte, servizi). */
const NON_FOOD = /polizza|assicur|carrello assicurato|conad card|carta|mobilit|carburant|petfood-no|catalogo mondo|profum|bellezza|cosmes/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");
}

/**
 * Scopre i volantini di un punto vendita Conad leggendo i dati strutturati
 * incorporati nella pagina dello store (campo `yumpuId` + validità). Nessun
 * upload: l'ID Yumpu del volantino cambia ogni settimana ma la pagina dello
 * store elenca sempre quelli correnti, quindi il recupero resta automatico.
 */
export async function discoverConadVolantini(
  storeUrl: string = CONAD_SPOLTORE_STORE_URL,
): Promise<VolantinoRef[]> {
  const res = await fetch(storeUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Store Conad: HTTP ${res.status}`);
  const html = decodeEntities(await res.text());

  const re =
    /"title":"([^"]*)","slug":"([^"]*)","validFrom":(\d+),"validTo":(\d+)[^}]*?"yumpuId":"([0-9]+)"[^}]*?"promotions":"([^"]*)"/g;
  const refs: VolantinoRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, title, slug, validFrom, validTo, yumpuId, promotions] = m;
    if (seen.has(yumpuId)) continue;
    seen.add(yumpuId);
    refs.push({
      yumpuId,
      title,
      slug,
      validFrom: Number(validFrom),
      validTo: Number(validTo),
      promotions,
    });
  }
  logger.log(`Store Conad: trovati ${refs.length} volantini.`);
  return refs;
}

/** Filtra i volantini attivi (oggi nel range di validità) e a tema alimentare. */
export function activeFoodVolantini(refs: VolantinoRef[], now = Date.now()): VolantinoRef[] {
  return refs.filter(
    (r) => now >= r.validFrom && now <= r.validTo && !NON_FOOD.test(r.title),
  );
}
