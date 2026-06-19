import { Logger } from '@nestjs/common';
import type { VolantinoPage } from './volantino-extractor.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeeklyHome/0.1';
const logger = new Logger('Yumpu');

export interface YumpuDoc {
  id: string;
  title: string;
  owner?: string;
  pageCount: number;
  /** Dimensione immagine più grande disponibile (es. "1250x1183"). */
  bestDimension: string;
}

interface YumpuJson {
  document?: {
    title?: string;
    pages?: unknown[];
    images?: { dimensions?: Record<string, string> };
  };
  user?: { username?: string };
}

/** Legge i metadati pubblici di un documento Yumpu (niente token). */
export async function fetchYumpuDoc(id: string): Promise<YumpuDoc> {
  const res = await fetch(`https://www.yumpu.com/it/document/json/${id}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Yumpu doc ${id}: HTTP ${res.status}`);
  const j = (await res.json()) as YumpuJson;
  const d = j.document;
  if (!d?.pages?.length) throw new Error(`Yumpu doc ${id}: nessuna pagina`);
  const dims = d.images?.dimensions ?? {};
  const bestDimension = dims.big ?? dims.small ?? dims.thumb ?? '1130x1600';
  return {
    id,
    title: d.title ?? id,
    owner: j.user?.username,
    pageCount: d.pages.length,
    bestDimension,
  };
}

/** URL pubblico dell'immagine di una pagina (la parte filename è arbitraria). */
export function yumpuPageUrl(id: string, page: number, dimension: string): string {
  return `https://img.yumpu.com/${id}/${page}/${dimension}/page.jpg`;
}

/**
 * Scarica le pagine di un documento Yumpu come immagini JPEG pronte per la vision.
 * `maxPages` limita il numero di pagine (per costo/quota dell'estrazione AI).
 */
export async function downloadYumpuPages(
  doc: YumpuDoc,
  maxPages = doc.pageCount,
): Promise<VolantinoPage[]> {
  const total = Math.min(doc.pageCount, maxPages);
  const pages: VolantinoPage[] = [];
  for (let p = 1; p <= total; p++) {
    try {
      const res = await fetch(yumpuPageUrl(doc.id, p, doc.bestDimension), {
        headers: { 'User-Agent': UA, Accept: 'image/jpeg,*/*' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        logger.warn(`Pagina ${p}/${total} doc ${doc.id}: HTTP ${res.status}`);
        continue;
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length > 0 && data[0] === 0xff && data[1] === 0xd8) {
        pages.push({ data, mediaType: 'image/jpeg' });
      }
    } catch (e) {
      logger.warn(`Pagina ${p} doc ${doc.id} fallita: ${e instanceof Error ? e.message : e}`);
    }
  }
  logger.log(`Doc ${doc.id} "${doc.title}": scaricate ${pages.length}/${total} pagine.`);
  return pages;
}
