import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { GeminiVolantinoExtractor } from './gemini-volantino-extractor.js';
import { geminiModel } from '../../ai/gemini.js';

export type VolantinoMediaType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface VolantinoPage {
  data: Buffer;
  mediaType: VolantinoMediaType;
}

export interface ExtractedProduct {
  name: string;
  /** Marca/brand del prodotto se leggibile (es. "Fage", "Conad", "Mulino Bianco"). */
  brand?: string;
  /** Prezzo pagato per la confezione/offerta, in €. */
  price: number;
  /** Quantità della confezione (es. 500 per "500 g"). */
  quantityValue: number;
  /** Unità della confezione. */
  quantityUnit: string;
  /** Prezzo al kg/l se stampato esplicitamente sul volantino (€/kg o €/l). */
  pricePerUnit?: number;
}

/** Contratto di un estrattore di prezzi da volantino (Claude o Gemini). */
export interface VolantinoExtractor {
  readonly name: string;
  extract(pages: VolantinoPage[]): Promise<ExtractedProduct[]>;
}

const SYSTEM_PROMPT = `Sei un estrattore di prezzi da volantini di supermercati italiani.
Ricevi le pagine di un volantino (immagini o PDF) e devi restituire i prodotti
ALIMENTARI con il loro prezzo, chiamando lo strumento "save_volantino_prices".

Regole:
- Estrai SOLO prodotti alimentari/grocery con un prezzo chiaramente leggibile.
- Ignora prodotti non alimentari (casalinghi, abbigliamento, elettronica, ecc.).
- "price" = il prezzo dell'offerta effettivamente pagato per la confezione.
- "quantityValue" + "quantityUnit" = formato/peso della confezione (unit tra: g, kg, ml, l, pz).
  Esempi: "Pasta 500 g" -> 500 g; "Latte 1 L" -> 1 l; "Uova x6" -> 6 pz.
- Se è indicato un prezzo al chilo/litro (es. "€7,90/kg"), mettilo in "pricePerUnit".
- Se non riesci a leggere bene un valore, ometti quel prodotto invece di indovinare.
- "name" = nome del prodotto SENZA la marca (es. "Yogurt greco", "Petto di pollo").
- "brand" = la marca se leggibile (es. "Fage", "Conad", "Mulino Bianco"); omettila se assente.`;

const SAVE_TOOL: Anthropic.Tool = {
  name: 'save_volantino_prices',
  description: 'Salva i prodotti alimentari con prezzo estratti dal volantino.',
  input_schema: {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            brand: { type: 'string', description: 'Marca del prodotto, se leggibile' },
            price: { type: 'number' },
            quantityValue: { type: 'number' },
            quantityUnit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'pz'] },
            pricePerUnit: { type: 'number' },
          },
          required: ['name', 'price', 'quantityValue', 'quantityUnit'],
        },
      },
    },
    required: ['products'],
  },
};

export class ClaudeVolantinoExtractor implements VolantinoExtractor {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudeVolantinoExtractor.name);

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(pages: VolantinoPage[]): Promise<ExtractedProduct[]> {
    if (pages.length === 0) return [];

    const content: Anthropic.ContentBlockParam[] = pages.map((page) =>
      page.mediaType === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: page.data.toString('base64') },
          }
        : {
            type: 'image',
            source: { type: 'base64', media_type: page.mediaType, data: page.data.toString('base64') },
          },
    );
    content.push({
      type: 'text',
      text: 'Estrai tutti i prodotti alimentari con prezzo da queste pagine di volantino.',
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [SAVE_TOOL],
      tool_choice: { type: 'tool', name: 'save_volantino_prices' },
      messages: [{ role: 'user', content }],
    });

    const usage = response.usage;
    this.logger.log(
      `Volantino estratto (cache_read=${usage.cache_read_input_tokens ?? 0}, in=${usage.input_tokens}, out=${usage.output_tokens}).`,
    );

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Claude non ha restituito i prezzi del volantino.');
    }
    return (toolBlock.input as { products?: ExtractedProduct[] }).products ?? [];
  }
}

/** Crea l'estrattore: preferisce Gemini, poi Anthropic; lancia se manca ogni chiave. */
export function createVolantinoExtractor(): VolantinoExtractor {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return new GeminiVolantinoExtractor(geminiKey, geminiModel());
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return new ClaudeVolantinoExtractor(anthropicKey, process.env.EXTRACTION_MODEL ?? 'claude-opus-4-8');
  }
  throw new Error(
    'Nessuna chiave AI impostata (GEMINI_API_KEY o ANTHROPIC_API_KEY): estrazione volantino non disponibile.',
  );
}
