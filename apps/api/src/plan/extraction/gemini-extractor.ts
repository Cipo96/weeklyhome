import { Logger } from '@nestjs/common';
import type { ExtractedMeal, PdfExtractor } from './pdf-extractor.js';
import { mealsFromRaw, type RawMeal } from './options.js';
import { geminiExtractJson } from '../../ai/gemini.js';
import { extractPdfText, hasUsefulText } from './pdf-text.js';

const SYSTEM_PROMPT = `Sei un estrattore di piani alimentari da documenti di nutrizionisti.
Estrai pasti, alimenti e quantità, anche con layout variabile.
Regole:
- day: 0=lunedì..6=domenica; type tra BREAKFAST, MORNING_SNACK, LUNCH, AFTERNOON_SNACK, DINNER.
  MORNING_SNACK = spuntino di metà mattina, AFTERNOON_SNACK = merenda del pomeriggio:
  sono pasti DISTINTI, distinguili dal momento della giornata (mai unirli in uno solo).
- unità tra g, kg, ml, l, pz; converti porzioni testuali in numeri ("2 uova" -> 2 pz, "3 fette biscottate" -> 3 pz).
- Per alimenti SPALMABILI o MISURABILI (marmellata, miele, olio, yogurt, latte, carne, pesce,
  formaggi) usa SEMPRE g o ml, MAI "pz". Usa "pz" solo per ciò che è davvero a pezzi interi
  (uova, frutta intera, fette biscottate, gallette). Lo stesso alimento deve avere un'unità
  COERENTE in tutto il piano (non "marmellata 10 g" un giorno e "marmellata 1 pz" un altro).
- nomi alimenti semplici in italiano (es. "Pane", "Petto di pollo").
- Ogni pasto ha una lista "options" (alternative). Se il pasto offre più ALTERNATIVE
  ("oppure", "O", "/"), restituiscile TUTTE come elementi distinti di "options",
  NELL'ORDINE in cui appaiono (la prima è la predefinita). Se non ci sono alternative,
  usa una sola option. "label" è una breve etichetta dell'alternativa (può mancare).
- Se un'alternativa è un PIATTO NOMINATO ("Caprese", "Insalata di mare", "Parmigiana"),
  metti il nome in "label" MA includi comunque i suoi ingredienti come "items"
  (es. Caprese -> mozzarella, pomodoro). Non lasciare MAI un'opzione con soli
  condimenti/contorni (es. solo olio o solo pane): ogni opzione deve avere l'alimento principale.
- Se il piano è un MODELLO GIORNALIERO (stesso schema ogni giorno, senza giorni distinti), restituisci SOLO il giorno 0; verrà applicato a tutta la settimana.
- Non inventare pasti o alimenti non presenti.`;

const PROMPT_BASE = `Rispondi SOLO con JSON di questa forma esatta:
{"meals":[{"day":0,"type":"BREAKFAST","options":[{"label":"Pane e marmellata","items":[{"name":"Pane","value":50,"unit":"g"}]}]}]}`;

export class GeminiPdfExtractor implements PdfExtractor {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiPdfExtractor.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async extract(pdf: Buffer): Promise<ExtractedMeal[]> {
    // text-first: se il PDF ha un layer di testo, mando il TESTO (chiamata
    // leggera) invece dell'immagine; vision solo come fallback per i PDF grafici.
    const text = extractPdfText(pdf);
    const useText = hasUsefulText(text);
    const result = await geminiExtractJson<{ meals?: RawMeal[] }>({
      apiKey: this.apiKey,
      model: this.model,
      system: SYSTEM_PROMPT,
      prompt: useText
        ? `Estrai il piano alimentare dal seguente testo.\n${PROMPT_BASE}\n\nTESTO:\n"""\n${text.slice(0, 30000)}\n"""`
        : `Estrai il piano alimentare completo da questo PDF.\n${PROMPT_BASE}`,
      files: useText ? [] : [{ data: pdf, mimeType: 'application/pdf' }],
    });
    const meals = mealsFromRaw(result.meals ?? []);
    this.logger.log(
      `Piano estratto via Gemini (${useText ? 'testo' : 'vision'}): ${meals.length} pasti.`,
    );
    return meals;
  }
}
