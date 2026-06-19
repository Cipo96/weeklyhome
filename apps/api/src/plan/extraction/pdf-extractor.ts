import { Logger } from '@nestjs/common';
import { ClaudePdfExtractor } from './claude-extractor.js';
import { GeminiPdfExtractor } from './gemini-extractor.js';
import { MockPdfExtractor } from './mock-extractor.js';
import { geminiModel } from '../../ai/gemini.js';

export interface ExtractedItem {
  foodId: string;
  name?: string;
  value: number;
  unit: string;
  /** Indice dell'alternativa di pasto a cui appartiene (0 = predefinita). */
  optionIndex?: number;
  /** Etichetta opzionale dell'alternativa (es. "Tortino yogurt"). */
  optionLabel?: string;
}

export interface ExtractedMeal {
  day: number;
  type: string;
  items: ExtractedItem[];
}

/** Sorgente di estrazione del piano da PDF (sostituibile). */
export interface PdfExtractor {
  readonly name: string;
  extract(pdf: Buffer): Promise<ExtractedMeal[]>;
}

/**
 * Sceglie l'estrattore: Claude se è configurata `ANTHROPIC_API_KEY`,
 * altrimenti il mock deterministico (così l'app resta usabile senza chiave).
 */
export function createPdfExtractor(): PdfExtractor {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = geminiModel();
    Logger.log(`Estrazione PDF via Gemini (${model})`, 'PdfExtractor');
    return new GeminiPdfExtractor(geminiKey, model);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = process.env.EXTRACTION_MODEL ?? 'claude-opus-4-8';
    Logger.log(`Estrazione PDF via Claude (${model})`, 'PdfExtractor');
    return new ClaudePdfExtractor(anthropicKey, model);
  }
  Logger.warn('Nessuna chiave AI (GEMINI/ANTHROPIC): uso estrattore mock.', 'PdfExtractor');
  return new MockPdfExtractor();
}
