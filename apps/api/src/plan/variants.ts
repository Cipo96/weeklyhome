import { Logger } from '@nestjs/common';
import { geminiExtractJson, geminiModel } from '../ai/gemini.js';
import { canonicalFoodId } from './extraction/food-catalog.js';

export interface VariantItem {
  foodId: string;
  name: string;
  value: number;
  unit: string;
}
export interface MealVariant {
  label: string;
  note: string;
  items: VariantItem[];
}

export interface MealItemInput {
  name: string;
  value: number;
  unit: string;
}

const logger = new Logger('MealVariants');

const SYSTEM = `Sei un nutrizionista. Proponi VARIANTI di un pasto mantenendo
calorie e macro (proteine/carboidrati/grassi) il più possibile simili all'originale.
Regole:
- usa alimenti comuni italiani, semplici (es. "Riso", "Petto di pollo", "Yogurt greco");
- unità tra g, kg, ml, l, pz; quantità realistiche e numeriche;
- ogni variante è un pasto ALTERNATIVO completo (non un singolo alimento);
- "label" = nome breve della variante; "note" = perché è equivalente (max ~8 parole);
- NON ripetere identico l'originale.`;

const PROMPT_BASE = `Rispondi SOLO con JSON di questa forma esatta:
{"variants":[{"label":"Riso e tonno","note":"stessi macro, pesce magro","items":[{"name":"Riso","value":80,"unit":"g"},{"name":"Tonno al naturale","value":120,"unit":"g"}]}]}
Proponi 3 varianti.`;

interface RawVariant {
  label?: string;
  note?: string;
  items?: { name?: string; value?: number; unit?: string }[];
}

/**
 * Genera varianti iso-macro di un pasto via AI (chiamata testuale leggera).
 * Richiede GEMINI_API_KEY; senza, lancia (il controller risponde 503).
 */
export async function generateMealVariants(items: MealItemInput[]): Promise<MealVariant[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY non impostata: varianti AI non disponibili.');
  if (items.length === 0) return [];

  const desc = items.map((it) => `${it.name} ${it.value}${it.unit}`).join(', ');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let result: { variants?: RawVariant[] } | undefined;
  for (let a = 1; a <= 3; a++) {
    try {
      result = await geminiExtractJson<{ variants?: RawVariant[] }>({
        apiKey,
        model: geminiModel(),
        system: SYSTEM,
        prompt: `Pasto originale: ${desc}.\n${PROMPT_BASE}`,
        files: [],
      });
      break;
    } catch (e) {
      const msg = String(e);
      if ((msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429')) && a < 3) {
        logger.warn(`Varianti 503/quota (tentativo ${a}), riprovo…`);
        await sleep(2500 * a);
        continue;
      }
      throw e;
    }
  }
  if (!result) return [];

  const variants = (result.variants ?? [])
    .map((v) => ({
      label: (v.label ?? 'Variante').trim(),
      note: (v.note ?? '').trim(),
      items: (v.items ?? [])
        .filter((it) => it.name && Number(it.value) > 0 && it.unit)
        .map((it) => ({
          foodId: canonicalFoodId(it.name!),
          name: it.name!.trim(),
          value: Number(it.value),
          unit: it.unit!,
        })),
    }))
    .filter((v) => v.items.length > 0);

  logger.log(`Generate ${variants.length} varianti per "${desc}".`);
  return variants;
}
