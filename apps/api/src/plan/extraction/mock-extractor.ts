import type { ExtractedMeal, PdfExtractor } from './pdf-extractor.js';
import { buildSampleMeals } from '../sample-plan.js';

/** Estrattore mock: ignora il PDF e restituisce il piano di esempio. */
export class MockPdfExtractor implements PdfExtractor {
  readonly name = 'mock';
  async extract(_pdf: Buffer): Promise<ExtractedMeal[]> {
    return buildSampleMeals().map((m) => ({
      day: m.day,
      type: m.type,
      items: m.items.map((it) => ({ foodId: it.foodId, value: it.value, unit: it.unit })),
    }));
  }
}
