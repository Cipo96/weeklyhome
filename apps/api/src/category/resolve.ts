/** Normalizza un nome per la cache: trim, lowercase, no accenti, spazi singoli. */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export interface ResolveDeps {
  staticLookup: (name: string) => string | null;
  cacheLookup: (norms: string[]) => Promise<Map<string, string | null>>;
  aiResolve: (names: string[]) => Promise<Map<string, string | null>>;
  persist: (
    entries: Array<{ nameNorm: string; category: string | null; source: 'ai' }>,
  ) => Promise<void>;
}

/**
 * Risolve i nomi in categorie con strategia dict → cache DB → AI (batch unica
 * sui soli miss), indicizzando per nome ORIGINALE. I risultati AI (anche i null)
 * vengono persistiti in cache per non ripagarli.
 */
export async function resolveCategories(
  names: string[],
  deps: ResolveDeps,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unresolved: string[] = [];

  // 1) dizionario statico
  for (const name of names) {
    const hit = deps.staticLookup(name);
    if (hit) out.set(name, hit);
    else unresolved.push(name);
  }
  if (unresolved.length === 0) return out;

  // 2) cache DB (per nome normalizzato)
  const normOf = new Map(unresolved.map((n) => [n, normalizeName(n)]));
  const cache = await deps.cacheLookup([...new Set(normOf.values())]);
  const stillMiss: string[] = [];
  for (const name of unresolved) {
    const norm = normOf.get(name)!;
    if (cache.has(norm)) out.set(name, cache.get(norm) ?? null);
    else stillMiss.push(name);
  }
  if (stillMiss.length === 0) return out;

  // 3) AI batch (una chiamata) sui miss residui distinti
  const distinct = [...new Set(stillMiss)];
  const ai = await deps.aiResolve(distinct);
  const toPersist = new Map<string, string | null>();
  for (const name of stillMiss) {
    const cat = ai.get(name) ?? null;
    out.set(name, cat);
    toPersist.set(normOf.get(name)!, cat);
  }
  await deps.persist(
    [...toPersist.entries()].map(([nameNorm, category]) => ({ nameNorm, category, source: 'ai' as const })),
  );
  return out;
}
