import { GoogleGenAI } from '@google/genai';

export interface GeminiFile {
  data: Buffer;
  mimeType: string;
}

type Part = { inlineData: { mimeType: string; data: string } } | { text: string };

/**
 * Esegue un'estrazione strutturata con Gemini: invia file (immagini/PDF) + prompt,
 * forza output JSON e lo deserializza. Usata da estrattori piano e volantino.
 */
export async function geminiExtractJson<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  files: GeminiFile[];
}): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  const parts: Part[] = opts.files.map((f) => ({
    inlineData: { mimeType: f.mimeType, data: f.data.toString('base64') },
  }));
  parts.push({ text: opts.prompt });

  const response = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const text = response.text ?? '';
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Gemini ha restituito una risposta non in JSON valido.');
  }
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
}
