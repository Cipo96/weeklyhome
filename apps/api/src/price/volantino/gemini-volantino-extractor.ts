import { Logger } from '@nestjs/common';
import type {
  ExtractedProduct,
  VolantinoExtractor,
  VolantinoPage,
} from './volantino-extractor.js';
import { geminiExtractJson } from '../../ai/gemini.js';

const SYSTEM_PROMPT = `Sei un estrattore di prezzi da volantini di supermercati italiani.
Estrai SOLO prodotti alimentari/grocery con prezzo chiaramente leggibile; ignora il non alimentare.
"price" = prezzo dell'offerta per la confezione. "quantityValue"+"quantityUnit" = formato (unit: g,kg,ml,l,pz).
Se è indicato il prezzo al kg/l mettilo in "pricePerUnit". Non indovinare: ometti i prodotti dubbi.
"name" = nome prodotto SENZA marca; "brand" = la marca se leggibile (es. Fage, Conad, Mulino Bianco), altrimenti omettila.`;

const PROMPT = `Estrai tutti i prodotti alimentari con prezzo da queste pagine di volantino.
Rispondi SOLO con JSON di questa forma esatta:
{"products":[{"name":"Pasta","brand":"Barilla","price":0.89,"quantityValue":500,"quantityUnit":"g","pricePerUnit":1.78}]}
"brand" e "pricePerUnit" sono opzionali.`;

export class GeminiVolantinoExtractor implements VolantinoExtractor {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiVolantinoExtractor.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async extract(pages: VolantinoPage[]): Promise<ExtractedProduct[]> {
    if (pages.length === 0) return [];
    const result = await geminiExtractJson<{ products?: ExtractedProduct[] }>({
      apiKey: this.apiKey,
      model: this.model,
      system: SYSTEM_PROMPT,
      prompt: PROMPT,
      files: pages.map((p) => ({ data: p.data, mimeType: p.mediaType })),
    });
    const products = result.products ?? [];
    this.logger.log(`Volantino estratto via Gemini: ${products.length} prodotti.`);
    return products;
  }
}
