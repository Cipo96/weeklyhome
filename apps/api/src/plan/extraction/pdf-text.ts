import zlib from 'node:zlib';

/**
 * Estrae il testo "selezionabile" da un PDF senza dipendenze esterne né AI:
 * decomprime gli stream FlateDecode e legge gli operatori di testo (Tj/TJ).
 * Restituisce stringa vuota se il PDF non ha un layer di testo utile (es. PDF
 * grafici/scansioni come quelli esportati da Canva), nel qual caso si ricade
 * sull'estrazione via vision.
 *
 * NB: pattern regex volutamente LINEARI (`[^()]*`, `[^\]]*`) per evitare il
 * backtracking catastrofico sui content stream grandi.
 */
export function extractPdfText(buf: Buffer): string {
  const out: string[] = [];
  let i = 0;
  let guard = 0;
  while (guard++ < 20000) {
    const k = buf.indexOf('stream', i);
    if (k < 0) break;
    let st = k + 6;
    if (buf[st] === 0x0d) st++;
    if (buf[st] === 0x0a) st++;
    const e = buf.indexOf('endstream', st);
    if (e < 0) break;
    i = e + 9;
    const len = e - st;
    if (len < 8 || len > 600000) continue; // salta stream immagine grandi
    let data: Buffer;
    try {
      data = zlib.inflateSync(buf.subarray(st, e));
    } catch {
      continue;
    }
    const t = data.toString('latin1');
    if (!t.includes('Tj') && !t.includes('TJ')) continue;
    for (const m of t.matchAll(/\(([^()]*)\)\s*Tj/g)) out.push(decodePdfString(m[1]));
    for (const m of t.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const parts: string[] = [];
      for (const p of m[1].matchAll(/\(([^()]*)\)/g)) parts.push(decodePdfString(p[1]));
      out.push(parts.join(''));
    }
  }
  return normalize(out.join(' '));
}

/** Decodifica le escape PDF di base in una stringa letterale. */
function decodePdfString(s: string): string {
  return s
    .replace(/\\(\d{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1');
}

/**
 * Ricompone parole spezzate glifo-per-glifo (i PDF posizionano spesso ogni
 * lettera separatamente → "C O L A Z I O N E"): collassa gli spazi singoli tra
 * caratteri non-spazio mantenendo le interruzioni di parola reali.
 */
function normalize(raw: string): string {
  // 1) togli spazi multipli, 2) unisci sequenze "x y z" di singoli caratteri
  let s = raw.replace(/[ \t]+/g, ' ').trim();
  // collassa "a b c d" (lettere singole spaziate) ricorsivamente
  for (let n = 0; n < 6; n++) {
    const next = s.replace(/(\S) (\S)(?= |$)/g, (m, a: string, b: string) =>
      a.length === 1 && b.length === 1 ? a + b : m,
    );
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Soglia minima di caratteri per considerare valido un layer di testo. */
export function hasUsefulText(text: string): boolean {
  // serve abbastanza testo e una quota ragionevole di lettere (no glifi sparsi)
  if (text.length < 200) return false;
  const letters = (text.match(/[a-zA-Zàèéìòù]/g) ?? []).length;
  return letters / text.length > 0.4;
}
