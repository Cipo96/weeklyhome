import { Logger } from '@nestjs/common';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
const logger = new Logger('TodisVolantinoSource');

/** Regione del volantino Todis pertinente al PV dell'utente (Spoltore, PE). */
export const TODIS_DEFAULT_REGION = /abruzzo/i;

/**
 * Volantini di REPARTO specializzato (banco pesce/carne/enoteca…): Todis li
 * pubblica per la stessa regione e con la stessa data del volantino generale,
 * ma contengono pochissimi staple grocery. Vanno esclusi, altrimenti a parità
 * di `modified_gmt` il tie può risolversi su di essi al posto del volantino
 * principale (es. "Abruzzo Marche Molise Pescheria" vs "Abruzzo Marche Molise").
 */
const TODIS_SPECIALTY = /pescheria|macelleria|gastronomia|enoteca|panetteria|ortofrutta/i;

/**
 * Volantini NON settimanali. "Bassi e Bloccati" e' il listino a prezzi bloccati:
 * un catalogo di lungo periodo che Todis ritocca di continuo, quindi ordinando
 * per `modified_gmt` vince quasi sempre sul volantino settimanale delle offerte
 * — che e' invece quello che ci serve. Stesso problema di TODIS_SPECIALTY, altra
 * forma: il post piu' recente non e' il volantino piu' pertinente.
 */
const TODIS_NON_SETTIMANALE = /bassi\s*e\s*bloccati|prezzi\s*bloccati|sempre\s*bassi/i;

/** Titolo leggibile di un post volantino (WP lo restituisce con markup). */
export function volantinoTitle(post: WpVolantino): string {
  return (post.title?.rendered ?? '').replace(/<[^>]+>/g, '').trim();
}

/**
 * Sceglie il volantino settimanale della regione fra i post WP. Pura di
 * proposito: e' la logica che decide QUALE documento paghiamo di estrazione AI,
 * e va testabile senza toccare la rete.
 */
export function selectTodisVolantino(
  posts: WpVolantino[],
  region: RegExp = TODIS_DEFAULT_REGION,
): WpVolantino | null {
  const candidates = posts
    .filter((p) => {
      const title = volantinoTitle(p);
      return (
        region.test(title) && !TODIS_SPECIALTY.test(title) && !TODIS_NON_SETTIMANALE.test(title)
      );
    })
    .sort((a, b) => Date.parse(b.modified_gmt ?? '') - Date.parse(a.modified_gmt ?? ''));
  return candidates[0] ?? null;
}

export interface TodisVolantino {
  id: number;
  title: string;
  pdfUrl: string;
  modified: number;
}

export interface WpVolantino {
  id: number;
  modified_gmt?: string;
  title?: { rendered?: string };
  link?: string;
}

/**
 * Scopre il volantino Todis corrente per regione. Todis pubblica i volantini come
 * custom post type WP (`/wp-json/wp/v2/volantini`) e ognuno renderizza un PDF
 * (dFlip) nella propria pagina. Selezioniamo il post regionale aggiornato più di
 * recente e ne estraiamo l'URL del PDF. Nessun upload.
 */
export async function discoverTodisVolantino(
  region: RegExp = TODIS_DEFAULT_REGION,
): Promise<TodisVolantino | null> {
  const res = await fetch('https://www.todis.it/wp-json/wp/v2/volantini?per_page=50', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Todis volantini: HTTP ${res.status}`);
  const posts = (await res.json()) as WpVolantino[];

  const post = selectTodisVolantino(posts, region);
  if (!post) {
    logger.warn(`Nessun volantino Todis settimanale per la regione ${region}.`);
    return null;
  }

  const title = volantinoTitle(post);
  const pdfUrl = post.link ? await extractPdfUrl(post.link) : null;
  if (!pdfUrl) {
    logger.warn(`Volantino Todis "${title}" senza PDF individuabile.`);
    return null;
  }
  logger.log(`Volantino Todis: "${title}" → ${pdfUrl}`);
  return { id: post.id, title, pdfUrl, modified: Date.parse(post.modified_gmt ?? '') || Date.now() };
}

/** Estrae l'URL del PDF dalla pagina front-end del volantino (flipbook dFlip). */
async function extractPdfUrl(pageUrl: string): Promise<string | null> {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/https:\/\/www\.todis\.it\/wp-content\/uploads\/[^"'<> )]+\.pdf/i);
  return m ? m[0] : null;
}

/** Scarica il PDF del volantino come buffer. */
export async function downloadPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`PDF ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
