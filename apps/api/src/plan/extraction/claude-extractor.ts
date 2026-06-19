import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { ExtractedMeal, PdfExtractor } from './pdf-extractor.js';
import { mealsFromRaw, type RawMeal } from './options.js';

const SYSTEM_PROMPT = `Sei un estrattore di piani alimentari settimanali da PDF.
Ricevi un PDF (anche con layout variabile) e devi restituire la struttura del piano
chiamando lo strumento "save_plan".

Regole:
- Copri tutti i giorni presenti (day: 0=lunedì ... 6=domenica).
- I pasti hanno type tra: BREAKFAST, MORNING_SNACK, LUNCH, AFTERNOON_SNACK, DINNER.
  MORNING_SNACK = spuntino di metà mattina, AFTERNOON_SNACK = merenda del pomeriggio:
  sono pasti DISTINTI, distinguili dal momento della giornata (mai unirli in uno solo).
- Per ogni alimento estrai nome, quantità numerica e unità tra: g, kg, ml, l, pz.
- Converti porzioni testuali in numeri quando possibile (es. "2 uova" -> value 2, unit pz).
- Per alimenti SPALMABILI o MISURABILI (marmellata, miele, olio, yogurt, latte, carne, pesce,
  formaggi) usa SEMPRE g o ml, MAI "pz". Usa "pz" solo per ciò che è davvero a pezzi interi
  (uova, frutta intera, fette biscottate, gallette). Lo stesso alimento deve avere un'unità
  COERENTE in tutto il piano (non "marmellata 10 g" un giorno e "marmellata 1 pz" un altro).
- Usa nomi di alimenti semplici e in italiano (es. "Pasta", "Petto di pollo").
- Ogni pasto ha una lista "options" (alternative). Se il pasto offre più ALTERNATIVE
  ("oppure", "O", "/"), restituiscile TUTTE come elementi distinti di "options",
  nell'ordine in cui appaiono (la prima è la predefinita). Senza alternative, una sola option.
- Se un'alternativa è un PIATTO NOMINATO ("Caprese", "Insalata di mare", "Parmigiana"),
  metti il nome in "label" MA includi comunque i suoi ingredienti come "items"
  (es. Caprese -> mozzarella, pomodoro). Non lasciare MAI un'opzione con soli
  condimenti/contorni (es. solo olio o solo pane): ogni opzione deve avere l'alimento principale.
- Non inventare pasti non presenti nel documento.`;

const SAVE_PLAN_TOOL: Anthropic.Tool = {
  name: 'save_plan',
  description: 'Salva il piano settimanale estratto dal PDF.',
  input_schema: {
    type: 'object',
    properties: {
      meals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer', minimum: 0, maximum: 6 },
            type: {
              type: 'string',
              enum: ['BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER'],
            },
            options: {
              type: 'array',
              description: "Alternative del pasto; la prima è la predefinita.",
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: "Breve etichetta dell'alternativa" },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        value: { type: 'number' },
                        unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'pz'] },
                      },
                      required: ['name', 'value', 'unit'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          },
          required: ['day', 'type', 'options'],
        },
      },
    },
    required: ['meals'],
  },
};

export class ClaudePdfExtractor implements PdfExtractor {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudePdfExtractor.name);

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(pdf: Buffer): Promise<ExtractedMeal[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      // Caching: tools render before system; il breakpoint sull'ultimo blocco
      // system memorizza tools + system. Il PDF (volatile) resta dopo, non cached.
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [SAVE_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'save_plan' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
            },
            { type: 'text', text: 'Estrai il piano settimanale completo da questo PDF.' },
          ],
        },
      ],
    });

    const usage = response.usage;
    this.logger.log(
      `Estrazione completata (cache_read=${usage.cache_read_input_tokens ?? 0}, in=${usage.input_tokens}, out=${usage.output_tokens}).`,
    );

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude non ha restituito un piano strutturato.');
    }

    const meals = (toolBlock.input as { meals?: RawMeal[] }).meals ?? [];
    return mealsFromRaw(meals);
  }
}
