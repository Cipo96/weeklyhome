import { Logger } from '@nestjs/common';
import { geminiExtractJson, geminiModel } from '../ai/gemini.js';
import { CANONICAL_CATEGORIES, isCanonicalCategory } from './taxonomy.js';

const logger = new Logger('AiCategorizer');

const SYSTEM = `Sei un classificatore di nomi di prodotti/alimenti italiani.
Ricevi una lista di nomi e una lista CHIUSA di categorie ammesse.
Per ogni nome scegli la categoria più adatta SOLO da quelle ammesse, ragionando
per ingrediente principale (es. "Frittata" → eggs, "Cappuccino" → milk) e per
macro-gruppo (es. "Noci" → frutta-secca). Se nessuna categoria calza, usa null.
Rispondi SOLO con JSON: { "items": [ { "name": "<nome esatto>", "category": "<slug|null>" } ] }`;

interface AiOut {
  items?: Array<{ name?: string; category?: string | null }>;
}

/**
 * Categorizza i nomi via Gemini scegliendo dalla tassonomia chiusa. Restituisce
 * una mappa vuota se manca la chiave o in caso di errore/quota: i chiamanti
 * trattano i miss come `null` (fallback x-slug), nessun crash.
 */
export async function aiCategorize(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || names.length === 0) return out;
  const allowed = [...CANONICAL_CATEGORIES].join(', ');
  const prompt = `Categorie ammesse: ${allowed}\nNomi da classificare:\n${names
    .map((n) => `- ${n}`)
    .join('\n')}`;
  try {
    const res = await geminiExtractJson<AiOut>({
      apiKey,
      model: geminiModel(),
      system: SYSTEM,
      prompt,
      files: [],
    });
    for (const it of res.items ?? []) {
      if (!it.name) continue;
      const cat = it.category && isCanonicalCategory(it.category) ? it.category : null;
      out.set(it.name, cat);
    }
  } catch (e) {
    logger.warn(`Categorizzazione AI fallita: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}
